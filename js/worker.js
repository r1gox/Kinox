// Reproductores — Worker MovieZone (no redeclarar MZ_WORKER si ya existe)
var MZ_WORKER = (typeof MZ_WORKER !== 'undefined' && MZ_WORKER) || 'https://moviezone.tvjz.workers.dev';
var MZ_SOURCE = (typeof MZ_SOURCE !== 'undefined' && MZ_SOURCE) || '9';

function mzSlug(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mzListFromWorker(data) {
  if (!data || typeof data !== 'object') return [];
  var list = data.reproductores || data.players || data.embeds || data.servers || [];
  if (!Array.isArray(list)) list = [];
  return list.map(function (p, i) {
    if (!p) return null;
    if (typeof p === 'string') {
      return { name: 'Servidor ' + (i + 1), url: p, stream_url: null, hls_resolve: null, language: '', idioma: '' };
    }
    return {
      name: p.name || p.servidor || p.server || p.provider || ('Servidor ' + (i + 1)),
      provider: p.provider || p.servidor || p.server || null,
      servidor: p.servidor || p.server || p.provider || null,
      url: p.url || p.link || p.embed || p.src || null,
      stream_url: p.stream_url || p.hls || p.direct || null,
      hls_resolve: p.hls_resolve || null,
      language: p.language || p.lang || p.idioma || '',
      idioma: p.idioma || p.language || p.lang || '',
      noAds: !!(p.noAds || p.no_ads)
    };
  }).filter(function (p) {
    return p && (p.stream_url || p.hls_resolve || p.url);
  });
}

async function mzPlayers(opts) {
  var type = opts.type;
  var slug = opts.slug;
  var season = opts.season;
  var episode = opts.episode;
  if (!slug) throw new Error('No se pudo determinar el título para buscar reproductores.');
  var path;
  if (type === 'tv') {
    if (!season || !episode) throw new Error('Faltan temporada o episodio.');
    path = '/' + MZ_SOURCE + '/serie/' + encodeURIComponent(slug) + '/' + encodeURIComponent(season) + '/' + encodeURIComponent(episode);
  } else {
    path = '/' + MZ_SOURCE + '/pelicula/' + encodeURIComponent(slug);
  }
  var r = await fetch(MZ_WORKER + path, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Worker: HTTP ' + r.status);
  var data = await r.json();
  if (data && data.success === false) {
    throw new Error(data.error || data.message || 'No se encontraron reproductores.');
  }
  var players = mzListFromWorker(data);
  if (!players.length) throw new Error('No hay reproductores para este título.');
  return { success: true, reproductores: players };
}
