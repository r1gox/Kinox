const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load.js');

const t = load(
  ['js/common.js'],
  'this.__t = { mzAvatarHtml, mzSafePhoto, mzProfileClean, mzAvatars, mzMergeData };'
).__t;
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

test('mzSafePhoto() solo acepta imágenes pequeñas en data URL', () => {
  assert.equal(t.mzSafePhoto(PHOTO), PHOTO);
  assert.equal(t.mzSafePhoto('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(t.mzSafePhoto('javascript:alert(1)'), '');
  assert.equal(t.mzSafePhoto('https://evil.test/x.jpg'), '');
  assert.equal(t.mzSafePhoto('data:image/jpeg;base64,AAAA"onerror="x'), '');
  assert.equal(t.mzSafePhoto('data:image/jpeg;base64,' + 'A'.repeat(71000)), '');
  assert.equal(t.mzSafePhoto(null), '');
});

test('mzProfileClean() sanea id, nombre, avatar y foto', () => {
  assert.equal(t.mzProfileClean({ id: '../x', name: 'a' }), null);
  assert.equal(t.mzProfileClean(null), null);
  const p = t.mzProfileClean({ id: 'p1', name: '  Nombre larguísimo de prueba  ', avatar: 'nope', photo: 'x' });
  assert.equal(p.name.length <= 16, true);
  assert.equal(p.avatar, '');
  assert.equal(p.photo, '');
  assert.equal(t.mzProfileClean({ id: 'p2', name: '   ' }).name, 'Perfil');
  assert.equal(t.mzProfileClean({ id: 'p3', name: 'x', avatar: 'fox' }).avatar, 'fox');
});

test('mzAvatarHtml() escapa nombres y no inyecta fotos inválidas', () => {
  const h = t.mzAvatarHtml({ name: '<img onerror=1>', photo: 'javascript:alert(1)' });
  assert.ok(!h.includes('<img'));
  assert.ok(!h.includes('javascript:'));
  assert.match(t.mzAvatarHtml({ avatar: 'fox' }), /🦊/);
  assert.match(t.mzAvatarHtml({ name: 'x', photo: PHOTO }), /<img src="data:image\/jpeg/);
  assert.match(t.mzAvatarHtml({ name: '🦊 zorro' }), /🦊/); // inicial con emoji, sin partir el carácter
});

test('hay 16 avatares con ids únicos y colores hexadecimales', () => {
  const l = t.mzAvatars();
  assert.equal(l.length, 16);
  assert.equal(new Set(l.map((a) => a.id)).size, 16);
  l.forEach((a) => assert.match(a.a + a.b, /^#[0-9a-f]{6}#[0-9a-f]{6}$/i));
});

const J = JSON.stringify;
test('mzMergeData(): une favoritos, historial, perfiles y progreso sin perder nada', () => {
  const local = {
    mz_profiles: J([{ id: 'p1', name: 'Invitado' }, { id: 'p2', name: 'Local' }]),
    mz_p1_favs: J([{ type: 'movie', id: 1 }]),
    mz_p1_hist: J([{ type: 'tv', id: 5 }]),
    mz_p1_seen: J({ tv5: ['1x1'] }),
    mz_p1_last: J({ tv5: { s: 1, e: 1, ts: 10 } }),
  };
  const remote = {
    mz_profiles: J([{ id: 'p1', name: 'Nube' }, { id: 'p3', name: 'Otro' }]),
    mz_p1_favs: J([{ type: 'movie', id: 1 }, { type: 'tv', id: 2 }]),
    mz_p1_hist: J([{ type: 'tv', id: 9 }]),
    mz_p1_seen: J({ tv5: ['1x2'], tv7: ['2x1'] }),
    mz_p1_last: J({ tv5: { s: 1, e: 2, ts: 99 } }),
  };
  const m = t.mzMergeData(local, remote);
  const profiles = JSON.parse(m.mz_profiles);
  assert.deepEqual(profiles.map((p) => p.id).sort(), ['p1', 'p2', 'p3']);
  assert.equal(profiles.find((p) => p.id === 'p1').name, 'Nube');
  assert.equal(JSON.parse(m.mz_p1_favs).length, 2, 'sin duplicados');
  assert.equal(JSON.parse(m.mz_p1_hist).length, 2);
  assert.deepEqual(JSON.parse(m.mz_p1_seen).tv5.sort(), ['1x1', '1x2']);
  assert.equal(JSON.parse(m.mz_p1_seen).tv7[0], '2x1');
  assert.equal(JSON.parse(m.mz_p1_last).tv5.e, 2, 'gana el más reciente');
});

test('mzMergeData(): claves que solo existen de un lado se conservan', () => {
  const m = t.mzMergeData({ mz_a_favs: J([{ type: 'movie', id: 1 }]) }, { mz_b_favs: J([{ type: 'tv', id: 2 }]) });
  assert.ok(m.mz_a_favs && m.mz_b_favs);
});

test('mzMergeData(): no permite contaminar prototipos', () => {
  const evil = JSON.parse('{"__proto__": "{\\"x\\":1}", "mz_p1_seen": "{\\"__proto__\\":[\\"1x1\\"],\\"tv1\\":[\\"1x1\\"]}"}');
  const m = t.mzMergeData({ mz_p1_seen: J({ tv1: ['1x2'] }) }, evil);
  assert.equal({}.x, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(m.mz_p1_seen), '__proto__'), false);
});
