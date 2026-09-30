/**
 * Kinox — reproductor
 * Series: interfaz tipo MovieZone (player + episodios, Reproductores / Directos)
 * Películas: layout simple mejorado
 */
(function () {
  "use strict";

  var PREF_KEY = "kx_pref_server";

  function $(s, r) {
    return (r || document).querySelector(s);
  }
  function $all(s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  }

  function isDirectPlayer(p) {
    if (!p) return false;
    if (p.stream_url || p.hls_resolve) return true;
    if (p.noAds || p.__directHls) return true;
    return false;
  }

  function isNormalPlayer(p) {
    if (!p || !p.url) return false;
    if (!/^https?:\/\//i.test(String(p.url))) return false;
    return true;
  }

  function serverLabel(p) {
    var n = (p && (p.name || p.provider || p.servidor || p.server)) || "Servidor";
    return String(n).replace(/\s*NO\s*ADS\s*/gi, "").trim() || "Servidor";
  }

  function langLabel(p) {
    var l = String((p && (p.idioma || p.language || p.lang)) || "").trim();
    if (!l) return "";
    if (/lat|dub|español|espanol|latino/i.test(l)) return "Latino";
    if (/sub/i.test(l)) return "Subtitulado";
    return l;
  }

  function extractVideoUrl(payload) {
    if (!payload) return null;
    if (typeof payload === "string") {
      var t = payload.trim();
      if (/^https?:\/\//i.test(t)) return t.split(/\s/)[0];
      try {
        payload = JSON.parse(t);
      } catch (e) {
        return null;
      }
    }
    if (typeof payload !== "object") return null;
    var keys = [
      "play_url",
      "proxy_url",
      "url",
      "master",
      "play_direct",
      "hls",
      "src",
      "file",
      "link"
    ];
    for (var i = 0; i < keys.length; i++) {
      var v = payload[keys[i]];
      if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
      if (Array.isArray(v) && v[0] && typeof v[0] === "string") return v[0];
      if (v && typeof v === "object" && Array.isArray(v.hls) && v.hls[0]) return v.hls[0];
    }
    if (payload.videos && payload.videos.hls && payload.videos.hls[0]) {
      return payload.videos.hls[0];
    }
    return null;
  }

  function savePref(p, mode) {
    try {
      localStorage.setItem(
        PREF_KEY,
        JSON.stringify({
          name: serverLabel(p).toLowerCase(),
          mode: mode || (isDirectPlayer(p) ? "direct" : "iframe"),
          lang: langLabel(p).toLowerCase()
        })
      );
    } catch (_) {}
  }

  function loadPref() {
    try {
      return JSON.parse(localStorage.getItem(PREF_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function matchPref(players, pref) {
    if (!pref || !players || !players.length) return null;
    var wantName = String(pref.name || "").toLowerCase();
    var wantDirect = pref.mode === "direct";
    var best = null;
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var n = serverLabel(p).toLowerCase();
      var isDir = isDirectPlayer(p);
      if (wantDirect && !isDir) continue;
      if (!wantDirect && isDir && isNormalPlayer(p)) {
        /* prefer normal when pref is iframe */
      }
      if (wantName && n.indexOf(wantName) === -1 && wantName.indexOf(n) === -1) continue;
      if (wantDirect === isDir || (!wantDirect && isNormalPlayer(p))) {
        best = p;
        break;
      }
      if (!best) best = p;
    }
    return best;
  }

  function buildPlayHref(opts) {
    var q = {
      type: opts.type || "tv",
      id: opts.id,
      season: opts.season,
      episode: opts.episode,
      slug: opts.slug || undefined,
      source_id: opts.sourceId || undefined
    };
    if (opts.urlVidBase && opts.season && opts.episode) {
      var base = String(opts.urlVidBase).replace(/\/$/, "");
      if (!/\/\d+\/\d+\/?$/.test(base)) {
        q.url_vid = base + "/" + opts.season + "/" + opts.episode;
      } else {
        q.url_vid = base.replace(/\/\d+\/\d+\/?$/, "/" + opts.season + "/" + opts.episode);
      }
    }
    if (typeof pageHref === "function") return pageHref("reproductor.html", q);
    var sp = new URLSearchParams();
    Object.keys(q).forEach(function (k) {
      if (q[k] != null && q[k] !== "") sp.set(k, q[k]);
    });
    return "reproductor.html?" + sp.toString();
  }

  /** Normaliza un episodio de TMDB o del worker a un shape común */
  function normalizeEp(e, seasonNum) {
    if (!e) return null;
    var n =
      e.episode_number != null
        ? e.episode_number
        : e.episodio != null
          ? e.episodio
          : e.episode != null
            ? e.episode
            : null;
    if (n == null) return null;
    n = parseInt(n, 10);
    if (!n || n < 1) return null;
    var name = e.name || e.titulo || e.title || ("Episodio " + n);
    var still =
      e.still_path ||
      e.back_img ||
      e.still ||
      e.image ||
      e.imagen ||
      e.thumbnail ||
      null;
    // still_path de TMDB es relativo; back_img del worker es URL absoluta
    return {
      episode_number: n,
      name: name,
      overview: e.overview || e.descripcion || "",
      runtime: e.runtime || e.duracion || null,
      still_path: e.still_path || null,
      still_url: still && String(still).indexOf("http") === 0 ? still : null,
      link: e.link || null
    };
  }

  /** Episodios desde detalle del worker: /{source}/serie/{slug} */
  function isAnimeSourceId(sid) {
    var s = String(sid || "").toLowerCase();
    return s === "4" || s === "5" || s === "animeav1" || s === "jkanime";
  }

  /**
   * Episodios desde worker.
   * Anime (4/5): numeración continua (E1170), no temporadas TMDB (T23 E1…).
   * Si total_episodios >> lista, genera ventana alrededor del episodio actual.
   */
  async function loadSeasonEpsFromWorker(slug, seasonNum, sourceId, currentEp) {
    if (!slug) return [];
    var base =
      (typeof MZ_WORKER !== "undefined" && MZ_WORKER) ||
      (typeof MZ_SEARCH !== "undefined" && MZ_SEARCH) ||
      "https://moviezone.tvjz.workers.dev";
    var sid = String(sourceId || (typeof MZ_SOURCE !== "undefined" ? MZ_SOURCE : "9"));
    var isAnime = isAnimeSourceId(sid);
    if (isAnime) {
      sid = sid === "5" || sid === "jkanime" ? "5" : "4";
    }
    var kind = isAnime ? "anime" : "serie";
    var path = "/" + sid + "/" + kind + "/" + encodeURIComponent(slug);
    try {
      var r = await fetch(base + path, {
        headers: { Accept: "application/json" }
      });
      if (!r.ok) return [];
      var data = await r.json();
      if (!data || data.success === false) return [];
      var temps = data.temporadas || [];
      if (!Array.isArray(temps)) temps = [];
      var totalEps =
        parseInt(data.total_episodios, 10) ||
        parseInt(data.episodes_count, 10) ||
        0;
      var cur = parseInt(currentEp, 10) || 1;

      // --- Anime largo (One Piece): 1 temporada worker + miles de caps ---
      if (isAnime && totalEps > 60 && temps.length <= 1) {
        var win = 35;
        var start = Math.max(1, cur - win);
        var end = Math.min(totalEps, cur + win);
        var outFlat = [];
        var lista0 =
          temps[0] && Array.isArray(temps[0].lista) ? temps[0].lista : [];
        var byNum = Object.create(null);
        var stillPattern = null; // https://cdn.animeav1.com/screenshots/197/{ep}.jpg
        for (var li = 0; li < lista0.length; li++) {
          var raw = lista0[li];
          var num = parseInt(
            raw && (raw.episodio != null ? raw.episodio : raw.episode),
            10
          );
          if (num) byNum[num] = raw;
          var bi = raw && (raw.back_img || raw.still || raw.image);
          if (!stillPattern && bi && /\/screenshots\/\d+\/\d+\./i.test(String(bi))) {
            stillPattern = String(bi).replace(
              /\/screenshots\/(\d+)\/\d+(\.\w+)([?#].*)?$/i,
              "/screenshots/$1/__EP__$2"
            );
          }
        }
        // Fallback: id desde portada covers/197.jpg
        if (!stillPattern) {
          var cover =
            data.portada ||
            data.portada_fuente_raw ||
            data.poster ||
            "";
          var cm = String(cover).match(/\/covers\/(\d+)\./i);
          if (cm) {
            stillPattern =
              "https://cdn.animeav1.com/screenshots/" + cm[1] + "/__EP__.jpg";
          }
        }
        function stillForEp(n, src) {
          if (src && (src.back_img || src.still)) return src.back_img || src.still;
          if (stillPattern) return stillPattern.replace("__EP__", String(n));
          return null;
        }
        for (var n = start; n <= end; n++) {
          var src = byNum[n];
          outFlat.push({
            episode_number: n,
            season_number: 1,
            name: (src && (src.titulo || src.name)) || "Episodio " + n,
            still_url: stillForEp(n, src),
            still_path: null,
            __animeFlat: true,
            __playSeason: 1
          });
        }
        return outFlat;
      }

      // --- Anime / serie con temporadas reales en el worker ---
      var want = parseInt(seasonNum, 10) || 1;
      // Si el ep actual está en alguna lista, usar esa temporada del worker
      if (isAnime && cur && temps.length) {
        for (var ti = 0; ti < temps.length; ti++) {
          var L = temps[ti].lista || temps[ti].episodios || [];
          if (!Array.isArray(L)) continue;
          for (var ej = 0; ej < L.length; ej++) {
            var en = parseInt(
              L[ej] && (L[ej].episodio != null ? L[ej].episodio : L[ej].episode),
              10
            );
            if (en === cur) {
              want = parseInt(
                temps[ti].temporada != null ? temps[ti].temporada : ti + 1,
                10
              );
              break;
            }
          }
        }
      }
      var block = null;
      for (var i = 0; i < temps.length; i++) {
        var t = temps[i];
        var tn = parseInt(t.temporada != null ? t.temporada : t.season, 10);
        if (tn === want) {
          block = t;
          break;
        }
      }
      if (!block && temps[0]) block = temps[0];
      if (!block) return [];
      var lista = block.lista || block.episodios || block.episodes || [];
      if (!Array.isArray(lista)) return [];
      var out = [];
      var sn = parseInt(
        block.temporada != null ? block.temporada : want,
        10
      ) || 1;
      for (var j = 0; j < lista.length; j++) {
        var ep = normalizeEp(lista[j], sn);
        if (ep) {
          if (isAnime) {
            ep.__playSeason = sn;
            ep.__animeFlat = temps.length <= 1;
          }
          out.push(ep);
        }
      }
      out.sort(function (a, b) {
        return a.episode_number - b.episode_number;
      });
      return out;
    } catch (_) {
      return [];
    }
  }

  async function loadSeasonEpsFromTmdb(tvId, seasonNum) {
    if (!tvId || typeof tmdb !== "function") return [];
    try {
      var s = await tmdb("/tv/" + tvId + "/season/" + seasonNum);
      var list = s.episodes || [];
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var ep = normalizeEp(list[i], seasonNum);
        if (ep) out.push(ep);
      }
      return out;
    } catch (_) {
      return [];
    }
  }

  /**
   * Mapea episodio absoluto (1180) → temporada/ep TMDB y devuelve meta (nombre + overview).
   */
  async function loadTmdbEpByAbsolute(tvId, absoluteEp) {
    if (!tvId || !absoluteEp || typeof tmdb !== "function") return null;
    var abs = parseInt(absoluteEp, 10);
    if (!abs || abs < 1) return null;
    try {
      var tv = await tmdb("/tv/" + tvId);
      var seasons = (tv && tv.seasons) || [];
      var left = abs;
      for (var i = 0; i < seasons.length; i++) {
        var s = seasons[i];
        var sn = parseInt(s.season_number, 10);
        if (sn === 0) continue; // especiales
        var count = parseInt(s.episode_count, 10) || 0;
        if (count < 1) continue;
        if (left <= count) {
          try {
            var ep = await tmdb(
              "/tv/" + tvId + "/season/" + sn + "/episode/" + left
            );
            if (ep) {
              ep.__tmdb_season = sn;
              ep.__tmdb_episode = left;
              ep.__absolute = abs;
            }
            return ep || null;
          } catch (_) {
            return null;
          }
        }
        left -= count;
      }
    } catch (_) {}
    return null;
  }

  async function loadTmdbEpDirect(tvId, seasonNum, episodeNum) {
    if (!tvId || typeof tmdb !== "function") return null;
    try {
      return await tmdb(
        "/tv/" +
          tvId +
          "/season/" +
          seasonNum +
          "/episode/" +
          episodeNum
      );
    } catch (_) {
      return null;
    }
  }

  async function loadSeasonEps(opts) {
    opts = opts || {};
    var seasonNum = opts.season || "1";
    var anime = isAnimeSourceId(opts.sourceId);
    // Anime fuente 4/5: NUNCA listar temporadas TMDB (T23 E1…); usar worker
    var fromWorker = await loadSeasonEpsFromWorker(
      opts.slug,
      anime ? "1" : seasonNum,
      opts.sourceId,
      opts.currentEpisode || opts.episode
    );
    if (fromWorker.length) return fromWorker;
    if (anime) return []; // no caer a TMDB para animeav1/jk
    if (opts.tvId) {
      var fromTmdb = await loadSeasonEpsFromTmdb(opts.tvId, seasonNum);
      if (fromTmdb.length) return fromTmdb;
    }
    return [];
  }

  window.loadPlayer = async function loadPlayer() {
    try {
      var u = new URL(location.href);
      var type = u.searchParams.get("type") || "movie";
      var id = u.searchParams.get("id");
      var season = u.searchParams.get("season");
      var episode = u.searchParams.get("episode");
      var slug = u.searchParams.get("slug");
      var sourceId = u.searchParams.get("source_id") || u.searchParams.get("source") || null;
      var urlVid = u.searchParams.get("url_vid") || null;
      if (urlVid) {
        try {
          urlVid = decodeURIComponent(urlVid);
        } catch (_) {}
      }
      var urlVidBase = urlVid;
      if (urlVid && type === "tv" && season && episode) {
        if (!/\/\d+\/\d+\/?$/.test(urlVid)) {
          var seaUv = isAnimeSourceId(sourceId) ? "1" : season;
          urlVid = urlVid.replace(/\/$/, "") + "/" + seaUv + "/" + episode;
        }
        urlVidBase = String(urlVid).replace(/\/\d+\/\d+\/?$/, "");
      }

      var meta = null;
      if (typeof KEY !== "undefined" && KEY && id) {
        try {
          meta = await tmdb("/" + type + "/" + id);
          if (!slug) slug = mzSlug(meta.title || meta.name);
          document.title = (meta.title || meta.name || "Reproductor") + " — Kinox";
        } catch (_) {}
      }
      if (!slug && !urlVid) {
        $("#view").innerHTML = '<div class="load">Falta el slug del título.</div>';
        return;
      }
      if (type === "tv") {
        season = String(season || "1");
        episode = String(episode || "1");
      }

      var title =
        (meta && (meta.title || meta.name)) ||
        (slug || "Reproducción").replace(/-/g, " ");
      var overview = (meta && meta.overview) || "";
      var poster =
        meta && meta.poster_path
          ? (typeof IMG !== "undefined" ? IMG : "https://image.tmdb.org/t/p/") +
            "w780" +
            meta.poster_path
          : "";

      var seasonEps = [];
      if (type === "tv") {
        seasonEps = await loadSeasonEps({
          tvId: id,
          slug: slug,
          season: season,
          sourceId: sourceId,
          currentEpisode: episode,
          episode: episode
        });
      }

      var epMeta = null;
      if (seasonEps.length) {
        epMeta = seasonEps.find(function (e) {
          return String(e.episode_number) === String(episode);
        });
      }

      // Meta real del episodio (nombre + sinopsis TMDB), no la de la serie
      var tmdbEp = null;
      if (type === "tv" && id && episode) {
        var epN = parseInt(episode, 10);
        var seaN = parseInt(season, 10) || 1;
        // Episodio absoluto (anime One Piece 1180) o temporada TMDB normal
        if (isAnimeSourceId(sourceId) || epN > 80) {
          tmdbEp = await loadTmdbEpByAbsolute(id, epN);
        }
        if (!tmdbEp) {
          tmdbEp = await loadTmdbEpDirect(id, seaN, epN);
        }
        // Si season=23 y episode=1180 falló directo, ya intentamos absoluto
      }
      if (tmdbEp) {
        epMeta = epMeta || {};
        if (tmdbEp.name) epMeta.name = tmdbEp.name;
        if (tmdbEp.overview) epMeta.overview = tmdbEp.overview;
        if (tmdbEp.runtime) epMeta.runtime = tmdbEp.runtime;
        if (tmdbEp.still_path) epMeta.still_path = tmdbEp.still_path;
        if (tmdbEp.__tmdb_season) epMeta.__tmdb_season = tmdbEp.__tmdb_season;
      }

      var labelSea =
        (epMeta && epMeta.__tmdb_season) ||
        (epMeta && epMeta.season_number) ||
        season;
      var epTitle =
        type === "tv"
          ? (isAnimeSourceId(sourceId)
              ? "E" +
                episode +
                (epMeta && epMeta.name ? " — " + epMeta.name : "")
              : "T" +
                labelSea +
                " E" +
                episode +
                (epMeta && epMeta.name ? " — " + epMeta.name : ""))
          : "Película";
      var epRuntime =
        (epMeta && epMeta.runtime) ||
        (meta && meta.runtime) ||
        null;
      // Descripción del EPISODIO; solo si no hay, no usar overview de toda la serie
      var epOverview =
        (epMeta && epMeta.overview && String(epMeta.overview).trim()) ||
        (tmdbEp && tmdbEp.overview && String(tmdbEp.overview).trim()) ||
        "";

      /* —— Shell UI (series = MovieZone-like) —— */
      if (type === "tv") {
        $("#view").innerHTML =
          '<section class="kx-ep-view">' +
          '<div class="kx-topbar">' +
          '<a class="kx-back" href="javascript:history.back()">← Volver</a>' +
          '<div class="kx-topbar-title">' +
          esc(title) +
          "</div>" +
          '<div class="kx-top-actions"></div>' +
          "</div>" +
          '<div class="kx-stage">' +
          '<div class="kx-hero">' +
          '<div id="playerBox" class="kx-player mz-player"><div class="player-loading">Buscando reproductores…</div></div>' +
          "</div>" +
          '<aside class="kx-sidebar" id="kxSidebar">' +
          '<div class="kx-sidebar-head">Episodios' +
          (isAnimeSourceId(sourceId)
            ? " · E" + esc(episode)
            : " · T" + esc(season)) +
          "</div>" +
          '<div class="kx-ep-list" id="kxEpList"></div>' +
          "</aside>" +
          "</div>" +
          '<div class="kx-info">' +
          '<h1 class="kx-ep-heading" id="kxEpHeading">' +
          esc(epTitle) +
          "</h1>" +
          '<div class="kx-ep-meta" id="kxEpMeta">' +
          (epRuntime ? esc(String(epRuntime) + " min") : "") +
          "</div>" +
          '<div class="kx-nav" id="kxNav"></div>' +
          '<div class="kx-block">' +
          '<h3 class="kx-block-title">Reproductores</h3>' +
          '<div class="kx-chips" id="kxServers"></div>' +
          "</div>" +
          '<div class="kx-block">' +
          '<h3 class="kx-block-title">Directos</h3>' +
          '<div class="kx-chips" id="kxDirects"></div>' +
          "</div>" +
          (epOverview
            ? '<p class="kx-synopsis" id="kxSynopsis">' + esc(epOverview) + "</p>"
            : '<p class="kx-synopsis" id="kxSynopsis"></p>') +
          '<div class="kx-ep-mobile" id="kxEpMobile"></div>' +
          "</div>" +
          "</section>";
      } else {
        $("#view").innerHTML =
          '<section class="page player-page kx-movie-view">' +
          '<div class="player-head kx-topbar">' +
          '<a class="kx-back" href="javascript:history.back()">← Volver</a>' +
          '<div class="kx-topbar-title">' +
          esc(title) +
          "</div>" +
          '<div class="kx-top-actions"></div>' +
          "</div>" +
          '<div id="playerBox" class="mz-player kx-player"><div class="player-loading">Buscando reproductores…</div></div>' +
          '<div class="kx-block"><h3 class="kx-block-title">Reproductores</h3><div class="kx-chips" id="kxServers"></div></div>' +
          '<div class="kx-block"><h3 class="kx-block-title">Directos</h3><div class="kx-chips" id="kxDirects"></div></div>' +
          (overview
            ? '<p class="kx-synopsis">' + esc(overview) + "</p>"
            : "") +
          "</section>";
      }

      var box = $("#playerBox");
      var playSeasonMz = isAnimeSourceId(sourceId) ? 1 : season;
      var playEpisodeMz = episode;
      var data = await mzPlayers({
        type: type,
        slug: slug,
        season: playSeasonMz,
        episode: playEpisodeMz,
        source_id: sourceId,
        url_vid: urlVid
      });
      var players = data.reproductores || [];
      if (!players.length) {
        box.innerHTML =
          '<div class="player-empty">No hay reproductores disponibles.</div>';
        return;
      }

      var normals = players.filter(isNormalPlayer);
      var directs = players.filter(isDirectPlayer);
      // Evitar duplicar el mismo url en ambos si solo tiene url
      if (!directs.length && normals.length) {
        /* solo normales */
      }

      function chipHtml(p, i, mode) {
        var label = serverLabel(p);
        var lang = langLabel(p);
        return (
          '<button type="button" class="kx-chip" data-i="' +
          i +
          '" data-mode="' +
          mode +
          '">' +
          '<span class="kx-chip-name">' +
          esc(label) +
          "</span>" +
          (lang
            ? '<span class="kx-chip-lang">' + esc(lang) + "</span>"
            : "") +
          "</button>"
        );
      }

      var srvEl = $("#kxServers");
      var dirEl = $("#kxDirects");
      if (srvEl) {
        var nHtml = normals
          .map(function (p) {
            var idx = players.indexOf(p);
            return chipHtml(p, idx, "iframe");
          })
          .join("");
        srvEl.innerHTML =
          nHtml ||
          '<span class="kx-muted">Sin mirrors clásicos</span>';
      }
      if (dirEl) {
        var dHtml = directs
          .map(function (p) {
            var idx = players.indexOf(p);
            return chipHtml(p, idx, "direct");
          })
          .join("");
        dirEl.innerHTML =
          dHtml || '<span class="kx-muted">Sin directos</span>';
      }

      /* Episodios sidebar + mobile */
      if (type === "tv") {
        function epCard(e, mobile) {
          var n = e.episode_number;
          var playing = String(n) === String(episode);
          var still = e.still_url
            ? e.still_url
            : e.still_path && typeof IMG !== "undefined"
              ? IMG + "w300" + e.still_path
              : poster;
          // Anime fuente 4: reproducir T1 + ep absoluto (no temporada TMDB)
          var playSea =
            e.__playSeason != null
              ? e.__playSeason
              : isAnimeSourceId(sourceId)
                ? 1
                : season;
          var href = buildPlayHref({
            type: "tv",
            id: id,
            season: playSea,
            episode: n,
            slug: slug,
            sourceId: sourceId,
            urlVidBase: urlVidBase
          });
          if (mobile) {
            return (
              '<a class="kx-ep-num' +
              (playing ? " active" : "") +
              '" href="' +
              href +
              '">' +
              n +
              "</a>"
            );
          }
          return (
            '<a class="kx-ep-card' +
            (playing ? " playing active" : "") +
            '" href="' +
            href +
            '" data-ep="' +
            n +
            '">' +
            '<div class="kx-ep-thumb">' +
            (playing
              ? '<div class="kx-badge-playing">Seleccionado</div>'
              : "") +
            (still
              ? '<img src="' +
                still +
                '" alt="" loading="lazy" onerror="this.style.opacity=.3"/>'
              : "") +
            (e.runtime
              ? '<span class="kx-badge-dur">' + e.runtime + "m</span>"
              : "") +
            "</div>" +
            '<div class="kx-ep-info"><div class="kx-ep-name">' +
            (e.__animeFlat || isAnimeSourceId(sourceId)
              ? "E" + n
              : "T" + (e.season_number || season) + " E" + n) +
            " — " +
            esc(e.name || "Episodio " + n) +
            "</div></div></a>"
          );
        }

        var list = $("#kxEpList");
        var mob = $("#kxEpMobile");
        if (list) {
          list.innerHTML = seasonEps.length
            ? seasonEps.map(function (e) {
                return epCard(e, false);
              }).join("")
            : '<p class="kx-muted">Sin lista de episodios.</p>';
          // scroll al activo
          requestAnimationFrame(function () {
            var act =
              list.querySelector(".kx-ep-card.playing") ||
              list.querySelector(".kx-ep-card.active");
            if (act) {
              try {
                act.scrollIntoView({
                  block: "center",
                  inline: "nearest",
                  behavior: "smooth"
                });
              } catch (_) {
                try {
                  var offset =
                    act.offsetTop -
                    list.clientHeight / 2 +
                    act.clientHeight / 2;
                  list.scrollTop = Math.max(0, offset);
                } catch (_) {}
              }
            }
          });
        }
        if (mob) {
          mob.innerHTML =
            '<div class="kx-ep-num-grid">' +
            seasonEps
              .map(function (e) {
                return epCard(e, true);
              })
              .join("") +
            "</div>";
        }

        /* Prev / Next */
        var nav = $("#kxNav");
        var epNum = parseInt(episode, 10) || 1;
        var prevEp = seasonEps.find(function (e) {
          return e.episode_number === epNum - 1;
        });
        var nextEp = seasonEps.find(function (e) {
          return e.episode_number === epNum + 1;
        });
        if (nav) {
          nav.innerHTML =
            (prevEp
              ? '<a class="kx-nav-btn" href="' +
                buildPlayHref({
                  type: "tv",
                  id: id,
                  season: season,
                  episode: prevEp.episode_number,
                  slug: slug,
                  sourceId: sourceId,
                  urlVidBase: urlVidBase
                }) +
                '">← Anterior</a>'
              : '<span class="kx-nav-btn disabled">← Anterior</span>') +
            (nextEp
              ? '<a class="kx-nav-btn" href="' +
                buildPlayHref({
                  type: "tv",
                  id: id,
                  season: season,
                  episode: nextEp.episode_number,
                  slug: slug,
                  sourceId: sourceId,
                  urlVidBase: urlVidBase
                }) +
                '">Siguiente →</a>'
              : '<span class="kx-nav-btn disabled">Siguiente →</span>');
        }
      }

      function renderVideo(src) {
        if (box.querySelector("video") && box.querySelector("video")._hls) {
          try {
            box.querySelector("video")._hls.destroy();
          } catch (_) {}
        }
        box.innerHTML =
          '<video id="mzVideo" class="kx-video" controls playsinline autoplay preload="metadata"' +
          (poster ? ' poster="' + poster + '"' : "") +
          "></video>";
        var video = $("#mzVideo");
        if (/\.m3u8(?:\?|$)/i.test(src) || /m3u8/i.test(src)) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = src;
          } else if (window.Hls && Hls.isSupported()) {
            var hls = new Hls({ enableWorker: true });
            hls.loadSource(src);
            hls.attachMedia(video);
            video._hls = hls;
          } else {
            box.innerHTML =
              '<div class="player-empty">Tu navegador no puede reproducir HLS.</div>';
            return;
          }
        } else {
          video.src = src;
        }
        video.play().catch(function () {});
      }

      function renderIframe(url) {
        box.innerHTML =
          '<iframe class="mz-iframe kx-iframe" src="' +
          esc(url) +
          '" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="no-referrer"></iframe>';
      }

      async function play(p, mode, btn) {
        $all(".kx-chip").forEach(function (x) {
          x.classList.remove("active");
        });
        if (btn) btn.classList.add("active");
        savePref(p, mode);
        box.innerHTML =
          '<div class="player-loading">Resolviendo video…</div>';
        var endpoint = p.hls_resolve || p.stream_url;
        if (mode === "direct" && endpoint) {
          try {
            var src = null;
            if (/\.m3u8(?:\?|$)/i.test(endpoint) || /\.mp4(?:\?|$)/i.test(endpoint)) {
              src = endpoint;
            } else {
              var r = await fetch(endpoint, {
                headers: { Accept: "application/json,text/plain,*/*" }
              });
              if (!r.ok) throw new Error("HTTP " + r.status);
              var raw = await r.text();
              var payload;
              try {
                payload = JSON.parse(raw);
              } catch (e) {
                payload = raw;
              }
              src = extractVideoUrl(payload);
            }
            if (src) {
              renderVideo(src);
              return;
            }
          } catch (e) {
            console.warn(e);
          }
        }
        if (p.url && /^https?:\/\//i.test(p.url)) {
          renderIframe(p.url);
          return;
        }
        // fallback: intentar direct si mode iframe falló
        if (endpoint && mode !== "direct") {
          try {
            await play(p, "direct", btn);
            return;
          } catch (_) {}
        }
        box.innerHTML =
          '<div class="player-empty">No se pudo iniciar este servidor.</div>';
      }

      $all(".kx-chip").forEach(function (btn) {
        btn.onclick = function () {
          var i = Number(btn.dataset.i);
          var mode = btn.dataset.mode || "iframe";
          play(players[i], mode, btn);
        };
      });

      // Auto: preferido → primer normal → primer directo
      var pref = loadPref();
      var auto = matchPref(players, pref);
      var autoMode = pref && pref.mode === "direct" ? "direct" : "iframe";
      if (!auto) {
        auto = normals[0] || directs[0] || players[0];
        autoMode = isDirectPlayer(auto) && !isNormalPlayer(auto) ? "direct" : "iframe";
        if (normals.indexOf(auto) >= 0) autoMode = "iframe";
        else if (directs.indexOf(auto) >= 0) autoMode = "direct";
      }
      var autoIdx = players.indexOf(auto);
      var autoBtn = $(
        '.kx-chip[data-i="' + autoIdx + '"][data-mode="' + autoMode + '"]'
      ) || $('.kx-chip[data-i="' + autoIdx + '"]');
      if (auto) play(auto, autoMode, autoBtn);
      else box.innerHTML = '<div class="player-empty">Selecciona un servidor.</div>';
    } catch (e) {
      $("#view").innerHTML =
        '<div class="load">' + esc(e.message || String(e)) + "</div>";
    }
  };
})();
