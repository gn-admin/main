/*
 * Generación de fichas, lápidas y redirecciones estáticas (F2/F3).
 * Usa la misma plantilla que el cliente (js/post-template.js).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PostTemplate = require(path.join(__dirname, '..', 'js', 'post-template.js'));

const SITE_POR_DEFECTO = 'https://gn-admin.github.io/main';

function esc(v) {
  return PostTemplate.esc(v);
}

function absoluta(siteUrl, valor) {
  if (!valor) return '';
  if (/^https?:\/\//i.test(valor)) return valor;
  try {
    return new URL(valor, String(siteUrl).replace(/\/+$/, '') + '/').href;
  } catch (err) {
    return '';
  }
}

function seccionDe(post) {
  const categoria = String((post && post.category) || '');
  if (/gatos/i.test(categoria)) return 'gatos';
  if (/perros/i.test(categoria)) return 'perros';
  return 'historias';
}

// Normaliza el payload del canal al Post que espera la plantilla.
function prepararPost(publicacion, detalle) {
  const post = Object.assign({}, publicacion || {}, detalle || {});
  if (!post.content && post.contentHtml) post.content = post.contentHtml;
  if (!post.image && post.coverImage && post.coverImage.src) post.image = post.coverImage.src;
  if (!post.imageAlt && post.coverImage && post.coverImage.alt) post.imageAlt = post.coverImage.alt;
  if (!post.date && post.publishedAt) post.date = post.publishedAt;
  if (!post.publication && (post.icons || post.gallery || post.videos)) {
    post.publication = {
      schema: 'nebak-post-v1',
      icons: post.icons || [],
      gallery: post.gallery || [],
      videos: post.videos || []
    };
  }
  return post;
}

function tituloSeo(post) {
  const meta = post.seo && post.seo.metaTitle ? post.seo.metaTitle : post.title;
  const titulo = String(meta || post.title || 'Publicación');
  return /Grupo Nebak/.test(titulo) ? titulo : titulo + ' · Grupo Nebak';
}

function descripcionSeo(post) {
  return String((post.seo && post.seo.metaDescription) || post.excerpt || post.title || '');
}

function imagenSeo(post, siteUrl) {
  const src = (post.seo && post.seo.ogImage) ||
    (post.coverImage && post.coverImage.src) ||
    post.image || '';
  return absoluta(siteUrl, src);
}

function jsonLd(post, canonical, siteUrl) {
  const imagen = imagenSeo(post, siteUrl);
  let datos;
  if (post.type === 'evento' && post.event && post.event.startDate) {
    const lugar = post.event.location || {};
    datos = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: post.title,
      description: descripcionSeo(post),
      startDate: post.event.startDate,
      endDate: post.event.endDate || post.event.startDate,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      url: canonical,
      image: imagen,
      location: {
        '@type': 'Place',
        name: lugar.name || 'Grupo Nebak',
        address: lugar.address || ''
      },
      organizer: { '@type': 'Organization', name: 'Grupo Nebak', url: siteUrl }
    };
  } else {
    datos = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: descripcionSeo(post),
      image: imagen,
      datePublished: post.publishedAt || post.date || '',
      dateModified: post.updatedAt || post.publishedAt || post.date || '',
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      url: canonical,
      author: { '@type': 'Organization', name: 'Grupo Nebak' },
      publisher: { '@type': 'Organization', name: 'Grupo Nebak', url: siteUrl }
    };
  }
  return '<script type="application/ld+json">' +
    JSON.stringify(datos).replace(/</g, '\\u003c') +
    '</script>';
}

function cabeceraSeo(post, pagina, siteUrl) {
  const canonical = pagina.canonical;
  const imagen = imagenSeo(post, siteUrl);
  const robots = pagina.indexable
    ? String((post.seo && post.seo.robots) || 'index,follow')
    : 'noindex,nofollow';
  const lineas = [
    '<link rel="canonical" href="' + esc(canonical) + '">',
    '<meta name="robots" content="' + esc(robots) + '">',
    '<meta property="og:type" content="article">',
    '<meta property="og:title" content="' + esc(tituloSeo(post)) + '">',
    '<meta property="og:description" content="' + esc(descripcionSeo(post)) + '">',
    '<meta property="og:url" content="' + esc(canonical) + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + esc(tituloSeo(post)) + '">',
    '<meta name="twitter:description" content="' + esc(descripcionSeo(post)) + '">'
  ];
  if (imagen) {
    lineas.push('<meta property="og:image" content="' + esc(imagen) + '">');
    lineas.push('<meta name="twitter:image" content="' + esc(imagen) + '">');
  }
  lineas.push(jsonLd(post, canonical, siteUrl));
  return lineas.join('\n  ');
}

// Las fichas viven un nivel por debajo: todas las rutas relativas suben uno.
function prefijarRutas(html) {
  return html.replace(/(\s(?:href|src)=")([^"]+)(")/g, function (todo, antes, url, despues) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\.\.\/)/i.test(url)) return todo;
    return antes + '../' + url + despues;
  });
}

function generarHtml(post, pagina, shell, siteUrl) {
  const canonical = pagina.canonical;
  let html = shell;

  html = html.replace(/<title>[^<]*<\/title>/, '<title>' + esc(tituloSeo(post)) + '</title>');
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    '<meta name="description" content="' + esc(descripcionSeo(post)) + '">'
  );
  html = html.replace('</head>', '  ' + cabeceraSeo(post, pagina, siteUrl) + '\n</head>');
  html = html.replace(/<noscript>[\s\S]*?<\/noscript>\s*/g, '');

  const articulo = PostTemplate.renderArticle(post, {
    from: seccionDe(post),
    fallbackImage: function (src) { return src || 'assets/images/logo.jpg'; }
  });
  html = html.replace(
    /<div id="blogPostDetail"><\/div>/,
    '<div id="blogPostDetail">' + articulo + '</div>'
  );

  // La ficha estática no necesita la capa de datos ni el router de historias.
  html = html.replace(
    /<script src="js\/(?:data-source|canal-publico|publicaciones-api|blog-api|blog-render|post-template)\.js[^"]*"><\/script>\s*/g,
    ''
  );
  html = html.replace(
    '</body>',
    '<script src="../js/post-template.js?v=1"></script>\n' +
    '<script>PostTemplate.initCarousels(document);</script>\n' +
    '</body>'
  );

  return prefijarRutas(html);
}

