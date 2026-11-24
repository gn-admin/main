# Plan: fuente de datos conmutable (fake → canal real) por sección

> **Estado:** **cerrado** (2026-11-24). Fases 0–5 ejecutadas: capa única de datos, secciones dinámicas y encendido progresivo cubiertos por la exportación estática (`scripts/exportar-datos.js` → `data/publicaciones.json`) con el canal como respaldo. Única excepción: **apadrinamiento**, que sigue en `fake` porque el canal todavía no expone el dato (decisión D2 pendiente en el backend).
> **Fecha:** 2026-11-21. **Revisión 4 (2026-11-24):** cierre de fases y verificación del deploy de `main`.
> **Objetivo:** mantener visible el contenido actual (datos "fake" en `data/blog-posts.json`) detrás de una **variable de configuración**, y pasar **sección por sección** al canal real del backend, sin reescribir los renderizadores ni cambiar el diseño.

---

## 1. Documentación relacionada revisada

### 1.1 En este repo (`main`)

| Documento | Qué aporta | Qué no aporta |
|---|---|---|
| `docs/estructura-endpoint-publicaciones.md` | Contrato **teórico** (`GET /api/publicaciones`, filtros, esquema `Publicacion`, mapeo con `publication`). | No coincide del todo con el canal real (usaba `/api/publicaciones/{slug}`; el real es `?endpoint=publicacion&slug=`). |
| `docs/analisis-endpoint-seo-formularios-cookies-main.md` | Inventario del sitio y de fuentes de datos; SEO de fichas; formularios; cookies. | No define la conmutación de fuente por sección. |
| `docs/version-publicada.md`, `README.md` | Contexto de despliegue (GitHub Pages, `/main/`). | — |

### 1.2 En `admin-dashboard` (aquí está la definición real)

| Documento / código | Qué define |
|---|---|
| **`apps-script/Code.gs` → `handleGetPublico`** | **Rutas reales** del canal público, alias, endpoints públicos, JSONP, caché. |
| **`apps-script/WebPublicaciones.gs`** | Composición del payload (`webConstruirPublicacion`), filtros/orden/paginación (`webListarPublicas`), detalle/301/410 (`webPublicacionPublica`), `retiradas`, `redirects`, `sitemap`, `taxonomias`, `config-publica`, vocabularios (`WEB_TIPOS`, `WEB_ESTADOS_PUBLICOS`). |
| `TRANSFERIR_A_MAIN.md` §A.2–A.6 | Contrato resumido para `main`, estados a manejar y checklist de aceptación (incluye `animal_grupo`). |
| `F0_MAPA_CAMPOS_Y_CONTRATO.md` | Nombres reales de campos, whitelist pública, precedencia y lo que **nunca** sale. |
| `GESTOR_WEB_PLAN_Y_ENDPOINTS.md` | Plan/registro del gestor y del canal. |
| `AUDITORIA_FUNCIONES_F0_F5.md`, `memory.md` | Estado verificado en producción (canal sin token, caché ~60 s, `?endpoint=config` responde 401 → usar `config-publica`). |
| `src/js/publico.js` | Implementación de referencia del consumo (fetch + **JSONP de respaldo**, timeout, estados). |

**Conclusión:** el `main` no tiene MD del backend porque el backend vive en `admin-dashboard`; el contrato ya está **implementado y desplegado**, no solo planificado. Este documento se alinea con el código, no con el borrador antiguo.

---

## 2. Estado actual del front (`main`, verificado en código)

| Sección | Página | Pinta | Origen actual |
|---|---|---|---|
| Historias | `historias.html` | `js/blog-render-index.js` | `data/blog-posts.json` vía `HistoriasAPI` |
| Detalle ficha/historia | `post.html?slug=` | `js/blog-render.js` | idem |
| Gatos en adopción | `gatos-en-adopcion.html` | `js/main.js` (`initAdoptionListings`) | `fetch('data/blog-posts.json')` **directo** |
| Perros en adopción | `perros-en-adopcion.html` | idem | idem |
| Chat/asistente | global | `js/main.js` (`initChat`) | `fetch('data/blog-posts.json')` **directo** |
| Acogidas | `acogidas.html` | — | **Tarjetas fijas en HTML** |
| Adoptados | `adoptados.html` | — | **Tarjetas fijas en HTML** |
| Casos externos | `casos-externos.html` | — | **Tarjetas fijas en HTML** |
| Home (carrusel/noticias) | `index.html` | — | Enlaces/slugs **fijos** |
| Apadrinamiento | — | — | **No existe** |

