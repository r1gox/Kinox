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

    // Enriquecer con id TMDB → mismo detalle que el catálogo (id=108978, etc.)
    if (typeof resolveTmdbIdForTitle === 'function' && KEY) {
      items = await Promise.all(
        items.map(async function (it) {
          try {
            const tipo = String(it.type || it.tipo || '').toLowerCase();
            const isTv = /serie|tv|anime|dorama/.test(tipo);
            const title = it.title || it.titulo || '';
            const year = it.year || '';
            const tid = await resolveTmdbIdForTitle(title, isTv ? 'tv' : 'movie', year);
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
    $('#view').innerHTML = '<div class="load">' + esc(e.message) + '</div>';
  }
})();
