# Formularios de la web: inventario, reCAPTCHA y plantillas EmailJS

> **Estado:** implementado en cliente, **inactivo** hasta rellenar `js/forms-config.js` (`enabled: false`).
> Con la configuración vacía los formularios siguen respondiendo en modo simulado, sin peticiones externas.
> Fecha: 2026-11-23.

---

## 1. Qué se ha implementado

| Archivo | Función |
|---|---|
| `js/forms-config.js` | Claves de EmailJS y reCAPTCHA, plantilla por tipo y buzón de destino. |
| `js/forms-transport.js` | Normaliza el payload de **cualquier** formulario, obtiene el token de reCAPTCHA y lo envía por EmailJS. Si no hay configuración, devuelve `{simulated: true}`. |
| `js/main.js` | Los tres caminos de envío (formularios estáticos, modal `NebakForms` y formularios del chat) pasan por el transporte y muestran error si el envío falla. También normaliza alias antiguos (`adopt`, `acoge`, `vol`) a los tipos reales. |
| `js/busqueda-publicaciones.js` | Búsqueda del chat por campos y sinónimos (fichas, grupos, eventos e historias), con coherencia de especie. |
| `*.html` (17 páginas) | Cargan `forms-config.js` y `forms-transport.js` antes de `main.js`. |

**Modo simulado (hoy):** `enabled: false` → no se carga ningún SDK ni se hace ninguna petición; el mensaje de confirmación y el toast son los mismos que antes.
**Modo real:** `enabled: true` + claves completas → reCAPTCHA (si hay site key) + `emailjs.send()`.

---

## 2. Inventario de formularios

Hay **7 tipos canónicos** (`form_type`) repartidos en 3 formularios estáticos, 7 tipos del modal global y 4 flujos del chat.

### 2.1 Formularios estáticos (submit directo en página)

| # | Página | `form_type` | Concepto | Campos |
|---|---|---|---|---|
| 1 | `contacto/index.html` | `contacto-general` | Contacto general | `nombre*`, `email*`, `telefono`, `direccion`, `asunto`, `mensaje*` |
| 2 | `acoge/index.html` | `acogida` | Solicitud de acogida | `nombre*`, `email*`, `telefono`, `tipo_acogida` (select), `duracion`, `convivencia`, `mensaje*` |
| 3 | `hazte-socio/index.html` | `voluntariado` | Voluntariado | `nombre*`, `email*`, `telefono`, `tipo_voluntariado*` (select), `disponibilidad`, `zona`, `mensaje*` |

### 2.2 Modal global `NebakForms` (`data-open-form`)

| # | `form_type` | Título | Campos específicos | Se abre desde |
|---|---|---|---|---|
| 4 | `contacto-general` | Contacto general | `asunto`, `mensaje*` | Home («Escríbenos»), `adopciones` (consulta), `protocolo`, chat |
| 5 | `voluntariado` | Voluntariado | `tipo_voluntariado*`, `disponibilidad`, `zona`, `mensaje*` | Chat, CTAs de colaboración |
| 6 | `donaciones` | Consulta sobre donaciones | `tipo_donacion*`, `mensaje*` | `donaciones` (dudas, material, Bizum) |
| 7 | `acogida` | Solicitud de acogida | `tipo_acogida`, `duracion`, `convivencia`, `mensaje*` | Fichas de acogida, chat |
| 8 | `adopcion-animal` | Consulta de adopción | `animal` (prelleno), `mensaje*` | Fichas y posts con CTA de adopción (`js/post-template.js`), chat |
| 9 | `consulta-animal` | Consulta sobre un caso | `animal` (prelleno), `mensaje*` | `gatos-en-adopcion`, `perros-en-adopcion`, `otros-en-adopcion`, casos externos |
| 10 | `socio` | Hacerme socio/a | `modalidad_socio*`, `mensaje*` | `donaciones` |

Los CTAs de ficha añaden `data-animal` (título) y `data-animal-slug` al payload.