`js/blog-api.js` ya tiene `var ENDPOINT_URL = ''`, pero es un interruptor **global todo-o-nada** y no conoce el contrato real (envelope `{status,...}`).

---

## 3. Canal real del backend (lo que hay que consumir)

### 3.1 URL y transporte

- Web App de Apps Script (deployment `/exec`). La URL pública usada por el panel está en `admin-dashboard/src/js/config.js` → `CONFIG.apiUrl`; en `main` debe ir en la configuración del §4 (`endpointBase`).
- Acceso público sin token (endpoints allowlistados en `_esEndpointPublico`).
- **CORS:** `Code.gs` no puede fijar cabeceras (`ContentService` no lo permite), así que el transporte fiable es **JSONP**: `...&callback=<fn>` validado por `_webSalida`. `publico.js` intenta `fetch` primero (con `AbortController` 20 s) y cae a JSONP; en `main`, si el `fetch` cross-origin falla, **JSONP es el camino principal**, no el respaldo.
- **Caché:** servidor ~60 s (`_webConCache`); `nocache=1` solo para depurar. En cliente, caché por sección en memoria (la misma petición no se repite al filtrar).

### 3.2 Rutas reales (todas GET, con `?endpoint=`)

| Endpoint | Alias | Uso |
|---|---|---|
| `?endpoint=publicaciones` | `v1/publicaciones`, `api/publicaciones` | Listado unificado (todos los tipos) |
| `?endpoint=publicacion&slug=<slug>` | — | Detalle; puede devolver `redirect` o `gone` |
| `?endpoint=animales-publicos` | `v1/animales` | Fuerza `type=animal` |
| `?endpoint=eventos-publicos` | `v1/eventos` | Fuerza `type=evento` |
| `?endpoint=historias-publicas` | `v1/historias`, `v1/blog` | Fuerza `type=historia` |
| `?endpoint=taxonomias` | `v1/taxonomias` | Valores disponibles de `type/category/status/species` |
| `?endpoint=config-publica` | `v1/config` | Config pública (nombre, contacto, SEO base) |
| `?endpoint=retiradas` | — | Slugs retirados (páginas 410/`noindex`) |
| `?endpoint=redirects` | `api/redirects`, `v1/redirects` | Mapa 301 de slugs históricos |
| `?endpoint=sitemap` | `v1/sitemap`, `sitemap.xml` | URLs publicadas |

> ⚠️ En producción `?endpoint=config` responde **401** (no es público); hay que usar `config-publica` o `v1/config`.

### 3.3 Envelope de respuesta (crítico para el adaptador)

**Listado** (`webListarPublicas`):

```json
{
  "status": "success",
  "endpoint": "GET /api/publicaciones",
  "generatedAt": "ISO",
  "filters": { "type": [], "category": [], "status": [], "species": [], "q": "" },
  "applied": { "type": "...", "category": "...", "status": "...", "species": "...", "q": "..." },
  "pagination": { "page": 1, "pageSize": 12, "total": 0, "totalPages": 0 },
  "data": [ /* Publicacion */ ]
}
```

**Detalle**: `{ "status":"success", "data": Publicacion, "redirect"?: {from,to,slug,permanent} }`.

**Otros estados reales** que el front **debe** manejar:

| `status` | Cuándo | Qué hacer |
|---|---|---|
| `success` | Normal | Renderizar |
| `warning` | Hoja `WebPublicaciones` sin configurar (`code: sheet_missing`) | Estado de canal no disponible |
| `error` | Slug inexistente u otro error | 404 lógico, `noindex` |
| `gone` | Slug retirado (`code:"gone"`) | Página de retirada, `noindex`, sin canonical |
| `redirect` (junto a `success`) | Slug histórico o ficha individual superada por su grupo | `history.replaceState` al slug nuevo / 301 en build |

