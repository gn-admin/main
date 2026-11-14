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

## Notas
- Rutas relativas a la raíz del sitio (compatibles con el despliegue en `/main/`).
- Los datos de publicaciones/fichas se cargan actualmente desde JSON local; la evolución a endpoint público se documenta en `docs/`.
