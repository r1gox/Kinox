const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const guardUrl = pathToFileURL(path.join(__dirname, '..', 'api', '_tmdb-guard.js')).href;
const loadGuard = () => import(guardUrl);
const qs = (s) => new URLSearchParams(s);

test('el proxy acepta solo las rutas de TMDB que usa el sitio', async () => {
  const { validateTmdbRequest: v } = await loadGuard();
  for (const p of ['/configuration', '/movie/550', '/tv/1399', '/tv/1399/videos', '/movie/550/credits',
    '/tv/1399/watch/providers', '/tv/1399/season/2', '/tv/1399/season/2/episode/5', '/search/movie', '/search/tv']) {
    assert.equal(v(qs({ path: p })).ok, true, p);
  }
  for (const p of ['/person/1', '/account', '/movie/abc', '/movie/550/../../account', '/search/multi', '/authentication/token/new',
    '/movie/550/images', '/tv/1/season/x', '//evil', '', '/' + 'a'.repeat(200)]) {
    assert.equal(v(qs({ path: p })).ok, false, p);
  }
});

test('el proxy nunca deja pasar una api_key del cliente y descarta parámetros desconocidos', async () => {
  const { validateTmdbRequest: v } = await loadGuard();
  const r = v(qs({ path: '/movie/1', api_key: 'robada', sort_by: 'x', language: 'es-MX', query: 'dune' }));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.params).sort(), ['language', 'query']);
});

test('el proxy rechaza valores inválidos en parámetros conocidos', async () => {
  const { validateTmdbRequest: v } = await loadGuard();
  assert.equal(v(qs({ path: '/movie/1', language: '<script>' })).ok, false);
  assert.equal(v(qs({ path: '/movie/1', append_to_response: 'videos,watch/providers,credits' })).ok, true);
  assert.equal(v(qs({ path: '/movie/1', append_to_response: 'videos;drop' })).ok, false);
  assert.equal(v(qs({ path: '/search/tv', query: 'x'.repeat(101) })).ok, false);
});

test('el límite por IP corta al pasar de 150 por minuto y se reinicia después', async () => {
  const { allowRequest } = await loadGuard();
  const t0 = 1_000_000;
  for (let i = 0; i < 150; i++) assert.equal(allowRequest('1.2.3.4', t0).ok, true);
  const blocked = allowRequest('1.2.3.4', t0 + 1000);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfter >= 1 && blocked.retryAfter <= 60);
  assert.equal(allowRequest('5.6.7.8', t0).ok, true, 'otra IP no se ve afectada');
  assert.equal(allowRequest('1.2.3.4', t0 + 61_000).ok, true, 'ventana nueva');
});

test('el endpoint usa el guard, no abre CORS y no devuelve cuerpos crudos de error', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'tmdb.js'), 'utf8');
  assert.match(src, /validateTmdbRequest/);
  assert.match(src, /allowRequest/);
  assert.doesNotMatch(src, /Access-Control-Allow-Origin/);
  assert.doesNotMatch(src, /raw:/);
});
