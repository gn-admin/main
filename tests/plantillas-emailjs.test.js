'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const DOC = path.join(RAIZ, 'docs', 'plantillas-emailjs.md');
const CONFIG_JS = path.join(RAIZ, 'js', 'forms-config.js');
const PLANTILLA = 'template_formulario_web';
// Clave pública publicada. Al rotar, actualizarla junto con la tabla del runbook.
const SITE_KEY_PUBLICA = '6Lf_hiEuAAAAAIPhzqJgNuXEJmO7Rghx6ZTMduI5';

const TIPOS = [
  'contacto-general',
  'adopcion-animal',
  'consulta-animal',
  'acogida',
  'voluntariado',
  'socio',
  'donaciones'
];

const DATOS = {
  'contacto-general': { nombre: 'Ana', email: 'ana@example.com', telefono: '600 111 222', direccion: 'Calle 1', asunto: 'Hola', mensaje: 'Mensaje' },
  'adopcion-animal': { nombre: 'Ana', email: 'ana@example.com', telefono: '600 111 222', mensaje: 'Me interesa', animal: 'Trufa', animal_slug: 'demo-trufa' },
  'consulta-animal': { nombre: 'Ana', email: 'ana@example.com', telefono: '600 111 222', mensaje: 'Una duda', animal: 'Nube', animal_slug: 'demo-nube' },
  acogida: { nombre: 'Ana', email: 'ana@example.com', direccion: 'Calle 1', mensaje: 'Puedo acoger', tipo_acogida: 'Gato adulto', duracion: '3 meses', convivencia: 'Sin niños' },
  voluntariado: { nombre: 'Ana', email: 'ana@example.com', telefono: '600 111 222', mensaje: 'Quiero ayudar', tipo_voluntariado: 'CES', disponibilidad: 'Findes', zona: 'Irún' },
  socio: { nombre: 'Ana', email: 'ana@example.com', modalidad_socio: '5 €/mes', mensaje: 'Quiero asociarme' },
  donaciones: { nombre: 'Ana', email: 'ana@example.com', tipo_donacion: 'Material', mensaje: 'Puedo donar' }
};

const DETALLE_ESPERADO = {
  'contacto-general': [],
  'adopcion-animal': [],
  'consulta-animal': [],
  acogida: ['Tipo de acogida: Gato adulto', 'Tiempo disponible: 3 meses', 'Convivencia: Sin niños'],
  voluntariado: ['Tipo de voluntariado: CES', 'Disponibilidad: Findes', 'Zona: Irún'],
  socio: ['Modalidad de socio/a: 5 €/mes'],
  donaciones: ['Tipo de consulta de donación: Material']
};

const CONFIG = {
  enabled: false,
  emailjs: { publicKey: 'test', serviceId: '', templates: {}, defaultTemplate: PLANTILLA },
  recaptcha: { version: 'v2-invisible', siteKey: '', actionPrefix: 'form_', minScore: 0.5 },
  mail: { toEmail: 'nebakadopciones@gmail.com' }
};

global.window = { NEBAK_FORMS_CONFIG: CONFIG };
require('../js/forms-transport.js');
const transporte = global.window.NebakFormsTransport;

function paramsDe(tipo) {
  return transporte.templateParams(transporte.buildPayload({
    form_type: tipo,
    submitted_at: '2026-11-23T10:00:00.000Z',
    page_url: 'https://gn-admin.github.io/main/contacto/',
    ...DATOS[tipo]
  }));
}

function cargarConfig() {
  const previo = global.window;
  const sandbox = {};
  global.window = sandbox;
  try {
    delete require.cache[require.resolve(CONFIG_JS)];
    require(CONFIG_JS);
    return sandbox.NEBAK_FORMS_CONFIG;
  } finally {
    global.window = previo;
  }
}

function rutasDeSecret(obj, ruta) {
  const actual = ruta || '';
  const encontradas = [];
  if (!obj || typeof obj !== 'object') return encontradas;
  Object.keys(obj).forEach((clave) => {
    const camino = actual ? actual + '.' + clave : clave;
    if (/secret|private/i.test(clave)) encontradas.push(camino);
    encontradas.push(...rutasDeSecret(obj[clave], camino));
  });
  return encontradas;
}

function leerPlantilla() {
  const md = fs.readFileSync(DOC, 'utf8');
  const textos = [...md.matchAll(/```text\r?\n([\s\S]*?)\r?\n```/g)];
  const htmls = [...md.matchAll(/```html\r?\n([\s\S]*?)\r?\n```/g)];
  assert.equal(textos.length, 1, 'el documento debe tener un único bloque de asunto');
  assert.equal(htmls.length, 1, 'el documento debe tener un único bloque HTML');
  return { asunto: textos[0][1], html: htmls[0][1] };
}