### 3.4 Filtros reales (`webListarPublicas`)

| Parámetro | Valores / comportamiento |
|---|---|
| `type` | Comparación **exacta**: `animal`, `animal_grupo`, `evento`, `historia` |
| `category` | Comparación **exacta** con la etiqueta. El backend **deriva**: `Gatos en adopción`, `Perros en adopción`, `En adopción`, `Acogidas`, `Adoptados`, `Cerrados` (+ `categoria` editorial en evento/historia) |
| `status` | `en_adopcion`, `en_acogida`, `reservado`, `adoptado`, `cerrado` (vocabulario público D1) |
| `species` | Minúsculas, igualdad exacta contra `animal.species` (`gato`, `perro`, …) |
| `q` | Búsqueda en `title + excerpt + contentHtml + tags` |
| `sort` | Por defecto `-publishedAt`; admite `title`, `updatedAt` y el prefijo `-`. **Los urgentes van siempre primero** |
| `page`, `pageSize` | `pageSize` por defecto 12, **máximo 50** |
| `fields=card` | Proyección ligera (sin `contentHtml` ni `ficha`); ideal para listados |
| `nocache=1` | Solo diagnóstico |

**No hay** filtro `featured`, ni paginación por cursor, ni filtro por `apadrinable`.

### 3.5 Payload (lo que ya viene y lo que falta)

`webConstruirPublicacion` emite:

`id, slug, type, category, status, title, excerpt, publishedAt, updatedAt, coverImage{src,alt}, contentHtml, author, tags[], icons[], gallery[], videos[], featured, listed, url, canonical, urgent, isGroup, seo{...}` y, por compatibilidad explícita con el render actual, **`image`, `imageAlt`, `dateFormatted`, `readTime`**. Bloques `animal` (o `group` + `animal` con el mismo contenido) y `event`; **`ficha` solo en detalle**.

Consecuencias para `main` (el adaptador es **fino**, no un mapeador completo):

| Dato | Realidad | Acción en el adaptador |
|---|---|---|
| `image`, `imageAlt`, `dateFormatted`, `readTime` | Ya vienen | Usar tal cual |
| `content` | Viene como **`contentHtml`** | Renombrar |
| `date` | Viene `publishedAt`; `main.js` ordena por `date` | Añadir `date = publishedAt` |
| `publication` | **No viene** (vienen `icons/gallery/videos` planos) | Componer `publication = {schema:'nebak-post-v1', icons, gallery, videos}` |
| `type` | Incluye `animal_grupo` | Tolerar e ignorar en lo que no aplique |
| `url`, `canonical` | Rutas `/animales/<slug>`, `/eventos/<slug>`, `/historias/<slug>`; `canonical` vacío si la base es GitHub Pages (`webDominioPublico`) | Reescribir a `post.html?slug=` mientras no haya prerender (decisión D6) |
| `animal.contact`, `author` | Públicos por contrato (D7) | No usarlos para datos personales del tutor |

### 3.6 Comprobación en vivo del canal (2026-11-21)

`?endpoint=taxonomias` devuelve hoy:

- `type`: `animal`, `animal_grupo`, `evento`, `historia`
- `category`: `Perros en adopción`, `Gatos en adopción`, `Eventos`, `Historias`
- `status`: `en_adopcion`, `reservado`, `en_acogida`, `programado`, `publicado` (los dos últimos son de eventos, no del vocabulario de animales)
- `species`: `perro`, `gato`

Conteo por sección (`pageSize=1`, campo `pagination.total`):

