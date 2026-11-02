const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('el manifiesto es válido y se puede instalar', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, '/');
  assert.ok(m.name && m.short_name && m.theme_color && m.background_color);
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});

test('los íconos existen y miden lo que dice el manifiesto', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  for (const i of m.icons) {
    const buf = fs.readFileSync(path.join(root, i.src.replace(/^\//, '')));
    assert.equal(buf.readUInt32BE(16), parseInt(i.sizes, 10), i.src);
    assert.equal(buf.readUInt32BE(20), parseInt(i.sizes, 10), i.src);
  }
  assert.ok(fs.statSync(path.join(root, 'apple-touch-icon.png')).size > 1000);
});

test('todas las páginas enlazan el manifiesto y el ícono de iOS', () => {
  const pages = ['index.html', ...fs.readdirSync(path.join(root, 'pages')).map((n) => 'pages/' + n)];
  for (const f of pages) {
    assert.match(read(f), /rel="manifest" href="\/manifest\.webmanifest"/, f);
    assert.match(read(f), /rel="apple-touch-icon"/, f);
  }
});

test('Vercel sirve sw.js sin caché y el manifiesto con su tipo', () => {
  const h = JSON.parse(read('vercel.json')).headers;
  const sw = h.find((x) => x.source === '/sw.js');
  assert.match(JSON.stringify(sw), /no-cache/);
  assert.match(JSON.stringify(h.find((x) => x.source === '/manifest.webmanifest')), /application\/manifest\+json/);
});

test('el service worker solo se registra en https o localhost', () => {
  const src = read('js/common.js');
  assert.match(src, /location\.protocol === 'https:' \|\| location\.hostname === 'localhost'/);
  assert.match(src, /serviceWorker\.register\('\/sw\.js'\)/);
});

/* ---- Comportamiento del service worker con un entorno simulado ---- */
function makeSW() {
  const handlers = {};
  const stores = new Map();
  const net = { online: true, calls: [] };
  const ok = (body, extra = {}) => Object.assign(new Response(body, { status: 200 }), { ...extra });
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const s = stores.get(name);
    return {
      add: async (u) => { s.set(new URL(u, 'https://x.test').href, await ctx.fetch(u)); },
      put: async (req, res) => { s.set(req.url || String(req), res); },
    };
  };
  const ctx = {
    self: { location: { origin: 'https://x.test' }, addEventListener: (t, f) => (handlers[t] = f), skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (k) => stores.delete(k),
      match: async (req) => {
        const url = typeof req === 'string' ? new URL(req, 'https://x.test').href : req.url;
        for (const s of stores.values()) if (s.has(url)) return s.get(url);
        return undefined;
      },
    },
    fetch: async (u) => {
      net.calls.push(String(u.url || u));
      if (!net.online) throw new Error('offline');
      const r = new Response('contenido de ' + (u.url || u), { status: 200 });
      Object.defineProperty(r, 'type', { value: 'basic' }); // como las respuestas del mismo origen en un navegador
      return r;
    },
    URL, Response, Promise,
  };
  vm.createContext(ctx);
  vm.runInContext(read('sw.js'), ctx);
  const fire = async (type, ev) => {
    let p;
    ev.waitUntil = (x) => { p = x; };
    ev.respondWith = (x) => { ev.responded = true; p = x; };
    handlers[type](ev);
    return p ? p : undefined;
  };
  return { fire, net, stores, ctx };
}
const req = (url, o = {}) => ({ url: 'https://x.test' + url, method: 'GET', mode: 'no-cors', ...o });

test('SW: guarda la interfaz al instalarse y limpia cachés viejas al activarse', async () => {
  const sw = makeSW();
  sw.stores.set('mz-vieja', new Map());
  await sw.fire('install', {});
  assert.ok([...sw.stores.get('mz-v1').keys()].some((k) => k.endsWith('/offline.html')));
  await sw.fire('activate', {});
  assert.equal(sw.stores.has('mz-vieja'), false);
  assert.equal(sw.stores.has('mz-v1'), true);
});

test('SW: no toca /api/, otros dominios, ni peticiones que no son GET', async () => {
  const sw = makeSW();
  for (const r of [req('/api/tmdb?path=/movie/1'), req('/api/log', { method: 'POST' }), { url: 'https://api.themoviedb.org/3/x', method: 'GET', mode: 'cors' }, req('/sw.js')]) {
    const ev = { request: r };
    await sw.fire('fetch', ev);
    assert.notEqual(ev.responded, true, r.url);
  }
});

test('SW: con red devuelve lo nuevo y lo guarda; sin red usa lo guardado', async () => {
  const sw = makeSW();
  const ev1 = { request: req('/css/styles.css') };
  const res = await sw.fire('fetch', ev1);
  assert.equal(await res.text(), 'contenido de https://x.test/css/styles.css');
  await new Promise((r) => setTimeout(r, 5));
  sw.net.online = false;
  const ev2 = { request: req('/css/styles.css') };
  const off = await sw.fire('fetch', ev2);
  assert.match(await off.text(), /contenido de/);
});

test('SW: navegar sin red y sin copia muestra la página "Sin conexión"; un recurso sin copia da 504', async () => {
  const sw = makeSW();
  await sw.fire('install', {});
  sw.net.online = false;
  const nav = await sw.fire('fetch', { request: req('/peliculas', { mode: 'navigate' }) });
  assert.match(await nav.text(), /offline\.html/);
  const miss = await sw.fire('fetch', { request: req('/js/otro.js') });
  assert.equal(miss.status, 504);
});
