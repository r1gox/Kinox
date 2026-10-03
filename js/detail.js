
  function guessSeasonFromTitle(title) {
  var s = String(title || '');
  if (/\bIII\b|3rd\s*season|season\s*3|temporada\s*3|第3/i.test(s)) return 3;
  if (/\bII\b|2nd\s*season|season\s*2|temporada\s*2|第2/i.test(s)) return 2;
  if (/\bIV\b|4th\s*season|season\s*4|temporada\s*4/i.test(s)) return 4;
  var m = s.match(/(?:season|temporada|\bs)\s*(\d{1,2})\b/i);
  if (m) return parseInt(m[1], 10) || 1;
  return 1;
}

function isGenericEpName(n) {
    n = String(n || '').trim();
    if (!n) return true;
    // "Episodio 1", "Episode 12", "Capítulo 3", etc.
    if (/^(episodio|episode|capitulo|capítulo|chapter)\s*\d+$/i.test(n)) return true;
    if (/^e\d+$/i.test(n)) return true;
    return false;
  }

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
    // Rechazar peli↔serie cruzado
    if (t) {
      if (!isTv && /serie|tv|dorama/.test(t) && !/peli|movie|film/.test(t)) return -1000;
      if (isTv && /peli|movie|film/.test(t) && !/serie|tv|anime|dorama|ova|ona/.test(t)) return -1000;
    }

    var ht = normKey(hit.title || hit.titulo || '');
    var hs = normKey(String(hit.slug || '').replace(/-/g, ' '));
    var hy = String(hit.year || '').slice(0, 4);
    var sc = 0;
    if (!ht && !hs) return -1000;

    if (year && hy && hy === String(year).slice(0, 4)) sc += 50;
    if (year && hy && hy !== String(year).slice(0, 4)) sc -= 40;

    var titleMatch = false;
    if (mainKey && ht === mainKey) { sc += 100; titleMatch = true; }
    else if (origKey && ht === origKey) { sc += 100; titleMatch = true; }
    else if (mainKey && ht && mainKey.length >= 4 && (ht === mainKey || ht.indexOf(mainKey) !== -1 || mainKey.indexOf(ht) !== -1)) {
      sc += 55; titleMatch = true;
    } else if (origKey && ht && origKey.length >= 4 && (ht.indexOf(origKey) !== -1 || origKey.indexOf(ht) !== -1)) {
      sc += 55; titleMatch = true;
    }

    function sharedTokens(aKey, bKey) {
      var a = String(aKey || '').split(' ').filter(function (w) { return w.length > 2; });
      var b = String(bKey || '').split(' ').filter(function (w) { return w.length > 2; });
      var n = 0;
      for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) !== -1) n++;
      return n;
    }
    var sh = Math.max(sharedTokens(mainKey, ht), sharedTokens(origKey, ht), sharedTokens(mainKey, hs));
    if (sh > 0) { sc += sh * 15; titleMatch = true; }

    // slug tipo colony-a4fmlD
    if (mainKey && hs && (hs === mainKey || hs.indexOf(mainKey) === 0 || hs.indexOf(mainKey + ' ') === 0)) {
      sc += 25; titleMatch = true;
    }

    // Sin ninguna coincidencia de título → basura (Gintama ≠ Colony)
    if (!titleMatch) return -1000;

    var sid = String(hit.source_id || hit.source || '');
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
      var urlsTry = [base + '/?q=' + encodeURIComponent(queries[qi])];
      if (!isTv) {
        urlsTry.push(base + '/9/buscar?q=' + encodeURIComponent(queries[qi]));
        urlsTry.push(base + '/3/buscar?q=' + encodeURIComponent(queries[qi]));
      } else {
        urlsTry.push(base + '/4/buscar?q=' + encodeURIComponent(queries[qi]));
      }
      for (var ui = 0; ui < urlsTry.length; ui++) {
        try {
          var r = await fetch(urlsTry[ui], { headers: { Accept: 'application/json' } });
          if (!r.ok) continue;
          var data = await r.json();
          var results = data.results || data.resultados || [];
          if (typeof preferAnimeSource === 'function') results = preferAnimeSource(results);
          for (var ri = 0; ri < results.length; ri++) {
            var item = results[ri];
            if (!item) continue;
            var key = String(item.source_id || item.source || '') + '|' + String(item.slug || item.title || '');
            if (seenSlug[key]) continue;
            seenSlug[key] = 1;
            pool.push(item);
          }
        } catch (_) {}
      }
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
  var bestScore = scoreHit(best, mainKey, origKey, year, isTv);
  if (bestScore < 40) return null;
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


