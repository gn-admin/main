# Pendientes para dejar `main` al 100%

## Estado actual

- Repositorio `main`: sitio publicado en GitHub Pages.
- Documentación técnica consolidada en `docs/DOCUMENTACION.md`.
- Análisis detallado en `docs/analisis-endpoint-seo-formularios-cookies-main.md`.
- El gestor (`admin-dashboard`) ya tiene el gate de contrato preparado y testeado.

## Pendientes del gate de contrato (gestor)

1. [ ] Configurar `API_TOKEN` o `CONTRACT_TOKEN` en el entorno (no en el repo).
2. [ ] Configurar `EXPECTED_BACKEND_VERSION`.
3. [ ] Generar `test-results/columnas.json` con `diagnosticoColumnasWeb`.
4. [ ] Publicar una historia con categoría exacta `Caso externo`.
5. [ ] Elegir `CONTRACT_RETIRED_SLUG` (recomendado: `demo-lua`).
6. [ ] Decidir si `P0-09b` se acepta como `SKIP` en demo o si se configura el dominio de `main`.
7. [ ] Ejecutar el gate read-only dos veces (caché fría y tras deploy de estática) sin WARN.
8. [ ] Completar el P0 manual (UI, responsive, media, deploy, caché, accesibilidad) y guardar evidencia.

Comando exacto del gate:

```bash
mkdir -p test-results
npm run smoke:contract -- \
  --expected-version "<VERSION>" \
  --retired-slug "demo-lua" \
  --columns-report test-results/columnas.json \
  --json > test-results/contract-after.json
```

Regla: no hay PASS con WARN. El único SKIP admitido es `P0-09b` en demo.

## Decisión R1 ya fijada

- `main` usará `?endpoint=publicaciones&status=en_acogida` como puente.
- `animales-publicos` mantiene `type=animal`.
- `groups=1` queda como mejora futura, no bloquea el cierre.

## Pendientes de integración en `main`

1. [ ] Consumir el puente R1 desde `main` sin cambiar el contrato público.
2. [ ] Mantener `scripts/exportar-datos.js` con `--soft` en el deploy.
3. [ ] Verificar que el cliente lea JSON local y use GAS solo como fallback.
4. [ ] Revisar caché/SW y TTL para no saturar GitHub Pages ni GAS.
5. [ ] Actualizar datos estáticos de `main` tras pasar el gate.
6. [ ] Revisar sitemap/SEO cuando se defina el dominio final.

## Notas de seguridad

- No guardar tokens, contraseñas ni IDs sensibles en el repositorio.
- `.env` y archivos equivalentes deben permanecer ignorados.
- Publicar o retirar una ficha de prueba puede disparar deploy; hacerlo solo cuando se vaya a ejecutar el gate.