### 2.3 Chat (formularios inline)

| Flujo | `form_type` | Campos | Atajo |
|---|---|---|---|
| Adopción | `adopcion-animal` | `nombre*`, `email*`, `telefono`, `animal`, `mensaje` | «Adoptar», «Solicitud de adopción» |
| Acogida | `acogida` | `nombre*`, `email*`, `telefono`, `duracion`, `mensaje` | «Acoger», «Solicitud de acogida» |
| Voluntariado | `voluntariado` | `nombre*`, `email*`, `telefono`, `tipo_voluntariado`, `mensaje` | «Voluntariado» |
| Contacto | `contacto-general` | `nombre*`, `email*`, `asunto`, `mensaje*` | «Contacto», dudas de donación |

> Los cuatro escriben en el **mismo** `form_type` que el modal/estático, así que no hacen falta plantillas adicionales.

---

## 3. Payload que recibe EmailJS

`NebakFormsTransport` construye un objeto plano; cada clave es una variable `{{clave}}` disponible en la plantilla.

**Comunes (siempre):**

| Variable | Contenido |
|---|---|
| `form_type`, `form_type_label`, `concepto` | Tipo canónico y su etiqueta legible |
| `nombre`, `email`, `telefono`, `direccion`, `asunto`, `mensaje` | Datos del formulario |
| `animal`, `animal_slug` | Ficha de origen, si el CTA la aporta |
| `page_url`, `origen_pagina` | URL y `<title>` de la página que envió |
| `submitted_at`, `idioma`, `user_agent` | Metadatos del envío |
| `subject`, `to_email`, `reply_to` | Asunto compuesto, buzón y reply-to (el email del usuario) |
| `detalle` | Resto de campos en texto (`Tipo de acogida: Gato adulto`), para plantillas genéricas |
| `recaptcha_action`, `recaptcha_token`, `g-recaptcha-response` | Token de reCAPTCHA (ver §4) |

**Específicos:** `tipo_acogida`, `duracion`, `convivencia`, `tipo_voluntariado`, `disponibilidad`, `zona`, `tipo_donacion`, `modalidad_socio`.

Asunto generado: `[Web] {concepto} — {animal} · {nombre}` (las partes vacías se omiten).

---

## 4. reCAPTCHA

### 4.1 Versión recomendada: v2 invisible

EmailJS **solo verifica reCAPTCHA v2**: en la plantilla, *Settings → Enable reCAPTCHA V2 verification*, y el token debe viajar en el parámetro `g-recaptcha-response`. Es la única combinación que protege de verdad sin backend propio.

Configuración:

1. <https://www.google.com/recaptcha/admin> → registrar sitio, tipo **v2 → Invisible**.
2. Dominios: `gn-admin.github.io` y `localhost` (pruebas).
3. Pegar la **site key** en `js/forms-config.js` → `recaptcha.siteKey`. El *secret* **no** se usa con EmailJS.
4. El transporte renderiza el widget invisible en cada envío, ejecuta y envía el token.

Acción por formulario (`recaptcha.actionPrefix` + tipo): `form_contacto_general`, `form_adopcion_animal`, `form_consulta_animal`, `form_acogida`, `form_voluntariado`, `form_socio`, `form_donaciones`.

### 4.2 reCAPTCHA v3 (solo si se migra a backend)

v3 devuelve una puntuación que **debe verificarse en servidor**; con EmailJS no se verifica, así que un token v3 en cliente no aporta protección real. Si más adelante se usa `forms-submit` en Apps Script:

- `recaptcha.version: 'v3'` en la config (el transporte ya envía `recaptcha_token` + `recaptcha_action`).
- El `.gs` valida con `RECAPTCHA_SECRET` en Script Properties y aplica `minScore` (0,5 por defecto).
- Mientras tanto, `minScore` queda documentado pero no se evalúa en cliente.

### 4.3 RGPD

El badge de reCAPTCHA y las transferencias a Google y EmailJS deben figurar en la política de privacidad/cookies antes de activar el envío real. No hay consentimiento específico para ello: se apoya en el interés legítimo de seguridad, tal como se documente.

