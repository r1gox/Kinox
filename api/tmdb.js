/**
 * Proxy TMDB — Vercel Edge
 * Variable de entorno: TMDB_API_KEY (Production + Preview)
 *
 * GET /api/tmdb?path=/movie/550&language=es-MX
 * Solo acepta las rutas y parámetros definidos en _tmdb-guard.js.
 */
import { validateTmdbRequest, allowRequest, clientIp } from './_tmdb-guard.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // CORS restringido a pruebas locales: file:// (Origin: null) y localhost.
  // No se permite que cualquier sitio externo lea este proxy.
  const origin = request.headers.get('origin') || '';
  const localOrigin = origin === 'null' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  const corsHeaders = {};
  if (localOrigin) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
    corsHeaders['Vary'] = 'Origin';
    corsHeaders['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  const json = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders, extraHeaders),
  });
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: localOrigin ? 204 : 403, headers: corsHeaders });
  }
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const key =
    process.env.TMDB_API_KEY || process.env.TMBD_API_KEY || process.env.TMDB_KEY || '';
  if (!key) {
    return json(
      { error: 'Falta TMDB_API_KEY en Vercel → Settings → Environment Variables (Production y Preview) y Redeploy' },
      503
    );
  }

  const rl = allowRequest(clientIp(request));
  if (!rl.ok) {
    return json(
      { error: 'Demasiadas peticiones. Inténtalo de nuevo en unos segundos.' },
      429,
      { 'Retry-After': String(rl.retryAfter) }
    );
  }

  const check = validateTmdbRequest(new URL(request.url).searchParams);
  if (!check.ok) return json({ error: check.error }, check.status);

  try {
    const target = new URL('https://api.themoviedb.org/3' + check.path);
    target.searchParams.set('api_key', key);
    for (const [k, v] of Object.entries(check.params)) target.searchParams.set(k, v);
    if (!target.searchParams.get('language')) target.searchParams.set('language', 'es-MX');

    const r = await fetch(target.toString(), { headers: { Accept: 'application/json' } });
    const text = await r.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: 'Respuesta no JSON' };
    }

    return json(body, r.status, {
      'Cache-Control': r.ok ? 's-maxage=300, stale-while-revalidate=600' : 'no-store',
    });
  } catch (e) {
    return json({ error: String(e && e.message ? e.message : e) }, 502);
  }
}