function variables(texto) {
  return [...texto.matchAll(/\{\{\s*(?:[#/^]\s*)?([\w-]+)\s*\}\}/g)].map((m) => m[1]);
}

function condicionalesSinEmparejar(html) {
  const pila = [];
  const errores = [];
  const re = /\{\{\s*([#/^])\s*([\w-]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(html))) {
    const marca = m[1];
    const nombre = m[2];
    if (marca === '#' || marca === '^') {
      pila.push((marca === '^' ? '^' : '') + nombre);
      continue;
    }
    const esperado = pila.pop();
    if (esperado !== nombre) {
      errores.push('cierre {{/' + nombre + '}} sin apertura que le corresponda');
    }
  }
  if (pila.length) errores.push('sin cerrar ' + pila.join(', '));
  return errores;
}

test('hay una sola plantilla y cubre los 7 tipos con defaultTemplate', () => {
  const { asunto, html } = leerPlantilla();
  assert.match(asunto.trim(), /^\{\{subject\}\}$/);
  TIPOS.forEach((tipo) => {
    assert.equal(transporte.templateId(tipo), PLANTILLA, 'tipo sin plantilla: ' + tipo);
  });
  assert.match(html, /\{\{form_type_label\}\}/);
  assert.match(html, /\{\{detalle\}\}/);
});

test('la plantilla solo usa variables que envía el transporte en cada tipo', () => {
  const { asunto, html } = leerPlantilla();
  const usadas = new Set(variables(asunto + '\n' + html));
  assert.ok(usadas.has('subject'), 'el asunto debe usar {{subject}}');

  TIPOS.forEach((tipo) => {
    const params = paramsDe(tipo);
    usadas.forEach((nombre) => {
      assert.ok(
        Object.prototype.hasOwnProperty.call(params, nombre),
        'la plantilla usa {{' + nombre + '}} y ' + tipo + ' no la envía'
      );
    });
  });
});

test('detalle conserva los campos propios de cada tipo', () => {
  TIPOS.forEach((tipo) => {
    const params = paramsDe(tipo);
    const esperado = DETALLE_ESPERADO[tipo];
    if (!esperado.length) {
      assert.equal(params.detalle, '', tipo + ' no debería rellenar detalle');
      return;
    }
    esperado.forEach((fragmento) => {
      assert.ok(params.detalle.includes(fragmento), tipo + ' pierde "' + fragmento + '"');
    });
  });
});

test('los condicionales están emparejados y usan variables enviadas', () => {
  const { html } = leerPlantilla();
  assert.deepEqual(condicionalesSinEmparejar(html), []);

  const params = paramsDe('contacto-general');
  const condicionales = [...html.matchAll(/\{\{#([\w-]+)\}\}/g)].map((m) => m[1]);
  assert.ok(condicionales.length >= 5, 'faltan filas condicionales en la plantilla');
  condicionales.forEach((nombre) => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(params, nombre),
      'el condicional {{#' + nombre + '}} no corresponde a ninguna variable enviada'
    );
  });
});

test('forms-config.js deja la plantilla única lista', () => {
  const cfg = cargarConfig();
  assert.ok(cfg, 'forms-config.js no define NEBAK_FORMS_CONFIG');
  assert.match(cfg.emailjs.defaultTemplate, /^[A-Za-z0-9_-]{4,}$/, 'defaultTemplate debe ser un ID de EmailJS');
  assert.deepEqual(cfg.emailjs.templates, {});
});

test('la siteKey es la clave pública y no una secret', () => {
  const cfg = cargarConfig();
  const siteKey = cfg.recaptcha && cfg.recaptcha.siteKey;

  assert.equal(typeof siteKey, 'string', 'falta recaptcha.siteKey');
  assert.match(siteKey, /^6L[A-Za-z0-9_-]{38}$/, 'siteKey no tiene el formato de una clave de reCAPTCHA');

  // La site key es pública y conocida. Cualquier otro valor (por ejemplo, la
  // secret pegada por error) publicaría una credencial privada en el cliente.
  assert.equal(
    siteKey,
    SITE_KEY_PUBLICA,
    'siteKey no es la clave pública publicada: si has pegado una secret, estás publicando una credencial privada. Si has rotado, actualiza SITE_KEY_PUBLICA y la tabla del runbook.'
  );

  assert.deepEqual(rutasDeSecret(cfg), [], 'forms-config.js no debe contener campos de secret');
});

test('To Email y Reply-To salen del payload', () => {
  const params = paramsDe('adopcion-animal');
  assert.equal(params.to_email, 'nebakadopciones@gmail.com');
  assert.equal(params.reply_to, 'ana@example.com');
});
