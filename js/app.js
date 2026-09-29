// ====== CONFIGURACIÓN ======
// Pega aquí tu API key (v3) de TMDB, o déjala vacía y la app te la pedirá una vez.
const TMDB_KEY = '';
// ===========================
const API = 'https://api.themoviedb.org/3', IMG = 'https://image.tmdb.org/t/p/';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
};
let KEY = TMDB_KEY || store.get('mz_key', '');
const view = $('#view'), cache = new Map(), ITEMS = new Map();
let io = null, token = 0;

// ---- Perfiles y datos por perfil ----
let profiles = store.get('mz_profiles', [{ id: 'p1', name: 'Invitado' }]);
let pid = store.get('mz_pid', 'p1');
if (!profiles.find(p => p.id === pid)) pid = profiles[0].id;
const pk = k => `mz_${pid}_${k}`;
const favs = () => store.get(pk('favs'), []);
const hist = () => store.get(pk('hist'), []);
const curProfile = () => profiles.find(p => p.id === pid);
function paintProfile() { $('#prof').textContent = curProfile().name[0].toUpperCase() }

// ---- TMDB ----
async function tmdb(path, params = {}) {
  const u = new URL(API + path);
  u.searchParams.set('api_key', KEY);
  u.searchParams.set('language', 'es-MX');
  for (const k in params) if (params[k] !== '' && params[k] != null) u.searchParams.set(k, params[k]);
  const key = u.toString();
  if (cache.has(key)) return cache.get(key);
  const r = await fetch(key);
  if (r.status === 401) { store.set('mz_key', ''); KEY = ''; throw new Error('API key inválida') }
  if (!r.ok) throw new Error('Error ' + r.status);
  const j = await r.json(); cache.set(key, j); return j;
}
function norm(x, type) {
  type = type || x.media_type || (x.title ? 'movie' : 'tv');
  const it = {
    id: x.id, type, title: x.title || x.name,
    poster: x.poster_path, backdrop: x.backdrop_path,
    year: (x.release_date || x.first_air_date || '').slice(0, 4),
    rating: x.vote_average || 0, overview: x.overview || ''
  };
  ITEMS.set(type + x.id, it); return it;
}
const link = it => `#/${it.type === 'movie' ? 'pelicula' : 'serie'}/${it.id}`;
const qparams = () => new URLSearchParams(location.hash.split('?')[1] || '');
const card = it => `<a class="card" href="${link(it)}">
  <div class="im">${it.poster ? `<img loading="lazy" src="${IMG}w342${it.poster}" alt="">` : ''}</div>
  ${it.rating ? `<span class="badge">★ ${it.rating.toFixed(1)}</span>` : ''}
  <b>${esc(it.title)}</b><small>${it.year || ''}</small></a>`;
const rowHtml = (t, items) => items.length ? `<section class="row"><h2>${esc(t)}</h2><div class="track">${items.map(card).join('')}</div></section>` : '';
const list = (res, type) => res.results.filter(x => x.poster_path && x.media_type !== 'person').map(x => norm(x, type));

// ---- Router ----
const routes = [
  [/^\/$/, home],
  [/^\/(peliculas|series|anime)$/, catalog],
  [/^\/buscar$/, search],
  [/^\/favoritos$/, () => listPage('Mi lista', favs(), 'Aún no guardas nada. Abre un título y pulsa “Mi lista”.')],
  [/^\/historial$/, () => listPage('Historial', hist(), 'Todavía no has visto títulos.')],
  [/^\/(pelicula|serie)\/(\d+)$/, detail]
];
function navigate(url) { location.hash = url }
async function render() {
  const my = ++token;
  if (io) { io.disconnect(); io = null }
  const path = (location.hash.slice(1).split('?')[0].replace(/\/+$/, '')) || '/';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + path));
  window.scrollTo(0, 0);
  if (!KEY) return keyPage();
  view.innerHTML = '<div class="load">Cargando…</div>';
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (!m) continue;
    try { const html = await fn(m); if (my === token && html) view.innerHTML = html; if (my === token && fn.after) fn.after() }
    catch (e) {
      if (my !== token) return;
      view.innerHTML = `<div class="load">${esc(e.message)}<br><br><button class="btn" onclick="render()">Reintentar</button></div>`;
      if (!KEY) setTimeout(render, 1500);
    }
    return;
  }
  view.innerHTML = '<div class="empty">Página no encontrada.<br><br><a class="btn" href="#/">Ir al inicio</a></div>';
}
window.addEventListener('hashchange', render);
window.addEventListener('scroll', () => $('#top').classList.toggle('solid', scrollY > 30));

