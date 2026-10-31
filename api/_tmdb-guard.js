/**
 * Reglas del proxy de TMDB: qué rutas y parámetros se aceptan y cuántas peticiones por IP.
 * (El prefijo "_" evita que Vercel lo trate como una función propia.)
 */

// Solo las rutas que usa el sitio.
const ALLOWED_PATHS = [
  /^\/configuration$/,
  /^\/(movie|tv)\/\d{1,9}$/,
  /^\/(movie|tv)\/\d{1,9}\/(videos|credits|watch\/providers)$/,
  /^\/tv\/\d{1,9}\/season\/\d{1,3}$/,
  /^\/tv\/\d{1,9}\/season\/\d{1,3}\/episode\/\d{1,4}$/,
  /^\/search\/(movie|tv)$/,
];

// Parámetros permitidos y su formato. Los desconocidos se descartan; los inválidos se rechazan.
const ALLOWED_PARAMS = {
  language: /^[a-z]{2}(-[A-Za-z]{2})?$/,
  query: /^[^\p{Cc}]{1,100}$/u,
  include_adult: /^(true|false)$/,
  append_to_response: /^[a-z_]+(\/[a-z_]+)?(,[a-z_]+(\/[a-z_]+)?){0,5}$/,
  first_air_date_year: /^\d{4}$/,
  year: /^\d{4}$/,
  page: /^\d{1,3}$/,
  region: /^[A-Z]{2}$/,
};

export function validateTmdbRequest(searchParams) {
  let path = String(searchParams.get('path') || '').trim();
  if (path && !path.startsWith('/')) path = '/' + path;
  if (!path || path.length > 120 || !ALLOWED_PATHS.some((re) => re.test(path))) {
    return { ok: false, status: 400, error: 'path no permitido' };
  }
  const params = {};
  for (const [k, v] of searchParams.entries()) {
    if (k === 'path' || !(k in ALLOWED_PARAMS) || !v) continue; // api_key y desconocidos se ignoran
    if (!ALLOWED_PARAMS[k].test(v)) return { ok: false, status: 400, error: `parámetro inválido: ${k}` };
    params[k] = v;
  }
  return { ok: true, path, params };
}

// Límite por IP en memoria. Es "mejor esfuerzo": cada instancia edge lleva su propia cuenta.
// Para un límite estricto usa las reglas de rate limiting del Firewall de Vercel.
const WINDOW_MS = 60_000;
const LIMIT = 150;
const hits = new Map();

export function allowRequest(ip, now = Date.now()) {
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    if (hits.size > 5000) hits.clear();
  }
  let h = hits.get(ip);
  if (!h || h.reset <= now) {
    h = { count: 0, reset: now + WINDOW_MS };
    hits.set(ip, h);
  }
  h.count++;
  return h.count <= LIMIT
    ? { ok: true, retryAfter: 0 }
    : { ok: false, retryAfter: Math.max(1, Math.ceil((h.reset - now) / 1000)) };
}

export function clientIp(request) {
  return (
    request.headers.get('x-real-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}