/** Similares desde el mismo source del worker (4 anime, 9/3 pelis-series, etc.) */
async function fetchWorkerSimilar(hit, type) {
  var base = typeof workerBaseUrl === 'function' ? workerBaseUrl() : 'https://moviezone.tvjz.workers.dev';
  var sid = String(
    (hit && (hit.source_id || hit.source)) ||
      (type === 'anime' ? '4' : typeof MZ_SOURCE !== 'undefined' ? MZ_SOURCE : '9')
  );
  if (sid === 'animeav1') sid = '4';
  if (sid === 'jkanime') sid = '5';
  if (sid === 'pelisplushd') sid = '3';
  if (sid === 'pelisplushd_bz') sid = '9';

  var title = (hit && (hit.title || hit.titulo || hit.nombre || hit.slug)) || '';
  var curSlug = String((hit && hit.slug) || '').toLowerCase();
  var q = String(title)
    .replace(/[:\-–—].*$/, '')
    .replace(/\(\s*\d{4}\s*\)/g, '')
    .trim();
  var words = q.split(/\s+/).filter(Boolean);
  if (words.length > 5) q = words.slice(0, 4).join(' ');

  var out = [];
  var seen = Object.create(null);

  function sameFamily(isid) {
    isid = String(isid || '');
    if (sid === '4' || sid === '5') {
      return isid === '4' || isid === '5' || isid === 'animeav1' || isid === 'jkanime' || !isid;
    }
    if (sid === '9' || sid === '3') {
      return isid === '9' || isid === '3' || isid === 'pelisplushd' || isid === 'pelisplushd_bz' || !isid;
    }
    return !isid || isid === sid;
  }

  async function addFrom(path) {
    try {
      var r = await fetch(base.replace(/\/$/, '') + path, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (!r.ok) return;
      var data = await r.json();
      var list =
        data.results ||
        data.resultados ||
        data.agregados ||
        data.recientes ||
        [];
      if (!Array.isArray(list)) return;
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        if (!it || !it.slug) continue;
        if (curSlug && String(it.slug).toLowerCase() === curSlug) continue;
        var isid = String(it.source_id || it.source || sid);
        if (!sameFamily(isid)) continue;
        var key = isid + '|' + String(it.slug).toLowerCase();
        if (seen[key]) continue;
        seen[key] = 1;
        if (!it.source_id) it.source_id = sid;
        out.push(it);
      }
    } catch (_) {}
  }

  if (q) {
    await addFrom('/' + sid + '/buscar?q=' + encodeURIComponent(q));
  }
  if (out.length < 8) {
    if (sid === '4' || sid === '5') {
      await addFrom('/4/home');
    } else if (type === 'movie') {
      await addFrom('/' + sid + '/peliculas?page=1');
      if (out.length < 6) await addFrom('/' + sid + '/peliculas?page=2');
    } else {
      await addFrom('/' + sid + '/series?page=1');
      if (out.length < 6) await addFrom('/' + sid + '/series?page=2');
    }
  }
  return out.slice(0, 14);
}

function rowWorkerSimilar(label, items) {
  items = (items || []).filter(function (x) {
    return x && x.slug;
  });
  if (!items.length) return '';
  var cards = items
    .map(function (it) {
      var title = it.title || it.titulo || it.nombre || it.slug || 'Sin título';
      var img = it.portada || it.poster || it.image || '';
      var year = it.year || it.anio || '';
      var sid = String(it.source_id || it.source || '');
      var tipo = String(it.type || it.tipo || '').toLowerCase();
      var isMovie = /peli|movie|film/.test(tipo);
      var page = isMovie ? 'detalle-pelicula.html' : 'detalle-serie.html';
      var href =
        typeof pageHref === 'function'
          ? pageHref(page, {
              slug: it.slug,
              source_id: sid || undefined,
              title: title,
              type: isMovie ? 'movie' : 'tv',
              portada: img || undefined,
              year: year || undefined
            })
          : '#';
      return (
        '<a class="card" href="' +
        esc(href) +
        '"><div class="im">' +
        (img
          ? '<img loading="lazy" src="' +
            esc(img) +
            '" alt="" onerror="this.style.opacity=.25">'
          : '') +
        '</div><b>' +
        esc(title) +
        '</b><small>' +
        esc(year ? String(year).slice(0, 4) : sid ? 'Fuente ' + sid : '') +
        '</small></a>'
      );
    })
    .join('');
  return (
    '<section class="row"><h2>' +
    esc(label || 'Títulos similares') +
    '</h2><div class="track">' +
    cards +
    '</div></section>'
  );
}




