/* Mi lista (con etiquetas) e historial: filtrar, ordenar, quitar uno por uno y vaciar. */
function loadSaved(which, title, empty) {
  var sortBy = 'recent';
  var tagFilter = 'all';
  var isFavs = which === 'favs';
  var source = function () { return isFavs ? favs() : hist(); };

  function visible() {
    var a = source().slice();
    if (isFavs && tagFilter !== 'all') a = a.filter(function (it) { return (mzTagValid(it.tag) || 'fav') === tagFilter; });
    if (sortBy === 'az') a.sort(function (x, y) { return String(x.title || '').localeCompare(String(y.title || ''), 'es'); });
    else if (sortBy === 'rating') a.sort(function (x, y) { return (y.rating || 0) - (x.rating || 0); });
    return a;
  }
  function countOf(tag) {
    return source().filter(function (it) { return (mzTagValid(it.tag) || 'fav') === tag; }).length;
  }
  function tagSelect(it) {
    var cur = mzTagValid(it.tag) || 'fav';
    return (
      '<label class="saved-tag"><span class="sr-only">Etiqueta de ' + esc(it.title) + '</span><select data-tagsel>' +
      mzTags().map(function (t) { return '<option value="' + t.id + '"' + (t.id === cur ? ' selected' : '') + '>' + esc(t.label) + '</option>'; }).join('') +
      '</select></label>'
    );
  }
  function item(it) {
    return (
      '<div class="saved-item" data-id="' + esc(it.id) + '" data-type="' + esc(it.type) + '">' +
      card(it) +
      '<button type="button" class="saved-x" data-list="' + which + '" aria-label="Quitar ' + esc(it.title) + '">✕</button>' +
      (isFavs ? tagSelect(it) : '') + '</div>'
    );
  }
  function chips() {
    if (!isFavs || !source().length) return '';
    var all = [{ id: 'all', label: 'Todas', n: source().length }].concat(
      mzTags().map(function (t) { return { id: t.id, label: t.id === 'fav' ? 'Favoritas' : t.id === 'seen' ? 'Vistas' : t.label, n: countOf(t.id) }; })
    );
    return (
      '<div class="saved-chips" role="group" aria-label="Filtrar por etiqueta">' +
      all.map(function (c) {
        return '<button type="button" class="chip' + (c.id === tagFilter ? ' on' : '') + '" data-chip="' + c.id + '" aria-pressed="' + (c.id === tagFilter) + '">' + esc(c.label) + ' <span>' + c.n + '</span></button>';
      }).join('') + '</div>'
    );
  }
  function draw() {
    var a = visible();
    var tools = source().length
      ? '<div class="saved-tools"><label>Ordenar por <select id="sortSel">' +
        [['recent', 'Más recientes'], ['az', 'A–Z'], ['rating', 'Mejor calificación']]
          .map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sortBy ? ' selected' : '') + '>' + o[1] + '</option>'; })
          .join('') +
        '</select></label><button type="button" id="clearAll" class="btn alt">' +
        (isFavs ? 'Vaciar mi lista' : 'Vaciar historial') + '</button></div>'
      : '';
    var emptyMsg = source().length && !a.length ? 'No tienes títulos con esta etiqueta.' : empty;
    $('#view').innerHTML =
      '<section class="page"><h1>' + esc(title) + '</h1>' + chips() + tools +
      (a.length ? '<div class="grid">' + a.map(item).join('') + '</div>' : '<div class="empty">' + esc(emptyMsg) + '</div>') +
      '</section>';

    var sel = $('#sortSel');
    if (sel) sel.onchange = function () { sortBy = sel.value; draw(); };
    var clr = $('#clearAll');
    if (clr) clr.onclick = function () {
      if (!confirm(isFavs ? '¿Vaciar toda tu lista?' : '¿Borrar todo el historial?')) return;
      if (isFavs) mzFavClear(); else mzHistClear();
      tagFilter = 'all';
      draw();
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-chip]'), function (b) {
      b.onclick = function () { tagFilter = b.getAttribute('data-chip'); draw(); var again = document.querySelector('[data-chip="' + tagFilter + '"]'); if (again) again.focus(); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tagsel]'), function (s) {
      s.onchange = function () {
        var box = s.closest('[data-id]');
        var found = favs().filter(function (f) { return mzSameItem(f, box.getAttribute('data-id'), box.getAttribute('data-type')); })[0];
        if (found) mzListSet(found, s.value);
        draw();
      };
    });
  }
  document.addEventListener('mz:list-changed', draw);
  draw();
}