// ---- Páginas ----
function keyPage() {
  view.innerHTML = `<div class="page" style="max-width:520px;margin:auto"><h1>Conecta TMDB</h1>
  <p style="color:var(--mute);line-height:1.6;margin-bottom:16px">Necesitas una API key gratuita (v3) de <a style="color:var(--ac)" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org/settings/api</a>. Se guarda solo en tu navegador.</p>
  <form id="kf" style="display:flex;gap:8px"><input id="kv" style="flex:1;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:11px" placeholder="API key v3" autocomplete="off"><button class="btn">Guardar</button></form></div>`;
  $('#kf').onsubmit = e => { e.preventDefault(); const v = $('#kv').value.trim(); if (v) { KEY = v; store.set('mz_key', v); render() } };
}

async function home() {
  const defs = [
    ['Películas destacadas', '/trending/movie/week', 'movie'],
    ['Series del momento', '/trending/tv/week', 'tv'],
    ['Anime recomendado', '/discover/tv', 'tv', { with_genres: 16, with_original_language: 'ja', sort_by: 'popularity.desc' }],
    ['Noche de terror', '/discover/movie', 'movie', { with_genres: 27, sort_by: 'popularity.desc' }],
    ['Para maratón', '/tv/top_rated', 'tv'],
    ['Recién añadidos', '/movie/now_playing', 'movie']
  ];
  const [hero, ...rows] = await Promise.all([tmdb('/trending/all/day'), ...defs.map(d => tmdb(d[1], d[3] || {}))]);
  const h = hero.results.filter(x => x.backdrop_path && x.media_type !== 'person').map(x => norm(x))[0];
  const last = hist()[0];
  let extra = '';
  if (last) {
    const rec = await tmdb(`/${last.type}/${last.id}/recommendations`).catch(() => null);
    if (rec) extra = rowHtml('Porque viste ' + last.title, list(rec, last.type));
  }
  return `<section class="hero" style="background-image:url(${IMG}original${h.backdrop})"><div>
    <small>RECOMENDADO HOY</small><h1>${esc(h.title)}</h1>
    <div class="meta">${h.year} · <span class="r">★ ${h.rating.toFixed(1)}</span></div>
    <p>${esc(h.overview)}</p>
    <button class="btn" data-act="trailer" data-type="${h.type}" data-id="${h.id}">Ver tráiler</button>
    <a class="btn alt" href="${link(h)}">Más información</a></div></section>
    ${rowHtml('Continuar viendo', hist().slice(0, 15))}${rowHtml('Mi lista', favs())}${extra}
    ${defs.map((d, i) => rowHtml(d[0], list(rows[i], d[2]))).join('')}`;
}

