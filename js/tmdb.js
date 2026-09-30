/**
 * Proxy TMDB — usa variable de entorno de Vercel:
 *   TMDB_API_KEY  (recomendado)
 *   TMBD_API_KEY  (alias por si se escribió mal)
 *
 * GET /api/tmdb?path=/movie/550&language=es-MX&...
 * No expone la key al navegador.
 */
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.json({ error: "Method not allowed" });
  }

  const key =
    process.env.TMDB_API_KEY ||
    process.env.TMBD_API_KEY ||
    process.env.TMDB_KEY ||
    "";

  if (!key) {
    res.statusCode = 503;
    return res.json({
      error: "Falta TMDB_API_KEY en Vercel",
      hint: "Project → Settings → Environment Variables → TMDB_API_KEY",
    });
  }

  const q = req.query || {};
  let path = String(q.path || "/configuration").trim();
  if (!path.startsWith("/")) path = "/" + path;
  // evitar path traversal
  if (path.includes("://") || path.includes("..")) {
    res.statusCode = 400;
    return res.json({ error: "path inválido" });
  }

  const url = new URL("https://api.themoviedb.org/3" + path);
  url.searchParams.set("api_key", key);
  if (!q.language) url.searchParams.set("language", "es-MX");

  Object.keys(q).forEach(function (k) {
    if (k === "path" || k === "api_key") return;
    if (q[k] !== "" && q[k] != null) url.searchParams.set(k, String(q[k]));
  });

  try {
    const r = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    const text = await r.text();
    res.statusCode = r.status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.end(text);
  } catch (e) {
    res.statusCode = 502;
    return res.json({ error: "Error al contactar TMDB", detail: String(e.message || e) });
  }
};
