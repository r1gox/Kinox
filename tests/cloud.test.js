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

test('config.js no trae claves reales ni la service_role', () => {
  for (const f of ['js/config.js', 'js/cloud.js', 'js/account.js', 'README.md']) {
    assert.doesNotMatch(read(f), /service_role\s*[:=]\s*['"]ey/i, f);
    assert.doesNotMatch(read(f), /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, `JWT en ${f}`);
  }
});
