/* Perfiles estilo "¿Quién está viendo?": elegir, crear, editar (nombre, avatar, foto) y eliminar. */
(function () {
  var MAX_PROFILES = 5;
  var view = document.getElementById('view');
  var manage = false;      // modo "Administrar perfiles"
  var draft = null;        // perfil que se está creando/editando

  function load() {
    var raw = store.get('mz_profiles', [{ id: 'p1', name: 'Invitado' }]);
    var list = (Array.isArray(raw) ? raw : []).map(mzProfileClean).filter(Boolean);
    return list.length ? list : [{ id: 'p1', name: 'Invitado', avatar: '', photo: '' }];
  }
  function save(list) {
    store.set('mz_profiles', list);
    profiles = list; // lo usa el encabezado
    var cur = store.get('mz_pid', 'p1');
    if (!list.some(function (p) { return p.id === cur; })) store.set('mz_pid', list[0].id);
    var prof = document.getElementById('prof');
    var active = list.find(function (p) { return p.id === store.get('mz_pid', 'p1'); }) || list[0];
    if (prof) prof.innerHTML = mzAvatarHtml(active);
  }

  /* ---------------- Elegir perfil ---------------- */
  function renderPick() {
    var list = load(), cur = store.get('mz_pid', 'p1');
    var tiles = list.map(function (p) {
      return (
        '<button type="button" class="who-tile' + (p.id === cur && !manage ? ' cur' : '') + '" data-id="' + esc(p.id) + '" aria-label="' +
        esc((manage ? 'Editar perfil de ' : 'Entrar como ') + p.name) + '">' +
        mzAvatarHtml(p, 'lg') + (manage ? '<span class="who-edit" aria-hidden="true">✎</span>' : '') +
        '<span class="who-name">' + esc(p.name) + '</span></button>'
      );
    });
    if (list.length < MAX_PROFILES) {
      tiles.push('<button type="button" class="who-tile add" data-add aria-label="Agregar perfil"><span class="av lg add-av" aria-hidden="true">+</span><span class="who-name">Agregar perfil</span></button>');
    }
    view.innerHTML =
      '<section class="who"><h1>' + (manage ? 'Administrar perfiles' : '¿Quién está viendo?') + '</h1>' +
      '<div class="who-grid">' + tiles.join('') + '</div>' +
      '<button type="button" class="who-manage" id="whoManage">' + (manage ? 'Listo' : 'Administrar perfiles') + '</button></section>';

    Array.prototype.forEach.call(view.querySelectorAll('.who-tile[data-id]'), function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-id');
        if (manage) return openEditor(list.find(function (p) { return p.id === id; }));
        store.set('mz_pid', id);
        location.href = appLink('/');
      };
    });
    var add = view.querySelector('[data-add]');
    if (add) add.onclick = function () { openEditor(null); };
    document.getElementById('whoManage').onclick = function () { manage = !manage; renderPick(); };
  }

  /* ---------------- Crear / editar ---------------- */
  function openEditor(p) {
    var list = load();
    var used = list.map(function (x) { return x.avatar; });
    var free = mzAvatars().filter(function (a) { return used.indexOf(a.id) === -1; });
    var pick = (free[0] || mzAvatars()[0]).id;
    draft = p
      ? { id: p.id, name: p.name, avatar: p.avatar, photo: p.photo, isNew: false }
      : { id: 'p' + Date.now(), name: '', avatar: pick, photo: '', isNew: true };
    renderEditor();
  }

  function paintEditor() {
    document.getElementById('edPreview').innerHTML = mzAvatarHtml({ name: draft.name || '?', avatar: draft.avatar, photo: draft.photo }, 'xl');
    Array.prototype.forEach.call(document.querySelectorAll('.av-pick'), function (b) {
      var on = !draft.photo && b.getAttribute('data-av') === draft.avatar;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.classList.toggle('on', on);
    });
    document.getElementById('edNoPhoto').hidden = !draft.photo;
  }

  function renderEditor() {
    var list = load();
    view.innerHTML =
      '<section class="who edit"><h1>' + (draft.isNew ? 'Agregar perfil' : 'Editar perfil') + '</h1>' +
      '<div class="ed-top"><div id="edPreview"></div><div class="ed-fields">' +
      '<label for="edName">Nombre</label><input id="edName" maxlength="16" autocomplete="off" placeholder="Nombre del perfil">' +
      '<div class="ed-photo"><label class="btn alt" for="edFile" tabindex="0" id="edFileLbl">📷 Subir foto</label>' +
      '<input type="file" id="edFile" accept="image/jpeg,image/png,image/webp" hidden>' +
      '<button type="button" class="ed-link" id="edNoPhoto" hidden>Quitar foto</button></div>' +
      '<p class="ed-hint">Tu foto se guarda reducida y solo en tu cuenta o navegador.</p></div></div>' +
      '<h2>O elige un avatar</h2><div class="ed-avatars" role="radiogroup" aria-label="Avatares">' +
      mzAvatars().map(function (a) {
        return '<button type="button" role="radio" class="av-pick" data-av="' + a.id + '" aria-label="Avatar ' + a.id + '">' + mzAvatarHtml({ avatar: a.id }, 'sm') + '</button>';
      }).join('') + '</div>' +
      '<div class="ed-actions"><button type="button" class="btn" id="edSave">Guardar</button>' +
      '<button type="button" class="btn alt" id="edCancel">Cancelar</button>' +
      (!draft.isNew && list.length > 1 ? '<button type="button" class="ed-del" id="edDel">Eliminar perfil</button>' : '') + '</div>' +
      '<p id="edMsg" class="ed-msg" role="status" aria-live="polite"></p></section>';

    var name = document.getElementById('edName');
    name.value = draft.name;
    name.oninput = function () { draft.name = name.value; paintEditor(); };
    name.onkeydown = function (e) { if (e.key === 'Enter') doSave(); };
    Array.prototype.forEach.call(document.querySelectorAll('.av-pick'), function (b) {
      b.onclick = function () { draft.avatar = b.getAttribute('data-av'); draft.photo = ''; paintEditor(); };
    });
    var file = document.getElementById('edFile');
    document.getElementById('edFileLbl').onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
    file.onchange = async function () {
      var f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      try { draft.photo = await resizePhoto(f); paintEditor(); say(''); }
      catch (e) { say(e.message || 'No se pudo usar esa imagen.', true); }
    };
    document.getElementById('edNoPhoto').onclick = function () { draft.photo = ''; paintEditor(); };
    document.getElementById('edSave').onclick = doSave;
    document.getElementById('edCancel').onclick = function () { draft = null; renderPick(); };
    var del = document.getElementById('edDel');
    if (del) del.onclick = doDelete;
    paintEditor();
    name.focus();
  }

  function say(t, bad) {
    var m = document.getElementById('edMsg');
    if (m) { m.textContent = t || ''; m.className = 'ed-msg' + (bad ? ' bad' : ''); }
  }

  function doSave() {
    var name = (draft.name || '').trim();
    if (!name) { say('Escribe un nombre para el perfil.', true); return document.getElementById('edName').focus(); }
    var list = load();
    var clean = mzProfileClean({ id: draft.id, name: name, avatar: draft.photo ? '' : draft.avatar, photo: draft.photo });
    var i = list.findIndex(function (p) { return p.id === clean.id; });
    if (i === -1) {
      if (list.length >= MAX_PROFILES) return say('Máximo ' + MAX_PROFILES + ' perfiles.', true);
      list.push(clean);
    } else list[i] = clean;
    save(list);
    draft = null;
    renderPick();
  }

  function doDelete() {
    var list = load();
    if (list.length < 2) return;
    if (!confirm('¿Eliminar el perfil "' + draft.name + '"? Se borrarán sus favoritos, historial y progreso.')) return;
    var id = draft.id, prefix = 'mz_' + id + '_';
    Object.keys(localStorage).forEach(function (k) { if (k.indexOf(prefix) === 0) localStorage.removeItem(k); });
    save(list.filter(function (p) { return p.id !== id; }));
    draft = null;
    renderPick();
  }

  /* Reduce la foto a un cuadrado de 192 px (JPEG) para que pese pocos KB. */
  function resizePhoto(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Usa una imagen JPG, PNG o WebP.'));
      if (file.size > 10 * 1024 * 1024) return reject(new Error('La imagen es demasiado grande (máx. 10 MB).'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
      img.onload = function () {
        URL.revokeObjectURL(url);
        var out = '';
        [[192, 0.85], [160, 0.7], [128, 0.6]].some(function (cfg) {
          var c = document.createElement('canvas'), n = cfg[0];
          c.width = c.height = n;
          var side = Math.min(img.width, img.height);
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, n, n);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, n, n);
          out = c.toDataURL('image/jpeg', cfg[1]);
          return mzSafePhoto(out) !== '';
        });
        if (!mzSafePhoto(out)) return reject(new Error('No se pudo reducir la imagen lo suficiente.'));
        resolve(out);
      };
      img.src = url;
    });
  }

  renderPick();
})();
