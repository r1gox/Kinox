// MovieZone - reproductores externos
// El contenido visual viene de TMDB; el Worker solo se consulta al reproducir.
const MZ_WORKER = 'https://moviezone.tvjz.workers.dev';
const MZ_SOURCE = '9';

function mzSlug(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function mzPlayers({type, slug, season, episode}) {
  if (!slug) throw new Error('No se pudo determinar el título para buscar reproductores.');
  let path;
  if (type === 'tv') {
    if (!season || !episode) throw new Error('Faltan temporada o episodio.');
    path = `/${MZ_SOURCE}/serie/${encodeURIComponent(slug)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`;
  } else {
    path = `/${MZ_SOURCE}/pelicula/${encodeURIComponent(slug)}`;
  }

  const r = await fetch(MZ_WORKER + path, {headers:{Accept:'application/json'}});
  if (!r.ok) throw new Error(`Worker: HTTP ${r.status}`);
  const data = await r.json();
  if (!data.success) throw new Error(data.error || data.message || 'No se encontraron reproductores.');
  return data;
}
