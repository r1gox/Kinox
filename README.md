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

## Cuenta y sincronización (Supabase, opcional)

Sin cuenta, todo se guarda en el navegador (en Perfil aparece una tarjeta para crear cuenta). Con cuenta, los perfiles, favoritos, historial y episodios vistos se sincronizan entre dispositivos.

1. **Crea la tabla**: en Supabase abre *SQL Editor*, pega `supabase/schema.sql` y ejecútalo. Activa RLS: cada usuario solo accede a su fila.
2. **Copia tus claves**: *Project Settings → API*. Necesitas la **Project URL** y la clave **anon / public**.
3. **Edita `js/config.js`** con esos dos valores. La anon key es pública por diseño; **nunca** pongas la `service_role`.
4. **Autenticación**: *Authentication → URL Configuration*:
   - *Site URL*: la URL de tu sitio en Vercel (por ejemplo `https://tu-sitio.vercel.app`).
   - *Redirect URLs*: agrega `https://tu-sitio.vercel.app/pages/cuenta.html` y `https://tu-sitio.vercel.app/cuenta` (y `http://localhost:3000/**` para pruebas).
5. **Correo de confirmación**: viene activado. Para probar rápido puedes desactivar *Confirm email* en *Authentication → Providers → Email*, pero en producción déjalo activo.
6. Despliega y abre `/cuenta`.

Notas: el sistema es "gana lo último que guardaste" (no fusiona cambios hechos a la vez en dos dispositivos). La librería `@supabase/supabase-js` está incluida en `js/vendor/` para no depender de un CDN.

### Perfiles

La pantalla `/perfil` funciona como "¿Quién está viendo?": hasta 5 perfiles con nombre, avatar (16 incluidos) o foto propia (se reduce a 192 px en el navegador). Los perfiles, avatares y fotos se sincronizan con la cuenta; el perfil activo es propio de cada dispositivo.

Al iniciar sesión la sincronización es automática: si la cuenta ya tenía datos y este dispositivo también, se combinan (favoritos, historial, perfiles y episodios vistos) sin borrar nada de ninguno de los dos lados.

## Seguridad y privacidad

- **Proxy de TMDB** (`api/tmdb.js` + `api/_tmdb-guard.js`): solo acepta las rutas y parámetros que usa el sitio (lista blanca), nunca una `api_key` del cliente, y limita a 150 peticiones por minuto por IP (mejor esfuerzo, por instancia). Para un límite estricto agrega una regla de *Rate Limiting* en el Firewall de Vercel sobre `/api/tmdb`.
- **Política de privacidad**: `pages/privacidad.html` (ruta `/privacidad`). **Antes de publicar rellena** `[TU NOMBRE O ALIAS]` y `[TU CORREO DE CONTACTO]`. Es una plantilla informativa, no asesoría legal.
- **Eliminar cuenta**: la página `/cuenta` usa la función SQL `delete_my_account()`. Si ya habías ejecutado `supabase/schema.sql`, vuelve a ejecutar el archivo (es idempotente) para instalarla.
- `robots.txt`, `sitemap.xml`, `favicon.svg`, `og.png` y `404.html` están en la raíz. Las URLs absolutas (`og:image`, sitemap) apuntan a `https://moviezone-teal.vercel.app`: cámbialas si usas otro dominio.
