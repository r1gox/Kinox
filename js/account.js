/* Página de cuenta: registro, inicio de sesión, recuperar contraseña y estado de sincronización. */
(function () {
  var view = document.getElementById('view');
  var mode = /[?&]modo=registro/.test(location.search) ? 'register' : 'login'; // login | register | recover | reset
  var cloud = null;
  // El enlace del correo llega con #...type=recovery; supabase-js limpia el hash al leerlo.
  var isRecovery = /type=recovery/.test(location.hash);
  // Al volver de Google llegan los datos de sesión (o un error) en la dirección; se guardan antes de que se limpien.
  var urlState = location.hash + location.search;
  var isOAuth = /access_token=|refresh_token=/.test(location.hash);

  var COPY = {
    login: { title: 'Bienvenido de nuevo', sub: 'Inicia sesión para sincronizar tu lista, tu historial y tus perfiles.', cta: 'Iniciar sesión' },
    register: { title: 'Crea tu cuenta', sub: 'Es gratis y toma menos de un minuto.', cta: 'Crear cuenta' },
    recover: { title: 'Recupera tu contraseña', sub: 'Escribe el correo de tu cuenta y te enviamos un enlace para elegir una nueva.', cta: 'Enviar enlace' },
    reset: { title: 'Elige una nueva contraseña', sub: 'Usa al menos 8 caracteres.', cta: 'Guardar contraseña' },
  };

  var S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    mail: '<svg viewBox="0 0 24 24" ' + S + ' aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/></svg>',
    lock: '<svg viewBox="0 0 24 24" ' + S + ' aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="3"/><path d="M8 10V8a4 4 0 0 1 8 0v2"/></svg>',
    user: '<svg viewBox="0 0 24 24" ' + S + ' aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 19c.8-3.4 3.6-5 7-5s6.2 1.6 7 5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" ' + S + ' aria-hidden="true"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" ' + S + ' aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 6.2A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.6C3.9 9.3 2 12 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" ' + S + ' aria-hidden="true"><path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.5a4.75 4.75 0 0 1 .5 9.5z"/><path d="M9 13l2 2 4-4"/></svg>',
    users: '<svg viewBox="0 0 24 24" ' + S + ' aria-hidden="true"><circle cx="9" cy="8.5" r="3"/><path d="M3 19c.7-3 3-4.5 6-4.5s5.3 1.5 6 4.5"/><path d="M16 5.8a3 3 0 0 1 0 5.4M17.5 14.6c2 .5 3.1 2 3.5 4.4"/></svg>',
    heart: '<svg viewBox="0 0 24 24" ' + S + ' aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    play: '<svg viewBox="0 0 24 24" ' + S + ' aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M10 8.8l5 3.2-5 3.2z"/></svg>',
    logo: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b4ff0"/><stop offset="1" stop-color="#d6347f"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#lg)"/><path d="M25 19l22 13-22 13z" fill="#fff"/></svg>',
  };

  function say(text, bad) {
    var m = document.getElementById('acMsg');
    if (!m) return;
    m.textContent = text || '';
    m.className = 'ac-msg' + (text ? (bad ? ' bad' : ' ok') : '');
    m.setAttribute('role', bad ? 'alert' : 'status');
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

  // ---------- Estructura general: panel de marca + tarjeta ----------
  function brandPanel() {
    return (
      '<aside class="auth-brand"><div class="ab-logo"><span class="ab-mark">' + ICON.logo + '</span><span>MovieZone</span></div>' +
      '<h2>Tu cine, en todos tus dispositivos</h2>' +
      '<p>Guarda tu lista y sigue donde lo dejaste, en el teléfono, la computadora o la tele.</p>' +
      '<ul class="ab-list">' +
      '<li><span>' + ICON.users + '</span>Perfiles con avatar o tu propia foto</li>' +
      '<li><span>' + ICON.heart + '</span>Favoritos, “Ver después” y “Vistas”</li>' +
      '<li><span>' + ICON.play + '</span>Episodios y progreso sincronizados</li>' +
      '<li><span>' + ICON.cloud + '</span>Copia automática de tus datos</li>' +
      '</ul><p class="ab-foot">Gratis y sin anuncios</p></aside>'
    );
  }
  function frame(inner, solo) {
    view.innerHTML =
      '<div class="auth' + (solo ? ' auth-solo' : '') + '">' + (solo ? '' : brandPanel()) +
      '<section class="auth-card" aria-labelledby="authTitle">' + inner + '<div id="acMsg" class="ac-msg" role="status" aria-live="polite"></div></section></div>';
  }
  function waiting(text) {
    frame('<div class="auth-wait" role="status"><span class="spin" aria-hidden="true"></span><p id="authTitle">' + esc(text) + '</p></div>', true);
  }

  function renderNotConfigured() {
    frame(
      '<h1 id="authTitle">Cuenta no disponible</h1>' +
      '<p class="auth-sub">La cuenta todavía no está configurada en este sitio. Quien lo administra debe rellenar <code>js/config.js</code> con la URL y la <em>anon key</em> de Supabase (los pasos están en el README).</p>' +
      '<p class="auth-sub">Mientras tanto, tus perfiles, favoritos e historial se guardan en este navegador. Puedes verlos desde <a href="' + esc(pageHref('perfil.html')) + '">Perfil</a>.</p>',
      true
    );
  }

  // ---------- Campos ----------
  function field(o) {
    var pw = o.type === 'password';
    return (
      '<div class="fld"><label for="' + o.id + '">' + o.label + '</label><div class="fld-box"><span class="fld-ic">' + ICON[o.icon] + '</span>' +
      '<input id="' + o.id + '" type="' + o.type + '" autocomplete="' + o.auto + '" placeholder="' + o.ph + '" aria-describedby="' + o.id + 'Err" ' + (o.extra || '') + '>' +
      (pw ? '<button type="button" class="fld-eye" data-eye="' + o.id + '" aria-label="Mostrar contraseña" aria-pressed="false">' + ICON.eye + '</button>' : '') +
      '</div><p class="fld-err" id="' + o.id + 'Err" role="alert"></p></div>'
    );
  }
  function setErr(id, msg) {
    var input = document.getElementById(id), p = document.getElementById(id + 'Err');
    if (!input || !p) return;
    p.textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    var box = input.closest ? input.closest('.fld') : null;
    if (box) box.classList.toggle('bad', !!msg);
  }

  function googleButton() {
    return (
      '<button type="button" class="g-btn" id="acGoogle">' +
      '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>' +
      '<span>Continuar con Google</span></button><p class="ac-or"><span>o con tu correo</span></p>'
    );
  }

  async function googleSignIn() {
    var b = document.getElementById('acGoogle');
    if (b) b.disabled = true;
    say('Abriendo Google…');
    try {
      // Vuelve a esta misma página; Supabase devuelve la sesión en la dirección.
      var r = await cloud.client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } },
      });
      if (r.error) throw r.error;
    } catch (e) {
      if (b) b.disabled = false;
      say(friendly(e), true);
    }
  }

  // Después de iniciar sesión (correo o Google): sincroniza solo y lleva a elegir perfil.
  async function syncAndGo() {
    say('Sincronizando tus datos…');
    try {
      await cloud.pull({ reload: false });
    } catch (e) {
      render();
      return say('Iniciaste sesión, pero no se pudo sincronizar: ' + friendly(e), true);
    }
    // Cuenta nueva con perfil de fábrica ("Invitado"): usa tu primer nombre.
    var md = (cloud.user && cloud.user.user_metadata) || {};
    var nm = String(md.display_name || md.full_name || md.name || '').trim().split(/\s+/)[0].slice(0, 16);
    if (nm) {
      var ps = store.get('mz_profiles', []);
      if (ps.length === 1 && ps[0].name === 'Invitado') { ps[0].name = nm; store.set('mz_profiles', ps); }
    }
    say('¡Listo! Ahora elige tu perfil…');
    setTimeout(function () { location.href = pageHref('perfil.html'); }, 800);
  }

  // ---------- Pantalla de acceso ----------
  function renderLoggedOut() {
    var c = COPY[mode];
    var fields = '';
    if (mode === 'login') {
      fields =
        field({ id: 'acEmail', label: 'Correo electrónico', type: 'email', icon: 'mail', auto: 'email', ph: 'nombre@correo.com', extra: 'inputmode="email" autocapitalize="off" spellcheck="false"' }) +
        field({ id: 'acPass', label: 'Contraseña', type: 'password', icon: 'lock', auto: 'current-password', ph: 'Tu contraseña' });
    }
    if (mode === 'register') {
      fields =
        field({ id: 'acName', label: 'Nombre <span class="opt">(opcional)</span>', type: 'text', icon: 'user', auto: 'nickname', ph: 'Cómo quieres que te llamemos', extra: 'maxlength="16"' }) +
        field({ id: 'acEmail', label: 'Correo electrónico', type: 'email', icon: 'mail', auto: 'email', ph: 'nombre@correo.com', extra: 'inputmode="email" autocapitalize="off" spellcheck="false"' }) +
        field({ id: 'acPass', label: 'Contraseña', type: 'password', icon: 'lock', auto: 'new-password', ph: 'Mínimo 8 caracteres', extra: 'minlength="8"' }) +
        '<div class="pw-meter" id="pwMeter" data-level="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p class="pw-text" id="pwText" aria-live="polite"></p>';
    }
    if (mode === 'recover') {
      fields = field({ id: 'acEmail', label: 'Correo de tu cuenta', type: 'email', icon: 'mail', auto: 'email', ph: 'nombre@correo.com', extra: 'inputmode="email" autocapitalize="off" spellcheck="false"' });
    }
    if (mode === 'reset') {
      fields = field({ id: 'acPass', label: 'Nueva contraseña', type: 'password', icon: 'lock', auto: 'new-password', ph: 'Mínimo 8 caracteres', extra: 'minlength="8"' }) +
        '<div class="pw-meter" id="pwMeter" data-level="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p class="pw-text" id="pwText" aria-live="polite"></p>';
    }
    var tabs = mode === 'login' || mode === 'register'
      ? '<div class="auth-tabs" role="tablist" aria-label="Acceso"><button type="button" role="tab" data-mode="login" aria-selected="' + (mode === 'login') + '">Iniciar sesión</button><button type="button" role="tab" data-mode="register" aria-selected="' + (mode === 'register') + '">Crear cuenta</button></div>'
      : '';
    var foot =
      mode === 'login' ? '<p class="auth-links"><a href="#" data-mode="recover">¿Olvidaste tu contraseña?</a></p>'
      : mode === 'register' ? '<p class="auth-links">¿Ya tienes cuenta? <a href="#" data-mode="login">Inicia sesión</a></p>'
      : mode === 'recover' ? '<p class="auth-links"><a href="#" data-mode="login">← Volver a iniciar sesión</a></p>'
      : '';
    frame(
      '<div class="auth-logo-m"><span class="ab-mark">' + ICON.logo + '</span><span>MovieZone</span></div>' +
      tabs +
      '<h1 id="authTitle">' + c.title + '</h1><p class="auth-sub">' + c.sub + '</p>' +
      (mode === 'login' || mode === 'register' ? googleButton() : '') +
      '<div class="ac-form">' + fields +
      '<button type="button" class="btn-primary" id="acGo"><span class="btn-spin" aria-hidden="true"></span><span class="btn-label">' + c.cta + '</span></button></div>' +
      foot +
      '<p class="auth-note">' + (mode === 'register' ? 'Al crear tu cuenta aceptas nuestra ' : 'Consulta nuestra ') + '<a href="/privacidad">política de privacidad</a>. La cuenta es opcional: sin ella tus datos se guardan solo en este navegador.</p>'
    );

    Array.prototype.forEach.call(view.querySelectorAll('[data-mode]'), function (b) {
      b.onclick = function (e) { e.preventDefault(); mode = b.getAttribute('data-mode'); renderLoggedOut(); };
    });
    var gb = document.getElementById('acGoogle');
    if (gb) gb.onclick = googleSignIn;
    Array.prototype.forEach.call(view.querySelectorAll('[data-eye]'), function (b) {
      b.onclick = function () {
        var inp = document.getElementById(b.getAttribute('data-eye'));
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        b.innerHTML = show ? ICON.eyeOff : ICON.eye;
        b.setAttribute('aria-pressed', show ? 'true' : 'false');
        b.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
      };
    });
    var em = document.getElementById('acEmail');
    if (em) {
      em.oninput = function () { setErr('acEmail', ''); };
      em.onblur = function () { if (em.value.trim() && !mzEmailValid(em.value)) setErr('acEmail', 'Escribe un correo válido, por ejemplo nombre@correo.com.'); };
    }
    var pw = document.getElementById('acPass');
    if (pw) {
      pw.oninput = function () {
        setErr('acPass', '');
        var meter = document.getElementById('pwMeter');
        if (!meter) return;
        var s = mzPasswordStrength(pw.value);
        meter.setAttribute('data-level', String(s.level));
        document.getElementById('pwText').textContent = s.label ? 'Seguridad: ' + s.label : '';
      };
    }
    document.getElementById('acGo').onclick = submit;
    Array.prototype.forEach.call(view.querySelectorAll('input'), function (i) {
      i.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    });
  }

  function busy(on) {
    var go = document.getElementById('acGo');
    if (!go) return;
    go.disabled = !!on;
    go.classList.toggle('is-busy', !!on);
    var l = go.querySelector('.btn-label');
    if (l) l.textContent = on ? 'Un momento…' : COPY[mode].cta;
  }

  async function submit() {
    var email = ((document.getElementById('acEmail') || {}).value || '').trim();
    var pass = (document.getElementById('acPass') || {}).value || '';
    var name = ((document.getElementById('acName') || {}).value || '').trim();
    say('');
    setErr('acEmail', '');
    setErr('acPass', '');
    var first = '';
    if (mode !== 'reset' && !mzEmailValid(email)) { setErr('acEmail', 'Escribe un correo válido, por ejemplo nombre@correo.com.'); first = first || 'acEmail'; }
    if (mode === 'login' && !pass) { setErr('acPass', 'Escribe tu contraseña.'); first = first || 'acPass'; }
    if ((mode === 'register' || mode === 'reset') && pass.length < 8) { setErr('acPass', 'Usa al menos 8 caracteres.'); first = first || 'acPass'; }
    if (first) { var f = document.getElementById(first); if (f && f.focus) f.focus(); return; }
    busy(true);
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
        busy(false);
        return say('Si el correo existe, te enviamos un enlace para cambiar la contraseña. Revisa también spam.');
      } else if (mode === 'reset') {
        var r4 = await auth.updateUser({ password: pass });
        if (r4.error) throw r4.error;
        mode = 'login';
      }
      cloud.user = (await auth.getSession()).data.session?.user || null;
      if (cloud.user) await syncAndGo();
    } catch (e) {
      busy(false);
      say(friendly(e), true);
    }
  }

  // ---------- Con sesión iniciada ----------
  function renderLoggedIn() {
    var u = cloud.user;
    var md = u.user_metadata || {};
    var meta = md.display_name || md.full_name || md.name || '';
    var provs = ((u.app_metadata && u.app_metadata.providers) || []).filter(function (p) { return p === 'email' || p === 'google'; });
    frame(
      '<div class="acct-head"><div class="ac-avatar" aria-hidden="true"></div><div class="acct-id">' +
      '<h1 id="authTitle"></h1><p class="acct-mail" id="acMail"></p>' +
      '<div class="acct-badges">' + provs.map(function (p) { return '<span class="acct-badge">' + (p === 'google' ? 'Google' : 'Correo') + '</span>'; }).join('') + '</div></div></div>' +
      '<div class="acct-sync"><span class="sc-dot" aria-hidden="true"></span><span id="acSync"></span></div>' +
      '<div class="acct-actions"><button type="button" class="btn-primary" id="acSyncNow"><span class="btn-label">Sincronizar ahora</span></button>' +
      '<a class="btn-ghost" href="' + esc(pageHref('perfil.html')) + '">Elegir perfil</a>' +
      '<button type="button" class="btn-ghost" id="acOut">Cerrar sesión</button></div>' +
      '<details class="ac-danger"><summary>Más opciones</summary>' +
      '<div class="ac-danger-row"><div><b>Borrar mis datos de la nube</b><p>Elimina lo sincronizado. No borra tu cuenta ni los datos de este dispositivo.</p></div><button type="button" class="btn-ghost" id="acDel">Borrar datos</button></div>' +
      '<div class="ac-danger-row"><div><b>Eliminar mi cuenta</b><p>Borra tu cuenta y todo lo guardado en ella, de forma permanente. Los datos de este dispositivo no se borran.</p></div><button type="button" class="btn-ghost ac-kill" id="acKill">Eliminar cuenta</button></div></details>',
      true
    );
    document.getElementById('authTitle').textContent = meta ? 'Hola, ' + meta : 'Mi cuenta';
    document.getElementById('acMail').textContent = u.email || '';
    document.querySelector('.ac-avatar').textContent = String(meta || u.email || '?').charAt(0).toUpperCase();
    function paintSync() {
      var t = localStorage.getItem('mz_sync_at');
      var txt = 'Aún no se ha sincronizado.';
      if (t) txt = 'Sincronizado ' + (typeof mzTimeAgo === 'function' ? mzTimeAgo(t) : new Date(t).toLocaleString('es'));
      document.getElementById('acSync').textContent = txt;
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
    waiting('Cargando cuenta…');
    cloud = await mzCloudLoaded();
    if (!cloud || !cloud.configured) return renderNotConfigured();
    try { await cloud.ready; } catch (e) {
      frame('<h1 id="authTitle">No se pudo cargar</h1><p class="auth-sub">' + esc(friendly(e)) + '</p>', true);
      return;
    }
    document.addEventListener('mz:auth', function (ev) {
      if (ev.detail && ev.detail.event === 'PASSWORD_RECOVERY') { mode = 'reset'; renderLoggedOut(); }
    });
    var oauthError = typeof mzOAuthError === 'function' ? mzOAuthError(urlState) : '';
    if (oauthError) {
      history.replaceState(null, '', location.pathname);
      renderLoggedOut();
      return say(oauthError, true);
    }
    if (isRecovery) { mode = 'reset'; renderLoggedOut(); }
    else if (isOAuth && cloud.user) { waiting('Entrando con tu cuenta de Google…'); await syncAndGo(); }
    else render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
