# Pendientes para dejar `main` al 100%

## Estado actual (2026-11-23)

- Repositorio `main`: sitio publicado en GitHub Pages.
- Documentación técnica consolidada en `docs/DOCUMENTACION.md`.
- Análisis detallado en `docs/analisis-endpoint-seo-formularios-cookies-main.md`.
- Gate P0 del gestor ejecutado dos veces en producción: **28 PASS · 0 WARN · 1 SKIP · 0 FAIL**.
- Evidencias locales del gestor: `test-results/contract-after.json`, `test-results/contract-after-2.json`, `test-results/columnas.json`.
- Fixture temporal **retirado**: `caso-externo-gate` ya no aparece en el listado público; queda lápida 410 `noindex`, fuera del sitemap.

## Gate de contrato: cerrado

1. [x] Token de admin de prueba usado solo en la ejecución; no guardado en el repositorio.
2. [x] `EXPECTED_BACKEND_VERSION=2026-11-15.7`.
3. [x] `test-results/columnas.json` verificado por API: `WebPublicaciones` por round-trip de escritura/lectura y `Animales` por cabeceras reales tras añadir las columnas aditivas.
4. [x] Historia `caso-externo-gate` publicada con categoría exacta `Caso externo`.
5. [x] `CONTRACT_RETIRED_SLUG=demo-lua`.
6. [x] `P0-09b` aceptado como `SKIP` en demo; se valida al definir el dominio final.
7. [x] Gate ejecutado dos veces sin WARN.
8. [x] UI de producción a 360/768/1280 sin overflow; roles `consulta` y revocado con 403 lógico.

## Pendiente real

1. [x] Fixture `caso-externo-gate` retirado y actualizado en `main` (lápida 410, `noindex`, fuera del sitemap).
2. [x] Media/Drive y ciclo publicar/ocultar/retirar/restaurar verificados en producción; el primer cambio disparó deploy y el resto se agrupó en cola.
3. [x] Datos estáticos de `main` regenerados con el canal público (8 publicaciones, incluida `caso-externo-gate`).
4. [ ] Consumir el puente R1 (`publicaciones&status=en_acogida`) sin cambiar el contrato público.
5. [ ] Mantener `scripts/exportar-datos.js` con `--soft` en el deploy.
6. [ ] Verificar que el cliente lea JSON local y use GAS solo como fallback.
7. [ ] Revisar caché/SW y TTL para no saturar GitHub Pages ni GAS.
8. [ ] Revisar sitemap/SEO cuando se defina el dominio final.

## Decisión R1 ya fijada

- `main` usará `?endpoint=publicaciones&status=en_acogida` como puente.
- `animales-publicos` mantiene `type=animal`.
- `groups=1` queda como mejora futura, no bloquea el cierre.

## Notas de seguridad

- No guardar tokens, contraseñas ni IDs sensibles en el repositorio.
- `.env` y archivos equivalentes deben permanecer ignorados.
- Publicar o retirar una ficha de prueba puede disparar deploy; hacerlo solo cuando se vaya a ejecutar el gate.
