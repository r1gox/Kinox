/**
 * Sección Anime (estilo MovieZone)
 * - Catálogo / calendario desde worker source 4 (animeav1)
 * - TMDB solo para rellenar meta si hay key (opcional, no bloquea)
 */
(function () {
  var WORKER =
    (typeof MZ_WORKER !== "undefined" && MZ_WORKER) ||
    (typeof MZ_SEARCH !== "undefined" && MZ_SEARCH) ||
    "https://moviezone.tvjz.workers.dev";

  function $(s, r) {
    return (r || document).querySelector(s);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c
      );
    });
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

  function detailHref(item) {
    var slug = item.slug || "";
    var sid = item.source_id || item.source || "4";
    var title = item.titulo_anime || item.titulo || item.title || item.nombre || slug;
    var tipo = String(item.tipo || item.type || item.formato || "Anime").toLowerCase();
    var isMovie = /peli|movie|film/.test(tipo);
    var page = isMovie ? "detalle-pelicula.html" : "detalle-serie.html";
    var q = {
      slug: slug,
      source_id: String(sid),
      title: title,
      type: isMovie ? "movie" : "anime",
    };
    if (typeof pageHref === "function") return pageHref(page, q);
    var ps = new URLSearchParams();
    Object.keys(q).forEach(function (k) {
      if (q[k] != null && q[k] !== "") ps.set(k, q[k]);
    });
    return "../pages/" + page + "?" + ps.toString();
  }

  function episodeHref(item) {
    var slug = item.slug || "";
    var ep = item.episodio || item.number || item.episode || 1;
    var season = item.temporada || item.season || 1;
    var sid = item.source_id || "4";
    var title = item.titulo_anime || item.titulo || item.title || slug;
    if (typeof pageHref === "function") {
      return pageHref("reproductor.html", {
        type: "anime",
        slug: slug,
        source_id: String(sid),
        season: String(season),
        episode: String(ep),
        title: title,
      });
    }
    var ps = new URLSearchParams({
      type: "anime",
      slug: slug,
      source_id: String(sid),
      season: String(season),
      episode: String(ep),
    });
    return "../pages/reproductor.html?" + ps.toString();
  }

  function posterUrl(item) {
    var p =
      item.portada ||
      item.poster ||
      item.back_img ||
      item.still ||
      item.image ||
      "";
    if (!p) return "";
    if (/^\/\//.test(p)) return "https:" + p;
    return p;
  }

  function cardAnime(item) {
    var title = item.titulo || item.title || item.nombre || item.slug || "Anime";
    var img = posterUrl(item);
    var year = item.year || "";
    var tipo = item.tipo || item.type || item.formato || "Anime";
    var href = detailHref(item);
    return (
      '<a class="card mz-anime-card" href="' +
      esc(href) +
      '">' +
      (img
        ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.style.opacity=.25">'
        : '<div class="ph"></div>') +
      '<div class="meta"><b>' +
      esc(title) +
      "</b>" +
      (year ? '<span class="y">' + esc(year) + "</span>" : "") +
      '<span class="tag">' +
      esc(tipo) +
      "</span></div></a>"
    );
  }


  /** publishedAt → "Hoy · 16:49", "Ayer · 10:20", "2 oct · 18:05" */
  function formatRelativeWhen(raw) {
    if (!raw) return "";
    var s = String(raw).trim();
    // "2026-10-02 16:49:32.156+00" o ISO
    var m = s.match(
      /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/
    );
    var d;
    if (m) {
      // interpretar como UTC si trae +00 / Z, si no como local
      var iso =
        m[1] +
        "-" +
        m[2] +
        "-" +
        m[3] +
        "T" +
        m[4] +
        ":" +
        m[5] +
        ":00";
      if (/[zZ]|[+\-]\d{2}/.test(s)) {
        if (s.indexOf("+") >= 0 || s.indexOf("Z") >= 0 || s.indexOf("z") >= 0) {
          // mantener offset si existe
          var off = s.match(/([zZ]|[+\-]\d{2}:?\d{0,2})$/);
          if (off && off[1] && off[1].toUpperCase() !== "Z") {
            iso = m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5] + ":00" + (s.match(/([+\-]\d{2}:?\d{2})/) || ["","+00:00"])[1].replace(/([+\-]\d{2})(\d{2})$/, "$1:$2");
          } else {
            iso += "Z";
          }
        }
      }
      d = new Date(iso);
      if (isNaN(d.getTime())) {
        d = new Date(s);
      }
    } else {
      d = new Date(s);
    }
    if (isNaN(d.getTime())) {
      return s.slice(0, 16).replace("T", " ");
    }
    var now = new Date();
    function startOfDay(x) {
      return new Date(x.getFullYear(), x.getMonth(), x.getDate());
    }
    var dayDiff = Math.round(
      (startOfDay(now) - startOfDay(d)) / 86400000
    );
    var hh = String(d.getHours()).padStart(2, "0");
    var mm = String(d.getMinutes()).padStart(2, "0");
    var hora = hh + ":" + mm;
    if (dayDiff === 0) return "Hoy · " + hora;
    if (dayDiff === 1) return "Ayer · " + hora;
    if (dayDiff > 1 && dayDiff < 7) return "Hace " + dayDiff + " días · " + hora;
    var months = [
      "ene","feb","mar","abr","may","jun",
      "jul","ago","sep","oct","nov","dic"
    ];
    return d.getDate() + " " + months[d.getMonth()] + " · " + hora;
  }

  function cardReciente(item) {
    var animeTitle = item.titulo_anime || item.titulo || item.title || item.slug || "Anime";
    var ep = item.episodio || item.number || "?";
    var img = posterUrl(item);
    var href = episodeHref(item);
    var when = formatRelativeWhen(
      item.publishedAt || item.fecha || item.fecha_relativa || item.published_label || ""
    );
    return (
      '<a class="mz-cal-card" href="' +
      esc(href) +
      '">' +
      '<div class="mz-cal-thumb">' +
      (img
        ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.style.opacity=.3">'
        : "") +
      '<span class="mz-cal-ep">E' +
      esc(ep) +
      "</span></div>" +
      '<div class="mz-cal-info"><b>' +
      esc(animeTitle) +
      "</b>" +
      (when ? '<small>' + esc(when) + "</small>" : "") +
      "</div></a>"
    );
  }

  function renderShell() {
    var view = $("#view");
    if (!view) return;
    view.innerHTML =
      '<section class="page mz-anime-page">' +
      "<h1>Anime</h1>" +
      '<p class="mz-anime-sub">Fuente AnimeAV1 · TMDB solo rellena datos si hay key</p>' +
      '<section class="mz-cal-block">' +
      '<div class="mz-cal-head"><h2>Calendario / Recién emitidos</h2>' +
      '<button type="button" class="btn alt" id="mz-anime-refresh">Actualizar</button></div>' +
      '<div class="mz-cal-row" id="mz-anime-recientes"><div class="load">Cargando…</div></div>' +
      "</section>" +
      '<section class="mz-agregados-block">' +
      "<h2>Recién agregados</h2>" +
      '<div class="grid" id="mz-anime-agregados"><div class="load">Cargando…</div></div>' +
      "</section>" +
      '<section class="mz-search-block">' +
      "<h2>Buscar en AnimeAV1</h2>" +
      '<form id="mz-anime-sf" class="mz-anime-search">' +
      '<input id="mz-anime-q" type="search" placeholder="Ej. One Piece, Jujutsu…" autocomplete="off">' +
      '<button class="btn" type="submit">Buscar</button></form>' +
      '<div class="grid" id="mz-anime-results"></div>' +
      "</section>" +
      "</section>";
  }

  function loadHome() {
    var boxR = $("#mz-anime-recientes");
    var boxA = $("#mz-anime-agregados");
    return workerGet("/4/home")
      .then(function (data) {
        var recientes = data.recientes || [];
        var agregados = data.agregados || [];
        if (boxR) {
          if (!recientes.length) {
            boxR.innerHTML = '<p class="mz-empty">Sin episodios recientes por ahora.</p>';
          } else {
            boxR.innerHTML = recientes.map(cardReciente).join("");
          }
        }
        if (boxA) {
          if (!agregados.length) {
            boxA.innerHTML = '<p class="mz-empty">Sin títulos nuevos.</p>';
          } else {
            boxA.innerHTML = agregados.map(cardAnime).join("");
          }
        }
        // TMDB enrich opcional (no bloquea UI)
        try {
          softEnrichList(agregados.concat(recientes));
        } catch (_) {}
      })
      .catch(function (e) {
        if (boxR)
          boxR.innerHTML =
            '<p class="mz-empty">No se pudo cargar el calendario: ' +
            esc(e.message || e) +
            "</p>";
        if (boxA)
          boxA.innerHTML =
            '<p class="mz-empty">Error: ' + esc(e.message || e) + "</p>";
      });
  }

  function searchAnime(q) {
    var box = $("#mz-anime-results");
    if (!box) return;
    q = String(q || "").trim();
    if (!q) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = '<div class="load">Buscando…</div>';
    // Preferir buscador de fuente 4
    var path = "/4/buscar?q=" + encodeURIComponent(q);
    return workerGet(path)
      .then(function (data) {
        var results = data.results || data.resultados || [];
        // filtrar solo source 4 por si el endpoint mezcla
        results = results.filter(function (r) {
          var sid = String(r.source_id || r.source || "").toLowerCase();
          return sid === "4" || sid === "animeav1" || !sid;
        });
        if (!results.length) {
          box.innerHTML = '<p class="mz-empty">Sin resultados para “' + esc(q) + '”.</p>';
          return;
        }
        box.innerHTML = results.map(cardAnime).join("");
        try {
          softEnrichList(results);
        } catch (_) {}
      })
      .catch(function (e) {
        box.innerHTML =
          '<p class="mz-empty">Error de búsqueda: ' + esc(e.message || e) + "</p>";
      });
  }

  /** TMDB solo rellena: no sustituye el listado del worker */
  function softEnrichList(items) {
    if (typeof KEY === "undefined" || !KEY) return;
    if (typeof tmdb !== "function") return;
    (items || []).slice(0, 12).forEach(function (it) {
      var title = it.titulo_anime || it.titulo || it.title;
      if (!title) return;
      tmdb("/search/tv", { query: title, include_adult: false })
        .then(function (res) {
          var hit = (res.results || [])[0];
          if (!hit || !hit.poster_path) return;
          // No pisamos portada del worker si ya es buena; solo si falta
          if (!it.portada && hit.poster_path) {
            it.portada = (typeof IMG !== "undefined" ? IMG : "https://image.tmdb.org/t/p/") + "w342" + hit.poster_path;
          }
        })
        .catch(function () {});
    });
  }

  async function loadAnimePage() {
    renderShell();
    var btn = $("#mz-anime-refresh");
    if (btn) btn.onclick = function () {
      loadHome();
    };
    var form = $("#mz-anime-sf");
    if (form) {
      form.onsubmit = function (e) {
        e.preventDefault();
        searchAnime(($("#mz-anime-q") || {}).value);
      };
    }
    await loadHome();
  }

  // auto-run
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAnimePage);
  } else {
    loadAnimePage();
  }

  window.loadAnimePage = loadAnimePage;
})();
