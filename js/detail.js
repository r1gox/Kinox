async function resolveWorkerHit(title, type) {
  var base = (typeof MZ_SEARCH !== 'undefined' && MZ_SEARCH) || 'https://moviezone.tvjz.workers.dev';
  var r = await fetch(base + '/?q=' + encodeURIComponent(title), { headers: { Accept: 'application/json' } });
  if (!r.ok) return null;
  var data = await r.json();
  var results = data.results || [];
  if (!results.length) return null;
  var isTv = type === 'tv';
  var hit =
    results.find(function (x) {
      var t = String(x.type || x.tipo || '').toLowerCase();
      return isTv ? /serie|tv|anime|dorama/.test(t) : /peli|movie/.test(t);
    }) || results[0];
  return hit;
}

function workerPlayHref(hit, type, id, season, episode) {
  if (!hit) {
    return pageHref('reproductor.html', {
      type: type === 'tv' ? 'tv' : 'movie',
      id: id,
      season: season,
      episode: episode,
      slug: undefined
    });
  }
  var sid = hit.source_id || null;
  var slug = hit.slug || '';
  var urlVid = hit.url_vid || null;
  // Series: url_vid base + /temporada/episodio
  if (type === 'tv' && urlVid && season && episode) {
    urlVid = urlVid.replace(/\/$/, '') + '/' + season + '/' + episode;
  }
  return pageHref('reproductor.html', {
    type: type === 'tv' ? 'tv' : 'movie',
    id: id,
    season: season,
    episode: episode,
    slug: slug,
    source_id: sid || undefined,
    url_vid: urlVid || undefined
  });
}