function htmlBase(shell, titulo, descripcion) {
  let html = shell
    .replace(/<title>[^<]*<\/title>/, '<title>' + esc(titulo) + '</title>')
    .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="' + esc(descripcion) + '">')
    .replace(/<noscript>[\s\S]*?<\/noscript>\s*/g, '');
  return html.replace(
    /<script src="js\/(?:data-source|canal-publico|publicaciones-api|blog-api|blog-render|post-template)\.js[^"]*"><\/script>\s*/g,
    ''
  );
}

// Lápida: conserva la URL, pero no compite en buscadores ni tiene canónica.
function paginaRetirada(shell) {
  let html = htmlBase(
    shell,
    'Publicación retirada · Grupo Nebak',
    'Esta publicación se retiró y ya no está disponible.'
  );
  html = html.replace('</head>', '  <meta name="robots" content="noindex,nofollow">\n</head>');
  const cuerpo =
    '<article class="post-sheet">' +
      '<header class="post-hero"><div class="post-hero-copy">' +
        '<p class="eyebrow">Publicación retirada</p>' +
        '<h1>Contenido retirado</h1>' +
        '<p class="lead">Esta publicación se retiró y ya no está disponible. Si llegaste desde un enlace antiguo, puedes volver al inicio o consultar las adopciones e historias actuales.</p>' +
        '<div class="actions">' +
          '<a class="btn btn-primary" href="../index.html">Volver al inicio</a>' +
          '<a class="btn btn-secondary" href="../historias.html">Ver historias</a>' +
        '</div>' +
      '</div></header>' +
    '</article>';
  html = html.replace(/<div id="blogPostDetail"><\/div>/, '<div id="blogPostDetail">' + cuerpo + '</div>');
  return prefijarRutas(html);
}

