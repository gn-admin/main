/*
 * Pruebas del adaptador de publicaciones contra fixtures del canal.
 *
 * Cargan los scripts reales (js/canal-publico.js y js/publicaciones-api.js) en
 * un contexto `vm` con un `fetch` simulado, para proteger la carga por sección,
 * la ficha, la retirada, el redirect, el error y la caída del canal.
 *
 * Ejecutar: node --test tests/
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');

function fixture(nombre) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', nombre), 'utf8'));
}

const FIXTURES = {
  gatos: fixture('canal-gatos.json'),
  perros: fixture('canal-perros.json'),
  historias: fixture('canal-historias.json'),
  fichaNube: fixture('ficha-nube.json'),
  fichaRetirada: fixture('ficha-retirada.json'),
  fichaRedirect: fixture('ficha-redirect.json'),
  error: fixture('canal-error.json'),
  local: fixture('local-posts.json')
};

const CANAL = 'https://canal.test/exec';

// Respuesta por defecto: enruta cada endpoint a su fixture.
function responderPorDefecto(url) {
  if (url.indexOf('data/blog-posts.json') === 0) return FIXTURES.local;
  const u = new URL(url);
  const endpoint = u.searchParams.get('endpoint');
  if (endpoint === 'animales-publicos') {
    return u.searchParams.get('species') === 'gato' ? FIXTURES.gatos : FIXTURES.perros;
  }
  if (endpoint === 'historias-publicas') return FIXTURES.historias;
  if (endpoint === 'publicacion') {
    const slug = u.searchParams.get('slug');
    if (slug === 'demo-nube') return FIXTURES.fichaNube;
    if (slug === 'demo-lua') return FIXTURES.fichaRetirada;
    if (slug === 'nube-vieja') return FIXTURES.fichaRedirect;
    return FIXTURES.error;
  }
  return FIXTURES.error;
}

// Carga los scripts reales en un contexto aislado con fetch simulado.
function entorno(opciones) {
  const opts = opciones || {};
  const responder = opts.responder || responderPorDefecto;
  const llamadas = [];
  const avisos = [];
  const errores = [];

  const sandbox = {
    console: {
      log() {},
      warn(...args) { avisos.push(args.join(' ')); },
      error(...args) { errores.push(args.join(' ')); },
      info() {}
    },
    fetch(url) {
      const destino = String(url);
      llamadas.push(destino);
      let respuesta;
      try {
        respuesta = responder(destino);
      } catch (err) {
        return Promise.reject(err);
      }
      if (respuesta instanceof Error) return Promise.reject(respuesta);
      return Promise.resolve({
        ok: true,
        status: 200,
        text() { return Promise.resolve(JSON.stringify(respuesta)); }
      });
    },
    AbortController,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    document: undefined
  };
  sandbox.window = sandbox;
  if (opts.options) Object.assign(sandbox.NEBAK_DATA_SOURCE.options, opts.options);
  sandbox.NEBAK_DATA_SOURCE = {
    version: 1,
    defaultMode: 'fake',
    endpointBase: CANAL,
    sections: {
      historias: { mode: 'real' },
      gatos: { mode: 'real' },
      perros: { mode: 'real' },
      acogidas: { mode: 'fake' },
      adoptados: { mode: 'fake' },
      casosExternos: { mode: 'fake' },
      grupos: { mode: 'fake' },
      eventos: { mode: 'fake' },
      apadrinamiento: { mode: 'fake' },
      home: { mode: 'real' },
      detalle: { mode: 'real' }
    },
    options: {
      pageSize: 24,
      timeoutMs: 200,
      transport: 'auto',
      fallbackOnError: true,
      debug: false
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/canal-publico.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/publicaciones-api.js'), 'utf8'), sandbox);

  return { api: sandbox.PublicacionesAPI, llamadas, avisos, errores };
}

function llamadasAlCanal(llamadas) {
  return llamadas.filter(function (url) { return url.indexOf(CANAL) === 0; });
}

function llamadasAlJson(llamadas) {
  return llamadas.filter(function (url) { return url.indexOf('data/blog-posts.json') === 0; });
}

test('gatos: una sola llamada al canal y ninguna al JSON local', async () => {
  const { api, llamadas } = entorno();
  await api.load(['gatos']);

  const canal = llamadasAlCanal(llamadas);
  assert.equal(canal.length, 1);
  assert.equal(llamadasAlJson(llamadas).length, 0, 'no debe bajar blog-posts.json');

  const url = new URL(canal[0]);
  assert.equal(url.searchParams.get('endpoint'), 'animales-publicos');
  assert.equal(url.searchParams.get('species'), 'gato');
  assert.equal(url.searchParams.get('status'), 'en_adopcion');
  assert.equal(url.searchParams.get('pageSize'), '24');

  const posts = api.getPostsFor('gatos');
  assert.equal(posts.length, 2);
  assert.equal(posts[0].slug, 'demo-trufa');
  // Normalización del payload del canal.
  assert.equal(posts[0].content, '<p>Trufa es una gata sociable.</p>');
  assert.equal(posts[0].date, '2026-11-20T10:00:00.000Z');
  assert.equal(posts[0].image, 'https://img.test/trufa.jpg');
});

test('perros: pide solo su especie', async () => {
  const { api, llamadas } = entorno();
  await api.load(['perros']);

  const canal = llamadasAlCanal(llamadas);
  assert.equal(canal.length, 1);
  assert.equal(new URL(canal[0]).searchParams.get('species'), 'perro');
  assert.equal(llamadasAlJson(llamadas).length, 0);
  assert.deepEqual(Array.from(api.getPostsFor('perros').map(function (p) { return p.slug; })), ['demo-nube', 'demo-laia']);
});

test('historias: pide su feed y no el catálogo', async () => {
  const { api, llamadas } = entorno();
  await api.load(['historias']);

  const canal = llamadasAlCanal(llamadas);
  assert.equal(canal.length, 1);
  assert.equal(new URL(canal[0]).searchParams.get('endpoint'), 'historias-publicas');
  assert.equal(llamadasAlJson(llamadas).length, 0);
  assert.deepEqual(Array.from(api.getPostsFor('historias').map(function (p) { return p.slug; })), ['demo-un-ano-de-adopciones']);
});

test('la misma sección se pide una sola vez', async () => {
  const { api, llamadas } = entorno();
  await api.load(['gatos']);
  await api.load(['gatos']);
  await api.load(['gatos']);
  assert.equal(llamadasAlCanal(llamadas).length, 1);
});

test('ficha: una llamada por slug y post normalizado', async () => {
  const { api, llamadas } = entorno();
  const resultado = await api.loadPost('demo-nube');

  const canal = llamadasAlCanal(llamadas);
  assert.equal(canal.length, 1);
  const url = new URL(canal[0]);
  assert.equal(url.searchParams.get('endpoint'), 'publicacion');
  assert.equal(url.searchParams.get('slug'), 'demo-nube');
  assert.equal(llamadasAlJson(llamadas).length, 0);

  assert.ok(resultado.post);
  assert.equal(resultado.post.title, 'Nube, mestizo de 2 años');
  assert.equal(resultado.post.content, '<p>Nube es un perro tranquilo.</p><p>Se lleva bien con niños.</p>');
  assert.equal(resultado.post.url, 'post.html?slug=demo-nube');
  assert.equal(resultado.post.publication.icons.length, 1);
  assert.equal(resultado.gone, undefined);
});

test('retirada: gone con mensaje y sin ficha', async () => {
  const { api, llamadas } = entorno();
  const resultado = await api.loadPost('demo-lua');

  assert.equal(resultado.post, null);
  assert.equal(resultado.gone, true);
  assert.equal(resultado.message, 'Esta publicación se ha retirado.');
  assert.equal(llamadasAlCanal(llamadas).length, 1);
  assert.equal(llamadasAlJson(llamadas).length, 0, 'una retirada no debe caer al JSON local');
});

test('redirect: devuelve el slug nuevo junto a la ficha', async () => {
  const { api } = entorno();
  const resultado = await api.loadPost('nube-vieja');

  assert.ok(resultado.post);
  assert.equal(resultado.post.slug, 'demo-nube');
  assert.equal(resultado.redirect.slug, 'demo-nube');
});

test('error: cae al JSON local y conserva enlaces antiguos', async () => {
  const { api, llamadas } = entorno();
  const resultado = await api.loadPost('gato-local');

  assert.ok(resultado.post);
  assert.equal(resultado.post.slug, 'gato-local');
  assert.equal(llamadasAlCanal(llamadas).length, 1);
  assert.equal(llamadasAlJson(llamadas).length, 1);
});

test('error con slug desconocido: notFound sin ficha', async () => {
  const { api } = entorno();
  const resultado = await api.loadPost('no-existe');

  assert.equal(resultado.post, null);
  assert.equal(resultado.notFound, true);
  assert.equal(resultado.message, 'Publicación no encontrada');
});

test('canal caído: la sección degrada al JSON local', async () => {
  const { api, llamadas, avisos } = entorno({
    responder(url) {
      if (url.indexOf(CANAL) === 0) return new Error('sin red');
      return responderPorDefecto(url);
    }
  });

  await api.load(['gatos']);

  assert.equal(llamadasAlCanal(llamadas).length, 1);
  assert.equal(llamadasAlJson(llamadas).length, 1, 'debe bajar el JSON al degradar');
  assert.deepEqual(Array.from(api.getPostsFor('gatos').map(function (p) { return p.slug; })), ['gato-local']);
  assert.ok(avisos.some(function (aviso) { return aviso.indexOf('se mantiene fake') !== -1; }));
});

test('canal caído en el detalle: usa la ficha local', async () => {
  const { api } = entorno({
    responder(url) {
      if (url.indexOf(CANAL) === 0) return new Error('sin red');
      return responderPorDefecto(url);
    }
  });

  const resultado = await api.loadPost('gato-local');
  assert.ok(resultado.post);
  assert.equal(resultado.post.slug, 'gato-local');
});

test('listado excluye publicaciones retiradas o redirigidas', async () => {
  const base = FIXTURES.gatos;
  const conGone = JSON.parse(JSON.stringify(base));
  conGone.data = conGone.data.concat([
    { slug: 'gato-gone', title: 'Gato gone', category: 'Gatos en adopci�n', status: 'gone' },
    { slug: 'gato-redirect', title: 'Gato redirect', category: 'Gatos en adopci�n', redirect: { to: 'otro' } }
  ]);
  const { api } = entorno({
    responder(url) {
      if (url.indexOf(CANAL) === 0) {
        const u = new URL(url);
        if (u.searchParams.get('endpoint') === 'animales-publicos') return conGone;
        return responderPorDefecto(url);
      }
      return responderPorDefecto(url);
    }
  });
  await api.load(['gatos']);
  const slugs = api.getPostsFor('gatos').map(function (p) { return p.slug; });
  assert.ok(slugs.indexOf('gato-gone') === -1, 'gone excluido');
  assert.ok(slugs.indexOf('gato-redirect') === -1, 'redirect excluido');
});
