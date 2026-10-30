// Carga js/*.js en un sandbox de Node con un DOM falso, para probar funciones puras
// sin navegador. Solo sirve para pruebas; no se usa en producción.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function load(files, extra = '') {
  const noop = () => {};
  const el = new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => '' : el),
    apply: () => el,
    set: () => true,
  });
  const ctx = {
    document: el,
    location: { href: 'https://x.test/', origin: 'https://x.test', pathname: '/', hostname: 'x.test', search: '', protocol: 'https:' },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    navigator: { userAgent: '' },
    console, URL, URLSearchParams, setTimeout, clearTimeout, setInterval: noop,
    fetch: () => Promise.reject(new Error('sin red en tests')),
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    addEventListener: noop, removeEventListener: noop, requestAnimationFrame: noop,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
  }
  if (extra) vm.runInContext(extra, ctx);
  return ctx;
}
module.exports = { load };
