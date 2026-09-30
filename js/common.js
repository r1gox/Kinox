const TMDB_KEY='';const API='https://api.themoviedb.org/3',IMG='https://image.tmdb.org/t/p/';
// Worker: NO declarar MZ_WORKER aquí (lo define worker.js). Solo la URL de búsqueda:
const MZ_SEARCH='https://moviezone.tvjz.workers.dev';
// Base del worker (detalle/buscador; worker.js puede sobrescribir)
var MZ_WORKER = (typeof MZ_WORKER !== 'undefined' && MZ_WORKER) || MZ_SEARCH;
var MZ_SOURCE = (typeof MZ_SOURCE !== 'undefined' && MZ_SOURCE) || '9';
const $=(s,r=document)=>r.querySelector(s),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store={get(k,d){try{const v=JSON.parse(localStorage.getItem(k));return v??d}catch{return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
let KEY=TMDB_KEY||store.get('mz_key','');let profiles=store.get('mz_profiles',[{id:'p1',name:'Invitado'}]),pid=store.get('mz_pid','p1');if(!profiles.some(p=>p.id===pid))pid=profiles[0].id;const pk=k=>`mz_${pid}_${k}`;const favs=()=>store.get(pk('favs'),[]),hist=()=>store.get(pk('hist'),[]);const cache=new Map(),ITEMS=new Map();

const LOCAL=location.protocol==='file:';
function pageHref(file,params={}){
  const prefix=LOCAL?(location.pathname.includes('/pages/')?'./':'pages/'):'/pages/';
  const u=new URL(prefix+file,location.href);
  Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,v)});
  return LOCAL?u.href:(u.pathname+u.search);
}
function appLink(path){
  const clean=String(path||'').replace(/^\//,'');
  if(clean==='')return LOCAL?(location.pathname.includes('/pages/')?'../index.html':'index.html'):'/';
  if(clean.startsWith('pelicula/'))return pageHref('detalle-pelicula.html',{id:clean.split('/')[1]});
  if(clean.startsWith('serie/'))return pageHref('detalle-serie.html',{id:clean.split('/')[1]});
  if(clean==='peliculas')return pageHref('peliculas.html');
  if(clean==='series')return pageHref('series.html');
  if(clean==='anime')return pageHref('anime.html');
  if(clean==='jk')return pageHref('jk.html');
  if(clean==='favoritos')return pageHref('favoritos.html');
  if(clean==='historial')return pageHref('historial.html');
  if(clean==='perfil')return pageHref('perfil.html');
  if(clean.startsWith('buscar')){
    const q=clean.includes('?')?new URLSearchParams(clean.split('?')[1]).get('q'):'';
    return pageHref('buscar.html',q?{q}:{});
  }
  if(clean.startsWith('trailer')){
    const p=new URLSearchParams(clean.split('?')[1]||'');
    return pageHref('trailer.html',{type:p.get('type'),id:p.get('id')});
  }
  if(clean.startsWith('reproductor')){
    const p=new URLSearchParams(clean.split('?')[1]||'');
    return pageHref('reproductor.html',{type:p.get('type'),id:p.get('id'),season:p.get('season'),episode:p.get('episode'),slug:p.get('slug')});
  }
  return LOCAL?path:('/'+clean);
}
function go(path){location.href=appLink(path)}

function norm(x,type){type=type||x.media_type||(x.title?'movie':'tv');const it={id:x.id,type,title:x.title||x.name,poster:x.poster_path,backdrop:x.backdrop_path,year:(x.release_date||x.first_air_date||'').slice(0,4),rating:x.vote_average||0,overview:x.overview||''};ITEMS.set(type+x.id,it);return it}
async function tmdb(path,params={}){if(!KEY)return keyPage();const u=new URL(API+path);u.searchParams.set('api_key',KEY);u.searchParams.set('language','es-MX');for(const k in params)if(params[k]!==''&&params[k]!=null)u.searchParams.set(k,params[k]);const key=u.toString();if(cache.has(key))return cache.get(key);const r=await fetch(key);if(r.status===401){store.set('mz_key','');KEY='';throw Error('API key inválida')}if(!r.ok)throw Error('Error '+r.status);const j=await r.json();cache.set(key,j);return j}
function slugify(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' y ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}
function detailLink(it){return appLink(`/${it.type==='movie'?'pelicula':'serie'}/${it.id}`)}
function card(it){return `<a class="card" href="${detailLink(it)}"><div class="im">${it.poster?`<img loading="lazy" src="${IMG}w342${it.poster}" alt="">`:''}</div>${it.rating?`<span class="badge">★ ${it.rating.toFixed(1)}</span>`:''}<b>${esc(it.title)}</b><small>${it.year||''}</small></a>`}

/** Ventanita modal con tráiler de YouTube */
function openTrailerModal(youtubeKey) {
  if (!youtubeKey) return;
  var key = String(youtubeKey).trim();
  var m = key.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{6,})/);
  if (m) key = m[1];
  key = key.replace(/[^A-Za-z0-9_-]/g, '');
  if (!key) return;

  var old = document.getElementById('kx-trailer-modal');
  if (old) old.remove();

  var overlay = document.createElement('div');
  overlay.id = 'kx-trailer-modal';
  overlay.className = 'kx-trailer-modal';
  overlay.innerHTML =
    '<div class="kx-trailer-dialog" role="dialog" aria-modal="true" aria-label="Tráiler">' +
    '<button type="button" class="kx-trailer-close" aria-label="Cerrar">&times;</button>' +
    '<div class="kx-trailer-frame">' +
    '<iframe src="https://www.youtube.com/embed/' + key + '?autoplay=1&rel=0" ' +
    'allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>' +
    '</div>' +
    '<a class="kx-trailer-yt" href="https://www.youtube.com/watch?v=' + key + '" target="_blank" rel="noopener">Abrir en YouTube</a>' +
    '</div>';
  document.body.appendChild(overlay);
  document.body.classList.add('kx-trailer-open');

  function close() {
    try {
      var iframe = overlay.querySelector('iframe');
      if (iframe) iframe.src = 'about:blank';
    } catch (_) {}
    overlay.remove();
    document.body.classList.remove('kx-trailer-open');
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.kx-trailer-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
}

function cleanAnimeTitle(title) {
  return String(title || '')
    .replace(/\s*[\[\(].*?[\]\)]\s*/g, ' ')
    .replace(/\s*(TV|OVA|ONA|Special|Season\s*\d+|\d+(st|nd|rd|th)\s*Season)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveTmdbIdForTitle(title, type, year, opts) {
  if (!KEY || !title) return null;
  opts = opts || {};
  try {
    const path = type === 'tv' || type === 'anime' ? '/search/tv' : '/search/movie';
    const queries = [];
    const t0 = String(title).trim();
    const t1 = cleanAnimeTitle(t0);
    if (t0) queries.push(t0);
    if (t1 && t1 !== t0) queries.push(t1);
    if (opts.original) queries.push(String(opts.original).trim());
    if (opts.english) queries.push(String(opts.english).trim());
    // únicos
    const seen = {};
    const listQ = queries.filter(function (q) {
      const k = q.toLowerCase();
      if (!q || seen[k]) return false;
      seen[k] = 1;
      return true;
    });

    let best = null;
    for (let qi = 0; qi < listQ.length; qi++) {
      const params = { query: listQ[qi] };
      if (year) {
        if (type === 'tv' || type === 'anime') params.first_air_date_year = year;
        else params.year = year;
      }
      const r = await tmdb(path, params);
      const results = (r && r.results) || [];
      if (!results.length) continue;
      const y = year ? String(year).slice(0, 4) : '';
      let hit = null;
      if (y) {
        hit = results.find(function (x) {
          const d = (x.first_air_date || x.release_date || '').slice(0, 4);
          return d === y;
        });
      }
      // prefer exact name match (ignore case)
      if (!hit) {
        const qn = listQ[qi].toLowerCase();
        hit = results.find(function (x) {
          const n = String(x.name || x.title || '').toLowerCase();
          const o = String(x.original_name || x.original_title || '').toLowerCase();
          return n === qn || o === qn;
        });
      }
      if (!hit) hit = results[0];
      if (hit) {
        best = hit.id;
        break;
      }
    }
    return best;
  } catch (_) {
    return null;
  }
}

/** Preferir fuente animeav1 (4) en resultados del worker */
function preferAnimeSource(results) {
  if (!Array.isArray(results)) return results;
  const score = function (x) {
    const sid = String(x.source_id || x.source || '').toLowerCase();
    const tipo = String(x.type || x.tipo || '').toLowerCase();
    if (sid === '4' || sid === 'animeav1') return 100;
    if (sid === '5' || sid === 'jkanime') return 80;
    if (/anime|ova|ona/.test(tipo)) return 50;
    return 0;
  };
  return results.slice().sort(function (a, b) {
    return score(b) - score(a);
  });
}

function workerCard(it){
  const tipo=String(it.type||it.tipo||'').toLowerCase();
  const isAnime=/anime|ova|ona|especial/.test(tipo);
  const isTv=/serie|tv|anime|dorama|ova|ona/.test(tipo);
  const type=isTv?'tv':'movie';
  const slug=it.slug||slugify(it.title||it.titulo||'');
  let sid=it.source_id||it.sourceId||'';
  // Animes → fuente 4 (animeav1) si el resultado ya es de ahí; no forzar 9
  if (isAnime && (!sid || sid === '9') && (it.source === 'animeav1' || it.fuente === 'animeav1')) sid = '4';
  if (isAnime && (String(it.source||'').toLowerCase()==='animeav1' || sid==='4')) sid = '4';
  const title=it.title||it.titulo||'Sin título';
  const img=it.portada||it.poster||'';
  const year=it.year||'';
  const src=it.source||it.fuente||'';
  // Preferir id TMDB (misma UI que catálogo); slug+source para el worker
  const tmdbId=it.tmdb_id||it.tmdbId||it.id||null;
  const href=isTv
    ? (tmdbId
        ? pageHref('detalle-serie.html',{id:tmdbId,slug,source_id:sid||undefined})
        : pageHref('detalle-serie.html',{slug,source_id:sid||undefined,title:title,portada:img||undefined,year:year||undefined}))
    : (tmdbId
        ? pageHref('detalle-pelicula.html',{id:tmdbId,slug,source_id:sid||undefined})
        : pageHref('detalle-pelicula.html',{slug,source_id:sid||undefined,title:title,portada:img||undefined,year:year||undefined}));
  return `<a class="card" href="${href}"><div class="im">${img?`<img loading="lazy" src="${esc(img)}" alt="">`:''}</div>${src?`<span class="badge">${esc(src)}</span>`:''}<b>${esc(title)}</b><small>${esc(year)}${isTv?' · Serie':' · Película'}</small></a>`;
}
function rowHtml(t,items){return items?.length?`<section class="row"><h2>${esc(t)}</h2><div class="track">${items.map(card).join('')}</div></section>`:''}
function list(res,type){return (res.results||[]).filter(x=>x.poster_path&&x.media_type!=='person').map(x=>norm(x,type))}
function nav(){
  $('#top').innerHTML=`<a class="logo" href="${appLink('/')}" >Movie<span>Zone</span></a><nav><a data-section="inicio" href="${appLink('/')}" >Inicio</a><a data-section="peliculas" href="${appLink('/peliculas')}">Películas</a><a data-section="series" href="${appLink('/series')}">Series</a><a data-section="anime" href="${appLink('/anime')}">Anime</a><a data-section="jk" href="${appLink('/jk')}">JK</a><a data-section="favoritos" href="${appLink('/favoritos')}">Favoritos</a><a data-section="historial" href="${appLink('/historial')}">Historial</a></nav><form id="sf"><input id="q" type="search" placeholder="Buscar…" aria-label="Buscar"></form><a id="prof" href="${appLink('/perfil')}" aria-label="Perfil">${esc((profiles.find(p=>p.id===pid)||profiles[0]).name[0].toUpperCase())}</a>`;
  const path=location.pathname.toLowerCase();
  let active='';
  if(path.includes('peliculas')||path.includes('detalle-pelicula')) active='peliculas';
  else if(path.includes('series')||path.includes('detalle-serie')) active='series';
  else if(path.includes('anime')) active='anime';
  else if(path.includes('/jk')||path.includes('jk.html')) active='jk';
  else if(path.includes('favoritos')) active='favoritos';
  else if(path.includes('historial')) active='historial';
  else if(path.includes('perfil')||path.includes('buscar')||path.includes('trailer')||path.includes('reproductor')) active='';
  else active='inicio';
  const current=document.querySelector(`nav a[data-section="${active}"]`);
  if(current) current.classList.add('on');
  $('#sf').onsubmit=e=>{e.preventDefault();const q=$('#q').value.trim();if(q)location.href=pageHref('buscar.html',{q})};
  window.addEventListener('scroll',()=>$('#top').classList.toggle('solid',scrollY>30),{passive:true})
}
function keyPage(){const v=$('#view');v.innerHTML=`<section class="page" style="max-width:520px;margin:auto"><h1>Conecta TMDB</h1><p style="color:var(--mute);line-height:1.6;margin-bottom:16px">Necesitas una API key v3 de <a style="color:var(--ac)" href="https://www.themoviedb.org/settings/api" target="_blank">themoviedb.org/settings/api</a>. Se guarda solo en este navegador.</p><form id="kf" style="display:flex;gap:8px"><input id="kv" style="flex:1;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:11px" placeholder="API key v3"><button class="btn">Guardar</button></form></section>`;$('#kf').onsubmit=e=>{e.preventDefault();const v=$('#kv').value.trim();if(v){KEY=v;store.set('mz_key',v);location.reload()}}}
n
/* Mobile UI (solo ≤900px; no altera PC) */
(function loadMobileUi(){
  if (document.getElementById('mz-mobile-ui-js')) return;
  var s = document.createElement('script');
  s.id = 'mz-mobile-ui-js';
  s.defer = true;
  try {
    var scripts = document.getElementsByTagName('script');
    var base = 'js/mobile-ui.js';
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      if (/common\.js/i.test(src)) {
        base = src.replace(/common\.js(\?.*)?$/i, 'mobile-ui.js');
        break;
      }
    }
    s.src = base;
  } catch (_) {
    s.src = (location.pathname.indexOf('/pages/') !== -1) ? '../js/mobile-ui.js' : 'js/mobile-ui.js';
  }
  document.head.appendChild(s);
})();

nav();