| Sección | Consulta | Total |
|---|---|---:|
| Todas | `publicaciones` | **7** |
| Historias | `historias-publicas` | 1 |
| Eventos | `eventos-publicos` | 1 |
| Animales (individuales) | `animales-publicos` | 4 |
| Gatos en adopción | `animales-publicos&species=gato&status=en_adopcion` | 1 |
| Perros en adopción | `animales-publicos&species=perro&status=en_adopcion` | 2 |
| Acogidas | `animales-publicos&status=en_acogida` | **0** |
| Adoptados | `animales-publicos&status=adoptado` | **0** |
| Reservados | `animales-publicos&status=reservado` | 1 |
| Apadrinamiento | `publicaciones&category=Apadrinamiento` | **0** |
| Casos externos | `publicaciones&category=Caso externo` | **0** |

Desglose del listado completo (7): `animal` 4 · `historia` 1 · `evento` 1 · `animal_grupo` 1; categorías: `Perros en adopción` 4 · `Gatos en adopción` 1 · `Historias` 1 · `Eventos` 1; estados: `en_adopcion` 3 · `reservado` 1 · `en_acogida` 1 · `programado` 1 · `publicado` 1.

Consecuencias para la migración:

- `animal_grupo` **solo** aparece en `publicaciones` (no en `animales-publicos`): las secciones de gatos/perros no lo verán si se filtran por tipo.
- El grupo en `en_acogida` lleva categoría `Perros en adopción` (override editorial): `category` no siempre se deduce del estado.
- Acogidas, adoptados, apadrinamiento y casos externos están hoy a **0**: activar `'real'` ahí dejaría el listado vacío.

---

## 4. Diseño de la variable (una sola, por sección)

```js
// js/data-source.js  ← BORRADOR de diseño, no implementado
window.NEBAK_DATA_SOURCE = {
  version: 1,

  defaultMode: 'fake',            // 'fake' | 'real'

  // Web App /exec del canal público (solo lectura, sin token)
  endpointBase: '',               // p.ej. https://script.google.com/macros/s/<DEPLOY_ID>/exec

  sections: {
    historias:      { mode: 'fake' },
    gatos:          { mode: 'fake' },
    perros:         { mode: 'fake' },
    acogidas:       { mode: 'fake' },
    adoptados:      { mode: 'fake' },
    casosExternos:  { mode: 'fake' },
    apadrinamiento: { mode: 'fake' },   // ver §7: sin soporte en backend
    home:           { mode: 'fake' }
  },

  options: {
    pageSize: 24,          // respeta el máximo 50 del canal
    timeoutMs: 15000,
    transport: 'auto',     // 'auto' (fetch → JSONP) | 'jsonp'
    fallbackOnError: true, // 'real' caído/vacío → fake de esa sección
    showFakeBadge: false,
    debug: false
  }
};
```

Reglas:

- `modo(seccion) = sections[seccion]?.mode ?? defaultMode`
- `'fake'` → `data/blog-posts.json` (comportamiento actual exacto; **cero** peticiones al canal).
- `'real'` → canal; si `endpointBase` está vacío o la sección no tiene mapeo (§6), **degrada a fake** con aviso.
- `defaultMode: 'fake'` actúa de *kill switch* para revertir todo sin tocar cada sección.
- Config ausente ⇒ todo fake (seguridad).

---

## 5. Capa única de datos (adaptador)

Nuevo `js/publicaciones-api.js`, que sustituye los tres accesos actuales:

```
getPosts(section, { page, pageSize, q })  → { posts: Post[], meta: { source, status, total, page, warning? } }
getPostBySlug(slug)                        → { post, redirect?, gone?, notFound? }
getTaxonomias()                            → { type[], category[], status[], species[] }
```

Comportamiento:

1. Resuelve `mode`.
2. **fake** → `fetch('data/blog-posts.json')` una vez + caché; filtra por sección con el criterio actual (`category` normalizada; `historias` excluye `Acogida/Acogidas/Gatos/Perros/SC`).
3. **real** → petición al canal con el mapeo de §6, **cachea por clave de petición** y **normaliza** el envelope:
   - Listado: si `status !== 'success'` → tratar como error/aviso (nunca `undefined.map`).
   - `data[]` → `Post` interno: renombrar `contentHtml → content`, añadir `date`, componer `publication`.
   - Respetar `pagination` para el contador; los filtros de UI pueden seguir siendo client-side sobre la página cargada (como hoy) o pasar a `q/status/species` del canal (recomendado: `q` en servidor, filtros de chip en cliente).
