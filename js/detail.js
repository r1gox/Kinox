async function resolveWorkerHit(title, type, preferAnime, opts) {
  opts = opts || {};
  var base =
    (typeof MZ_SEARCH !== 'undefined' && MZ_SEARCH) ||
    (typeof MZ_WORKER !== 'undefined' && MZ_WORKER) ||
    'https://moviezone.tvjz.workers.dev';

  function normKey(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /** Variantes de búsqueda: en películas el original EN de TMDB suele coincidir con la fuente */
  function buildQueries(main, original, year, preferOriginal) {
    var out = [];
    var seen = Object.create(null);
    function add(q) {
      q = String(q || '').replace(/\s+/g, ' ').trim();
      if (!q || q.length < 2) return;
      var k = normKey(q);
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push(q);
    }
    // Películas: primero original (EN) → luego título local
    if (preferOriginal) {
      add(original);
      add(main);
    } else {
      add(main);
      add(original);
    }
    // Quitar año entre paréntesis
    add(String(main || '').replace(/\(\s*\d{4}\s*\)/g, '').trim());
    add(String(original || '').replace(/\(\s*\d{4}\s*\)/g, '').trim());
    // Solo cortar por ":" si el prefijo es LO SUFICIENTE largo (>= 3 palabras o >= 18 chars)
    // Evita que "Spider-Man: Un nuevo día" quede en solo "Spider-Man"
    function maybePrefix(s) {
      s = String(s || '');
      var idx = s.indexOf(':');
      if (idx < 1) return;
      var left = s.slice(0, idx).trim();
      var words = left.split(/\s+/).filter(Boolean);
      if (words.length >= 3 || left.length >= 18) add(left);
    }
    maybePrefix(main);
    maybePrefix(original);
    // Con año al final (muchas fuentes lo llevan)
    if (year) {
      var y = String(year).slice(0, 4);
      if (main) add(main + ' ' + y);
      if (original) add(original + ' ' + y);
    }
    return out;
  }

  function scoreHit(hit, mainKey, origKey, year, isTv) {
    var t = String(hit.type || hit.tipo || '').toLowerCase();
    var typeOk = isTv
      ? /serie|tv|anime|dorama|ova|ona/.test(t)
      : /peli|movie/.test(t);
    if (!typeOk && t) return -1000;

    var ht = normKey(hit.title || hit.titulo || '');
    var hy = String(hit.year || '').slice(0, 4);
    var sc = 0;
    if (year && hy && hy === String(year).slice(0, 4)) sc += 50;
    if (year && hy && hy !== String(year).slice(0, 4)) sc -= 30;

    if (mainKey && ht === mainKey) sc += 80;
    else if (origKey && ht === origKey) sc += 80;
    else if (mainKey && (ht.indexOf(mainKey) !== -1 || mainKey.indexOf(ht) !== -1)) sc += 40;
    else if (origKey && (ht.indexOf(origKey) !== -1 || origKey.indexOf(ht) !== -1)) sc += 40;
    else {
      // tokens compartidos
      var a = mainKey ? mainKey.split(' ') : [];
      var b = ht.split(' ');
      var shared = 0;
      for (var i = 0; i < a.length; i++) {
        if (a[i].length > 2 && b.indexOf(a[i]) !== -1) shared++;
      }
      sc += shared * 8;
    }

    var sid = String(hit.source_id || hit.source || '');
    // películas: preferir 9 / 3 / 2
    if (!isTv) {
      if (sid === '9' || sid === 'pelisplushd_bz') sc += 6;
      if (sid === '3' || sid === 'pelisplushd') sc += 4;
      if (sid === '2' || sid === 'hackstore') sc += 2;
    }
    return sc;
  }

  var isTv = type === 'tv' || type === 'anime';
  var year = opts.year || null;
  var original = opts.original || opts.original_title || opts.original_name || '';
  // Fuentes (pelis) suelen indexar el título original EN de TMDB
  var preferOriginal = !isTv;
  var queries = buildQueries(title, original, year, preferOriginal);
  if (!queries.length && title) queries = [title];
  if (!queries.length && original) queries = [original];

  var pool = [];
  var seenSlug = Object.create(null);

  for (var qi = 0; qi < queries.length; qi++) {
    try {
      var r = await fetch(base + '/?q=' + encodeURIComponent(queries[qi]), {
        headers: { Accept: 'application/json' }
      });
      if (!r.ok) continue;
      var data = await r.json();
      var results = data.results || [];
      if (typeof preferAnimeSource === 'function') results = preferAnimeSource(results);
      for (var ri = 0; ri < results.length; ri++) {
        var item = results[ri];
        if (!item) continue;
        var key = String(item.source_id || item.source || '') + '|' + String(item.slug || item.title || '');
        if (seenSlug[key]) continue;
        seenSlug[key] = 1;
        pool.push(item);
      }
      // Si ya tenemos un match fuerte, no hace falta seguir
      var mainKeyEarly = normKey(title);
      var strong = pool.some(function (h) {
        return scoreHit(h, mainKeyEarly, normKey(original), year, isTv) >= 80;
      });
      if (strong && pool.length) break;
    } catch (_) {}
  }

  if (!pool.length) return null;

  if (preferAnime || type === 'anime') {
    var a4 = pool.find(function (x) {
      var sid = String(x.source_id || x.source || '').toLowerCase();
      return sid === '4' || sid === 'animeav1';
    });
    if (a4) return a4;
  }

  var mainKey = normKey(title);
  var origKey = normKey(original);
  pool.sort(function (a, b) {
    return scoreHit(b, mainKey, origKey, year, isTv) - scoreHit(a, mainKey, origKey, year, isTv);
  });

  var best = pool[0];
  if (scoreHit(best, mainKey, origKey, year, isTv) < 0) return null;
  return best;
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
  if (typeof mzFetchDetail === 'function') {
    return mzFetchDetail({ slug: slug, type: type, source_id: sourceId });
  }
  var sid = String(sourceId || (typeof MZ_SOURCE !== 'undefined' ? MZ_SOURCE : '9'));
  var isAnime = sid === '4' || sid === 'animeav1' || sid === '5' || sid === 'jkanime' || type === 'anime';
  var kind;
  if (isAnime) {
    sid = sid === '5' || sid === 'jkanime' ? '5' : '4';
    kind = 'anime';
  } else {
    kind = type === 'tv' ? 'serie' : 'pelicula';
  }
  var path = '/' + sid + '/' + kind + '/' + encodeURIComponent(slug);
  var r = await fetch(workerBaseUrl() + path, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Worker: HTTP ' + r.status);
  var data = await r.json();
  if (data && data.success === false) {
    throw new Error(data.error || data.message || 'No encontrado en el worker');
  }
  return data;
}

/** Detalle solo con slug del worker (buscador → detalle, no al ep. 1) */

function mzSetDetailChrome(on) {
  try {
    document.body.classList.toggle('mz-on-detail', !!on);
    var h = document.getElementById('top') || document.querySelector('header');
    if (!on && h) h.classList.remove('mz-detail-scrolled');
    if (on && !window.__mzDetailScrollBound) {
      window.__mzDetailScrollBound = true;
      window.addEventListener(
        'scroll',
        function () {
          if (!document.body.classList.contains('mz-on-detail')) return;
          var hd = document.getElementById('top') || document.querySelector('header');
          if (!hd) return;
          hd.classList.toggle('mz-detail-scrolled', window.scrollY > 40);
        },
        { passive: true }
      );
    }
  } catch (_) {}
}

async function loadDetailFromWorker(type, params) {
  mzSetDetailChrome(true);
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

  var trailerKey = null;
  var tmdbIdForTrailer = null;
  try {
    if (KEY && typeof resolveTmdbIdForTitle === 'function') {
      tmdbIdForTrailer = await resolveTmdbIdForTitle(title, type, year);
      if (tmdbIdForTrailer) {
        var tr = await findYoutubeTrailer(type, tmdbIdForTrailer);
        if (tr && tr.key) trailerKey = tr.key;
        // Backdrop w1280 desde TMDB si el worker no trae
        if (!backdrop && typeof tmdb === 'function') {
          try {
            var tx = await tmdb('/' + type + '/' + tmdbIdForTrailer);
            if (tx && tx.backdrop_path) {
              backdrop =
                (typeof IMG !== 'undefined' ? IMG : 'https://image.tmdb.org/t/p/') +
                'w1280' +
                tx.backdrop_path;
            }
            if ((!rating || rating === '') && tx && tx.vote_average) {
              rating = tx.vote_average;
            }
          } catch (_) {}
        }
      }
    }
  } catch (_) {}

  var temps = Array.isArray(data.temporadas) ? data.temporadas : [];

  // Preferir backdrop TMDB w1280
  var bdUrl = backdrop || '';
  if (bdUrl && bdUrl.indexOf('/t/p/') !== -1 && bdUrl.indexOf('w1280') === -1) {
    bdUrl = bdUrl.replace(/\/t\/p\/\w+\//, '/t/p/w1280/');
  }
  $('#view').innerHTML =
    '<section class="det">' +
    (bdUrl
      ? '<div class="bd" style="background-image:url(' + esc(bdUrl) + ')"></div>'
      : '') +
    '<a class="kx-back det-back" href="javascript:history.back()">← Volver</a>' +
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
    (trailerKey
      ? '<button type="button" class="btn" id="btnTrailer">Ver tráiler</button>'
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

    if (trailerKey && typeof openTrailerModal === 'function') {
    var btW = document.getElementById('btnTrailer');
    if (btW) btW.onclick = function () { openTrailerModal(trailerKey); };
  }

if (type === 'tv' && temps.length) {
    var tmdbIdWorker = null;
    if (KEY && typeof resolveTmdbIdForTitle === 'function') {
      resolveTmdbIdForTitle(title, type, year).then(function (tid) {
        tmdbIdWorker = tid;
        renderEps();
      }).catch(function () {});
    }
    var renderEps = async function () {
      var want = parseInt($('#sel').value, 10) || 1;
      var block =
        temps.find(function (t) {
          return parseInt(t.temporada != null ? t.temporada : 0, 10) === want;
        }) || temps[0];
      var lista = (block && (block.lista || block.episodios)) || [];
      if (!Array.isArray(lista)) lista = [];
      var tmdbByEp = {};
      var tid = tmdbIdWorker;
      if (!tid && KEY && typeof resolveTmdbIdForTitle === 'function') {
        try {
          tid = await resolveTmdbIdForTitle(title, type, year);
          tmdbIdWorker = tid;
        } catch (_) {}
      }
      if (tid && KEY && typeof tmdb === 'function') {
        try {
          var s = await tmdb('/tv/' + tid + '/season/' + want);
          (s.episodes || []).forEach(function (ep) {
            tmdbByEp[ep.episode_number] = ep;
          });
          var missing = (s.episodes || []).some(function (ep) {
            return !ep.name || !ep.overview;
          });
          if (missing) {
            try {
              var sEn = await tmdb('/tv/' + tid + '/season/' + want, { language: 'en-US' });
              (sEn.episodes || []).forEach(function (ep) {
                var prev = tmdbByEp[ep.episode_number] || {};
                tmdbByEp[ep.episode_number] = Object.assign({}, prev, {
                  name: prev.name || ep.name,
                  overview: prev.overview || ep.overview,
                  still_path: prev.still_path || ep.still_path,
                  runtime: prev.runtime || ep.runtime
                });
              });
            } catch (_) {}
          }
        } catch (_) {}
      }
      $('#eps').innerHTML = lista.length
        ? lista
            .map(function (e) {
              var en = e.episodio != null ? e.episodio : e.episode != null ? e.episode : e.episode_number;
              var sn = e.temporada != null ? e.temporada : want;
              var tm = tmdbByEp[en] || {};
              var name = e.titulo || e.name || e.title || tm.name || ('Episodio ' + en);
              var overview = e.descripcion || e.overview || tm.overview || '';
              var still =
                e.back_img ||
                e.still ||
                e.image ||
                (tm.still_path ? IMG + 'w300' + tm.still_path : '');
              var href = workerPlayHref(
                Object.assign({}, hit || {}, { source_id: (data && data.source_id) || sourceId }),
                'tv',
                tid || null,
                sn,
                en
              );
              return (
                '<a class="ep" href="' +
                href +
                '">' +
                (still
                  ? '<img loading="lazy" src="' + esc(still) + '" alt="">'
                  : '<div class="ph"></div>') +
                '<div><b>T' +
                sn +
                ' E' +
                en +
                ' — ' +
                esc(name) +
                '</b><small>' +
                esc((overview || 'Sin sinopsis.').slice(0, 220)) +
                '</small></div></a>'
              );
            })
            .join('')
        : '<p style="color:var(--mute)">Sin episodios en esta temporada.</p>';
    };
    $('#sel').onchange = function () {
      renderEps();
    };
    renderEps();
  }
}

async function loadDetail(type) {
  mzSetDetailChrome(true);
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
        var isAnim =
          type === 'anime' ||
          (x.genres || []).some(function (g) {
            return g && (g.id === 16 || /anim/i.test(g.name || ''));
          });
        var origEn =
          String(it.original_title || x.original_title || x.original_name || '').trim();
        hit = await resolveWorkerHit(it.title, type, isAnim, {
          original: origEn,
          year: (x.release_date || x.first_air_date || '').slice(0, 4) || it.year || null
        });
        // Películas: si no hubo hit, buscar solo con Original Title (EN) de TMDB
        if (!hit && origEn && type !== 'tv' && type !== 'anime') {
          hit = await resolveWorkerHit(origEn, type, false, {
            original: origEn,
            year: (x.release_date || x.first_air_date || '').slice(0, 4) || null
          });
        }
      } catch (_) {}
    }

    var playMovieHref = workerPlayHref(hit, 'movie', id);
    var playTvHref = workerPlayHref(hit, 'tv', id, 1, 1);

    $('#view').innerHTML =
      '<section class="det">' +
      (x.backdrop_path
        ? '<div class="bd" style="background-image:url(' + IMG + 'w1280' + x.backdrop_path + ')"></div>'
        : '') +
      '<a class="kx-back det-back" href="javascript:history.back()">← Volver</a>' +
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
        ? '<button type="button" class="btn" id="btnTrailer">Ver tráiler</button>'
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

    if (hasTrailer && trailerVid && trailerVid.key && typeof openTrailerModal === 'function') {
      var btT = document.getElementById('btnTrailer');
      if (btT) {
        btT.onclick = function () { openTrailerModal(trailerVid.key); };
      }
    }

    if (type === 'tv' && seasons.length) {
      var go = async function () {
        var sn = $('#sel').value;
        var s = await tmdb('/tv/' + id + '/season/' + sn);
        var eps = s.episodes || [];
        var needFill = eps.some(function (e) {
          return !e.name || !e.overview;
        });
        if (needFill) {
          try {
            var sEn = await tmdb('/tv/' + id + '/season/' + sn, { language: 'en-US' });
            var byN = {};
            (sEn.episodes || []).forEach(function (e) {
              byN[e.episode_number] = e;
            });
            eps = eps.map(function (e) {
              var m = byN[e.episode_number];
              if (!m) return e;
              return Object.assign({}, e, {
                name: e.name || m.name,
                overview: e.overview || m.overview,
                still_path: e.still_path || m.still_path,
                runtime: e.runtime || m.runtime
              });
            });
          } catch (_) {}
        }
        $('#eps').innerHTML = eps
          .map(function (e) {
            var href = workerPlayHref(hit, 'tv', id, e.season_number, e.episode_number);
            return (
              '<a class="ep" href="' +
              href +
              '">' +
              (e.still_path
                ? '<img loading="lazy" src="' + IMG + 'w300' + e.still_path + '" alt="">'
                : '<div class="ph"></div>') +
              '<div><b>T' +
              e.season_number +
              ' E' +
              e.episode_number +
              ' — ' +
              esc(e.name || ('Episodio ' + e.episode_number)) +
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
