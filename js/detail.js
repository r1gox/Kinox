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
  var urlVid = hit.url_vid || hit.url || null;
  if (type === 'tv' && urlVid && season && episode) {
    urlVid = String(urlVid).replace(/\/$/, '');
    if (!/\/\d+\/\d+\/?$/.test(urlVid)) {
      urlVid = urlVid + '/' + season + '/' + episode;
    } else {
      urlVid = urlVid.replace(/\/\d+\/\d+\/?$/, '/' + season + '/' + episode);
    }
  }
  return pageHref('reproductor.html', {
    type: type === 'tv' ? 'tv' : 'movie',
    id: id || undefined,
    season: season,
    episode: episode,
    slug: slug,
    source_id: sid || undefined,
    url_vid: urlVid || undefined
  });
}

function workerBaseUrl() {
  if (typeof MZ_WORKER !== 'undefined' && MZ_WORKER) return MZ_WORKER;
  if (typeof MZ_SEARCH !== 'undefined' && MZ_SEARCH) return MZ_SEARCH;
  return 'https://moviezone.tvjz.workers.dev';
}


async function findYoutubeTrailer(type, tmdbId) {
  if (!tmdbId || typeof tmdb !== 'function' || !KEY) return null;
  async function pick(results) {
    var list = results || [];
    var order = ['Trailer', 'Teaser', 'Clip'];
    for (var i = 0; i < order.length; i++) {
      var hit = list.find(function (v) {
        return v.site === 'YouTube' && v.type === order[i] && v.key;
      });
      if (hit) return hit;
    }
    return list.find(function (v) { return v.site === 'YouTube' && v.key; }) || null;
  }
  try {
    // es-MX a veces no trae videos → probar también en-US
    var a = await tmdb('/' + type + '/' + tmdbId + '/videos', {});
    var vid = await pick(a.results);
    if (vid) return vid;
  } catch (_) {}
  try {
    var b = await tmdb('/' + type + '/' + tmdbId + '/videos', { language: 'en-US' });
    return await pick(b.results);
  } catch (_) {
    return null;
  }
}