4. **Detalle real** → `?endpoint=publicacion&slug=`: si `redirect` → `history.replaceState` y render de la ficha vigente; si `gone` → vista de retirada; si `error` → 404 lógico.
5. Transporte: `fetch` con timeout y caída automática a **JSONP** (script tag + callback único + limpieza), siguiendo `src/js/publico.js` como referencia.
6. Caché de sesión por sección/clave y `forceRefresh` para el botón de reintento.

#### 5.1 Propiedad de los datos por sección

- Cada publicación local pertenece a **una** sección: las de ficha por su `category` (`gatos`, `perros`, `acogidas`, `adoptados`, `casosExternos`, `apadrinamiento`) y el resto editorial a `historias` (Eventos, D.E.P, SC…). `home` es una **vista**, no posee datos.
- `getAllPosts()` = unión de canal + local, **ocultando el fake de una sección en `real` que ya respondió**. Si el canal falla y `fallbackOnError` está activo, el fake se mantiene.
- `getPostsFor(seccion)`: en `real` devuelve **solo** el canal; en `fake` devuelve solo datos locales de esa sección (`historias` = feed editorial sin fichas de animal; `home` = vista sobre todo). Nunca mezcla.
- `HistoriasAPI.getAllPosts()` delega en `getPostsFor('historias')`: el índice de historias deja de depender del catálogo completo y una sección en real no arrastra datos locales.
- Verificado con 22 aserciones (`A`–`F`): paridad total en fake (23 posts, mismo orden, 9 en el feed), gatos real (fake de gatos fuera, resto intacto), historias real (feed solo canal, Eventos oculto), home real (vista solo canal sin vaciar otras secciones), dos secciones reales y caída del canal con fallback.

Con esto, `blog-render-index.js`, `blog-render.js` e `initAdoptionListings` **no cambian de contrato**; solo dejan de hacer su propio `fetch`.

### Prerrequisitos de unificación

| Consumidor | Cambio |
|---|---|
| `js/blog-api.js` | Pasa a ser fachada sobre `publicaciones-api.js`; `ENDPOINT_URL` se retira al final |
| `js/main.js` → `initAdoptionListings` | `getPosts('gatos'|'perros')` |
| `js/main.js` → `initChat` | `getPosts(<sección animal>)` |
| `acogidas/adoptados/casos-externos.html` | Contenedores `[data-adoption-list="..."]` en lugar de tarjetas fijas |
| `index.html` | Opcional/fase posterior (`home`) |

---

## 6. Mapeo sección → petición real

| Sección | Fake | Real (`?endpoint=…&…`) | Notas |
|---|---|---|---|
| `historias` | JSON menos categorías de animales/SC | `historias-publicas&pageSize=24&sort=-publishedAt` | `type=historia` |
| `post` (detalle) | `getPostBySlug` local | `publicacion&slug=<slug>` | Manejar `redirect`/`gone`/`error` |
| `gatos` | `category === 'Gatos en adopción'` | `animales-publicos&species=gato&status=en_adopcion&pageSize=24` | `species` en minúsculas |
| `perros` | `category === 'Perros en adopción'` | `animales-publicos&species=perro&status=en_adopcion` | idem |
| `acogidas` | HTML fijo + posts `Acogida`/`Acogidas` | `animales-publicos&status=en_acogida` | El backend deriva la categoría **`Acogidas`** (plural) |
| `adoptados` | HTML fijo + `Adoptados` | `animales-publicos&status=adoptado` | Categoría `Adoptados` |
| `casosExternos` | HTML fijo + `Caso externo` | **sin equivalente en el canal** | Ver §7.2 |
| `apadrinamiento` | (nuevo fake) | **sin soporte** | Ver §7.1 |
| `home` | carrusel fijo | `publicaciones&pageSize=6` + filtro `featured` en cliente | No existe filtro `featured` en query |