async function loadDetail(type) {
  try {
    if (!KEY) return keyPage();
    var id = new URL(location.href).searchParams.get('id');
    if (!id) throw Error('Falta el ID del título');
    var x = await tmdb('/' + type + '/' + id, { append_to_response: 'videos,watch/providers,recommendations' });
    var it = norm(x, type);
    document.title = it.title + ' — MovieZone';
    store.set(pk('hist'), [it].concat(hist().filter(function (h) { return !(h.id === it.id && h.type === type); })).slice(0, 40));

    var mx = (x['watch/providers'] && x['watch/providers'].results && x['watch/providers'].results.MX) || {};
    var provs = [].concat(mx.flatrate || [], mx.rent || [], mx.buy || []).filter(function (p, i, a) {
      return a.findIndex(function (q) { return q.provider_id === p.provider_id; }) === i;
    });
    var run =
      type === 'movie'
        ? x.runtime
          ? x.runtime + ' min'
          : ''
        : x.number_of_seasons
          ? x.number_of_seasons + ' temporadas'
          : '';
    var seasons = (x.seasons || []).filter(function (s) { return s.season_number > 0; });
    var hasTrailer = (x.videos && x.videos.results || []).some(function (v) { return v.site === 'YouTube'; });

    // Resolver slug/url_vid reales del Worker (no slugify de TMDB)
    var hit = null;
    try {
      hit = await resolveWorkerHit(it.title, type);
    } catch (_) {}

    var playMovieHref = workerPlayHref(hit, 'movie', id);
    var playTvHref = workerPlayHref(hit, 'tv', id, 1, 1);

    $('#view').innerHTML =
      '<section class="det">' +
      (x.backdrop_path ? '<div class="bd" style="background-image:url(' + IMG + 'w1280' + x.backdrop_path + ')"></div>' : '') +
      '<div class="dw">' +
      (x.poster_path ? '<img class="pos" src="' + IMG + 'w500' + x.poster_path + '" alt="Póster de ' + esc(it.title) + '">' : '') +
      '<div class="info"><h1>' +
      esc(it.title) +
      '</h1><div class="meta">' +
      it.year +
      ' · <span class="r">★ ' +
      it.rating.toFixed(1) +
      '</span>' +
      (run ? ' · ' + run : '') +
      '</div><div class="tags">' +
      (x.genres || []).map(function (g) { return '<span>' + esc(g.name) + '</span>'; }).join('') +
      '</div><h3>Sinopsis</h3><p>' +
      (esc(x.overview) || 'Sin sinopsis en español.') +
      '</p><div class="btns">' +
      (type === 'movie'
        ? '<a class="btn play" id="btnPlay" href="' + playMovieHref + '">▶ Reproducir</a>'
        : '<a class="btn play" id="btnPlay" href="' + playTvHref + '">▶ Comenzar 1</a>') +
      (hasTrailer
        ? '<a class="btn" href="' + appLink('/trailer?type=' + type + '&id=' + id) + '">Ver tráiler</a>'
        : '') +
      '<button id="favBtn" class="btn alt ' +
      (favs().some(function (f) { return f.id === it.id && f.type === type; }) ? 'on' : '') +
      '">' +
      (favs().some(function (f) { return f.id === it.id && f.type === type; }) ? '✓ En mi lista' : '+ Mi lista') +
      '</button></div>' +
      (hit
        ? '<p style="color:var(--mute);font-size:.85rem;margin-top:8px">Fuente: ' +
          esc(hit.source || hit.fuente || hit.source_id || '') +
          ' · ' +
          esc(hit.slug || '') +
          '</p>'
        : '<p style="color:var(--mute);font-size:.85rem;margin-top:8px">No se encontró en el worker; el reproductor intentará con el título.</p>') +
      '<h3>Dónde verla en México</h3>' +
      (provs.length
        ? '<div class="prov">' +
          provs.map(function (p) {
            return '<img src="' + IMG + 'w92' + p.logo_path + '" title="' + esc(p.provider_name) + '" alt="' + esc(p.provider_name) + '">';
          }).join('') +
          '</div>' +
          (mx.link
            ? '<p style="margin-top:10px"><a style="color:var(--ac)" href="' + mx.link + '" target="_blank">Ver todas las opciones</a></p>'
            : '')
        : '<p>No hay plataformas registradas en México.</p>') +
      '</div></div></section>' +
      (type === 'tv' && seasons.length
        ? '<section class="seasons"><h2>Temporadas y capítulos</h2><select id="sel">' +
          seasons.map(function (s) {
            return '<option value="' + s.season_number + '">' + esc(s.name) + '</option>';
          }).join('') +
          '</select><div id="eps"></div></section>'
        : '') +
      rowHtml('Títulos similares', list(x.recommendations, type));

    $('#favBtn').onclick = function () {
      var a = favs();
      var has = a.some(function (f) { return f.id === it.id && f.type === type; });
      a = has ? a.filter(function (f) { return !(f.id === it.id && f.type === type); }) : [it].concat(a);
      store.set(pk('favs'), a);
      $('#favBtn').textContent = has ? '+ Mi lista' : '✓ En mi lista';
      $('#favBtn').classList.toggle('on', !has);
    };

    // Series: lista de episodios al estilo Kinox, enlaces con url_vid del worker
    if (type === 'tv' && seasons.length) {
      var go = async function () {
        var s = await tmdb('/tv/' + id + '/season/' + $('#sel').value);
        $('#eps').innerHTML = (s.episodes || [])
          .map(function (e) {
            var href = workerPlayHref(hit, 'tv', id, e.season_number, e.episode_number);
            return (
              '<a class="ep" href="' +
              href +
              '">' +
              (e.still_path
                ? '<img loading="lazy" src="' + IMG + 'w300' + e.still_path + '" alt="">'
                : '<div class="ph"></div>') +
              '<div><b>' +
              e.episode_number +
              '. ' +
              esc(e.name) +
              '</b><small>' +
              esc((e.overview || 'Sin sinopsis.').slice(0, 220)) +
              '</small></div></a>'
            );
          })
          .join('');
      };
      $('#sel').onchange = go;
      go();
    }
  } catch (e) {
    $('#view').innerHTML = '<div class="load">' + esc(e.message) + '</div>';
  }
}
