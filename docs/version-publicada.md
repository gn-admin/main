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
