/*
 * Pruebas de F1 del prerender: plan en memoria, fixtures reales y CLI --dry.
 *
 * Ejecutar: node --test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'prerender');

const prerender = require(path.join(RAIZ, 'scripts', 'prerender.js'));
const paginasMod = require(path.join(RAIZ, 'scripts', 'prerender-paginas.js'));

function fixture(nombre) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, nombre), 'utf8'));
}

function datos() {
  return {
    publicaciones: fixture('listado.json').data,
    retiradas: fixture('retiradas.json').data,
    redirects: fixture('redirects.json').data,
    sitemap: fixture('sitemap.json')
  };
}

const SITE = 'https://gn-admin.github.io/main';

test('slugSeguro acepta slugs normales y rechaza rutas', () => {
  assert.equal(prerender.slugSeguro('demo-nube'), 'demo-nube');
  assert.equal(prerender.slugSeguro('demo_nube.2'), 'demo_nube.2');
  assert.equal(prerender.slugSeguro('../fuera'), null);
  assert.equal(prerender.slugSeguro('a/b'), null);
  assert.equal(prerender.slugSeguro('a b'), null);
  assert.equal(prerender.slugSeguro('..'), null);
  assert.equal(prerender.slugSeguro(''), null);
  assert.equal(prerender.slugSeguro(null), null);
});

test('urlEstatica genera la URL uniforme con o sin barra final', () => {
  assert.equal(
    prerender.urlEstatica(SITE, 'demo-nube'),
    'https://gn-admin.github.io/main/publicaciones/demo-nube.html'
  );
  assert.equal(
    prerender.urlEstatica(SITE + '/', 'demo-nube'),
    'https://gn-admin.github.io/main/publicaciones/demo-nube.html'
  );
});

test('cargarConfig usa el endpointBase de js/data-source.js', () => {
  const config = prerender.cargarConfig();
  assert.match(config.endpointBase, /^https:\/\/script\.google\.com\/macros\/s\//);
  assert.equal(config.pageSize, 24);
  assert.ok(config.timeoutMs > 0);
});

test('plan con fixtures: 7 fichas, sin redirects y 15 URLs de sitemap', () => {
  const plan = prerender.construirPlan(datos(), { siteUrl: SITE });

  assert.equal(plan.errores.length, 0);
  assert.equal(plan.paginas.length, 12);
  assert.equal(plan.paginas.filter(p => p.estado === 'ficha').length, 7);
  assert.equal(plan.paginas.filter(p => p.estado === 'retirada').length, 5);
  assert.equal(plan.paginas.filter(p => p.estado === 'redirect').length, 0);
  assert.equal(plan.paginas.filter(p => p.indexable).length, 7);
  assert.equal(plan.retiradas.length, 5);
  assert.equal(plan.redirects.length, 0);
  assert.equal(plan.sitemap.length, 15);

  const nube = plan.paginas.find(p => p.slug === 'demo-nube');
  assert.equal(nube.canonical, SITE + '/publicaciones/demo-nube.html');
  assert.equal(nube.lastmod, '2026-11-20T09:44:52.247Z');
  assert.equal(nube.estado, 'ficha');
  assert.ok(plan.sitemap.some(u => u.loc === nube.canonical));

  const lua = plan.paginas.find(p => p.slug === 'demo-lua');
  assert.equal(lua.estado, 'retirada');
  assert.equal(lua.retirada, true);
  assert.equal(lua.canonical, null);
  assert.ok(!plan.sitemap.some(u => u.loc.endsWith('/demo-lua.html')));
});

test('el sitemap avisa del endpoint vacío sin tratarlo como error', () => {
  const plan = prerender.construirPlan(datos(), { siteUrl: SITE });
  assert.equal(plan.errores.length, 0);
  assert.ok(plan.avisos.some(a => a.indexOf('sitemap del canal vacío') !== -1));
  assert.ok(plan.avisos.some(a => a.indexOf('Sin dominio público') !== -1));
});

test('una retirada no se indexa ni entra en el sitemap', () => {
  const entrada = datos();
  entrada.retiradas = [{ slug: 'demo-nube', tipo: 'animal', retiradoEn: '2026-11-21T10:00:00.000Z' }];
  const plan = prerender.construirPlan(entrada, { siteUrl: SITE });

  const nube = plan.paginas.find(p => p.slug === 'demo-nube');
  assert.equal(nube.indexable, false);
  assert.equal(nube.estado, 'retirada');
  assert.equal(nube.canonical, null);
  assert.ok(!plan.sitemap.some(u => u.loc.endsWith('/demo-nube.html')));
  assert.equal(plan.sitemap.length, 14);
  assert.ok(plan.retiradas.some(r => r.slug === 'demo-nube'));
});

test('normalizarRetirada acepta retiradoEn y retirado_en', () => {
  assert.deepEqual(
    prerender.normalizarRetirada({ slug: 'a', tipo: 'animal', retiradoEn: '2026-01-01' }),
    { slug: 'a', tipo: 'animal', fecha: '2026-01-01' }
  );
  assert.deepEqual(
    prerender.normalizarRetirada({ slug: 'b', tipo: 'evento', retirado_en: '2026-02-02' }),
    { slug: 'b', tipo: 'evento', fecha: '2026-02-02' }
  );
  assert.equal(prerender.normalizarRetirada({ slug: '../x' }), null);
});

test('redirects: destino por slug o URL y error si falta', () => {
  assert.deepEqual(
    prerender.normalizarRedirect({ slug: 'viejo', to: 'nuevo' }),
    { slug: 'viejo', destino: 'nuevo' }
  );
  assert.deepEqual(
    prerender.normalizarRedirect({ slug: 'viejo', destino: 'https://x.test/ficha' }),
    { slug: 'viejo', destino: 'https://x.test/ficha' }
  );

  const plan = prerender.construirPlan({
    publicaciones: datos().publicaciones,
    retiradas: [],
    redirects: [{ slug: 'demo-nube', nuevoSlug: 'demo-nube-2027' }]
  }, { siteUrl: SITE });

  assert.equal(plan.paginas.find(p => p.slug === 'demo-nube').indexable, false);
  assert.equal(plan.redirects[0].destino, SITE + '/publicaciones/demo-nube-2027.html');
  assert.ok(!plan.sitemap.some(u => u.loc.endsWith('/demo-nube.html')));

  const roto = prerender.construirPlan({
    publicaciones: [],
    retiradas: [],
    redirects: [{ slug: 'sin-destino' }]
  }, { siteUrl: SITE });
  assert.ok(roto.errores.some(e => e.indexOf('Redirect sin destino') !== -1));
});

test('descargarListado pagina hasta totalPages y deduplica', async () => {
  const paginas = {
    1: fixture('listado-p1.json'),
    2: fixture('listado-p2.json'),
    3: fixture('listado-p3.json')
  };
  const llamadas = [];
  const consultar = async (endpoint, params) => {
    llamadas.push(params.page);
    assert.equal(endpoint, 'publicaciones');
    return paginas[params.page];
  };

  const resultado = await prerender.descargarListado(consultar, 3);
  assert.equal(llamadas.length, 3);
  assert.equal(resultado.paginas, 3);
  const slugs = resultado.items.map(p => p.slug);
  assert.equal(slugs.length, 7);
  assert.equal(new Set(slugs).size, 7);
});

test('CLI --dry con fixtures resume el plan y sale 0', () => {
  const res = spawnSync(process.execPath, [
    'scripts/prerender.js', '--dry', '--fixture', 'tests/fixtures/prerender'
  ], { cwd: RAIZ, encoding: 'utf8' });

  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /publicaciones: 7 \(7 indexables\)/);
  assert.match(res.stdout, /retiradas: 5/);
  assert.match(res.stdout, /sitemap: 15 URLs/);
  assert.match(res.stdout, /SITE_URL: https:\/\/gn-admin\.github\.io\/main/);
});

test('CLI escribe una ficha por publicación indexable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-prerender-'));
  const res = spawnSync(process.execPath, [
    'scripts/prerender.js', '--fixture', 'tests/fixtures/prerender', '--out', dir, '--root', dir
  ], { cwd: RAIZ, encoding: 'utf8' });

  assert.equal(res.status, 0, res.stderr);
  const ficheros = fs.readdirSync(dir).sort();
  assert.equal(ficheros.length, 14);
  assert.ok(ficheros.includes('demo-nube.html'));
  assert.ok(ficheros.includes('demo-lua.html'));
  assert.ok(ficheros.includes('sitemap.xml'));
  assert.ok(ficheros.includes('robots.txt'));

  const html = fs.readFileSync(path.join(dir, 'demo-nube.html'), 'utf8');
  assert.ok(html.includes('<title>Nube, perro mestizo en adopción · Grupo Nebak</title>'));
  assert.ok(html.includes('<link rel="canonical" href="https://gn-admin.github.io/main/publicaciones/demo-nube.html">'));
  assert.ok(html.includes('<meta name="robots" content="index,follow">'));
  assert.ok(html.includes('"@type":"Article"'));
  assert.ok(html.includes('<h1>Nube, mestizo de 2 años</h1>'));
  assert.ok(html.includes('href="../css/main.css'));
  assert.ok(html.includes('href="../contacto/"'));
  assert.ok(!html.includes('publicaciones-api.js'));
  assert.ok(!html.includes('blog-render.js'));
  assert.ok(!html.includes('data-source.js'));
  assert.equal(html.split('post-template.js').length - 1, 1);
  assert.ok(html.includes('PostTemplate.initCarousels(document)'));
});

test('la ficha estática de evento usa schema Event', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-prerender-'));
  const res = spawnSync(process.execPath, [
    'scripts/prerender.js', '--fixture', 'tests/fixtures/prerender', '--out', dir, '--root', dir
  ], { cwd: RAIZ, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);

  const html = fs.readFileSync(path.join(dir, 'demo-jornada-puertas-abiertas.html'), 'utf8');
  assert.ok(html.includes('"@type":"Event"'));
  assert.ok(html.includes('"startDate":"2027-03-21T00:00:00.000Z"'));
  assert.ok(html.includes('Jornada de Puertas Abiertas'));
  assert.ok(!html.includes('publicaciones-api.js'));
});

test('--dry no escribe ninguna ficha', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-prerender-'));
  const res = spawnSync(process.execPath, [
    'scripts/prerender.js', '--dry', '--fixture', 'tests/fixtures/prerender', '--out', dir, '--root', dir
  ], { cwd: RAIZ, encoding: 'utf8' });

  assert.equal(res.status, 0, res.stderr);
  assert.equal(fs.readdirSync(dir).length, 0);
  assert.ok(res.stdout.includes('páginas a escribir: 12'));
});

test('renderArticle comparte el markup del cliente', () => {
  const T = require(path.join(RAIZ, 'js', 'post-template.js'));
  const html = T.renderArticle({
    slug: 'x', title: 'Ficha de prueba', category: 'Gatos en adopción',
    content: '<p>Contenido</p>', publication: null
  }, { from: 'gatos', fallbackImage: function (src) { return src || 'logo.jpg'; } });

  assert.ok(html.includes('<h1>Ficha de prueba</h1>'));
  assert.ok(html.includes('<p>Contenido</p>'));
  assert.ok(html.includes('href="../gatos-en-adopcion/"'));
  assert.ok(html.includes('post-sheet--ficha'));
});

test('CLI con fixture inexistente falla con mensaje claro', () => {
  const res = spawnSync(process.execPath, [
    'scripts/prerender.js', '--dry', '--fixture', 'tests/fixtures/no-existe'
  ], { cwd: RAIZ, encoding: 'utf8' });

  assert.equal(res.status, 1);
  assert.match(res.stderr, /Falta listado\.json/);
});


test('descargarListado deduplica páginas solapadas', async () => {
  const p1 = fixture('listado-p1.json');
  const consultar = async () => p1;
  const resultado = await prerender.descargarListado(consultar, 3);

  assert.equal(resultado.paginas, 3);
  assert.equal(resultado.items.length, 3);
  assert.equal(resultado.duplicados, 6);
  assert.equal(new Set(resultado.items.map(p => p.slug)).size, 3);
});

test('un duplicado en el listado no bloquea el plan', () => {
  const entrada = datos();
  entrada.publicaciones = entrada.publicaciones.concat([entrada.publicaciones[0]]);
  const plan = prerender.construirPlan(entrada, { siteUrl: SITE });

  assert.equal(plan.errores.length, 0);
  assert.equal(plan.paginas.length, 12);
  assert.ok(plan.avisos.some(a => a.indexOf('Slug duplicado') !== -1));
});

test('resolverDestino rechaza protocolos y rutas no seguras', () => {
  assert.match(prerender.resolverDestino(SITE, 'javascript:alert(1)').error, /protocolo no permitido: javascript/);
  assert.match(prerender.resolverDestino(SITE, 'data:text/html,x').error, /protocolo no permitido: data/);
  assert.match(prerender.resolverDestino(SITE, '//evil.test/x').error, /URL sin protocolo/);
  assert.match(prerender.resolverDestino(SITE, '../fuera').error, /destino no válido/);
  assert.match(prerender.resolverDestino(SITE, 'http://').error, /URL no válida|destino/);
  assert.match(prerender.resolverDestino(SITE, 'https://user:pass@x.test/a').error, /credenciales/);

  const absoluta = prerender.resolverDestino(SITE, 'https://gn-admin.github.io/main/publicaciones/demo-trufa.html');
  assert.equal(absoluta.error, undefined);
  assert.equal(absoluta.destinoSlug, null);

  const porSlug = prerender.resolverDestino(SITE, 'demo-trufa');
  assert.equal(porSlug.url, SITE + '/publicaciones/demo-trufa.html');
  assert.equal(porSlug.destinoSlug, 'demo-trufa');
});

test('un redirect con destino inválido no se publica y da error', () => {
  const plan = prerender.construirPlan({
    publicaciones: [],
    retiradas: [],
    redirects: [
      { slug: 'malo-js', to: 'javascript:alert(1)' },
      { slug: 'malo-ruta', to: '../fuera' },
      { slug: 'bueno', to: 'https://gn-admin.github.io/main/publicaciones/demo-trufa.html' }
    ]
  }, { siteUrl: SITE });

  assert.equal(plan.errores.length, 2);
  assert.equal(plan.redirects.length, 1);
  assert.equal(plan.redirects[0].slug, 'bueno');
  assert.equal(plan.redirects[0].destino, 'https://gn-admin.github.io/main/publicaciones/demo-trufa.html');
});

test('redirect a un slug no publicado avisa pero no falla', () => {
  const plan = prerender.construirPlan({
    publicaciones: datos().publicaciones,
    retiradas: [],
    redirects: [{ slug: 'demo-nube', nuevoSlug: 'demo-nube-2027' }]
  }, { siteUrl: SITE });

  assert.equal(plan.errores.length, 0);
  assert.ok(plan.avisos.some(a => a.indexOf('slug no publicado') !== -1));
});

test('la escritura elimina fichas obsoletas y respeta otros archivos', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-prerender-'));
  fs.writeFileSync(path.join(dir, 'ficha-vieja.html'), '<p>obsoleta</p>');
  fs.writeFileSync(path.join(dir, 'nota.txt'), 'no tocar');

  const res = spawnSync(process.execPath, [
    'scripts/prerender.js', '--fixture', 'tests/fixtures/prerender', '--out', dir, '--root', dir
  ], { cwd: RAIZ, encoding: 'utf8' });

  assert.equal(res.status, 0, res.stderr);
  assert.ok(!fs.existsSync(path.join(dir, 'ficha-vieja.html')));
  assert.ok(fs.existsSync(path.join(dir, 'nota.txt')));
  assert.ok(res.stdout.includes('eliminadas: 1'));
});

test('--dry no borra fichas obsoletas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-prerender-'));
  fs.writeFileSync(path.join(dir, 'ficha-vieja.html'), '<p>obsoleta</p>');

  const res = spawnSync(process.execPath, [
    'scripts/prerender.js', '--dry', '--fixture', 'tests/fixtures/prerender', '--out', dir, '--root', dir
  ], { cwd: RAIZ, encoding: 'utf8' });

  assert.equal(res.status, 0, res.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'ficha-vieja.html')));
});

test('la lápida no tiene canónica ni JSON-LD y sale del sitemap', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-prerender-'));
  const res = spawnSync(process.execPath, [
    'scripts/prerender.js', '--fixture', 'tests/fixtures/prerender', '--out', dir, '--root', dir
  ], { cwd: RAIZ, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);

  try {
    const lapida = fs.readFileSync(path.join(dir, 'demo-lua.html'), 'utf8');
    assert.ok(lapida.includes('name="robots" content="noindex,nofollow"'));
    assert.ok(lapida.includes('Contenido retirado'));
    assert.ok(lapida.includes('href="../"'));
    assert.ok(!lapida.includes('rel="canonical"'));
    assert.ok(!lapida.includes('application/ld+json'));
    assert.ok(!lapida.includes('publicaciones-api.js'));
    assert.ok(!lapida.includes('blog-render.js'));

    const sitemap = fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8');
    assert.ok(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(sitemap.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
    assert.equal((sitemap.match(/<url>/g) || []).length, 15);
    assert.ok(!sitemap.includes('demo-lua.html'));
    assert.ok(sitemap.includes('<lastmod>2026-11-20</lastmod>'));

    const robots = fs.readFileSync(path.join(dir, 'robots.txt'), 'utf8');
    assert.ok(robots.includes('User-agent: *'));
    assert.ok(robots.includes('Allow: /'));
    assert.ok(robots.includes('Disallow: /main/post.html'));
    assert.ok(robots.includes('Sitemap: https://gn-admin.github.io/main/sitemap.xml'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI genera un redirect 301 fuera del sitemap', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-fixture-'));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-prerender-'));
  fs.cpSync(FIXTURES, fixture, { recursive: true });
  fs.writeFileSync(path.join(fixture, 'redirects.json'), JSON.stringify({
    status: 'success',
    data: [{ slug: 'demo-ficha-vieja', nuevoSlug: 'demo-nube' }]
  }));

  const res = spawnSync(process.execPath, [
    'scripts/prerender.js', '--fixture', fixture, '--out', out, '--root', out
  ], { cwd: RAIZ, encoding: 'utf8' });

  try {
    assert.equal(res.status, 0, res.stderr);
    const html = fs.readFileSync(path.join(out, 'demo-ficha-vieja.html'), 'utf8');
    assert.ok(html.includes('name="robots" content="noindex,follow"'));
    assert.ok(html.includes('rel="canonical" href="https://gn-admin.github.io/main/publicaciones/demo-nube.html"'));
    assert.ok(html.includes('http-equiv="refresh"'));
    assert.ok(html.includes('location.replace'));
    assert.ok(!html.includes('application/ld+json'));
    const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
    assert.ok(!sitemap.includes('demo-ficha-vieja.html'));
    assert.ok(sitemap.includes('demo-nube.html'));
    assert.equal((sitemap.match(/<url>/g) || []).length, 15);
    assert.equal(fs.readdirSync(out).filter(n => n.endsWith('.html')).length, 13);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('sitemapXml escapa URLs y validarSalida detecta descuadres', () => {
  const xml = prerender.sitemapXml([
    { loc: 'https://ejemplo.test/a?b=1&c=2', lastmod: '2026-10-03T10:00:00Z' }
  ]);
  assert.ok(xml.includes('<loc>https://ejemplo.test/a?b=1&amp;c=2</loc>'));
  assert.ok(xml.includes('<lastmod>2026-10-03</lastmod>'));

  const robots = prerender.robotsTxt(SITE);
  const plan = prerender.construirPlan({
    publicaciones: [], retiradas: [], redirects: []
  }, { siteUrl: SITE });

  const vacio = prerender.validarSalida({
    plan: plan, paginas: [], sitemapXml: '', robotsTexto: ''
  }).join(' ');
  assert.match(vacio, /sin declaración XML/);
  assert.match(vacio, /sin <urlset>/);
  assert.match(vacio, /sin User-agent/);
  assert.match(vacio, /sin línea Sitemap:/);

  const descuadre = prerender.validarSalida({
    plan: plan, paginas: [], sitemapXml: prerender.sitemapXml([]), robotsTexto: robots
  }).join(' ');
  assert.match(descuadre, /sin ninguna URL/);
  assert.match(descuadre, /no cuadra/);
  assert.ok(robots.includes('Disallow: /main/post.html'));
});

test('un redirect con apóstrofe en la URL sigue validando', () => {
  const destino = "https://ejemplo.test/a'b?x=1&y=2";
  const html = paginasMod.paginaRedirect(destino);
  const plan = { sitemap: [{ loc: SITE + '/' }] };
  const errores = prerender.validarSalida({
    plan: plan,
    paginas: [{ slug: 'vieja', estado: 'redirect', destino: destino, html: html }],
    sitemapXml: prerender.sitemapXml(plan.sitemap),
    robotsTexto: prerender.robotsTxt(SITE)
  });
  assert.deepEqual(errores, []);
});

test('JSON-LD y redirect escapan el cierre de script', () => {
  const ld = paginasMod.jsonLd({ title: '</script><script>alert(1)</script>', type: 'animal' }, SITE + '/publicaciones/x.html', SITE);
  assert.equal(ld.split('</script>').length - 1, 1);

  const html = paginasMod.paginaRedirect('https://ejemplo.test/a</script><script>alert(1)</script>');
  assert.equal(html.split('</script>').length - 1, 1);
});

test('sitemap y robots van a --root, no a --out', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-root-'));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-prerender-'));
  const res = spawnSync(process.execPath, [
    'scripts/prerender.js', '--fixture', 'tests/fixtures/prerender', '--out', out, '--root', root
  ], { cwd: RAIZ, encoding: 'utf8' });

  try {
    assert.equal(res.status, 0, res.stderr);
    assert.ok(fs.existsSync(path.join(root, 'sitemap.xml')));
    assert.ok(fs.existsSync(path.join(root, 'robots.txt')));
    assert.ok(!fs.existsSync(path.join(out, 'sitemap.xml')));
    assert.ok(!fs.existsSync(path.join(out, 'robots.txt')));
    assert.ok(fs.existsSync(path.join(out, 'demo-nube.html')));
    assert.ok(fs.existsSync(path.join(out, 'demo-lua.html')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('validarFichaHtml exige canonical único y un JSON-LD coherente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-prerender-'));
  const res = spawnSync(process.execPath, [
    'scripts/prerender.js', '--fixture', 'tests/fixtures/prerender', '--out', dir, '--root', dir
  ], { cwd: RAIZ, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);

  const html = fs.readFileSync(path.join(dir, 'demo-nube.html'), 'utf8');
  const canonical = prerender.urlEstatica(SITE, 'demo-nube');
  assert.deepEqual(prerender.validarFichaHtml(html, { canonical: canonical }), []);

  const sinLd = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
  assert.match(prerender.validarFichaHtml(sinLd, { canonical: canonical }).join(' '), /1 bloque JSON-LD/);

  const dosCanon = html.replace('</head>', '  <link rel="canonical" href="' + canonical + '">\n</head>');
  assert.match(prerender.validarFichaHtml(dosCanon, { canonical: canonical }).join(' '), /1 canonical/);

  const canonMal = html.replace(/("mainEntityOfPage":\{"@type":"WebPage","@id":")[^"]+"/, '$1https://otro.test/x"');
  assert.match(prerender.validarFichaHtml(canonMal, { canonical: canonical }).join(' '), /mainEntityOfPage/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('validarLapidaHtml y validarRedirectHtml validan SEO', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-prerender-'));
  const res = spawnSync(process.execPath, [
    'scripts/prerender.js', '--fixture', 'tests/fixtures/prerender', '--out', dir, '--root', dir
  ], { cwd: RAIZ, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);

  const lapida = fs.readFileSync(path.join(dir, 'demo-lua.html'), 'utf8');
  assert.deepEqual(prerender.validarLapidaHtml(lapida), []);

  const redirectHtml = paginasMod.paginaRedirect('https://gn-admin.github.io/main/publicaciones/demo-nube.html');
  assert.deepEqual(prerender.validarRedirectHtml(redirectHtml, 'https://gn-admin.github.io/main/publicaciones/demo-nube.html'), []);

  fs.rmSync(dir, { recursive: true, force: true });
});
