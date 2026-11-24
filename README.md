# Grupo Nebak — sitio web (versión publicada)

Este repositorio contiene la **versión publicada** del sitio web de Grupo Nebak, desplegada mediante GitHub Pages.

- **URL pública:** https://gn-admin.github.io/main/
- **Origen:** contenido transferido y adaptado desde la iteración de desarrollo previa para su publicación como sitio autónomo en este repositorio.
- **Despliegue:** `.github/workflows/pages.yml` publica la raíz del repositorio en GitHub Pages (push a `main` o ejecución manual).

## Estructura principal
- `*.html`: páginas del sitio
- `css/`, `js/`: estilos y scripts
- `assets/`: imágenes, fuentes y vídeos
- `data/`: datos JSON consumidos por el sitio (p. ej. `data/blog-posts.json`)
- `docs/`: documentación técnica del sitio

## Datos estáticos

- `scripts/exportar-datos.js` descarga el canal público y escribe `data/publicaciones.json`, `data/retiradas.json`, `data/redirects.json`, `data/taxonomias.json` y `data/config-publica.json`.
- El deploy lo ejecuta antes del prerender (`--soft`). El cliente lee esos JSON y deja GAS como fallback.
- Uso manual: `node scripts/exportar-datos.js --dry` o `node scripts/exportar-datos.js --soft`.

## Notas
- Rutas relativas a la raíz del sitio (compatibles con el despliegue en `/main/`).
- Los datos de publicaciones/fichas se cargan actualmente desde JSON local; la evolución a endpoint público se documenta en `docs/`.

## Documentación

- `docs/DOCUMENTACION.md`: documentación técnica consolidada.
- `docs/analisis-endpoint-seo-formularios-cookies-main.md`: análisis detallado.
- `docs/auditoria-chat-formularios.md`: auditoría del asistente, formularios y búsqueda.
- `PENDIENTES.md`: checklist de lo que falta para dejar `main` al 100%.
