# MovieZone

Versión estática lista para Vercel.

## Datos
- TMDB: títulos, posters, fondos, sinopsis, géneros, temporadas y episodios.
- Worker MovieZone: únicamente reproductores al entrar al reproductor.
- Worker: https://moviezone.tvjz.workers.dev

## Flujo de reproducción
1. El detalle usa TMDB.
2. El botón Reproducir / Comenzar abre `/reproductor`.
3. El reproductor consulta el Worker con source `9` y obtiene los reproductores disponibles.
4. No se resuelven los videos al cargar la lista.
5. Al seleccionar Streamwish/Vidhide/Voe se consulta su `stream_url`/`hls_resolve` y se intenta reproducir HLS/MP4.

## Despliegue
Sube esta carpeta a Vercel como proyecto estático. `vercel.json` contiene los rewrites para las rutas limpias.

## TMDB
La primera vez se solicita la API key v3 y se guarda en localStorage del navegador.
