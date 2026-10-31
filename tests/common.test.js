const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load.js');

const ctx = load(
  ['js/common.js'],
  'this.__t = { esc, store, pageHref };'
);
const { esc, store, pageHref } = ctx.__t;

test('esc() escapa los cinco caracteres peligrosos', () => {
  assert.equal(esc('<>&"\''), '&lt;&gt;&amp;&quot;&#39;');
});

test('esc() neutraliza un payload típico de atributo y de etiqueta', () => {
  const out = esc(`'><img src=x onerror=alert(1)>`);
  assert.ok(!out.includes('<') && !out.includes('>') && !out.includes("'"));
});

test('esc() tolera null, undefined y números', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(42), '42');
});

test('store.get() devuelve el valor por defecto si no hay datos', () => {
  assert.deepEqual(store.get('no-existe', { a: 1 }), { a: 1 });
});

test('pageHref() codifica los parámetros', () => {
  const href = pageHref('reproductor.html', { type: 'movie', id: `1"><x`, vacio: '' });
  assert.ok(href.includes('reproductor.html?'));
  assert.ok(!/["<>]/.test(href), 'no debe contener caracteres peligrosos sin codificar');
  assert.ok(!href.includes('vacio'), 'omite parámetros vacíos');
});

test('mzErrorHtml() escapa el mensaje y ofrece reintentar', () => {
  const { mzErrorHtml } = load(['js/common.js'], 'this.__e = { mzErrorHtml };').__e;
  const html = mzErrorHtml('<img src=x onerror=1>', 'Título');
  assert.ok(!html.includes('<img'));
  assert.match(html, /data-mz-retry/);
  assert.match(html, /role="alert"/);
});
