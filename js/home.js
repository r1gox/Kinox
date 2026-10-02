/**
 * Inicio Kinox — filas desde el Worker (catálogo real), no recomendaciones TMDB sueltas.
 * Así solo se muestran títulos que existen en la API.
 */
(async () => {
  try {
    if (typeof ensureTmdbReady === "function") {
      try { await ensureTmdbReady(); } catch (_) {}
    }

    var WORKER =
      (typeof MZ_WORKER !== "undefined" && MZ_WORKER) ||
      (typeof MZ_SEARCH !== "undefined" && MZ_SEARCH) ||
      "https://moviezone.tvjz.workers.dev";
    var SID =
      (typeof MZ_SOURCE !== "undefined" && String(MZ_SOURCE)) ||
      (typeof store !== "undefined" && store.get && store.get("mz_source", null)) ||
      "9";

    function workerGet(path) {
      var url = path.indexOf("http") === 0 ? path : WORKER.replace(/\/$/, "") + path;
      return fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "KinoxHome/1.0" },
        cache: "no-store",
      }).then(function (r) {
        if (!r.ok) throw new Error("Worker " + r.status);
        return r.json();
      });
    }

    function pickList(data) {
      if (!data) return [];
      if (Array.isArray(data.results)) return data.results;
      if (Array.isArray(data.resultados)) return data.resultados;
      if (Array.isArray(data.agregados)) return data.agregados;
      if (Array.isArray(data.recientes)) return data.recientes;
      if (Array.isArray(data.estrenos)) return data.estrenos;
      return [];
    }

    function isMovieItem(it) {
      var t = String((it && (it.type || it.tipo)) || "").toLowerCase();
      return /peli|movie|film/.test(t);
    }
    function isSeriesItem(it) {
      var t = String((it && (it.type || it.tipo)) || "").toLowerCase();
      return /serie|tv|dorama/.test(t);
    }
    function isAnimeItem(it) {
      var t = String((it && (it.type || it.tipo)) || "").toLowerCase();
      var sid = String((it && (it.source_id || it.source)) || "");
      return /anime|ova|ona/.test(t) || sid === "4" || sid === "5";
    }

    function detailHrefWorker(it) {
      var slug = it.slug || "";
      var sid = String(it.source_id || it.source || SID);
      var title = it.title || it.titulo || it.nombre || slug;
      var movie = isMovieItem(it) && !isAnimeItem(it);
      // anime → detalle serie (misma ficha series/anime en Kinox)
      var page = movie ? "detalle-pelicula.html" : "detalle-serie.html";
      var q = {
        slug: slug,
        source_id: sid,
        title: title,
        type: movie ? "movie" : "tv",
        portada: it.portada || it.poster || "",
        year: it.year || it.anio || "",
      };
      if (typeof pageHref === "function") return pageHref(page, q);
      var ps = new URLSearchParams();
      Object.keys(q).forEach(function (k) {
        if (q[k] != null && q[k] !== "") ps.set(k, q[k]);
      });
      return "/pages/" + page + "?" + ps.toString();
    }

    function cardWorker(it) {
      var title = it.title || it.titulo || it.nombre || it.slug || "Sin título";
      var img = it.portada || it.poster || it.image || it.back_img || "";
      var year = it.year || it.anio || "";
      var tipo = String(it.type || it.tipo || "").trim() || (isMovieItem(it) ? "Película" : "Serie");
      var href = detailHrefWorker(it);
      var rating = it.rating_tmdb != null ? it.rating_tmdb : it.rating;
      var badge =
        rating != null && !isNaN(Number(rating)) && Number(rating) > 0
          ? '<span class="badge">★ ' + Number(rating).toFixed(1) + "</span>"
          : "";
      return (
        '<a class="card" href="' +
        esc(href) +
        '"><div class="im">' +
        (img
          ? '<img loading="lazy" src="' + esc(img) + '" alt="" onerror="this.style.opacity=.25">'
          : "") +
        badge +
        "</div><b>" +
        esc(title) +
        "</b><small>" +
        esc(tipo) +
        (year ? " · " + esc(String(year).slice(0, 4)) : "") +
        "</small></a>"
      );
    }

    function rowWorker(title, items) {
      items = (items || []).filter(function (x) {
        return x && (x.slug || x.title || x.titulo);
      });
      if (!items.length) return "";
      return (
        '<section class="row"><h2>' +
        esc(title) +
        '</h2><div class="track">' +
        items.slice(0, 18).map(cardWorker).join("") +
        "</div></section>"
      );
    }

    // Cargar en paralelo lo que SÍ tiene el worker
    var settled = await Promise.allSettled([
      workerGet("/" + SID + "/peliculas?page=1"),
      workerGet("/" + SID + "/series?page=1"),
      workerGet("/4/home"),
      // fallback fuente 3 si 9 falla o viene vacío
      workerGet("/3/peliculas?page=1"),
      workerGet("/3/series?page=1"),
    ]);

    function ok(i) {
      return settled[i].status === "fulfilled" ? settled[i].value : null;
    }

    var pelis = pickList(ok(0));
    var series = pickList(ok(1));
    var animeHome = ok(2) || {};
    var animeAgregados = Array.isArray(animeHome.agregados) ? animeHome.agregados : [];
    var animeRecientes = Array.isArray(animeHome.recientes) ? animeHome.recientes : [];

    if (!pelis.length) pelis = pickList(ok(3));
    if (!series.length) series = pickList(ok(4));

    // Mezcla para hero: priorizar ítems con portada del catálogo
    var pool = []
      .concat(pelis.slice(0, 8))
      .concat(series.slice(0, 6))
      .concat(animeAgregados.slice(0, 4))
      .filter(function (x) {
        return x && (x.portada || x.poster);
      });
    if (!pool.length) pool = pelis.concat(series).concat(animeAgregados).slice(0, 5);

    var heroItem = pool[Math.floor(Math.random() * Math.max(pool.length, 1))] || pool[0] || null;
    var heroBg = heroItem
      ? heroItem.backdrop || heroItem.portada || heroItem.poster || ""
      : "";
    var heroTitle = heroItem
      ? heroItem.title || heroItem.titulo || heroItem.nombre || "Kinox"
      : "Kinox";
    var heroYear = heroItem ? String(heroItem.year || heroItem.anio || "").slice(0, 4) : "";
    var heroHref = heroItem ? detailHrefWorker(heroItem) : appLink("/peliculas");
    var heroOverview =
      (heroItem && (heroItem.descripcion || heroItem.overview || heroItem.sinopsis)) ||
      "Títulos disponibles en el catálogo.";

    // Intentar backdrop TMDB solo para el hero (opcional, no bloquea)
    if (KEY && heroItem && typeof tmdb === "function") {
      try {
        var q = heroItem.title || heroItem.titulo || "";
        var kind = isMovieItem(heroItem) && !isAnimeItem(heroItem) ? "movie" : "tv";
        if (q) {
          var sr = await tmdb("/search/" + kind, { query: q });
          var hit = (sr.results || [])[0];
          if (hit && hit.backdrop_path) {
            heroBg = (typeof IMG !== "undefined" ? IMG : "https://image.tmdb.org/t/p/") + "original" + hit.backdrop_path;
          }
          if (hit && hit.overview && (!heroOverview || heroOverview === "Títulos disponibles en el catálogo.")) {
            heroOverview = hit.overview;
          }
        }
      } catch (_) {}
    }

    // Filas locales (historial / favoritos) siguen con card TMDB si tienen id
    var cont = typeof hist === "function" ? hist().slice(0, 15) : [];
    var lista = typeof favs === "function" ? favs() : [];

    var html = "";
    html +=
      '<section class="hero" style="background-image:url(' +
      esc(heroBg) +
      ')"><div><small>EN EL CATÁLOGO</small><h1>' +
      esc(heroTitle) +
      "</h1><div class=\"meta\">" +
      (heroYear ? esc(heroYear) + " · " : "") +
      "Disponible</div><p>" +
      esc(String(heroOverview).slice(0, 220)) +
      '</p><a class="btn" href="' +
      esc(heroHref) +
      '">Ver ahora</a><a class="btn alt" href="' +
      esc(heroHref) +
      '">Más información</a></div></section>';

    if (typeof rowHtml === "function" && cont.length) {
      html += rowHtml("Continuar viendo", cont);
    }
    if (typeof rowHtml === "function" && lista.length) {
      html += rowHtml("Mi lista", lista);
    }

    // Solo catálogo real del worker
    html += rowWorker("Películas del catálogo", pelis);
    html += rowWorker("Series del catálogo", series);
    if (animeAgregados.length) {
      html += rowWorker("Anime recién agregados", animeAgregados);
    }
    if (animeRecientes.length) {
      // recientes suelen ser episodios; enlazar al anime (slug)
      html += rowWorker("Episodios recientes (anime)", animeRecientes);
    }

    // Segunda página de pelis/series como “más” (también del worker)
    try {
      var moreP = await workerGet("/" + SID + "/peliculas?page=2");
      var moreS = await workerGet("/" + SID + "/series?page=2");
      var mp = pickList(moreP);
      var ms = pickList(moreS);
      if (mp.length) html += rowWorker("Más películas", mp);
      if (ms.length) html += rowWorker("Más series", ms);
    } catch (_) {}

    if (!pelis.length && !series.length && !animeAgregados.length) {
      html +=
        '<div class="load">No se pudo cargar el catálogo del worker. Revisa la API.</div>';
    }

    $("#view").innerHTML = html;
  } catch (e) {
    $("#view").innerHTML =
      '<div class="load">' + esc(e.message || String(e)) + "</div>";
  }
})();
