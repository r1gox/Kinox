/* Página de cuenta: registro, inicio de sesión, recuperar contraseña y estado de sincronización. */
(function () {
  var view = document.getElementById('view');
  var mode = /[?&]modo=registro/.test(location.search) ? 'register' : 'login'; // login | register | recover | reset
  var cloud = null;
  // El enlace del correo llega con #...type=recovery; supabase-js limpia el hash al leerlo.
  var isRecovery = /type=recovery/.test(location.hash);

  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function say(text, bad) {
    var m = document.getElementById('acMsg');
    if (!m) return;
    m.textContent = text || '';
    m.className = 'ac-msg ' + (bad ? 'bad' : 'ok');
  }
  function friendly(err) {
    var m = String((err && err.message) || err || '');
    if (/invalid login/i.test(m)) return 'Correo o contraseña incorrectos.';
    if (/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene una cuenta. Inicia sesión.';
    if (/not confirmed/i.test(m)) return 'Confirma tu correo antes de iniciar sesión (revisa también spam).';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
    if (/password/i.test(m) && /(weak|short|least)/i.test(m)) return 'La contraseña es muy débil. Usa al menos 8 caracteres.';
    if (/failed to fetch|network/i.test(m)) return 'Sin conexión con el servidor. Inténtalo de nuevo.';
    return m || 'Ocurrió un error inesperado.';
  }
  function frame(inner) {
    view.innerHTML = '<section class="page account" style="max-width:520px"><h1>Cuenta</h1>' + inner + '<p id="acMsg" class="ac-msg" role="status" aria-live="polite"></p></section>';
  }

  function renderNotConfigured() {
    frame(
      '<p class="ac-note">La cuenta todavía no está configurada en este sitio. Quien administra el sitio debe rellenar <code>js/config.js</code> con la URL y la <em>anon key</em> de Supabase (pasos en el README).</p>' +
      '<p class="ac-note">Mientras tanto, tus perfiles, favoritos e historial se guardan en este navegador. Puedes descargarlos desde <a href="' + esc(pageHref('perfil.html')) + '">Perfil</a>.</p>'
    );
  }

  function field(id, label, type, extra) {
    return '<label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + type + '" ' + (extra || '') + '>';
  }

  function renderLoggedOut() {
    var titles = { login: 'Iniciar sesión', register: 'Crear cuenta', recover: 'Recuperar contraseña', reset: 'Nueva contraseña' };
    var body = '';
    if (mode === 'login') body = field('acEmail', 'Correo', 'email', 'autocomplete="email" required') + field('acPass', 'Contraseña', 'password', 'autocomplete="current-password" required');
    if (mode === 'register') body = field('acName', 'Nombre (opcional)', 'text', 'maxlength="16" autocomplete="nickname"') + field('acEmail', 'Correo', 'email', 'autocomplete="email" required') + field('acPass', 'Contraseña (mínimo 8)', 'password', 'autocomplete="new-password" minlength="8" required');
    if (mode === 'recover') body = field('acEmail', 'Correo de tu cuenta', 'email', 'autocomplete="email" required');
    if (mode === 'reset') body = field('acPass', 'Nueva contraseña (mínimo 8)', 'password', 'autocomplete="new-password" minlength="8" required');
    frame(
      (mode === 'login' || mode === 'register'
        ? '<div class="ac-tabs" role="tablist"><button type="button" role="tab" data-mode="login" aria-selected="' + (mode === 'login') + '">Iniciar sesión</button><button type="button" role="tab" data-mode="register" aria-selected="' + (mode === 'register') + '">Crear cuenta</button></div>'
        : '<h2>' + titles[mode] + '</h2>') +
      '<div class="ac-form">' + body + '<button type="button" class="btn" id="acGo">' + titles[mode] + '</button></div>' +
      (mode === 'login' ? '<p class="ac-links"><a href="#" data-mode="recover">¿Olvidaste tu contraseña?</a></p>' : '') +
      (mode === 'recover' ? '<p class="ac-links"><a href="#" data-mode="login">← Volver</a></p>' : '') +
      '<p class="ac-note">Con una cuenta tus perfiles, favoritos, historial y episodios vistos se sincronizan entre dispositivos. No es obligatoria. ' +
      (mode === 'register' ? 'Al crearla aceptas nuestra ' : 'Consulta nuestra ') + '<a href="/privacidad">política de privacidad</a>.</p>'
    );
    Array.prototype.forEach.call(view.querySelectorAll('[data-mode]'), function (b) {
      b.onclick = function (e) { e.preventDefault(); mode = b.getAttribute('data-mode'); renderLoggedOut(); };
    });
    var go = document.getElementById('acGo');
    go.onclick = submit;
    Array.prototype.forEach.call(view.querySelectorAll('input'), function (i) {
      i.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    });
  }

  async function submit() {
    var go = document.getElementById('acGo');
    var email = (document.getElementById('acEmail') || {}).value;
    var pass = (document.getElementById('acPass') || {}).value;
    var name = ((document.getElementById('acName') || {}).value || '').trim();
    email = (email || '').trim();
    if (mode !== 'reset' && !/^\S+@\S+\.\S+$/.test(email)) return say('Escribe un correo válido.', true);
    if ((mode === 'register' || mode === 'reset') && (pass || '').length < 8) return say('La contraseña debe tener al menos 8 caracteres.', true);
    if (mode === 'login' && !pass) return say('Escribe tu contraseña.', true);
    go.disabled = true;
    say('Un momento…');
    try {
      var auth = cloud.client.auth;
      if (mode === 'login') {
        var r = await auth.signInWithPassword({ email: email, password: pass });
        if (r.error) throw r.error;
      } else if (mode === 'register') {
        var r2 = await auth.signUp({ email: email, password: pass, options: { data: name ? { display_name: name } : {}, emailRedirectTo: location.origin + location.pathname } });
        if (r2.error) throw r2.error;
        if (!r2.data.session) {
          mode = 'login';
          renderLoggedOut();
          return say('Cuenta creada. Te enviamos un correo para confirmarla; después inicia sesión.');
        }
        // Si el perfil local sigue siendo el "Invitado" de fábrica, usa el nombre elegido.
        if (name) {
          var ps = store.get('mz_profiles', []);
          if (ps.length === 1 && ps[0].name === 'Invitado') { ps[0].name = name; store.set('mz_profiles', ps); }
        }
      } else if (mode === 'recover') {
        var r3 = await auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (r3.error) throw r3.error;
        go.disabled = false;
        return say('Si el correo existe, te enviamos un enlace para cambiar la contraseña.');
      } else if (mode === 'reset') {
        var r4 = await auth.updateUser({ password: pass });
        if (r4.error) throw r4.error;
        mode = 'login';
      }
      cloud.user = (await auth.getSession()).data.session?.user || null;
      if (cloud.user) {
        say('Sincronizando tus datos…');
        try {
          await cloud.pull({ reload: false });
        } catch (e) {
          render();
          return say('Iniciaste sesión, pero no se pudo sincronizar: ' + friendly(e), true);
        }
        say('¡Listo! Ahora elige tu perfil…');
        setTimeout(function () { location.href = pageHref('perfil.html'); }, 800);
      }
    } catch (e) {
      go.disabled = false;
      say(friendly(e), true);
    }
  }

  function renderLoggedIn() {
    var u = cloud.user;
    var meta = (u.user_metadata && u.user_metadata.display_name) || '';
    var at = localStorage.getItem('mz_sync_at');
    frame(
      '<div class="ac-card"><div class="ac-avatar" aria-hidden="true"></div><div><strong id="acWho"></strong><small id="acMail"></small></div></div>' +
      '<p class="ac-note" id="acSync"></p>' +
      '<div class="ac-actions"><button type="button" class="btn" id="acSyncNow">Sincronizar ahora</button><button type="button" class="btn alt" id="acOut">Cerrar sesión</button></div>' +
      '<details class="ac-danger"><summary>Más opciones</summary>' +
      '<p class="ac-note">Borra de la nube los datos sincronizados. No borra tu cuenta ni los datos de este dispositivo.</p><button type="button" class="btn alt" id="acDel">Borrar mis datos de la nube</button>' +
      '<p class="ac-note">Elimina tu cuenta y todo lo que está guardado en ella, de forma permanente. Los datos de este dispositivo no se borran.</p><button type="button" class="btn alt ac-kill" id="acKill">Eliminar mi cuenta</button></details>'
    );
    document.getElementById('acWho').textContent = meta || 'Mi cuenta';
    document.getElementById('acMail').textContent = u.email || '';
    document.querySelector('.ac-avatar').textContent = String(meta || u.email || '?').charAt(0).toUpperCase();
    function paintSync() {
      var t = localStorage.getItem('mz_sync_at');
      document.getElementById('acSync').textContent = t ? 'Última sincronización: ' + new Date(t).toLocaleString('es') : 'Aún no se ha sincronizado.';
    }
    paintSync();
    document.getElementById('acSyncNow').onclick = async function () {
      say('Sincronizando…');
      try { await cloud.push(); paintSync(); say('Listo, tus datos están al día.'); } catch (e) { say(friendly(e), true); }
    };
    document.getElementById('acOut').onclick = async function () {
      if (!confirm('¿Cerrar sesión?')) return;
      var wipe = confirm('¿Borrar también los datos de ESTE dispositivo (perfiles, favoritos, historial)?\n\nSigue guardados en tu cuenta. Es lo recomendable en equipos compartidos.\n\nAceptar = borrar de este dispositivo\nCancelar = conservarlos aquí');
      try { await cloud.push(); } catch (e) { /* si falla, se sigue con el cierre */ }
      await cloud.client.auth.signOut();
      localStorage.removeItem('mz_sync_at');
      if (wipe) {
        try { Object.keys(mzBackupBuild(localStorage).data).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
      }
      location.reload();
    };
    document.getElementById('acDel').onclick = async function () {
      if (!confirm('¿Borrar tus datos guardados en la nube? Esta acción no se puede deshacer.')) return;
      var r = await cloud.client.from('user_data').delete().eq('user_id', u.id);
      if (r.error) return say(friendly(r.error), true);
      localStorage.removeItem('mz_sync_at');
      say('Datos de la nube borrados.');
      paintSync();
    };
    document.getElementById('acKill').onclick = deleteAccount;
  }

  async function deleteAccount() {
    var typed = prompt('Esto elimina tu cuenta y tus datos guardados en ella de forma PERMANENTE.\n\nEscribe ELIMINAR para confirmar:');
    if (typed === null) return;
    if (String(typed).trim().toUpperCase() !== 'ELIMINAR') return say('No se eliminó nada: la confirmación no coincide.', true);
    say('Eliminando cuenta…');
    var r = await cloud.client.rpc('delete_my_account');
    if (r.error) {
      var missing = /could not find the function|schema cache|does not exist/i.test(r.error.message || '');
      return say(missing ? 'La eliminación de cuentas aún no está instalada en la base de datos (ejecuta supabase/schema.sql).' : friendly(r.error), true);
    }
    try { await cloud.client.auth.signOut({ scope: 'local' }); } catch (e) { /* la cuenta ya no existe */ }
    localStorage.removeItem('mz_sync_at');
    say('Tu cuenta fue eliminada.');
    setTimeout(function () { location.href = appLink('/'); }, 1200);
  }

  function render() { if (cloud.user) renderLoggedIn(); else renderLoggedOut(); }

  async function start() {
    view.innerHTML = '<div class="load is-loading" role="status">Cargando cuenta…</div>';
    cloud = await mzCloudLoaded();
    if (!cloud || !cloud.configured) return renderNotConfigured();
    try { await cloud.ready; } catch (e) { return frame('<p class="ac-note">' + esc(friendly(e)) + '</p>'); }
    document.addEventListener('mz:auth', function (ev) {
      if (ev.detail && ev.detail.event === 'PASSWORD_RECOVERY') { mode = 'reset'; renderLoggedOut(); }
    });
    if (isRecovery) { mode = 'reset'; renderLoggedOut(); } else render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
