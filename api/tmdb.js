/**
 * Proxy TMDB en Vercel.
 * Env (Secret): TMDB_API_KEY  (también acepta TMBD_API_KEY por typo)
 *
 * Uso cliente: GET /api/tmdb?path=/movie/550&language=es-MX
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const key =
    process.env.TMDB_API_KEY ||
    process.env.TMBD_API_KEY ||
    process.env.TMDB_KEY ||
    '';

  if (!key) {
    res.status(503).json({
      error: 'Falta TMDB_API_KEY en Vercel (Project → Settings → Environment Variables → Secret)',
    });
    return;
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    let path = url.searchParams.get('path') || '';
    path = String(path).trim();
    if (!path.startsWith('/')) path = '/' + path;
    // Seguridad básica: solo rutas TMDB
    if (!/^\/[a-zA-Z0-9_./%-]+$/.test(path) || path.includes('..')) {
      res.status(400).json({ error: 'path inválido' });
      return;
    }

    const target = new URL('https://api.themoviedb.org/3' + path);
    target.searchParams.set('api_key', key);

    url.searchParams.forEach((v, k) => {
      if (k === 'path') return;
      if (v !== '' && v != null) target.searchParams.set(k, v);
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
      body = { error: 'Respuesta no JSON de TMDB', raw: text.slice(0, 200) };
    }

    res.status(r.status).json(body);
  } catch (e) {
    res.status(502).json({ error: String(e && e.message ? e.message : e) });
  }
};
