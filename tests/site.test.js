const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const pages = ['index.html', ...fs.readdirSync(path.join(root, 'pages')).map((n) => 'pages/' + n)];

test('todas las páginas tienen favicon, descripción y etiquetas para compartir', () => {
  for (const f of pages) {
    const s = read(f);
    assert.match(s, /rel="icon" href="\/favicon\.svg"/, f);
    assert.match(s, /name="description"/, f);
    assert.match(s, /property="og:image"/, f);
  }
});

test('todas las páginas con pie enlazan a la política de privacidad', () => {
  for (const f of pages) {
    const s = read(f);
    if (s.includes('<footer')) assert.match(s, /href="\/privacidad"/, f);
  }
});

test('la política de privacidad existe, está enrutada y no afirma que no hay terceros', () => {
  const s = read('pages/privacidad.html');
  for (const t of ['Supabase', 'TMDB', 'YouTube', 'eliminar tu cuenta', 'Servicios externos']) assert.match(s, new RegExp(t), t);
  assert.match(read('vercel.json'), /"\/privacidad"/);
});

test('existen 404, robots.txt (sin indexar /api/), sitemap, favicon e imagen para compartir', () => {
  assert.match(read('404.html'), /Esta página no existe/);
  assert.match(read('robots.txt'), /Disallow: \/api\//);
  assert.match(read('sitemap.xml'), /<urlset/);
  assert.ok(fs.statSync(path.join(root, 'og.png')).size > 5000);
  assert.match(read('favicon.svg'), /<svg/);
});

test('eliminar cuenta: función SQL solo para usuarios autenticados y confirmación escrita en la app', () => {
  const sql = read('supabase/schema.sql');
  assert.match(sql, /function public\.delete_my_account\(\)/);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /revoke all on function public\.delete_my_account\(\) from public, anon/);
  assert.match(sql, /grant execute on function public\.delete_my_account\(\) to authenticated/);
  const js = read('js/account.js');
  assert.match(js, /rpc\('delete_my_account'\)/);
  assert.match(js, /ELIMINAR/);
});

test('no quedan console.log de depuración en el código del sitio', () => {
  for (const f of fs.readdirSync(path.join(root, 'js')).filter((n) => n.endsWith('.js'))) {
    assert.doesNotMatch(read('js/' + f), /console\.log\(/, f);
  }
});