---

## 5. Plantillas EmailJS

### 5.1 Enfoque: una plantilla única

El plan gratuito de EmailJS permite **2 plantillas** (6 en el de 9 $/mes), así que no se usan 7. `js/forms-transport.js` compone ya un asunto único (`[Web] {concepto} — {animal} · {nombre}`) y un campo `detalle` con los datos propios de cada tipo; `templateId()` cae en `defaultTemplate` cuando `templates[form_type]` está vacío.

| Plantilla | `form_type` que la usan | Asunto |
|---|---|---|
| una sola, vía `defaultTemplate` (ID real `template_...`) | los 7 | `{{subject}}` |

En la plantilla: **To Email** = `{{to_email}}`, **Reply To** = `{{reply_to}}`, **Subject** = `{{subject}}`. La segunda plantilla del plan gratuito queda libre (por ejemplo, para una auto-respuesta).

Con reCAPTCHA v2 hay dos claves: la **site key** (pública, en `js/forms-config.js` → `recaptcha.siteKey`) y la **secret key** (privada, solo en EmailJS → plantilla → *Settings*). EmailJS la necesita para validar el token `g-recaptcha-response` que envía el transporte.

Si algún día se necesitan formatos o destinatarios distintos por tipo, basta con rellenar `templates[form_type]` con otro ID: el transporte prioriza esa entrada sobre `defaultTemplate`.

### 5.2 Cuerpo

El asunto y el HTML exactos, listos para pegar, están en [`docs/plantillas-emailjs.md`](plantillas-emailjs.md). La plantilla muestra los campos comunes, oculta con `{{#campo}}` los que llegan vacíos y pinta `{{detalle}}` con los específicos del tipo (`Tipo de acogida`, `Zona`, `Modalidad`, etc.), que el transporte envía ya con etiqueta y valor.

### 5.3 Envío de prueba desde EmailJS

La plantilla permite *Test it* con valores de ejemplo: usar `{{nombre}} = Ana`, `{{email}} = la cuenta de pruebas`, `{{mensaje}} = Prueba` y comprobar que el correo llega con Reply-To correcto.

---

## 6. Puesta en marcha (checklist)

### Dónde sale cada credencial

| Credencial | Dónde se obtiene | Dónde se usa |
|---|---|---|
| EmailJS **public key** | EmailJS → **Account** → *General / API Keys* | `emailjs.publicKey`; es pública y viaja al navegador |
| EmailJS **service ID** | EmailJS → **Email Services** → servicio de Gmail conectado | `emailjs.serviceId` (`service_k6jkxaq`) |
| EmailJS **template ID** | EmailJS → **Email Templates** → abrir la plantilla | `emailjs.defaultTemplate` (`tpl_contacto_general`) |
| reCAPTCHA **site key** | Cloud → **reCAPTCHA** (`grupo-nebak`) → clave → **Key ID** | `recaptcha.siteKey`; es pública |
| reCAPTCHA **secret** | Cloud → clave → pestaña **Integration** → **Use legacy key** | Solo EmailJS → plantilla → **Settings**; nunca en el repo |
| **Buzón destino** | — | `mail.toEmail` y *To Email* de la plantilla (`{{to_email}}`) |

La secret no se copia a `js/forms-config.js`, tests, documentación ni capturas. Si alguna vez se filtra, el procedimiento está en [`docs/rotacion-recaptcha.md`](rotacion-recaptcha.md).

1. EmailJS → **Email Services** → conectar Gmail (`nebakadopciones@gmail.com`) y copiar el `serviceId`.
2. EmailJS → **Email Templates** → crear **una** plantilla con el asunto y HTML de [`docs/plantillas-emailjs.md`](plantillas-emailjs.md) y copiar el ID automático (`template_xxxxxxx`).
3. En la plantilla → *Settings* → marcar **Enable reCAPTCHA V2 verification** y pegar la **secret key** de reCAPTCHA (la site key va en `js/forms-config.js`; la secret no debe estar en el repo).
4. EmailJS → **Account** → copiar la `publicKey` (no la private key).
5. reCAPTCHA Admin → crear la clave v2 invisible y copiar la site key.
6. Rellenar `js/forms-config.js`:

