/* Sincronización con Supabase (cuenta opcional).
   Se carga sola desde common.js. Si config.js no está rellenado, no hace nada.
   La librería solo se descarga si hay sesión guardada o si estás en la página de cuenta. */
function mzCloudConfigured(cfg) {
  return !!(
    cfg &&
    typeof cfg.url === 'string' &&
    /^https:\/\/[A-Za-z0-9.-]+$/.test(cfg.url.replace(/\/$/, '')) &&
    !/TU-PROYECTO/i.test(cfg.url) &&
    typeof cfg.anonKey === 'string' &&
    cfg.anonKey.length > 40 &&
    !/^TU_/.test(cfg.anonKey)
  );
}

(function () {
  var base = (document.currentScript && document.currentScript.src) || '';
  var api = (window.mzCloud = { configured: false, client: null, user: null, ready: Promise.resolve(null) });
  var noop = function () {};
  api.schedulePush = noop;
  api.pull = api.push = function () { return Promise.resolve('disabled'); };

  function loadScript(src) {
    return new Promise(function (res) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { res(true); };
      s.onerror = function () { res(false); };
      document.head.appendChild(s);
    });
  }
  function hasStoredSession() {
    try {
      for (var i = 0; i < localStorage.length; i++) if (/^sb-.+-auth-token$/.test(localStorage.key(i))) return true;
    } catch (e) {}
    return false;
  }
  function emit(name, detail) {
    try { document.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) { /* sin DOM */ }
  }
  function localHasData() {
    try {
      var b = mzBackupBuild(localStorage).data;
      return Object.keys(b).some(function (k) {
        if (/_(favs|hist|seen|last)$/.test(k)) { try { var v = JSON.parse(b[k]); return Array.isArray(v) ? v.length > 0 : Object.keys(v || {}).length > 0; } catch (e) { return false; } }
        if (k === 'mz_profiles') { try { return JSON.parse(b[k]).length > 1; } catch (e) { return false; } }
        return false;
      });
    } catch (e) { return false; }
  }

  async function boot() {
    if (!base) return;
    var dir = base.replace(/[^/]*(\?.*)?$/, '');
    await loadScript(dir + 'config.js'); // si no existe, se ignora
    var cfg = window.MZ_SUPABASE;
    if (!mzCloudConfigured(cfg)) return;
    api.configured = true;

    var onAccountPage = /cuenta/i.test(location.pathname);
    var timer = null;
    api.schedulePush = function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        api.ready.then(function () { return api.user ? api.push() : null; }).catch(function (e) { console.warn('sync', e); });
      }, 2000);
    };
    if (!onAccountPage && !hasStoredSession()) return;

    api.ready = (async function () {
      if (!(await loadScript(dir + 'vendor/supabase.js')) || !window.supabase) throw new Error('No se pudo cargar la librería de cuenta.');
      api.client = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      var s = (await api.client.auth.getSession()).data.session;
      api.user = s ? s.user : null;
      // No hacer llamadas a Supabase dentro del callback (puede bloquearse): se difiere.
      api.client.auth.onAuthStateChange(function (ev, sess) {
        api.user = sess ? sess.user : null;
        setTimeout(function () { emit('mz:auth', { event: ev, user: api.user }); }, 0);
      });
      return api.client;
    })();

    api.push = async function () {
      if (!api.user) return 'anon';
      var snap = mzBackupBuild(localStorage).data;
      delete snap.mz_pid; // el perfil activo es propio de cada dispositivo
      var r = await api.client.from('user_data').upsert({ user_id: api.user.id, data: snap }, { onConflict: 'user_id' }).select('updated_at').single();
      if (r.error) throw r.error;
      localStorage.setItem('mz_sync_at', r.data.updated_at);
      emit('mz:cloud-synced', { at: r.data.updated_at });
      return 'pushed';
    };

    // Trae los datos de la nube. opts.reload=false evita recargar la página al aplicar cambios.
    api.pull = async function (opts) {
      opts = opts || {};
      if (!api.user) return 'anon';
      var r = await api.client.from('user_data').select('data,updated_at').eq('user_id', api.user.id).maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) return api.push();
      var localAt = localStorage.getItem('mz_sync_at');
      if (localAt && Date.parse(r.data.updated_at) <= Date.parse(localAt)) return 'uptodate';
      var incoming = r.data.data || {};
      var merged = false;
      if (!localAt && localHasData()) {
        // Primera sincronización de un dispositivo que ya tenía datos: se combinan, sin preguntar.
        incoming = mzMergeData(mzBackupBuild(localStorage).data, incoming);
        merged = true;
      }
      var parsed = mzBackupParse(JSON.stringify({ app: 'moviezone', data: incoming }));
      if (!parsed.ok) {
        if (/vac/i.test(parsed.error)) return api.push();
        throw new Error(parsed.error);
      }
      // La nube manda (o el resultado combinado): se reemplazan las claves propias y se quitan las que ya no existen.
      try {
        var cur = mzBackupBuild(localStorage).data;
        Object.keys(cur).forEach(function (k) { if (k !== 'mz_pid' && !(k in parsed.data)) localStorage.removeItem(k); });
      } catch (e) {}
      Object.keys(parsed.data).forEach(function (k) { if (k !== 'mz_pid') localStorage.setItem(k, parsed.data[k]); });
      if (merged) await api.push(); // sube el resultado combinado
      else localStorage.setItem('mz_sync_at', r.data.updated_at);
      emit('mz:cloud-synced', { at: localStorage.getItem('mz_sync_at') });
      if (opts.reload !== false && !onAccountPage) setTimeout(function () { location.reload(); }, 50);
      return merged ? 'merged' : 'pulled';
    };

    api.ready.then(function () { return api.user ? api.pull() : null; }).catch(function (e) { console.warn('cuenta', e); });
    // Al volver a la pestaña (máx. cada 2 min) se revisa si hay cambios hechos en otro dispositivo.
    var lastPull = Date.now();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible' || !api.user || Date.now() - lastPull < 120000) return;
      lastPull = Date.now();
      api.pull().catch(function () {});
    });
  }
  // Se resuelve cuando ya se sabe si hay cuenta configurada (evita mostrar "sin configurar" por error).
  api.loaded = boot()
    .catch(function (e) { console.warn('cloud', e); })
    .then(function () { emit('mz:cloud-loaded'); return api; });
})();
