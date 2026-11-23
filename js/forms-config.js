/*
 * Configuración de envío de los formularios del sitio.
 *
 * Mientras `enabled` sea false (o falte alguna clave), los formularios siguen
 * funcionando en modo simulado: no se hace ninguna petición externa y el
 * mensaje de confirmación es el mismo de siempre.
 *
 * Para activar el envío real:
 *   1. EmailJS → Account: publicKey; Email Services: serviceId;
 *      Email Templates: una plantilla única para los 7 formularios.
 *      El plan gratuito permite 2 plantillas, así que se usa `defaultTemplate`
 *      y `templates` queda vacío (se puede rellenar por tipo si se amplía).
 *   2. reCAPTCHA Admin → crear clave v2 "Invisible" para gn-admin.github.io
 *      (y localhost si se prueba en local) y pegar la site key.
 *   3. En EmailJS, en la plantilla → Settings, marcar
 *      "Enable reCAPTCHA V2 verification".
 *   4. Poner las claves aquí y `enabled: true`.
 *
 * Ver docs/formularios-recaptcha-emailjs.md para el detalle por formulario.
 */
window.NEBAK_FORMS_CONFIG = {
  enabled: true,

  emailjs: {
    // Clave pública de la cuenta (segura en cliente; no es la private key).
    publicKey: 'kvMkVgkUCHek0kvc7',
    serviceId: 'swpszlk',
    // Una sola plantilla para todos los tipos (plan gratuito: 2 plantillas).
    // Si algún tipo necesita formato o destinatario propio, se rellena aquí
    // su ID y `templateId()` prioriza esa entrada sobre `defaultTemplate`.
    templates: {},
    defaultTemplate: 'tpl_contacto_general'
  },

  recaptcha: {
    // 'v2-invisible': validado por EmailJS (única versión que soporta).
    // 'v3': solo genera token; exige verificación en servidor (GAS) para servir de algo.
    version: 'v2-invisible',
    siteKey: '6Lf_hiEuAAAAAEiXRLOQ2-r1aKo46WJZmPYMfMAd=',
    actionPrefix: 'form_',
    minScore: 0.5
  },

  mail: {
    toEmail: 'nebakadopciones@gmail.com'
  }
};
