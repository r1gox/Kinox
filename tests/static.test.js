// Comprobaciones estáticas sobre el código fuente.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('trailer.js valida type, id y key antes de usarlos', () => {
  const s = read('js/trailer.js');
  assert.match(s, /\(movie\|tv\)/);
  assert.match(s, /\\d\+/);
  assert.match(s, /A-Za-z0-9_-/);
});

test('el proxy de TMDB no abre CORS y la api_key no es un parámetro aceptado del cliente', () => {
  assert.doesNotMatch(read('api/tmdb.js'), /Access-Control-Allow-Origin/);
  const guard = read('api/_tmdb-guard.js');
  assert.doesNotMatch(guard.slice(guard.indexOf('ALLOWED_PARAMS'), guard.indexOf('export function validateTmdbRequest')), /api_key/);
});

test('ninguna API key queda escrita en el código', () => {
  for (const f of fs.readdirSync(path.join(root, 'js')).filter((n) => n.endsWith('.js'))) {
    assert.doesNotMatch(read('js/' + f), /\b[a-f0-9]{32}\b/, `posible key en js/${f}`);
  }
});

test('todas las páginas muestran el aviso de TMDB', () => {
  const files = ['index.html', ...fs.readdirSync(path.join(root, 'pages')).map((n) => 'pages/' + n)];
  for (const f of files) assert.match(read(f), /no está avalado ni certificado por TMDB/, f);
});
