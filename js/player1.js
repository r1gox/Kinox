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
      "play_url",
      "proxy_url",
      "proxy_master",
      "master",
      "hls",
      "play_direct",
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



  var WATCHED_KEY = "kx_watched_eps";
  function loadWatchedMap() {
    try {
      var raw = localStorage.getItem(WATCHED_KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o && typeof o === "object" ? o : {};
    } catch (_) { return {}; }
  }
  function saveWatchedMap(map) {
    try { localStorage.setItem(WATCHED_KEY, JSON.stringify(map)); } catch (_) {}
  }
  function epWatchKey(tvId, season, episode) {
    return "tv:" + String(tvId || "") + ":" + String(season || "1") + ":" + String(episode || "1");
  }
  function markEpisodeWatched(tvId, season, episode) {
    if (!tvId || !episode) return;
    var map = loadWatchedMap();
    map[epWatchKey(tvId, season, episode)] = Date.now();
    saveWatchedMap(map);
  }
  function isEpisodeWatched(tvId, season, episode) {
    return !!loadWatchedMap()[epWatchKey(tvId, season, episode)];
  }
  function showKxToast(msg, kind) {
    kind = kind || "error";
    var el = document.getElementById("kxToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "kxToast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.className = "kx-toast kx-toast--" + kind + " is-on";
    el.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("is-on"); }, 4200);
  }
  function suggestOtherServer(failed, players) {
    if (!players || !players.length) return "";
    var failedName = serverLabel(failed).toLowerCase();
    for (var i = 0; i < players.length; i++) {
      var n = serverLabel(players[i]).toLowerCase();
      if (n && n !== failedName) return serverLabel(players[i]);
    }
    return "";
  }
  function setPlayerPlaying(on) {
    var shell = document.querySelector(".kx-player-shell");
    var bg = document.getElementById("kxPlayerBg");
    var frame = document.querySelector(".kx-player-frame");
    if (shell) shell.classList.toggle("is-playing", !!on);
    if (bg) bg.classList.toggle("is-dim", !!on);
    document.body.classList.toggle("kx-cinema", !!on);
    if (frame) {
      frame.classList.add("kx-server-swap");
      clearTimeout(frame._swapT);
      frame._swapT = setTimeout(function () {
        frame.classList.remove("kx-server-swap");
      }, 450);
    }
  }

  function applyAmbientFromPoster(url) {
    if (!url) return;
    try {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () {
        try {
          var c = document.createElement("canvas");
          var w = 24;
          var h = 24;
          c.width = w;
          c.height = h;
          var ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          var data = ctx.getImageData(0, 0, w, h).data;
          var r = 0, g = 0, b = 0, n = 0;
          for (var i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            n++;
          }
          if (!n) return;
          r = Math.round(r / n);
          g = Math.round(g / n);
          b = Math.round(b / n);
          var glow = "rgba(" + r + "," + g + "," + b + ",0.45)";
          var soft = "rgba(" + r + "," + g + "," + b + ",0.18)";
          document.documentElement.style.setProperty("--kx-ambient", glow);
          document.documentElement.style.setProperty("--kx-ambient-soft", soft);
          var shell = document.querySelector(".kx-player-shell");
          if (shell) shell.classList.add("has-ambient");
        } catch (_) {}
      };
      img.src = url;
    } catch (_) {}
  }

  function shareWhatsApp() {
    var u = encodeURIComponent(location.href);
    var text = encodeURIComponent(document.title || "Ver en Kinox");
    window.open("https://wa.me/?text=" + text + "%20" + u, "_blank", "noopener");
  }

  /** Como detail.js de Kinox: credits vía append_to_response */
  async function loadTmdbExtras(type, id) {
    var out = { cast: [], overview: "", similar: [] };
    if (!id || typeof tmdb !== "function") return out;
    try {
      if (typeof ensureTmdbReady === "function") {
        try { await ensureTmdbReady(); } catch (_) {}
      }
      // Misma forma que pages/detalle: append_to_response=credits
      var x = await tmdb("/" + type + "/" + id, {
        append_to_response: "credits"
      });
      if (x && x.overview) out.overview = String(x.overview).trim();
      var cast = (x && x.credits && x.credits.cast) || [];
      var imgBase =
        typeof IMG !== "undefined" ? IMG : "https://image.tmdb.org/t/p/";
      out.cast = cast.slice(0, 16).map(function (c) {
        return {
          name: c.name || "",
          character: c.character || "",
          profile: c.profile_path ? imgBase + "w185" + c.profile_path : ""
        };
      });
    } catch (e) {
      console.warn("[kx] credits", e);
      // Fallback endpoint /credits
      try {
        var creds = await tmdb("/" + type + "/" + id + "/credits");
        var cast2 = (creds && creds.cast) || [];
        var imgB =
          typeof IMG !== "undefined" ? IMG : "https://image.tmdb.org/t/p/";
        out.cast = cast2.slice(0, 16).map(function (c) {
          return {
            name: c.name || "",
            character: c.character || "",
            profile: c.profile_path ? imgB + "w185" + c.profile_path : ""
          };
        });
      } catch (_) {}
    }
    return out;
  }

  /** Similares desde el worker (misma lógica que detail.js fetchWorkerSimilar) */
  async function fetchWorkerSimilarPlayer(opts) {
    opts = opts || {};
    var base =
      typeof workerBaseUrl === "function"
        ? workerBaseUrl()
        : "https://moviezone.tvjz.workers.dev";
    var sid = String(opts.sourceId || opts.source_id || "9");
    if (sid === "animeav1") sid = "4";
    if (sid === "jkanime") sid = "5";
    if (sid === "pelisplushd") sid = "3";
    if (sid === "pelisplushd_bz") sid = "9";
    if (opts.type === "anime" && (!opts.sourceId || opts.sourceId === "9")) {
      sid = "4";
    }
    var title = opts.title || opts.slug || "";
    var curSlug = String(opts.slug || "").toLowerCase();
    var q = String(title)
      .replace(/[:\-–—].*$/, "")
      .replace(/\(\s*\d{4}\s*\)/g, "")
      .trim();
    var words = q.split(/\s+/).filter(Boolean);
    if (words.length > 5) q = words.slice(0, 4).join(" ");
    var out = [];
    var seen = Object.create(null);

    function sameFamily(isid) {
      isid = String(isid || "");
      if (sid === "4" || sid === "5") {
        return (
          isid === "4" ||
          isid === "5" ||
          isid === "animeav1" ||
          isid === "jkanime" ||
          !isid
        );
      }
      if (sid === "9" || sid === "3" || sid === "1") {
        return (
          isid === "9" ||
          isid === "3" ||
          isid === "1" ||
          isid === "pelisplushd" ||
          isid === "pelisplushd_bz" ||
          isid === "lamovie" ||
          !isid
        );
      }
      return !isid || isid === sid;
    }

    async function addFrom(path) {
      try {
        var r = await fetch(base.replace(/\/$/, "") + path, {
          headers: { Accept: "application/json" }
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
          var key = isid + "|" + String(it.slug).toLowerCase();
          if (seen[key]) continue;
          seen[key] = 1;
          out.push({
            title: it.title || it.titulo || it.nombre || it.slug,
            slug: it.slug,
            portada: it.portada || it.image || it.poster || "",
            source_id: isid || sid,
            type: it.type || it.tipo || opts.type || "movie",
            id: it.tmdb_id || it.id || null
          });
        }
      } catch (_) {}
    }

    if (q) {
      // búsqueda universal + por fuente
      await addFrom("/?q=" + encodeURIComponent(q));
      if (out.length < 6) {
        await addFrom("/" + sid + "/buscar?q=" + encodeURIComponent(q));
      }
    }
    if (out.length < 8) {
      if (sid === "4" || sid === "5") await addFrom("/4/home");
      else if (String(opts.type) === "tv" || opts.type === "serie")
        await addFrom("/1/series?page=1");
      else await addFrom("/1/peliculas?page=1");
    }
    return out.slice(0, 14);
  }

  function renderWorkerSimilarRow(list) {
    if (!list || !list.length) return "";
    return (
      '<div class="kx-row-block" id="kxSimilarBlock">' +
      '<h3 class="kx-block-title">Recomendaciones</h3>' +
      '<div class="kx-hscroll">' +
      list
        .map(function (m) {
          var isTv =
            /serie|tv|anime/i.test(String(m.type || "")) ||
            String(m.source_id) === "4" ||
            String(m.source_id) === "5";
          var page = isTv ? "detalle-serie.html" : "detalle.html";
          var href =
            typeof pageHref === "function"
              ? pageHref(page, {
                  id: m.id || "",
                  slug: m.slug || "",
                  source_id: m.source_id || "",
                  title: m.title || ""
                })
              : page +
                "?slug=" +
                encodeURIComponent(m.slug || "") +
                (m.id ? "&id=" + encodeURIComponent(m.id) : "") +
                (m.source_id
                  ? "&source_id=" + encodeURIComponent(m.source_id)
                  : "");
          return (
            '<a class="kx-sim-card" href="' +
            href +
            '">' +
            (m.portada
              ? '<img src="' +
                m.portada +
                '" alt="" loading="lazy" onerror="this.style.opacity=.3"/>'
              : '<div class="kx-sim-ph"></div>') +
            '<div class="kx-sim-name">' +
            esc(m.title || m.slug || "") +
            "</div></a>"
          );
        })
        .join("") +
      "</div></div>"
    );
  }


  function renderCastRow(list) {
    if (!list || !list.length) return "";
    return (
      '<div class="kx-row-block" id="kxCastBlock">' +
      '<h3 class="kx-block-title">Reparto</h3>' +
      '<div class="kx-hscroll">' +
      list
        .map(function (c) {
          return (
            '<div class="kx-cast-card" title="' +
            esc(c.character || "") +
            '">' +
            (c.profile
              ? '<img src="' + c.profile + '" alt="" loading="lazy"/>'
              : '<div class="kx-cast-ph">' +
                esc((c.name || "?").charAt(0)) +
                "</div>") +
            '<div class="kx-cast-name">' +
            esc(c.name) +
            "</div>" +
            (c.character
              ? '<div class="kx-cast-role">' + esc(c.character) + "</div>"
              : "") +
            "</div>"
          );
        })
        .join("") +
      "</div></div>"
    );
  }

  function renderSimilarRow(list) {
    if (!list || !list.length) return "";
    return (
      '<div class="kx-row-block" id="kxSimilarBlock">' +
      '<h3 class="kx-block-title">Similares</h3>' +
      '<div class="kx-hscroll">' +
      list
        .map(function (m) {
          var href =
            typeof pageHref === "function"
              ? pageHref(
                  m.mediaType === "tv" ? "detalle-serie.html" : "detalle.html",
                  { id: m.id }
                )
              : (m.mediaType === "tv" ? "detalle-serie.html" : "detalle.html") +
                "?id=" +
                m.id;
          return (
            '<a class="kx-sim-card" href="' +
            href +
            '">' +
            (m.poster
              ? '<img src="' + m.poster + '" alt="" loading="lazy"/>'
              : '<div class="kx-sim-ph"></div>') +
            '<div class="kx-sim-name">' +
            esc(m.title) +
            "</div></a>"
          );
        })
        .join("") +
      "</div></div>"
    );
  }

  function renderDownloads(list) {
    if (!list || !list.length) return "";
    return (
      '<div class="kx-row-block" id="kxDlBlock">' +
      '<h3 class="kx-block-title">Descargas</h3>' +
      '<div class="kx-dl-list">' +
      list
        .map(function (d) {
          var label =
            d.servidor ||
            d.server ||
            d.name ||
            d.provider ||
            "Descarga";
          var lang = d.idioma || d.language || d.lang || "";
          var qual = d.calidad || d.quality || "";
          var url = d.url || d.link || "";
          if (!url) return "";
          return (
            '<a class="kx-dl-item" href="' +
            esc(url) +
            '" target="_blank" rel="noopener noreferrer">' +
            '<span class="kx-dl-name">' +
            esc(String(label)) +
            "</span>" +
            (lang || qual
              ? '<span class="kx-dl-meta">' +
                esc([lang, qual].filter(Boolean).join(" · ")) +
                "</span>"
              : "") +
            '<span class="kx-dl-go">Abrir</span></a>'
          );
        })
        .join("") +
      "</div></div>"
    );
  }

  function collapsibleSynopsis(text, id) {
    text = String(text || "").trim();
    if (!text) return '<div class="kx-syn-wrap" id="' + (id || "kxSynopsis") + '"></div>';
    return (
      '<div class="kx-syn-wrap" id="' +
      (id || "kxSynopsis") +
      '">' +
      '<button type="button" class="kx-syn-toggle" aria-expanded="false">' +
      '<span>Sinopsis</span><span class="kx-syn-chev">▾</span></button>' +
      '<div class="kx-syn-body">' +
      esc(text) +
      "</div></div>"
    );
  }


  function setPlayerStatus(opts) {
    opts = opts || {};
    var now = document.getElementById("kxPlayerNow");
    var srv = document.getElementById("kxPlayerServer");
    var mode = document.getElementById("kxPlayerMode");
    var lang = document.getElementById("kxPlayerLang");
    var fill = document.getElementById("kxPlayerFill");
    var fillTxt = document.getElementById("kxPlayerFillTxt");
    var stat = document.getElementById("kxPlayerStat");
    if (now && opts.now != null) now.textContent = opts.now;
    if (srv && opts.server != null) srv.textContent = opts.server;
    if (mode && opts.mode != null) mode.textContent = opts.mode;
    if (lang && opts.lang != null) lang.textContent = opts.lang || "—";
    if (stat && opts.now != null) {
      stat.textContent = opts.now;
      stat.classList.toggle("is-busy", /resolv|carg/i.test(String(opts.now)));
      stat.classList.toggle("is-ok", /reproduc/i.test(String(opts.now)));
    }
    if (fill) {
      var pct = opts.pct;
      if (pct == null) {
        if (/resolv|carg/i.test(String(opts.now || ""))) pct = 35;
        else if (/reproduc/i.test(String(opts.now || ""))) pct = 100;
        else pct = 10;
      }
      fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
      fill.classList.toggle("is-pulse", pct < 100);
    }
    if (fillTxt) {
      fillTxt.textContent =
        opts.pctMsg ||
        (/reproduc/i.test(String(opts.now || ""))
          ? "Reproduciendo"
          : /resolv/i.test(String(opts.now || ""))
            ? "Resolviendo stream…"
            : "Esperando");
    }
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
          '<div class="kx-player-shell">' +
          '<div class="kx-player-shell-bg" id="kxPlayerBg" aria-hidden="true"></div>' +
          '<div class="kx-player-head">' +
          '<div class="kx-player-head-main">' +
          '<div class="kx-player-kicker" id="kxPlayerKicker">' +
          esc(String(season || "1")) +
          " · Ep " +
          esc(String(episode || "1")) +
          "</div>" +
          '<div class="kx-player-title" id="kxPlayerTitle">' +
          esc(epTitle || title) +
          "</div>" +
          "</div>" +
          '<div class="kx-player-head-meta">' +
          (epRuntime
            ? '<span class="kx-player-stat">' + esc(String(epRuntime)) + " min</span>"
            : "") +
          '<span class="kx-player-stat kx-player-stat--live" id="kxPlayerStat">En vivo</span>' +
          "</div>" +
          "</div>" +
          '<div class="kx-player-frame">' +
          '<div id="playerBox" class="kx-player mz-player"><div class="player-loading"><span class="kx-spin"></span><span class="kx-load-text">Buscando reproductores…</span></div></div>' +
          '<div class="kx-player-overlay-top" id="kxPlayerTop">' +
          '<span class="kx-live-dot" aria-hidden="true"></span>' +
          '<span class="kx-player-now" id="kxPlayerNow">Cargando…</span>' +
          "</div>" +
          '<div class="kx-player-overlay-bottom" id="kxPlayerHint">' +
          '<span>Elige servidor arriba · Directos = HLS sin ads del embed</span>' +
          "</div>" +
          "</div>" +
          '<div class="kx-player-bar" id="kxPlayerBar">' +
          '<div class="kx-player-bar-left">' +
          '<span class="kx-player-bar-label">Servidor</span>' +
          '<span class="kx-player-bar-value" id="kxPlayerServer">—</span>' +
          "</div>" +
          '<div class="kx-player-bar-mid" id="kxPlayerProgress">' +
          '<div class="kx-player-progress-track"><div class="kx-player-progress-fill" id="kxPlayerFill"></div></div>' +
          '<span class="kx-player-progress-txt" id="kxPlayerFillTxt">Listo</span>' +
          "</div>" +
          '<div class="kx-player-bar-right">' +
          '<span class="kx-player-bar-pill" id="kxPlayerMode">—</span>' +
          '<span class="kx-player-bar-pill kx-player-bar-pill--soft" id="kxPlayerLang">—</span>' +
          "</div>" +
          "</div>" +
          '<div class="kx-player-actions" id="kxPlayerActions">' +
          '<button type="button" class="kx-act" id="kxActReload" title="Reintentar">↻ Reintentar</button>' +
          '<button type="button" class="kx-act" id="kxActCopy" title="Copiar enlace">⎘ Copiar</button>' +
          '<button type="button" class="kx-act" id="kxActWa" title="WhatsApp">WhatsApp</button>' +
          '<button type="button" class="kx-act kx-act--cine" id="kxActCine" title="Modo cine">🎬 Cine</button>' +
          '<span class="kx-act-note" id="kxActNote">Kinox · fuentes del worker</span>' +
          "</div>" +
          "</div>" +
          "</div>" +
          '<aside class="kx-sidebar" id="kxSidebar">' +
          '<div class="kx-sidebar-head">Episodios · T' +
          esc(season || "1") +
          " E" +
          esc(episode) +
          "</div>" +
          '<div class="kx-ep-list" id="kxEpList">' +
          '<div class="kx-skel-ep"><div class="kx-skel-thumb"></div><div class="kx-skel-lines"><i></i><i></i></div></div>' +
          '<div class="kx-skel-ep"><div class="kx-skel-thumb"></div><div class="kx-skel-lines"><i></i><i></i></div></div>' +
          '<div class="kx-skel-ep"><div class="kx-skel-thumb"></div><div class="kx-skel-lines"><i></i><i></i></div></div>' +
          '<div class="kx-skel-ep"><div class="kx-skel-thumb"></div><div class="kx-skel-lines"><i></i><i></i></div></div>' +
          '<div class="kx-skel-ep"><div class="kx-skel-thumb"></div><div class="kx-skel-lines"><i></i><i></i></div></div>' +
          '<div class="kx-skel-ep"><div class="kx-skel-thumb"></div><div class="kx-skel-lines"><i></i><i></i></div></div>' +
          "</div>" +
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
          "</div>" +
          '<div class="kx-below-player">' +
          collapsibleSynopsis(epOverview || overview, "kxSynopsis") +
          '<div id="kxExtras"></div>' +
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
          '<div class="kx-hero"><div class="kx-player-shell">' +
          '<div class="kx-player-shell-bg" id="kxPlayerBg" aria-hidden="true"></div>' +
          '<div class="kx-player-head"><div class="kx-player-head-main">' +
          '<div class="kx-player-kicker">Película</div>' +
          '<div class="kx-player-title" id="kxPlayerTitle">' + esc(title) + "</div></div>" +
          '<div class="kx-player-head-meta"><span class="kx-player-stat kx-player-stat--live" id="kxPlayerStat">Listo</span></div></div>' +
          '<div class="kx-player-frame">' +
          '<div id="playerBox" class="mz-player kx-player"><div class="player-loading"><span class="kx-spin"></span><span class="kx-load-text">Buscando reproductores…</span></div></div>' +
          '<div class="kx-player-overlay-top" id="kxPlayerTop"><span class="kx-live-dot"></span><span class="kx-player-now" id="kxPlayerNow">Cargando…</span></div>' +
          '<div class="kx-player-overlay-bottom"><span>Cambia de servidor si uno no carga</span></div></div>' +
          '<div class="kx-player-bar" id="kxPlayerBar"><div class="kx-player-bar-left"><span class="kx-player-bar-label">Servidor</span><span class="kx-player-bar-value" id="kxPlayerServer">—</span></div>' +
          '<div class="kx-player-bar-mid"><div class="kx-player-progress-track"><div class="kx-player-progress-fill" id="kxPlayerFill"></div></div><span class="kx-player-progress-txt" id="kxPlayerFillTxt">Listo</span></div>' +
          '<div class="kx-player-bar-right"><span class="kx-player-bar-pill" id="kxPlayerMode">—</span><span class="kx-player-bar-pill kx-player-bar-pill--soft" id="kxPlayerLang">—</span></div></div>' +
          '<div class="kx-player-actions"><button type="button" class="kx-act" id="kxActReload">↻ Reintentar</button>' +
          '<button type="button" class="kx-act" id="kxActCopy">⎘ Copiar</button>' +
          '<button type="button" class="kx-act" id="kxActWa">WhatsApp</button>' +
          '<button type="button" class="kx-act kx-act--cine" id="kxActCine">🎬 Cine</button>' +
          '<span class="kx-act-note">Kinox · fuentes del worker</span></div></div></div>' +
          '<div class="kx-block"><h3 class="kx-block-title">Reproductores</h3><div class="kx-chips" id="kxServers"></div></div>' +
          '<div class="kx-block"><h3 class="kx-block-title">Directos</h3><div class="kx-chips" id="kxDirects"></div></div>' +
          '<div class="kx-below-player">' +
          collapsibleSynopsis(overview, "kxSynopsis") +
          '<div id="kxExtras"></div>' +
          "</div>" +
          "</section>";
      }


      // CSS crítico de sinopsis/reparto (no depende del HUD)
      if (!document.getElementById("kx-extras-style")) {
        var st = document.createElement("style");
        st.id = "kx-extras-style";
        st.textContent =
          ".kx-below-player{display:block!important;width:100%;max-width:1100px;margin:18px auto 28px;padding:0 16px;box-sizing:border-box}" +
          ".kx-syn-wrap{display:block!important;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(255,255,255,.04);overflow:hidden}" +
          ".kx-syn-toggle{width:100%;display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border:0;background:transparent;color:#f1f5f9;font:inherit;font-weight:800;cursor:pointer}" +
          ".kx-syn-body{display:none;padding:0 14px 14px;color:#c9d4e8;font-size:.92rem;line-height:1.55}" +
          ".kx-syn-wrap.is-open .kx-syn-body{display:block}" +
          ".kx-syn-wrap.is-open .kx-syn-chev{transform:rotate(180deg);display:inline-block}" +
          ".kx-row-block{margin-top:16px}" +
          ".kx-hscroll{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}" +
          ".kx-cast-card,.kx-sim-card{flex:0 0 auto;width:110px;color:inherit;text-decoration:none}" +
          ".kx-cast-card img,.kx-sim-card img,.kx-cast-ph,.kx-sim-ph{width:110px;height:150px;object-fit:cover;border-radius:12px;background:#1a1228;display:block}" +
          ".kx-cast-name,.kx-sim-name{font-size:.78rem;font-weight:700;margin-top:6px;color:#e2e8f0}" +
          ".kx-cast-role{font-size:.7rem;color:#94a3b8}" +
          ".kx-dl-item{display:flex;gap:10px;padding:10px 12px;margin-top:8px;border-radius:12px;border:1px solid rgba(255,255,255,.08);color:#e2e8f0;text-decoration:none}" +
          ".kx-block-title{font-size:.9rem;font-weight:800;margin:0 0 10px;color:#e9ddff}";
        document.head.appendChild(st);
      }

      var box = $("#playerBox");

      // Fondo suave con poster si hay
      (function () {
        var bg = document.getElementById("kxPlayerBg");
        if (bg && poster) {
          bg.style.backgroundImage =
            "linear-gradient(180deg,rgba(10,8,18,.55),rgba(10,8,18,.92)),url(" +
            poster +
            ")";
        }
        var reload = document.getElementById("kxActReload");
        if (reload) {
          reload.onclick = function () {
            if (window.__kxLastPlay) {
              var lp = window.__kxLastPlay;
              play(lp.p, lp.mode, lp.btn);
            } else {
              location.reload();
            }
          };
        }
        var copy = document.getElementById("kxActCopy");
        if (copy) {
          copy.onclick = function () {
            var url = location.href;
            function ok() {
              copy.textContent = "✓ Copiado";
              showKxToast("Enlace copiado", "ok");
              setTimeout(function () {
                copy.textContent = "⎘ Copiar";
              }, 1500);
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(url).then(ok).catch(function () {
                prompt("Copia el enlace:", url);
              });
            } else {
              prompt("Copia el enlace:", url);
            }
          };
        }
        var wa = document.getElementById("kxActWa");
        if (wa) wa.onclick = function () { shareWhatsApp(); };
        var cine = document.getElementById("kxActCine");
        if (cine) {
          cine.onclick = function () {
            document.body.classList.toggle("kx-cinema");
            cine.classList.toggle("is-on", document.body.classList.contains("kx-cinema"));
          };
        }
        // Sinopsis colapsable
        $all(".kx-syn-toggle").forEach(function (btn) {
          btn.onclick = function () {
            var wrap = btn.closest(".kx-syn-wrap");
            if (!wrap) return;
            var open = wrap.classList.toggle("is-open");
            btn.setAttribute("aria-expanded", open ? "true" : "false");
          };
        });
        if (poster) applyAmbientFromPoster(poster);
      })();

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
      // Descargas + extras TMDB (reparto / similares)
      (function fillExtras() {
        var host = document.getElementById("kxExtras");
        if (!host) {
          // Crear contenedor si el shell no lo trajo
          var section = document.querySelector(".kx-ep-view, .kx-movie-view, #view");
          host = document.createElement("div");
          host.id = "kxExtras";
          host.className = "kx-below-player";
          if (section) section.appendChild(host);
          else document.body.appendChild(host);
        }
        // Sinopsis garantizada visible
        var syn = document.getElementById("kxSynopsis");
        if (!syn) {
          var holder = document.querySelector(".kx-below-player") || host.parentElement || host;
          var tmp = document.createElement("div");
          tmp.innerHTML = collapsibleSynopsis(
            (typeof overview !== "undefined" ? overview : "") ||
              (typeof epOverview !== "undefined" ? epOverview : "") ||
              "",
            "kxSynopsis"
          );
          if (tmp.firstChild) holder.insertBefore(tmp.firstChild, host);
          syn = document.getElementById("kxSynopsis");
        }

        var dls =
          data.descargas ||
          data.downloads ||
          (data.data && data.data.descargas) ||
          [];
        if (!Array.isArray(dls)) dls = [];
        host.innerHTML = renderDownloads(dls);

        // Sinopsis: worker primero (como detail.js), luego TMDB
        var workerOverview = String(
          data.descripcion || data.overview || data.sinopsis || ""
        ).trim();
        var synWrap = document.getElementById("kxSynopsis");
        if (synWrap && workerOverview) {
          var body = synWrap.querySelector(".kx-syn-body");
          if (body) body.innerHTML = esc(workerOverview);
          synWrap.classList.add("is-open");
          var btn = synWrap.querySelector(".kx-syn-toggle");
          if (btn) btn.setAttribute("aria-expanded", "true");
        }

        var tmdbType = type === "tv" ? "tv" : "movie";
        var tmdbId =
          (meta && meta.id) ||
          (data.tmdb_id && String(data.tmdb_id)) ||
          (id && /^\d+$/.test(String(id)) ? String(id) : null) ||
          null;

        // Reparto TMDB (credits) — igual que mzCastRow en detail.js
        if (tmdbId && typeof tmdb === "function") {
          loadTmdbExtras(tmdbType, tmdbId)
            .then(function (ex) {
              if (
                synWrap &&
                ex.overview &&
                (!workerOverview ||
                  (synWrap.querySelector(".kx-muted") &&
                    !workerOverview))
              ) {
                var body2 = synWrap.querySelector(".kx-syn-body");
                if (body2 && (!body2.textContent || /Sin sinopsis/i.test(body2.textContent))) {
                  body2.innerHTML = esc(ex.overview);
                  synWrap.classList.add("is-open");
                }
              }
              var castHtml = renderCastRow(ex.cast);
              if (castHtml) host.insertAdjacentHTML("beforeend", castHtml);
            })
            .catch(function (e) {
              console.warn("[kx] cast", e);
            });
        }

        // Similares desde worker (no TMDB) — como detail.js
        fetchWorkerSimilarPlayer({
          title: title,
          slug: slug,
          sourceId: sourceId || (data.source_id || data.fuente),
          type: type === "tv" ? "tv" : type
        })
          .then(function (sim) {
            var html = renderWorkerSimilarRow(sim);
            if (html) host.insertAdjacentHTML("beforeend", html);
          })
          .catch(function (e) {
            console.warn("[kx] similares worker", e);
          });
      })();


      // Asegurar toggles de sinopsis (por si el DOM se pintó después)
      setTimeout(function () {
        $all(".kx-syn-toggle").forEach(function (btn) {
          if (btn._kxBound) return;
          btn._kxBound = 1;
          btn.onclick = function () {
            var wrap = btn.closest(".kx-syn-wrap");
            if (!wrap) return;
            var open = wrap.classList.toggle("is-open");
            btn.setAttribute("aria-expanded", open ? "true" : "false");
          };
        });
        var syn = document.getElementById("kxSynopsis");
        if (syn && !syn.classList.contains("is-open")) {
          var body = syn.querySelector(".kx-syn-body");
          if (body && body.textContent && !/Sin sinopsis/i.test(body.textContent)) {
            syn.classList.add("is-open");
          }
        }
      }, 0);

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
            ".kx-player-shell{position:relative;display:flex;flex-direction:column;" +
            "border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,.18);" +
            "background:linear-gradient(165deg,rgba(24,18,40,.95),rgba(8,6,14,.98));" +
            "box-shadow:0 18px 50px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.05)}" +
            ".kx-player-shell-bg{position:absolute;inset:0;background-size:cover;background-position:center;" +
            "filter:blur(18px) saturate(1.15);opacity:.28;pointer-events:none;transform:scale(1.08)}" +
            ".kx-player-head,.kx-player-frame,.kx-player-bar,.kx-player-actions{position:relative;z-index:1}" +
            ".kx-player-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;" +
            "padding:14px 16px 10px}" +
            ".kx-player-kicker{font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;" +
            "color:#a78bfa;margin-bottom:4px}" +
            ".kx-player-title{font-size:1.05rem;font-weight:800;color:#f8fafc;line-height:1.25;" +
            "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
            ".kx-player-head-meta{display:flex;gap:8px;flex-shrink:0}" +
            ".kx-player-stat{font-size:.72rem;font-weight:700;padding:5px 10px;border-radius:999px;" +
            "background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);color:#cbd5e1}" +
            ".kx-player-stat--live.is-busy{color:#fde68a;border-color:rgba(251,191,36,.35);background:rgba(251,191,36,.1)}" +
            ".kx-player-stat--live.is-ok{color:#bbf7d0;border-color:rgba(74,222,128,.35);background:rgba(74,222,128,.1)}" +
            ".kx-player-frame{position:relative;width:100%;margin:0 0}" +
            ".kx-player-frame .kx-player,.kx-player-frame .mz-player{border-radius:0;border:0;box-shadow:none;aspect-ratio:16/9;background:#000}" +
            ".kx-player-overlay-top{position:absolute;left:0;right:0;top:0;z-index:4;display:flex;align-items:center;gap:8px;" +
            "padding:10px 12px;background:linear-gradient(180deg,rgba(0,0,0,.7),transparent);pointer-events:none;" +
            "font-size:.8rem;font-weight:700;color:#f1f5f9}" +
            ".kx-player-overlay-bottom{position:absolute;left:0;right:0;bottom:0;z-index:3;padding:10px 12px;" +
            "background:linear-gradient(0deg,rgba(0,0,0,.55),transparent);pointer-events:none;" +
            "font-size:.72rem;color:rgba(226,232,240,.85)}" +
            ".kx-live-dot{width:8px;height:8px;border-radius:50%;background:#8b5cf6;" +
            "box-shadow:0 0 0 0 rgba(139,92,246,.55);animation:kxpulse 1.6s ease infinite}" +
            "@keyframes kxpulse{0%{box-shadow:0 0 0 0 rgba(139,92,246,.5)}70%{box-shadow:0 0 0 8px rgba(139,92,246,0)}100%{box-shadow:0 0 0 0 rgba(139,92,246,0)}}" +
            ".kx-player-bar{display:flex;align-items:center;gap:14px;padding:10px 14px;" +
            "background:rgba(0,0,0,.4);border-top:1px solid rgba(255,255,255,.06)}" +
            ".kx-player-bar-left{display:flex;flex-direction:column;gap:2px;min-width:0;flex:0 1 auto}" +
            ".kx-player-bar-label{font-size:.65rem;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700}" +
            ".kx-player-bar-value{font-size:.9rem;font-weight:800;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px}" +
            ".kx-player-bar-mid{flex:1;min-width:80px;display:flex;flex-direction:column;gap:4px}" +
            ".kx-player-progress-track{height:4px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}" +
            ".kx-player-progress-fill{height:100%;width:10%;border-radius:999px;" +
            "background:linear-gradient(90deg,#8b5cf6,#c4b5fd);transition:width .35s ease}" +
            ".kx-player-progress-fill.is-pulse{animation:kxfill 1.2s ease infinite}" +
            "@keyframes kxfill{0%,100%{filter:brightness(1)}50%{filter:brightness(1.35)}}" +
            ".kx-player-progress-txt{font-size:.68rem;color:#94a3b8;font-weight:600}" +
            ".kx-player-bar-right{display:flex;gap:6px;flex-shrink:0}" +
            ".kx-player-bar-pill{font-size:.7rem;font-weight:800;padding:5px 9px;border-radius:999px;" +
            "background:rgba(139,92,246,.22);border:1px solid rgba(139,92,246,.35);color:#e9ddff}" +
            ".kx-player-bar-pill--soft{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.1);color:#cbd5e1}" +
            ".kx-player-actions{display:flex;align-items:center;gap:8px;padding:8px 12px 12px;" +
            "border-top:1px solid rgba(255,255,255,.04);background:rgba(0,0,0,.2)}" +
            ".kx-act{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#e2e8f0;" +
            "border-radius:10px;padding:7px 12px;font-size:.78rem;font-weight:700;cursor:pointer;font:inherit}" +
            ".kx-act:hover{border-color:rgba(139,92,246,.45);background:rgba(139,92,246,.12)}" +
            ".kx-act-note{margin-left:auto;font-size:.72rem;color:#64748b}" +
            ".kx-player-wrap{position:relative;width:100%;isolation:isolate}" +
            ".kx-player-hud{position:absolute;top:10px;right:10px;left:auto;z-index:6;display:flex;flex-wrap:wrap;" +
            "align-items:flex-start;gap:8px;pointer-events:none;max-width:calc(100% - 20px);justify-content:flex-end}" +
            ".kx-player-hud .kx-dd{pointer-events:auto}" +
            ".kx-dd{position:relative}" +
            ".kx-dd-btn{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:10px;" +
            "border:1px solid rgba(255,255,255,.12);background:rgba(10,8,18,.82);backdrop-filter:blur(12px);" +
            "-webkit-backdrop-filter:blur(12px);color:#f1f5f9;font-size:.8rem;font-weight:700;cursor:pointer;" +
            "box-shadow:0 8px 24px rgba(0,0,0,.35)}" +
            ".kx-dd-btn:hover{border-color:rgba(139,92,246,.55)}" +
            ".kx-dd.open .kx-dd-btn{border-color:#8b5cf6}" +
            ".kx-dd-label{opacity:.55;font-size:.68rem;letter-spacing:.04em;text-transform:uppercase}" +
            ".kx-dd-value{font-weight:800}" +
            ".kx-dd-value-only .kx-dd-label{display:none}" +
            ".kx-dd-menu{position:absolute;top:calc(100% + 6px);right:0;left:auto;min-width:200px;max-height:260px;" +
            "overflow:auto;padding:6px;border-radius:12px;display:none;z-index:20;background:rgba(12,10,20,.96);" +
            "border:1px solid rgba(139,92,246,.2);box-shadow:0 16px 40px rgba(0,0,0,.55)}" +
            ".kx-dd.open .kx-dd-menu{display:block}" +
            ".kx-dd-menu button,.kx-chip-proxy{display:flex;width:100%;align-items:center;justify-content:space-between;" +
            "gap:10px;padding:9px 11px;border:0;border-radius:9px;background:transparent;color:#e8eef8;" +
            "font-size:.84rem;font-weight:600;cursor:pointer;text-align:left}" +
            ".kx-dd-menu button:hover,.kx-chip-proxy:hover{background:rgba(139,92,246,.16)}" +
            ".kx-dd-menu button.active,.kx-chip-proxy.active{background:rgba(139,92,246,.28)}" +
            ".kx-dd-meta{font-size:.72rem;color:#a5b4c8;font-weight:700}" +
            ".kx-dd-empty{padding:10px;color:#64748b;font-size:.84rem}" +
            ".kx-lang-hide{display:none!important}" +
            ".kx-block--servers-hidden{display:none!important}" +
            ".kx-chip.active{box-shadow:0 0 0 1px rgba(139,92,246,.35)}" +
            ".player-loading .kx-spin{width:28px;height:28px;border:2.5px solid rgba(255,255,255,.12);" +
            "border-top-color:#8b5cf6;border-radius:50%;display:inline-block;animation:kxspin .7s linear infinite}" +
            "@keyframes kxspin{to{transform:rotate(360deg)}}" +
            ".player-loading,.player-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}" +
            "@media(max-width:600px){" +
            ".kx-player-head{padding:12px 12px 8px;flex-wrap:wrap}" +
            ".kx-player-title{font-size:.95rem}" +
            ".kx-player-bar{flex-wrap:wrap;gap:8px}" +
            ".kx-player-bar-value{max-width:110px}" +
            ".kx-act-note{display:none}" +
            ".kx-player-hud{top:6px;right:6px}" +
            ".kx-dd-btn{padding:6px 10px;font-size:.78rem}}" +
            ".kx-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(20px);z-index:9999;max-width:min(420px,92vw);padding:12px 16px;border-radius:12px;background:rgba(20,12,28,.96);border:1px solid rgba(239,68,68,.45);color:#fecaca;font-size:.88rem;font-weight:700;line-height:1.35;box-shadow:0 12px 40px rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}" +
            ".kx-toast.is-on{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto}" +
            ".kx-toast--error{border-color:rgba(239,68,68,.5);color:#fecaca}" +
            ".kx-toast--ok{border-color:rgba(74,222,128,.4);color:#bbf7d0}" +
            ".kx-player-shell.is-playing .kx-player-shell-bg,.kx-player-shell-bg.is-dim{opacity:.06;filter:blur(22px) saturate(.8);transition:opacity .5s,filter .5s}" +
            ".kx-player-shell-bg{transition:opacity .5s,filter .5s}" +
            ".kx-skel-ep{display:flex;gap:10px;padding:8px;margin-bottom:6px}" +
            ".kx-skel-thumb{width:112px;min-width:112px;aspect-ratio:16/9;border-radius:8px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.09),rgba(255,255,255,.04));background-size:200% 100%;animation:kxshimmer 1.1s ease infinite}" +
            ".kx-skel-lines{flex:1;display:flex;flex-direction:column;justify-content:center;gap:8px}" +
            ".kx-skel-lines i{display:block;height:10px;border-radius:6px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.09),rgba(255,255,255,.04));background-size:200% 100%;animation:kxshimmer 1.1s ease infinite}" +
            ".kx-skel-lines i:first-child{width:88%}" +
            ".kx-skel-lines i:last-child{width:55%}" +
            "@keyframes kxshimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}" +
            ".kx-ep-card.is-watched .kx-ep-name{color:#94a3b8}" +
            ".kx-badge-watched{position:absolute;left:6px;top:6px;font-size:.65rem;font-weight:800;padding:3px 6px;border-radius:6px;background:rgba(16,185,129,.9);color:#fff;letter-spacing:.02em;z-index:2}" +
            ".kx-ep-check{color:#34d399;font-weight:900}" +
            ".kx-ep-num.is-watched{border-color:rgba(52,211,153,.45);color:#6ee7b7}" +
            ".kx-syn-wrap{margin-top:16px;border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;background:rgba(255,255,255,.03)}" +
            ".kx-syn-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border:0;background:transparent;color:#e2e8f0;font:inherit;font-weight:800;font-size:.88rem;cursor:pointer}" +
            ".kx-syn-chev{transition:transform .2s;opacity:.7}" +
            ".kx-syn-wrap.is-open .kx-syn-chev{transform:rotate(180deg)}" +
            ".kx-syn-body{display:none;padding:0 14px 14px;color:#b4c3db;font-size:.92rem;line-height:1.55}" +
            ".kx-syn-wrap.is-open .kx-syn-body{display:block}" +
            ".kx-row-block{margin-top:18px}" +
            ".kx-hscroll{display:flex;gap:12px;overflow-x:auto;padding:4px 2px 10px;scroll-snap-type:x mandatory;scrollbar-width:thin}" +
            ".kx-cast-card,.kx-sim-card{flex:0 0 auto;width:110px;scroll-snap-align:start;text-decoration:none;color:inherit}" +
            ".kx-cast-card img,.kx-sim-card img,.kx-cast-ph,.kx-sim-ph{width:110px;height:150px;object-fit:cover;border-radius:12px;background:#1a1228;display:block}" +
            ".kx-cast-ph,.kx-sim-ph{display:flex;align-items:center;justify-content:center;font-size:1.6rem;font-weight:800;color:#64748b}" +
            ".kx-cast-name,.kx-sim-name{font-size:.78rem;font-weight:700;margin-top:6px;line-height:1.25;color:#e2e8f0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
            ".kx-cast-role{font-size:.7rem;color:#94a3b8;margin-top:2px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}" +
            ".kx-dl-list{display:flex;flex-direction:column;gap:8px}" +
            ".kx-dl-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#e2e8f0;text-decoration:none}" +
            ".kx-dl-item:hover{border-color:rgba(139,92,246,.4);background:rgba(139,92,246,.1)}" +
            ".kx-dl-name{font-weight:800;font-size:.88rem}" +
            ".kx-dl-meta{font-size:.75rem;color:#94a3b8;margin-left:4px}" +
            ".kx-dl-go{margin-left:auto;font-size:.75rem;font-weight:800;color:#c4b5fd}" +
            ".kx-player-shell.has-ambient{box-shadow:0 18px 50px rgba(0,0,0,.5),0 0 80px var(--kx-ambient-soft,transparent)}" +
            ".kx-player-shell.has-ambient::before{content:\"\";position:absolute;inset:-20% -10% auto -10%;height:60%;background:radial-gradient(ellipse at center,var(--kx-ambient,transparent),transparent 70%);opacity:.55;pointer-events:none;z-index:0}" +
            ".kx-player-frame.kx-server-swap{animation:kxswap .4s ease}" +
            "@keyframes kxswap{0%{opacity:.55;filter:blur(2px)}100%{opacity:1;filter:none}}" +
            "body.kx-cinema .kx-sidebar,body.kx-cinema .kx-block,body.kx-cinema .kx-ep-mobile,body.kx-cinema .kx-row-block,body.kx-cinema .kx-syn-wrap,body.kx-cinema .kx-info .kx-nav{opacity:.22;filter:saturate(.5);transition:opacity .35s,filter .35s;pointer-events:none}" +
            "body.kx-cinema .kx-hero,body.kx-cinema .kx-player-shell,body.kx-cinema .kx-stage{opacity:1;filter:none;pointer-events:auto}" +
            "body.kx-cinema .kx-topbar{opacity:.35}" +
                        ".kx-below-player{display:block!important;width:100%;max-width:1100px;margin:18px auto 28px;padding:0 16px;position:relative;z-index:5;clear:both}" +
            ".kx-below-player .kx-syn-wrap{margin-top:0;display:block!important}" +
            ".kx-below-player .kx-syn-body{color:#c9d4e8}" +
            ".kx-below-player .kx-row-block{margin-top:16px;display:block!important}" +
            ".kx-below-player .kx-hscroll{display:flex!important}" +
            "body.kx-cinema .kx-below-player{opacity:.35}" +
            ".kx-act--cine.is-on{border-color:rgba(139,92,246,.55);background:rgba(139,92,246,.2)}";
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

      function refreshWatchedUi() {
        $all(".kx-ep-card[data-ep]").forEach(function (card) {
          var n = card.getAttribute("data-ep");
          var sea = card.getAttribute("data-sea") || season || "1";
          var w = isEpisodeWatched(id, sea, n);
          var playing = card.classList.contains("playing");
          card.classList.toggle("is-watched", w);
          var thumb = card.querySelector(".kx-ep-thumb");
          if (thumb && !playing) {
            var old = thumb.querySelector(".kx-badge-watched");
            if (w && !old) {
              var d = document.createElement("div");
              d.className = "kx-badge-watched";
              d.textContent = "✓ Visto";
              thumb.insertBefore(d, thumb.firstChild);
            } else if (!w && old) old.remove();
          }
          var name = card.querySelector(".kx-ep-name");
          if (name) {
            var has = name.querySelector(".kx-ep-check");
            if (w && !has) {
              name.insertAdjacentHTML("afterbegin", '<span class="kx-ep-check" title="Visto">✓</span> ');
            } else if (!w && has) has.remove();
          }
        });
      }

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
            var seaM =
              e.__playSeason != null
                ? e.__playSeason
                : e.season_number != null
                  ? e.season_number
                  : season || 1;
            var watchedM = isEpisodeWatched(id, seaM, n);
            return (
              '<a class="kx-ep-num' +
              (playing ? " active" : "") +
              (watchedM ? " is-watched" : "") +
              '" href="' +
              href +
              '">' +
              (watchedM && !playing ? "✓" : n) +
              "</a>"
            );
          }
          var seaCard =
            e.__playSeason != null
              ? e.__playSeason
              : e.season_number != null
                ? e.season_number
                : season || 1;
          var watched = isEpisodeWatched(id, seaCard, n);
          return (
            '<a class="kx-ep-card' +
            (playing ? " playing active" : "") +
            (watched ? " is-watched" : "") +
            '" href="' +
            href +
            '" data-ep="' +
            n +
            '" data-sea="' +
            seaCard +
            '">' +
            '<div class="kx-ep-thumb">' +
            (playing
              ? '<div class="kx-badge-playing">Viendo</div>'
              : watched
                ? '<div class="kx-badge-watched">✓ Visto</div>'
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
            (watched ? '<span class="kx-ep-check" title="Visto">✓</span> ' : "") +
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
          function paintEps() {
            list.innerHTML = seasonEps.length
              ? seasonEps.map(function (e) {
                  return epCard(e, false);
                }).join("")
              : '<p class="kx-muted">Sin lista de episodios.</p>';
            refreshWatchedUi();
          }
          if (list.querySelector(".kx-skel-ep")) {
            setTimeout(paintEps, 280);
          } else {
            paintEps();
          }
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
          setPlayerPlaying(false);
          showKxToast(msg || "No se pudo reproducir el directo.", "error");
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
              setPlayerPlaying(true);
              video.play().catch(function () {});
            });
          } else {
            onFail("Tu navegador no puede reproducir HLS.");
            return;
          }
        } else {
          video.src = src;
        }
        video.addEventListener("playing", function () {
          setPlayerPlaying(true);
        });
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
        window.__kxLastPlay = { p: p, mode: mode, btn: btn };
        setPlayerPlaying(false);
        setPlayerStatus({
          now: "Resolviendo…",
          server: serverLabel(p),
          mode: mode === "direct" ? "Directo" : "Reproductor",
          lang: langLabel(p) || "—"
        });
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
              setPlayerStatus({
                now: "Reproduciendo",
                server: serverLabel(p),
                mode: "Directo HLS",
                lang: langLabel(p) || "—"
              });
              setPlayerPlaying(true);
              if (type === "tv") {
                markEpisodeWatched(id, season, episode);
                if (typeof refreshWatchedUi === "function") refreshWatchedUi();
              }
              renderVideo(src);
              return;
            }
          } catch (e) {
            console.warn(e);
            var o2 = suggestOtherServer(p, players);
            showKxToast(
              (serverLabel(p) || "Servidor") +
                " no resolvió" +
                (o2 ? " → prueba " + o2 : " → prueba otro"),
              "error"
            );
          }
        }
        if (p.url && /^https?:\/\//i.test(p.url)) {
          setPlayerStatus({
            now: "Reproduciendo",
            server: serverLabel(p),
            mode: "Embed",
            lang: langLabel(p) || "—"
          });
          setPlayerPlaying(true);
          if (type === "tv") {
            markEpisodeWatched(id, season, episode);
            if (typeof refreshWatchedUi === "function") refreshWatchedUi();
          }
          renderIframe(p.url);
          return;
        }
        if (endpoint && mode !== "direct") {
          try {
            await play(p, "direct", btn);
            return;
          } catch (_) {}
        }
        setPlayerPlaying(false);
        var other = suggestOtherServer(p, players);
        var failName = serverLabel(p) || "Servidor";
        var tip = other
          ? failName + " falló → prueba " + other
          : failName + " falló → prueba otro servidor";
        showKxToast(tip, "error");
        setPlayerStatus({
          now: "Error",
          server: failName,
          mode: "—",
          lang: langLabel(p) || "—"
        });
        box.innerHTML =
          '<div class="player-empty"><span class="kx-empty-ico">!</span><span class="kx-load-text">' +
          tip +
          '</span><button type="button" class="btn kx-retry-btn" id="kxRetryFail">Reintentar</button></div>';
        var rf = document.getElementById("kxRetryFail");
        if (rf) {
          rf.onclick = function () {
            play(p, mode, btn);
          };
        }
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
