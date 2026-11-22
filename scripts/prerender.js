#!/usr/bin/env node
/*
 * Prerender de fichas, lápidas, redirecciones, sitemap y robots (F3).
 *
 * Uso:
 *   node scripts/prerender.js --dry
 *   node scripts/prerender.js --dry --fixture tests/fixtures/prerender
 *   node scripts/prerender.js --out publicaciones --root .
 *
 * Sin --dry escribe las fichas indexables, una lápida por retirada, una página
 * de paso por redirect y los sitemap.xml/robots.txt de la raíz de --out.
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

// ---------- sitemap y robots ----------

function xmlEscape(valor) {
  return String(valor === undefined || valor === null ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function atributoHtml(valor) {
  // Mismo escape que PostTemplate.esc: el apóstrofe no se toca en atributos.
  return xmlEscape(valor).replace(/&apos;/g, "'");
}

function fechaSitemap(valor) {
  var m = /^(\d{4}-\d{2}-\d{2})/.exec(String(valor || ''));
  return m ? m[1] : '';
}

function sitemapXml(urls) {
  var lineas = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  ];
  (urls || []).forEach(function (fila) {
    var lastmod = fechaSitemap(fila.lastmod);
    lineas.push('  <url><loc>' + xmlEscape(fila.loc) + '</loc>' +
      (lastmod ? '<lastmod>' + lastmod + '</lastmod>' : '') + '</url>');
  });
  lineas.push('</urlset>');
  return lineas.join('\n') + '\n';
}

function robotsTxt(siteUrl) {
  var base = String(siteUrl || SITE_POR_DEFECTO).replace(/\/+$/, '');
  var ruta = '/';
  try {
    ruta = new URL(base).pathname.replace(/\/+$/, '') + '/';
  } catch (err) {
    ruta = '/';
  }
  return 'User-agent: *\n' +
    'Allow: /\n' +
    'Disallow: ' + ruta + 'post.html\n\n' +
    'Sitemap: ' + base + '/sitemap.xml\n';
}

function contar(html, re) {
  return (String(html).match(re) || []).length;
}

// La salida no se escribe si el sitemap, robots o alguna página no cuadran.
function validarSalida(salida) {
  var errores = [];
  var paginas = (salida && salida.paginas) || [];
  var plan = (salida && salida.plan) || { sitemap: [] };
  var xml = String((salida && salida.sitemapXml) || '');
  var robots = String((salida && salida.robotsTexto) || '');

  if (xml.indexOf('<?xml') !== 0) errores.push('sitemap.xml sin declaración XML');
  if (!/<urlset[^>]*>/.test(xml)) errores.push('sitemap.xml sin <urlset>');
  if (!/<\/urlset>/.test(xml)) errores.push('sitemap.xml sin cierre </urlset>');

  var locs = [];
  xml.replace(/<loc>([\s\S]*?)<\/loc>/g, function (todo, loc) { locs.push(loc); });
  if (!locs.length) errores.push('sitemap.xml sin ninguna URL');
  var vistos = {};
  locs.forEach(function (loc) {
    if (vistos[loc]) errores.push('URL duplicada en sitemap.xml: ' + loc);
    vistos[loc] = true;
    if (!/^https?:\/\//.test(loc)) errores.push('URL no absoluta en sitemap.xml: ' + loc);
  });

  var esperadas = (plan.sitemap || []).map(function (fila) { return fila.loc; });
  if (locs.length !== esperadas.length) {
    errores.push('sitemap.xml no cuadra: ' + locs.length + ' URLs frente a ' + esperadas.length + ' esperadas');
  }
  esperadas.forEach(function (loc) {
    if (!vistos[xmlEscape(loc)]) errores.push('Falta en sitemap.xml: ' + loc);
  });

  if (!/^User-agent: \*/m.test(robots)) errores.push('robots.txt sin User-agent');
  if (!/^Allow: \//m.test(robots)) errores.push('robots.txt sin Allow: /');
  if (!/^Sitemap: https?:\/\//m.test(robots)) errores.push('robots.txt sin línea Sitemap:');

  paginas.forEach(function (pagina) {
    var html = String(pagina.html || '');
    var nombre = pagina.slug || '(sin slug)';
    var canon = contar(html, /<link rel="canonical"/g);
    var json = contar(html, /application\/ld\+json/g);
    if (!html) {
      errores.push(nombre + ': HTML vacío');
      return;
    }
    if (pagina.estado === 'retirada' || pagina.retirada) {
      if (!/name="robots" content="noindex,nofollow"/.test(html)) errores.push(nombre + ' (retirada): falta robots noindex,nofollow');
      if (canon) errores.push(nombre + ' (retirada): no debe llevar canonical');
      if (json) errores.push(nombre + ' (retirada): no debe llevar JSON-LD');
      if (html.indexOf('Contenido retirado') === -1) errores.push(nombre + ' (retirada): falta el mensaje');
    } else if (pagina.estado === 'redirect' || pagina.redirect) {
      if (!/name="robots" content="noindex,follow"/.test(html)) errores.push(nombre + ' (redirect): falta robots noindex,follow');
      if (canon !== 1) errores.push(nombre + ' (redirect): se esperaba 1 canonical y hay ' + canon);
      if (pagina.destino && html.indexOf('rel="canonical" href="' + atributoHtml(pagina.destino) + '"') === -1) {
        errores.push(nombre + ' (redirect): canonical no apunta al destino');
      }
      if (!/http-equiv="refresh"/.test(html)) errores.push(nombre + ' (redirect): falta meta refresh');
      if (json) errores.push(nombre + ' (redirect): no debe llevar JSON-LD');
    } else if (pagina.indexable) {
      if (canon !== 1) errores.push(nombre + ': se esperaba 1 canonical y hay ' + canon);
      if (!json) errores.push(nombre + ': falta JSON-LD');
      if (/name="robots" content="[^"]*noindex/.test(html)) errores.push(nombre + ': no debe ser noindex');
    }
  });

  return errores;
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

    var retirada = retiradasPorSlug[slug];
    var redirect = redirectsPorSlug[slug];
    if (retirada) {
      paginas.push({
        slug: slug,
        tipo: pub.type || '',
        url: urlEstatica(siteUrl, slug),
        canonical: null,
        indexable: false,
        lastmod: retirada.fecha || fechaDe(pub),
        estado: 'retirada',
        retirada: true,
        fecha: retirada.fecha || ''
      });
      return;
    }
    if (redirect) {
      avisos.push('Redirect sustituye a la ficha publicada: ' + slug);
      paginas.push({
        slug: slug,
        tipo: 'redirect',
        url: urlEstatica(siteUrl, slug),
        canonical: redirect.destino,
        destino: redirect.destino,
        indexable: false,
        lastmod: '',
        estado: 'redirect',
        redirect: true
      });
      return;
    }
    if (!esIndexable(pub)) return;
    paginas.push({
      slug: slug,
      tipo: pub.type || '',
      url: urlEstatica(siteUrl, slug),
      canonical: urlEstatica(siteUrl, slug),
      indexable: true,
      lastmod: fechaDe(pub),
      estado: 'ficha'
    });
  });

  retiradas.forEach(function (fila) {
    if (vistos[fila.slug]) return;
    vistos[fila.slug] = true;
    paginas.push({
      slug: fila.slug,
      tipo: fila.tipo || '',
      url: urlEstatica(siteUrl, fila.slug),
      canonical: null,
      indexable: false,
      lastmod: fila.fecha || '',
      estado: 'retirada',
      retirada: true,
      fecha: fila.fecha || ''
    });
  });

  Object.keys(redirectsPorSlug).forEach(function (slug) {
    if (vistos[slug]) return;
    var info = redirectsPorSlug[slug];
    vistos[slug] = true;
    paginas.push({
      slug: slug,
      tipo: 'redirect',
      url: urlEstatica(siteUrl, slug),
      canonical: info.destino,
      destino: info.destino,
      indexable: false,
      lastmod: '',
      estado: 'redirect',
      redirect: true
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
  var args = { dry: false, soft: false, fixture: '', out: 'publicaciones', root: '.', siteUrl: SITE_POR_DEFECTO, help: false };
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
    else if (arg === '--root') args.root = argv[++i] || args.root;
    else if (arg.indexOf('--root=') === 0) args.root = arg.slice('--root='.length);
    else throw new Error('Opción desconocida: ' + arg);
  }
  return args;
}

function textoResumen(plan, args) {
  var cuenta = { ficha: 0, retirada: 0, redirect: 0 };
  plan.paginas.forEach(function (pagina) {
    if (cuenta[pagina.estado] !== undefined) cuenta[pagina.estado] += 1;
  });
  var total = plan.paginas.length;
  var lineas = [];
  lineas.push('Prerender (F3, ' + (args.dry ? 'dry run' : 'escritura') + ')');
  lineas.push('SITE_URL: ' + plan.siteUrl);
  lineas.push('publicaciones: ' + cuenta.ficha + ' (' + cuenta.ficha + ' indexables)');
  lineas.push('páginas: ' + total + ' (fichas ' + cuenta.ficha + ' · lápidas ' + cuenta.retirada + ' · redirects ' + cuenta.redirect + ')');
  lineas.push('retiradas: ' + plan.retiradas.length);
  lineas.push('redirects: ' + plan.redirects.length);
  lineas.push('sitemap: ' + plan.sitemap.length + ' URLs');
  plan.avisos.forEach(function (aviso) { lineas.push('aviso: ' + aviso); });
  plan.errores.forEach(function (error) { lineas.push('error: ' + error); });
  if (args.dry) {
    lineas.push('páginas a escribir: ' + total);
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
    console.log('Uso: node scripts/prerender.js [--dry] [--fixture <dir>] [--out <dir>] [--root <dir>] [--site-url <url>] [--soft]');
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

  var fichas = plan.paginas.filter(function (pagina) { return pagina.indexable; });
  var slugsFicha = {};
  fichas.forEach(function (pagina) { slugsFicha[pagina.slug] = true; });
  var publicacionesFicha = datos.publicaciones.filter(function (pub) {
    return slugsFicha[slugSeguro(pub && pub.slug)];
  });

  var consultarEscritura = args.fixture ? null : clienteCanal(config);
  var detalles = await paginasMod.cargarDetalles(publicacionesFicha, {
    fixture: args.fixture,
    consultar: consultarEscritura
  });
  var shell = fs.readFileSync(path.join(RAIZ, 'post.html'), 'utf8');
  var porSlug = {};
  datos.publicaciones.forEach(function (pub) { porSlug[pub.slug] = pub; });

  var paginas = plan.paginas.map(function (pagina) {
    if (pagina.estado === 'retirada') {
      return {
        slug: pagina.slug,
        estado: 'retirada',
        retirada: true,
        html: paginasMod.paginaRetirada(shell)
      };
    }
    if (pagina.estado === 'redirect') {
      return {
        slug: pagina.slug,
        estado: 'redirect',
        redirect: true,
        destino: pagina.destino,
        html: paginasMod.paginaRedirect(pagina.destino)
      };
    }
    var post = paginasMod.prepararPost(porSlug[pagina.slug], detalles[pagina.slug]);
    return {
      slug: pagina.slug,
      estado: 'ficha',
      indexable: true,
      html: paginasMod.generarHtml(post, pagina, shell, plan.siteUrl)
    };
  });

  var sitemapTexto = sitemapXml(plan.sitemap);
  var robotsTexto = robotsTxt(plan.siteUrl);
  var erroresSalida = validarSalida({
    plan: plan,
    paginas: paginas,
    sitemapXml: sitemapTexto,
    robotsTexto: robotsTexto
  });
  if (erroresSalida.length) {
    erroresSalida.forEach(function (error) { console.error('error: ' + error); });
    if (!args.soft) return 1;
  }

  var destino = path.resolve(process.cwd(), args.out);
  var raiz = path.resolve(process.cwd(), args.root);
  var resultado = paginasMod.escribirPaginas(paginas, destino, {
    sitemap: sitemapTexto,
    robots: robotsTexto,
    root: raiz
  });
  var extra = resultado.eliminadas.length ? ' · eliminadas: ' + resultado.eliminadas.length : '';
  console.log('escritas: ' + resultado.escritas + ' páginas en ' + destino + extra + ' · sitemap.xml y robots.txt en ' + raiz);
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


function validarFichaHtml(html, esperado) {
  var errores = [];
  var texto = String(html || '');
  var canonEsperada = (esperado && esperado.canonical) ? String(esperado.canonical) : '';
  var scripts = texto.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || [];
  if (scripts.length !== 1) errores.push('se esperaba 1 bloque JSON-LD y hay ' + scripts.length);
  else {
    var jsonLd = scripts[0].replace(/^<script[^>]*>|<\/script>$/g, '');
    try {
      var data = JSON.parse(jsonLd);
      if (!data || data['@context'] !== 'https://schema.org') errores.push('JSON-LD sin @context schema.org');
      if (!data || !data['@type']) errores.push('JSON-LD sin @type');
      if (canonEsperada) {
        var id = data && data.mainEntityOfPage && data.mainEntityOfPage['@id'];
        if (id !== canonEsperada) errores.push('JSON-LD mainEntityOfPage no coincide con canonical');
      }
    } catch (e) {
      errores.push('JSON-LD no parseable: ' + e.message);
    }
  }
  var canonicals = texto.match(/<link rel="canonical" href="[^"]*">/g) || [];
  if (canonicals.length !== 1) errores.push('se esperaba 1 canonical y hay ' + canonicals.length);
  if (canonEsperada && canonicals.length === 1) {
    var href = canonicals[0].match(/href="([^"]*)"/);
    if (!href || href[1] !== canonEsperada) errores.push('canonical no coincide con la URL esperada');
  }
  return errores;
}



function validarLapidaHtml(html) {
  var texto = String(html || '');
  var errores = [];
  if (!/<meta name="robots" content="noindex,nofollow">/.test(texto)) errores.push('falta robots noindex,nofollow');
  if (/<link rel="canonical"/.test(texto)) errores.push('no debe llevar canonical');
  if (/application\/ld\+json/.test(texto)) errores.push('no debe llevar JSON-LD');
  return errores;
}

function validarRedirectHtml(html, destino) {
  var texto = String(html || '');
  var errores = [];
  if (!/<meta name="robots" content="noindex,follow">/.test(texto)) errores.push('falta robots noindex,follow');
  var canonicals = texto.match(/<link rel="canonical" href="[^"]*">/g) || [];
  if (canonicals.length !== 1) errores.push('se esperaba 1 canonical y hay ' + canonicals.length);
  else if (destino) {
    var href = canonicals[0].match(/href="([^"]*)"/);
    if (!href || href[1] !== String(destino)) errores.push('canonical no apunta al destino');
  }
  if (/application\/ld\+json/.test(texto)) errores.push('no debe llevar JSON-LD');
  return errores;
}


module.exports = {
  PAGINAS_FIJAS,
  SITE_POR_DEFECTO,
  argumentos,
  cargarConfig,
  cargarFixtures,
  construirPlan,
  descargarListado,
  fechaSitemap,
  robotsTxt,
  sitemapXml,
  validarSalida,
  validarFichaHtml,
  validarLapidaHtml,
  validarRedirectHtml,
  validarFichaHtml,
  xmlEscape,
  normalizarRedirect,
  resolverDestino,
  normalizarRetirada,
  slugSeguro,
  textoResumen,
  urlEstatica
};
