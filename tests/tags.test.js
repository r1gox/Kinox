const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load.js');

function fresh() {
  const ctx = load(['js/common.js'], 'this.__t = { mzListTag, mzListSet, mzListMatch, mzTagValid, mzTags, favs, pk, store };');
  const mem = new Map();
  ctx.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  return ctx.__t;
}
const peli = { id: 10, type: 'movie', title: 'Peli' };

test('hay tres etiquetas y solo se aceptan esas', () => {
  const t = fresh();
  assert.equal(t.mzTags().map((x) => x.id).join(','), 'fav,later,seen');
  assert.equal(t.mzTagValid('seen'), 'seen');
  assert.equal(t.mzTagValid('hack'), '');
});

test('guardar con etiqueta, cambiarla y quitar', () => {
  const t = fresh();
  assert.equal(t.mzListTag(peli), '');
  t.mzListSet(peli, 'later');
  assert.equal(t.mzListTag(peli), 'later');
  t.mzListSet(peli, 'seen'); // marcar como vista
  assert.equal(t.mzListTag(peli), 'seen');
  assert.equal(t.favs().length, 1, 'no se duplica');
  t.mzListSet(peli, '');
  assert.equal(t.mzListTag(peli), '');
  assert.equal(t.favs().length, 0);
});

test('un elemento guardado antes de existir las etiquetas cuenta como Favorita', () => {
  const t = fresh();
  t.store.set(t.pk('favs'), [{ id: 7, type: 'tv', title: 'Vieja' }]);
  assert.equal(t.mzListTag({ id: 7, type: 'tv' }), 'fav');
});

test('cambiar la etiqueta conserva el lugar en la lista y una etiqueta inválida no guarda nada', () => {
  const t = fresh();
  t.mzListSet({ id: 1, type: 'movie', title: 'A' }, 'fav');
  t.mzListSet({ id: 2, type: 'movie', title: 'B' }, 'fav');
  t.mzListSet({ id: 1, type: 'movie', title: 'A' }, 'seen');
  assert.equal(t.favs().map((x) => x.id).join(','), '2,1');
  t.mzListSet({ id: 3, type: 'movie', title: 'C' }, 'inventada');
  assert.equal(t.favs().length, 2);
});

test('coincide por id y tipo, o por slug de la misma fuente', () => {
  const t = fresh();
  assert.equal(t.mzListMatch({ id: 1, type: 'movie' }, { id: 1, type: 'tv' }), false);
  assert.equal(t.mzListMatch({ id: 1, type: 'movie' }, { id: 1, type: 'movie' }), true);
  assert.equal(t.mzListMatch({ slug: 'x', source_id: 4 }, { id: 9, slug: 'x', source_id: '4' }), true);
});

test('el detalle usa el menú de etiquetas y la página de lista tiene filtros', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.equal((read('js/detail.js').match(/mzWireListMenu\(/g) || []).length, 2);
  assert.match(read('js/saved.js'), /data-chip/);
  assert.match(read('js/saved.js'), /data-tagsel/);
  assert.match(read('css/styles.css'), /\.list-menu\{/);
});
