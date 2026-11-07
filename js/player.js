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
    var url = String((p && (p.url || p.link)) || "").toLowerCase();
    if (url.indexOf("uns.bio") !== -1 || url.indexOf("upnshare") !== -1) {
      return "UPNShare";
    }
    var n =
      (p && (p.name || p.provider || p.servidor || p.server)) || "Servidor";
    n = String(n).replace(/\s*NO\s*ADS\s*/gi, "").trim() || "Servidor";
    if (/^upn/i.test(n)) return "UPNShare";
    return n;
  }

  function langLabel(p) {
    // Solo campos de idioma (no mezclar con nombre del servidor)
    var only = String(
      (p && (p.idioma || p.language || p.lang || p.lang_code)) || ""
    ).trim();
    var l = only.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Orden importa: Latino explícito ANTES que "español" genérico
    if (
      /latino|latam|es-?mx|es_la|\blat\b|espanol\s*latino|español\s*latino|audio\s*lat/i.test(
        l
      )
    ) {
      return "Latino";
    }
    if (/(^|\b)(sub|subs|subtitul|vose|vos)(\b|$)/i.test(l)) {
      return "Subtitulado";
    }
    // "Español", "ESPAÑOL", "Castellano", España → Castellano (NO Latino)
    if (
      /castellano|castella|\bespana\b|\bspain\b|^es$|^esp$|\bespanol\b|\bespañol\b/i.test(
        l
      )
    ) {
      return "Castellano";
    }
    if (/eng|ingl|english/i.test(l)) return "English";

    // Fallback: mirar nombre del servidor solo por marcas claras
    var name = String(
      (p && (p.name || p.servidor || p.server || p.provider)) || ""
    ).toLowerCase();
    if (/latino|\blat\b|latam/.test(name)) return "Latino";
    if (/castellano|\bcast\b/.test(name)) return "Castellano";
    if (/\bsub\b|subtit/.test(name)) return "Subtitulado";

    return only || "";
  }

  function langKey(p) {
    var L = langLabel(p);
    if (/latino/i.test(L)) return "latino";
    if (/castellano/i.test(L)) return "castellano";
    if (/sub/i.test(L)) return "subtitulado";
    return "otros";
  }

  function langShort(key) {
    if (key === "latino") return "LAT";
    if (key === "castellano") return "ESP";
    if (key === "subtitulado") return "SUB";
    if (key === "otros") return "OTROS";
    return "TODOS";
  }

  function langFlag(key) {
    if (key === "latino") return "🇲🇽";
    if (key === "castellano") return "🇪🇸";
    if (key === "subtitulado") return "🇺🇸";
    return "🌐";
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
    if (typeof payload !== "object" || !payload) return null;

    function isImageUrl(u) {
      return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(String(u || ""));
    }
    function isMediaUrl(u) {
      u = String(u || "");
      if (!/^https?:\/\//i.test(u)) return false;
      if (isImageUrl(u)) return false;
      return true;
    }
    function pickStr(v) {
      if (typeof v === "string" && isMediaUrl(v)) return v;
      if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) {
          if (typeof v[i] === "string" && isMediaUrl(v[i])) return v[i];
          if (v[i] && typeof v[i].url === "string" && isMediaUrl(v[i].url)) return v[i].url;
        }
      }
      if (v && typeof v === "object") {
        if (Array.isArray(v.hls)) {
          for (var j = 0; j < v.hls.length; j++) {
            if (typeof v.hls[j] === "string" && isMediaUrl(v.hls[j])) return v.hls[j];
          }
        }
        if (typeof v.url === "string" && isMediaUrl(v.url)) return v.url;
      }
      return null;
    }

    // Prioridad: streams reales / proxy worker antes que "url" genérica
    var keys = [
      "play_direct",
      "master",
      "hls",
      "play_url",
      "proxy_url",
      "src",
      "file",
      "link",
      "url"
    ];
    for (var i = 0; i < keys.length; i++) {
      var got = pickStr(payload[keys[i]]);
      if (got) return got;
    }
    if (payload.videos) {
      var g2 = pickStr(payload.videos);
      if (g2) return g2;
      if (payload.videos.hls) {
        var g3 = pickStr(payload.videos.hls);
        if (g3) return g3;
      }
    }
    return null;
  }

  function savePref(p, mode) {
    /* Ya no persistimos servidor entre títulos: al volver se limpia */
    try {
      localStorage.removeItem(PREF_KEY);
    } catch (_) {}
  }

  function clearPref() {
    try {
      localStorage.removeItem(PREF_KEY);
    } catch (_) {}
  }

  function loadPref() {
    return null;
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

      // --- Temporadas reales del worker (Wistoria T1/T2, etc.) ---
      var want = parseInt(seasonNum, 10) || 1;
      var block = null;
      for (var i = 0; i < temps.length; i++) {
        var t = temps[i];
        var tn = parseInt(t.temporada != null ? t.temporada : t.season, 10);
        if (tn === want) {
          block = t;
          break;
        }
      }
      // Si la URL pide T2 y existe, usarla. Solo buscar por nº de ep si no hay bloque.
      if (!block && isAnime && cur && temps.length) {
        for (var ti = 0; ti < temps.length; ti++) {
          var L = temps[ti].lista || temps[ti].episodios || [];
          if (!Array.isArray(L)) continue;
          for (var ej = 0; ej < L.length; ej++) {
            var en = parseInt(
              L[ej] && (L[ej].episodio != null ? L[ej].episodio : L[ej].episode),
              10
            );
            var etn = parseInt(
              L[ej] && L[ej].temporada != null ? L[ej].temporada : temps[ti].temporada,
              10
            );
            // Preferir match de misma temporada de URL
            if (en === cur && (!want || etn === want || !etn)) {
              block = temps[ti];
              want = parseInt(
                temps[ti].temporada != null ? temps[ti].temporada : ti + 1,
                10
              );
              break;
            }
          }
          if (block) break;
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
          ep.season_number = sn;
          ep.__tmdb_season = sn;
          ep.__playSeason = sn;
          ep.__animeFlat = false;
          // back_img del worker
          var raw = lista[j];
          if (raw && (raw.back_img || raw.still) && !ep.still_url) {
            ep.still_url = raw.back_img || raw.still;
          }
          if (raw && (raw.titulo || raw.name) && (!ep.name || /^Episodio/i.test(ep.name))) {
            ep.name = raw.titulo || raw.name;
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

  /** Rellena nombre/sinopsis/still desde TMDB sin cambiar la lista del worker */
  async function enrichEpsWithTmdb(eps, tvId, seasonNum) {
    if (!eps || !eps.length || !tvId || typeof tmdb !== "function") return eps;
    if (typeof KEY === "undefined" || !KEY) return eps;
    try {
      var tmdbList = await loadSeasonEpsFromTmdb(tvId, seasonNum);
      if (!tmdbList.length) {
        // fallback inglés si es-MX viene vacío
        try {
          var s = await tmdb("/tv/" + tvId + "/season/" + seasonNum, {
            language: "en-US"
          });
          tmdbList = (s.episodes || []).map(function (e) {
            return normalizeEp(e, seasonNum);
          }).filter(Boolean);
        } catch (_) {}
      }
      var byN = Object.create(null);
      for (var i = 0; i < tmdbList.length; i++) {
        if (tmdbList[i]) byN[tmdbList[i].episode_number] = tmdbList[i];
      }
      for (var j = 0; j < eps.length; j++) {
        var ep = eps[j];
        var m = byN[ep.episode_number];
        if (!m) continue;
        if (m.name && (!ep.name || /^Episodio\s*\d+/i.test(ep.name))) {
          ep.name = m.name;
        }
        if (m.overview && !ep.overview) ep.overview = m.overview;
        if (m.still_path && !ep.still_path) ep.still_path = m.still_path;
        if (m.runtime && !ep.runtime) ep.runtime = m.runtime;
        ep.season_number = parseInt(seasonNum, 10) || ep.season_number;
        ep.__tmdb_season = ep.season_number;
        ep.__playSeason = ep.season_number;
      }
    } catch (_) {}
    return eps;
  }

  async function loadSeasonEps(opts) {
    opts = opts || {};
    var seasonNum = String(opts.season || "1");
    var anime = isAnimeSourceId(opts.sourceId);
    // Anime multi-temporada (Wistoria T1/T2): respetar season de la URL.
    // Anime largo flat (One Piece): loadSeasonEpsFromWorker usa totalEps>60 && temps<=1.
    var fromWorker = await loadSeasonEpsFromWorker(
      opts.slug,
      seasonNum,
      opts.sourceId,
      opts.currentEpisode || opts.episode
    );
    if (fromWorker.length) {
      // Solo la temporada pedida; rellenar meta TMDB (nombres / sinopsis)
      if (opts.tvId) {
        fromWorker = await enrichEpsWithTmdb(fromWorker, opts.tvId, seasonNum);
      }
      return fromWorker;
    }
    // Sin lista worker: series normales → TMDB; anime no inventar temps TMDB
    if (anime) return [];
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
          urlVid =
            urlVid.replace(/\/$/, "") + "/" + (season || "1") + "/" + episode;
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

      /* Mapa absoluto → temporada TMDB (igual que detalle) */
      var absSeasonMap = null; // absEp -> { season, episode, name? }
      if (type === "tv" && id && typeof tmdb === "function") {
        try {
          var tvMeta = await tmdb("/tv/" + id);
          var seasonsMeta = (tvMeta && tvMeta.seasons) || [];
          absSeasonMap = Object.create(null);
          var absN = 1;
          for (var si = 0; si < seasonsMeta.length; si++) {
            var sm = seasonsMeta[si];
            var sn = parseInt(sm.season_number, 10);
            if (sn === 0) continue;
            var cnt = parseInt(sm.episode_count, 10) || 0;
            for (var ei = 1; ei <= cnt; ei++) {
              absSeasonMap[absN] = { season: sn, episode: ei };
              absN++;
            }
          }
        } catch (_) {
          absSeasonMap = null;
        }
      }
      function tmdbSeasonForAbs(absEp) {
        if (!absSeasonMap) return null;
        var row = absSeasonMap[parseInt(absEp, 10)];
        return row ? row.season : null;
      }

      // One Piece-like (eps absolutos): mapear a T23. Multi-temp worker (Wistoria): no pisar.
      var workerMulti =
        seasonEps.length &&
        seasonEps[0] &&
        seasonEps[0].__playSeason != null &&
        seasonEps[0].__animeFlat === false;
      if (seasonEps.length && absSeasonMap && !workerMulti) {
        for (var se = 0; se < seasonEps.length; se++) {
          var rowEp = seasonEps[se];
          if (rowEp.__animeFlat === false && rowEp.__playSeason != null) continue;
          var absEp = parseInt(rowEp.episode_number, 10);
          var mapRow = absSeasonMap[absEp];
          if (mapRow) {
            rowEp.__tmdb_season = mapRow.season;
            rowEp.season_number = mapRow.season;
          }
        }
      }

      var epMeta = null;
      if (seasonEps.length) {
        epMeta = seasonEps.find(function (e) {
          return String(e.episode_number) === String(episode);
        });
      }

      // Meta real del episodio (nombre + sinopsis TMDB)
      var tmdbEp = null;
      var epN = parseInt(episode, 10);
      var seaN = parseInt(season, 10) || 1;
      if (type === "tv" && id && episode) {
        // 1) Temporada de la URL (Wistoria T2 E12)
        tmdbEp = await loadTmdbEpDirect(id, seaN, epN);
        if (tmdbEp) {
          tmdbEp.__tmdb_season = seaN;
          tmdbEp.__tmdb_episode = epN;
        }
        // 2) One Piece-like: episodio absoluto alto
        if (!tmdbEp && epN > 80) {
          var mappedSea = tmdbSeasonForAbs(epN);
          var mappedEpInSea =
            absSeasonMap && absSeasonMap[epN]
              ? absSeasonMap[epN].episode
              : null;
          if (mappedSea && mappedEpInSea) {
            tmdbEp = await loadTmdbEpDirect(id, mappedSea, mappedEpInSea);
            if (tmdbEp) {
              tmdbEp.__tmdb_season = mappedSea;
              tmdbEp.__tmdb_episode = mappedEpInSea;
              tmdbEp.__absolute = epN;
            }
          }
          if (!tmdbEp) tmdbEp = await loadTmdbEpByAbsolute(id, epN);
        }
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
        season ||
        (epMeta && epMeta.__tmdb_season) ||
        (epMeta && epMeta.season_number) ||
        tmdbSeasonForAbs(episode) ||
        1;
      // Formato como en detalle: T23 E1179 — Nombre
      var epTitle =
        type === "tv"
          ? "T" +
            labelSea +
            " E" +
            episode +
            (epMeta && epMeta.name ? " — " + epMeta.name : "")
          : "Película";
      var epRuntime =
        (epMeta && epMeta.runtime) ||
        (meta && meta.runtime) ||
        null;
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
          '<div id="playerBox" class="kx-player mz-player"><div class="player-loading"><span class="kx-spin"></span><span class="kx-load-text">Buscando reproductores…</span></div></div>' +
          "</div>" +
          '<aside class="kx-sidebar" id="kxSidebar">' +
          '<div class="kx-sidebar-head">Episodios · T' +
          esc(season || "1") +
          " E" +
          esc(episode) +
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
          '<div class="kx-ep-mobile" id="kxEpMobile"></div>' +
          (epOverview
            ? '<p class="kx-synopsis" id="kxSynopsis">' + esc(epOverview) + "</p>"
            : '<p class="kx-synopsis" id="kxSynopsis"></p>') +
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
          '<div id="playerBox" class="mz-player kx-player"><div class="player-loading"><span class="kx-spin"></span><span class="kx-load-text">Buscando reproductores…</span></div></div>' +
          '<div class="kx-block"><h3 class="kx-block-title">Reproductores</h3><div class="kx-chips" id="kxServers"></div></div>' +
          '<div class="kx-block"><h3 class="kx-block-title">Directos</h3><div class="kx-chips" id="kxDirects"></div></div>' +
          (overview
            ? '<p class="kx-synopsis">' + esc(overview) + "</p>"
            : "") +
          "</section>";
      }

      var box = $("#playerBox");
      // Al volver: limpiar preferencia de servidor (no auto-elegir el anterior)
      $all("a.kx-back, a.back").forEach(function (a) {
        a.addEventListener("click", function () {
          clearPref();
        });
      });
      window.addEventListener("pagehide", clearPref);

      // Anime multi-temp: respetar season de la URL (T2 E12). Flat One Piece: 1.
      var playSeasonMz = season || 1;
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
          '<div class="player-empty"><span class="kx-empty-ico">!</span><span class="kx-load-text">No hay reproductores disponibles.</span></div>';
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
        var lk = langKey(p);
        return (
          '<button type="button" class="kx-chip" data-i="' +
          i +
          '" data-mode="' +
          mode +
          '" data-lang="' +
          lk +
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

      var preferredLangForAuto = "all";
      /* HUD sobre el reproductor: idioma (izq) + lista de servidores */
      (function setupPlayerHud() {
        var box = $("#playerBox");
        if (!box) return;

        var style = document.getElementById("kx-lang-style");
        if (!style) {
          style = document.createElement("style");
          style.id = "kx-lang-style";
          style.textContent =
            ".kx-player-wrap{position:relative;width:100%;isolation:isolate}" +
            ".kx-player-wrap .kx-player,.kx-player-wrap .mz-player{width:100%}" +
            ".kx-player-hud{position:absolute;top:10px;left:10px;z-index:6;" +
            "display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;" +
            "pointer-events:none;max-width:calc(100% - 20px)}" +
            ".kx-player-hud *{pointer-events:auto}" +
            ".kx-dd{position:relative;display:inline-flex;z-index:8}" +
            ".kx-dd-btn .kx-dd-icon{font-size:1.05rem;line-height:1;display:inline-flex;align-items:center}" +".kx-dd-btn{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;" +
            "border:1px solid rgba(255,255,255,.22);background:rgba(8,12,22,.88);color:#e2e8f0;" +
            "font:inherit;font-weight:700;font-size:.82rem;cursor:pointer;backdrop-filter:blur(10px);" +
            "-webkit-backdrop-filter:blur(10px);box-shadow:0 4px 16px rgba(0,0,0,.4);max-width:220px}" +
            ".kx-dd-btn:hover,.kx-dd.open .kx-dd-btn{border-color:rgba(139,92,246,.65)}" +
            ".kx-dd-btn .kx-dd-label{opacity:.75;font-size:.72rem;font-weight:800;letter-spacing:.04em}" +".kx-dd-btn.kx-dd-value-only .kx-dd-label{display:none}" +".kx-dd-btn.kx-dd-value-only .kx-dd-value{max-width:160px;font-weight:800}" +
            ".kx-dd-btn .kx-dd-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px}" +
            ".kx-dd-menu{position:absolute;top:calc(100% + 6px);left:0;min-width:200px;max-width:min(280px,80vw);" +
            "max-height:240px;overflow-y:auto;padding:6px;border-radius:12px;" +
            "border:1px solid rgba(56,189,248,.4);background:rgba(11,28,36,.97);" +
            "box-shadow:0 12px 40px rgba(0,0,0,.55);display:none;z-index:9;" +
            "scrollbar-width:thin}" +
            ".kx-dd.open .kx-dd-menu{display:block}" +
            ".kx-dd-menu button{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;" +
            "text-align:left;padding:10px 12px;border:0;border-radius:8px;background:transparent;" +
            "color:#e2e8f0;font:inherit;font-weight:700;font-size:.86rem;cursor:pointer}" +
            ".kx-dd-menu button:hover,.kx-dd-menu button.active{background:rgba(15,23,42,.95)}" +
            ".kx-dd-menu button .kx-dd-meta{font-size:.72rem;opacity:.7;font-weight:600}" +
            ".kx-dd-menu button.kx-lang-hide{display:none!important}" +
            ".kx-dd-empty{padding:10px 12px;color:#64748b;font-size:.82rem}" +
            ".kx-block--servers-hidden{display:none!important}" +
            "@media(max-width:600px){.kx-player-hud{top:6px;left:6px;gap:6px}" +
            ".kx-dd-btn{padding:6px 10px;font-size:.78rem}}";
          document.head.appendChild(style);
        }

        // Envolver el player
        var wrap = box.parentElement;
        if (!wrap || !wrap.classList.contains("kx-player-wrap")) {
          wrap = document.createElement("div");
          wrap.className = "kx-player-wrap";
          box.parentNode.insertBefore(wrap, box);
          wrap.appendChild(box);
        }

        var hud = wrap.querySelector(".kx-player-hud");
        if (!hud) {
          hud = document.createElement("div");
          hud.className = "kx-player-hud";
          wrap.appendChild(hud);
        }
        hud.innerHTML = "";

        // Opciones de idioma presentes
        var keysPresent = {};
        players.forEach(function (p) {
          keysPresent[langKey(p)] = true;
        });
        var options = [];
        if (keysPresent.latino) options.push("latino");
        if (keysPresent.castellano) options.push("castellano");
        if (keysPresent.subtitulado) options.push("subtitulado");
        if (keysPresent.otros) options.push("otros");

        var preferred = keysPresent.latino
          ? "latino"
          : keysPresent.castellano
            ? "castellano"
            : keysPresent.subtitulado
              ? "subtitulado"
              : "all";
        preferredLangForAuto = preferred;

        function closeAllDd(except) {
          $all(".kx-dd.open").forEach(function (el) {
            if (except && el === except) return;
            el.classList.remove("open");
            var b = el.querySelector(".kx-dd-btn");
            if (b) b.setAttribute("aria-expanded", "false");
          });
        }

        function makeDropdown(cfg) {
          var root = document.createElement("div");
          root.className = "kx-dd";
          root.id = cfg.id;
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "kx-dd-btn";
          btn.setAttribute("aria-haspopup", "listbox");
          btn.setAttribute("aria-expanded", "false");
          btn.innerHTML =
            (cfg.icon
              ? '<span class="kx-dd-icon">' + cfg.icon + "</span>"
              : "") +
            '<span class="kx-dd-label">' +
            esc(cfg.label) +
            "</span>" +
            '<span class="kx-dd-value">' +
            esc(cfg.valueText || "—") +
            "</span>" +
            "<span>▾</span>";
          var menu = document.createElement("div");
          menu.className = "kx-dd-menu";
          menu.setAttribute("role", "listbox");
          menu.innerHTML = cfg.menuHtml || "";
          root.appendChild(btn);
          root.appendChild(menu);
          btn.addEventListener("click", function (e) {
            e.stopPropagation();
            var willOpen = !root.classList.contains("open");
            closeAllDd(root);
            if (willOpen) {
              root.classList.add("open");
              btn.setAttribute("aria-expanded", "true");
            } else {
              root.classList.remove("open");
              btn.setAttribute("aria-expanded", "false");
            }
          });
          menu.addEventListener("click", function (e) {
            e.stopPropagation();
          });
          hud.appendChild(root);
          return { root: root, btn: btn, menu: menu };
        }

        function setDdValue(dd, text, opts) {
          if (!dd || !dd.btn) return;
          opts = opts || {};
          var v = dd.btn.querySelector(".kx-dd-value");
          if (v) v.textContent = text || "—";
          if (opts.valueOnly) {
            dd.btn.classList.add("kx-dd-value-only");
          }
          if (opts.icon != null) {
            var ic = dd.btn.querySelector(".kx-dd-icon");
            if (ic) ic.textContent = opts.icon;
          }
        }

        // —— Idioma ——
        var langMenuHtml =
          '<button type="button" data-lang="all">' +
          langFlag("all") +
          " TODOS</button>" +
          options
            .map(function (k) {
              var label =
                k === "latino"
                  ? "LATINO"
                  : k === "castellano"
                    ? "CASTELLANO"
                    : k === "subtitulado"
                      ? "SUBTITULADO"
                      : "OTROS";
              return (
                '<button type="button" data-lang="' +
                k +
                '">' +
                langFlag(k) +
                " " +
                label +
                "</button>"
              );
            })
            .join("");

        var langDd =
          options.length > 0
            ? makeDropdown({
                id: "kxLangDd",
                label: "IDIOMA",
                icon: langFlag(preferred),
                valueText: langShort(preferred),
                menuHtml: langMenuHtml
              })
            : null;

        // —— Servidores ——
        var srvMenuHtml = normals.length
          ? normals
              .map(function (p) {
                var idx = players.indexOf(p);
                var lk = langKey(p);
                var lang = langLabel(p);
                return (
                  '<button type="button" class="kx-chip-proxy" data-i="' +
                  idx +
                  '" data-mode="iframe" data-lang="' +
                  lk +
                  '"><span>' +
                  esc(serverLabel(p)) +
                  "</span>" +
                  (lang
                    ? '<span class="kx-dd-meta">' + esc(lang) + "</span>"
                    : "") +
                  "</button>"
                );
              })
              .join("")
          : '<div class="kx-dd-empty">Ninguno</div>';

        function firstLabel(list, key) {
          if (!list || !list.length) return "—";
          for (var i = 0; i < list.length; i++) {
            if (!key || key === "all" || langKey(list[i]) === key) {
              return serverLabel(list[i]);
            }
          }
          return serverLabel(list[0]);
        }
        var srvInit = firstLabel(normals, preferred);
        var srvDd = makeDropdown({
          id: "kxSrvDd",
          label: "SERVIDOR",
          icon: "▶",
          valueText: srvInit,
          menuHtml: srvMenuHtml
        });
        if (srvInit && srvInit !== "—") {
          srvDd.btn.classList.add("kx-dd-value-only");
        }

        // —— Directos ——
        var dirMenuHtml = directs.length
          ? directs
              .map(function (p) {
                var idx = players.indexOf(p);
                var lk = langKey(p);
                var lang = langLabel(p);
                return (
                  '<button type="button" class="kx-chip-proxy" data-i="' +
                  idx +
                  '" data-mode="direct" data-lang="' +
                  lk +
                  '"><span>' +
                  esc(serverLabel(p)) +
                  "</span>" +
                  (lang
                    ? '<span class="kx-dd-meta">' + esc(lang) + "</span>"
                    : "") +
                  "</button>"
                );
              })
              .join("")
          : '<div class="kx-dd-empty">Ninguno</div>';

        var dirInit = firstLabel(directs, preferred);
        var dirDd = makeDropdown({
          id: "kxDirDd",
          label: "DIRECTO",
          icon: "⚡",
          valueText: dirInit,
          menuHtml: dirMenuHtml
        });
        if (dirInit && dirInit !== "—") {
          dirDd.btn.classList.add("kx-dd-value-only");
        }

        // Ocultar bloques inferiores
        if (srvEl) {
          var b1 = srvEl.closest(".kx-block");
          if (b1) b1.classList.add("kx-block--servers-hidden");
        }
        if (dirEl) {
          var b2 = dirEl.closest(".kx-block");
          if (b2) b2.classList.add("kx-block--servers-hidden");
        }

        function applyLang(key) {
          $all("#kxSrvDd .kx-chip-proxy[data-lang], #kxDirDd .kx-chip-proxy[data-lang]").forEach(
            function (btn) {
              var lk = btn.getAttribute("data-lang") || "otros";
              var show = key === "all" || lk === key;
              if (show) btn.classList.remove("kx-lang-hide");
              else btn.classList.add("kx-lang-hide");
            }
          );
          if (langDd) {
            var k = key === "all" ? "all" : key;
            setDdValue(langDd, langShort(k), { icon: langFlag(k) });
            $all("#kxLangDd .kx-dd-menu button").forEach(function (b) {
              if (b.getAttribute("data-lang") === key) b.classList.add("active");
              else b.classList.remove("active");
            });
          }
          var sLab = firstLabel(normals, key);
          var dLab = firstLabel(directs, key);
          setDdValue(srvDd, sLab, { valueOnly: sLab && sLab !== "—" });
          setDdValue(dirDd, dLab, { valueOnly: dLab && dLab !== "—" });
        }

        if (langDd) {
          langDd.menu.addEventListener("click", function (e) {
            var t = e.target.closest("button[data-lang]");
            if (!t) return;
            applyLang(t.getAttribute("data-lang") || "all");
            closeAllDd();
          });
        }

        function bindPick(dd) {
          if (!dd) return;
          dd.menu.addEventListener("click", function (e) {
            var t = e.target.closest("button.kx-chip-proxy");
            if (!t || t.classList.contains("kx-lang-hide")) return;
            e.preventDefault();
            e.stopPropagation();
            var i = Number(t.getAttribute("data-i"));
            var mode = t.getAttribute("data-mode") || "iframe";
            setDdValue(dd, serverLabel(players[i]), { valueOnly: true });
            closeAllDd();
            if (typeof window.__kxPlayServer === "function") {
              window.__kxPlayServer(i, mode, t);
            } else {
              window.__kxPick = { i: i, mode: mode, btn: t };
            }
          });
        }
        bindPick(srvDd);
        bindPick(dirDd);

        document.addEventListener("click", function () {
          closeAllDd();
        });

        if (options.length > 0) applyLang(preferred);
        else applyLang("all");
      })();

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
              : e.season_number != null
                ? e.season_number
                : season || 1;
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
            "T" +
            (e.__tmdb_season ||
              e.season_number ||
              (typeof tmdbSeasonForAbs === "function"
                ? tmdbSeasonForAbs(n)
                : null) ||
              season ||
              "1") +
            " E" +
            n +
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
        if (!src || /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(src)) {
          box.innerHTML =
            '<div class="player-empty">URL de video inválida (parece una imagen).</div>';
          return;
        }
        if (box.querySelector("video") && box.querySelector("video")._hls) {
          try {
            box.querySelector("video")._hls.destroy();
          } catch (_) {}
        }
        // preload auto + sin depender solo del poster (si HLS falla, avisar)
        box.innerHTML =
          '<video id="mzVideo" class="kx-video" controls playsinline autoplay preload="auto"></video>';
        var video = $("#mzVideo");
        function onFail(msg) {
          console.warn("[player]", msg, src);
          box.innerHTML =
            '<div class="player-empty"><span class="kx-empty-ico">!</span><span class="kx-load-text">' +
            (msg || "No se pudo reproducir el directo.") +
            '</span><button type="button" class="btn kx-retry-btn" id="kxRetryDirect">Reintentar</button></div>';
          var rb = document.getElementById("kxRetryDirect");
          if (rb) rb.onclick = function () { renderVideo(src); };
        }
        video.addEventListener("error", function () {
          onFail("Error al cargar el video.");
        });
        if (/\.m3u8(?:\?|$)/i.test(src) || /m3u8/i.test(src) || /master\.txt/i.test(src) || /\/proxy\?/i.test(src)) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = src;
          } else if (window.Hls && Hls.isSupported()) {
            var hls = new Hls({
              enableWorker: true,
              xhrSetup: function (xhr) {
                try { xhr.withCredentials = false; } catch (_) {}
              }
            });
            hls.loadSource(src);
            hls.attachMedia(video);
            video._hls = hls;
            hls.on(Hls.Events.ERROR, function (_e, data) {
              if (data && data.fatal) {
                try { hls.destroy(); } catch (_) {}
                onFail("Stream HLS no disponible (fatal).");
              }
            });
            hls.on(Hls.Events.MANIFEST_PARSED, function () {
              video.play().catch(function () {});
            });
          } else {
            onFail("Tu navegador no puede reproducir HLS.");
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
        $all(".kx-chip, .kx-chip-proxy").forEach(function (x) {
          x.classList.remove("active");
        });
        if (btn) btn.classList.add("active");
        savePref(p, mode);
        box.innerHTML =
          '<div class="player-loading"><span class="kx-spin"></span><span class="kx-load-text">Resolviendo video…</span></div>';
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
          '<div class="player-empty"><span class="kx-empty-ico">!</span><span class="kx-load-text">No se pudo iniciar este servidor.<br>Prueba otro.</span></div>';
      }

      function onServerPick(i, mode, btn) {
        if (i == null || isNaN(i) || !players[i]) return;
        mode = mode || "iframe";
        var dd = btn && btn.closest ? btn.closest(".kx-dd") : null;
        if (dd) {
          var val = dd.querySelector(".kx-dd-value");
          if (val) val.textContent = serverLabel(players[i]);
          var b = dd.querySelector(".kx-dd-btn");
          if (b) b.classList.add("kx-dd-value-only");
        }
        play(players[i], mode, btn);
      }
      window.__kxPlayServer = onServerPick;

      $all(".kx-chip, .kx-chip-proxy").forEach(function (btn) {
        btn.onclick = function (e) {
          if (btn.classList.contains("kx-lang-hide")) return;
          if (e) e.stopPropagation();
          var i = Number(btn.dataset.i);
          var mode = btn.dataset.mode || "iframe";
          onServerPick(i, mode, btn);
        };
      });

      if (window.__kxPick) {
        var pk = window.__kxPick;
        window.__kxPick = null;
        onServerPick(pk.i, pk.mode, pk.btn);
      }

      // Auto: preferido → primer normal → primer directo
      function pickUpnShare(list) {
        if (!list || !list.length) return null;
        for (var ui = 0; ui < list.length; ui++) {
          var px = list[ui];
          var lab = serverLabel(px).toLowerCase();
          var pr = String(
            (px &&
              (px.provider ||
                px.servidor ||
                px.server ||
                px.name)) ||
              ""
          ).toLowerCase();
          var url = String((px && (px.url || px.link)) || "").toLowerCase();
          if (
            lab.indexOf("upnshare") !== -1 ||
            lab.indexOf("upn") !== -1 ||
            pr.indexOf("upnshare") !== -1 ||
            pr.indexOf("upn") !== -1 ||
            url.indexOf("uns.bio") !== -1 ||
            url.indexOf("animeav1.uns") !== -1 ||
            url.indexOf("upnshare") !== -1
          ) {
            return px;
          }
        }
        return null;
      }

      var auto = null;
      var autoMode = "iframe";

      // Anime (4/5): preferir UPNShare solo en esta sesión (no localStorage)
      if (isAnimeSourceId(sourceId)) {
        auto =
          pickUpnShare(normals) ||
          pickUpnShare(players) ||
          pickUpnShare(directs);
        if (auto) {
          autoMode =
            normals.indexOf(auto) >= 0
              ? "iframe"
              : isDirectPlayer(auto)
                ? "direct"
                : "iframe";
        }
      }
      // Primer servidor del idioma (sin pisar preferencia anime/UPN si ya hay auto)
      function firstOfLang(list, key) {
        if (!list || !list.length) return null;
        if (!key || key === "all") return list[0];
        for (var fi = 0; fi < list.length; fi++) {
          if (langKey(list[fi]) === key) return list[fi];
        }
        return null;
      }
      // Solo si aún no hay auto (UPN anime se respeta)
      if (!auto) {
        auto =
          firstOfLang(normals, preferredLangForAuto) ||
          firstOfLang(directs, preferredLangForAuto) ||
          normals[0] ||
          directs[0] ||
          players[0];
        if (auto) {
          autoMode =
            isDirectPlayer(auto) && !isNormalPlayer(auto) ? "direct" : "iframe";
          if (normals.indexOf(auto) >= 0) autoMode = "iframe";
          else if (directs.indexOf(auto) >= 0) autoMode = "direct";
        }
      }
      var autoIdx = players.indexOf(auto);
      var autoBtn = $(
        '.kx-chip-proxy[data-i="' + autoIdx + '"][data-mode="' + autoMode + '"]'
      ) || $(
        '.kx-chip[data-i="' + autoIdx + '"][data-mode="' + autoMode + '"]'
      ) || $('.kx-chip-proxy[data-i="' + autoIdx + '"]') || $('.kx-chip[data-i="' + autoIdx + '"]');
      if (autoBtn) {
        var dd = autoBtn.closest(".kx-dd");
        if (dd) {
          var val = dd.querySelector(".kx-dd-value");
          if (val && auto) val.textContent = serverLabel(auto);
          var b = dd.querySelector(".kx-dd-btn");
          if (b) b.classList.add("kx-dd-value-only");
        }
      }
      if (auto) play(auto, autoMode, autoBtn);
      else box.innerHTML = '<div class="player-empty"><span class="kx-empty-ico">▶</span><span class="kx-load-text">Selecciona un servidor.</span></div>';
    } catch (e) {
      $("#view").innerHTML =
        '<div class="load">' + esc(e.message || String(e)) + "</div>";
    }
  };
})();
