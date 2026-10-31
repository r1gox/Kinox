/* Tarjeta de cuenta en la pantalla de perfiles: invita a crear cuenta o muestra el estado de sincronización.
   Siempre visible; si Supabase no está configurado (js/config.js) se avisa dentro de la tarjeta. */
(function () {
  var view = document.getElementById('view');
  if (!view || !view.insertAdjacentHTML) return;

  var ICON = {
    cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.5a4.75 4.75 0 0 1 .5 9.5z"/><path d="M9 13l2 2 4-4"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M10 8.8l5 3.2-5 3.2z"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 19c.8-3.4 3.6-5 7-5s6.2 1.6 7 5"/></svg>',
  };

  function loggedOut() {
    return (
      '<section class="sync-card" aria-labelledby="scTitle"><div class="sc-icon">' + ICON.cloud + '</div><div class="sc-body">' +
      '<h2 id="scTitle">Lleva tus perfiles a todos tus dispositivos</h2>' +
      '<p>Crea una cuenta gratis y tus favoritos, historial y episodios vistos se guardan solos.</p>' +
      '<ul class="sc-feats"><li>' + ICON.heart + 'Favoritos</li><li>' + ICON.clock + 'Historial</li><li>' + ICON.play + 'Episodios vistos</li><li>' + ICON.user + 'Perfiles y fotos</li></ul>' +
      '<div class="sc-actions"><a class="btn" href="' + esc(pageHref('cuenta.html', { modo: 'registro' })) + '">Crear cuenta</a>' +
      '<a class="btn alt" href="' + esc(pageHref('cuenta.html')) + '">Iniciar sesión</a></div></div></section>'
    );
  }

  function loggedIn(user) {
    var name = (user.user_metadata && user.user_metadata.display_name) || '';
    return (
      '<section class="sync-card ok" aria-labelledby="scTitle"><div class="sc-icon">' + ICON.cloud + '</div><div class="sc-body">' +
      '<h2 id="scTitle">Cuenta conectada</h2>' +
      '<p class="sc-mail">' + esc(name ? name + ' · ' : '') + esc(user.email || '') + '</p>' +
      '<p class="sc-status"><span class="sc-dot" aria-hidden="true"></span><span id="scSync"></span></p>' +
      '<div class="sc-actions"><a class="btn alt" href="' + esc(pageHref('cuenta.html')) + '">Administrar cuenta</a></div></div></section>'
    );
  }

  function connecting() {
    return (
      '<section class="sync-card ok" aria-labelledby="scTitle"><div class="sc-icon">' + ICON.cloud + '</div><div class="sc-body">' +
      '<h2 id="scTitle">Cuenta conectada</h2><p class="sc-status"><span class="sc-dot" aria-hidden="true"></span>Comprobando…</p></div></section>'
    );
  }
  function hasStoredSession() {
    try {
      for (var i = 0; i < localStorage.length; i++) if (/^sb-.+-auth-token$/.test(localStorage.key(i))) return true;
    } catch (e) { /* sin acceso a localStorage */ }
    return false;
  }

  // La tarjeta se pinta al instante (no depende de que la nube cargue); luego se ajusta al estado real.
  var host = document.createElement('div');
  view.insertAdjacentElement('afterend', host);
  host.innerHTML = hasStoredSession() ? connecting() : loggedOut();

  async function start() {
    var cloud = await mzCloudLoaded();
    if (!cloud || !cloud.configured) {
      // Sin Supabase configurado los botones siguen visibles; la página de cuenta explica qué falta.
      host.innerHTML = loggedOut().replace('</div></section>', '<p class="sc-warn">La cuenta aún no está configurada en este sitio (js/config.js).</p></div></section>');
      return;
    }
    try { await cloud.ready; } catch (e) { /* si falla, se muestra como sin sesión */ }
    host.innerHTML = cloud.user ? loggedIn(cloud.user) : loggedOut();
    var out = document.getElementById('scSync');
    if (!out) return;
    function paint() {
      var at = localStorage.getItem('mz_sync_at');
      out.textContent = at ? 'Sincronizado ' + mzTimeAgo(at) : 'Sincronizando…';
    }
    paint();
    document.addEventListener('mz:cloud-synced', paint);
    setInterval(paint, 30000);
  }
  start();
})();
