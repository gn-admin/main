'use strict';

const test = require('node:test');
const assert = require('node:assert');

function almacenFalso() {
  const datos = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(datos, k) ? datos[k] : null; },
    setItem(k, v) { datos[k] = String(v); },
    removeItem(k) { delete datos[k]; }
  };
}

global.sessionStorage = almacenFalso();
global.window = {
  NEBAK_FORMS_CONFIG: {
    enabled: false,
    emailjs: { publicKey: 'test', serviceId: '', templates: {}, defaultTemplate: 'tpl_test' },
    recaptcha: { version: 'v2-invisible', siteKey: '', actionPrefix: 'form_', minScore: 0.5 },
    mail: { toEmail: 'nebakadopciones@gmail.com' }
  }
};

require('../js/forms-transport.js');
const transporte = global.window.NebakFormsTransport;

function formularioFalso() {
  return {
    attrs: {},
    children: [],
    matches() { return true; },
    querySelector(sel) {
      if (sel === '[data-nebak-hp]') {
        return this.children.find((c) => c.attrs['data-nebak-hp']) || null;
      }
      return null;
    },
    querySelectorAll() { return []; },
    appendChild(el) { this.children.push(el); return el; },
    setAttribute(k, v) { this.attrs[k] = v; }
  };
}

function documentoFalso(forms) {
  return {
    readyState: 'complete',
    querySelectorAll() { return forms; },
    createElement() {
      return {
        attrs: {},
        style: {},
        setAttribute(k, v) { this.attrs[k] = v; }
      };
    }
  };
}

test('send rechaza el envío si el honeypot viene relleno', async () => {
  transporte.resetRateLimit();
  await assert.rejects(
    transporte.send({ form_type: 'contacto-general', website: 'http://spam.example' }),
    (err) => err.reason === 'honeypot'
  );
  assert.equal(transporte.rateLimitStatus().used, 0, 'un envío bloqueado no consume cuota');
});

test('send deja pasar el envío si el honeypot está vacío o ausente', async () => {
  transporte.resetRateLimit();
  const vacio = await transporte.send({ form_type: 'contacto-general', website: '' });
  assert.equal(vacio.simulated, true);
  const ausente = await transporte.send({ form_type: 'contacto-general' });
  assert.equal(ausente.simulated, true);
  assert.equal(transporte.rateLimitStatus().used, 0, 'el modo simulado no consume cuota');
});

test('installHoneypots añade un único campo oculto por formulario', () => {
  const form = formularioFalso();
  global.document = documentoFalso([form]);
  try {
    assert.equal(transporte.installHoneypots(form), 1);
    assert.equal(transporte.installHoneypots(form), 0, 'no debe duplicar el campo');

    const hp = form.children[0];
    assert.equal(hp.name, 'website');
    assert.equal(hp.type, 'text');
    assert.equal(hp.tabIndex, -1);
    assert.equal(hp.attrs['data-nebak-hp'], '1');
    assert.equal(hp.attrs['aria-hidden'], 'true');
    assert.equal(hp.attrs.autocomplete, 'off');
    assert.match(hp.style.cssText, /position:absolute/);
    assert.match(hp.style.cssText, /left:-9999px/);
  } finally {
    delete global.document;
  }
});

test('installHoneypots recorre los formularios del documento', () => {
  const uno = formularioFalso();
  const dos = formularioFalso();
  global.document = documentoFalso([uno, dos]);
  try {
    assert.equal(transporte.installHoneypots(), 2);
    assert.equal(uno.children.length, 1);
    assert.equal(dos.children.length, 1);
  } finally {
    delete global.document;
  }
});

test('el límite de sesión bloquea el sexto envío', async () => {
  transporte.resetRateLimit();
  for (let i = 0; i < 5; i++) transporte.recordSend();

  const estado = transporte.rateLimitStatus();
  assert.equal(estado.used, 5);
  assert.equal(estado.remaining, 0);
  assert.ok(estado.retryAfterMs > 0 && estado.retryAfterMs <= transporte.rateLimit.windowMs);

  await assert.rejects(
    transporte.send({ form_type: 'contacto-general' }),
    (err) => err.reason === 'rate-limit'
  );
});

test('el límite se libera al pasar la ventana y al reiniciar', async () => {
  transporte.resetRateLimit();
  const viejo = Date.now() - transporte.rateLimit.windowMs - 1000;
  for (let i = 0; i < 5; i++) transporte.recordSend(viejo);
  assert.equal(transporte.rateLimitStatus().used, 0, 'los envíos fuera de ventana no cuentan');

  const resultado = await transporte.send({ form_type: 'contacto-general' });
  assert.equal(resultado.simulated, true);

  transporte.resetRateLimit();
  assert.equal(transporte.rateLimitStatus().used, 0);
});

test('cada bloqueo tiene su mensaje específico', () => {
  assert.match(transporte.errorMessage({ reason: 'honeypot' }), /parece automático/i);
  const limite = transporte.errorMessage({ reason: 'rate-limit' });
  assert.match(limite, /límite de 5 envíos/i);
  assert.match(limite, /nebakadopciones@gmail\.com/);
  assert.match(transporte.errorMessage(new Error('otro')), /No se ha podido enviar el formulario/);
  assert.match(transporte.errorMessage(null), /No se ha podido enviar el formulario/);
});

test('send rechaza con el mensaje específico de cada bloqueo', async () => {
  transporte.resetRateLimit();
  const honeypot = await transporte.send({ form_type: 'contacto-general', website: 'spam' }).then(
    () => null,
    (err) => ({ reason: err.reason, message: err.message })
  );
  assert.equal(honeypot.reason, 'honeypot');
  assert.equal(honeypot.message, transporte.errorMessage({ reason: 'honeypot' }));

  for (let i = 0; i < 5; i++) transporte.recordSend();
  const limite = await transporte.send({ form_type: 'contacto-general' }).then(
    () => null,
    (err) => ({ reason: err.reason, message: err.message, retryAfterMs: err.retryAfterMs })
  );
  assert.equal(limite.reason, 'rate-limit');
  assert.equal(limite.message, transporte.errorMessage({ reason: 'rate-limit' }));
  assert.ok(limite.retryAfterMs > 0);
  transporte.resetRateLimit();
});

test('el honeypot no viaja en los parámetros de la plantilla ni en detalle', () => {
  const params = transporte.templateParams(transporte.buildPayload({
    form_type: 'contacto-general',
    nombre: 'Ana',
    email: 'ana@example.com',
    mensaje: 'Hola',
    website: 'relleno'
  }));
  assert.ok(!Object.prototype.hasOwnProperty.call(params, 'website'));
  assert.ok(!params.detalle.includes('website'));
  assert.ok(!params.detalle.includes('relleno'));
});
