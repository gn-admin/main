# Plantilla EmailJS única, lista para copiar y pegar

> **Para qué sirve:** una sola plantilla atiende los 7 formularios del sitio. El plan gratuito de EmailJS permite 2 plantillas y 200 envíos/mes; así queda una libre para una auto-respuesta.
> `js/forms-transport.js` compone el asunto (`[Web] {concepto} — {animal} · {nombre}`) y el campo `{{detalle}}` con los datos propios de cada tipo.
> Fecha: 2026-11-23.

---

## Cómo pegarla en el panel

1. EmailJS → **Email Templates** → crear una plantilla (o abrir la existente). EmailJS le asigna un ID automático (`template_xxxxxxx`): ese ID es el que hay que copiar.
2. **Subject:** `{{subject}}` (campo del panel, no va dentro del HTML).
3. **Content** → botón de código fuente (`</>` / *Edit HTML*) → borrar el contenido → pegar el bloque `html`.
4. **To Email:** `{{to_email}}` · **Reply To:** `{{reply_to}}`.
5. En **Settings** → marcar **Enable reCAPTCHA V2 verification** y pegar ahí la **secret key** de reCAPTCHA (la site key va en `js/forms-config.js`).
6. Probar con *Test it* y después con un envío real de cada formulario.

**Configuración en `js/forms-config.js`:** `templates: {}` y `defaultTemplate: 'tpl_contacto_general'` (el ID que asigna EmailJS). `templateId()` usa la entrada del tipo si existe y, si no, `defaultTemplate`, así que los 7 formularios enviarán con esta plantilla.

| `form_type` | Plantilla usada |
|---|---|
| `contacto-general`, `adopcion-animal`, `consulta-animal`, `acogida`, `voluntariado`, `socio`, `donaciones` | una sola, vía `defaultTemplate` |

---

## Plantilla única

**Asunto (Subject):**

```text
{{subject}}
```

**Cuerpo HTML (Content):**

```html
<div style="margin:0;padding:24px;background:#f3fbf6;font-family:Arial,Helvetica,sans-serif;color:#102018;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dcefe3;border-radius:12px;">
    <tr>
      <td style="background:#0f5f31;padding:20px 24px;">
        <p style="margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#b9f0cd;">Grupo Nebak · Web</p>
        <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;color:#ffffff;">{{form_type_label}}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;">
          <tr>
            <td style="padding:6px 0;width:160px;vertical-align:top;color:#3f5548;">Nombre</td>
            <td style="padding:6px 0;vertical-align:top;font-weight:bold;color:#102018;">{{nombre}}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;width:160px;vertical-align:top;color:#3f5548;">Email</td>
            <td style="padding:6px 0;vertical-align:top;font-weight:bold;color:#102018;">{{email}}</td>
          </tr>
          {{#telefono}}
          <tr>
            <td style="padding:6px 0;width:160px;vertical-align:top;color:#3f5548;">Teléfono</td>
            <td style="padding:6px 0;vertical-align:top;font-weight:bold;color:#102018;">{{telefono}}</td>
          </tr>
          {{/telefono}}
          {{#direccion}}
          <tr>
            <td style="padding:6px 0;width:160px;vertical-align:top;color:#3f5548;">Dirección</td>
            <td style="padding:6px 0;vertical-align:top;font-weight:bold;color:#102018;">{{direccion}}</td>
          </tr>
          {{/direccion}}
          {{#asunto}}
          <tr>
            <td style="padding:6px 0;width:160px;vertical-align:top;color:#3f5548;">Asunto</td>
            <td style="padding:6px 0;vertical-align:top;font-weight:bold;color:#102018;">{{asunto}}</td>
          </tr>
          {{/asunto}}
          {{#animal}}
          <tr>
            <td style="padding:6px 0;width:160px;vertical-align:top;color:#3f5548;">Animal / caso</td>
            <td style="padding:6px 0;vertical-align:top;font-weight:bold;color:#102018;">{{animal}}</td>
          </tr>
          {{/animal}}
          {{#animal_slug}}
          <tr>
            <td style="padding:6px 0;width:160px;vertical-align:top;color:#3f5548;">Ficha (slug)</td>
            <td style="padding:6px 0;vertical-align:top;font-weight:bold;color:#102018;">{{animal_slug}}</td>
          </tr>
          {{/animal_slug}}
        </table>
        {{#detalle}}
        <div style="margin-top:18px;padding:14px 16px;background:#f3fbf6;border-left:4px solid #1fbf5b;border-radius:6px;font-size:14px;line-height:1.6;white-space:pre-line;">{{detalle}}</div>
        {{/detalle}}
        {{#mensaje}}
        <div style="margin-top:18px;padding:16px;background:#f3fbf6;border-left:4px solid #1fbf5b;border-radius:6px;font-size:14px;line-height:1.65;white-space:pre-line;">{{mensaje}}</div>
        {{/mensaje}}
        <a href="mailto:{{email}}" style="display:inline-block;margin-top:20px;padding:11px 20px;background:#1fbf5b;border-radius:8px;color:#0b3d21;font-size:14px;font-weight:bold;text-decoration:none;">Responder a {{nombre}}</a>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px;background:#e9f7ef;color:#3f5548;font-size:12px;line-height:1.6;">
        Enviado desde <a href="{{page_url}}" style="color:#0f5f31;">{{page_url}}</a><br>
        {{submitted_at}} · {{form_type}}
      </td>
    </tr>
  </table>
</div>
```