Recomendación: al arrancar, consultar `taxonomias` (una vez, cacheada) y **construir los chips/filtros con los valores reales** en vez de hardcodear `Gato`/`Perro` o etiquetas de categoría.

---

## 7. Huecos reales del backend para lo que pide el sitio

> Las peticiones concretas al canal (contrato, criterios de aceptación y prioridad) están documentadas para el equipo de `admin-dashboard` en `admin-dashboard/REQUISITOS_WEB_CANAL_PUBLICO.md` (R1–R5).

### 7.1 Apadrinamiento (no existe en el canal)

- En `Animales` existe `apadrinable` (booleano) y el gestor tiene un botón de apadrinar, pero `F0_MAPA_CAMPOS_Y_CONTRATO.md` lo lista en **“Nunca salen”**: no viaja al payload público.
- No hay `type`, `category` ni `status` de apadrinamiento en `WEB_TIPOS` / `WEB_ESTADOS_PUBLICOS`.
- Opciones (decisión D2 del §9):
  - **A (mínimo backend):** exposición pública limitada del flag (`apadrinable: true` whitelisted) + sección que filtre `?endpoint=publicaciones` y filtre en cliente. No cambia el contrato de tipos.
  - **B (contrato nuevo):** `category:"Apadrinamiento"` derivada en composición (o `status:"en_apadrinamiento"`), con filtro propio. Más limpio, pero toca `WebPublicaciones.gs`, el gestor y los vocabularios.
- En cualquier caso: **la sección no puede pasar a `'real'` antes de A o B**.

### 7.2 Casos externos

- Hoy son tarjetas fijas; en `blog-posts.json` son `Caso externo`, pero el canal **no deriva** esa categoría (solo `Gatos/Perros en adopción`, `En adopción`, `Acogidas`, `Adoptados`, `Cerrados`).
- Salidas: publicarlos como `historia` con `categoria:"Caso externo"` (funciona porque `category` se compara con la columna editorial) o dejarlos fuera de la migración. Decisión D4.

### 7.3 Volumen actual del canal

En la comprobación del §3.6 el canal sirve **7 publicaciones**, pero acogidas, adoptados, apadrinamiento y casos externos están a 0. Activar `'real'` en esas secciones dejaría listados vacíos: `fallbackOnError: true` no cubre “vacío legítimo”. Decisión D5: con `'real'` y 0 resultados, ¿fake de respaldo o estado vacío honesto? Recomendado: **estado vacío** (con `showFakeBadge` el fake no debe tapar la realidad) y, para la transición, activar `'real'` solo en secciones con datos verificados.

---

## 8. Estados de borde

| Situación | Comportamiento |
|---|---|
| `'fake'` | Sin peticiones al canal; render idéntico al actual |
| `'real'` + `success` | Render + `meta.source='real'` |
| `'real'` + `warning` (`sheet_missing`) | Aviso “canal no disponible”; degradar a fake si `fallbackOnError` |
| `'real'` + `error` | Aviso + reintento; degradar a fake si `fallbackOnError` |
| `'real'` + 0 resultados | Estado vacío honesto (D5) |
| `'real'` + timeout / red / JSONP bloqueado por CSP | Igual que error; mensaje con causa (el adaptador conserva el motivo como `publico.js`) |
| `endpointBase` vacío con `'real'` | Degradar a fake + aviso |
| Detalle con `redirect` | `history.replaceState` y render de la ficha vigente |
| Detalle con `gone` | Vista de retirada, `noindex`, sin canonical ni JSON-LD |
| Detalle con `error` | 404 lógico con enlace al listado |
| Config ausente | Todo fake |

Overrides para previsualizar sin editar archivos: `?source=real|fake` y `?sourceSeccion=gatos:real` (solo desarrollo; no persistir en `localStorage`).

---

## 9. Decisiones a cerrar antes de implementar

