// Buscador → Worker universal: https://moviezone.tvjz.workers.dev/?q=
(async () => {
  try {
    const q = new URL(location.href).searchParams.get('q') || '';
    const input = document.getElementById('q');
    if (input) input.value = q;

    if (!q) {
      $('#view').innerHTML =
        '<section class="page"><h1>Buscar</h1><div class="empty">Escribe un título en el buscador.</div></section>';
      return;
    }

    $('#view').innerHTML =
      '<section class="page"><h1>Buscando…</h1><div class="load">Consultando ' +
      esc(q) +
      '</div></section>';

    const url = MZ_WORKER + '/?q=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('Worker HTTP ' + r.status);
    const data = await r.json();
    const items = Array.isArray(data.results) ? data.results : Array.isArray(data) ? data : [];

    $('#view').innerHTML =
      '<section class="page"><h1>Resultados para “' +
      esc(q) +
      '”</h1>' +
      (items.length
        ? '<div class="grid">' + items.map(workerCard).join('') + '</div>'
        : '<div class="empty">No se encontraron resultados.</div>') +
      '</section>';
  } catch (e) {
    $('#view').innerHTML = '<div class="load">' + esc(e.message) + '</div>';
  }
})();
