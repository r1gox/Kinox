/* Exportar / importar los datos locales (perfiles, favoritos, historial, progreso).
   Las funciones puras (mzBackupBuild / mzBackupParse) están en common.js. */

(function () {
  function start() {
    var view = document.getElementById('view');
    if (!view || !view.insertAdjacentHTML) return;
    view.insertAdjacentHTML(
      'afterend',
      '<section class="page backup" style="max-width:760px;padding-top:0">' +
      '<h2>Tus datos</h2>' +
      '<p>Se guardan solo en este navegador. Descarga una copia para pasarlos a otro dispositivo o por si limpias el navegador.</p>' +
      '<div class="backup-actions"><button type="button" class="btn" id="bkExport">Exportar copia</button>' +
      '<label class="btn alt" for="bkImport" tabindex="0" id="bkImportLbl">Importar copia</label>' +
      '<input type="file" id="bkImport" accept="application/json,.json" hidden></div>' +
      '<p id="bkMsg" role="status" aria-live="polite"></p>' +
      '<p><a href="' + esc(pageHref('cuenta.html')) + '" style="color:var(--ac)">Crear cuenta o iniciar sesión para sincronizar →</a></p></section>'
    );
    var msg = document.getElementById('bkMsg');
    function say(t, bad) { msg.textContent = t; msg.className = bad ? 'bk-bad' : 'bk-ok'; }

    document.getElementById('bkExport').onclick = function () {
      try {
        var blob = new Blob([JSON.stringify(mzBackupBuild(localStorage), null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'moviezone-copia-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        say('Copia descargada.');
      } catch (e) { say('No se pudo crear la copia.', true); }
    };

    var lbl = document.getElementById('bkImportLbl'), inp = document.getElementById('bkImport');
    lbl.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) return say('El archivo es demasiado grande.', true);
      var r = new FileReader();
      r.onload = function () {
        var res = mzBackupParse(String(r.result));
        if (!res.ok) return say(res.error, true);
        if (!confirm('Esto reemplazará tus perfiles, favoritos, historial y progreso actuales. ¿Continuar?')) return;
        try {
          Object.keys(res.data).forEach(function (k) { localStorage.setItem(k, res.data[k]); });
          say('Copia importada. Recargando…');
          setTimeout(function () { location.reload(); }, 600);
        } catch (e) { say('No se pudo guardar (¿almacenamiento lleno?).', true); }
      };
      r.onerror = function () { say('No se pudo leer el archivo.', true); };
      r.readAsText(f);
      inp.value = '';
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
