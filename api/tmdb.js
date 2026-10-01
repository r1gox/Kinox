/**
 * Proxy TMDB — Vercel Serverless / Edge
 * Variable: TMDB_API_KEY (Production + Preview)
 *
 * GET /api/tmdb?path=/movie/550&language=es-MX
 */

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors });
  }

  const key =
    process.env.TMDB_API_KEY ||
    process.env.TMBD_API_KEY ||
    process.env.TMDB_KEY ||
    '';

  if (!key) {
    return Response.json(
      {
        error:
          'Falta TMDB_API_KEY en Vercel → Settings → Environment Variables (Production y Preview) y Redeploy',
      },
      { status: 503, headers: cors }
    );
  }

  try {
    const url = new URL(request.url);
    let path = (url.searchParams.get('path') || '').trim();
    if (!path.startsWith('/')) path = '/' + path;
    if (!path || path.includes('..') || !/^\/[a-zA-Z0-9_./%-]+$/.test(path)) {
      return Response.json({ error: 'path inválido' }, { status: 400, headers: cors });
    }

    const target = new URL('https://api.themoviedb.org/3' + path);
    target.searchParams.set('api_key', key);
    url.searchParams.forEach((v, k) => {
      if (k === 'path') return;
      if (v) target.searchParams.set(k, v);
    });
    if (!target.searchParams.get('language')) {
      target.searchParams.set('language', 'es-MX');
    }

    const r = await fetch(target.toString(), {
      headers: { Accept: 'application/json' },
    });
    const text = await r.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: 'Respuesta no JSON', raw: text.slice(0, 200) };
    }

    return new Response(JSON.stringify(body), {
      status: r.status,
      headers: {
        ...cors,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (e) {
    return Response.json(
      { error: String(e && e.message ? e.message : e) },
      { status: 502, headers: cors }
    );
  }
}
