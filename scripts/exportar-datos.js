#!/usr/bin/env node
/*
 * Exporta datos del canal público a JSON estático en `data/`.
 *
 * Uso:
 *   node scripts/exportar-datos.js --dry
 *   node scripts/exportar-datos.js --soft
 *   node scripts/exportar-datos.js --fixture tests/fixtures/prerender
 *
 * El script es idempotente: escribe a un `.tmp` y solo reemplaza el archivo
 * anterior si la respuesta es válida. Si una llamada falla y ya existe un
 * archivo bueno, se conserva (modo `--soft` no falla por endpoints opcionales).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.resolve(__dirname, '..');
const DATA_DIR = path.join(RAIZ, 'data');
const SITE_URL = (process.env.SITE_URL || 'https://gn-admin.github.io/main').replace(/\/+$/, '');
const MAX_PAGINAS = 50;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const SOFT = args.includes('--soft');
const FIXTURE = valorArg('--fixture');

function valorArg(nombre) {
  const i = args.indexOf(nombre);
  if (i === -1) return '';
  return args[i + 1] && args[i + 1].charAt(0) !== '-' ? args[i + 1] : '';
}

function cargarConfig() {
  const archivo = path.join(RAIZ, 'js', 'data-source.js');
  const codigo = fs.readFileSync(archivo, 'utf8');
  const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sandbox);
  vm.runInContext(codigo, sandbox);
  const cfg = sandbox.window.NEBAK_DATA_SOURCE;
  if (!cfg || !cfg.endpointBase) throw new Error('js/data-source.js no define endpointBase');
  const opciones = cfg.options || {};
  return {
    endpointBase: String(cfg.endpointBase).replace(/\/+$/, ''),
    pageSize: Math.min(50, Math.max(1, Number(opciones.pageSize) || 24)),
    timeoutMs: Number(opciones.timeoutMs) || 15000
  };
}

function clienteCanal(config) {
  return async function consultar(endpoint, params) {
    const url = new URL(config.endpointBase);
    url.searchParams.set('endpoint', endpoint);
    Object.keys(params || {}).forEach(function (key) {
      const value = params[key];
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, config.timeoutMs);
    try {
      const res = await fetch(url.toString(), { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' en ' + endpoint);
      const json = JSON.parse(await res.text());
      if (!json || !json.status) throw new Error('Respuesta sin envoltorio en ' + endpoint);
      return json;
    } finally {
      clearTimeout(timer);
    }
  };
}

async function descargarListado(consultar, pageSize) {
  const items = [];
  const vistos = {};
  let page = 1;
  let totalPages = 1;
  let total = 0;
  do {
    const res = await consultar('publicaciones', { pageSize: pageSize, page: page });
    if (res.status !== 'success') throw new Error('Listado: ' + (res.error || res.status));
    (Array.isArray(res.data) ? res.data : []).forEach(function (fila) {
      const slug = fila && fila.slug;
      if (slug && vistos[slug]) return;
      if (slug) vistos[slug] = true;
      items.push(fila);
    });
    totalPages = (res.pagination && Number(res.pagination.totalPages)) || 1;
    total = (res.pagination && Number(res.pagination.total)) || items.length;
    page += 1;
  } while (page <= totalPages && page <= MAX_PAGINAS);
  return { items: items, paginas: Math.min(totalPages, MAX_PAGINAS), total: total };
}

function escribirJsonAtomico(nombre, obj) {
  const destino = path.join(DATA_DIR, nombre);
  const tmp = destino + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, destino);
}

function existe(nombre) {
  return fs.existsSync(path.join(DATA_DIR, nombre));
}

function leerFixture(nombre) {
  if (!FIXTURE) return null;
  const archivo = path.join(path.resolve(RAIZ, FIXTURE), nombre);
  if (!fs.existsSync(archivo)) return null;
  return JSON.parse(fs.readFileSync(archivo, 'utf8'));
}

function guardar(nombre, obj, errores) {
  if (DRY) {
    console.log('  [dry] ' + nombre + ' listo');
    return true;
  }
  try {
    escribirJsonAtomico(nombre, obj);
    console.log('  escrito ' + nombre);
    return true;
  } catch (err) {
    errores.push(nombre + ': ' + err.message);
    return false;
  }
}

async function exportar() {
  const config = cargarConfig();
  const consultar = clienteCanal(config);
  const errores = [];
  const avisos = [];

  let listado;
  const fixtureListado = leerFixture('listado.json');
  if (fixtureListado) {
    listado = {
      items: Array.isArray(fixtureListado.data) ? fixtureListado.data : [],
      paginas: 1,
      total: Array.isArray(fixtureListado.data) ? fixtureListado.data.length : 0
    };
  } else {
    listado = await descargarListado(consultar, config.pageSize);
  }

  const publicaciones = {
    generatedAt: new Date().toISOString(),
    source: 'gas-canal',
    site: { name: 'Grupo Nebak', url: SITE_URL + '/' },
    posts: listado.items,
    pagination: {
      page: 1,
      pageSize: config.pageSize,
      totalPages: listado.paginas,
      total: listado.total
    }
  };
  guardar('publicaciones.json', publicaciones, errores);

  const opcionales = [
    { nombre: 'retiradas.json', endpoint: 'retiradas', fixture: 'retiradas.json' },
    { nombre: 'redirects.json', endpoint: 'redirects', fixture: 'redirects.json' },
    { nombre: 'taxonomias.json', endpoint: 'taxonomias', fixture: 'taxonomias.json' },
    { nombre: 'config-publica.json', endpoint: 'config-publica', fixture: 'config-publica.json' }
  ];

  for (const item of opcionales) {
    const fixture = leerFixture(item.fixture);
    if (fixture) {
      guardar(item.nombre, Object.assign({ generatedAt: new Date().toISOString(), source: 'fixture' }, fixture), errores);
      continue;
    }
    try {
      const res = await consultar(item.endpoint, {});
      if (res.status !== 'success') throw new Error(res.error || res.status);
      guardar(item.nombre, Object.assign({ generatedAt: new Date().toISOString(), source: 'gas-canal' }, res), errores);
    } catch (err) {
      if (existe(item.nombre)) {
        avisos.push(item.nombre + ': ' + err.message + ' (se conserva el anterior)');
      } else {
        errores.push(item.nombre + ': ' + err.message);
      }
    }
  }

  return { errores, avisos, total: listado.items.length };
}

(async function main() {
  console.log('Exportar datos estáticos');
  console.log('SITE_URL: ' + SITE_URL);
  try {
    const res = await exportar();
    if (res.avisos.length) res.avisos.forEach(function (a) { console.log('aviso: ' + a); });
    if (res.errores.length) {
      res.errores.forEach(function (e) { console.error('error: ' + e); });
      if (!SOFT) process.exit(1);
      console.log('modo --soft: se continúa pese a los errores');
    }
    console.log('publicaciones: ' + res.total);
    console.log(DRY ? 'dry: no se ha escrito nada' : 'datos escritos en data/');
  } catch (err) {
    console.error('error fatal: ' + (err && err.message));
    process.exit(1);
  }
})();
