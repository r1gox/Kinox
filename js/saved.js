/* Favoritos e historial: ordenar, quitar uno por uno y vaciar la lista. */
function loadSaved(which, title, empty) {
  var sortBy = 'recent';
  var isFavs = which === 'favs';
  var source = function () { return isFavs ? favs() : hist(); };

  function sorted() {
    var a = source().slice();
    if (sortBy === 'az') a.sort(function (x, y) { return String(x.title || '').localeCompare(String(y.title || ''), 'es'); });
    else if (sortBy === 'rating') a.sort(function (x, y) { return (y.rating || 0) - (x.rating || 0); });
    return a;
  }
  function item(it) {
    return (
      '<div class="saved-item" data-id="' + esc(it.id) + '" data-type="' + esc(it.type) + '">' +
      card(it) +
      '<button type="button" class="saved-x" data-list="' + which + '" aria-label="Quitar ' + esc(it.title) + '">✕</button></div>'
    );
  }
  function draw() {
    var a = sorted();
    var tools = source().length
      ? '<div class="saved-tools"><label>Ordenar por <select id="sortSel">' +
        [['recent', 'Más recientes'], ['az', 'A–Z'], ['rating', 'Mejor calificación']]
          .map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sortBy ? ' selected' : '') + '>' + o[1] + '</option>'; })
          .join('') +
        '</select></label><button type="button" id="clearAll" class="btn alt">' +
        (isFavs ? 'Vaciar mi lista' : 'Vaciar historial') + '</button></div>'
      : '';
    $('#view').innerHTML =
      '<section class="page"><h1>' + esc(title) + '</h1>' + tools +
      (a.length ? '<div class="grid">' + a.map(item).join('') + '</div>' : '<div class="empty">' + esc(empty) + '</div>') +
      '</section>';
    var sel = $('#sortSel');
    if (sel) sel.onchange = function () { sortBy = sel.value; draw(); };
    var clr = $('#clearAll');
    if (clr) clr.onclick = function () {
      if (!confirm(isFavs ? '¿Vaciar toda tu lista?' : '¿Borrar todo el historial?')) return;
      if (isFavs) mzFavClear(); else mzHistClear();
      draw();
    };
  }
  document.addEventListener('mz:list-changed', draw);
  draw();
}
