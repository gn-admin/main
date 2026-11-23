/*
 * Transporte único de formularios: normaliza el payload de cualquier
 * formulario del sitio (estático, modal o chat), obtiene el token de
 * reCAPTCHA y lo envía por EmailJS.
 *
 * Si `js/forms-config.js` no está configurado (`enabled: false`) o falta la
 * plantilla del tipo, devuelve `{ simulated: true }` y no hace peticiones.
 *
 * API:
 *   NebakFormsTransport.send(payload)    -> Promise<{ok, simulated, payload, response?}>
 *   NebakFormsTransport.preload()        -> carga SDKs si hay configuración
 *   NebakFormsTransport.buildPayload(p)  -> payload normalizado (sin enviar)
 *   NebakFormsTransport.isActive(type)   -> bool
 *   NebakFormsTransport.installHoneypots(form?) -> añade el campo trampa
 *   NebakFormsTransport.rateLimitStatus() / recordSend() / resetRateLimit()
 *
 * Protección: honeypot `website` (oculto) y máximo de envíos por sesión.
 */
var NebakFormsTransport = (function () {
  'use strict';

  var EMAILJS_SRC = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
  var RECAPTCHA_SRC = 'https://www.google.com/recaptcha/api.js?render=explicit&hl=es';

  var HONEYPOT_FIELD = 'website';
  var HONEYPOT_SELECTOR = 'form[data-static-form], form[data-chat-inline-form], #nebakModalForm';
  var RATE_LIMIT = { max: 5, windowMs: 30 * 60 * 1000 };
  var RATE_KEY = 'nebak_forms_sent';
  var memoriaEnvios = [];

  var TYPE_ALIASES = {
    adopt: 'adopcion-animal',
    adopcion: 'adopcion-animal',
    acoge: 'acogida',
    vol: 'voluntariado',
    donar: 'donaciones',
    donacion: 'donaciones',
    'consulta-caso': 'consulta-animal'
  };

  var TYPE_LABELS = {
    'contacto-general': 'Contacto general',
    'adopcion-animal': 'Solicitud de adopción',
    'consulta-animal': 'Consulta sobre un caso',
    'acogida': 'Solicitud de acogida',
    'voluntariado': 'Voluntariado',
    'socio': 'Socio/a',
    'donaciones': 'Donaciones'
  };

  // Campos que ya van en la plantilla por su nombre; `detalle` añade el resto.
  var COMMON_FIELDS = {
    form_type: 1, concepto: 1, nombre: 1, email: 1, telefono: 1, direccion: 1,
    asunto: 1, mensaje: 1, animal: 1, animal_slug: 1, origen_pagina: 1,
    page_url: 1, submitted_at: 1, user_agent: 1, idioma: 1,
    recaptcha_action: 1, recaptcha_token: 1, 'g-recaptcha-response': 1,
    to_email: 1, reply_to: 1, subject: 1, detalle: 1, form_type_label: 1,
    website: 1
  };

  var FIELD_LABELS = {
    tipo_acogida: 'Tipo de acogida',
    duracion: 'Tiempo disponible',
    convivencia: 'Convivencia',
    tipo_voluntariado: 'Tipo de voluntariado',
    disponibilidad: 'Disponibilidad',
    zona: 'Zona',
    tipo_donacion: 'Tipo de consulta de donación',
    modalidad_socio: 'Modalidad de socio/a'
  };

  var loading = {};
  var widgetSeq = 0;

  function config() {
    return (typeof window !== 'undefined' && window.NEBAK_FORMS_CONFIG) ? window.NEBAK_FORMS_CONFIG : {};
  }

  function hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function sessionStore() {
    try {
      return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    } catch (e) {
      return null;
    }
  }

  function leerEnvios() {
    var store = sessionStore();
    if (!store) return memoriaEnvios;
    try {
      var lista = JSON.parse(store.getItem(RATE_KEY) || '[]');
      return Array.isArray(lista)
        ? lista.filter(function (t) { return typeof t === 'number' && isFinite(t); })
        : [];
    } catch (e) {
      return memoriaEnvios;
    }
  }

  function guardarEnvios(lista) {
    var store = sessionStore();
    if (store) {
      try { store.setItem(RATE_KEY, JSON.stringify(lista)); return; } catch (e) {}
    }
    memoriaEnvios = lista;
  }

  function enviosRecientes(ahora) {
    return leerEnvios().filter(function (t) {
      return t <= ahora && (ahora - t) < RATE_LIMIT.windowMs;
    });
  }

  function rateLimitStatus(ahora) {
    var ts = typeof ahora === 'number' ? ahora : Date.now();
    var usados = enviosRecientes(ts);
    return {
      used: usados.length,
      max: RATE_LIMIT.max,
      remaining: Math.max(0, RATE_LIMIT.max - usados.length),
      retryAfterMs: usados.length >= RATE_LIMIT.max ? (usados[0] + RATE_LIMIT.windowMs - ts) : 0
    };
  }

  function recordSend(ahora) {
    var ts = typeof ahora === 'number' ? ahora : Date.now();
    guardarEnvios(enviosRecientes(ts).concat(ts));
    return rateLimitStatus(ts);
  }

  function resetRateLimit() {
    guardarEnvios([]);
  }

  function honeypotFilled(raw) {
    var value = raw && raw[HONEYPOT_FIELD];
    return value != null && String(value).trim() !== '';
  }

  function blockedError(reason) {
    var err = new Error(reason === 'honeypot'
      ? 'Envío bloqueado por el filtro anti-spam.'
      : 'Has alcanzado el límite de envíos de esta sesión. Inténtalo más tarde o escríbenos por email.');
    err.reason = reason;
    return err;
  }

  function installHoneypots(root) {
    if (typeof document === 'undefined') return 0;
    var scope = root || document;
    var forms = [];
    if (scope.matches && scope.matches(HONEYPOT_SELECTOR)) forms.push(scope);
    if (scope.querySelectorAll) {
      forms = forms.concat(Array.prototype.slice.call(scope.querySelectorAll(HONEYPOT_SELECTOR)));
    }
    var added = 0;
    forms.forEach(function (form) {
      if (!form || !form.appendChild || (form.querySelector && form.querySelector('[data-nebak-hp]'))) return;
      var input = document.createElement('input');
      input.type = 'text';
      input.name = HONEYPOT_FIELD;
      input.tabIndex = -1;
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('aria-hidden', 'true');
      input.setAttribute('data-nebak-hp', '1');
      input.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      form.appendChild(input);
      added++;
    });
    return added;
  }

  function normalizeType(type) {
    var value = String(type || '').trim().toLowerCase();
    if (!value) return 'contacto-general';
    return TYPE_ALIASES[value] || value;
  }

  function templateId(type) {
    var email = config().emailjs || {};
    var templates = email.templates || {};
    return String((hasOwn(templates, type) && templates[type]) || email.defaultTemplate || '').trim();
  }

  function isActive(type) {
    var cfg = config();
    var email = cfg.emailjs || {};
    if (!cfg.enabled) return false;
    if (!email.publicKey || !email.serviceId) return false;
    return !!templateId(normalizeType(type));
  }

  function buildPayload(raw) {
    var payload = {};
    if (raw) {
      for (var key in raw) {
        if (!hasOwn(raw, key)) continue;
        var value = raw[key];
        payload[key] = (value === undefined || value === null) ? '' : String(value);
      }
    }
    payload.form_type = normalizeType(payload.form_type);
    // La plantilla única usa estos campos con condicionales: mejor definidos y vacíos
    // que ausentes, para que `{{#campo}}` se evalúe igual en todos los formularios.
    ['nombre', 'email', 'telefono', 'direccion', 'asunto', 'animal', 'animal_slug', 'mensaje'].forEach(function (key) {
      if (!hasOwn(payload, key)) payload[key] = '';
    });
    payload.concepto = payload.concepto || (TYPE_LABELS[payload.form_type] || payload.form_type);
    if (typeof document !== 'undefined') {
      payload.page_url = payload.page_url || (typeof location !== 'undefined' ? location.href : '');
      payload.origen_pagina = payload.origen_pagina || document.title || '';
      payload.idioma = payload.idioma || document.documentElement.lang || 'es';
    }
    payload.submitted_at = payload.submitted_at || new Date().toISOString();
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      payload.user_agent = payload.user_agent || navigator.userAgent;
    }
    return payload;
  }

  function detalle(payload) {
    var lines = [];
    for (var key in payload) {
      if (!hasOwn(payload, key) || COMMON_FIELDS[key]) continue;
      var value = payload[key];
      if (value === undefined || value === null || String(value).trim() === '') continue;
      lines.push((FIELD_LABELS[key] || key) + ': ' + value);
    }
    return lines.join('\n');
  }

  function subjectFor(payload) {
    var base = payload.concepto || TYPE_LABELS[payload.form_type] || payload.form_type;
    var animal = payload.animal ? ' — ' + payload.animal : '';
    var quien = payload.nombre ? ' · ' + payload.nombre : '';
    return '[Web] ' + base + animal + quien;
  }

  function templateParams(payload) {
    var params = {};
    for (var key in payload) {
      if (hasOwn(payload, key) && key !== HONEYPOT_FIELD) params[key] = payload[key];
    }
    params.form_type = payload.form_type;
    params.form_type_label = TYPE_LABELS[payload.form_type] || payload.form_type;
    params.to_email = (config().mail || {}).toEmail || '';
    params.reply_to = payload.email || params.to_email;
    params.subject = subjectFor(payload);
    params.detalle = detalle(payload);
    return params;
  }

  function loadScript(src) {
    if (loading[src]) return loading[src];
    loading[src] = new Promise(function (resolve, reject) {
      if (typeof document === 'undefined') { reject(new Error('Sin DOM para cargar ' + src)); return; }
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = function () { resolve(); };
      script.onerror = function () {
        delete loading[src];
        reject(new Error('No se pudo cargar ' + src));
      };
      document.head.appendChild(script);
    });
    return loading[src];
  }

  function recaptchaToken(action) {
    var rec = config().recaptcha || {};
    var siteKey = String(rec.siteKey || '').trim();
    if (!siteKey) return Promise.resolve('');

    return loadScript(RECAPTCHA_SRC).then(function () {
      return new Promise(function (resolve, reject) {
        if (!window.grecaptcha || typeof window.grecaptcha.ready !== 'function') {
          reject(new Error('reCAPTCHA no disponible'));
          return;
        }
        window.grecaptcha.ready(function () {
          if (rec.version === 'v3') {
            window.grecaptcha.execute(siteKey, { action: action }).then(resolve, reject);
            return;
          }
          var holder = document.createElement('div');
          holder.id = 'nebakRecaptcha' + (++widgetSeq);
          holder.style.display = 'none';
          document.body.appendChild(holder);
          var done = false;

          function cleanup() {
            try { holder.parentNode.removeChild(holder); } catch (e) {}
          }
          function finish(fn, value) {
            if (done) return;
            done = true;
            cleanup();
            fn(value);
          }
          try {
            var widgetId = window.grecaptcha.render(holder, {
              sitekey: siteKey,
              size: 'invisible',
              badge: 'bottomright',
              callback: function (token) { finish(resolve, token); },
              'error-callback': function () { finish(reject, new Error('reCAPTCHA: error de verificación')); },
              'expired-callback': function () { finish(reject, new Error('reCAPTCHA: token caducado')); }
            });
            window.grecaptcha.execute(widgetId);
          } catch (err) {
            finish(reject, err);
          }
        });
      });
    });
  }

  function send(raw) {
    if (honeypotFilled(raw)) {
      try { console.warn('[NebakForms] envío descartado por honeypot'); } catch (e) {}
      return Promise.reject(blockedError('honeypot'));
    }
    if (rateLimitStatus().remaining <= 0) {
      return Promise.reject(blockedError('rate-limit'));
    }

    var payload = buildPayload(raw);
    var type = payload.form_type;
    var tpl = templateId(type);

    if (!isActive(type)) {
      return Promise.resolve({ ok: true, simulated: true, payload: payload, reason: 'config' });
    }

    // Solo los envíos reales consumen cuota de la sesión.
    recordSend();

    var rec = config().recaptcha || {};
    var action = String(rec.actionPrefix || 'form_') + type.replace(/-/g, '_');
    payload.recaptcha_action = action;

    return recaptchaToken(action).then(function (token) {
      if (token) {
        payload.recaptcha_token = token;
        // EmailJS valida reCAPTCHA v2 leyendo este parámetro en la plantilla.
        if (rec.version !== 'v3') payload['g-recaptcha-response'] = token;
      }
      return loadScript(EMAILJS_SRC);
    }).then(function () {
      if (!window.emailjs || typeof window.emailjs.send !== 'function') {
        throw new Error('EmailJS no disponible');
      }
      return window.emailjs.send(
        config().emailjs.serviceId,
        tpl,
        templateParams(payload),
        { publicKey: config().emailjs.publicKey }
      );
    }).then(function (response) {
      return { ok: true, simulated: false, payload: payload, response: response };
    });
  }

  function preload() {
    if (!config().enabled) return;
    var siteKey = String((config().recaptcha || {}).siteKey || '').trim();
    if (siteKey) loadScript(RECAPTCHA_SRC).catch(function () {});
    loadScript(EMAILJS_SRC).catch(function () {});
  }

  var api = {
    send: send,
    preload: preload,
    buildPayload: buildPayload,
    templateParams: templateParams,
    templateId: templateId,
    isActive: isActive,
    normalizeType: normalizeType,
    installHoneypots: installHoneypots,
    rateLimit: RATE_LIMIT,
    rateLimitStatus: rateLimitStatus,
    recordSend: recordSend,
    resetRateLimit: resetRateLimit
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { installHoneypots(); });
    } else {
      installHoneypots();
    }
  }

  return api;
})();

if (typeof window !== 'undefined') window.NebakFormsTransport = NebakFormsTransport;
