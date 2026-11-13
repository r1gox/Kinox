/**
 * Kinox — reproductor
 * Series: interfaz tipo MovieZone (player + episodios, selector unificado de reproductores)
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

  function isProviderEmbed(p) {
    if (!p || !p.url || !/^https?:\/\//i.test(String(p.url))) return false;
    var type = String(p.tipo || p.type || p.name || p.provider || p.servidor || "").toLowerCase();
    var endpoint = String(p.hls_resolve || p.stream_url || "").toLowerCase();
    return /reproductor|embed|iframe/.test(type) || /\/streamurl(?:\?|$)/.test(endpoint);
  }


  function isIframePlayer(p) {
    if (!p || !p.url || !/^https?:\/\//i.test(String(p.url))) return false;
    // Un embed externo es válido aunque el proveedor también publique su endpoint interno.
    if (isProviderEmbed(p)) return true;
    // Excluir fuentes HLS/MP4 directas y sus endpoints separados.
    if (p.stream_url || p.hls_resolve || p.noAds || p.__directHls) return false;
    var url = String(p.url).toLowerCase();
    if (/\.(m3u8|mp4|m4v|mpd|ts)(?:[?#]|$)/i.test(url) || /master\.txt|\/proxy\?/i.test(url)) return false;
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
    if (key === "latino") return "LATINO";
    if (key === "castellano") return "CASTELLANO";
    if (key === "subtitulado") return "SUBTITULADO";
    if (key === "otros") return "OTROS";
    return "TODOS";
  }

  function langFlag(key) {
    if (key === "latino") return "🇲🇽";
    if (key === "castellano") return "🇪🇸";
    if (key === "subtitulado") return "🇺🇸";
    return "🌐";
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

  /** Limpia nombres de episodios que el worker puede devolver como enlaces Markdown. */
  function cleanEpisodeName(value, episodeNumber) {
    var name = String(value == null ? "" : value).trim();
    name = name.replace(/^\*\*([\s\S]+)\*\*$/, "$1").trim();
    var markdownLink = name.match(/^\s*\[([\s\S]*?)\]\((?:https?:\/\/|\/)[^)]+\)\s*$/i);
    if (markdownLink) name = markdownLink[1].trim();
    name = name.replace(/<[^>]*>/g, "").trim();
    // La numeración T/E se dibuja por separado en las tarjetas del reproductor.
    name = name.replace(/^T\s*\d+\s*E\s*\d+\s*[—–-]\s*/i, "").trim();
    return name || "Episodio " + episodeNumber;
  }

  function isGenericEpisodeName(value, episodeNumber) {
    var name = String(value || "").trim();
    if (!name) return true;
    var number = episodeNumber == null ? "\\d+" : String(episodeNumber);
    return new RegExp("^(?:episodio|episode|cap[ií]tulo|chapter)\\s*#?\\s*" + number + "$", "i").test(name);
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
    var name = cleanEpisodeName(e.name || e.titulo || e.title || "", n);
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
            name: cleanEpisodeName(src && (src.titulo || src.name), n),
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

  /**
   * Anime de numeración continua (p. ej. One Piece): el worker usa E1166,
   * mientras TMDB guarda ese capítulo dentro de una temporada y episodio.
   * Descarga cada temporada TMDB una sola vez y enriquece toda la ventana.
   */
  async function enrichFlatAnimeEpsWithTmdb(eps, tvId, absoluteMap) {
    if (!eps || !eps.length || !tvId || !absoluteMap || typeof tmdb !== "function") return eps;
    var neededSeasons = Object.create(null);
    for (var i = 0; i < eps.length; i++) {
      var abs = parseInt(eps[i] && eps[i].episode_number, 10);
      var mapped = absoluteMap[abs];
      if (mapped && mapped.season && mapped.episode) neededSeasons[mapped.season] = true;
    }
    var seasonNumbers = Object.keys(neededSeasons);
    var bySeason = Object.create(null);
    await Promise.all(seasonNumbers.map(async function (seasonNumber) {
      var response = null;
      try {
        response = await tmdb("/tv/" + tvId + "/season/" + seasonNumber);
      } catch (_) {}
      var rows = response && Array.isArray(response.episodes) ? response.episodes : [];
      // Revisar los episodios solicitados, no solo si la temporada tiene algún título.
      var requestedNumbers = eps.map(function (ep) {
        var mapped = absoluteMap[parseInt(ep && ep.episode_number, 10)];
        return mapped && String(mapped.season) === String(seasonNumber) ? parseInt(mapped.episode, 10) : null;
      }).filter(Boolean);
      var spanishByNumber = Object.create(null);
      rows.forEach(function (row) {
        var n = parseInt(row && row.episode_number, 10);
        if (n > 0) spanishByNumber[n] = row;
      });
      var needsEnglish = requestedNumbers.some(function (n) {
        var row = spanishByNumber[n];
        return !row || !row.name || isGenericEpisodeName(row.name, n);
      });
      if (needsEnglish) {
        try {
          var english = await tmdb("/tv/" + tvId + "/season/" + seasonNumber, { language: "en-US" });
          if (english && Array.isArray(english.episodes) && english.episodes.length) {
            var englishByNumber = Object.create(null);
            english.episodes.forEach(function (row) {
              var n = parseInt(row && row.episode_number, 10);
              if (n > 0) englishByNumber[n] = row;
            });
            requestedNumbers.forEach(function (n) {
              var current = spanishByNumber[n];
              var alternate = englishByNumber[n];
              if ((!current || !current.name || isGenericEpisodeName(current.name, n)) && alternate && alternate.name && !isGenericEpisodeName(alternate.name, n)) {
                spanishByNumber[n] = alternate;
              }
            });
            rows = rows.filter(function (row) {
              var n = parseInt(row && row.episode_number, 10);
              return !requestedNumbers.includes(n) || !spanishByNumber[n] || spanishByNumber[n] === row;
            });
            requestedNumbers.forEach(function (n) {
              var alternate = spanishByNumber[n];
              if (alternate && rows.indexOf(alternate) < 0) rows.push(alternate);
            });
          }
        } catch (_) {}
      }
      var index = Object.create(null);
      rows.forEach(function (row) {
        var episodeNumber = parseInt(row && row.episode_number, 10);
        if (episodeNumber > 0) index[episodeNumber] = row;
      });
      bySeason[seasonNumber] = index;
    }));

    for (var j = 0; j < eps.length; j++) {
      var ep = eps[j];
      var absoluteNumber = parseInt(ep && ep.episode_number, 10);
      var mapRow = absoluteMap[absoluteNumber];
      if (!mapRow) continue;
      var details = bySeason[mapRow.season] && bySeason[mapRow.season][mapRow.episode];
      if (!details) continue;
      ep.__tmdb_season = mapRow.season;
      ep.__tmdb_episode = mapRow.episode;
      ep.season_number = mapRow.season;
      if (details.name && isGenericEpisodeName(ep.name, absoluteNumber) && !isGenericEpisodeName(details.name, mapRow.episode)) {
        ep.name = details.name;
      }
      if (details.overview && (!ep.overview || !String(ep.overview).trim())) ep.overview = details.overview;
      if (details.still_path && !ep.still_path) ep.still_path = details.still_path;
      if (details.runtime && !ep.runtime) ep.runtime = details.runtime;
    }
    return eps;
  }

  /**
   * One Piece y otros animes de numeración absoluta: convierte una temporada
   * TMDB (1..N dentro del arco o numeración absoluta) a episodios E1..E1180.
   * El reproductor del worker siempre recibe temporada 1 + episodio absoluto.
   */
  async function loadFlatAnimeArcEpsFromTmdb(tvId, seasonNum, seasonMeta, offset, totalEpisodes, workerEps) {
    if (!tvId || !seasonMeta || typeof tmdb !== "function") return [];
    var sn = parseInt(seasonNum, 10) || 1;
    var count = parseInt(seasonMeta.episode_count, 10) || 0;
    var off = parseInt(offset, 10) || 0;
    var response = null;
    try {
      response = await tmdb("/tv/" + tvId + "/season/" + sn);
    } catch (_) {}
    var rows = response && Array.isArray(response.episodes) ? response.episodes.slice() : [];
    if (!rows.length) return [];

    var hasMissingMeta = rows.some(function (row) {
      var n = parseInt(row && row.episode_number, 10) || 0;
      return !row || !row.name || isGenericEpisodeName(row.name, n) || !row.overview;
    });
    if (hasMissingMeta) {
      try {
        var english = await tmdb("/tv/" + tvId + "/season/" + sn, { language: "en-US" });
        var englishByNumber = Object.create(null);
        ((english && english.episodes) || []).forEach(function (row) {
          var n = parseInt(row && row.episode_number, 10);
          if (n > 0) englishByNumber[n] = row;
        });
        rows = rows.map(function (row) {
          var n = parseInt(row && row.episode_number, 10);
          var alternate = englishByNumber[n];
          if (!alternate) return row;
          var merged = Object.assign({}, row);
          if ((!merged.name || isGenericEpisodeName(merged.name, n)) && alternate.name && !isGenericEpisodeName(alternate.name, n)) merged.name = alternate.name;
          if (!merged.overview) merged.overview = alternate.overview || "";
          if (!merged.still_path) merged.still_path = alternate.still_path || null;
          if (!merged.runtime) merged.runtime = alternate.runtime || null;
          return merged;
        });
      } catch (_) {}
    }

    var numbers = rows.map(function (row) { return parseInt(row && row.episode_number, 10) || 0; })
      .filter(function (n) { return n > 0; })
      .sort(function (a, b) { return a - b; });
    if (!numbers.length) return [];
    // Algunas temporadas de One Piece devuelven E1..E61; otras devuelven
    // directamente E62..E77. Replica el criterio que ya usa el detalle.
    var minN = numbers[0];
    var maxN = numbers[numbers.length - 1];
    var useAbsolute = minN > 1 || maxN > count + 5 || maxN > off + count + 5;
    var workerByAbsolute = Object.create(null);
    (workerEps || []).forEach(function (row) {
      var n = parseInt(row && row.episode_number, 10);
      if (n > 0) workerByAbsolute[n] = row;
    });

    var output = [];
    rows.forEach(function (row) {
      var tmdbNumber = parseInt(row && row.episode_number, 10);
      if (!tmdbNumber || tmdbNumber < 1) return;
      var absoluteNumber = useAbsolute ? tmdbNumber : off + tmdbNumber;
      if (absoluteNumber < 1 || (totalEpisodes > 0 && absoluteNumber > totalEpisodes)) return;
      if (count > 0 && absoluteNumber > off + count && !useAbsolute) return;
      var ep = normalizeEp(row, sn);
      if (!ep) return;
      ep.episode_number = absoluteNumber;
      ep.season_number = sn;
      ep.__tmdb_season = sn;
      ep.__tmdb_episode = tmdbNumber;
      ep.__playSeason = 1;
      ep.__animeFlat = true;
      var worker = workerByAbsolute[absoluteNumber];
      if (worker) {
        var workerName = cleanEpisodeName(worker.name || worker.titulo || "", absoluteNumber);
        if (workerName && isGenericEpisodeName(ep.name, absoluteNumber) && !isGenericEpisodeName(workerName, absoluteNumber)) ep.name = workerName;
        if (!ep.overview) ep.overview = worker.overview || worker.descripcion || "";
        if (!ep.still_url && (worker.still_url || worker.back_img || worker.still)) ep.still_url = worker.still_url || worker.back_img || worker.still;
      }
      output.push(ep);
    });
    output.sort(function (a, b) { return a.episode_number - b.episode_number; });
    return output;
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
      if (opts.tvId && !(fromWorker[0] && fromWorker[0].__animeFlat === true)) {
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
      // La ficha puede venir del proxy TMDB de Vercel aunque el usuario no
      // tenga una API key guardada localmente. Cargamos créditos y rating.
      if (id && typeof tmdb === "function") {
        try {
          var appendMeta = type === "tv" ? "credits,content_ratings" : "credits,release_dates";
          meta = await tmdb("/" + type + "/" + id, { append_to_response: appendMeta });
          if (!slug) slug = mzSlug(meta.title || meta.name);
        } catch (metaError) {
          console.warn("[Kinox player] No se pudo cargar la ficha TMDB:", metaError);
        }
      }

      // En modo local (file://) no existe el proxy /api/tmdb de Vercel.
      // Completar la ficha desde el worker, que ya alimenta los reproductores.
      var workerMeta = null;
      var animePlayerSource = sourceId || (typeof MZ_SOURCE !== "undefined" ? MZ_SOURCE : null);
      // En anime consultamos también el worker para saber si la fuente usa una
      // sola lista absoluta (One Piece) o temporadas reales (otros animes).
      // Consultar el worker cuando falte algún dato del detalle o sea anime.
      var needsWorkerMeta = !meta || !meta.overview || !meta.poster_path || !meta.backdrop_path ||
        (type === "tv" && isAnimeSourceId(animePlayerSource)) ||
        (type === "tv" && (
          !meta.first_air_date || !Array.isArray(meta.genres) || !meta.genres.length ||
          !meta.credits || !Array.isArray(meta.credits.cast) || !meta.credits.cast.length ||
          !Array.isArray(meta.created_by) || !meta.created_by.length ||
          !Array.isArray(meta.seasons) || !meta.seasons.length ||
          !Array.isArray(meta.episode_run_time) || !meta.episode_run_time.length
        ));
      if (slug && needsWorkerMeta && typeof mzFetchDetail === "function") {
        try {
          workerMeta = await Promise.race([
            mzFetchDetail({ slug: slug, type: type, source_id: sourceId }),
            new Promise(function (resolve) {
              setTimeout(function () { resolve(null); }, isAnimeSourceId(animePlayerSource) ? 8000 : 4000);
            })
          ]);
        } catch (workerMetaError) {
          console.warn("[Kinox player] No se pudo cargar la ficha del catálogo:", workerMetaError);
        }
      }
      if (!slug && !urlVid) {
        $("#view").innerHTML = '<div class="load">Falta el slug del título.</div>';
        return;
      }
      // Si la serie llega desde una ficha del worker sin ID TMDB, resolver
      // su serie principal igual que detail.js para recuperar año, géneros,
      // reparto, temporadas, sinopsis y créditos dentro del reproductor.
      if (!meta && type === "tv" && slug && typeof resolveTmdbIdForTitle === "function") {
        var workerTitleForTmdb = String((workerMeta && (workerMeta.titulo || workerMeta.title || workerMeta.nombre)) || String(slug || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim());
        var baseTitleForTmdb = workerTitleForTmdb
          .replace(/\s*[：:]\s*.*$/, "")
          .replace(/\s*(2nd|3rd|4th)\s*season.*$/i, "")
          .replace(/\s*season\s*\d+.*$/i, "")
          .replace(/\s*temporada\s*\d+.*$/i, "")
          .replace(/\s+\b(II|III|IV|2|3|4)\b\s*$/i, "")
          .trim();
        try {
          if (typeof ensureTmdbReady === "function") await ensureTmdbReady();
          var resolvedSeriesId = await resolveTmdbIdForTitle(baseTitleForTmdb || workerTitleForTmdb, "tv", null);
          if (resolvedSeriesId) {
            var resolvedMeta = await tmdb("/tv/" + resolvedSeriesId, { append_to_response: "credits,content_ratings" });
            if (resolvedMeta) {
              meta = resolvedMeta;
              id = String(resolvedSeriesId);
            }
          }
        } catch (resolveMetaError) {
          console.warn("[Kinox player] No se pudo resolver la ficha TMDB de la serie:", resolveMetaError);
        }
      }
      if (type === "tv") {
        season = String(season || "1");
        episode = String(episode || "1");
      }

      var fallbackTitle = (slug || "Reproducción").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
      fallbackTitle = fallbackTitle.replace(/(^|\s)([a-záéíóúñ])/gi, function (_, gap, letter) { return gap + letter.toUpperCase(); });
      var title =
        (meta && (meta.title || meta.name)) ||
        (workerMeta && (workerMeta.titulo || workerMeta.title || workerMeta.nombre)) ||
        fallbackTitle;
      document.title = title + " — Kinox";
      var overview = (meta && meta.overview) ||
        (workerMeta && (workerMeta.descripcion || workerMeta.overview || workerMeta.sinopsis)) || "";
      var imageBase = typeof IMG !== "undefined" ? IMG : "https://image.tmdb.org/t/p/";
      function workerImage(value, size) {
        var raw = String(value || "").trim();
        if (!raw) return "";
        if (/^https?:\/\//i.test(raw)) return raw;
        if (raw.indexOf("//") === 0) return "https:" + raw;
        if (raw.charAt(0) === "/") return imageBase + (size || "w500") + raw;
        return "";
      }
      var poster = meta && meta.poster_path
        ? imageBase + "w500" + meta.poster_path
        : workerImage(workerMeta && (workerMeta.portada || workerMeta.poster || workerMeta.image), "w500");
      var backdrop = meta && meta.backdrop_path
        ? imageBase + "w1280" + meta.backdrop_path
        : workerImage(workerMeta && (workerMeta.backdrop || workerMeta.back_img || workerMeta.fondo), "w1280") || poster;
      var credits = (meta && meta.credits) || {};
      function workerCastRows(source) {
        if (!source) return [];
        var rows = source.reparto || source.reparto_principal || source.elenco || source.actores || source.actores_principales || source.actors || source.cast ||
          (source.credits && source.credits.cast) ||
          (source.detalle && (source.detalle.reparto || source.detalle.elenco || source.detalle.actores || source.detalle.cast));
        if (typeof rows === "string") {
          try { rows = JSON.parse(rows); } catch (_) { rows = rows.split(/[,;|]/); }
        }
        if (rows && !Array.isArray(rows) && typeof rows === "object") rows = Object.keys(rows).map(function (k) { return rows[k]; });
        if (!Array.isArray(rows)) return [];
        return rows.map(function (person) {
          if (typeof person === "string") return { name: person.trim(), character: "", profile_path: "" };
          if (!person || typeof person !== "object") return null;
          var name = person.name || person.nombre || person.nombre_actor || person.nombre_persona || person.actor_name || person.actor || person.actriz || person.artista || person.titulo || "";
          var character = person.character || person.character_name || person.personaje || person.personaje_nombre || person.rol || person.role || person.nombre_personaje || "";
          var image = person.profile_path || person.profile || person.photo || person.foto || person.fotografia || person.image || person.imagen || person.url_foto || person.url_imagen || "";
          var profilePath = /^https?:\/\//i.test(String(image)) ? String(image) : String(image || "");
          if (profilePath && profilePath.charAt(0) !== "/" && !/^https?:\/\//i.test(profilePath)) profilePath = "";
          return { name: String(name || "").trim(), character: String(character || "").trim(), profile_path: profilePath };
        }).filter(function (person) { return person && person.name; });
      }
      var cast = Array.isArray(credits.cast) && credits.cast.length
        ? credits.cast.slice(0, 12)
        : workerCastRows(workerMeta).slice(0, 12);
      var workerGenres = workerMeta && (workerMeta.generos || workerMeta.genres);
      if (typeof workerGenres === "string") {
        try { workerGenres = JSON.parse(workerGenres); } catch (_) { workerGenres = workerGenres.split(/[,|]/); }
      }
      if (!Array.isArray(workerGenres)) workerGenres = [];
      var genres = meta && Array.isArray(meta.genres) && meta.genres.length
        ? meta.genres
        : workerGenres.map(function (g) {
            return typeof g === "string" ? { name: g.trim() } : { name: g && (g.name || g.nombre || g.genero) || "" };
          }).filter(function (g) { return !!g.name; });
      var releaseDate = (meta && (type === "tv" ? meta.first_air_date : meta.release_date)) ||
        (workerMeta && (workerMeta.year || workerMeta.ano || workerMeta.fecha || workerMeta.release_date)) || "";
      var releaseYear = String(releaseDate || "").slice(0, 4);
      var workerRating = workerMeta && (workerMeta.rating != null ? workerMeta.rating : workerMeta.calificacion);
      var ratingNumber = parseFloat(String((meta && meta.vote_average) || workerRating || "0").replace(",", ".")) || 0;
      var vote = ratingNumber > 0 ? ratingNumber.toFixed(1) : "";
      var runtimeValue = type === "tv"
        ? ((meta && Array.isArray(meta.episode_run_time) ? meta.episode_run_time[0] : null) ||
          (workerMeta && (workerMeta.duracion_episodio || workerMeta.runtime_episode)))
        : ((meta && meta.runtime) || (workerMeta && (workerMeta.duracion || workerMeta.runtime || workerMeta.duracion_texto)));
      var certification = "";
      if (meta && type === "tv") {
        var ratingRows = (meta.content_ratings && meta.content_ratings.results) || [];
        var ratingRow = ratingRows.find(function (x) { return x.iso_3166_1 === "MX" && x.rating; }) ||
          ratingRows.find(function (x) { return x.iso_3166_1 === "US" && x.rating; }) ||
          ratingRows.find(function (x) { return x.rating; });
        certification = ratingRow ? ratingRow.rating : "";
      } else if (meta) {
        var releaseRows = (meta.release_dates && meta.release_dates.results) || [];
        var releaseRow = releaseRows.find(function (x) { return x.iso_3166_1 === "MX" && x.release_dates && x.release_dates.length; }) ||
          releaseRows.find(function (x) { return x.iso_3166_1 === "US" && x.release_dates && x.release_dates.length; }) ||
          releaseRows.find(function (x) { return x.release_dates && x.release_dates.length; });
        if (releaseRow) {
          var certItem = releaseRow.release_dates.find(function (x) { return x.certification; });
          certification = certItem ? certItem.certification : "";
        }
      }
      var directorLabel = "";
      if (type === "tv") {
        var creators = Array.isArray(meta && meta.created_by) ? meta.created_by : [];
        directorLabel = creators.slice(0, 2).map(function (x) { return x.name; }).filter(Boolean).join(", ");
      } else {
        var director = (credits.crew || []).find(function (x) { return x.job === "Director" && x.name; });
        directorLabel = director ? director.name : "";
      }
      if (!directorLabel && workerMeta) {
        directorLabel = workerMeta.director || workerMeta.direccion || workerMeta.creador || workerMeta.created_by || "";
        if (Array.isArray(directorLabel)) directorLabel = directorLabel.map(function (x) { return typeof x === "string" ? x : (x && (x.name || x.nombre)) || ""; }).filter(Boolean).slice(0, 2).join(", ");
        else if (directorLabel && typeof directorLabel === "object") directorLabel = directorLabel.name || directorLabel.nombre || "";
        directorLabel = String(directorLabel || "");
      }
      var workerSeasonRows = workerMeta && Array.isArray(workerMeta.temporadas) ? workerMeta.temporadas : [];
      var workerEpisodeTotal = parseInt(workerMeta && (workerMeta.total_episodios || workerMeta.episodes_count), 10) ||
        parseInt(meta && meta.number_of_episodes, 10) || 0;
      var isFlatAnimeCatalog = !!(
        type === "tv" && isAnimeSourceId(animePlayerSource) && workerEpisodeTotal > 60 &&
        ((workerMeta && workerSeasonRows.length <= 1) ||
          (!workerMeta && workerEpisodeTotal > 300 && meta && Array.isArray(meta.seasons) && meta.seasons.length > 1))
      );
      var animeArcOffsets = Object.create(null);
      var seasonOptions = type === "tv" && meta && Array.isArray(meta.seasons)
        ? meta.seasons.filter(function (x) { return Number(x.season_number) > 0; })
        : workerSeasonRows.map(function (x, index) {
            var sn = parseInt(x && (x.temporada != null ? x.temporada : x.season_number != null ? x.season_number : x.season), 10);
            var list = x && (x.lista || x.episodios || x.episodes);
            return {
              season_number: sn || index + 1,
              name: (x && (x.nombre || x.name || x.titulo)) || ("Temporada " + (sn || index + 1)),
              episode_count: Array.isArray(list) ? list.length : (x && (x.episodes_count || x.total_episodios)) || 0
            };
          }).filter(function (x) { return Number(x.season_number) > 0; });

      // Igual que el detalle: para anime largo, cada temporada TMDB representa
      // un arco y su offset se convierte a numeración absoluta E1..E1180.
      if (isFlatAnimeCatalog && meta && Array.isArray(meta.seasons)) {
        var arcTotal = workerEpisodeTotal || parseInt(meta.number_of_episodes, 10) || 0;
        var arcOffset = 0;
        var arcOptions = [];
        meta.seasons.filter(function (x) {
          return x && Number(x.season_number) > 0 && Number(x.episode_count) > 0;
        }).forEach(function (x) {
          if (arcTotal > 0 && arcOffset >= arcTotal) return;
          var count = parseInt(x.episode_count, 10) || 0;
          if (arcTotal > 0 && arcOffset + count > arcTotal) count = arcTotal - arcOffset;
          if (count <= 0) return;
          var sn = parseInt(x.season_number, 10);
          animeArcOffsets[sn] = arcOffset;
          arcOptions.push(Object.assign({}, x, { episode_count: count }));
          arcOffset += count;
        });
        if (arcOptions.length) seasonOptions = arcOptions;
      }
      function animeArcSeasonForAbsolute(absoluteEpisode) {
        var absolute = parseInt(absoluteEpisode, 10) || 1;
        for (var ai = 0; ai < seasonOptions.length; ai++) {
          var option = seasonOptions[ai];
          var sn = parseInt(option.season_number, 10);
          var offset = animeArcOffsets[sn] || 0;
          var count = parseInt(option.episode_count, 10) || 0;
          if (absolute > offset && (!count || absolute <= offset + count)) return sn;
        }
        return seasonOptions.length ? parseInt(seasonOptions[seasonOptions.length - 1].season_number, 10) || 1 : 1;
      }

      // Compatibilidad con enlaces creados por el selector anterior: si llega
      // season=TMDB y episode=1..N, normalizarlo a season=1 + episodio absoluto.
      if (isFlatAnimeCatalog) {
        var requestedArcSeason = parseInt(season, 10) || 1;
        var requestedArcEpisode = parseInt(episode, 10) || 1;
        if (requestedArcSeason > 1 && animeArcOffsets[requestedArcSeason] != null) {
          var requestedArc = seasonOptions.find(function (x) { return Number(x.season_number) === requestedArcSeason; });
          var requestedArcCount = parseInt(requestedArc && requestedArc.episode_count, 10) || 0;
          if (requestedArcEpisode <= requestedArcCount) {
            episode = String(animeArcOffsets[requestedArcSeason] + requestedArcEpisode);
          }
        }
        season = "1";
        if (urlVidBase) urlVid = urlVidBase.replace(/\/$/, "") + "/1/" + episode;
      }

      var pickerSeason = isFlatAnimeCatalog ? animeArcSeasonForAbsolute(episode) : (parseInt(season, 10) || 1);
      var seasonPickerHtml = "";
      if (type === "tv") {
        if (seasonOptions.length > 1) {
          seasonPickerHtml = '<label class="kx-season-control"><span>Temporada</span><select id="kxSeasonSelect" aria-label="Seleccionar temporada">' +
            seasonOptions.map(function (x) {
              var n = String(x.season_number);
              return '<option value="' + esc(n) + '"' + (Number(n) === Number(pickerSeason) ? " selected" : "") + '>' +
                esc(x.name || ("Temporada " + n)) + (x.episode_count ? " · " + esc(String(x.episode_count)) + " episodios" : "") +
                '</option>';
            }).join("") + '</select></label>';
        } else {
          seasonPickerHtml = '<span class="kx-season-single">Temporada ' + esc(String(pickerSeason || season || "1")) + '</span>';
        }
      }

      var facts = [];
      if (releaseYear) facts.push('<span><b>' + esc(releaseYear) + '</b></span>');
      if (runtimeValue) {
        var runtimeText = String(runtimeValue).trim();
        if (/^\d+(?:\.\d+)?$/.test(runtimeText)) runtimeText += ' min';
        facts.push('<span><b>' + esc(runtimeText) + '</b>' + (type === "tv" ? ' <i>/ episodio</i>' : '') + '</span>');
      }
      if (certification) facts.push('<span class="kx-cert">' + esc(certification) + '</span>');
      if (vote) facts.push('<span class="kx-score">★ ' + esc(vote) + '</span>');
      if (type === "tv") {
        var seriesSeasonCount = parseInt((meta && meta.number_of_seasons) || (workerMeta && workerMeta.total_temporadas) || workerSeasonRows.length, 10) || 0;
        var seriesEpisodeCount = parseInt((meta && meta.number_of_episodes) || (workerMeta && workerMeta.total_episodios), 10) || 0;
        if (seriesSeasonCount) facts.push('<span><b>' + esc(String(seriesSeasonCount)) + '</b> <i>' + (seriesSeasonCount === 1 ? 'temporada' : 'temporadas') + '</i></span>');
        if (seriesEpisodeCount) facts.push('<span><b>' + esc(String(seriesEpisodeCount)) + '</b> <i>' + (seriesEpisodeCount === 1 ? 'episodio' : 'episodios') + '</i></span>');
      }
      var castHtml = cast.length
        ? '<section class="kx-cast-section" aria-label="Reparto"><div class="kx-cast-heading"><div><span class="kx-section-kicker">ELENCO</span><h2>Reparto</h2></div><small>Actores y personajes</small></div><div class="kx-cast-row">' + cast.map(function (person) {
            var rawPhoto = person.profile_path || person.photo || person.foto || person.image || "";
            var photo = /^https?:\/\//i.test(String(rawPhoto)) ? String(rawPhoto) : (rawPhoto && String(rawPhoto).charAt(0) === "/" ? imageBase + "w185" + rawPhoto : "");
            var personName = person.name || person.nombre || "Reparto";
            var characterName = person.character || person.personaje || person.rol || "";
            return '<article class="kx-cast-card">' +
              '<div class="kx-cast-photo">' + (photo ? '<img src="' + esc(photo) + '" alt="' + esc(personName) + '" loading="lazy" onerror="this.remove();this.parentNode.classList.add(\'is-empty\')">' : '<span>' + esc(String(personName || "?").slice(0, 1)) + '</span>') + '</div>' +
              '<b>' + esc(personName) + '</b>' +
              (characterName ? '<small>' + esc(characterName) + '</small>' : '') +
            '</article>';
          }).join("") + '</div></section>'
        : "";
      var titleHeroHtml = '<section class="kx-cinema-hero" aria-label="Información del título">' +
        (backdrop ? '<img class="kx-cinema-backdrop" src="' + esc(backdrop) + '" alt="" aria-hidden="true">' : '') +
        '<div class="kx-cinema-scrim"></div>' +
        '<div class="kx-cinema-main">' +
          '<div class="kx-cinema-poster">' + (poster ? '<img src="' + esc(poster) + '" alt="Portada de ' + esc(title) + '" loading="eager">' : '<div class="kx-poster-fallback">K</div>') + '</div>' +
          '<div class="kx-cinema-copy">' +
            '<span class="kx-cinema-kicker">' + (type === "tv" ? 'SERIE' : 'PELÍCULA') + ' · KINOX</span>' +
            '<h1>' + esc(title) + '</h1>' +
            (facts.length ? '<div class="kx-cinema-facts">' + facts.join('<span class="kx-fact-dot">•</span>') + '</div>' : '') +
            (genres.length ? '<div class="kx-genre-list">' + genres.slice(0, 5).map(function (g) { return '<span>' + esc(g.name) + '</span>'; }).join("") + '</div>' : '') +
            (overview ? '<div class="kx-overview-wrap"><p class="kx-cinema-overview" id="kxOverview">' + esc(overview) + '</p>' + (overview.length > 190 ? '<button type="button" class="kx-overview-toggle" id="kxOverviewToggle" aria-expanded="false">Ver sinopsis completa <span>⌄</span></button>' : '') + '</div>' : '') +
            (directorLabel ? '<div class="kx-cinema-credit"><span>' + (type === "tv" ? 'CREADA POR' : 'DIRECCIÓN') + '</span><b>' + esc(directorLabel) + '</b></div>' : '') +
            seasonPickerHtml +
          '</div>' +
        '</div>' +
      '</section>';

      var seasonEps = [];
      if (type === "tv") {
        seasonEps = await loadSeasonEps({
          tvId: id,
          slug: slug,
          season: isFlatAnimeCatalog ? "1" : season,
          sourceId: sourceId,
          currentEpisode: episode,
          episode: episode
        });
      }

      /* Mapa absoluto → temporada TMDB (igual que detalle) */
      var absSeasonMap = null; // absEp -> { season, episode, name? }
      if (type === "tv" && id && typeof tmdb === "function") {
        try {
          var tvMeta = (meta && meta.seasons) ? meta : await tmdb("/tv/" + id);
          var seasonsMeta = isFlatAnimeCatalog && seasonOptions.length ? seasonOptions : ((tvMeta && tvMeta.seasons) || []);
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
      var hasFlatAnimeEpisodes = seasonEps.some(function (row) {
        return row && row.__animeFlat === true;
      });
      if (seasonEps.length && absSeasonMap && !workerMulti && hasFlatAnimeEpisodes) {
        for (var se = 0; se < seasonEps.length; se++) {
          var rowEp = seasonEps[se];
          if (rowEp.__animeFlat === false && rowEp.__playSeason != null) continue;
          var absEp = parseInt(rowEp.episode_number, 10);
          var mapRow = absSeasonMap[absEp];
          if (mapRow) {
            rowEp.__tmdb_season = mapRow.season;
            rowEp.__tmdb_episode = mapRow.episode;
            rowEp.season_number = mapRow.season;
          }
        }
        if (isFlatAnimeCatalog) {
          var activeArcSeason = animeArcSeasonForAbsolute(episode);
          var activeArcMeta = seasonOptions.find(function (x) { return Number(x.season_number) === Number(activeArcSeason); });
          var activeArcEpisodes = await loadFlatAnimeArcEpsFromTmdb(
            id,
            activeArcSeason,
            activeArcMeta,
            animeArcOffsets[activeArcSeason] || 0,
            workerEpisodeTotal,
            seasonEps
          );
          if (activeArcEpisodes.length) seasonEps = activeArcEpisodes;
          else seasonEps = await enrichFlatAnimeEpsWithTmdb(seasonEps, id, absSeasonMap);
        } else {
          seasonEps = await enrichFlatAnimeEpsWithTmdb(seasonEps, id, absSeasonMap);
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
        if (isFlatAnimeCatalog && absSeasonMap && absSeasonMap[epN]) {
          // En One Piece, E62 no significa T1 E62: es T2 E1 de TMDB,
          // pero la fuente del worker sigue necesitando T1 E62.
          var mappedCurrent = absSeasonMap[epN];
          tmdbEp = await loadTmdbEpDirect(id, mappedCurrent.season, mappedCurrent.episode);
          if (tmdbEp) {
            tmdbEp.__tmdb_season = mappedCurrent.season;
            tmdbEp.__tmdb_episode = mappedCurrent.episode;
            tmdbEp.__absolute = epN;
          }
        } else {
          // Temporadas reales (Wistoria T2 E12, etc.).
          tmdbEp = await loadTmdbEpDirect(id, seaN, epN);
          if (tmdbEp) {
            tmdbEp.__tmdb_season = seaN;
            tmdbEp.__tmdb_episode = epN;
          }
          // Fallback para animes absolutos cuando la ficha no trae el bloque.
          if (!tmdbEp && epN > 80) tmdbEp = await loadTmdbEpByAbsolute(id, epN);
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
          ? (isFlatAnimeCatalog ? "E" + episode : "T" + labelSea + " E" + episode) +
            (epMeta && epMeta.name ? " — " + epMeta.name : "")
          : "Película";
      var epRuntime =
        (epMeta && epMeta.runtime) ||
        (meta && meta.runtime) ||
        null;
      var epRuntimeLabel = "";
      if (epRuntime != null && String(epRuntime).trim()) {
        epRuntimeLabel = String(epRuntime).trim();
        if (/^\d+(?:\.\d+)?$/.test(epRuntimeLabel)) epRuntimeLabel += " min";
        else if (!/\bmin(?:uto)?s?\b/i.test(epRuntimeLabel)) epRuntimeLabel += " min";
      }
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
          '<div class="kx-topbar-title">REPRODUCTOR</div>' +
          '<div class="kx-top-actions"><button type="button" class="kx-reload-btn" id="kxReloadPlayer" title="Volver a cargar" aria-label="Volver a cargar reproductor">↻</button><button type="button" class="kx-fullscreen-btn" id="kxFullscreen">⛶ <span>Pantalla completa</span></button></div>' +
          "</div>" +
          titleHeroHtml +
          '<div class="kx-stage">' +
          '<div class="kx-hero">' +
          '<div id="playerBox" class="kx-player mz-player"><div class="player-loading"><span class="kx-spin"></span><span class="kx-load-text">Buscando reproductores…</span></div></div>' +
          "</div>" +
          '<aside class="kx-sidebar" id="kxSidebar">' +
          '<div class="kx-sidebar-head">Episodios · ' +
          (isFlatAnimeCatalog
            ? esc((seasonOptions.find(function (x) { return Number(x.season_number) === Number(pickerSeason); }) || {}).name || ("E" + episode))
            : "T" + esc(season || "1") + " E" + esc(episode)) +
          "</div>" +
          '<div class="kx-ep-list" id="kxEpList"></div>' +
          "</aside>" +
          "</div>" +
          '<div class="kx-info kx-episode-summary">' +
          '<h1 class="kx-ep-heading" id="kxEpHeading">' +
          esc(epTitle) +
          "</h1>" +
          '<div class="kx-ep-meta" id="kxEpMeta">' +
          esc(epRuntimeLabel) +
          "</div>" +
          (epOverview
            ? '<p class="kx-synopsis" id="kxSynopsis">' + esc(epOverview) + "</p>"
            : '<p class="kx-synopsis" id="kxSynopsis"></p>') +
          "</div>" +
          castHtml +
          '<div class="kx-info kx-playback-controls">' +
          '<div class="kx-ep-mobile" id="kxEpMobile"></div>' +
          "</div>" +
          '<div class="kx-info kx-episode-synopsis-mobile">' +
          (epOverview ? '<p class="kx-synopsis">' + esc(epOverview) + "</p>" : "") +
          "</div>" +
          "</section>";
      } else {
        $("#view").innerHTML =
          '<section class="page player-page kx-movie-view">' +
          '<div class="player-head kx-topbar">' +
          '<a class="kx-back" href="javascript:history.back()">← Volver</a>' +
          '<div class="kx-topbar-title">REPRODUCTOR</div>' +
          '<div class="kx-top-actions"><button type="button" class="kx-reload-btn" id="kxReloadPlayer" title="Volver a cargar" aria-label="Volver a cargar reproductor">↻</button><button type="button" class="kx-fullscreen-btn" id="kxFullscreen">⛶ <span>Pantalla completa</span></button></div>' +
          "</div>" +
          '<div class="kx-movie-layout">' +
            '<div class="kx-movie-player-column">' +
              '<div class="kx-movie-player-area">' +
                '<div class="kx-player-section-head"><span>REPRODUCCIÓN</span><small>Selecciona servidor e idioma en los controles del reproductor</small></div>' +
                '<div id="playerBox" class="mz-player kx-player"><div class="player-loading"><span class="kx-spin"></span><span class="kx-load-text">Buscando reproductores…</span></div></div>' +
              '</div>' +
            '</div>' +
            '<aside class="kx-movie-info-column">' + titleHeroHtml + '</aside>' +
          '</div>' +
          castHtml +
          "</section>";
      }

      // En móvil, dejar la cabecera de serie solo con su título y poner
      // el selector de temporada junto a la lista de episodios.
      if (type === "tv" && window.matchMedia && window.matchMedia("(max-width: 900px)").matches) {
        var mobileSeasonControl = $(".kx-season-control");
        var mobilePlaybackControls = $(".kx-playback-controls");
        var mobileEpisodesList = $("#kxEpMobile");
        if (mobileSeasonControl && mobilePlaybackControls && mobileEpisodesList) {
          mobilePlaybackControls.insertBefore(mobileSeasonControl, mobileEpisodesList);
        }
      }

      var box = $("#playerBox");
      var overviewToggle = $("#kxOverviewToggle");
      if (overviewToggle) {
        overviewToggle.addEventListener("click", function () {
          var overviewNode = $("#kxOverview");
          if (!overviewNode) return;
          var expanded = overviewNode.classList.toggle("is-expanded");
          overviewToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
          overviewToggle.innerHTML = expanded ? 'Mostrar menos <span>⌃</span>' : 'Ver sinopsis completa <span>⌄</span>';
        });
      }
      var seasonSelect = $("#kxSeasonSelect");
      if (seasonSelect) {
        seasonSelect.addEventListener("change", function () {
          var nextSeason = String(seasonSelect.value || "1");
          var nextEpisode = 1;
          var nextPlaySeason = nextSeason;
          if (isFlatAnimeCatalog) {
            nextEpisode = (animeArcOffsets[parseInt(nextSeason, 10)] || 0) + 1;
            nextPlaySeason = 1;
          }
          location.href = buildPlayHref({
            type: "tv", id: id, season: nextPlaySeason, episode: nextEpisode,
            slug: slug, sourceId: sourceId, urlVidBase: urlVidBase
          });
        });
      }
      var fullscreenBtn = $("#kxFullscreen");
      if (fullscreenBtn && box) {
        fullscreenBtn.addEventListener("click", function () {
          var target = box.closest(".kx-player-wrap") || box;
          var request = target.requestFullscreen || target.webkitRequestFullscreen;
          if (request) {
            try { request.call(target); } catch (e) { console.warn("Fullscreen:", e); }
          } else {
            var video = box.querySelector("video");
            if (video && video.webkitEnterFullscreen) {
              try { video.webkitEnterFullscreen(); } catch (_) {}
            }
          }
        });
        function updateFullscreenLabel() {
          var active = document.fullscreenElement || document.webkitFullscreenElement;
          var isActive = !!active && (active === box || (box.closest(".kx-player-wrap") && active === box.closest(".kx-player-wrap")));
          fullscreenBtn.innerHTML = isActive ? '⛶ <span>Salir de pantalla completa</span>' : '⛶ <span>Pantalla completa</span>';
        }
        document.addEventListener("fullscreenchange", updateFullscreenLabel);
        document.addEventListener("webkitfullscreenchange", updateFullscreenLabel);
      }
      // Al volver: limpiar preferencia de servidor (no auto-elegir el anterior)
      $all("a.kx-back, a.back").forEach(function (a) {
        a.addEventListener("click", function () {
          clearPref();
        });
      });
      window.addEventListener("pagehide", clearPref);

      // Anime multi-temp: respetar season de la URL (T2 E12). Flat One Piece: 1.
      var playSeasonMz = isFlatAnimeCatalog ? 1 : (season || 1);
      var playEpisodeMz = episode;
      if (isFlatAnimeCatalog && urlVidBase) {
        urlVid = urlVidBase.replace(/\/$/, "") + "/1/" + playEpisodeMz;
      }
      var data = await mzPlayers({
        type: type,
        slug: slug,
        season: playSeasonMz,
        episode: playEpisodeMz,
        source_id: sourceId,
        url_vid: urlVid
      });
      var players = (data.reproductores || []).filter(isIframePlayer);
      if (!players.length) {
        box.innerHTML =
          '<div class="player-empty"><span class="kx-empty-ico">!</span><span class="kx-load-text">No hay reproductores disponibles.</span></div>';
        return;
      }

      // Solo reproductores iframe; se excluyen las fuentes directas independientes.

      var preferredLangForAuto = "all";
      /* HUD sobre el reproductor: idioma (izq) + lista de servidores */
      (function setupPlayerHud() {
        var box = $("#playerBox");
        if (!box) return;

        // Crear siempre el marco exterior: los embeds externos también deben llenar
        // el mismo rectángulo 16:9 y no quedar dentro de un segundo cuadro limitado.
        var wrap = box.parentElement;
        if (!wrap || !wrap.classList.contains("kx-player-wrap")) {
          wrap = document.createElement("div");
          wrap.className = "kx-player-wrap";
          box.parentNode.insertBefore(wrap, box);
          wrap.appendChild(box);
        }

        // Los embeds externos ya incluyen sus propios controles de idioma/servidor.
        // Si todos son embeds, ocultar selectores extra pero conservar el marco común.
        if (players.length && players.every(isProviderEmbed)) return;

        var style = document.getElementById("kx-lang-style");
        if (!style) style = document.createElement("style");
        style.id = "kx-lang-style";
        // Reescribir también si el estilo quedó en memoria de una vista anterior.
        style.textContent =
            ".kx-player-wrap{position:relative;width:100%;isolation:isolate}" +
            ".kx-player-wrap .kx-player,.kx-player-wrap .mz-player{width:100%}" +
            ".kx-player-hud{position:absolute;top:14px;left:14px;z-index:20;display:flex;" +
            "flex-wrap:wrap;align-items:flex-start;gap:10px;pointer-events:none;max-width:calc(100% - 28px)}" +
            ".kx-player-hud *{pointer-events:auto}" +
            ".kx-dd{position:relative;display:inline-flex;z-index:20}" +
            ".kx-dd-btn{display:flex;flex-direction:column;align-items:stretch;gap:7px;" +
            "min-width:146px;max-width:230px;min-height:58px;padding:9px 12px 10px;border-radius:15px;" +
            "border:1px solid rgba(203,213,225,.24);background:linear-gradient(145deg,rgba(18,24,42,.96),rgba(5,8,18,.94));" +
            "color:#f8fafc;font:inherit;font-weight:700;cursor:pointer;backdrop-filter:blur(18px);" +
            "-webkit-backdrop-filter:blur(18px);box-shadow:0 12px 30px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.11);" +
            "transition:border-color .2s ease,background .2s ease,transform .2s ease,box-shadow .2s ease}" +
            ".kx-dd-btn:hover,.kx-dd.open .kx-dd-btn{border-color:rgba(167,139,250,.78);" +
            "background:linear-gradient(145deg,rgba(35,29,65,.98),rgba(8,12,27,.97));" +
            "box-shadow:0 14px 34px rgba(0,0,0,.5),0 0 0 1px rgba(139,92,246,.12),inset 0 1px 0 rgba(255,255,255,.13)}" +
            ".kx-dd-btn:active{transform:translateY(1px)}" +
            ".kx-dd-btn .kx-dd-label{display:block;color:#c4b5fd;opacity:.9;font-size:.58rem;" +
            "font-weight:900;letter-spacing:.17em;line-height:1;text-transform:uppercase}" +
            ".kx-dd-btn .kx-dd-main{display:flex;align-items:center;gap:8px;width:100%;min-width:0}" +
            ".kx-dd-btn .kx-dd-icon{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;" +
            "font-size:1rem;line-height:1;filter:drop-shadow(0 1px 5px rgba(167,139,250,.2))}" +
            ".kx-dd-btn .kx-dd-value{display:block;min-width:0;max-width:155px;overflow:hidden;color:#fff;" +
            "font-size:.82rem;font-weight:850;letter-spacing:.025em;text-overflow:ellipsis;white-space:nowrap}" +
            ".kx-dd-btn .kx-dd-chevron{margin-left:auto;color:#b9bfd0;font-size:.9rem;line-height:1;" +
            "transition:transform .2s ease,color .2s ease}" +
            ".kx-dd.open .kx-dd-chevron{transform:rotate(180deg);color:#c4b5fd}" +
            ".kx-dd-menu{position:absolute;top:calc(100% + 9px);left:0;min-width:220px;max-width:min(310px,84vw);" +
            "max-height:280px;overflow-y:auto;padding:7px;border:1px solid rgba(167,139,250,.4);border-radius:16px;" +
            "background:linear-gradient(155deg,rgba(20,24,43,.99),rgba(6,9,20,.99));" +
            "box-shadow:0 22px 55px rgba(0,0,0,.68),inset 0 1px 0 rgba(255,255,255,.08);" +
            "backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);display:none;z-index:25;" +
            "scrollbar-width:thin;scrollbar-color:rgba(167,139,250,.45) transparent}" +
            ".kx-dd.open .kx-dd-menu{display:block}" +
            ".kx-dd-menu button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;" +
            "text-align:left;padding:11px 12px;border:0;border-radius:10px;background:transparent;" +
            "color:#e7eaf3;font:inherit;font-weight:750;font-size:.84rem;cursor:pointer;" +
            "transition:background .16s ease,color .16s ease,transform .16s ease}" +
            ".kx-dd-menu button:hover,.kx-dd-menu button.active{background:linear-gradient(90deg,rgba(139,92,246,.27),rgba(59,130,246,.1));color:#fff}" +
            ".kx-dd-menu button:active{transform:scale(.985)}" +
            ".kx-dd-menu button .kx-dd-meta{font-size:.7rem;color:#c4b5fd;opacity:.9;font-weight:700}" +
            ".kx-dd-menu button.kx-lang-hide{display:none!important}" +
            ".kx-dd-empty{padding:12px;color:#aab3c5;font-size:.82rem}" +
            "@media(max-width:600px){.kx-player-hud{top:9px;left:9px;gap:7px;max-width:calc(100% - 18px)}" +
            ".kx-dd-btn{min-width:120px;max-width:190px;min-height:51px;padding:8px 10px 9px;border-radius:13px;gap:6px}" +
            ".kx-dd-btn .kx-dd-label{font-size:.53rem}" +
            ".kx-dd-btn .kx-dd-icon{font-size:.92rem}" +
            ".kx-dd-btn .kx-dd-value{max-width:120px;font-size:.75rem}" +
            ".kx-dd-menu{min-width:190px;max-height:230px}}";
        document.head.appendChild(style);

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
            '<span class="kx-dd-label">' +
            esc(cfg.label) +
            "</span>" +
            '<span class="kx-dd-main">' +
            (cfg.icon
              ? '<span class="kx-dd-icon">' + cfg.icon + "</span>"
              : "") +
            '<span class="kx-dd-value">' +
            esc(cfg.valueText || "—") +
            "</span>" +
            '<span class="kx-dd-chevron" aria-hidden="true">⌄</span>' +
            "</span>";
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

        // —— Servidores iframe solamente; las fuentes directas no se ofrecen ——
        var serverChoices = players.slice();

        var srvMenuHtml = serverChoices.length
          ? serverChoices
              .map(function (p) {
                var idx = players.indexOf(p);
                var lk = langKey(p);
                var lang = langLabel(p);
                return (
                  '<button type="button" class="kx-chip-proxy" data-i="' +
                  idx +
                  '" data-lang="' +
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
          : '<div class="kx-dd-empty">No hay reproductores disponibles</div>';

        function firstLabel(list, key) {
          if (!list || !list.length) return "—";
          for (var i = 0; i < list.length; i++) {
            if (!key || key === "all" || langKey(list[i]) === key) {
              return serverLabel(list[i]);
            }
          }
          return serverLabel(list[0]);
        }
        var srvInit = firstLabel(serverChoices, preferred);
        var srvDd = makeDropdown({
          id: "kxSrvDd",
          label: "REPRODUCTOR",
          icon: "▶",
          valueText: srvInit,
          menuHtml: srvMenuHtml
        });

        function applyLang(key) {
          $all("#kxSrvDd .kx-chip-proxy[data-lang]").forEach(
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
          var sLab = firstLabel(serverChoices, key);
          setDdValue(srvDd, sLab);
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
            setDdValue(dd, serverLabel(players[i]));
            closeAllDd();
            if (typeof window.__kxPlayServer === "function") {
              window.__kxPlayServer(i, t);
            } else {
              window.__kxPick = { i: i, btn: t };
            }
          });
        }
        bindPick(srvDd);

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
            (isFlatAnimeCatalog
              ? "E" + n
              : "T" +
                (e.__tmdb_season ||
                  e.season_number ||
                  (typeof tmdbSeasonForAbs === "function" ? tmdbSeasonForAbs(n) : null) ||
                  season ||
                  "1") +
                " E" + n) +
            " — " +
            esc(e.name || "Episodio " + n) +
            "</div>" +
            (e.overview ? '<div class="kx-ep-desc">' + esc(e.overview) + '</div>' : '') +
            "</div></a>"
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
            '<div class="kx-ep-mobile-title">Episodios</div>' +
            '<div class="kx-ep-num-grid">' +
            seasonEps
              .map(function (e) {
                return epCard(e, true);
              })
              .join("") +
            "</div>";
        }

      }

      function renderIframe(url) {
        box.innerHTML =
          '<iframe class="mz-iframe kx-iframe" src="' +
          esc(url) +
          '" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="no-referrer"></iframe>';
      }

      function play(p, btn) {
        $all(".kx-chip-proxy").forEach(function (x) {
          x.classList.remove("active");
        });
        if (btn) btn.classList.add("active");
        savePref(p, "iframe");
        if (!p || !p.url || !/^https?:\/\//i.test(String(p.url))) {
          box.innerHTML =
            '<div class="player-empty"><span class="kx-empty-ico">!</span><span class="kx-load-text">Este reproductor no tiene un enlace válido.</span></div>';
          return;
        }
        box.innerHTML =
          '<div class="player-loading"><span class="kx-spin"></span><span class="kx-load-text">Abriendo reproductor…</span></div>';
        renderIframe(p.url);
      }

      function onServerPick(i, btn) {
        if (i == null || isNaN(i) || !players[i]) return;
        var dd = btn && btn.closest ? btn.closest(".kx-dd") : null;
        if (dd) {
          var val = dd.querySelector(".kx-dd-value");
          if (val) val.textContent = serverLabel(players[i]);
          var b = dd.querySelector(".kx-dd-btn");
          if (b) b.classList.add("kx-dd-value-only");
        }
        play(players[i], btn);
      }
      window.__kxPlayServer = onServerPick;

      var reloadPlayerBtn = $("#kxReloadPlayer");
      if (reloadPlayerBtn) {
        reloadPlayerBtn.addEventListener("click", function () {
          reloadPlayerBtn.classList.add("is-loading");
          var activeVideo = box && box.querySelector("video");
          var activeFrame = box && box.querySelector("iframe");
          if (activeVideo) {
            try {
              if (activeVideo._hls && typeof activeVideo._hls.startLoad === "function") {
                activeVideo._hls.stopLoad();
                activeVideo._hls.startLoad();
              } else {
                activeVideo.load();
              }
              activeVideo.play().catch(function () {});
            } catch (_) {}
          } else if (activeFrame) {
            try { activeFrame.src = activeFrame.src; } catch (_) {}
          } else if (players.length) {
            var first = players[0];
            play(first, null);
          }
          window.setTimeout(function () { reloadPlayerBtn.classList.remove("is-loading"); }, 900);
        });
      }

      $all(".kx-chip-proxy").forEach(function (btn) {
        btn.onclick = function (e) {
          if (btn.classList.contains("kx-lang-hide")) return;
          if (e) e.stopPropagation();
          onServerPick(Number(btn.dataset.i), btn);
        };
      });

      if (window.__kxPick) {
        var pk = window.__kxPick;
        window.__kxPick = null;
        onServerPick(pk.i, pk.btn);
      }

      // Auto: UPNShare preferido en anime; si no, primer servidor del idioma.
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

      // Anime (4/5): preferir UPNShare solo en esta sesión (no localStorage)
      if (isAnimeSourceId(sourceId)) {
        auto = pickUpnShare(players);
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
        auto = firstOfLang(players, preferredLangForAuto) || players[0];
      }
      var autoIdx = players.indexOf(auto);
      var autoBtn = $('.kx-chip-proxy[data-i="' + autoIdx + '"]');
      if (autoBtn) {
        var dd = autoBtn.closest(".kx-dd");
        if (dd) {
          var val = dd.querySelector(".kx-dd-value");
          if (val && auto) val.textContent = serverLabel(auto);
          var b = dd.querySelector(".kx-dd-btn");
          if (b) b.classList.add("kx-dd-value-only");
        }
      }
      if (auto) play(auto, autoBtn);
      else box.innerHTML = '<div class="player-empty"><span class="kx-empty-ico">▶</span><span class="kx-load-text">Selecciona un servidor.</span></div>';
    } catch (e) {
      $("#view").innerHTML =
        '<div class="load">' + esc(e.message || String(e)) + "</div>";
    }
  };
})();
