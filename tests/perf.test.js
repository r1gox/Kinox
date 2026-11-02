const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load.js');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const { card } = load(['js/common.js'], 'this.__c = { card };').__c;

test('los pósters de TMDB traen varios tamaños y se decodifican sin bloquear', () => {
  const h = card({ id: 1, type: 'movie', title: 'Peli', poster: '/abc123.jpg' });
  assert.match(h, /srcset="[^"]*w185\/abc123\.jpg 185w, [^"]*w342\/abc123\.jpg 342w, [^"]*w500\/abc123\.jpg 500w"/);
  assert.match(h, /sizes="\(max-width:640px\) 34vw, 190px"/);
  assert.match(h, /decoding="async"/);
  assert.match(h, /loading="lazy"/);
});

test('los pósters que no son de TMDB no llevan srcset', () => {
  const h = card({ id: 1, type: 'movie', title: 'Peli', poster: 'https://otro.test/p.jpg' });
  assert.doesNotMatch(h, /srcset/);
  assert.match(h, /decoding="async"/);
});

test('una ruta de póster rara no entra en el srcset', () => {
  const h = card({ id: 1, type: 'movie', title: 'Peli', poster: '/a b"onerror="x.jpg' });
  assert.doesNotMatch(h, /srcset/);
  assert.doesNotMatch(h, /<img[^>]*\sonerror=/, 'no debe crearse un atributo onerror');
});

test('todas las páginas se preconectan a las imágenes de TMDB y a las tipografías', () => {
  const pages = ['index.html', ...fs.readdirSync(path.join(root, 'pages')).map((n) => 'pages/' + n)];
  for (const f of pages) {
    assert.match(read(f), /rel="preconnect" href="https:\/\/image\.tmdb\.org"/, f);
    assert.match(read(f), /rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin/, f);
  }
});

// Habría detectado la llave "}" sobrante que ya traía styles.css
test('los CSS tienen las llaves balanceadas', () => {
  for (const f of ['css/styles.css', 'css/mobile.css']) {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
    let depth = 0;
    for (const ch of s) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      assert.ok(depth >= 0, `${f}: llave "}" sobrante`);
    }
    assert.equal(depth, 0, `${f}: llaves sin cerrar`);
  }
});
