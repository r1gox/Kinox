async function loadPlayer(){
  try {
    const u=new URL(location.href);
    const type=u.searchParams.get('type')||'movie';
    const id=u.searchParams.get('id');
    const season=u.searchParams.get('season');
    const episode=u.searchParams.get('episode');
    let slug=u.searchParams.get('slug');

    if(!id){ $('#view').innerHTML='<div class="load">Falta el ID.</div>'; return; }

    // El nombre/slug se obtiene de TMDB. El Worker solo se consulta para reproductores.
    let meta=null;
    if(KEY){
      meta=await tmdb(`/${type}/${id}`);
      if(!slug) slug=mzSlug(meta.title||meta.name);
      document.title=(meta.title||meta.name||'Reproductor')+' — MovieZone';
    }

    const title=meta?.title||meta?.name||'Reproducción';
    const label=type==='tv'?`Temporada ${season} · Episodio ${episode}`:'Película';

    $('#view').innerHTML=`
      <section class="page player-page">
        <div class="player-head">
          <a class="back" href="javascript:history.back()">← Volver</a>
          <h1>${esc(title)}</h1>
          <small>${esc(label)}</small>
        </div>
        <div id="playerBox" class="mz-player"><div class="player-loading">Buscando reproductores…</div></div>
        <div id="servers" class="servers"></div>
      </section>`;

    const box=$('#playerBox'), servers=$('#servers');
    const data=await mzPlayers({type,slug,season,episode});
    const players=(data.reproductores||[]).filter(p=>p.stream_url||p.hls_resolve||p.url||p.link);

    if(!players.length){
      box.innerHTML='<div class="player-empty">No hay reproductores disponibles para este título.</div>';
      return;
    }

    servers.innerHTML=`<h3>Servidores</h3><div class="server-list">${players.map((p,i)=>`<button class="server-btn ${i===0?'active':''}" data-i="${i}">${esc(p.name||p.servidor||p.provider||`Servidor ${i+1}`)}<small>${esc((p.language||p.idioma||'').toUpperCase())}</small></button>`).join('')}</div>`;

    async function play(p,btn){
      document.querySelectorAll('.server-btn').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
      box.innerHTML='<div class="player-loading">Resolviendo video…</div>';
      const endpoint=p.hls_resolve||p.stream_url;
      if(!endpoint){
        box.innerHTML='<div class="player-empty">Este servidor no tiene una URL de reproducción disponible.</div>';
        return;
      }
      try{
        const r=await fetch(endpoint,{headers:{Accept:'application/json,text/plain,*/*'}});
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        const raw=await r.text();
        let payload; try{payload=JSON.parse(raw)}catch{payload=raw}
        let src=extractVideoUrl(payload);
        if(!src) throw new Error('El resolver no devolvió una URL de video compatible.');
        renderVideo(src);
      }catch(e){
        box.innerHTML=`<div class="player-empty">No se pudo iniciar este servidor.<br><small>${esc(e.message)}</small></div>`;
      }
    }

    function extractVideoUrl(x){
      if(typeof x==='string'){
        const s=x.trim();
        if(/^https?:\/\//i.test(s)) return s;
        try{return extractVideoUrl(JSON.parse(s))}catch{return null}
      }
      if(!x||typeof x!=='object') return null;
      const keys=['hls','hls_url','m3u8','url','stream_url','source','file','src','video_url','play_url'];
      for(const k of keys){
        if(typeof x[k]==='string' && /^https?:\/\//i.test(x[k])) return x[k];
      }
      for(const k of ['data','result','stream','video','source','sources']){
        const v=x[k];
        if(Array.isArray(v)){for(const item of v){const z=extractVideoUrl(item);if(z)return z}}
        else {const z=extractVideoUrl(v);if(z)return z}
      }
      return null;
    }

    function renderVideo(src){
      box.innerHTML=`<video id="mzVideo" controls playsinline preload="metadata" poster="${meta?.backdrop_path?IMG+'w1280'+meta.backdrop_path:''}"></video>`;
      const video=$('#mzVideo');
      if(/\.m3u8(?:\?|$)/i.test(src)){
        if(video.canPlayType('application/vnd.apple.mpegurl')) video.src=src;
        else if(window.Hls && Hls.isSupported()){
          const hls=new Hls({enableWorker:true});
          hls.loadSource(src); hls.attachMedia(video);
          video._hls=hls;
        } else {
          box.innerHTML='<div class="player-empty">Tu navegador no puede reproducir HLS aquí.</div>'; return;
        }
      }else video.src=src;
      video.play().catch(()=>{});
    }

    document.querySelectorAll('.server-btn').forEach(btn=>btn.onclick=()=>play(players[Number(btn.dataset.i)],btn));
    // Solo se solicitan los reproductores al entrar. La URL de video se resuelve
    // cuando el usuario selecciona un servidor.
    box.innerHTML='<div class="player-empty">Selecciona un servidor para comenzar la reproducción.</div>';
  }catch(e){ $('#view').innerHTML=`<div class="load">${esc(e.message)}</div>`; }
}
