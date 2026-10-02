const TMDB_KEY='';const API='https://api.themoviedb.org/3',IMG='https://image.tmdb.org/t/p/';
// Worker: NO declarar MZ_WORKER aquí (lo define worker.js). Solo la URL de búsqueda:
const MZ_SEARCH='https://moviezone.tvjz.workers.dev';
// Base del worker (detalle/buscador; worker.js puede sobrescribir)
var MZ_WORKER = (typeof MZ_WORKER !== 'undefined' && MZ_WORKER) || MZ_SEARCH;
var MZ_SOURCE = (typeof MZ_SOURCE !== 'undefined' && MZ_SOURCE) || '9';
const $=(s,r=document)=>r.querySelector(s),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store={get(k,d){try{const v=JSON.parse(localStorage.getItem(k));return v??d}catch{return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
let KEY=TMDB_KEY||store.get('mz_key','');
/** true si Vercel tiene TMDB_API_KEY y el proxy /api/tmdb responde */
let TMDB_SERVER=false;
let profiles=store.get('mz_profiles',[{id:'p1',name:'Invitado'}]),pid=store.get('mz_pid','p1');if(!profiles.some(p=>p.id===pid))pid=profiles[0].id;const pk=k=>`mz_${pid}_${k}`;const favs=()=>store.get(pk('favs'),[]),hist=()=>store.get(pk('hist'),[]);const cache=new Map(),ITEMS=new Map();

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
async function tmdbViaServer(path,params={}){
  if(LOCAL) return null;
  const u=new URL('/api/tmdb',location.origin);
  u.searchParams.set('path',path.startsWith('/')?path:'/'+path);
  u.searchParams.set('language',params.language||'es-MX');
  for(const k in params){
    if(k==='language') continue;
    if(params[k]!==''&&params[k]!=null) u.searchParams.set(k,params[k]);
  }
  const cacheKey='srv:'+u.toString();
  if(cache.has(cacheKey)) return cache.get(cacheKey);
  const r=await fetch(u.toString(),{headers:{Accept:'application/json'}});
  if(r.status===503) return null; // sin env en Vercel
  if(!r.ok) throw Error('TMDB proxy '+r.status);
  const j=await r.json();
  if(j&&j.error&&!j.id&&!j.results) throw Error(j.error);
  cache.set(cacheKey,j);
  TMDB_SERVER=true;
  if(!KEY) KEY='__server__';
  return j;
}
async function tmdb(path,params={}){
  // 1) Siempre intentar proxy Vercel primero
  try{
    const via=await tmdbViaServer(path,params);
    if(via) return via;
  }catch(e){
    // Si hay key local real, caer; si modo servidor, re-lanzar (no pedir key)
    if(!(KEY&&KEY!=='__server__')) throw e;
  }
  // 2) Key local en el navegador (solo si el usuario la guardó)
  if(!KEY||KEY==='__server__'){
    throw Error('Sin TMDB: el proxy /api/tmdb no respondió');
  }
  const u=new URL(API+path);
  u.searchParams.set('api_key',KEY);
  u.searchParams.set('language',params.language||'es-MX');
  for(const k in params) if(params[k]!==''&&params[k]!=null) u.searchParams.set(k,params[k]);
  const key=u.toString();
  if(cache.has(key)) return cache.get(key);
  const r=await fetch(key);
  if(r.status===401){store.set('mz_key','');KEY='';throw Error('API key inválida')}
  if(!r.ok) throw Error('Error '+r.status);
  const j=await r.json();
  cache.set(key,j);
  return j;
}
/** Comprueba si hay TMDB (servidor o local) sin bloquear la UI */
async function ensureTmdbReady(){
  if(KEY&&KEY!=='__server__') return true;
  try{
    const j=await tmdbViaServer('/configuration',{});
    if(j){ TMDB_SERVER=true; KEY='__server__'; return true; }
  }catch(_){}
  return !!(KEY&&KEY!=='__server__');
}

function slugify(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' y ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}
function detailLink(it){
  if(!it) return appLink('/');
  var sid = it.source_id != null ? it.source_id : (it.source || '');
  var slug = it.slug || '';
  // id sintético de favoritos worker: w-4-youjo-senki
  var idStr = String(it.id || '');
  if(!slug && idStr.indexOf('w-') === 0){
    var parts = idStr.split('-');
    if(parts.length >= 3){
      sid = sid || parts[1];
      slug = parts.slice(2).join('-');
    }
  }
  if(slug && (sid || idStr.indexOf('w-') === 0)){
    var tipo = String(it.type || it.tipo || '').toLowerCase();
    var isAnime = tipo === 'anime' || /ova|ona/.test(tipo) || String(sid) === '4' || String(sid) === '5';
    var isMovie = tipo === 'movie' || /peli|film/.test(tipo);
    if(isAnime) isMovie = false;
    var page = isMovie ? 'detalle-pelicula.html' : 'detalle-serie.html';
    var portada = '';
    if(it.portada && /^https?:\/\//i.test(String(it.portada))) portada = it.portada;
    else if(it.poster && /^https?:\/\//i.test(String(it.poster))) portada = it.poster;
    return pageHref(page, {
      slug: slug,
      source_id: sid || undefined,
      title: it.title || undefined,
      type: isAnime ? 'anime' : (isMovie ? 'movie' : 'tv'),
      portada: portada || undefined,
      year: it.year || undefined
    });
  }
  // TMDB numérico
  if(it.id != null && String(it.id).indexOf('w-') !== 0){
    return appLink('/' + (it.type === 'movie' ? 'pelicula' : 'serie') + '/' + it.id);
  }
  return appLink('/');
}
function tipoFromIt(it){
  var t=String(it.type||it.tipo||it.formato||'').toLowerCase();
  if(/ova/.test(t))return 'OVA';
  if(/ona/.test(t))return 'ONA';
  if(/especial|special/.test(t))return 'Especial';
  if(/anime/.test(t))return 'Anime';
  if(t==='tv'||/serie|dorama/.test(t))return 'Serie';
  if(t==='movie'||/peli|film/.test(t))return 'Película';
  return it.type==='tv'?'Serie':'Película';
}
function card(it){
  var tipo=tipoFromIt(it);
  var rating=it.rating?`<span class="badge badge-rating">★ ${Number(it.rating).toFixed(1)}</span>`:'';
  var img='';
  if(it.poster && /^https?:\/\//i.test(String(it.poster))) img=String(it.poster);
  else if(it.portada && /^https?:\/\//i.test(String(it.portada))) img=String(it.portada);
  else if(it.poster) img=(typeof IMG!=='undefined'?IMG:'https://image.tmdb.org/t/p/')+'w342'+it.poster;
  return `<a class="card" href="${detailLink(it)}"><div class="im">${img?`<img loading="lazy" src="${esc(img)}" alt="">`:''}<span class="badge badge-type">${esc(tipo)}</span>${rating}</div><b>${esc(it.title)}</b><small>${esc(tipo)}${it.year?' · '+esc(it.year):''}</small></a>`;
}

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
  if (!title) return null;
  if (!KEY) {
    try { await ensureTmdbReady(); } catch(_){}
  }
  if (!KEY) return null;
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
  const tipo=String(it.type||it.tipo||it.formato||'').toLowerCase();
  const sidRaw=String(it.source_id||it.sourceId||it.source||it.fuente||'').toLowerCase();
  // Worker manda: type Anime / source 4|5 → SIEMPRE anime (aunque TMDB diga "serie")
  const isAnimeSource=sidRaw==='4'||sidRaw==='5'||sidRaw==='animeav1'||sidRaw==='jkanime';
  const isAnime=/anime|ova|ona|especial|special/.test(tipo)||isAnimeSource;
  const isMovie=/peli|movie|film/.test(tipo)&&!isAnime;
  const isTv=!isMovie&&(/serie|tv|dorama|anime|ova|ona/.test(tipo)||isAnime);
  const slug=it.slug||slugify(it.title||it.titulo||'');
  let sid=it.source_id||it.sourceId||'';
  if(isAnime){
    if(sidRaw==='5'||sidRaw==='jkanime') sid='5';
    else sid='4'; // animeav1 por defecto en animes del worker
  }
  const title=it.title||it.titulo||'Sin título';
  const img=it.portada||it.poster||'';
  const year=it.year||'';
  // TMDB id solo como extra; el catálogo/enlace prioriza worker
  const tmdbId=it.tmdb_id||it.tmdbId||null;

  let href;
  if(isAnime){
    // Enlace worker (slug+source+type=anime). No reclasificar como serie TMDB.
    href=pageHref('detalle-serie.html',{
      slug:slug,
      source_id:sid||'4',
      title:title,
      type:'anime',
      portada:img||undefined,
      year:year||undefined,
      id:tmdbId||undefined
    });
  }else if(isTv){
    href=tmdbId
      ? pageHref('detalle-serie.html',{id:tmdbId,slug,source_id:sid||undefined,title:title,type:'tv'})
      : pageHref('detalle-serie.html',{slug,source_id:sid||undefined,title:title,portada:img||undefined,year:year||undefined,type:'tv'});
  }else{
    href=tmdbId
      ? pageHref('detalle-pelicula.html',{id:tmdbId,slug,source_id:sid||undefined,title:title})
      : pageHref('detalle-pelicula.html',{slug,source_id:sid||undefined,title:title,portada:img||undefined,year:year||undefined});
  }

  let tipoLabel='Película';
  if(/ova/.test(tipo)) tipoLabel='OVA';
  else if(/ona/.test(tipo)) tipoLabel='ONA';
  else if(/especial|special/.test(tipo)) tipoLabel='Especial';
  else if(isAnime) tipoLabel='Anime';
  else if(isTv) tipoLabel='Serie';

  const rating=it.rating||it.vote_average||it.rating_tmdb;
  const ratingBadge=(rating && Number(rating)>0)?`<span class="badge badge-rating">★ ${Number(rating).toFixed(1)}</span>`:'';
  return `<a class="card" href="${href}"><div class="im">${img?`<img loading="lazy" src="${esc(img)}" alt="">`:''}<span class="badge badge-type">${esc(tipoLabel)}</span>${ratingBadge}</div><b>${esc(title)}</b><small>${esc(tipoLabel)}${year?' · '+esc(year):''}</small></a>`;
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
  window.addEventListener('scroll',()=>$('#top').classList.toggle('solid',scrollY>30),{passive:true});
  // Barra de secciones ABAJO solo móvil (no depende de mobile-ui.js)
  try{ mzEnsureMobileBottomNav(active); }catch(e){}
  try{ ensureTmdbReady(); }catch(e){}
}

/** Barra inferior de secciones — solo viewport ≤900px. PC no se toca. */
function mzEnsureMobileBottomNav(active){
  var isMobile = window.matchMedia('(max-width:900px)').matches;
  var oldTop = document.getElementById('mz-sec-bar');
  if(oldTop) oldTop.remove();
  var bar = document.getElementById('mz-bottom-nav');
  if(!isMobile){
    if(bar) bar.remove();
    document.body.classList.remove('mz-has-bottom-nav');
    return;
  }
  document.body.classList.add('mz-has-bottom-nav');
  if(!document.getElementById('mz-bottom-critical-css')){
    var st = document.createElement('style');
    st.id = 'mz-bottom-critical-css';
    st.textContent = [
      '@media (max-width:900px){',
      'header nav{display:none!important}',
      'body.mz-has-bottom-nav{padding-bottom:calc(58px + env(safe-area-inset-bottom,0px))}',
      '#mz-bottom-nav{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;justify-content:space-around;align-items:stretch;padding:0 0 env(safe-area-inset-bottom,0px);background:rgba(10,6,17,.98);border-top:1px solid #2a1f3d}',
      '#mz-bottom-nav a{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:9px 2px 7px;min-height:54px;color:#9a8fb0;font-size:.64rem;font-weight:600;text-decoration:none}',
      '#mz-bottom-nav a svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
      '#mz-bottom-nav a.on{color:#a66bff;box-shadow:inset 0 2px 0 #a66bff}',
      '}',
      '@media (min-width:901px){#mz-bottom-nav{display:none!important}header nav{display:flex!important}}'
    ].join('');
    document.head.appendChild(st);
  }
  if(!bar){
    bar = document.createElement('nav');
    bar.id = 'mz-bottom-nav';
    bar.setAttribute('aria-label', 'Secciones');
    bar.setAttribute('data-mz-icons', 'svg');
    document.body.appendChild(bar);
  }
  var I = {
    inicio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
    peliculas: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
    series: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    anime: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5l-5.4 3 1.2-6L3.3 9.3l6.1-.7z"/></svg>',
    favoritos: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>',
    historial: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  };
  var items = [
    { id: 'inicio', href: appLink('/'), label: 'Inicio' },
    { id: 'peliculas', href: appLink('/peliculas'), label: 'Películas' },
    { id: 'series', href: appLink('/series'), label: 'Series' },
    { id: 'anime', href: appLink('/anime'), label: 'Anime' },
    { id: 'favoritos', href: appLink('/favoritos'), label: 'Favoritos' },
    { id: 'historial', href: appLink('/historial'), label: 'Historial' }
  ];
  bar.setAttribute('data-mz-icons', 'svg');
  bar.innerHTML = items.map(function (it) {
    return '<a data-section="' + it.id + '" href="' + it.href + '">' + I[it.id] + '<span>' + it.label + '</span></a>';
  }).join('');
  if (active) {
    bar.querySelectorAll('a').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-section') === active);
    });
  }
}


function keyPage(){const v=$('#view');v.innerHTML=`<section class="page" style="max-width:520px;margin:auto"><h1>Conecta TMDB</h1><p style="color:var(--mute);line-height:1.6;margin-bottom:16px">Necesitas una API key v3 de <a style="color:var(--ac)" href="https://www.themoviedb.org/settings/api" target="_blank">themoviedb.org/settings/api</a>. Se guarda solo en este navegador.</p><form id="kf" style="display:flex;gap:8px"><input id="kv" style="flex:1;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:11px" placeholder="API key v3"><button class="btn">Guardar</button></form></section>`;$('#kf').onsubmit=e=>{e.preventDefault();const v=$('#kv').value.trim();if(v){KEY=v;store.set('mz_key',v);location.reload()}}}

nav();

/* mobile-ui.js desactivado: sobrescribía iconos SVG de la barra inferior */
