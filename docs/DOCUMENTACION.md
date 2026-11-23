# Documentación técnica consolidada

Este archivo consolida los documentos técnicos anteriores para reducir la fragmentación de `docs/`.
El análisis exhaustivo permanece en `docs/analisis-endpoint-seo-formularios-cookies-main.md`.


---

## Versión publicada

Fuente original: `docs/version-publicada.md`

# Versión publicada (main)

Esta es la versión del sitio que sustituye a la anterior iteración conocida como "nueva versión" durante el desarrollo.

- **Repositorio de despliegue:** `gn-admin/main`
- **URL:** https://gn-admin.github.io/main/
- **Estado:** sitio estático listo para publicar con GitHub Pages (Actions).

## Cambios respecto a la iteración de desarrollo
- Contenido servido desde la raíz del sitio (sin subcarpeta de desarrollo).
- Recursos en rutas locales: `assets/`, `data/`, `css/`, `js/`.
- Eliminados los accesos de retorno a la versión anterior.
- Incluye `.nojekyll` y workflow de despliegue (`.github/workflows/pages.yml`).

## Relación con el repositorio `custom-page`
El repositorio `custom-page` mantiene la versión anterior del sitio y enlaza a esta versión publicada desde el menú (**Más → Nueva versión**) mediante la URL pública https://gn-admin.github.io/main/.

---

## Estructura del endpoint público

Fuente original: `docs/estructura-endpoint-publicaciones.md`

# Estructura de endpoint: publicaciones de acogida y adopciones

