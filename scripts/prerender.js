#!/usr/bin/env node
/*
 * Prerender de fichas y sitemap (F1: plan en memoria, sin escribir).
 *
 * Uso:
 *   node scripts/prerender.js --dry
 *   node scripts/prerender.js --dry --fixture tests/fixtures/prerender
 *   node scripts/prerender.js --dry --site-url https://ejemplo.test/main
 *
 * La escritura de páginas llega en F2 y el sitemap/robots en F3; por eso sin
 * --dry el script sale con error en vez de fingir que ha publicado.
 *
 * Contrato del canal (comprobado en vivo): el listado ya trae `seo`,
 * `contentHtml`, `updatedAt` y `type`; `sitemap` puede venir vacío con `notice`
 * cuando no hay dominio público y no debe considerarse un fallo.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const paginasMod = require(path.join(__dirname, 'prerender-paginas.js'));

const RAIZ = path.resolve(__dirname, '..');
const SITE_POR_DEFECTO = 'https://gn-admin.github.io/main';
const PAGINAS_FIJAS = [
  '',
  'gatos-en-adopcion.html',
  'perros-en-adopcion.html',
  'historias.html',
  'sobre-nosotros.html',
  'adopciones.html',
  'protocolo.html',
  'contacto.html'
];
const MAX_PAGINAS = 50;
const ESTADOS_OCULTOS = ['borrador', 'oculto'];

// ---------- utilidades ----------

function slugSeguro(valor) {
  if (valor === undefined || valor === null) return null;
  var slug = String(valor).trim();
  if (!slug || slug === '.' || slug === '..') return null;
  if (slug.indexOf('/') !== -1 || slug.indexOf('\\') !== -1) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug)) return null;
  return slug;
}

function urlEstatica(siteUrl, slug) {
  var base = String(siteUrl || SITE_POR_DEFECTO).trim().replace(/\/+$/, '');
  return base + '/publicaciones/' + encodeURIComponent(slugSeguro(slug) || '') + '.html';
}

function urlRaiz(siteUrl) {
  return String(siteUrl || SITE_POR_DEFECTO).trim().replace(/\/+$/, '') + '/';
}

function normalizarRetirada(fila) {
  if (!fila) return null;
  var slug = slugSeguro(fila.slug || fila.id);
  if (!slug) return null;
  return {
    slug: slug,
    tipo: fila.tipo || fila.type || '',
    fecha: fila.retiradoEn || fila.retirado_en || fila.fecha || ''
  };
}

function resolverDestino(siteUrl, valor) {
  var destino = String(valor || '').trim();
  if (!destino) return { error: 'destino vacío' };
  if (/^[a-z][a-z0-9+.-]*:/i.test(destino)) {
    if (!/^https?:\/\//i.test(destino)) {
      return { error: 'protocolo no permitido: ' + destino.split(':')[0] };
    }
    var url;
    try {
      url = new URL(destino);
    } catch (err) {
      return { error: 'URL no válida: ' + destino };
    }
    if (url.username || url.password) return { error: 'URL con credenciales' };
    return { url: url.toString(), destinoSlug: null };
  }
  if (destino.indexOf('//') === 0) return { error: 'URL sin protocolo: ' + destino };
  var slug = slugSeguro(destino);
  if (!slug) return { error: 'destino no válido: ' + destino };
  return { url: urlEstatica(siteUrl, slug), destinoSlug: slug };
}

function normalizarRedirect(fila) {
  if (!fila) return null;
  var slug = slugSeguro(fila.slug || fila.desde || fila.from);
  var destino = fila.to || fila.destino || fila.nuevoSlug || fila.destinoSlug || fila.url || '';
  return { slug: slug, destino: String(destino || '').trim() };
}

function esIndexable(publicacion) {
  var estado = String((publicacion && publicacion.status) || '').toLowerCase();
  if (ESTADOS_OCULTOS.indexOf(estado) !== -1) return false;
  var robots = String((publicacion && publicacion.seo && publicacion.seo.robots) || '');
  return robots.toLowerCase().indexOf('noindex') === -1;
}

function fechaDe(publicacion) {
  return (publicacion && (publicacion.updatedAt || publicacion.publishedAt)) || '';
}

// ---------- configuración ----------

function cargarConfig() {
  var archivo = path.join(RAIZ, 'js', 'data-source.js');
  var codigo = fs.readFileSync(archivo, 'utf8');
  var sandbox = {
    window: {},
    console: { log() {}, warn() {}, error() {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(codigo, sandbox);
  var cfg = sandbox.window.NEBAK_DATA_SOURCE;
  if (!cfg || !cfg.endpointBase) {
    throw new Error('js/data-source.js no define endpointBase');
  }
  var opciones = cfg.options || {};
  return {
    endpointBase: String(cfg.endpointBase).replace(/\/+$/, ''),
    pageSize: Math.min(50, Math.max(1, Number(opciones.pageSize) || 24)),
    timeoutMs: Number(opciones.timeoutMs) || 15000
  };
}

// ---------- canal ----------

function clienteCanal(config) {
  return async function consultar(endpoint, params) {
    var url = new URL(config.endpointBase);
    url.searchParams.set('endpoint', endpoint);
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, config.timeoutMs);
    try {
      var res = await fetch(url.toString(), { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' en ' + endpoint);
      var json = JSON.parse(await res.text());
      if (!json || !json.status) throw new Error('Respuesta sin envoltorio en ' + endpoint);
      return json;
    } finally {
      clearTimeout(timer);
    }
  };
}

async function descargarListado(consultar, pageSize) {
  var items = [];
  var vistos = {};
  var duplicados = 0;
  var page = 1;
  var totalPages = 1;
  do {
    var res = await consultar('publicaciones', { pageSize: pageSize, page: page });
    if (res.status !== 'success') throw new Error('Listado: ' + (res.error || res.status));
    (Array.isArray(res.data) ? res.data : []).forEach(function (fila) {
      var slug = fila && fila.slug;
      if (slug && vistos[slug]) {
        // El canal puede solapar páginas si el contenido cambia entre
        // peticiones: se conserva la primera aparición.
        duplicados += 1;
        return;
      }
      if (slug) vistos[slug] = true;
      items.push(fila);
    });
    totalPages = (res.pagination && Number(res.pagination.totalPages)) || 1;
    page += 1;
  } while (page <= totalPages && page <= MAX_PAGINAS);
  return { items: items, paginas: Math.min(totalPages, MAX_PAGINAS), duplicados: duplicados };
}

// ---------- fixtures ----------

function leerJson(dir, nombre) {
  var archivo = path.join(dir, nombre);
  if (!fs.existsSync(archivo)) return null;
  return JSON.parse(fs.readFileSync(archivo, 'utf8'));
}

function cargarFixtures(dir) {
  var listado = leerJson(dir, 'listado.json');
  if (!listado) throw new Error('Falta listado.json en ' + dir);
  return {
    publicaciones: Array.isArray(listado.data) ? listado.data : [],
    retiradas: (leerJson(dir, 'retiradas.json') || {}).data || [],
    redirects: (leerJson(dir, 'redirects.json') || {}).data || [],
    sitemap: leerJson(dir, 'sitemap.json') || null
  };
}

// ---------- plan ----------

function construirPlan(datos, opciones) {
  var opts = opciones || {};
  var siteUrl = String(opts.siteUrl || SITE_POR_DEFECTO).trim().replace(/\/+$/, '');
  var publicaciones = Array.isArray(datos.publicaciones) ? datos.publicaciones : [];
  var retiradas = (Array.isArray(datos.retiradas) ? datos.retiradas : []).map(normalizarRetirada).filter(Boolean);
  var redirects = (Array.isArray(datos.redirects) ? datos.redirects : []).map(normalizarRedirect).filter(Boolean);

  var errores = [];
  var avisos = [];
  var retiradasPorSlug = {};
  var redirectsPorSlug = {};
  var vistos = {};

  retiradas.forEach(function (fila) {
    if (!retiradasPorSlug[fila.slug]) retiradasPorSlug[fila.slug] = fila;
  });

  redirects.forEach(function (fila) {
    if (!fila.slug) {
      errores.push('Redirect sin slug: ' + JSON.stringify(fila));
      return;
    }
    if (!fila.destino) {
      errores.push('Redirect sin destino: ' + fila.slug);
      return;
    }
    var destino = resolverDestino(siteUrl, fila.destino);
    if (destino.error) {
      errores.push('Redirect ' + fila.slug + ': ' + destino.error);
      return;
    }
    redirectsPorSlug[fila.slug] = { slug: fila.slug, destino: destino.url, destinoSlug: destino.destinoSlug };
  });

  var paginas = [];
  publicaciones.forEach(function (pub) {
    var slug = slugSeguro(pub && pub.slug);
    if (!slug) {
      errores.push('Slug no válido: ' + JSON.stringify(pub && pub.slug));
      return;
    }
    if (vistos[slug]) {
      avisos.push('Slug duplicado en el listado, se conserva el primero: ' + slug);
      return;
    }
    vistos[slug] = true;
    var indexable = esIndexable(pub) && !retiradasPorSlug[slug] && !redirectsPorSlug[slug];
    paginas.push({
      slug: slug,
      tipo: pub.type || '',
      url: urlEstatica(siteUrl, slug),
      canonical: urlEstatica(siteUrl, slug),
      indexable: indexable,
      lastmod: fechaDe(pub)
    });
  });

  Object.keys(redirectsPorSlug).forEach(function (slug) {
    var info = redirectsPorSlug[slug];
    if (info.destinoSlug && !vistos[info.destinoSlug]) {
      avisos.push('Redirect ' + slug + ' apunta a un slug no publicado: ' + info.destinoSlug);
    }
  });

  var fichasRetiradas = retiradas.map(function (fila) {
    return { slug: fila.slug, url: urlEstatica(siteUrl, fila.slug), fecha: fila.fecha };
  });
  var fichasRedirect = Object.keys(redirectsPorSlug).map(function (slug) {
    return { slug: slug, url: urlEstatica(siteUrl, slug), destino: redirectsPorSlug[slug].destino };
  });

  var urls = PAGINAS_FIJAS.map(function (ruta) {
    return { loc: ruta ? siteUrl + '/' + ruta : urlRaiz(siteUrl), lastmod: '' };
  });
  paginas.filter(function (p) { return p.indexable; }).forEach(function (p) {
    urls.push({ loc: p.canonical, lastmod: p.lastmod });
  });

  var sitemapCanal = datos.sitemap;
  if (sitemapCanal) {
    if (sitemapCanal.status !== 'success') {
      avisos.push('sitemap del canal: ' + (sitemapCanal.error || sitemapCanal.status));
    } else if (!Array.isArray(sitemapCanal.data) || !sitemapCanal.data.length) {
      avisos.push('sitemap del canal vacío' + (sitemapCanal.notice ? ': ' + sitemapCanal.notice : ''));
    }
  }

  var repetidas = {};
  urls.forEach(function (fila) {
    if (repetidas[fila.loc]) errores.push('URL duplicada en sitemap: ' + fila.loc);
    repetidas[fila.loc] = true;
  });

  return {
    siteUrl: siteUrl,
    paginas: paginas,
    retiradas: fichasRetiradas,
    redirects: fichasRedirect,
    sitemap: urls,
    avisos: avisos,
    errores: errores
  };
}

// ---------- CLI ----------

function argumentos(argv) {
  var args = { dry: false, soft: false, fixture: '', out: 'publicaciones', siteUrl: SITE_POR_DEFECTO, help: false };
  for (var i = 0; i < argv.length; i++) {
    var arg = argv[i];
    if (arg === '--dry') args.dry = true;
    else if (arg === '--soft') args.soft = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--fixture') args.fixture = argv[++i] || '';
    else if (arg.indexOf('--fixture=') === 0) args.fixture = arg.slice('--fixture='.length);
    else if (arg === '--site-url') args.siteUrl = argv[++i] || args.siteUrl;
    else if (arg.indexOf('--site-url=') === 0) args.siteUrl = arg.slice('--site-url='.length);
    else if (arg === '--out') args.out = argv[++i] || args.out;
    else if (arg.indexOf('--out=') === 0) args.out = arg.slice('--out='.length);
    else throw new Error('Opción desconocida: ' + arg);
  }
  return args;
}

function textoResumen(plan, args) {
  var indexables = plan.paginas.filter(function (p) { return p.indexable; }).length;
  var lineas = [];
  lineas.push('Prerender (F2, ' + (args.dry ? 'dry run' : 'escritura') + ')');
  lineas.push('SITE_URL: ' + plan.siteUrl);
  lineas.push('publicaciones: ' + plan.paginas.length + ' (' + indexables + ' indexables)');
  lineas.push('retiradas: ' + plan.retiradas.length);
  lineas.push('redirects: ' + plan.redirects.length);
  lineas.push('sitemap: ' + plan.sitemap.length + ' URLs');
  plan.avisos.forEach(function (aviso) { lineas.push('aviso: ' + aviso); });
  plan.errores.forEach(function (error) { lineas.push('error: ' + error); });
  if (args.dry) {
    lineas.push('páginas a escribir: ' + indexables);
    lineas.push('muestra: ' + plan.sitemap.slice(0, 3).map(function (u) { return u.loc; }).join(' · '));
  } else {
    lineas.push('destino: ' + args.out);
  }
  return lineas.join('\n');
}

async function main(argv) {
  var args;
  try {
    args = argumentos(argv);
  } catch (err) {
    console.error(err.message);
    return 1;
  }
  if (args.help) {
    console.log('Uso: node scripts/prerender.js [--dry] [--fixture <dir>] [--out <dir>] [--site-url <url>] [--soft]');
    return 0;
  }

  var config = cargarConfig();
  var datos;
  if (args.fixture) {
    datos = cargarFixtures(args.fixture);
  } else {
    var consultar = clienteCanal(config);
    var listado = await descargarListado(consultar, config.pageSize);
    datos = {
      publicaciones: listado.items,
      retiradas: (await consultar('retiradas', {})).data || [],
      redirects: (await consultar('redirects', {})).data || [],
      sitemap: await consultar('sitemap', {})
    };
  }

  var plan = construirPlan(datos, { siteUrl: args.siteUrl });
  console.log(textoResumen(plan, args));

  if (plan.errores.length && !args.soft) return 1;
  if (args.dry) return 0;

  var consultarEscritura = args.fixture ? null : clienteCanal(config);
  var detalles = await paginasMod.cargarDetalles(datos.publicaciones, {
    fixture: args.fixture,
    consultar: consultarEscritura
  });
  var shell = fs.readFileSync(path.join(RAIZ, 'post.html'), 'utf8');
  var porSlug = {};
  datos.publicaciones.forEach(function (pub) { porSlug[pub.slug] = pub; });
  var paginas = plan.paginas.filter(function (pagina) { return pagina.indexable; }).map(function (pagina) {
    var post = paginasMod.prepararPost(porSlug[pagina.slug], detalles[pagina.slug]);
    return { slug: pagina.slug, html: paginasMod.generarHtml(post, pagina, shell, plan.siteUrl) };
  });
  var destino = path.resolve(process.cwd(), args.out);
  var resultado = paginasMod.escribirPaginas(paginas, destino);
  var extra = resultado.eliminadas.length ? ' · eliminadas: ' + resultado.eliminadas.length : '';
  console.log('escritas: ' + resultado.escritas + ' páginas en ' + destino + extra);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(function (codigo) {
    process.exitCode = codigo;
  }).catch(function (err) {
    console.error('prerender: ' + (err && err.message ? err.message : err));
    process.exitCode = 1;
  });
}

module.exports = {
  PAGINAS_FIJAS,
  SITE_POR_DEFECTO,
  argumentos,
  cargarConfig,
  cargarFixtures,
  construirPlan,
  descargarListado,
  normalizarRedirect,
  resolverDestino,
  normalizarRetirada,
  slugSeguro,
  textoResumen,
  urlEstatica
};
