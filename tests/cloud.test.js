const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
// cloud.js necesita common.js (mzBackup*); en el sandbox no hay currentScript, así que no arranca solo.
const ctx = load(['js/common.js', 'js/cloud.js'], 'this.__t = { mzCloudConfigured };');
const { mzCloudConfigured } = ctx.__t;
const KEY = 'a'.repeat(60);

test('mzCloudConfigured() rechaza los valores de ejemplo', () => {
  assert.equal(mzCloudConfigured({ url: 'https://TU-PROYECTO.supabase.co', anonKey: 'TU_ANON_KEY' }), false);
  assert.equal(mzCloudConfigured({}), false);
  assert.equal(mzCloudConfigured(null), false);
});

test('mzCloudConfigured() acepta una configuración real y exige https', () => {
  assert.equal(mzCloudConfigured({ url: 'https://abcd1234.supabase.co', anonKey: KEY }), true);
  assert.equal(mzCloudConfigured({ url: 'https://abcd1234.supabase.co/', anonKey: KEY }), true);
  assert.equal(mzCloudConfigured({ url: 'http://abcd1234.supabase.co', anonKey: KEY }), false);
  assert.equal(mzCloudConfigured({ url: 'https://abcd1234.supabase.co', anonKey: 'corta' }), false);
});

test('la copia de datos nunca incluye mz_sync_at ni la API key', () => {
  const { mzBackupKeyOk } = load(['js/common.js'], 'this.__k = { mzBackupKeyOk };').__k;
  assert.equal(mzBackupKeyOk('mz_sync_at'), false);
  assert.equal(mzBackupKeyOk('mz_key'), false);
  assert.equal(mzBackupKeyOk('mz_p1_favs'), true);
  assert.equal(mzBackupKeyOk('sb-abc-auth-token'), false);
});

test('el esquema SQL activa RLS y limita cada política al dueño', () => {
  const sql = read('supabase/schema.sql');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.user_data from anon/i);
  for (const op of ['select', 'insert', 'update', 'delete']) assert.match(sql, new RegExp(`user_data_${op}_own`));
  assert.equal((sql.match(/auth\.uid\(\)/g) || []).length >= 5, true);
});

test('config.js solo lleva la clave pública (anon); ningún otro archivo trae tokens ni la service_role', () => {
  const jwtRe = /eyJ[A-Za-z0-9_-]{20,}\.([A-Za-z0-9_-]{20,})\.[A-Za-z0-9_-]{20,}/g;
  for (const f of ['js/config.js', 'js/cloud.js', 'js/account.js', 'README.md']) {
    const src = read(f);
    assert.doesNotMatch(src, /service_role\s*[:=]\s*['"]ey/i, f);
    for (const m of src.matchAll(jwtRe)) {
      const role = JSON.parse(Buffer.from(m[1], 'base64url').toString()).role;
      assert.equal(f, 'js/config.js', `token en ${f}`);       // solo config.js puede llevar la clave pública
      assert.equal(role, 'anon', 'la clave de config.js debe ser la anon (pública), nunca la service_role');
    }
  }
});

test('la pantalla de perfil ya no ofrece exportar/importar y usa la tarjeta de cuenta', () => {
  const html = read('pages/perfil.html');
  assert.doesNotMatch(html, /backup\.js/);
  assert.match(html, /sync-card\.js/);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'js/backup.js')), false);
  assert.doesNotMatch(read('js/sync-card.js'), /Exportar|Importar/);
});

test('la tarjeta de cuenta escapa el correo del usuario', () => {
  const src = read('js/sync-card.js');
  assert.match(src, /esc\(user\.email/);
  assert.match(src, /esc\(name \? name/);
});

test('la tarjeta de cuenta se pinta al instante, sin esperar a la nube', () => {
  const src = read('js/sync-card.js');
  const first = src.indexOf('host.innerHTML = hasStoredSession()');
  assert.ok(first > 0);
  assert.ok(first < src.indexOf('await mzCloudLoaded()'), 'debe pintarse antes de esperar');
  assert.match(src, /aún no está configurada/);
});
