const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (data, ms = 5) => new Promise((r) => setTimeout(() => r({ ok: true, status: 200, json: async () => data }), ms));

function boot(routes) {
  const writes = [];
  let html = '';
  const view = {
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v); writes.push(html); },
    insertAdjacentHTML(_pos, h) { html += h; writes.push('+' + h); },
    querySelector: () => null,
  };
  const noop = () => {};
  const el = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => '' : el), apply: () => el, set: () => true });
  const document = new Proxy(el, {
    get: (t, k) => {
      if (k === 'getElementById') return (id) => (id === 'view' ? view : el);
      if (k === 'querySelector') return (s) => (s === '#view' ? view : s === '#view .hero' ? null : el);
      if (k === 'addEventListener' || k === 'removeEventListener') return noop;
      return el;
    },
  });
  const calls = [];
  const fetch = (url) => {
    calls.push(String(url));
    for (const [match, fn] of routes) if (String(url).includes(match)) return fn();
    return json({});
  };
  load(['js/common.js', 'js/worker.js', 'js/home.js'], '', { document, fetch });
  return { writes, view, calls };
}

const peli = { title: 'Peli A', slug: 'peli-a', portada: 'https://x.test/p.jpg', year: 2020 };
const serie = { title: 'Serie B', slug: 'serie-b', portada: 'https://x.test/s.jpg', year: 2021 };

test('la portada pinta "Cargando…" al instante y el catálogo sin esperar la 2.ª página ni TMDB', async () => {
  const h = boot([
    ['/9/peliculas?page=1', () => json({ results: [peli] }, 10)],
    ['/9/series?page=1', () => json({ results: [serie] }, 10)],
    ['/4/home', () => json({ agregados: [], recientes: [] }, 10)],
    ['page=2', () => json({ results: [{ ...peli, title: 'Peli extra' }] }, 400)], // lenta a propósito
    ['/api/tmdb', () => json({}, 600)],
  ]);
  assert.match(h.writes[0], /Cargando catálogo/);
  await wait(150);
  assert.match(h.view.innerHTML, /Películas del catálogo/, 'ya debe estar pintado');
  assert.doesNotMatch(h.view.innerHTML, /Más películas/, 'la página 2 aún no llegó');
  await wait(500);
  assert.match(h.view.innerHTML, /Más películas/, 'la página 2 se agrega cuando llega');
});

test('si la fuente principal responde bien, NO se piden las fuentes de respaldo', async () => {
  const h = boot([
    ['/9/peliculas?page=1', () => json({ results: [peli] })],
    ['/9/series?page=1', () => json({ results: [serie] })],
    ['/4/home', () => json({})],
  ]);
  await wait(120);
  assert.equal(h.calls.some((u) => /\/3\/(peliculas|series)/.test(u)), false);
});

test('si la fuente principal viene vacía, se usa el respaldo', async () => {
  const h = boot([
    ['/9/peliculas?page=1', () => json({ results: [] })],
    ['/9/series?page=1', () => json({ results: [] })],
    ['/4/home', () => json({})],
    ['/3/peliculas', () => json({ results: [peli] })],
    ['/3/series', () => json({ results: [serie] })],
  ]);
  await wait(150);
  assert.equal(h.calls.some((u) => /\/3\/peliculas/.test(u)), true);
  assert.match(h.view.innerHTML, /Peli A/);
});

test('si todo falla, la portada muestra el error con "Reintentar" en vez de quedarse cargando', async () => {
  const h = boot([
    ['/9/', () => Promise.reject(new Error('sin red'))],
    ['/4/home', () => Promise.reject(new Error('sin red'))],
    ['/3/', () => Promise.reject(new Error('sin red'))],
    ['page=2', () => Promise.reject(new Error('sin red'))],
  ]);
  await wait(2500);
  assert.match(h.view.innerHTML, /Reintentar/);
  assert.doesNotMatch(h.view.innerHTML, /Cargando catálogo/);
});
