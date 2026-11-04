const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const { mzOAuthError } = load(['js/common.js', 'js/cloud.js'], 'this.__g = { mzOAuthError };').__g;

test('mzOAuthError() no inventa errores cuando no hay ninguno', () => {
  assert.equal(mzOAuthError(''), '');
  assert.equal(mzOAuthError('#access_token=abc&refresh_token=def'), '');
  assert.equal(mzOAuthError('?modo=registro'), '');
});

test('mzOAuthError() traduce los errores más comunes', () => {
  assert.match(mzOAuthError('#error=access_denied&error_description=User+cancelled'), /Cancelaste/);
  assert.match(mzOAuthError('?error=server_error&error_description=Unsupported+provider%3A+provider+is+not+enabled'), /aún no está activado/);
  assert.match(mzOAuthError('#error=invalid_request&error_description=redirect+URL+not+allowed'), /no está permitida/);
  assert.match(mzOAuthError('#error=x&error_description=algo+raro'), /No se pudo iniciar sesión con Google: algo raro/);
});

test('mzOAuthError() resiste textos mal codificados y largos', () => {
  assert.doesNotThrow(() => mzOAuthError('#error=x&error_description=%E0%A4%A'));
  assert.ok(mzOAuthError('#error=x&error_description=' + 'a'.repeat(500)).length < 200);
});

test('la página de cuenta ofrece Google en iniciar sesión y crear cuenta, y vuelve a la misma página', () => {
  const src = read('js/account.js');
  assert.match(src, /provider: 'google'/);
  assert.match(src, /redirectTo: location\.origin \+ location\.pathname/);
  assert.match(src, /Continuar con Google/);
  assert.match(src, /mode === 'login' \|\| mode === 'register' \? googleButton\(\)/);
  assert.match(src, /signInWithOAuth/);
});

test('al volver de Google se sincroniza solo y se muestran los errores', () => {
  const src = read('js/account.js');
  assert.match(src, /isOAuth && cloud\.user/);
  assert.match(src, /mzOAuthError\(urlState\)/);
  assert.match(src, /history\.replaceState/);
  assert.equal((src.match(/await syncAndGo\(\)/g) || []).length, 2, 'correo y Google comparten el mismo flujo');
});

test('se usa el nombre de Google (full_name / name) en la cuenta y en la tarjeta', () => {
  assert.match(read('js/account.js'), /md\.display_name \|\| md\.full_name \|\| md\.name/);
  assert.match(read('js/sync-card.js'), /md\.display_name \|\| md\.full_name \|\| md\.name/);
});

test('el botón sigue la marca de Google y la página carga su estilo', () => {
  assert.match(read('js/account.js'), /#4285F4/);
  assert.match(read('css/cuenta.css'), /\.g-btn\{/);
  assert.match(read('pages/cuenta.html'), /css\/cuenta\.css/);
});

test('la privacidad menciona el inicio de sesión con Google y no hay secretos en el repo', () => {
  const p = read('pages/privacidad.html');
  assert.match(p, /Si entras con Google/);
  assert.match(p, /Google \(inicio de sesión\)/);
  for (const f of ['js/account.js', 'js/config.js', 'js/cloud.js']) {
    assert.doesNotMatch(read(f), /GOCSPX-[A-Za-z0-9_-]{10,}/, f);
    assert.doesNotMatch(read(f), /\d{6,}-[a-z0-9]+\.apps\.googleusercontent\.com/, f);
  }
});