// Página de paso para un slug histórico: noindex,follow y canónica al destino.
function paginaRedirect(destino) {
  const url = esc(destino);
  const json = JSON.stringify(String(destino)).replace(/</g, '\\u003c');
  return '<!doctype html>\n<html lang="es">\n<head>\n' +
    '  <meta charset="utf-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '  <title>Redirigiendo · Grupo Nebak</title>\n' +
    '  <meta name="robots" content="noindex,follow">\n' +
    '  <link rel="canonical" href="' + url + '">\n' +
    '  <meta http-equiv="refresh" content="0; url=' + url + '">\n' +
    '  <link rel="stylesheet" href="../css/main.css">\n' +
    '  <script>location.replace(' + json + ');</script>\n' +
    '</head>\n<body>\n' +
    '  <main id="contenido" class="section"><div class="container" style="max-width:720px">\n' +
    '    <p class="eyebrow">Esta ficha se ha movido</p>\n' +
    '    <h1>Redirigiendo…</h1>\n' +
    '    <p class="lead">Si no ocurre automáticamente, <a href="' + url + '">continúa a la nueva ficha</a>.</p>\n' +
    '  </div></main>\n' +
    '</body>\n</html>\n';
}

function escribirPaginas(paginas, dir, extras) {
  fs.mkdirSync(dir, { recursive: true });
  const nombres = {};
  paginas.forEach(function (pagina) {
    const archivo = pagina.slug + '.html';
    nombres[archivo] = true;
    fs.writeFileSync(path.join(dir, archivo), pagina.html);
  });
  const extrasDir = (extras && extras.root) ? extras.root : dir;
  fs.mkdirSync(extrasDir, { recursive: true });
  if (extras && extras.sitemap) fs.writeFileSync(path.join(extrasDir, 'sitemap.xml'), extras.sitemap);
  if (extras && extras.robots) fs.writeFileSync(path.join(extrasDir, 'robots.txt'), extras.robots);

  // Solo se limpian fichas .html de primer nivel que ya no se generan.
  const eliminadas = [];
  fs.readdirSync(dir).forEach(function (nombre) {
    if (!/\.html$/.test(nombre) || nombres[nombre]) return;
    const ruta = path.join(dir, nombre);
    try {
      if (fs.statSync(ruta).isFile()) {
        fs.unlinkSync(ruta);
        eliminadas.push(nombre);
      }
    } catch (err) {
      // Si no se puede borrar, se deja y se avisa por consola.
      console.warn('No se pudo borrar ' + ruta + ': ' + err.message);
    }
  });

  return { escritas: paginas.length, eliminadas: eliminadas };
}

// Detalles del canal (ficha/evento). En fixtures se leen de detalles.json.
async function cargarDetalles(publicaciones, opciones) {
  const opts = opciones || {};
  const salida = {};
  if (opts.fixture) {
    let mapa = {};
    const archivoMapa = path.join(opts.fixture, 'detalles.json');
    if (fs.existsSync(archivoMapa)) {
      mapa = JSON.parse(fs.readFileSync(archivoMapa, 'utf8'));
    }
    publicaciones.forEach(function (pub) {
      const archivo = mapa[pub.slug];
      if (!archivo) return;
      const ruta = path.join(opts.fixture, archivo);
      if (!fs.existsSync(ruta)) return;
      const json = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      if (json && json.status === 'success' && json.data) salida[pub.slug] = json.data;
    });
    return salida;
  }

  const consultar = opts.consultar;
  if (!consultar) return salida;
  const pendientes = publicaciones.slice();
  async function trabajador() {
    while (pendientes.length) {
      const pub = pendientes.shift();
      try {
        const res = await consultar('publicacion', { slug: pub.slug });
        if (res && res.status === 'success' && res.data) salida[pub.slug] = res.data;
      } catch (err) {
        // Se genera con lo que ya trae el listado.
      }
    }
  }
  await Promise.all([trabajador(), trabajador(), trabajador()]);
  return salida;
}

module.exports = {
  SITE_POR_DEFECTO,
  absoluta,
  cabeceraSeo,
  cargarDetalles,
  descripcionSeo,
  escribirPaginas,
  generarHtml,
  imagenSeo,
  jsonLd,
  paginaRedirect,
  paginaRetirada,
  prefijarRutas,
  prepararPost,
  seccionDe,
  tituloSeo
};
