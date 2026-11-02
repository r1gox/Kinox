const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const css = read('css/styles.css');

function lum(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const v = (name) => { const m = css.match(new RegExp('--' + name + ':(#[0-9a-fA-F]{6})')); assert.ok(m, 'falta --' + name); return m[1]; };

test('contraste mínimo 4.5:1 en textos y botones principales', () => {
  for (const bg of ['bg', 'panel', 'panel2']) assert.ok(ratio(v('mute'), v(bg)) >= 4.5, `--mute sobre --${bg}`);
  assert.ok(ratio(v('ac'), v('bg')) >= 4.5, 'enlaces (--ac) sobre fondo');
  assert.ok(ratio('#ffffff', v('btn')) >= 4.5, 'texto blanco sobre --btn');
  assert.ok(ratio('#ffffff', v('btn2')) >= 4.5, 'texto blanco sobre --btn2');
});

test('los botones principales usan los colores con contraste', () => {
  assert.match(css, /\.btn:not\(\.alt\)\{background:var\(--btn\)\}/);
  assert.match(css, /\.btn\.play\{background:linear-gradient\(135deg,var\(--btn\),var\(--btn2\)\)/);
});

test('hay enlace para saltar al contenido y el contenido es enfocable', () => {
  const src = read('js/common.js');
  assert.match(src, /class="skip-link" href="#view"/);
  assert.match(src, /setAttribute\('tabindex', '-1'\)/);
  assert.match(css, /\.skip-link:focus\{top:12px/);
});

test('el menú tiene nombre, la búsqueda es una región y se marca la página actual', () => {
  const src = read('js/common.js');
  assert.match(src, /<nav aria-label="Principal">/);
  assert.match(src, /<form id="sf" role="search">/);
  assert.match(src, /setAttribute\('aria-current','page'\)/);
});

test('las filas desplazables se pueden recorrer con teclado y tienen nombre', () => {
  const { rowHtml } = load(['js/common.js'], 'this.__r = { rowHtml };').__r;
  const h = rowHtml('Estrenos', [{ id: 1, type: 'movie', title: 'Peli', poster: '/a.jpg' }]);
  assert.match(h, /class="track" tabindex="0" role="region" aria-label="Estrenos"/);
});

test('el tráiler es un diálogo: foco dentro, Tab atrapado y se devuelve el foco', () => {
  const src = read('js/common.js');
  assert.match(src, /closeBtn\.focus\(\)/);
  assert.match(src, /opener\.focus\(\)/);
  assert.match(src, /e\.key !== 'Tab'/);
});

test('se respeta "reducir movimiento" en todo el sitio y hay foco visible en las filas', () => {
  assert.match(css, /prefers-reduced-motion:reduce\)\{\s*\*,\*:before,\*:after\{animation-duration:\.01ms!important/);
  assert.match(css, /\.track:focus-visible/);
});
