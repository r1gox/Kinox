/* Service worker de MovieZone: deja disponible la interfaz sin conexión (no el contenido).
   - Solo maneja peticiones GET del mismo origen.
   - Nunca toca /api/ ni otros dominios (TMDB, Supabase, YouTube…).
   - Red primero (siempre lo más nuevo); si no hay red, usa lo guardado o la página sin conexión. */
const VERSION = 'mz-v1';
const SHELL = [
  '/offline.html', '/css/styles.css', '/css/mobile.css', '/js/common.js',
  '/favicon.svg', '/icon-192.png', '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          if (req.mode === 'navigate') return caches.match('/offline.html');
          return new Response('', { status: 504, statusText: 'Sin conexión' });
        })
      )
  );
});
