# Auditoría del chatbot, formularios y búsqueda

**Fecha:** 23/11/2026 · **Alcance:** `js/main.js` (chat, formularios estáticos y modal), `js/busqueda-publicaciones.js`, `js/forms-transport.js`, HTML de formularios y `css/main.css`.

## Resumen

El circuito de envío ya estaba validado. La auditoría se centró en el asistente: calidad de búsqueda, clasificación de los formularios, accesibilidad y estados de error. Se corrigieron **18 puntos** y se añadieron **2 pruebas** de búsqueda.

## Chatbot

| Hallazgo | Corrección |
|---|---|
| Los valores de usuario se interpolaban sin escapar en atributos `value` (input de animal y campos ocultos). | `escAttr()` para todo valor dentro de atributos; el texto visible sigue pasando por `escHtml()`. |
| Un clic fuera del panel cerraba el chat aunque hubiera un formulario a medio rellenar. | El clic fuera no cierra si existe `[data-chat-inline-form]`; se conserva el DOM al cerrar y reabrir. |
| El panel no se anunciaba como diálogo ni gestionaba el foco. | `role="dialog"`, `aria-modal`, `aria-labelledby`, foco en el primer campo, trampa de `Tab` y retorno del foco al botón al cerrar. |
| Al abrir un formulario el foco se perdía porque el botón que lo abría desaparecía. | Foco al primer campo visible tras renderizar el formulario. |
| Los resultados no permitían refinar sin reescribir la consulta. | Chips **Todos / Gatos / Perros / Acogida / Eventos / Historias** que conservan la consulta y marcan el filtro activo. |
| El estado vacío duplicaba sugerencias y chips. | Estado vacío único con chips y mensaje claro. |
| Enviar con el buscador vacío no hacía nada. | Aviso, foco en el campo y ejemplo de consulta. |
| Un fallo de carga decía «necesita abrirse por HTTP», aunque el problema fuera de red. | Mensaje real, botón **Reintentar** y estado «Sin conexión». |
| Imágenes de resultados rotas si faltaba el archivo. | `onerror` oculta la imagen y `loading="lazy"`. |
| El estado de la cabecera siempre decía «Listo para ayudarte». | Cambia a «Buscando…», «Formulario abierto», «Mensaje enviado» o «Sin conexión». |

## Formularios

| Hallazgo | Corrección |
|---|---|
| Donaciones y socio/a se enviaban como `contacto-general`, perdiendo la clasificación. | Nuevos formularios de chat `donaciones` (con `tipo_donacion`) y `socio` (con `modalidad_socio`), accesibles desde intents, chips y opciones. |
| Al formulario de acogida del chat le faltaban tipo y convivencia; al de voluntariado, disponibilidad y zona; al de contacto, teléfono. | Campos añadidos, con `maxlength`, `autocomplete` y obligatorios donde corresponde. |
| Los errores se pintaban con el estilo verde de éxito. | `showFormStatus()` aplica `.is-error`, `role="alert"` y vuelve a `role="status"` al limpiar; estilos de error para formularios estáticos, modal y chat. |
| No había indicador de envío para lectores de pantalla. | `aria-busy` en el formulario mientras se envía y botón deshabilitado. |
| El error del chat quedaba al final sin foco. | `tabIndex=-1` y foco en el aviso; se elimina al escribir. |

## Búsqueda

| Hallazgo | Corrección |
|---|---|
| Una consulta con solo artículos o preposiciones (`de la`, `quiero`) devolvía el catálogo arbitrario como si fueran resultados. | Devuelve `[]`; sin consulta se mantiene el listado inicial de 8. |
| El límite estaba fijo en 8. | Cuarto parámetro `limite` (8 por defecto, máximo 50). |
| Filtro y consulta solo se probaban por separado. | Pruebas de combinación (especie + filtro) y de límite. |

## Verificación

- **72/72 pruebas**: 9 transporte + 7 plantillas + 10 búsqueda + 16 publicaciones + 30 prerender.
- Navegador local: diálogo con rol y foco correctos, búsqueda «trufa» (1 resultado), filtro «Perros» (0 resultados con chips), formulario de adopción con 5 campos visibles + honeypot, clic fuera sin cerrar, error con `role="alert"` y fondo rojo, y `aria-busy` retirado tras el fallo.
- Formulario estático de contacto: error verificado con `role="alert"` y estilos `#8a1c1c` sobre `#fdecec`.

## Límites conocidos

- EmailJS y el límite de 5 envíos se ejecutan en cliente: se pueden saltar; la verificación en servidor sigue pendiente.
- `localhost` y `127.0.0.1` no están autorizados en la clave de reCAPTCHA actual.
- La búsqueda es por palabras, sinónimos y prefijos; no hay tolerancia a errores tipográficos ni búsqueda semántica.
- El asistente es guiado por reglas y datos JSON; no hay LLM ni backend conversacional.

## Versiones desplegadas

`main.js?v=13`, `busqueda-publicaciones.js?v=2`, `main.css?v=5`; `forms-config.js?v=4` y `forms-transport.js?v=4` sin cambios.
