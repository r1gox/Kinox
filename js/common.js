const TMDB_KEY='';const API='https://api.themoviedb.org/3',IMG='https://image.tmdb.org/t/p/';
// Worker: NO declarar MZ_WORKER aquí (lo define worker.js). Solo la URL de búsqueda:
const MZ_SEARCH='https://moviezone.tvjz.workers.dev';
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
function workerCard(it){
  const tipo=String(it.type||it.tipo||'').toLowerCase();
  const isTv=/serie|tv|anime|dorama/.test(tipo);
  const type=isTv?'tv':'movie';
  const slug=it.slug||slugify(it.title||it.titulo||'');
  const sid=it.source_id||it.sourceId||'';
  const title=it.title||it.titulo||'Sin título';
  const img=it.portada||it.poster||'';
  const year=it.year||'';
  const src=it.source||it.fuente||'';
  // Buscador → DETALLE (no al episodio 1)
  const href=isTv
    ? pageHref('detalle-serie.html',{slug,source_id:sid||undefined,title:title,portada:img||undefined,year:year||undefined})
    : pageHref('detalle-pelicula.html',{slug,source_id:sid||undefined,title:title,portada:img||undefined,year:year||undefined});
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
nav();
