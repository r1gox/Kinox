const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const { mzEmailValid, mzPasswordStrength } = load(['js/auth-utils.js'], 'this.__a = { mzEmailValid, mzPasswordStrength };').__a;

test('correo: acepta direcciones normales y rechaza lo incompleto', () => {
  for (const ok of ['a@b.co', 'nombre.apellido@correo.com', ' rigo@gmail.com ', 'x+tag@dominio.mx']) assert.equal(mzEmailValid(ok), true, ok);
  for (const bad of ['', 'sin-arroba', 'a@b', 'a@b.', '@b.com', 'a b@c.com', null, undefined]) assert.equal(mzEmailValid(bad), false, String(bad));
});

test('contraseña: niveles de seguridad', () => {
  assert.equal(mzPasswordStrength('').level, 0);
  assert.equal(mzPasswordStrength('abc').level, 1);
  assert.equal(mzPasswordStrength('abc').ok, false);
  assert.equal(mzPasswordStrength('password').level, 1);
  assert.equal(mzPasswordStrength('12345678').label, 'Muy común');
  assert.equal(mzPasswordStrength('abcdefgx').level, 2);
  assert.equal(mzPasswordStrength('Abcdefg1').level, 3);
  assert.equal(mzPasswordStrength('Abcdefg1!xyz').level, 4);
  assert.equal(mzPasswordStrength('Abcdefg1').ok, true);
});

// ---- Pantalla de cuenta con un DOM simulado ----
const tick = () => new Promise((r) => setTimeout(r, 15));
async function render(cloud, search = '') {
  let html = '';
  const view = { set innerHTML(v) { html = String(v); }, get innerHTML() { return html; }, querySelectorAll: () => [], querySelector: () => null };
  const el = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => '' : el), apply: () => el, set: () => true });
  const document = new Proxy(el, {
    get: (t, k) => (k === 'getElementById' ? (id) => (id === 'view' ? view : el) : k === 'addEventListener' ? () => {} : k === 'readyState' ? 'complete' : el),
  });
  const location = { href: 'https://x.test/cuenta' + search, origin: 'https://x.test', pathname: '/cuenta', hostname: 'x.test', search, hash: '', protocol: 'https:' };
  load(['js/common.js', 'js/auth-utils.js', 'js/account.js'], '', { document, location, mzCloud: cloud });
  await tick();
  await tick();
  return () => html;
}
const base = { loaded: Promise.resolve(), ready: Promise.resolve(), client: {}, pull: async () => {}, push: async () => {} };

test('sin Supabase configurado explica qué falta, sin formulario', async () => {
  const h = await render({ ...base, configured: false });
  assert.match(h(), /Cuenta no disponible/);
  assert.match(h(), /js\/config\.js/);
  assert.doesNotMatch(h(), /id="acGo"/);
});

test('iniciar sesión: Google, correo con icono y contraseña con botón de ver, y enlaces', async () => {
  const h = await render({ ...base, configured: true, user: null });
  const s = h();
  assert.match(s, /Bienvenido de nuevo/);
  assert.match(s, /id="acGoogle"/);
  assert.match(s, /autocomplete="email"/);
  assert.match(s, /autocomplete="current-password"/);
  assert.match(s, /data-eye="acPass"[^>]*aria-pressed="false"/);
  assert.match(s, /¿Olvidaste tu contraseña\?/);
  assert.match(s, /role="tablist"/);
  assert.match(s, /aria-labelledby="authTitle"/);
  assert.match(s, /href="\/privacidad"/);
  assert.match(s, /class="auth-brand"/, 'panel de marca en escritorio');
});

test('crear cuenta (?modo=registro): nombre, correo, contraseña nueva y medidor de seguridad', async () => {
  const h = await render({ ...base, configured: true, user: null }, '?modo=registro');
  const s = h();
  assert.match(s, /Crea tu cuenta/);
  assert.match(s, /id="acName"[^>]*maxlength="16"/);
  assert.match(s, /autocomplete="new-password"/);
  assert.match(s, /id="pwMeter"/);
  assert.match(s, /Al crear tu cuenta aceptas/);
});

test('con sesión: muestra datos, proveedores y acciones, y escapa el nombre', async () => {
  const user = { email: 'a@b.co', user_metadata: { full_name: '<b>Rigo</b>' }, app_metadata: { providers: ['email', 'google'] } };
  const h = await render({ ...base, configured: true, user });
  const s = h();
  assert.match(s, /acct-badge">Correo/);
  assert.match(s, /acct-badge">Google/);
  assert.match(s, /id="acSyncNow"/);
  assert.match(s, /id="acKill"/);
  assert.match(s, /auth-solo/);
  assert.doesNotMatch(s, /<b>Rigo<\/b>/);
});

test('accesibilidad y estilo de la pantalla de cuenta', () => {
  const js = read('js/account.js'), css = read('css/cuenta.css'), html = read('pages/cuenta.html');
  assert.match(js, /class="fld-err" id="' \+ o\.id \+ 'Err" role="alert"/);
  assert.match(js, /aria-invalid/);
  assert.match(js, /aria-label="Mostrar contraseña"/);
  assert.match(css, /\.auth-card\{/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /:focus-visible/);
  assert.ok(html.indexOf('auth-utils.js') > 0 && html.indexOf('auth-utils.js') < html.indexOf('account.js'), 'auth-utils antes de account');
});
