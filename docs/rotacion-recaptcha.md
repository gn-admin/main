# Runbook: rotación de la clave de reCAPTCHA

> **Contexto:** la secret key de reCAPTCHA quedó guardada por error en el campo `siteKey` de `js/forms-config.js` y se publicó en el commit `12b855e` del repositorio público `gn-admin/main`. El archivo actual ya está corregido (`3abb2e7`), pero el valor sigue en el historial.
>
> **Decisión:** no reescribir el historial. La remediación correcta es rotar la credencial: crear una clave nueva, ponerla en producción y borrar la antigua. Al borrar la clave, su secret deja de ser válida.

---

## 1. Por qué no reescribir el historial

- El repositorio es público: el commit puede estar clonado, cacheado o indexado por terceros. Un `git filter-repo`/BFG + `force-push` no garantiza que el valor desaparezca.
- Requiere coordinar a todo el mundo, rompe clones y deja el valor en reflogs, forks y cachés.
- Google puede marcar la clave como filtrada y revocarla, así que hay que asumir que el valor es público.

**Regla general:** una credencial expuesta se rota, no se intenta borrar. Si se decide aplazar, la excepción debe quedar documentada y con fecha de revisión (ver §2).

## 2. Estado actual (23/11/2026)

| Elemento | Valor / estado |
|---|---|
| Proyecto Cloud | `grupo-nebak` |
| Site key en producción | `6Lf_hiEuAAAAAIPhzqJgNuXEJmO7Rghx6ZTMduI5` (v2) |
| Dominios autorizados | `gn-admin.github.io` funciona; `localhost` y `127.0.0.1` **no** están autorizados |
| Secret en EmailJS | Pegada en plantilla → Settings |
| Service ID de EmailJS | `service_k6jkxaq` (validado el 23/11/2026 con un envío real) |
| Template ID | `tpl_contacto_general` (validado el 23/11/2026: EmailJS respondió 200 en dos envíos reales) |

El error de dominio local se comprobó abriendo el iframe de reCAPTCHA: *«El host local no está en la lista de dominios admitidos para esta clave del sitio web»*. En `gn-admin.github.io` el reto se carga sin ese error.

### Cadencia y decisión actual

- **Las claves de reCAPTCHA no caducan** y Google no impone una rotación periódica. La frecuencia es una decisión del propietario del proyecto.
- **Criterio adoptado:** revisión **anual** y rotación **por evento**: filtración, salida de alguien con acceso, abuso sospechoso del formulario, cambio de dominio o migración a v3.
- **Decisión (23/11/2026): no rotar ahora.** La secret filtrada no permite enviar correos ni fabricar tokens (EmailJS guarda su copia y la validación la hace Google); el riesgo aceptado es que alguien llame a `siteverify` con ella o que Google revoque la clave. Se revisa en la revisión anual o antes si hay un incidente.
- **No es una tarea abierta ni un bloqueante del formulario.** Es una decisión manual que se toma cuando toca; el procedimiento queda listo por si se elige ejecutarla.
- **Qué es manual y qué no:** crear la clave y copiar su legacy secret (consola de Google) y pegarla en EmailJS → Settings son pasos manuales; actualizar `siteKey`, versiones, tests y despliegue se puede automatizar con un script si algún día se decide rotar.

## 3. Antes de empezar

