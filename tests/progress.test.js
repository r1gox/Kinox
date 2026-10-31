const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load.js');

function fresh() {
  const ctx = load(
    ['js/common.js'],
    `this.__t = { mzIsSeen, mzSetSeenMany, mzSetLast, mzGetLast, mzSafeHref, mzHistRemove, mzHistClear,
                 mzContinueItem, pk, hist, store };`
  );
  const mem = new Map();
  ctx.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  return ctx.__t;
}

test('mzSafeHref() solo permite enlaces internos', () => {
  const { mzSafeHref } = fresh();
  assert.equal(mzSafeHref('/pages/reproductor.html?id=1'), '/pages/reproductor.html?id=1');
  assert.equal(mzSafeHref('pages/reproductor.html'), 'pages/reproductor.html');
  assert.equal(mzSafeHref('javascript:alert(1)'), '');
  assert.equal(mzSafeHref('//evil.test/x'), '');
  assert.equal(mzSafeHref('https://evil.test'), '');
  assert.equal(mzSafeHref(null), '');
});

test('episodios vistos: marcar, desmarcar y consultar', () => {
  const t = fresh();
  assert.equal(t.mzIsSeen('tv1', 1, 1), false);
  t.mzSetSeenMany('tv1', ['1x1', '1x2'], true);
  assert.equal(t.mzIsSeen('tv1', 1, 2), true);
  assert.equal(t.mzIsSeen('tv1', 2, 1), false);
  t.mzSetSeenMany('tv1', ['1x1', '1x2'], false);
  assert.equal(t.mzIsSeen('tv1', 1, 2), false);
});

test('marcar dos veces no duplica episodios', () => {
  const t = fresh();
  t.mzSetSeenMany('tv9', ['1x1'], true);
  t.mzSetSeenMany('tv9', ['1x1'], true);
  assert.equal(t.store.get(t.pk('seen'), {}).tv9.length, 1);
});

test('último episodio: se guarda y se recupera', () => {
  const t = fresh();
  t.mzSetLast('tv5', { s: 2, e: 3, href: '/pages/x.html' });
  assert.equal(t.mzGetLast('tv5').e, 3);
  assert.equal(t.mzGetLast('tv404'), null);
});

test('historial: quitar uno y vaciar', () => {
  const t = fresh();
  t.store.set(t.pk('hist'), [{ id: 1, type: 'tv' }, { id: 1, type: 'movie' }, { id: 2, type: 'tv' }]);
  t.mzHistRemove('1', 'tv');
  assert.equal(t.hist().map((h) => h.type + h.id).join(','), 'movie1,tv2'); // (los arrays del sandbox son de otro realm)
  t.mzHistClear();
  assert.equal(t.hist().length, 0);
});

test('mzContinueItem() ignora un href manipulado y escapa el título', () => {
  const t = fresh();
  t.mzSetLast('tv7', { s: 1, e: 2, href: 'javascript:alert(1)' });
  const html = t.mzContinueItem({ id: 7, type: 'tv', title: '<b>x</b>', poster: '/p.jpg' });
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(!html.includes('cont-label'));
});

test('mzContinueItem() usa el último episodio cuando el enlace es seguro', () => {
  const t = fresh();
  t.mzSetLast('tv8', { s: 3, e: 4, href: '/pages/reproductor.html?x=1' });
  const html = t.mzContinueItem({ id: 8, type: 'tv', title: 'Serie', poster: '/p.jpg' });
  assert.match(html, /href="\/pages\/reproductor\.html\?x=1"/);
  assert.match(html, /T3 · E4/);
});