async function findYoutubeTrailer(type, tmdbId) {
  if (!tmdbId || typeof tmdb !== 'function') return null;
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
    var d0 = await mzFetchDetail({ slug: slug, type: type, source_id: sourceId });
    // Seguridad: total_episodios nunca debe quedar en 50 si full traía más
    if (d0 && d0.total_episodios != null) {
      d0.total_episodios = parseInt(d0.total_episodios, 10) || d0.total_episodios;
    }
    return d0;
  }
  var sid = String(sourceId || (typeof MZ_SOURCE !== 'undefined' ? MZ_SOURCE : '9'));
  var isAnime = sid === '4' || sid === 'animeav1' || sid === '5' || sid === 'jkanime' || type === 'anime';
  var kind;
  if (isAnime) {
    sid = sid === '5' || sid === 'jkanime' ? '5' : '4';
    kind = 'anime';
  } else {
    kind = type === 'tv' || type === 'anime' ? 'serie' : 'pelicula';
    if (isAnime) kind = 'anime';
  }
  var base = String(workerBaseUrl() || '').replace(/\/$/, '');
  // /b/ es rápido (basic + episodios). El detalle full a veces cuelga en animeav1.
  var pathB = '/' + sid + '/' + kind + '/b/' + encodeURIComponent(slug);
  var pathFull = '/' + sid + '/' + kind + '/' + encodeURIComponent(slug);

  function fetchWithTimeout(url, ms) {
    ms = ms || 12000;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () {
      try { if (ctrl) ctrl.abort(); } catch (_) {}
    }, ms);
    return fetch(url, {
      headers: { Accept: 'application/json' },
      signal: ctrl ? ctrl.signal : undefined,
      cache: 'no-store'
    })
      .then(function (r) {
        clearTimeout(timer);
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        if (data && data.success === false) return null;
        return data;
      })
      .catch(function () {
        clearTimeout(timer);
        return null;
      });
  }

  // 1) /b/ rápido (lista parcial)
  var basic = await fetchWithTimeout(base + pathB, 10000);
  // 2) Full siempre en anime (total_episodios real, sinopsis). En resto si falta meta.
  var full = null;
  var needFull =
    isAnime ||
    !basic ||
    !basic.descripcion ||
    !(basic.temporadas && basic.temporadas.length) ||
    (parseInt(basic.total_episodios, 10) || 0) < 60;
  if (needFull) {
    full = await fetchWithTimeout(base + pathFull, isAnime ? 15000 : 12000);
  }

  if (!basic && !full) throw new Error('No encontrado en el worker (' + sid + '/' + kind + '/' + slug + ')');

  var data = Object.assign({}, basic || {}, full || {});
  // total_episodios: quedarse con el mayor (full suele traer 1180; /b/ solo 50)
  var totB = parseInt(basic && basic.total_episodios, 10) || 0;
  var totF = parseInt(full && full.total_episodios, 10) || 0;
  if (totF || totB) data.total_episodios = Math.max(totB, totF);

  function listaLen(d) {
    var ts = (d && d.temporadas) || [];
    if (!ts.length) return 0;
    var L = ts[0].lista || ts[0].episodios || [];
    return Array.isArray(L) ? L.length : 0;
  }
  // Preferir la fuente con MÁS episodios en lista; si empatan, full (más meta)
  var lenB = listaLen(basic);
  var lenF = listaLen(full);
  if (lenF >= lenB && full && Array.isArray(full.temporadas) && full.temporadas.length) {
    data.temporadas = full.temporadas;
  } else if (basic && Array.isArray(basic.temporadas) && basic.temporadas.length) {
    data.temporadas = basic.temporadas;
  } else if (full && Array.isArray(full.temporadas)) {
    data.temporadas = full.temporadas;
  }

  if (basic && basic.url_vid) data.url_vid = basic.url_vid;
  if (basic && basic.url_extract && !data.url_extract) data.url_extract = basic.url_extract;
  if (full && full.url_extract && !data.url_extract) data.url_extract = full.url_extract;
  if (full && full.descripcion) data.descripcion = full.descripcion;
  else if (basic && basic.descripcion && !data.descripcion) data.descripcion = basic.descripcion;
  if (!data.titulo && data.title) data.titulo = data.title;
  if (!data.slug) data.slug = slug;
  if (!data.source_id) data.source_id = sid;
  // portada: preferir la que exista
  if (!data.portada && basic && basic.portada) data.portada = basic.portada;
  return data;
}


