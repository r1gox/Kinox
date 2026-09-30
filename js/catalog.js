/**
 * Catálogo Películas / Series — estilo MovieZone
 * - Listado/búsqueda desde worker
 * - TMDB rellena rating (y portada si falta) sin bloquear el listado
 */
(function () {
  var WORKER =
    (typeof MZ_WORKER !== "undefined" && MZ_WORKER) ||
    (typeof MZ_SEARCH !== "undefined" && MZ_SEARCH) ||
    "https://moviezone.tvjz.workers.dev";

  function sourceId() {
    var s =
      (typeof MZ_SOURCE !== "undefined" && MZ_SOURCE) ||
      (typeof store !== "undefined" && store.get && store.get("mz_source", null)) ||
      "9";
    return String(s);
  }

  function workerGet(path) {
    var url = path.indexOf("http") === 0 ? path : WORKER.replace(/\/$/, "") + path;
    return fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" }).then(
      function (r) {
        if (!r.ok) throw new Error("Worker " + r.status);
        return r.json();
      }
    );
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c
      );
    });
  }

  function detailHref(item, kind) {
    var slug = item.slug || "";
    var sid = item.source_id || item.source || sourceId();
    var title = item.title || item.titulo || item.nombre || slug;
    var isMovie =
      kind === "peliculas" ||
      /peli|movie|film/i.test(String(item.type || item.tipo || ""));
    var page = isMovie ? "detalle-pelicula.html" : "detalle-serie.html";
    var q = {
      slug: slug,
      source_id: String(sid),
      title: title,
      type: isMovie ? "movie" : "tv",
      portada: item.portada || item.poster || "",
      year: item.year || item.anio || "",
    };
    if (typeof pageHref === "function") return pageHref(page, q);
    var ps = new URLSearchParams();
    Object.keys(q).forEach(function (k) {
      if (q[k] != null && q[k] !== "") ps.set(k, q[k]);
    });
    return "../pages/" + page + "?" + ps.toString();
  }

  function ratingHtml(item) {
    var r = item.rating_tmdb != null ? item.rating_tmdb : item.rating;
    if (r == null || r === "" || isNaN(Number(r))) return "";
    var n = Number(r);
    if (n <= 0) return "";
    return '<span class="r">★ ' + n.toFixed(1) + "</span>";
  }

  function cardWorker(item, kind, cardId) {
    var title = item.title || item.titulo || item.nombre || item.slug || "Sin título";
    var img = item.portada || item.poster || item.image || "";
    var year = item.year || item.anio || "";
    var tipo = item.type || item.tipo || (kind === "peliculas" ? "Película" : "Serie");
    var href = detailHref(item, kind);
    var sid = item.source_id || sourceId();
    var idAttr = cardId ? ' data-card="' + esc(cardId) + '"' : "";
    return (
      '<a class="card"' +
      idAttr +
      ' href="' +
      esc(href) +
      '">' +
      '<div class="im">' +
      (img
        ? '<img loading="lazy" src="' + esc(img) + '" alt="" onerror="this.style.opacity=.25">'
        : "") +
      "</div>" +
      (sid ? '<span class="badge">' + esc(sid) + "</span>" : "") +
      "<b>" +
      esc(title) +
      "</b>" +
      "<small>" +
      esc(year) +
      (year ? " · " : "") +
      ratingHtml(item) +
      (ratingHtml(item) ? " · " : "") +
      esc(tipo) +
      "</small></a>"
    );
  }

  /** Actualiza el ★ en el DOM cuando llega TMDB */
  function patchCardRating(cardId, rating, posterUrl) {
    var el = document.querySelector('[data-card="' + cardId + '"]');
    if (!el) return;
    if (rating != null && !isNaN(Number(rating)) && Number(rating) > 0) {
      var small = el.querySelector("small");
      if (small) {
        var star = "★ " + Number(rating).toFixed(1);
        if (small.innerHTML.indexOf("★") === -1) {
          // insertar rating después del año si hay
          var txt = small.textContent || "";
          if (txt.indexOf("·") !== -1) {
            small.innerHTML = small.innerHTML.replace(
              " · ",
              ' · <span class="r">' + star + "</span> · "
            );
          } else {
            small.innerHTML =
              '<span class="r">' + star + "</span> · " + small.innerHTML;
          }
        }
      }
    }
    if (posterUrl) {
      var img = el.querySelector("img");
      if (img && (!img.getAttribute("src") || img.style.opacity === "0.25")) {
        img.src = posterUrl;
        img.style.opacity = "1";
      }
    }
  }

  var enrichCache = Object.create(null);

  function softEnrichTmdb(items, kind) {
    if (typeof KEY === "undefined" || !KEY) return;
    if (typeof tmdb !== "function") return;
    var type = kind === "peliculas" ? "movie" : "tv";
    var base = typeof IMG !== "undefined" ? IMG : "https://image.tmdb.org/t/p/";

    (items || []).forEach(function (it, idx) {
      var title = it.title || it.titulo;
      if (!title) return;
      var cardId = it._cardId;
      if (!cardId) return;

      var cacheKey = type + ":" + title.toLowerCase();
      if (enrichCache[cacheKey]) {
        var hit = enrichCache[cacheKey];
        it.rating_tmdb = hit.rating;
        if (hit.poster && !it.portada) it.portada = hit.poster;
        patchCardRating(cardId, hit.rating, hit.poster);
        return;
      }

      // limitar concurrencia suave: delay por índice
      setTimeout(function () {
        tmdb("/search/" + type, { query: title, include_adult: false })
          .then(function (res) {
            var hit = (res.results || [])[0];
            if (!hit) return;
            var rating = hit.vote_average != null ? Number(hit.vote_average) : null;
            var poster =
              hit.poster_path ? base + "w342" + hit.poster_path : null;
            enrichCache[cacheKey] = { rating: rating, poster: poster };
            if (rating != null) it.rating_tmdb = rating;
            if (poster && !it.portada) it.portada = poster;
            patchCardRating(cardId, rating, !it.portada ? poster : null);
          })
          .catch(function () {});
      }, Math.min(idx * 40, 400));
    });
  }

  async function loadCatalog(kind) {
    try {
      if (kind === "anime" && typeof loadAnimePage === "function") {
        return loadAnimePage();
      }
      if (kind === "anime") {
        location.href =
          typeof appLink === "function" ? appLink("/anime") : "anime.html";
        return;
      }
      if (kind === "jk") {
        if (typeof loadJkPage === "function") return loadJkPage();
        location.href = typeof appLink === "function" ? appLink("/jk") : "jk.html";
        return;
      }

      var isMovie = kind === "peliculas";
      var label = isMovie ? "Películas" : "Series";
      var pathKind = isMovie ? "peliculas" : "series";
      var sid = sourceId();

      var view = document.querySelector("#view");
      if (!view) return;

      view.innerHTML =
        '<section class="page">' +
        "<h1>" +
        esc(label) +
        "</h1>" +
        '<p style="color:var(--mute);font-size:.9rem;margin:-8px 0 14px">Fuente worker · id ' +
        esc(sid) +
        " · ★ calificación TMDB</p>" +
        '<form id="mz-cat-sf" class="search-form" style="display:flex;gap:8px;margin-bottom:16px;max-width:520px">' +
        '<input id="mz-cat-q" type="search" placeholder="Buscar en ' +
        esc(label) +
        '…" style="flex:1;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:11px">' +
        '<button class="btn" type="submit">Buscar</button></form>' +
        '<div class="grid" id="grid"></div>' +
        '<div class="load" id="sent">Cargando…</div>' +
        "</section>";

      var page = 0;
      var busy = false;
      var done = false;
      var mode = "catalog";
      var searchQ = "";
      var cardSeq = 0;

      async function next() {
        if (busy || done) return;
        busy = true;
        page++;
        try {
          var data;
          if (mode === "search" && searchQ) {
            data = await workerGet(
              "/" + sid + "/buscar?q=" + encodeURIComponent(searchQ) + "&page=" + page
            );
          } else {
            data = await workerGet("/" + sid + "/" + pathKind + "?page=" + page);
          }
          var results = data.results || data.resultados || [];
          if (mode === "search") {
            results = results.filter(function (r) {
              var t = String(r.type || r.tipo || "").toLowerCase();
              if (isMovie) return /peli|movie|film/.test(t) || !t;
              return /serie|tv|dorama/.test(t) || !/peli|movie/.test(t);
            });
          }
          var grid = document.getElementById("grid");
          var sent = document.getElementById("sent");
          if (!results.length) {
            done = true;
            if (page === 1 && grid)
              grid.innerHTML =
                '<p style="color:var(--mute)">Sin resultados.</p>';
            if (sent) sent.textContent = page === 1 ? "" : "No hay más";
            busy = false;
            return;
          }
          results.forEach(function (it) {
            cardSeq++;
            it._cardId = "c" + cardSeq;
          });
          if (grid)
            grid.insertAdjacentHTML(
              "beforeend",
              results
                .map(function (it) {
                  return cardWorker(it, kind, it._cardId);
                })
                .join("")
            );
          softEnrichTmdb(results, kind);
          if (results.length < 12) {
            done = true;
            if (sent) sent.textContent = "";
          } else {
            if (sent) sent.textContent = "Cargando más…";
          }
        } catch (e) {
          var sent2 = document.getElementById("sent");
          if (sent2)
            sent2.textContent =
              page === 1 ? "Error: " + (e.message || e) : "No hay más";
          done = true;
        }
        busy = false;
      }

      var form = document.getElementById("mz-cat-sf");
      if (form) {
        form.onsubmit = function (e) {
          e.preventDefault();
          var q = (document.getElementById("mz-cat-q") || {}).value || "";
          q = String(q).trim();
          searchQ = q;
          mode = q ? "search" : "catalog";
          page = 0;
          done = false;
          var grid = document.getElementById("grid");
          if (grid) grid.innerHTML = "";
          var sent = document.getElementById("sent");
          if (sent) sent.textContent = "Cargando…";
          next();
        };
      }

      var sentEl = document.getElementById("sent");
      if (sentEl && typeof IntersectionObserver !== "undefined") {
        var io = new IntersectionObserver(
          function (es) {
            if (es[0] && es[0].isIntersecting) next();
          },
          { rootMargin: "600px" }
        );
        io.observe(sentEl);
      }
      await next();
    } catch (e) {
      var v = document.querySelector("#view");
      if (v)
        v.innerHTML =
          '<div class="load">' + esc(e.message || e) + "</div>";
    }
  }

  window.loadCatalog = loadCatalog;
})();