async function catalog(m) {
  const kind = m[1], type = kind === 'peliculas' ? 'movie' : 'tv';
  const names = { peliculas: 'Películas', series: 'Series', anime: 'Anime' };
  const q = qparams();
  const genres = (await tmdb(`/genre/${type}/list`)).genres;
  const yrs = []; for (let y = new Date().getFullYear(); y >= 1980; y--) yrs.push(y);
  const opt = (v, t, s) => `<option value="${v}"${String(s) === String(v) ? ' selected' : ''}>${t}</option>`;
  catalog.after = () => {
    const f = $('.filters');
    f.onchange = () => {
      const p = new URLSearchParams();
      f.querySelectorAll('select').forEach(s => s.value && p.set(s.name, s.value));
      navigate(`/${kind}${p.toString() ? '?' + p : ''}`);
    };
    let page = 0, busy = false, done = false;
    const today = new Date().toISOString().slice(0, 10);
    const sort = { pop: 'popularity.desc', rating: 'vote_average.desc', new: type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc' }[q.get('orden') || 'pop'];
    const next = async () => {
      if (busy || done) return; busy = true; page++;
      const params = { page, sort_by: sort, with_genres: [kind === 'anime' ? 16 : '', q.get('genero')].filter(Boolean).join(','), 'vote_count.gte': q.get('orden') === 'rating' ? 300 : '' };
      if (kind === 'anime') params.with_original_language = 'ja';
      if (q.get('anio')) params[type === 'movie' ? 'primary_release_year' : 'first_air_date_year'] = q.get('anio');
      if (q.get('orden') === 'new') params[type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte'] = today;
      try {
        const r = await tmdb(`/discover/${type}`, params);
        $('#grid').insertAdjacentHTML('beforeend', list(r, type).map(card).join(''));
        done = page >= Math.min(r.total_pages, 500);
        $('#sent').textContent = done ? (page === 1 && !r.results.length ? 'Sin resultados. Prueba quitar filtros.' : '') : 'Cargando más…';
      } catch (e) { $('#sent').textContent = e.message }
      busy = false;
      if (done && io) io.disconnect();
    };
    io = new IntersectionObserver(es => es[0].isIntersecting && next(), { rootMargin: '600px' });
    io.observe($('#sent')); next();
  };
  return `<section class="page"><h1>${names[kind]}</h1>
  <div class="filters">
    <select name="genero" aria-label="Género">${opt('', 'Todos los géneros', q.get('genero'))}${genres.filter(g => !(kind === 'anime' && g.id === 16)).map(g => opt(g.id, esc(g.name), q.get('genero'))).join('')}</select>
    <select name="anio" aria-label="Año">${opt('', 'Cualquier año', q.get('anio'))}${yrs.map(y => opt(y, y, q.get('anio'))).join('')}</select>
    <select name="orden" aria-label="Ordenar">${opt('pop', 'Más populares', q.get('orden') || 'pop')}${opt('rating', 'Mejor calificación', q.get('orden'))}${opt('new', 'Más reciente', q.get('orden'))}</select>
  </div><div class="grid" id="grid"></div><div class="load" id="sent" style="padding:30px"></div></section>`;
}

async function search() {
  const q = qparams().get('q') || '';
  $('#q').value = q;
  if (!q) return '<section class="page"><h1>Buscar</h1><div class="empty">Escribe un título en el buscador.</div></section>';
  const r = await tmdb('/search/multi', { query: q });
  const items = list(r);
  return `<section class="page"><h1>Resultados para “${esc(q)}”</h1>${items.length ? `<div class="grid">${items.map(card).join('')}</div>` : '<div class="empty">No se encontraron resultados. Prueba otro término.</div>'}</section>`;
}

function listPage(title, items, emptyMsg) {
  return `<section class="page"><h1>${title}</h1>${items.length ? `<div class="grid">${items.map(card).join('')}</div>` : `<div class="empty">${emptyMsg}</div>`}</section>`;
}

async function detail(m) {
  const type = m[1] === 'pelicula' ? 'movie' : 'tv', id = m[2];
  const x = await tmdb(`/${type}/${id}`, { append_to_response: 'videos,watch/providers,recommendations' });
  const it = norm(x, type);
  document.title = it.title + ' — MovieZone';
  store.set(pk('hist'), [it, ...hist().filter(h => !(h.id === it.id && h.type === type))].slice(0, 40));
  const mx = x['watch/providers']?.results?.MX || {};
  const provs = [...(mx.flatrate || []), ...(mx.rent || []), ...(mx.buy || [])].filter((p, i, a) => a.findIndex(q => q.provider_id === p.provider_id) === i);
  const run = type === 'movie' ? (x.runtime ? x.runtime + ' min' : '') : (x.number_of_seasons ? x.number_of_seasons + ' temporadas' : '');
  const seasons = (x.seasons || []).filter(s => s.season_number > 0);
  const hasTrailer = (x.videos?.results || []).some(v => v.site === 'YouTube');
  detail.after = () => {
    const sel = $('#sel'); if (!sel) return;
    const go = async () => {
      $('#eps').innerHTML = '<div class="load" style="padding:30px">Cargando…</div>';
      const s = await tmdb(`/tv/${id}/season/${sel.value}`);
      $('#eps').innerHTML = (s.episodes || []).map(e => `<div class="ep">${e.still_path ? `<img loading="lazy" src="${IMG}w300${e.still_path}" alt="">` : '<div class="ph"></div>'}<div><b>${e.episode_number}. ${esc(e.name)}</b><small>${esc((e.overview || 'Sin sinopsis.').slice(0, 220))}</small></div></div>`).join('');
    };
    sel.onchange = go; go();
  };
  return `<section class="det">${x.backdrop_path ? `<div class="bd" style="background-image:url(${IMG}w1280${x.backdrop_path})"></div>` : ''}
  <div class="dw">${x.poster_path ? `<img class="pos" src="${IMG}w500${x.poster_path}" alt="Póster de ${esc(it.title)}">` : ''}
  <div class="info"><h1>${esc(it.title)}</h1>
    <div class="meta">${it.year} · <span class="r">★ ${it.rating.toFixed(1)}</span>${run ? ' · ' + run : ''}</div>
    <div class="tags">${(x.genres || []).map(g => `<span>${esc(g.name)}</span>`).join('')}</div>
    <h3>Sinopsis</h3><p>${esc(x.overview) || 'Sin sinopsis en español.'}</p>
    <div class="btns">${hasTrailer ? `<button class="btn" data-act="trailer" data-type="${type}" data-id="${id}">Ver tráiler</button>` : ''}
      <button class="btn alt ${favs().some(f => f.id === it.id && f.type === type) ? 'on' : ''}" data-act="fav" data-key="${type}${id}">${favs().some(f => f.id === it.id && f.type === type) ? '✓ En mi lista' : '+ Mi lista'}</button></div>
    <h3>Dónde verla en México</h3>
    ${provs.length ? `<div class="prov">${provs.map(p => `<img src="${IMG}w92${p.logo_path}" title="${esc(p.provider_name)}" alt="${esc(p.provider_name)}">`).join('')}</div>${mx.link ? `<p style="margin-top:10px"><a style="color:var(--ac)" href="${mx.link}" target="_blank" rel="noopener">Ver todas las opciones</a></p>` : ''}` : '<p>No hay plataformas registradas en México.</p>'}
  </div></div></section>
  ${type === 'tv' && seasons.length ? `<section class="seasons"><h2>Temporadas y capítulos</h2><select id="sel" aria-label="Temporada">${seasons.map(s => `<option value="${s.season_number}">${esc(s.name)}</option>`).join('')}</select><div id="eps"></div></section>` : ''}
  ${rowHtml('Títulos similares', list(x.recommendations, type))}`;
}

// ---- Interacciones globales ----
async function trailer(type, id) {
  const d = $('#dlg'); d.innerHTML = '<div class="load" style="padding:40px">Cargando…</div>'; d.showModal();
  const v = await tmdb(`/${type}/${id}/videos`);
  const t = v.results.find(x => x.site === 'YouTube' && x.type === 'Trailer') || v.results.find(x => x.site === 'YouTube')
    || (await tmdb(`/${type}/${id}/videos`, { language: 'en-US' })).results.find(x => x.site === 'YouTube');
  d.innerHTML = `<button class="x" aria-label="Cerrar" onclick="this.closest('dialog').close()">✕</button><h2>Tráiler</h2>` +
    (t ? `<iframe src="https://www.youtube.com/embed/${t.key}?autoplay=1" allow="autoplay;encrypted-media;fullscreen" allowfullscreen></iframe><p style="margin-top:12px;color:var(--mute)">¿No carga? <a style="color:var(--ac)" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${t.key}">Ábrelo en YouTube</a></p>` : '<p>No hay tráiler disponible.</p>');
  d.onclose = () => d.innerHTML = '';
}
function profilesDialog() {
  const d = $('#dlg');
  d.innerHTML = `<button class="x" aria-label="Cerrar" onclick="this.closest('dialog').close()">✕</button><h2>¿Quién eres?</h2>
  <div class="pl">${profiles.map(p => `<button class="${p.id === pid ? 'cur' : ''}" data-act="pick" data-id="${p.id}">${esc(p.name)}${profiles.length > 1 ? `<i data-act="del" data-id="${p.id}" title="Eliminar">✕</i>` : ''}</button>`).join('')}</div>
  <form id="pf"><input id="pn" maxlength="16" placeholder="Nombre del nuevo perfil" required><button class="btn">Crear perfil</button></form>`;
  $('#pf').onsubmit = e => {
    e.preventDefault();
    const id = 'p' + Date.now(); profiles.push({ id, name: $('#pn').value.trim() });
    store.set('mz_profiles', profiles); switchProfile(id);
  };
  d.showModal();
}
function switchProfile(id) { pid = id; store.set('mz_pid', id); paintProfile(); $('#dlg').close(); render() }

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'trailer') trailer(b.dataset.type, b.dataset.id);
  if (act === 'fav') {
    const it = ITEMS.get(b.dataset.key); let f = favs();
    const has = f.some(v => v.id === it.id && v.type === it.type);
    f = has ? f.filter(v => !(v.id === it.id && v.type === it.type)) : [it, ...f];
    store.set(pk('favs'), f);
    b.classList.toggle('on', !has); b.textContent = has ? '+ Mi lista' : '✓ En mi lista';
  }
  if (act === 'pick') switchProfile(b.dataset.id);
  if (act === 'del') {
    e.stopPropagation();
    profiles = profiles.filter(p => p.id !== b.dataset.id); store.set('mz_profiles', profiles);
    if (pid === b.dataset.id) switchProfile(profiles[0].id); else profilesDialog();
  }
});
$('#sf').onsubmit = e => { e.preventDefault(); const q = $('#q').value.trim(); if (q) navigate('/buscar?q=' + encodeURIComponent(q)) };
$('#prof').onclick = profilesDialog;
paintProfile(); render();
