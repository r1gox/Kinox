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
  // Solo se usa desde el mismo origen, así que no se habilita CORS.
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const key =
    process.env.TMDB_API_KEY || process.env.TMBD_API_KEY || process.env.TMDB_KEY || '';
  if (!key) {
    return Response.json(
      {
        error:
          'Falta TMDB_API_KEY en Vercel → Settings → Environment Variables (Production y Preview) y Redeploy',
      },
      { status: 503 }
    );
  }

  const rl = allowRequest(clientIp(request));
  if (!rl.ok) {
    return Response.json(
      { error: 'Demasiadas peticiones. Inténtalo de nuevo en unos segundos.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  const check = validateTmdbRequest(new URL(request.url).searchParams);
  if (!check.ok) return Response.json({ error: check.error }, { status: check.status });

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

    return new Response(JSON.stringify(body), {
      status: r.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': r.ok ? 's-maxage=300, stale-while-revalidate=600' : 'no-store',
      },
    });
  } catch (e) {
    return Response.json({ error: String(e && e.message ? e.message : e) }, { status: 502 });
  }
}