/** Carga episodios desde url_vid (/b/) del worker: titulo ES + back_img */
async function fetchWorkerEpisodesMap(hit, type) {
  var map = {};
  if (!hit || !hit.slug) return map;
  try {
    var sid = String(hit.source_id || hit.source || (typeof MZ_SOURCE !== 'undefined' ? MZ_SOURCE : '9'));
    var kind = type === 'movie' ? 'pelicula' : (sid === '4' || sid === '5' || type === 'anime' ? 'anime' : 'serie');
    if (sid === '4' || sid === 'animeav1') { sid = '4'; kind = 'anime'; }
    if (sid === '5' || sid === 'jkanime') { sid = '5'; kind = 'anime'; }
    var base = typeof workerBaseUrl === 'function' ? workerBaseUrl() : (typeof MZ_WORKER !== 'undefined' ? MZ_WORKER : 'https://moviezone.tvjz.workers.dev');
    var path = '/' + sid + '/' + kind + '/b/' + encodeURIComponent(hit.slug);
    var r = await fetch(base + path, { headers: { Accept: 'application/json' } });
    if (!r.ok) {
      path = '/' + sid + '/' + kind + '/' + encodeURIComponent(hit.slug);
      r = await fetch(base + path, { headers: { Accept: 'application/json' } });
    }
    if (!r.ok) return map;
    var data = await r.json();
    var temps = data.temporadas || [];
    for (var i = 0; i < temps.length; i++) {
      var lista = temps[i].lista || temps[i].episodios || [];
      if (!Array.isArray(lista)) continue;
      var sn = parseInt(temps[i].temporada != null ? temps[i].temporada : 1, 10);
      for (var j = 0; j < lista.length; j++) {
        var ep = lista[j];
        var en = parseInt(ep.episodio != null ? ep.episodio : ep.episode != null ? ep.episode : 0, 10);
        var key = sn + 'x' + en;
        map[key] = {
          titulo: ep.titulo || ep.name || ep.title || '',
          back_img: ep.back_img || ep.still || '',
          link: ep.link || ''
        };
      }
    }
  } catch (_) {}
  return map;
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
  try {
  var slug = params.slug;
  var sourceId = params.source_id || params.source || null;
  var titleHint = params.title || slug.replace(/-/g, ' ');
  var portadaHint = params.portada || '';

  $('#view').innerHTML = '<div class="load">Cargando detalle…</div>';
  try {
    if (typeof ensureTmdbReady === 'function') await ensureTmdbReady();
  } catch (_) {}
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
  
  var run =
    type === 'movie'
      ? data.duracion_texto || (data.duracion ? data.duracion + ' min' : '')
      : data.total_episodios
        ? data.total_episodios + ' episodios'
        : data.total_temporadas
          ? data.total_temporadas + ' temporadas'
          : '';

  var playHref =
    type === 'tv' || type === 'anime'
      ? workerPlayHref(hit, 'tv', null, 1, 1)
      : workerPlayHref(hit, 'movie', null);

  var tipoRaw = String(data.tipo || data.type || data.formato || type || '').toLowerCase();
  var isAnimeDetail =
    type === 'anime' ||
    /anime|ova|ona|especial/.test(tipoRaw) ||
    String(hit.source_id || '') === '4' ||
    String(hit.source_id || '') === '5';
  var tipoLabel = 'Serie';
  if (type === 'movie' && !isAnimeDetail) tipoLabel = 'Película';
  else if (/ova/.test(tipoRaw)) tipoLabel = 'OVA';
  else if (/ona/.test(tipoRaw)) tipoLabel = 'ONA';
  else if (/especial|special/.test(tipoRaw)) tipoLabel = 'Especial';
  else if (isAnimeDetail) tipoLabel = 'Anime';

  document.title = title + (isAnimeDetail ? ' — Anime' : ' — Kinox');

  var trailerKey = null;
  var tmdbIdForTrailer = null;
  var tmdbType = type === 'anime' || isAnimeDetail ? 'tv' : type;
  try {
    if (typeof resolveTmdbIdForTitle === 'function') {
      // Probar título completo y sin "II / 2nd Season" (TMDB suele unificar temporadas)
      var titleBase = String(title || '')
        .replace(/\s*[：:]\s*.*$/, '')
        .replace(/\s*(2nd|3rd|4th)\s*season.*$/i, '')
        .replace(/\s*season\s*\d+.*$/i, '')
        .replace(/\s*temporada\s*\d+.*$/i, '')
        .replace(/\s+\b(II|III|IV|2|3|4)\b\s*$/i, '')
        .trim();
      // Primero la serie base (Youjo Senki) para backdrop/tráiler/T2 eps
      var tryTitles = [];
      if (titleBase && titleBase.toLowerCase() !== String(title).toLowerCase()) {
        tryTitles.push(titleBase);
      }
      tryTitles.push(title);
      for (var ti = 0; ti < tryTitles.length && !tmdbIdForTrailer; ti++) {
        try {
          // Serie base (Youjo Senki) SIN año de la T2 (2026), si no TMDB no encuentra la T1
          var yTry = null;
          var qn = String(tryTitles[ti] || '').toLowerCase();
          var isBase =
            titleBase && qn === String(titleBase).toLowerCase();
          if (!isBase && year) yTry = year;
          tmdbIdForTrailer = await resolveTmdbIdForTitle(
            tryTitles[ti],
            tmdbType,
            yTry
          );
        } catch (_) {}
      }
      // Último intento: solo base sin año
      if (!tmdbIdForTrailer && titleBase) {
        try {
          tmdbIdForTrailer = await resolveTmdbIdForTitle(titleBase, tmdbType, null);
        } catch (_) {}
      }
      if (tmdbIdForTrailer) {
        try {
          var tr = await findYoutubeTrailer(tmdbType, tmdbIdForTrailer);
          if (tr && tr.key) trailerKey = tr.key;
        } catch (_) {}
        // Backdrop de la serie principal (T1)
        if (typeof tmdb === 'function') {
          try {
            var tx = await tmdb('/' + tmdbType + '/' + tmdbIdForTrailer, {
              append_to_response: 'videos'
            });
            if (tx && tx.backdrop_path) {
              backdrop =
                (typeof IMG !== 'undefined' ? IMG : 'https://image.tmdb.org/t/p/') +
                'original' +
                tx.backdrop_path;
            }
            if (!trailerKey && tx && tx.videos && tx.videos.results) {
              var vids = tx.videos.results;
              var hitV =
                vids.find(function (v) {
                  return v.site === 'YouTube' && v.type === 'Trailer' && v.key;
                }) ||
                vids.find(function (v) {
                  return v.site === 'YouTube' && v.key;
                });
              if (hitV) trailerKey = hitV.key;
            }
            // Videos en-US si no hay en es-MX
            if (!trailerKey) {
              try {
                var vEn = await tmdb('/' + tmdbType + '/' + tmdbIdForTrailer + '/videos', {
                  language: 'en-US'
                });
                var list = (vEn && vEn.results) || [];
                var hitEn =
                  list.find(function (v) {
                    return v.site === 'YouTube' && v.type === 'Trailer' && v.key;
                  }) ||
                  list.find(function (v) {
                    return v.site === 'YouTube' && v.key;
                  });
                if (hitEn) trailerKey = hitEn.key;
              } catch (_) {}
            }
            if (tx && tx.overview && (!overview || overview === 'Sin sinopsis.' || overview.length < 40)) {
              overview = tx.overview;
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


  // --- Arcos TMDB para anime largo (One Piece) ANTES del HTML ---
  var totalEpsWorker = parseInt(data.total_episodios, 10) || 0;
  var lista0pre = (temps[0] && (temps[0].lista || temps[0].episodios)) || [];
  var lista0LenPre = Array.isArray(lista0pre) ? lista0pre.length : 0;
  var tmdbArcos = null; // { tid, seasons, offsets, total }
  var wantArcos =
    isAnimeDetail &&
    temps.length <= 1 &&
    (totalEpsWorker > 60 || lista0LenPre >= 40 || totalEpsWorker > lista0LenPre + 10);
  if (wantArcos && typeof tmdb === 'function' && typeof resolveTmdbIdForTitle === 'function') {
    try {
      var baseTitleArc = String(title || '')
        .replace(/\s*[：:]\s*.*$/, '')
        .replace(/\s*(2nd|3rd|4th)\s*season.*$/i, '')
        .replace(/\s+\b(II|III|IV)\b\s*$/i, '')
        .trim();
      var tidArc = await resolveTmdbIdForTitle(baseTitleArc || title, 'tv', null);
      if (tidArc) {
        var tvArc = await tmdb('/tv/' + tidArc);
        var seasonsArc = (tvArc.seasons || []).filter(function (s) {
          return s && s.season_number > 0;
        });
        if (seasonsArc.length) {
          // Total real = worker (1180). TMDB a veces infla con especiales/OVAs.
          var workerTotal = totalEpsWorker || 0;
          var tmdbNum = parseInt(tvArc.number_of_episodes, 10) || 0;
          // Si el worker da total, manda; si no, TMDB
          var realTotal = workerTotal > 0 ? workerTotal : tmdbNum;

          var offsetsArc = {};
          var accArc = 0;
          var seasonsFit = [];
          seasonsArc.forEach(function (s) {
            if (realTotal > 0 && accArc >= realTotal) return;
            var cnt = parseInt(s.episode_count, 10) || 0;
            if (cnt <= 0) return;
            // Recortar última temporada al total del worker
            if (realTotal > 0 && accArc + cnt > realTotal) {
              cnt = realTotal - accArc;
            }
            if (cnt <= 0) return;
            offsetsArc[s.season_number] = accArc;
            seasonsFit.push(
              Object.assign({}, s, { episode_count: cnt })
            );
            accArc += cnt;
          });

          if (seasonsFit.length) {
            tmdbArcos = {
              tid: tidArc,
              seasons: seasonsFit,
              offsets: offsetsArc,
              total: realTotal > 0 ? realTotal : accArc
            };
            if (tmdbArcos.total && (!run || /episodios/.test(run))) {
              run = tmdbArcos.total + ' episodios';
            }
          }
        }
      }
    } catch (eArc) {
      console.warn('tmdb arcos preload', eArc);
    }
  }

  // Backdrop: TMDB de la serie base (T1) preferido
  var bdUrl = backdrop || '';

  if (bdUrl && bdUrl.indexOf('/t/p/') !== -1) {
    if (bdUrl.indexOf('original') === -1 && bdUrl.indexOf('w1280') === -1) {
      bdUrl = bdUrl.replace(/\/t\/p\/\w+\//, '/t/p/original/');
    }
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
    '<div class="tags" style="margin:8px 0 4px"><span>' +
    esc(tipoLabel) +
    '</span></div>' +
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
    (type === 'tv' || type === 'anime' ? '▶ Comenzar E1' : '▶ Reproducir') +
    '</a>' +
    (trailerKey
      ? '<button type="button" class="btn" id="btnTrailer">Ver tráiler</button>'
      : '') +
    '</div>' +
    '<div class="btns-fav">' +
    '<button id="favBtn" type="button" class="btn alt">+ Mi lista</button>' +
    '</div>' +
    '<p style="color:var(--mute);font-size:.85rem;margin-top:8px">Fuente: ' +
    esc(hit.source || hit.source_id || '') +
    ' · ' +
    esc(hit.slug || '') +
    '</p></div></div></section>' +
    (((type === 'tv' || type === 'anime') && (temps.length || (tmdbArcos && tmdbArcos.seasons && tmdbArcos.seasons.length)))
      ? '<section class="seasons"><h2>Temporadas y capítulos</h2>' +
        (tmdbArcos
          ? '<p class="mz-eps-total" style="color:var(--mute);font-size:.85rem;margin:0 0 12px">' +
            esc(
              (totalEpsWorker
                ? totalEpsWorker + ' episodios en la fuente'
                : tmdbArcos.total
                  ? tmdbArcos.total + ' episodios'
                  : '') 
            ) +
            '</p>'
          : '') +
        '<select id="sel">' +
        (tmdbArcos && tmdbArcos.seasons
          ? tmdbArcos.seasons
              .map(function (s, i) {
                var n = s.season_number;
                var cnt = s.episode_count || 0;
                var label = (s.name || ('Temporada ' + n)) + (cnt ? ' (' + cnt + ' eps)' : '');
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
              .join('')
          : temps
              .map(function (t, i) {
                var n = t.temporada != null ? t.temporada : i + 1;
                var epCount =
                  t.episodios != null && !Array.isArray(t.episodios)
                    ? t.episodios
                    : Array.isArray(t.lista)
                      ? t.lista.length
                      : 0;
                var label;
                if (temps.length === 1 && isAnimeDetail) {
                  var gs = guessSeasonFromTitle(title);
                  label = gs > 1 ? 'Temporada ' + gs : 'Episodios';
                  if (epCount) label += ' (' + epCount + ')';
                } else {
                  label = 'Temporada ' + n;
                  if (epCount) label += ' (' + epCount + ' eps)';
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
              .join('')) +
        '</select><div id="eps"></div></section>'
      : '');

    if (trailerKey && typeof openTrailerModal === 'function') {
    var btW = document.getElementById('btnTrailer');
    if (btW) btW.onclick = function () { openTrailerModal(trailerKey); };
  }

  // Favoritos (slug+source; no depende de id TMDB)
  var favItem = {
    id: 'w-' + String(hit.source_id || sourceId || 'x') + '-' + String(hit.slug || slug),
    type: isAnimeDetail ? 'anime' : type === 'movie' ? 'movie' : 'tv',
    title: title,
    poster: portada || null,
    slug: hit.slug || slug,
    source_id: hit.source_id || sourceId,
    year: year || ''
  };
  var favBtnEl = document.getElementById('favBtn');
  if (favBtnEl && typeof favs === 'function') {
    var favOn = favs().some(function (f) {
      return f && (f.id === favItem.id || (f.slug && f.slug === favItem.slug && String(f.source_id) === String(favItem.source_id)));
    });
    favBtnEl.textContent = favOn ? '✓ En mi lista' : '+ Mi lista';
    favBtnEl.classList.toggle('on', favOn);
    favBtnEl.onclick = function () {
      var a = favs();
      var has = a.some(function (f) {
        return f && (f.id === favItem.id || (f.slug && f.slug === favItem.slug && String(f.source_id) === String(favItem.source_id)));
      });
      a = has
        ? a.filter(function (f) {
            return !(
              f &&
              (f.id === favItem.id ||
                (f.slug && f.slug === favItem.slug && String(f.source_id) === String(favItem.source_id)))
            );
          })
        : [favItem].concat(a);
      store.set(pk('favs'), a);
      favBtnEl.textContent = has ? '+ Mi lista' : '✓ En mi lista';
      favBtnEl.classList.toggle('on', !has);
    };
  }

  // Similares desde la misma fuente del worker
  try {
    var simW = await fetchWorkerSimilar(hit, type === 'anime' ? 'anime' : type);
    var htmlSimW = rowWorkerSimilar('Títulos similares', simW);
    if (htmlSimW) {
      var viewW = document.getElementById('view');
      if (viewW) viewW.insertAdjacentHTML('beforeend', htmlSimW);
    }
  } catch (eSim) {
    console.warn('similares worker detail', eSim);
  }




  // Bind arcos TMDB: títulos/sinopsis TMDB + links worker /1/{abs} hasta total fuente
  var usedTmdbArcos = false;
  var lista0 = (temps[0] && (temps[0].lista || temps[0].episodios)) || [];
  if (tmdbArcos && tmdbArcos.seasons && tmdbArcos.seasons.length) {
    usedTmdbArcos = true;
    var sel = document.getElementById('sel');
    var epsBox = document.getElementById('eps');
    var tidOP = tmdbArcos.tid;
    var offsets = tmdbArcos.offsets || {};
    var maxEp =
      parseInt(tmdbArcos.total, 10) ||
      parseInt(totalEpsWorker, 10) ||
      0;
    var workerByAbs = Object.create(null);
    (lista0 || []).forEach(function (e) {
      var num = parseInt(e.episodio != null ? e.episodio : e.episode, 10);
      if (num) workerByAbs[num] = e;
    });

    var renderArco = async function () {
      if (!sel || !epsBox) return;
      var sn = parseInt(sel.value, 10) || 1;
      var off = offsets[sn] != null ? offsets[sn] : 0;
      var seasonMeta = (tmdbArcos.seasons || []).find(function (s) {
        return parseInt(s.season_number, 10) === sn;
      });
      var cnt =
        (seasonMeta && parseInt(seasonMeta.episode_count, 10)) ||
        0;
      // Rango absoluto de este arco, limitado al total del worker
      var absStart = off + 1;
      var absEnd = cnt > 0 ? off + cnt : absStart;
      if (maxEp > 0) {
        absEnd = Math.min(absEnd, maxEp);
      }
      if (absStart < 1) absStart = 1;
      if (absEnd < absStart) {
        epsBox.innerHTML =
          '<p style="color:var(--mute)">Sin episodios en este arco (fuera del total de la fuente).</p>';
        return;
      }

      epsBox.innerHTML = '<div class="load">Cargando episodios…</div>';

      // Datos TMDB por número DENTRO de la temporada (1..cnt)
      var byRel = {};
      try {
        var seasonData = await tmdb('/tv/' + tidOP + '/season/' + sn);
        (seasonData.episodes || []).forEach(function (ep) {
          byRel[ep.episode_number] = ep;
        });
        try {
          var sEn = await tmdb('/tv/' + tidOP + '/season/' + sn, {
            language: 'en-US'
          });
          (sEn.episodes || []).forEach(function (ep) {
            var prev = byRel[ep.episode_number] || {};
            byRel[ep.episode_number] = Object.assign({}, prev, {
              episode_number: ep.episode_number,
              name:
                prev.name && !isGenericEpName(prev.name)
                  ? prev.name
                  : ep.name || prev.name,
              overview: prev.overview || ep.overview,
              still_path: prev.still_path || ep.still_path,
              runtime: prev.runtime || ep.runtime
            });
          });
        } catch (_) {}
      } catch (errTmdb) {
        console.warn('season tmdb', errTmdb);
      }

      var parts = [];
      for (var abs = absStart; abs <= absEnd; abs++) {
        var rel = abs - off; // 1-based dentro del arco
        var ep = byRel[rel] || {};
        var w = workerByAbs[abs] || {};
        var name = ep.name || w.titulo || w.name || '';
        if (isGenericEpName(name)) name = 'Episodio ' + abs;
        var overview = ep.overview || w.descripcion || w.overview || '';
        var still =
          (ep.still_path
            ? (typeof IMG !== 'undefined' ? IMG : 'https://image.tmdb.org/t/p/') +
              'w300' +
              ep.still_path
            : '') ||
          w.back_img ||
          w.still ||
          '';
        // Worker: siempre temporada 1 + número absoluto (/1/51, /1/52…)
        var href = workerPlayHref(
          Object.assign({}, hit || {}, {
            source_id: (data && data.source_id) || sourceId
          }),
          'tv',
          tidOP,
          1,
          abs
        );
        parts.push(
          '<a class="ep" href="' +
            href +
            '">' +
            (still
              ? '<img loading="lazy" src="' + esc(still) + '" alt="">'
              : '<div class="ph"></div>') +
            '<div><b>E' +
            abs +
            ' — ' +
            esc(name) +
            '</b><small>' +
            esc((overview || 'Sin sinopsis.').slice(0, 220)) +
            '</small></div></a>'
        );
      }
      epsBox.innerHTML =
        parts.length
          ? parts.join('')
          : '<p style="color:var(--mute)">Sin episodios en este arco.</p>';
    };

    if (sel) {
      sel.onchange = function () {
        renderArco();
      };
      renderArco();
    }
  }

if ((type === 'tv' || type === 'anime') && temps.length && !usedTmdbArcos) {
    var tmdbIdWorker = null;
    if (typeof resolveTmdbIdForTitle === 'function') {
      (async function () {
        try {
          var tmdbKind = type === 'anime' ? 'tv' : type;
          var baseForTmdb = String(title || '')
            .replace(/\s*[：:]\s*.*$/, '')
            .replace(/\s*(2nd|3rd|4th)\s*season.*$/i, '')
            .replace(/\s*season\s*\d+.*$/i, '')
            .replace(/\s*temporada\s*\d+.*$/i, '')
            .replace(/\s+\b(II|III|IV|2|3|4)\b\s*$/i, '')
            .trim();
          var tries = [];
          if (baseForTmdb && baseForTmdb.toLowerCase() !== String(title).toLowerCase()) tries.push(baseForTmdb);
          tries.push(title);
          var tid = null;
          for (var ri = 0; ri < tries.length && !tid; ri++) {
            tid = await resolveTmdbIdForTitle(tries[ri], tmdbKind, null);
          }
          tmdbIdWorker = tid;
        } catch (_) {}
        renderEps();
      })();
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
      if (!tid && typeof resolveTmdbIdForTitle === 'function') {
        try {
          var tmdbKind = type === 'anime' ? 'tv' : type;
          var baseForTmdb = String(title || '')
            .replace(/\s*[：:]\s*.*$/, '')
            .replace(/\s*(2nd|3rd|4th)\s*season.*$/i, '')
            .replace(/\s*season\s*\d+.*$/i, '')
            .replace(/\s*temporada\s*\d+.*$/i, '')
            .replace(/\s+\b(II|III|IV|2|3|4)\b\s*$/i, '')
            .trim();
          // Serie base primero (Youjo Senki), luego título completo
          var tries = [];
          if (baseForTmdb && baseForTmdb.toLowerCase() !== String(title).toLowerCase()) {
            tries.push(baseForTmdb);
          }
          tries.push(title);
          for (var ri = 0; ri < tries.length && !tid; ri++) {
            tid = await resolveTmdbIdForTitle(tries[ri], tmdbKind, null);
          }
          tmdbIdWorker = tid;
        } catch (_) {}
      }
      if (tid && typeof tmdb === 'function') {
        try {
          // Worker: 1 temporada en slug "ii" → pedir temporada real a TMDB
          var tmdbSeasonNum = want;
          if (temps.length === 1) {
            var guessed = guessSeasonFromTitle(title);
            if (guessed > 1) tmdbSeasonNum = guessed;
          }
          var s = await tmdb('/tv/' + tid + '/season/' + tmdbSeasonNum);
          (s.episodes || []).forEach(function (ep) {
            tmdbByEp[ep.episode_number] = ep;
          });
          var missing = (s.episodes || []).some(function (ep) {
            return isGenericEpName(ep.name) || !ep.overview;
          });
          if (missing) {
            try {
              var sEn = await tmdb('/tv/' + tid + '/season/' + tmdbSeasonNum, { language: 'en-US' });
              (sEn.episodes || []).forEach(function (ep) {
                var prev = tmdbByEp[ep.episode_number] || {};
                tmdbByEp[ep.episode_number] = Object.assign({}, prev, {
                  // Guardar EN aparte; no forzar inglés sobre es genérico aquí
                  name: prev.name || ep.name,
                  name_en: ep.name || prev.name_en,
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
              // Prioridad: título del WORKER (español) > TMDB > genérico. Nunca pisar worker con inglés.
              var name = '';
              if (e.titulo && String(e.titulo).trim()) name = String(e.titulo).trim();
              else if (e.name && String(e.name).trim()) name = String(e.name).trim();
              else if (e.title && String(e.title).trim()) name = String(e.title).trim();
              if (isGenericEpName(name) && tm.name && !isGenericEpName(tm.name)) name = tm.name;
              if (isGenericEpName(name) && tm.name_en && !isGenericEpName(tm.name_en)) name = tm.name_en;
              if (isGenericEpName(name)) name = 'Episodio ' + en;
              // Solo forzar worker si el título es real (no "Episodio 1")
              if (e.titulo && !isGenericEpName(e.titulo)) name = e.titulo;
              // Si worker trae genérico y TMDB tiene nombre, usar TMDB
              if (isGenericEpName(name) && tm.name && !isGenericEpName(tm.name)) name = tm.name;
              if (isGenericEpName(name) && tm.name_en && !isGenericEpName(tm.name_en)) name = tm.name_en;
              var overview = e.descripcion || e.overview || tm.overview || '';
              // Anime worker: preferir back_img de la fuente; si no, still TMDB
              var stillWorker = e.back_img || e.still || e.image || '';
              var stillTmdb = tm.still_path ? IMG + 'w300' + tm.still_path : '';
              var still = isAnimeDetail
                ? stillWorker || stillTmdb
                : stillTmdb || stillWorker;
              // Repro: temporada del WORKER (slug aparte). Etiqueta: T real si se puede inferir
              var snPlay = sn;
              var snLabel = sn;
              if (temps.length === 1 && isAnimeDetail) {
                var gLab = guessSeasonFromTitle(title);
                if (gLab > 1) snLabel = gLab;
              }
              var href = workerPlayHref(
                Object.assign({}, hit || {}, { source_id: (data && data.source_id) || sourceId }),
                'tv',
                tid || null,
                snPlay,
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
                snLabel +
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
  } catch (e) {
    console.error('loadDetailFromWorker', e);
    var msg = (e && e.message) || String(e);
    $('#view').innerHTML =
      '<div class="load">No se pudo cargar el detalle.<br>' +
      esc(msg) +
      '<br><a class="btn" href="javascript:history.back()" style="margin-top:12px">Volver</a></div>';
  }
}

async function loadDetail(type) {
  mzSetDetailChrome(true);
  try {
    var params = new URL(location.href).searchParams;
    var id = params.get('id');
    var slug = params.get('slug');
    var sourceIdParam = params.get('source_id') || params.get('source') || null;

    // type/source de la URL mandan sobre loadDetail('tv')
    var urlType = String(params.get('type') || type || '').toLowerCase();
    var sidP = String(sourceIdParam || '').toLowerCase();
    if (
      urlType === 'anime' ||
      sidP === '4' ||
      sidP === '5' ||
      sidP === 'animeav1' ||
      sidP === 'jkanime'
    ) {
      type = 'anime';
      if (!sourceIdParam) {
        sourceIdParam = sidP === '5' || sidP === 'jkanime' ? '5' : '4';
      } else if (sidP === 'animeav1') {
        sourceIdParam = '4';
      } else if (sidP === 'jkanime') {
        sourceIdParam = '5';
      }
    }

    // Anime del worker: ficha worker (no detalle serie TMDB)
    if (type === 'anime' && slug) {
      return await loadDetailFromWorker('anime', {
        slug: slug,
        source_id: sourceIdParam || '4',
        title: params.get('title'),
        portada: params.get('portada')
      });
    }

    // Solo slug: intentar resolver id TMDB y usar la misma UI que /detalle-serie?id=…
    if (!id && slug) {
      var titleHint = params.get('title') || String(slug).replace(/-/g, ' ');
      var yearHint = params.get('year') || '';
      if (typeof resolveTmdbIdForTitle === 'function') {
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

    // Proxy Vercel: no pedir key al usuario
    if (!KEY) {
      try {
        if (typeof ensureTmdbReady === 'function') await ensureTmdbReady();
      } catch (_) {}
    }
    if (!KEY) {
      // Último intento: una llamada al proxy marca KEY=__server__
      try {
        if (typeof tmdb === 'function') await tmdb('/configuration', {});
      } catch (_) {}
    }
    if (!KEY) throw Error('TMDB no disponible (revisa /api/tmdb en Vercel)');
    if (!id) throw Error('Falta el ID del título');
    var x = await tmdb('/' + type + '/' + id, { append_to_response: 'videos,watch/providers' });
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
      '</div>' +
      '<div class="btns-fav">' +
      '<button id="favBtn" type="button" class="btn alt ' +
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
      '' // similares worker se agregan abajo;

    $('#favBtn').onclick = function () {
      var a = favs();
      var has = a.some(function (f) { return f.id === it.id && f.type === type; });
      a = has ? a.filter(function (f) { return !(f.id === it.id && f.type === type); }) : [it].concat(a);
      store.set(pk('favs'), a);
      $('#favBtn').textContent = has ? '+ Mi lista' : '✓ En mi lista';
      $('#favBtn').classList.toggle('on', !has);
    };

    // Títulos similares: misma fuente del worker (no TMDB)
    (async function () {
      try {
        var baseHit = hit || {
          title: it.title,
          slug: (typeof slugify === 'function' ? slugify(it.title) : ''),
          source_id: sourceIdParam || (type === 'anime' ? '4' : (typeof MZ_SOURCE !== 'undefined' ? MZ_SOURCE : '9'))
        };
        if (!baseHit.slug && params.get('slug')) baseHit.slug = params.get('slug');
        if (!baseHit.source_id && params.get('source_id')) baseHit.source_id = params.get('source_id');
        var sim = await fetchWorkerSimilar(baseHit, type === 'anime' ? 'anime' : type);
        var htmlSim = rowWorkerSimilar('Títulos similares', sim);
        if (htmlSim) {
          var view = document.getElementById('view');
          if (view) view.insertAdjacentHTML('beforeend', htmlSim);
        }
      } catch (err) {
        console.warn('similares worker', err);
      }
    })();

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
          return isGenericEpName(e.name) || !e.overview;
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
                name: isGenericEpName(e.name) ? (m.name || e.name) : e.name,
                overview: e.overview || m.overview,
                still_path: e.still_path || m.still_path,
                runtime: e.runtime || m.runtime
              });
            });
          } catch (_) {}
        }
        // Títulos ES desde url_vid del worker
        var wMap = {};
        try {
          wMap = await fetchWorkerEpisodesMap(hit, type);
        } catch (_) {}
        $('#eps').innerHTML = eps
          .map(function (e) {
            var href = workerPlayHref(hit, 'tv', id, e.season_number, e.episode_number);
            var wk = wMap[e.season_number + 'x' + e.episode_number] || {};
            var epName = wk.titulo || e.name || ('Episodio ' + e.episode_number);
            var still = wk.back_img || (e.still_path ? IMG + 'w300' + e.still_path : '');
            return (
              '<a class="ep" href="' +
              href +
              '">' +
              (still
                ? '<img loading="lazy" src="' + esc(still) + '" alt="">'
                : '<div class="ph"></div>') +
              '<div><b>T' +
              e.season_number +
              ' E' +
              e.episode_number +
              ' — ' +
              esc(epName) +
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
