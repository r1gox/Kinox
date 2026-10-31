(async () => {
  try {
    const q = new URL(location.href).searchParams.get('q') || '';
    const input = document.getElementById('q');
    if (input) input.value = q;
    if (!q) {
      $('#view').innerHTML = '<section class="page"><h1>Buscar</h1><div class="empty">Escribe un título en el buscador.</div></section>';
      return;
    }
    $('#view').innerHTML = '<section class="page"><h1>Buscando…</h1><div class="load">' + esc(q) + '</div></section>';
    const base = (typeof MZ_SEARCH !== 'undefined' && MZ_SEARCH) || (typeof MZ_WORKER !== 'undefined' && MZ_WORKER) || 'https://moviezone.tvjz.workers.dev';
    const r = await fetch(base + '/?q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('Worker HTTP ' + r.status);
    const data = await r.json();
    let items = Array.isArray(data.results) ? data.results : Array.isArray(data) ? data : [];
    if (typeof preferAnimeSource === 'function') items = preferAnimeSource(items);

    // Un solo resultado por slug (mismo título suele venir de varias fuentes: 4, 9, etc.)
    // Tras preferAnimeSource se conserva el primero = fuente prioritaria.
    (function dedupeBySlug() {
      var seen = Object.create(null);
      var out = [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var slug = String(it.slug || '').toLowerCase().trim();
        if (!slug && typeof slugify === 'function') {
          slug = slugify(it.title || it.titulo || '');
        }
        if (!slug) {
          out.push(it);
          continue;
        }
        if (seen[slug]) continue;
        seen[slug] = true;
        out.push(it);
      }
      items = out;
    })();

    // Enriquecer con id TMDB (nombres anime suelen diferir → cleanAnimeTitle + original)
    if (typeof resolveTmdbIdForTitle === 'function' && KEY) {
      items = await Promise.all(
        items.map(async function (it) {
          try {
            const tipo = String(it.type || it.tipo || '').toLowerCase();
            const isTv = /serie|tv|anime|dorama|ova|ona/.test(tipo);
            const title = it.title || it.titulo || '';
            const year = it.year || '';
            const tid = await resolveTmdbIdForTitle(title, isTv ? 'tv' : 'movie', year, {
              original: it.titulo_original || it.original_title
            });
            if (tid) it.tmdb_id = tid;
          } catch (_) {}
          return it;
        })
      );
    }

    $('#view').innerHTML =
      '<section class="page"><h1>Resultados para “' + esc(q) + '”</h1>' +
      (items.length ? '<div class="grid">' + items.map(workerCard).join('') + '</div>' : '<div class="empty">No se encontraron resultados.</div>') +
      '</section>';
  } catch (e) {
    $('#view').innerHTML = mzErrorHtml(e.message, 'No se pudo completar la búsqueda');
  }
})();
