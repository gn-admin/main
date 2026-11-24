# Pendientes para dejar `main` al 100% — todas las fases cerradas

> Última actualización: 2026-11-24. Todas las fases del port de `main` están implementadas y verificadas con fixtures locales y en producción. El despliegue por Actions está operativo (build_type=workflow, sitemap/robots/fichas publicados). Queda solo el despliegue operativo del lote `.gs` en el backend (ver § Pendiente operativo) y la activación de apadrinamiento (decisión D2).

1. [x] Fixture `caso-externo-gate` retirado y actualizado en `main` (lápida 410, `noindex`, fuera del sitemap).
2. [x] Media/Drive y ciclo publicar/ocultar/retirar/restaurar verificados en producción; el primer cambio disparó deploy y el resto se agrupó en cola.
3. [x] Datos estáticos de `main` regenerados con el canal público (8 publicaciones, incluida `caso-externo-gate`).
4. [x] Consumir el puente R1 (`publicaciones&status=en_acogida`) sin cambiar el contrato público. `acogidas` ahora consulta `publicaciones&status=en_acogida` (incluye `animal_grupo` sin duplicar); `animales-publicos` conserva `type=animal`. Test añadido en `tests/publicaciones-api.test.js`.
5. [x] Mantener `scripts/exportar-datos.js` con `--soft` en el deploy. El workflow `.github/workflows/pages.yml` ya ejecuta `node scripts/exportar-datos.js --soft` (línea 39) antes del prerender. Verificado con `--dry --fixture`: 7 publicaciones, sin errores.
6. [x] Verificar que el cliente lea JSON local y use GAS solo como fallback. `js/data-source.js` tiene `staticMode: true`; `publicaciones-api.js` lee `data/publicaciones.json` primero (`loadStatic`) y cae al canal solo si falla (`loadRealSection`). Prerender y check-links verificados con fixtures.
7. [x] Revisar caché/SW y TTL para no saturar GitHub Pages ni GAS. `main` no tiene service worker propio; el cliente usa `cache: 'no-store'` y el canal de GAS gestiona su propia caché (~60 s con invalidación por versión al guardar). No hay SW que invalidar.
8. [x] Revisar sitemap/SEO con el dominio final `https://gn-admin.github.io/main`. Verificado el 2026-11-24 en vivo: `sitemap.xml` (15 URLs: 8 fijas + 7 fichas indexables), `robots.txt` apuntando a él, fichas con canonical único, OG/Twitter y JSON-LD, lápidas `noindex,nofollow` fuera del sitemap. Bloqueo anterior (Pages en modo legacy) corregido: `build_type` cambiado a `workflow` y artefacto fijado a `upload-pages-artifact@v3` + `enablement: true`. Deploy `pages.yml` en verde y sitio servido por Actions.

## Pendiente operativo (backend GAS, fuera de este repo)

- Subir `WebPublicaciones.gs` + `Code.gs` a GAS (lote del canal ya desplegado en admin-dashboard).
- Configurar propiedades del script: `GITHUB_DEPLOY_REPO_MAIN=gn-admin/main`, `GITHUB_DEPLOY_WORKFLOW_MAIN=pages.yml`.
- Verificar disparo E2E: publicar en el gestor → run de `pages.yml` en `main` en < 5 min.
- Confirmar que `main` es la única canónica indexable (sitemap de `main` sin URLs de `admin-dashboard`).

## Decisión R1 ya fijada

- `main` usará `?endpoint=publicaciones&status=en_acogida` como puente.
- `animales-publicos` mantiene `type=animal`.
- `groups=1` queda como mejora futura, no bloquea el cierre.

## Notas de seguridad

- No guardar tokens, contraseñas ni IDs sensibles en el repositorio.
- `.env` y archivos equivalentes deben permanecer ignorados.
- Publicar o retirar una ficha de prueba puede disparar deploy; hacerlo solo cuando se vaya a ejecutar el gate.