De dónde sale cada valor: tabla en [`docs/formularios-recaptcha-emailjs.md`](formularios-recaptcha-emailjs.md#dónde-sale-cada-credencial).

- Acceso a Google Cloud → proyecto `grupo-nebak` con rol **reCAPTCHA Enterprise Admin**.
- Acceso a EmailJS → plantilla `tpl_contacto_general` → **Settings**.
- Ventana de 15–30 minutos (los cambios de dominio pueden tardar hasta 30 min en propagarse).
- No borrar la clave antigua hasta que la nueva haya enviado un correo real.

## 4. Opciones

### A. Clave v2 Checkbox (recomendada si se quiere seguir con reCAPTCHA v2)

Google ya no permite crear claves **v2 Invisible** desde Cloud; solo **Checkbox (v2)** o **v3**. Nuestro transporte ejecuta un widget invisible, así que este cambio exige mostrar el checkbox y adaptar `recaptchaToken()` antes de desplegar. Es un cambio pequeño pero visible en la UI.

### B. Clave v3 + verificación en Apps Script (plan a medio plazo)

EmailJS solo valida v2, así que v3 obliga a verificar el token en el backend (`forms/submit` en Apps Script) y a sustituir EmailJS en ese camino. Más trabajo, pero elimina la dependencia de EmailJS y el límite de 2 plantillas.

### C. No rotar y aceptar el riesgo (decisión actual)

La secret filtrada no permite enviar correos (EmailJS guarda su copia) ni fabricar tokens, pero sí llamar a `siteverify` y puede ser revocada por Google. Es la opción elegida el 23/11/2026: queda documentada aquí y se revisa cada año o ante incidente, sin bloquear el formulario.

## 5. Procedimiento A: rotar a una clave nueva (sin tocar el historial)

### Paso 1 — Crear la clave nueva

1. Cloud → **reCAPTCHA** → proyecto `grupo-nebak` → **Create key**.
2. Application type: **Website**.
3. Key type: **Challenge (v2)** → **Checkbox**.
4. Dominios: `gn-admin.github.io`, `localhost`, `127.0.0.1`.
5. **Create** y copiar el **Key ID** (site key nueva).

### Paso 2 — Obtener la legacy secret

1. Abrir la clave → pestaña **Integration** → **Use legacy key**.
2. Copiar la **legacy secret key**. No debe pegarse en el repo, en issues ni en el chat.

### Paso 3 — Actualizar el código (rama, no directo a main)

1. Cambiar `recaptcha.siteKey` en `js/forms-config.js`.
2. Adaptar `recaptchaToken()` en `js/forms-transport.js` al widget Checkbox (render visible en el formulario y lectura del token al enviar).
3. Subir `forms-config.js?v=4` (y `forms-transport.js?v=4`) en las páginas.
4. Ejecutar `node tests/forms-transport.test.js` y `node tests/plantillas-emailjs.test.js`.
5. Probar en local: requiere que `localhost` esté en la lista de dominios y que el service ID de EmailJS sea correcto.

### Paso 4 — Actualizar EmailJS

1. Plantilla `tpl_contacto_general` → **Settings**.
2. Pegar la secret nueva en el campo de reCAPTCHA v2.
3. Guardar.

### Paso 5 — Desplegar y validar

1. Desplegar la rama y abrir `https://gn-admin.github.io/main/contacto/`.
2. Enviar un formulario real de prueba.
3. Comprobar en el correo: asunto, Reply-To, campos y que no cae en spam.
4. Revisar en EmailJS → **History** que el envío aparece como entregado.

### Paso 6 — Revocar la clave antigua

Solo cuando el paso 5 haya funcionado:

1. Cloud → reCAPTCHA → clave antigua (`6Lf_hiEuAAAAAIPhzqJgNuXEJmO7Rghx6ZTMduI5`) → **Delete key**.
2. Confirmar que los formularios siguen enviando (la clave nueva no depende de la vieja).

Esto invalida la secret filtrada sin reescribir nada.

### Paso 7 — Cerrar el incidente

- Anotar en este documento la fecha de rotación y el ID de la clave nueva.
- Revisar GitHub → **Settings → Code security** por si hay alertas de secret scanning.
- Opcional: añadir una comprobación al test de contrato que falle si `siteKey` tiene pinta de secret (`longitud`/prefijo), para evitar repetir el cruce.

## 6. Rollback

Si la clave nueva falla:

1. Restaurar `recaptcha.siteKey` anterior y su versión (`v=3`) en `js/forms-config.js`.
2. Restaurar la secret anterior en EmailJS.
3. Desplegar.
4. **No** borrar la clave nueva hasta confirmar el rollback; después, borrarla.

## 7. Qué revisar en el correo de prueba

- **Para:** `nebakadopciones@gmail.com`.
- **Asunto:** `[Web] {concepto} — {animal} · {nombre}`; en contacto general, `[Web] Contacto general · Prueba Codebuff`.
- **Reply-To:** el email introducido en el formulario.
- **Cabecera:** tipo de formulario (`Contacto general`).
- **Filas:** nombre, email, teléfono, dirección y asunto (las vacías no deben aparecer).
- **Mensaje:** en un bloque con los saltos de línea conservados.
- **Pie:** URL de la página, fecha y `form_type`.
- **Spam:** si cae ahí, marcar como «no es spam» y revisar la configuración de Gmail.
- **EmailJS → History:** el envío debe aparecer (el plan gratuito guarda 7 días).

## 8. No hacer

- No poner la secret en `js/forms-config.js`, tests, documentación ni capturas.
- No ejecutar `filter-repo`/BFG para «limpiar» el commit.
- No borrar la clave antigua antes de que la nueva envíe correctamente.
- No desactivar la verificación de reCAPTCHA de la plantilla para «probar»: enmascara el problema.

## 9. Referencias

- Claves y legacy secret: <https://docs.cloud.google.com/recaptcha/docs/reconcile-legacy-terminology>
- Crear claves: <https://docs.cloud.google.com/recaptcha/docs/create-key-website>
- Verificación con EmailJS: <https://www.emailjs.com/docs/user-guide/adding-captcha-verification/>
- Configuración del proyecto: [`docs/formularios-recaptcha-emailjs.md`](formularios-recaptcha-emailjs.md)
