async function loadPlayer() {
  try {
    var u = new URL(location.href);
    var type = u.searchParams.get('type') || 'movie';
    var id = u.searchParams.get('id');
    var season = u.searchParams.get('season');
    var episode = u.searchParams.get('episode');
    var slug = u.searchParams.get('slug');
    var sourceId = u.searchParams.get('source_id') || u.searchParams.get('source') || null;
    var urlVid = u.searchParams.get('url_vid') || null;
    if (urlVid) {
      try { urlVid = decodeURIComponent(urlVid); } catch (_) {}
    }
    // Serie: si url_vid no trae /temp/ep, anexarlos
    if (urlVid && type === 'tv' && season && episode) {
      if (!/\/\d+\/\d+\/?$/.test(urlVid)) {
        urlVid = urlVid.replace(/\/$/, '') + '/' + season + '/' + episode;
      }
    }

    var meta = null;
    if (typeof KEY !== 'undefined' && KEY && id) {
      try {
        meta = await tmdb('/' + type + '/' + id);
        if (!slug) slug = mzSlug(meta.title || meta.name);
        document.title = (meta.title || meta.name || 'Reproductor') + ' — Kinox';
      } catch (_) {}
    }
    if (!slug && !urlVid) {
      $('#view').innerHTML = '<div class="load">Falta el slug del título.</div>';
      return;
    }
    if (type === 'tv') {
      season = season || '1';
      episode = episode || '1';
    }

    var title = (meta && (meta.title || meta.name)) || (slug || 'Reproducción').replace(/-/g, ' ');
    var label = type === 'tv' ? ('Temporada ' + season + ' · Episodio ' + episode) : 'Película';

    $('#view').innerHTML =
      '<section class="page player-page">' +
      '<div class="player-head"><a class="back" href="javascript:history.back()">← Volver</a>' +
      '<h1>' + esc(title) + '</h1><small>' + esc(label) + '</small></div>' +
      '<div id="playerBox" class="mz-player"><div class="player-loading">Buscando reproductores…</div></div>' +
      '<div id="servers" class="servers"></div></section>';

    var box = $('#playerBox');
    var servers = $('#servers');
    var data = await mzPlayers({
      type: type,
      slug: slug,
      season: season,
      episode: episode,
      source_id: sourceId,
      url_vid: urlVid
    });
    var players = data.reproductores || [];

    if (!players.length) {
      box.innerHTML = '<div class="player-empty">No hay reproductores disponibles.</div>';
      return;
    }

    servers.innerHTML =
      '<h3>Servidores</h3><div class="server-list">' +
      players.map(function (p, i) {
        var lang = (p.language || p.idioma || '').toUpperCase();
        return (
          '<button class="server-btn' + (i === 0 ? ' active' : '') + '" data-i="' + i + '">' +
          esc(p.name || 'Servidor ' + (i + 1)) +
          (lang ? '<small>' + esc(lang) + '</small>' : '') +
          '</button>'
        );
      }).join('') +
      '</div>';

    function extractVideoUrl(x) {
      if (typeof x === 'string') {
        var s = x.trim();
        if (/^https?:\/\//i.test(s)) return s;
        try { return extractVideoUrl(JSON.parse(s)); } catch (e) { return null; }
      }
      if (!x || typeof x !== 'object') return null;
      var keys = ['hls', 'hls_url', 'm3u8', 'url', 'stream_url', 'source', 'file', 'src', 'video_url', 'play_url'];
      for (var i = 0; i < keys.length; i++) {
        if (typeof x[keys[i]] === 'string' && /^https?:\/\//i.test(x[keys[i]])) return x[keys[i]];
      }
      var nested = ['data', 'result', 'stream', 'video', 'source', 'sources'];
      for (var j = 0; j < nested.length; j++) {
        var v = x[nested[j]];
        if (Array.isArray(v)) {
          for (var n = 0; n < v.length; n++) {
            var z = extractVideoUrl(v[n]);
            if (z) return z;
          }
        } else {
          var z2 = extractVideoUrl(v);
          if (z2) return z2;
        }
      }
      return null;
    }

    function renderVideo(src) {
      var poster = meta && meta.backdrop_path ? IMG + 'w1280' + meta.backdrop_path : '';
      box.innerHTML = '<video id="mzVideo" controls playsinline preload="metadata" poster="' + poster + '"></video>';
      var video = $('#mzVideo');
      if (/\.m3u8(?:\?|$)/i.test(src) || /m3u8/i.test(src)) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = src;
        else if (window.Hls && Hls.isSupported()) {
          var hls = new Hls({ enableWorker: true });
          hls.loadSource(src);
          hls.attachMedia(video);
          video._hls = hls;
        } else {
          box.innerHTML = '<div class="player-empty">Tu navegador no puede reproducir HLS.</div>';
          return;
        }
      } else video.src = src;
      video.play().catch(function () {});
    }

    function renderIframe(url) {
      box.innerHTML =
        '<iframe class="mz-iframe" src="' + esc(url) +
        '" allowfullscreen allow="autoplay; encrypted-media" referrerpolicy="no-referrer" style="width:100%;aspect-ratio:16/9;border:0;border-radius:12px;background:#000"></iframe>';
    }

    async function play(p, btn) {
      document.querySelectorAll('.server-btn').forEach(function (x) { x.classList.remove('active'); });
      btn.classList.add('active');
      box.innerHTML = '<div class="player-loading">Resolviendo video…</div>';
      var endpoint = p.hls_resolve || p.stream_url;
      if (endpoint) {
        try {
          var src = null;
          if (/\.m3u8(?:\?|$)/i.test(endpoint) || /\.mp4(?:\?|$)/i.test(endpoint)) src = endpoint;
          else {
            var r = await fetch(endpoint, { headers: { Accept: 'application/json,text/plain,*/*' } });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            var raw = await r.text();
            var payload;
            try { payload = JSON.parse(raw); } catch (e) { payload = raw; }
            src = extractVideoUrl(payload);
          }
          if (src) { renderVideo(src); return; }
        } catch (e) { console.warn(e); }
      }
      if (p.url && /^https?:\/\//i.test(p.url)) { renderIframe(p.url); return; }
      box.innerHTML = '<div class="player-empty">No se pudo iniciar este servidor.</div>';
    }

    document.querySelectorAll('.server-btn').forEach(function (btn) {
      btn.onclick = function () { play(players[Number(btn.dataset.i)], btn); };
    });
    var first = document.querySelector('.server-btn');
    if (first) play(players[0], first);
    else box.innerHTML = '<div class="player-empty">Selecciona un servidor.</div>';
  } catch (e) {
    $('#view').innerHTML = '<div class="load">' + esc(e.message) + '</div>';
  }
}