| # | Decisión | Recomendación |
|---|---|---|
| D1 | Ubicación de la config: `js/data-source.js` vs JSON | **JS síncrono**, para que exista antes de cualquier petición |
| D2 | Apadrinamiento: opción A (flag público) o B (categoría/estado) | **B** si se quiere sección propia y filtrable; A si se busca el mínimo cambio backend |
| D3 | ¿Se reescriben las URLs del canal a `post.html?slug=`? | **Sí** mientras no haya prerender; `seo.canonical` se ignora si viene vacío |
| D4 | Casos externos | Publicarlos como `historia` con `categoria:"Caso externo"` |
| D5 | `'real'` con 0 resultados | Estado vacío honesto; activar solo con datos verificados |
| D6 | ¿Se consume `fields=card` en listados? | Sí (más ligero); no aporta `contentHtml`, que los listados no usan |
| D7 | ¿`q` y `status` en servidor o en cliente? | `q` en servidor; chips/orden en cliente sobre lo cargado |
| D8 | Transporte | `fetch` → JSONP; verificar en el dominio real si hay CORS antes de fijar `'jsonp'` |

---

## 10. Fases de implementación

### Fase 0 — Preparación ✅ (2026-11-24)
- [x] Cerrar D1–D8: D1 JS síncrono, D3 URLs reescritas, D4 casos externos como historia editorial, D5 estado vacío honesto, D6 `fields=card`, D7 `q` en servidor, D8 `fetch`→JSONP. **D2 (apadrinamiento) sigue abierta por el backend.**
- [x] Web App desplegado y accesible sin token; verificado en vivo contra el canal.
- [x] `?endpoint=taxonomias`, `publicaciones&pageSize=5`, `publicacion&slug=<real>` y `retiradas` comprobados en producción.
- [x] Inventario: 7 publicaciones reales (4 animales, 1 grupo, 1 evento, 1 historia).

### Fase 1 — Config + adaptador, sin cambios visibles ✅ (2026-11-21)
- [x] `js/data-source.js` (todo `'fake'`) cargado antes de `blog-api.js`/`main.js`.
- [x] `js/publicaciones-api.js` con fake + normalizador del envelope real (inactivo).
- [x] Migrar `initAdoptionListings` y `initChat` (elimina los dos `fetch` duplicados).
- [x] `HistoriasAPI` como fachada.
- [x] **Aceptación:** sitio idéntico, 0 peticiones al canal, consola limpia.

**Resultado:** `js/data-source.js` + `js/publicaciones-api.js` nuevos, `js/blog-api.js` como fachada, sin `fetch` directos en `js/main.js` y los dos scripts incluidos en las 19 páginas con `main.js` (y antes de `blog-api.js` en `historias.html`/`post.html`). Verificado con el JSON real: 23 posts, mismo orden, 0 diferencias de campo, 1 sola petición a `data/blog-posts.json` y 0 al canal. `getPostBySlug` y `fallbackImage` conservan su contrato.

### Fase 2 — Secciones fijas → dinámicas ✅ (2026-11-23)
- [x] Secciones con contenedores `[data-adoption-list]`: `adopciones/` (Acogida, Adoptados, Caso externo), `gatos-en-adopcion/`, `perros-en-adopcion/`, `otros-en-adopcion/` e `historias/`. `acogidas.html`, `adoptados.html` y `casos-externos.html` quedan como redirecciones a `adopciones/`.
- [x] Paridad en `'fake'` verificada antes de retirar las tarjetas fijas (23 posts, mismo orden).

### Fase 3 — Encendido progresivo ✅ (2026-11-23)
Orden ejecutado (equivalente al propuesto): `historias` → `gatos` → `perros` → `adoptados` → `acogidas` → `home`; además `otros`, `grupos`, `eventos` y `detalle`. `js/data-source.js` deja en `'real'` todas las secciones con datos y solo `apadrinamiento` en `'fake'`. El modo estático (`staticMode: true`) lee `data/publicaciones.json` y usa el canal como respaldo.

### Fase 4 — Casos externos (según D4) y apadrinamiento (según D2)
- [x] Casos externos: publicados como `historia` con categoría editorial `Caso externo` y activados en `adopciones/`.
- [ ] Apadrinamiento: cambio backend (A o B) → front → activación. **No se puede adelantar:** el canal no expone `apadrinable` y no hay `type`/`category`/`status` de apadrinamiento.