Este documento define la estructura recomendada para las respuestas de endpoint que alimentan publicaciones relacionadas con **acogida** y **adopciones** en la versión publicada (`main`, https://gn-admin.github.io/main/), incluyendo:
- **Fichas de animales** (adopción, acogida, adoptados/casos relacionados).
- **Eventos u otros hitos** (jornadas, campañas, hitos informativos o de difusión).

Está alineado con:
- Los datos actuales en `data/blog-posts.json` (campo `publication` añadido para normalizar esquema de publicación).
- El ejemplo de respuesta en `data/api-ejemplos/publicaciones-endpoint-ejemplo.json`.

> Nota: parte del contenido de galería/vídeo/iconos puede ser **orientativo o inventado** cuando falte material real, para mantener una estructura de publicación homogénea (iconos, imágenes/carrusel y vídeo) en escritorio y móvil.

---

## 1. Endpoint y variantes (filtrados)

### Listado general
- `GET /api/publicaciones`
- Devuelve publicaciones paginadas con filtros opcionales.

### Variantes recomendadas por filtrado (query params)
- Por tipo de publicación:
  - `GET /api/publicaciones?type=animal`
  - `GET /api/publicaciones?type=evento`
- Por categoría/ámbito:
  - `GET /api/publicaciones?category=Acogida`
  - `GET /api/publicaciones?category=Acogidas`
  - `GET /api/publicaciones?category=Gatos%20en%20adopci%C3%B3n`
  - `GET /api/publicaciones?category=Perros%20en%20adopci%C3%B3n`
  - `GET /api/publicaciones?category=Adoptados`
  - `GET /api/publicaciones?category=Caso%20externo`
  - `GET /api/publicaciones?category=Eventos`
- Por estado:
  - `GET /api/publicaciones?type=animal&status=en_adopcion`
  - `GET /api/publicaciones?type=animal&status=en_acogida`
  - `GET /api/publicaciones?type=animal&status=adoptado`
  - `GET /api/publicaciones?type=animal&status=urgente`
  - `GET /api/publicaciones?type=evento&status=activo|finalizado`
- Por especie (fichas de animales):
  - `GET /api/publicaciones?type=animal&species=gato`
  - `GET /api/publicaciones?type=animal&species=perro`
- Búsqueda y combinación:
  - `GET /api/publicaciones?q=acogida&type=animal&status=en_acogida`
  - `GET /api/publicaciones?type=animal&category=Gatos%20en%20adopci%C3%B3n&status=en_adopcion&page=1&pageSize=12&sort=-publishedAt`

### Detalle
- `GET /api/publicaciones/:slug` (o `:id`)
- Devuelve una publicación completa con esquema de publicación (`icons`, `gallery`, `videos`/`video`) y bloque específico (`animal` o `event`).

---

## 2. Estructura de respuesta (listado)

```json
{
  "endpoint": "GET /api/publicaciones",
  "generatedAt": "ISO-8601",
  "filters": {
    "type": ["animal", "evento"],
    "category": ["..."],
    "status": ["..."],
    "species": ["gato", "perro", "otros"],
    "q": "string"
  },
  "pagination": {
    "page": 1,
    "pageSize": 12,
    "total": 100,
    "totalPages": 9
  },
  "data": [/* Publicacion[] */]
}
```

---

## 3. Esquema común de publicación (`Publicacion`)

Campos comunes para que todas las publicaciones de acogida/adopciones mantengan la misma estructura visual/funcional:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `id` | string | Sí | Identificador único estable. |
| `slug` | string | Sí | Identificador para URL/detalle (`post.html?slug=`). |
| `type` | `"animal" \| "evento"` | Sí | Tipo principal de contenido. |
| `category` | string | Sí | Categoría editorial (ej. `Acogida`, `Gatos en adopción`, `Eventos`). |
| `status` | string | Sí | Estado operativo/editorial (`en_adopcion`, `en_acogida`, `adoptado`, `urgente`, `activo`, `finalizado`, etc.). |
| `title` | string | Sí | Título. |
| `excerpt` | string | Recomendado | Resumen breve para tarjetas/listados. |
| `publishedAt` | string (fecha/ISO) | Recomendado | Fecha de publicación. |
| `updatedAt` | string (fecha/ISO) | Opcional | Última actualización. |
| `author` | string | Opcional | Autor/fuente. |
| `coverImage` | `{src, alt}` | Recomendado | Imagen principal. |
| `icons` | `IconItem[]` | **Sí*** | Datos destacados con icono (especie, zona, estado, prioridad, etc.). |
| `gallery` | `GalleryItem[]` | **Sí*** | Carrusel de imágenes (mín. 1, recomendado 3–6). |
| `videos` | `VideoItem[]` | **Sí*** | Uno o varios vídeos de apoyo/informativo (puede ser orientativo si no hay material propio). |
| `video` | `VideoItem` | Compat. | Alternativa de compatibilidad para un único vídeo (el frontend también acepta `videos[]`). |
| `contentHtml` | string | Recomendado | Cuerpo HTML de la descripción. |
| `tags` | string[] | Opcional | Etiquetas. |
| `cta` | `{label,url}` | Opcional | Acción principal. |
| `animal` | `AnimalFicha` | Condicional | Presente cuando `type="animal"`. |
| `event` | `EventHito` | Condicional | Presente cuando `type="evento"`. |

\* En el esquema normalizado de la versión publicada, las publicaciones de acogida/adopciones **siempre** deben exponer `icons`, `gallery` (carrusel) y `videos` (o `video` por compatibilidad). Se admite **uno o varios vídeos** (habitualmente pocos). Si falta contenido real, se añade contenido de apoyo/orientativo.

### Subestructuras comunes

**IconItem**
```json
{ "icon": "🐱", "label": "Especie", "value": "Gato" }
```

**GalleryItem**
```json
{ "src": "assets/images/...", "alt": "texto alternativo", "caption": "pie opcional", "order": 1 }
```
- Rutas pueden ser relativas al sitio/datos (`assets/images/...`) y el frontend las normaliza según contexto.

**VideoItem** (`videos[]`, recomendado; también se acepta `video` único por compatibilidad)
```json
{
  "title": "Vídeo orientativo",
  "provider": "youtube",
  "url": "https://www.youtube-nocookie.com/embed/...",
  "thumbnail": null,
  "durationSec": null,
  "note": "Texto aclaratorio opcional"
}
```
Ejemplo con varios vídeos:
```json
"videos": [
  { "title": "Presentación", "provider": "youtube", "url": "https://www.youtube-nocookie.com/embed/..." },
  { "title": "Evolución", "provider": "youtube", "url": "https://www.youtube-nocookie.com/embed/...", "note": "Vídeo de apoyo" }
]
```

---

## 4. Ficha de animal (`type: "animal"`)

Aplicable a categorías como `Gatos en adopción`, `Perros en adopción`, `Acogida`, `Acogidas`, `Adoptados` y casos externos relacionados.

```json
{
  "type": "animal",
  "category": "Gatos en adopción",
  "status": "en_adopcion",
  "animal": {
    "names": ["Nombre"],
    "species": "gato | perro | otros",
    "breed": "string",
    "sex": ["macho|hembra|desconocido"],
    "age": { "value": 3, "unit": "months|years", "label": "3 meses" },
    "size": "pequeño | mediano | grande",
    "color": "string (opcional)",
    "health": {
      "vaccinated": true,
      "dewormed": true,
      "neutered": false,
      "microchipped": true,
      "specialNeeds": "texto o null"
    },
    "temperament": ["cariñoso", "sociable"],
    "compatibility": { "dogs": "sí|no|desconocido", "cats": "sí|no|desconocido", "kids": "sí|no|valorar" },
    "adoption": {
      "mode": "individual | conjunta",
      "feeEur": 100,
      "includes": ["microchip", "desparasitación"],
      "requirements": ["contrato", "seguimiento"]
    },
    "foster": {
      "temporary": false,
      "reason": "string",
      "durationLabel": "string",
      "expensesPolicy": "string"
    },
    "location": { "city": "Irún", "province": "Gipuzkoa", "shelter": "opcional" },
    "contact": { "email": "nebakadopciones@gmail.com", "phone": "625 140 588" }
  }
}
```

**Notas**
- Usar `adoption` para publicaciones de adopción/adoptados y `foster` para acogidas; pueden coexistir si aplica.
- En casos conjuntos (hermanos/tríos), `names`, `sex` y detalles pueden ser arrays o incluir el vínculo en `icons`/`adoption.mode`.
- `status` recomendado: `en_adopcion`, `en_acogida`, `adoptado`, `reservado`, `urgente`, `cerrado`.

---

## 5. Evento u hito (`type: "evento"`)

Aplicable a eventos, campañas, jornadas, hitos informativos o de difusión.

```json
{
  "type": "evento",
  "category": "Eventos",
  "status": "activo",
  "event": {
    "kind": "evento | campaña | hito | jornada | difusión",
    "startDate": "2026-10-20T10:00:00+02:00",
    "endDate": "2026-10-20T13:00:00+02:00",
    "timezone": "Europe/Madrid",
    "location": {
      "name": "Espacio Nebak",
      "address": "Dirección",
      "city": "Irún",
      "onlineUrl": null
    },
    "organizer": { "name": "Grupo Nebak", "contactEmail": "nebakadopciones@gmail.com", "phone": "625 140 588" },
    "audience": ["familias", "personas interesadas en acoger", "voluntariado"],
    "agenda": [
      { "time": "10:00", "title": "Bienvenida" },
      { "time": "10:30", "title": "Charla informativa" }
    ],
    "registration": { "required": false, "url": "contacto.html", "label": "Solicitar información" },
    "milestone": { "label": "Hito alcanzado", "value": "texto", "date": "YYYY-MM-DD" }
  }
}
```

**Notas**
- Para hitos sin horario exacto, pueden omitirse `startDate/endDate` y usarse `milestone`/`status`.
- `status` recomendado: `activo`, `programado`, `finalizado`, `cancelado`.

---

## 6. Mapeo con `data/blog-posts.json` (versión publicada `main`)

Para compatibilidad con el sitio estático actual, las publicaciones relacionadas con acogida/adopciones incluyen un bloque `publication`:

```json
{
  "slug": "...",
  "title": "...",
  "category": "Acogida | Acogidas | Gatos en adopción | Perros en adopción | Adoptados | Caso externo",
  "image": "assets/images/...",
  "content": "<p>...</p>",
  "publication": {
    "schema": "nebak-post-v1",
    "type": "acogida | gato | perro | adoptado | externo",
    "icons": [{ "icon": "", "label": "", "value": "" }],
    "gallery": [{ "src": "assets/images/...", "alt": "", "caption": "" }],
    "videos": [
      { "title": "", "url": "https://...", "provider": "youtube", "note": "" }
    ],
    "video": { "title": "", "url": "https://...", "provider": "youtube", "note": "" }, /* compatibilidad */
    "inventedContent": { "gallery": true, "video": true, "icons": true }
  }
}
```

- El render de detalle (`js/blog-render.js`) muestra **iconos**, **carrusel de imágenes** y **vídeo(s)** cuando existe `publication`, de forma responsive en escritorio y móvil (soporta `videos[]` y `video` único).
- El ejemplo completo de respuesta de endpoint se encuentra en `data/api-ejemplos/publicaciones-endpoint-ejemplo.json`.

---

## Plan: datos del gestor → main

Fuente original: `docs/plan-datos-gestor-a-main.md`

# Plan: datos del gestor → `main` sin saturar GitHub Pages ni GAS

> Documento de planificación. **No implementa nada por sí solo**: sirve para que otro modelo/ejecutor lo aplique por fases.
> Proyecto destino: `main` (`https://gn-admin.github.io/main`). Proyecto origen: `admin-dashboard` (gestor) + su backend Google Apps Script (canal público).
> Reglas que no se rompen: no modificar `main` desde el repo del gestor; `node --test` verde en ambos; no commitear `docs/plan-fuente-datos-fake-endpoint.md` (este plan sí se commitea).

## Estado de ejecución (2026-11-23)

- [x] **Fase 1 · exportación estática**: `scripts/exportar-datos.js` descarga el listado paginado y escribe `data/publicaciones.json`, `data/retiradas.json`, `data/redirects.json`, `data/taxonomias.json` y `data/config-publica.json` de forma atómica. Integrado en `.github/workflows/pages.yml` con `--soft` (no bloquea el deploy). Los JSON quedan versionados como fallback.
- [x] **Resiliencia básica**: si un endpoint opcional falla y existe un JSON previo, se conserva; `--soft` evita romper el build por datos.
- [x] **Fase 1 · cliente estático**: `publicaciones-api.js` lee `data/publicaciones.json` (listados y detalle), `data/taxonomias.json` para filtros; GAS queda como fallback si el JSON falta o falla.
- [ ] **Fases 2–6**: caché SW/localStorage, reducción de peticiones, reintentos con backoff, cron cada 6 h y proxy opcional.

## 1. Problema y motivación

Hoy la web `main` (GitHub Pages estático) consume el canal público de Apps Script **en tiempo de ejecución** desde el navegador: cada visita a un listado dispara `fetch`/JSONP contra `/exec` (`publicaciones`, `animales-publicos`, `eventos-publicos`, `historias-publicas`, `taxonomias`, `config-publica`, `publicacion&slug`). Además, el deploy de Pages ejecuta `scripts/prerender.js`, que vuelve a consultar el canal (listado paginado + `retiradas` + `redirects` + `sitemap` + detalle por ficha).

Consecuencias de saturación:
- **GAS**: cada visita ejecuta el script (cuota diaria de tiempo de ejecución, conexiones concurrentes). Bajo carga el canal falla → los listados quedan vacíos o degradan a fake.
- **GitHub Pages**: cron `*/30 * * * *` (48 builds/día) + `workflow_dispatch` en cada publicación. Cada build consume minutos de Actions y re-ejecuta el prerender (más llamadas a GAS). GitHub Pages tiene límites blandos de ancho de banda (~100 GB/mes) y de builds.
- **Sin caché en cliente**: visitantes recurrentes re-piden todo; no hay `stale-while-revalidate` para los datos del canal.
- **Build frágil**: si GAS está caído en el momento del deploy, el prerender falla y el deploy se bloquea (no hay fallback al último dato bueno).

Objetivo: **eliminar el tráfico runtime a GAS para los listados**, dejar GAS solo para el detalle on-demand y la publicación, y hacer el build resiliente, sin romper SEO ni la UX actual.

## 2. Restricciones de la plataforma (no negociables)

GitHub Pages:
- Hosting 100 % estático: sin server-side, sin headers custom, sin rewrites. Solo archivos.
- Ancho de banda blando ~100 GB/mes; límites de requests por IP; repo ≤ 1 GB; archivo ≤ 100 MB.
- Builds: recomendado ≤ 10/hora; Actions minutes limitados según plan.
- El cron `*/30` genera ~48 runs/día → roza los límites y satura GAS en cada run.

Google Apps Script (canal público):
- Cuota diaria de tiempo de ejecución (gratuito: 6 min/día por cuenta para triggers; web apps tienen límites de concurrentes).
- `ContentService` sin CORS configurable → JSONP de respaldo.
- Caché en script de 60 s (`webInstantaneaPublica`), troceada en 80 KB.
- `nocache=1` fuerza recompilación.

Restricciones del proyecto:
- `main` no se modifica desde el repo del gestor. El port del SEO es entrega externa (`TRANSFERIR_A_MAIN.md`).
- `node --test` debe quedar verde en ambos.
- No subir secretos/IDs a git (repo público).

## 3. Estado actual (resumen de flujo)

```
Visitante → GitHub Pages (estático) → JS en navegador → fetch/JSONP → GAS /exec (canal)
Deploy (push/cron/workflow_dispatch) → Actions → prerender.js → fetch GAS → escribe publicaciones/*.html + sitemap.xml + robots.txt → deploy Pages
Gestor publica → GAS _webAnotarDeploy → workflow_dispatch (main) → deploy
```

Puntos de carga runtime en el cliente (`main/js/publicaciones-api.js`):
- `load()` completo (todas las secciones reales) en portada/buscar.
- `ensureSection(section)` por sección en cada página.
- `loadPost(slug)` por ficha (detalle).
- `taxonomias(type)`, `config()`.

Puntos de carga en build (`main/scripts/prerender.js`):
- `descargarListado` paginado (`publicaciones`, hasta 50/pág, máx 50 págs).
- `retiradas`, `redirects`, `sitemap`.
- `paginasMod.cargarDetalles` (detalle por cada ficha indexable).

## 4. Diseño propuesto

Principio: **el canal GAS es fuente de verdad en tiempo de publicación, no en tiempo de visita**. En runtime, `main` lee datos estáticos generados en el último deploy y solo llama a GAS para el detalle on-demand (con caché) y como fallback.

### Fase 0 — Medición y línea base (sin cambios funcionales)

Objetivo: saber qué pesa y qué se pide.

- Añadir logging anónimo (sin PII) en el cliente: contador de requests a GAS por página, tiempos, fallos. Guardar en `localStorage`/consola; opcionalmente enviar a un endpoint propio (fuera de scope si no hay backend).
- Medir tamaño de `data/blog-posts.json` y de las respuestas del canal.
- Medir builds/día reales en Actions (ya visible en la UI).
- Baseline de `node --test` y prerender (`--dry`) para no regresar.

Entregable: informe corto (no código) con números. Sin esto, no se puede validar mejora.

### Fase 1 — Datos estáticos en build (elimina runtime GAS para listados)

El deploy ya llama a GAS en el prerender. Aprovecharlo para **escribir también los datos del canal como JSON estático** dentro del sitio, y que el cliente los lea de GitHub Pages en vez de GAS.

Cambios:
1. Nuevo script `main/scripts/exportar-datos.js` (o extender `prerender.js`) que, además de las páginas estáticas, descarga y normaliza:
   - listado completo (`publicaciones`, paginado) → `data/publicaciones.json` (envoltura `{generatedAt, site, posts, pagination}`).
   - `retiradas` → `data/retiradas.json`.
   - `redirects` → `data/redirects.json`.
   - `taxonomias` (sin tipo y por tipo) → `data/taxonomias.json` / `data/taxonomias-<tipo>.json`.
   - `config-publica` → `data/config-publica.json`.
   - Detalle por ficha ya se incrusta en `publicaciones/<slug>.html`; opcionalmente `data/fichas/<slug>.json` para el SPA de detalle.
2. El script debe ser **idempotente y no destructivo**: si una llamada a GAS falla, conservar el archivo anterior (no sobrescribir con vacío). Escribir a un `.tmp` y renombrar solo si la respuesta es válida (status success).
3. Integrar en `pages.yml`: ejecutar exportación antes/después del prerender, y subir esos JSON como parte del artifact (path `.` ya incluye `data/`).
4. Cliente (`publicaciones-api.js`): nueva fuente `'static'`:
   - `load()`/`ensureSection()` primero intentan `data/publicaciones.json` (same-origin, cacheable).
   - Si existe y es válido, usarlo y **no** llamar a GAS.
   - GAS queda como fallback (`fallbackOnError`) solo si el estático falta o es inválido.
   - `loadPost(slug)` lee `data/fichas/<slug>.json` si existe; si no, GAS.
   - `taxonomias()` lee `data/taxonomias*.json`.
   - `config()` lee `data/config-publica.json`.
5. Marcar el modo en `data-source.js` (nuevo `staticMode: true` o sección `static`) y mantener compatibilidad con `fake`/`real`.

Beneficio: cero llamadas a GAS en runtime para listados/taxonomías/config. El ancho de banda lo sirve GitHub Pages (cachéable, CDN).

Riesgo: datos desactualizados hasta el siguiente deploy. Mitigación: deploy se dispara al publicar (ya existe), y el cliente puede hacer `stale-while-revalidate` contra GAS en segundo plano (Fase 2).

### Fase 2 — Caché en cliente (SW + localStorage) con TTL y SWR

- Service worker (`src/sw.js`): cachear `data/*.json` con estrategia `stale-while-revalidate` (ya se hace para assets). Subir `CACHE_NAME` al cambiar.
- Para las llamadas residuales a GAS (detalle on-demand, fallback), cachear en `localStorage` con TTL (ej. 5 min) por clave (`gn:canal:<endpoint>:<params>`), con invalidación por `generatedAt` del estático.
- Implementar dedup de peticiones en vuelo (ya parcialmente en `realPending`).
- `nocache=1` solo cuando el usuario fuerza (botón "actualizar") o en dev.

### Fase 3 — Reducción de peticiones (agregación, dedup, proyección)

- Reducir llamadas por página: una sola carga de `data/publicaciones.json` alimenta todas las secciones (hoy se pide por sección). Unificar `ensureSection` para que, si el estático está disponible, no haga N requests.
- Usar `fields=card` (proyección ya soportada) para listados; detalle completo solo en ficha.
- Dedup global: si hay una petición en vuelo para la misma clave, reutilizarla (evitar tormentas al cargar la portada).
- Evitar `load()` completo en páginas que solo necesitan una sección (ya parcial).

### Fase 4 — Resiliencia del build

- `prerender.js`/`exportar-datos.js`: reintentos con backoff (3 intentos, 2s/4s) ante fallo de GAS.
- Si GAS falla tras reintentos: **no fallar el build** si existe un dato bueno previo en el repo (committear `data/*.json` como fallback). Usar `--soft`-like behavior para datos, pero mantener bloqueo para sitemap/robots (SEO).
- Añadir `--from-fixture`/`--offline` para CI sin red.
- Guardar `generatedAt` y `source` en cada JSON para trazabilidad.

### Fase 5 — Frecuencia de deploy y batching

- Cambiar cron de `*/30 * * * *` a `0 */6 * * *` (cada 6 h) o incluso diario, manteniendo `workflow_dispatch` para publicaciones inmediatas. (Decisión: el deploy inmediato ya cubre el caso de publicar; el cron solo es red de seguridad.)
- En el gestor, debounce/batch de disparos: si se publican/ocultan varias fichas en < 60 s, un solo `workflow_dispatch` (ya hay dedup 60 s en `_webAnotarDeploy`; verificar que cubre ambos destinos).
- Cancelar runs redundantes: cambiar `cancel-in-progress: true` en `pages.yml` (hoy es `true` ya) — mantener.
- Limitar builds: no ejecutar prerender si no cambió el canal (hash del listado). Opcional: guardar hash en `data/.hash` y saltar si igual.

### Fase 6 — (Opcional) Proxy/CDN de caché para llamadas residuales

Solo si tras Fase 1-3 siguen habiendo llamadas runtime a GAS (detalle on-demand, formularios):
- Poner un Cloudflare Worker (o similar) delante de `/exec` que cachee GETs por URL con TTL corto (30-60 s) y sirva `stale-while-revalidate`.
- El cliente apunta a `https://<worker>/...` en vez de `/exec`.
- Invalidación por `nocache=1` o por versión.

Fuera de scope si no se necesita: Fase 1 ya elimina el tráfico principal.

## 5. Contrato de datos estáticos

Formato `data/publicaciones.json`:
```json
{
  "generatedAt": "2026-11-23T10:00:00Z",
  "source": "gas-canal",
  "site": { "name": "...", "url": "..." },
  "posts": [ { "slug": "...", "status": "publicado", "seo": {...}, ... } ],
  "pagination": { "page": 1, "pageSize": 50, "totalPages": 1, "total": 7 }
}
```
- Normalizado con `normalizePost` (mismo que el cliente) para que el renderizador no cambie.
- `urlEstatica` se añade en cliente (como hoy) o en build; mantener en cliente para no duplicar lógica.
- `data/fichas/<slug>.json`: `{status, data}` (sobre del canal) para detalle.

Compatibilidad: el cliente debe aceptar tanto estático como GAS (fallback) sin cambios en renderizadores.

## 6. Mapa de cambios por archivo

`main/`:
- `scripts/exportar-datos.js` (nuevo): descarga y escribe JSON estáticos.
- `scripts/prerender.js`: integrar exportación o llamarla; añadir reintentos.
- `js/data-source.js`: opción `staticMode`/`staticBase`.
- `js/publicaciones-api.js`: fuente `'static'` primero; fallback a `'real'`.
- `js/canal-publico.js`: sin cambios (se sigue usando como fallback).
- `src/sw.js` → subir `CACHE_NAME` al cambiar estrategia.
- `.github/workflows/pages.yml`: ejecutar exportación; ajustar cron.
- `data/*.json`: commitear como fallback (no ignorar).

`admin-dashboard/` (solo si se toca):
- `apps-script/Code.gs`: verificar dedup de deploy para ambos destinos; opcionalmente hash del canal para saltar builds.
- `apps-script/WebPublicaciones.gs`: sin cambios funcionales (ya tiene instantánea).

## 7. Criterios de aceptación

- `node --test` verde en ambos repos.
- `node scripts/prerender.js --dry` verde.
- Tras deploy, `data/publicaciones.json` existe y es válido; el cliente carga listados sin ninguna request a GAS (verificable en Network tab: 0 requests a `script.google.com`).
- Ficha detalle: 1 request a GAS la primera vez; subsequentes desde caché.
- Si GAS está caído en build, el build no falla si hay dato bueno previo; sitemap/robots siguen validándose.
- Cron reducido; builds/día < 20.
- Lighthouse/Network: 0 requests a GAS en navegación normal de listados.

## 8. Riesgos y mitigaciones

- Datos desactualizados: mitigado por deploy inmediato al publicar + SWR en cliente.
- Tamaño del repo: JSON estáticos pequeños (KB); monitorear. Límite 1 GB.
- Inconsistencia estático vs GAS (fallback): el cliente debe preferir estático y solo usar GAS si falta/inválido; mostrar indicador sutil si usa fallback.
- Build más lento: exportación añade ~N requests a GAS (ya se hacen en prerender). Aceptable.
- SEO: canonical/sitemap siguen generándose en build; no cambia.

## 9. Orden de ejecución recomendado

1. Fase 0 (medición) — opcional pero recomendado.
2. Fase 1 (datos estáticos) — núcleo. Implementar exportación + cliente.
3. Fase 4 (resiliencia build) — junto con Fase 1.
4. Fase 2 (caché cliente) — después de Fase 1.
5. Fase 3 (reducción peticiones) — pulido.
6. Fase 5 (cron/deploy) — configuración.
7. Fase 6 (proxy) — solo si hace falta.

## 10. Checklist de verificación final

- [ ] `npm test` (admin-dashboard) verde.
- [ ] `node --test` (main) verde.
- [ ] `node scripts/prerender.js --dry` verde.
- [ ] Deploy de preview/main exitoso.
- [ ] Network tab: 0 requests a `script.google.com` en listados.
- [ ] Ficha detalle funciona y se cachea.
- [ ] Fallback a GAS funciona si se borra `data/publicaciones.json`.
- [ ] Cron reducido y builds < 20/día.
- [ ] No secretos en el diff.

---

> Nota: este plan NO modifica código. La ejecución se hace por fases en el repo `main` (y ajustes menores en `admin-dashboard` solo para deploy/hash). Mantener `node --test` verde tras cada fase.

