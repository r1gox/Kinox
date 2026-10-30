# MovieZone

Catálogo de películas, series y anime en español. Sitio estático para Vercel con un proxy serverless para TMDB.

## Estructura

```
api/tmdb.js   Proxy edge hacia TMDB (la API key vive en el servidor)
css/          Estilos (desktop y móvil)
js/           Lógica por página (common.js = utilidades y cliente TMDB)
pages/        Páginas HTML (las rutas limpias se definen en vercel.json)
index.html    Inicio
vercel.json   Rewrites de rutas y headers de seguridad
```

## Desarrollo local

```bash
npm i -g vercel
echo "TMDB_API_KEY=tu_api_key_v3" > .env.local
vercel dev
```

## Despliegue

1. Importa el repo en Vercel como proyecto estático.
2. Agrega la variable de entorno `TMDB_API_KEY` (Production y Preview) con tu API key v3 de TMDB.
3. Redeploy.

Sin la variable, la app pide la key en el navegador y la guarda en `localStorage`. Es solo un modo de respaldo: en producción usa el proxy para no exponer la key.

## Datos

- **TMDB**: títulos, posters, fondos, sinopsis, géneros, temporadas y episodios.
- **YouTube**: tráilers.

Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB.

## Perfiles, favoritos e historial

Se guardan únicamente en el `localStorage` del navegador; no hay cuentas ni servidor de usuarios.

## Calidad

```bash
npm ci
npm run lint     # ESLint
npm test         # pruebas con node:test (sin dependencias de navegador)
npm run format   # Prettier (opcional; reformatea todo el repo)
```

El workflow `.github/workflows/ci.yml` ejecuta lint y pruebas en cada push y pull request.