```js
window.NEBAK_FORMS_CONFIG = {
  enabled: true,
  emailjs: {
    publicKey: 'kvMkVgkUCHek0kvc7',
    serviceId: 'service_...',
    templates: {},
    defaultTemplate: 'template_xxxxxxx' // ID real del panel
  },
  recaptcha: { version: 'v2-invisible', siteKey: '...', actionPrefix: 'form_', minScore: 0.5 },
  mail: { toEmail: 'nebakadopciones@gmail.com' }
};
```

7. Probar en local (`http://127.0.0.1:8137`) un envío de cada tipo y revisar:
   - correo recibido, asunto, Reply-To y campos;
   - `console` sin errores de reCAPTCHA;
   - que el formulario muestra la confirmación y se vacía.
8. Actualizar la política de privacidad (Google reCAPTCHA, EmailJS) antes de publicar.

**No** poner la private key de EmailJS ni el secret de reCAPTCHA en el repositorio: con EmailJS no se necesitan.

---

## 7. Limitaciones conocidas

- **EmailJS:** 1 petición/segundo y 200 envíos/mes en el plan gratuito (2 plantillas); al superar la cuota el envío falla y el usuario ve el mensaje de error genérico.
- **Sin validación en servidor:** el navegador puede omitirse. La protección real es reCAPTCHA v2 + los filtros de EmailJS; si llega spam, el siguiente paso es `forms-submit` en Apps Script (ver `docs/plan-fuente-datos-fake-endpoint.md` y `admin-dashboard/REQUISITOS_WEB_CANAL_PUBLICO.md`).
- **Anti-spam en cliente:** el transporte inyecta un honeypot (`name="website"`, oculto y fuera de la tabulación) en los formularios estático, modal y chat, y limita a **5 envíos por sesión** en una ventana de 30 minutos (`sessionStorage`). Es una barrera adicional a reCAPTCHA v2; no sustituye la verificación en servidor, y se puede saltar borrando el almacenamiento de la pestaña.
- **Modo simulado:** con `enabled: false` no se envía nada; sirve para desarrollo y para el despliegue actual.

---

## 8. Verificación realizada

- `node --check` sobre `js/main.js`, `js/busqueda-publicaciones.js`, `js/forms-config.js` y `js/forms-transport.js`.
- `tests/plantillas-emailjs.test.js`: contrato de la plantilla única (variables que envía el transporte, condicionales emparejados, `detalle` de cada tipo y `defaultTemplate` en `forms-config.js`).
- `tests/forms-transport.test.js`: honeypot (bloqueo, inyección única y por documento) y límite de 5 envíos por sesión, con liberación al caducar la ventana.
- `tests/busqueda-chat.test.js`: buscador del chat con fichas sintéticas (especie, sinónimos, filtros, estados, límite y sin resultados) y con `data/publicaciones.json`.
- `tests/publicaciones-api.test.js`: 16/16 y `tests/prerender.test.js --dry`: 30/30 en verde.
- Envío probado en modo simulado (sin configuración): devuelve `{simulated: true}` y no hace peticiones.
- Envío real (23/11/2026): aceptado por EmailJS con `POST /api/v1.0/email/send` → **200** desde `gn-admin.github.io/main/contacto/`. Asunto `[Web] Contacto general · Prueba Codebuff`, Reply-To `prueba.codebuff@example.com`. Pendiente de confirmar la recepción en el buzón.
- Los bloqueos por honeypot y por límite de sesión muestran su mensaje específico en el formulario; verificado en navegador además de en los tests.
- **Rotación de claves:** ver [`docs/rotacion-recaptcha.md`](rotacion-recaptcha.md).