---

## Filas opcionales

Cada fila opcional va envuelta en un condicional de EmailJS: `{{#campo}} …fila… {{/campo}}`. Si el campo llega vacío (el chat no pide teléfono ni dirección, por ejemplo), EmailJS elimina el bloque completo y no queda una fila con la etiqueta en blanco. No borres esos pares al pegar el HTML; `{{detalle}}` y `{{mensaje}}` también van condicionados.

## Variables del transporte

Además de los campos del formulario, `NebakFormsTransport` envía `{{form_type}}`, `{{form_type_label}}`, `{{concepto}}`, `{{page_url}}`, `{{origen_pagina}}`, `{{submitted_at}}`, `{{idioma}}`, `{{user_agent}}`, `{{subject}}`, `{{to_email}}`, `{{reply_to}}`, `{{detalle}}` (los campos propios del tipo, con etiqueta y valor) y el token de reCAPTCHA (`{{recaptcha_token}}`, `{{g-recaptcha-response}}`), que valida EmailJS.

- EmailJS **escapa por defecto** las variables de doble llave: `{{mensaje}}` se inserta como texto seguro, así que el usuario no puede inyectar HTML (y `&`, `<`, `>` se ven tal cual). Para inyectar HTML haría falta la sintaxis de triple llave `{{{campo}}}`, que aquí no se usa.
- `white-space:pre-line` conserva los saltos de línea del mensaje en Gmail, Apple Mail y Outlook web (en Outlook de escritorio puede verse en una línea).
- Es un fragmento con estilos en línea y tablas, sin imágenes externas ni fuentes remotas: se pega tal cual en el editor HTML de EmailJS.

## Verificación

- **Render y contraste:** la plantilla se ha previsualizado en navegador con los 7 tipos de envío (`.freebuff/preview-plantillas.html`), a 440 px de ancho: sin desbordamiento horizontal y con las filas opcionales ocultas cuando el campo llega vacío. Contraste medido sobre el HTML renderizado, todo AA: eyebrow 6,07:1, título 7,77:1, etiquetas 8,06:1, valores 16,91:1, mensaje 16,06:1, botón 5,08:1, texto del pie 7,30:1 y enlaces del pie 7,04:1.
- **Test de contrato:** `node tests/plantillas-emailjs.test.js`. Comprueba que la plantilla única usa solo variables que envía `js/forms-transport.js`, que los condicionales están emparejados, que `detalle` lleva los datos propios de cada tipo y que `forms-config.js` resuelve los 7 tipos con `defaultTemplate`.
- **Buscador del chat:** `node tests/busqueda-chat.test.js`.
