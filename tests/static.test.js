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

test('el proxy de TMDB no deja que el cliente imponga api_key ni abre CORS', () => {
  const s = read('api/tmdb.js');
  assert.match(s, /k === 'api_key'/);
  assert.doesNotMatch(s, /Access-Control-Allow-Origin/);
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