async function fetchWorkerDetail(slug, type, sourceId) {
  var sid = sourceId || (typeof MZ_SOURCE !== 'undefined' ? MZ_SOURCE : '9');
  var path =
    '/' +
    sid +
    '/' +
    (type === 'tv' ? 'serie' : 'pelicula') +
    '/' +
    encodeURIComponent(slug);
  var r = await fetch(workerBaseUrl() + path, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Worker: HTTP ' + r.status);
  var data = await r.json();
  if (data && data.success === false) {
    throw new Error(data.error || data.message || 'No encontrado en el worker');
  }
  return data;
}

/** Detalle solo con slug del worker (buscador → detalle, no al ep. 1) */
async function loadDetailFromWorker(type, params) {
  var slug = params.slug;
  var sourceId = params.source_id || params.source || null;
  var titleHint = params.title || slug.replace(/-/g, ' ');
  var portadaHint = params.portada || '';

  $('#view').innerHTML = '<div class="load">Cargando detalle…</div>';
  var data = await fetchWorkerDetail(slug, type, sourceId);
  var title = data.titulo || data.title || titleHint;
  var original = data.titulo_original || '';
  var year = data.year || '';
  var rating = data.rating != null ? data.rating : data.calificacion;
  var overview = data.descripcion || data.overview || 'Sin sinopsis.';
  var portada = data.portada || portadaHint || '';
  var backdrop = data.backdrop || '';
  var generos = data.generos || [];
  if (typeof generos === 'string') {
    try { generos = JSON.parse(generos); } catch (_) { generos = generos.split(','); }
  }
  var hit = {
    slug: data.slug || slug,
    source_id: data.source_id || sourceId,
    source: data.fuente || data.source,
    url_vid: data.url_extract || data.link || null,
    title: title
  };
  document.title = title + ' — Kinox';

  var run =
    type === 'movie'
      ? data.duracion_texto || (data.duracion ? data.duracion + ' min' : '')
      : data.total_temporadas
        ? data.total_temporadas + ' temporadas'
        : data.total_episodios
          ? data.total_episodios + ' episodios'
          : '';

  var playHref =
    type === 'tv'
      ? workerPlayHref(hit, 'tv', null, 1, 1)
      : workerPlayHref(hit, 'movie', null);

  var trailerHref = null;
  var tmdbIdForTrailer = null;
  try {
    if (KEY && typeof resolveTmdbIdForTitle === 'function') {
      tmdbIdForTrailer = await resolveTmdbIdForTitle(title, type, year);
      if (tmdbIdForTrailer) {
        var tr = await findYoutubeTrailer(type, tmdbIdForTrailer);
        if (tr && tr.key) {
          trailerHref = appLink('/trailer?type=' + type + '&id=' + tmdbIdForTrailer);
        }
      }
    }
  } catch (_) {}

  var temps = Array.isArray(data.temporadas) ? data.temporadas : [];

  $('#view').innerHTML =
    '<section class="det">' +
    (backdrop
      ? '<div class="bd" style="background-image:url(' + esc(backdrop) + ')"></div>'
      : '') +
    '<div class="dw">' +
    (portada ? '<img class="pos" src="' + esc(portada) + '" alt="">' : '') +
    '<div class="info"><h1>' +
    esc(title) +
    '</h1>' +
    (original && original !== title
      ? '<p style="color:var(--mute);margin:0 0 8px">Título original: ' + esc(original) + '</p>'
      : '') +
    '<div class="meta">' +
    esc(year) +
    (rating != null && rating !== ''
      ? ' · <span class="r">★ ' + esc(String(rating)) + '</span>'
      : '') +
    (run ? ' · ' + esc(run) : '') +
    (data.estado ? ' · ' + esc(data.estado) : '') +
    '</div><div class="tags">' +
    (Array.isArray(generos) ? generos : [])
      .map(function (g) {
        return '<span>' + esc(typeof g === 'string' ? g : g.name || '') + '</span>';
      })
      .join('') +
    '</div><h3>Sinopsis</h3><p>' +
    esc(overview) +
    '</p><div class="btns">' +
    '<a class="btn play" id="btnPlay" href="' +
    playHref +
    '">' +
    (type === 'tv' ? '▶ Comenzar E1' : '▶ Reproducir') +
    '</a>' +
    (trailerHref
      ? '<a class="btn" href="' + trailerHref + '">Ver tráiler</a>'
      : '') +
    '</div>' +
    '<p style="color:var(--mute);font-size:.85rem;margin-top:8px">Fuente: ' +
    esc(hit.source || hit.source_id || '') +
    ' · ' +
    esc(hit.slug || '') +
    '</p></div></div></section>' +
    (type === 'tv' && temps.length
      ? '<section class="seasons"><h2>Temporadas y capítulos</h2><select id="sel">' +
        temps
          .map(function (t, i) {
            var n = t.temporada != null ? t.temporada : i + 1;
            var label = 'Temporada ' + n;
            if (t.episodios != null && !Array.isArray(t.episodios)) {
              label += ' (' + t.episodios + ' eps)';
            } else if (Array.isArray(t.lista)) {
              label += ' (' + t.lista.length + ' eps)';
            }
            return (
              '<option value="' +
              n +
              '"' +
              (i === 0 ? ' selected' : '') +
              '>' +
              esc(label) +
              '</option>'
            );
          })
          .join('') +
        '</select><div id="eps"></div></section>'
      : '');

  if (type === 'tv' && temps.length) {
    var renderEps = function () {
      var want = parseInt($('#sel').value, 10) || 1;
      var block =
        temps.find(function (t) {
          return parseInt(t.temporada != null ? t.temporada : 0, 10) === want;
        }) || temps[0];
      var lista = (block && (block.lista || block.episodios)) || [];
      if (!Array.isArray(lista)) lista = [];
      $('#eps').innerHTML = lista.length
        ? lista
            .map(function (e) {
              var en = e.episodio != null ? e.episodio : e.episode != null ? e.episode : e.episode_number;
              var sn = e.temporada != null ? e.temporada : want;
              var name = e.titulo || e.name || e.title || 'Episodio ' + en;
              var still = e.back_img || e.still || e.image || '';
              var href = workerPlayHref(hit, 'tv', null, sn, en);
              return (
                '<a class="ep" href="' +
                href +
                '">' +
                (still
                  ? '<img loading="lazy" src="' + esc(still) + '" alt="">'
                  : '<div class="ph"></div>') +
                '<div><b>' +
                en +
                '. ' +
                esc(name) +
                '</b></div></a>'
              );
            })
            .join('')
        : '<p style="color:var(--mute)">Sin episodios en esta temporada.</p>';
    };
    $('#sel').onchange = renderEps;
    renderEps();
  }
}

async function loadDetail(type) {
  try {
    var params = new URL(location.href).searchParams;
    var id = params.get('id');
    var slug = params.get('slug');
    var sourceIdParam = params.get('source_id') || params.get('source') || null;

    // Solo slug: intentar resolver id TMDB y usar la misma UI que /detalle-serie?id=…
    if (!id && slug) {
      var titleHint = params.get('title') || String(slug).replace(/-/g, ' ');
      var yearHint = params.get('year') || '';
      if (KEY && typeof resolveTmdbIdForTitle === 'function') {
        try {
          var tid = await resolveTmdbIdForTitle(titleHint, type, yearHint);
          if (tid) {
            var dest = pageHref(
              type === 'tv' ? 'detalle-serie.html' : 'detalle-pelicula.html',
              {
                id: tid,
                slug: slug,
                source_id: sourceIdParam || undefined
              }
            );
            location.replace(dest);
            return;
          }
        } catch (_) {}
      }
      // Sin TMDB key o sin match → detalle worker
      return await loadDetailFromWorker(type, {
        slug: slug,
        source_id: sourceIdParam,
        title: params.get('title'),
        portada: params.get('portada')
      });
    }

    if (!KEY) return keyPage();
    if (!id) throw Error('Falta el ID del título');
    var x = await tmdb('/' + type + '/' + id, { append_to_response: 'videos,watch/providers,recommendations' });
    var it = norm(x, type);
    document.title = it.title + ' — Kinox';
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
    var trailerVid = null;
    try {
      trailerVid = await findYoutubeTrailer(type, id);
    } catch (_) {}
    if (!trailerVid) {
      trailerVid = (x.videos && x.videos.results || []).find(function (v) {
        return v.site === 'YouTube' && v.key;
      }) || null;
    }
    var hasTrailer = !!trailerVid;

    var hit = null;
    // Si venimos del buscador, ya traemos slug/source_id del worker
    if (slug) {
      hit = {
        slug: slug,
        source_id: sourceIdParam,
        source: sourceIdParam,
        title: it.title
      };
    }
    if (!hit || !hit.slug) {
      try {
        hit = await resolveWorkerHit(it.title, type);
      } catch (_) {}
    }

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