### Fase 5 — Cierre ✅ (2026-11-24)
- [x] `ENDPOINT_URL` retirado; ya no quedan `fetch` directos a `data/blog-posts.json` en `js/main.js` (todo pasa por `publicaciones-api.js`).
- [x] Tarjetas fijas retiradas de las páginas ya dinámicas.
- [x] SEO de fichas resuelto en build: `scripts/prerender.js` genera fichas, lápidas 410, páginas de paso, `sitemap.xml` y `robots.txt`; el deploy lo ejecuta tras `exportar-datos.js`.
- [x] `README.md` documenta los datos estáticos y cómo cambiar de fuente (`data-source.js`).

---

## 11. Verificación por sección

1. `'fake'`: contenido idéntico al actual y **cero** peticiones al canal (Network).
2. `'real'`: una sola petición (cacheada), `status:"success"`, `pagination.total` coherente con `taxonomias`/gestor.
3. Filtros de UI funcionan (búsqueda, chips, orden; recordar que el canal ya pone urgentes primero).
4. `post.html` de un slug real: datos, iconos, galería/carrusel, vídeo(s), CTA con animal correcto, `document.title`.
5. `redirect`: slug histórico muestra la ficha vigente y actualiza la URL.
6. `gone`: vista de retirada sin canonical ni JSON-LD.
7. Error/timeout: mensaje + reintento, sin pantalla en blanco; consola con la causa.
8. Ningún dato fake colándose en una sección `'real'` (salvo `fallbackOnError`, que debe quedar registrado).
9. Móvil/escritorio: galería y vídeo siguen responsive.

---

## 12. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | CORS: `ContentService` no permite cabeceras | JSONP como camino real; verificar en el dominio antes de fijar transporte |
| R2 | CSP del sitio bloquea `script.google.com` | Añadir el origen a `script-src` si se usa JSONP |
| R3 | Cuotas/tiempo de Apps Script (caché 60 s, listas ≤90 KB) | `pageSize` ≤ 50, `fields=card`, caché en cliente, no pedir todo el catálogo |
| R4 | Categorías derivadas y dispares (`Acogidas` plural; no hay `Caso externo` ni `Apadrinamiento`) | Consumir `taxonomias`; no hardcodear etiquetas en las secciones nuevas |
| R5 | Vocabulario de estado distinto del fake (`urgente` no es estado) | Chips de estado desde `status`, urgencia desde `urgent` |
| R6 | Slugs fake compartidos que no existan en el canal | Verificar slug por slug antes de activar; decidir 404 vs puente |
| R7 | `canonical` vacío en GitHub Pages y rutas `/animales/<slug>` inexistentes en `main` | Reescribir a `post.html?slug=`; no emitir canonical si viene vacío |
| R8 | El canal hoy tiene muy pocas publicaciones | Activar por sección solo con datos; estado vacío honesto |
| R9 | SEO de fichas en cliente | Prerender/build (§A de `TRANSFERIR_A_MAIN.md`), fuera del alcance de esta variable |

---

## 13. Resumen

- El contrato **real** es `?endpoint=publicaciones|publicacion|…` sobre el Web App de Apps Script, con envelope `{status, data, pagination, filters, applied}` y JSONP para evitar CORS.
- **Una variable** (`window.NEBAK_DATA_SOURCE`) con `defaultMode` + `mode` por sección (`fake` | `real`) permite migrar **sección por sección** y revertir todo con una línea.
- **Un adaptador fino** convierte el payload real (`contentHtml`, `icons/gallery/videos`, `publishedAt`) al formato que ya consumen los renderizadores (`content`, `publication`, `date`).
- **Prerrequisitos:** unificar los tres accesos actuales, convertir acogidas/adoptados/casos externos a dinámicos, y aceptar que **apadrinamiento y casos externos no existen todavía en el canal** (requieren cambio backend/editorial antes de poder encenderse).
