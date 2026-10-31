const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load.js');

const t = load(['js/common.js'], 'this.__t = { mzBackupBuild, mzBackupParse };').__t;
const fakeStorage = (obj) => {
  const keys = Object.keys(obj);
  return { length: keys.length, key: (i) => keys[i], getItem: (k) => obj[k] };
};

test('exportar no incluye la API key ni claves ajenas', () => {
  const b = t.mzBackupBuild(fakeStorage({ mz_key: '"secreta"', mz_pid: '"p1"', otra: '1', mz_p1_favs: '[]' }));
  assert.equal(b.app, 'moviezone');
  assert.deepEqual(Object.keys(b.data).sort(), ['mz_p1_favs', 'mz_pid']);
});

test('importar acepta una copia válida', () => {
  const r = t.mzBackupParse(JSON.stringify({ app: 'moviezone', data: { mz_pid: '"p1"', mz_p1_hist: '[]' } }));
  assert.equal(r.ok, true);
  assert.equal(Object.keys(r.data).length, 2);
});

test('importar ignora mz_key y claves que no son de la app', () => {
  const r = t.mzBackupParse(JSON.stringify({ app: 'moviezone', data: { mz_key: '"x"', evil: '1', mz_pid: '"p1"' } }));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.data), ['mz_pid']);
});

test('importar rechaza JSON roto, otro formato, valores dañados y copias vacías', () => {
  assert.equal(t.mzBackupParse('{no').ok, false);
  assert.equal(t.mzBackupParse(JSON.stringify({ app: 'otra', data: {} })).ok, false);
  assert.equal(t.mzBackupParse(JSON.stringify({ app: 'moviezone', data: [] })).ok, false);
  assert.equal(t.mzBackupParse(JSON.stringify({ app: 'moviezone', data: { mz_pid: '{roto' } })).ok, false);
  assert.equal(t.mzBackupParse(JSON.stringify({ app: 'moviezone', data: { mz_pid: 5 } })).ok, false);
  assert.equal(t.mzBackupParse(JSON.stringify({ app: 'moviezone', data: { evil: '1' } })).ok, false);
});
