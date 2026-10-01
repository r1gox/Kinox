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

function mzIsAnimeSource(sourceId, type) {
  var sid = String(sourceId || '').toLowerCase();
  if (sid === '4' || sid === 'animeav1' || sid === '5' || sid === 'jkanime') return true;
  var t = String(type || '').toLowerCase();
  return t === 'anime' || t === 'ova' || t === 'ona';
}

/** Ruta worker: anime → /4/anime/slug/T/E · serie → /9/serie/... · peli → /…/pelicula/ */
function mzBuildPath(opts) {
  var type = opts.type;
  var slug = opts.slug;
  var season = opts.season;
  var episode = opts.episode;
  var sid = String(opts.source_id || opts.sourceId || MZ_SOURCE || '9');
  var isAnime = mzIsAnimeSource(sid, type) || String(type).toLowerCase() === 'anime';

  if (type === 'tv' || type === 'anime' || isAnime && season && episode) {
    if (!season || !episode) throw new Error('Faltan temporada o episodio.');
    if (isAnime || sid === '4' || sid === '5') {
      // AnimeAV1 (4) y JKanime (5) usan /anime/
      var animeSid = sid === '5' || sid === 'jkanime' ? '5' : '4';
      if (sid === '4' || sid === 'animeav1') animeSid = '4';
      if (sid === '5' || sid === 'jkanime') animeSid = '5';
      // default anime → 4
      if (!sid || sid === '9') animeSid = '4';
      return (
        '/' + animeSid + '/anime/' + encodeURIComponent(slug) +
        '/' + encodeURIComponent(season) + '/' + encodeURIComponent(episode)
      );
    }
    return (
      '/' + sid + '/serie/' + encodeURIComponent(slug) +
      '/' + encodeURIComponent(season) + '/' + encodeURIComponent(episode)
    );
  }
  // película / ova de un episodio
  if (isAnime || sid === '4' || sid === '5') {
    var aSid = sid === '5' || sid === 'jkanime' ? '5' : '4';
    return '/' + aSid + '/pelicula/' + encodeURIComponent(slug);
  }
  return '/' + sid + '/pelicula/' + encodeURIComponent(slug);
}

async function mzPlayers(opts) {
  var slug = opts.slug;
  if (!slug) throw new Error('No se pudo determinar el título para buscar reproductores.');
  var path = mzBuildPath(opts);
  var r = await fetch(MZ_WORKER + path, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Worker: HTTP ' + r.status);
  var data = await r.json();
  if (data && data.success === false) {
    throw new Error(data.error || data.message || 'No se encontraron reproductores.');
  }
  var players = mzListFromWorker(data);
  if (!players.length) throw new Error('No hay reproductores para este título.');
  return { success: true, reproductores: players, path: path };
}

/** Detalle worker (temporadas separadas en animeav1) */
async function mzFetchDetail(opts) {
  var slug = opts.slug;
  var sid = String(opts.source_id || opts.sourceId || MZ_SOURCE || '9');
  var type = opts.type || 'tv';
  var isAnime = mzIsAnimeSource(sid, type);
  var path;
  var pathB;
  if (isAnime || sid === '4' || sid === '5') {
    var aSid = sid === '5' || sid === 'jkanime' ? '5' : '4';
    if (sid === '4' || sid === 'animeav1' || !sid || sid === '9') aSid = '4';
    if (sid === '5' || sid === 'jkanime') aSid = '5';
    path = '/' + aSid + '/anime/' + encodeURIComponent(slug);
    pathB = '/' + aSid + '/anime/b/' + encodeURIComponent(slug);
  } else if (type === 'movie') {
    path = '/' + sid + '/pelicula/' + encodeURIComponent(slug);
    pathB = '/' + sid + '/pelicula/b/' + encodeURIComponent(slug);
  } else {
    path = '/' + sid + '/serie/' + encodeURIComponent(slug);
    pathB = '/' + sid + '/serie/b/' + encodeURIComponent(slug);
  }
  async function get(p) {
    var r = await fetch(MZ_WORKER + p, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    var data = await r.json();
    if (data && data.success === false) return null;
    return data;
  }
  // Preferir /b/ (url_vid) para episodios con titulo ES + back_img
  var basic = await get(pathB);
  var full = await get(path);
  if (!basic && !full) throw new Error('No encontrado');
  var data = Object.assign({}, full || {}, basic || {});
  if (basic && Array.isArray(basic.temporadas) && basic.temporadas.length) {
    data.temporadas = basic.temporadas;
  }
  if (basic && basic.url_vid) data.url_vid = basic.url_vid;
  return data;
}
