const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load.js');

const { mzSkeleton } = load(['js/common.js'], 'this.__s = { mzSkeleton };').__s;
const count = (s, re) => (s.match(re) || []).length;

test('cada esqueleto es un estado accesible con texto para lectores de pantalla', () => {
  for (const kind of ['home', 'detail', 'episodes', 'grid', 'row']) {
    const h = mzSkeleton(kind, 'Cargando algo…');
    assert.match(h, /role="status"/, kind);
    assert.match(h, /aria-busy="true"/, kind);
    assert.match(h, /<span class="sr-only">Cargando algo…<\/span>/, kind);
  }
});

test('el texto del esqueleto se escapa', () => {
  assert.ok(!mzSkeleton('grid', '<img onerror=1>').includes('<img'));
});

test('cantidad de bloques por tipo', () => {
  assert.equal(count(mzSkeleton('grid'), /class="sk-card"/g), 12);
  assert.equal(count(mzSkeleton('row'), /class="sk-card"/g), 8);
  assert.equal(count(mzSkeleton('home'), /class="sk-card"/g), 16);
  assert.equal(count(mzSkeleton('episodes'), /class="sk-ep"/g), 4);
  assert.match(mzSkeleton('detail'), /sk-poster/);
});

test('las pantallas usan esqueletos y no el texto suelto "Cargando…"', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  for (const f of ['js/home.js', 'js/detail.js', 'js/anime.js']) {
    assert.match(read(f), /mzSkeleton\(/, f);
    assert.doesNotMatch(read(f), /class="load is-loading"[^>]*>(Cargando|Buscando)/, f);
  }
});

test('el CSS define la animación y la respeta "reducir movimiento"', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css/styles.css'), 'utf8');
  assert.match(css, /@keyframes skShimmer/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.sk\{animation:none\}/);
  assert.match(css, /\.sr-only\{/);
});
