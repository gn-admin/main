/*
 * Acceso único a las publicaciones del sitio.
 *
 * Fase 1: todo se sirve desde `data/blog-posts.json` (modo fake) y no se hace
 * ninguna petición al canal. El camino 'real' ya está implementado (envelope,
 * JSONP y normalización) pero permanece inactivo mientras
 * `js/data-source.js` no marque una sección como 'real'.
 *
 * Contrato de salida (lo que consumen blog-api.js, blog-render*.js y main.js):
 *   load()               -> Promise<{site, posts, sections}>
 *   getAllPosts()        -> Post[]            (copia, mismo orden que el JSON)
 *   getPostsFor(section) -> Post[]            (solo esa sección; en 'real' nunca mezcla fake)
 *   getPostBySlug(slug)  -> Post | null
 *   getSiteConfig()      -> site
 *   fallbackImage(src)   -> src | imagen por defecto
 */
var PublicacionesAPI = (function () {
  'use strict';

  var LOCAL_DATA_URL = 'data/blog-posts.json';
  var FALLBACK_IMAGE = 'assets/images/logo.jpg';

  // Sección -> ámbito en los datos locales y consulta al canal público.
  //   scope 'category': posee esas categorías del JSON (una ficha por sección).
  //   scope 'rest':     feed editorial: todo lo que no es una ficha de animal
  //                     (historias, eventos, D.E.P, finales felices y casos).
  //   scope 'view':     vista sobre el catálogo completo (home); no posee datos.
  // `query: null` = el canal todavía no emite esa sección.
  var SECTIONS = {
    historias: {
      scope: 'rest',
      query: { endpoint: 'historias-publicas' }
    },
    gatos: {
      scope: 'category',
      categories: ['Gatos en adopción'],
      query: { endpoint: 'animales-publicos', species: 'gato', status: 'en_adopcion' }
    },
    perros: {
      scope: 'category',
      categories: ['Perros en adopción'],
      query: { endpoint: 'animales-publicos', species: 'perro', status: 'en_adopcion' }
    },
    acogidas: {
      scope: 'category',
      categories: ['Acogida', 'Acogidas'],
      query: { endpoint: 'animales-publicos', status: 'en_acogida' }
    },
    adoptados: {
      scope: 'category',
      categories: ['Adoptados'],
      query: { endpoint: 'animales-publicos', status: 'adoptado' }
    },
    casosExternos: {
      scope: 'category',
      categories: ['Caso externo'],
      query: { endpoint: 'publicaciones', category: 'Caso externo' }
    },
    grupos: {
      scope: 'category',
      categories: ['Grupo', 'Grupos'],
      query: { endpoint: 'publicaciones', type: 'animal_grupo' }
    },
    apadrinamiento: {
      scope: 'category',
      categories: ['Apadrinamiento'],
      query: null
    },
    home: {
      scope: 'view',
      query: { endpoint: 'publicaciones' }
    }
  };

  // Categorías que el índice de historias nunca muestra (espejo de
  // blog-render-index.js): su feed es el resto editorial.
  var HISTORIAS_EXCLUDED = ['Acogida', 'Acogidas', 'Gatos en adopción', 'Perros en adopción', 'SC'];

  var fake = null;          // { site, posts }
  var fakePending = null;
  var loaded = null;        // resultado de load()
  var pending = null;
  var realPosts = {};       // sección -> Post[]
  var realPending = {};     // sección -> Promise
  var realServed = {};      // sección -> true si el canal respondió
  var realBySlug = {};      // slug -> sección real que lo sirvió

  // ---------- configuración ----------

  function config() {
    return (typeof window !== 'undefined' && window.NEBAK_DATA_SOURCE) ? window.NEBAK_DATA_SOURCE : {};
  }

  function options() {
    return config().options || {};
  }

  function endpointBase() {
    return String(config().endpointBase || '').trim().replace(/\/+$/, '');
  }

  function modeFor(section) {
    var cfg = config();
    var sectionCfg = (cfg.sections && cfg.sections[section]) || {};
    var mode = sectionCfg.mode || cfg.defaultMode || 'fake';
    if (mode !== 'real' && mode !== 'fake') mode = 'fake';
    if (mode === 'real') {
      var def = SECTIONS[section];
      if (!endpointBase() || !def || !def.query) {
        if (options().debug) {
          console.warn('[datos] sección "' + section + '" sin canal disponible: se usa fake');
        }
        mode = 'fake';
      }
    }
    return mode;
  }

  function realSections() {
    var out = [];
    for (var name in SECTIONS) {
      if (Object.prototype.hasOwnProperty.call(SECTIONS, name) && modeFor(name) === 'real') out.push(name);
    }
    return out;
  }

  // ---------- normalización ----------

  // Acepta tanto el formato local como el payload del canal y devuelve el
  // `Post` interno que ya esperan los renderizadores.
  // `opciones.canal` marca que la fila proviene del canal público y, por tanto,
  // tiene página estática generada: se añade `urlEstatica`.
  function normalizePost(raw, opciones) {
    var deCanal = !!(opciones && opciones.canal);
    if (!raw || typeof raw !== 'object') return null;
    var post = {};
    for (var key in raw) {
      if (Object.prototype.hasOwnProperty.call(raw, key)) post[key] = raw[key];
    }
    if (!post.content && post.contentHtml) post.content = post.contentHtml;
    if (!post.date && post.publishedAt) post.date = post.publishedAt;
    if (!post.image && post.coverImage && post.coverImage.src) post.image = post.coverImage.src;
    if (!post.imageAlt && post.coverImage && post.coverImage.alt) post.imageAlt = post.coverImage.alt;
    if (!post.publication) {
      var pub = {};
      if (Array.isArray(post.icons)) pub.icons = post.icons;
      if (Array.isArray(post.gallery)) pub.gallery = post.gallery;
      if (Array.isArray(post.videos)) pub.videos = post.videos;
      if (pub.icons || pub.gallery || pub.videos) {
        pub.schema = 'nebak-post-v1';
        post.publication = pub;
      }
    }
    // Solo las publicaciones que existen en el canal tienen página estática
    // generada por el prerender; las fichas locales mantienen su enlace dinámico.
    if (deCanal && post.slug) {
      post.urlEstatica = 'publicaciones/' + encodeURIComponent(String(post.slug)) + '.html';
    }
    return post;
  }

  function normalizeDataset(data) {
    var site = (data && data.site) ? data.site : {};
    var posts = (data && Array.isArray(data.posts)) ? data.posts.map(normalizePost).filter(Boolean) : [];
    return { site: site, posts: posts };
  }

  // ---------- carga local (fake) ----------

  function loadFake() {
    if (fake) return Promise.resolve(fake);
    if (!fakePending) {
      fakePending = requestJson(LOCAL_DATA_URL).then(function (data) {
        fake = normalizeDataset(data);
        return fake;
      }).catch(function (err) {
        console.error('[publicaciones-api]', err);
        fake = { site: {}, posts: [] };
        return fake;
      }).then(function (result) {
        fakePending = null;
        return result;
      });
    }
    return fakePending;
  }

  // ---------- canal público (real, inactivo en Fase 1) ----------

  function buildQuery(params) {
    var parts = [];
    for (var key in params) {
      if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
      var value = params[key];
      if (value === undefined || value === null || value === '') continue;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    }
    return parts.join('&');
  }

  function withQuery(base, params) {
    var qs = buildQuery(params);
    if (!qs) return base;
    return base + (base.indexOf('?') === -1 ? '?' : '&') + qs;
  }

  function requestJson(url) {
    var opts = options();
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, opts.timeoutMs || 15000) : null;
    return fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }).then(function (text) {
      return JSON.parse(text);
    }).then(function (data) {
      if (timer) clearTimeout(timer);
      return data;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  // JSONP: el canal no puede fijar cabeceras CORS (ContentService), así que es
  // el transporte de respaldo cuando `fetch` no está disponible o falla.
  function requestJsonp(base, params) {
    return new Promise(function (resolve, reject) {
      if (typeof document === 'undefined') {
        reject(new Error('JSONP no disponible sin DOM'));
        return;
      }
      var name = '__gnPub' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      var script = document.createElement('script');
      var done = false;
      var timer = setTimeout(function () {
        finish(reject, new Error('JSONP: tiempo de espera agotado'));
      }, options().timeoutMs || 15000);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[name]; } catch (e) { window[name] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      function finish(fn, value) {
        if (done) return;
        done = true;
        cleanup();
        fn(value);
      }

      window[name] = function (data) { finish(resolve, data); };
      script.onerror = function () { finish(reject, new Error('JSONP: no se pudo cargar el canal')); };
      script.async = true;
      script.src = withQuery(base, shallow(params, { callback: name }));
      document.head.appendChild(script);
    });
  }

  var canalCliente = null;

  // Cliente único (js/canal-publico.js): fetch con respaldo JSONP, como el
  // contrato de admin-dashboard. Se recrea solo si cambia la base.
  function cliente() {
    var base = endpointBase();
    if (!base || typeof window === 'undefined' || !window.CanalPublico) return null;
    if (!canalCliente || canalCliente.base !== base) {
      canalCliente = {
        base: base,
        api: window.CanalPublico.crearCanal({ baseUrl: base, timeoutMs: options().timeoutMs || 15000 })
      };
    }
    return canalCliente.api;
  }

  function requestChannel(query) {
    var base = endpointBase();
    if (!base) return Promise.reject(new Error('endpointBase vacío'));
    var endpoint = query.endpoint;
    var params = shallow(query);
    delete params.endpoint;
    var api = cliente();
    if (api) {
      if (options().transport === 'jsonp') return api.jsonp(endpoint, params);
      return api.pedir(endpoint, params);
    }
    // Respaldo sin canal-publico.js (no debería ocurrir: se carga antes).
    if (options().transport === 'jsonp') return requestJsonp(base, query);
    return requestJson(base + '?' + buildQuery(query)).catch(function (err) {
      return requestJsonp(base, query).catch(function () { throw err; });
    });
  }

  // El canal responde {status, data, pagination}; 'warning' = hoja sin
  // configurar, 'error' = no encontrado, 'gone' = publicación retirada.
  function readEnvelope(res) {
    if (!res || typeof res !== 'object') throw new Error('Respuesta del canal no válida');
    if (res.status === 'warning' || res.status === 'error' || res.status === 'gone') {
      var err = new Error(res.error || 'Canal de publicaciones no disponible');
      err.status = res.status;
      err.code = res.code || '';
      throw err;
    }
    var rows = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
    return rows.map(function (fila) { return normalizePost(fila, { canal: true }); }).filter(Boolean);
  }

  function sectionQuery(section) {
    var def = SECTIONS[section];
    if (!def || !def.query) return null;
    var query = shallow(def.query);
    query.pageSize = Math.min(50, Math.max(1, options().pageSize || 24));
    return query;
  }

  function loadRealSection(section) {
    if (realServed[section]) return Promise.resolve(realPosts[section] || []);
    if (realPending[section]) return realPending[section];
    var query = sectionQuery(section);
    if (!query) {
      realServed[section] = true;
      realPosts[section] = [];
      return Promise.resolve([]);
    }
    realPending[section] = requestChannel(query).then(function (res) {
      realPosts[section] = readEnvelope(res);
      realPosts[section].forEach(function (post) {
        if (post && post.slug) realBySlug[post.slug] = section;
      });
      realServed[section] = true;
      return realPosts[section];
    }).then(function (posts) {
      realPending[section] = null;
      return posts;
    }, function (err) {
      realPending[section] = null;
      if (options().fallbackOnError) {
        console.warn('[datos] sección "' + section + '" no disponible; se mantiene fake: ' + (err && err.message));
      } else {
        realServed[section] = true;
        realPosts[section] = [];
      }
      throw err;
    });
    return realPending[section];
  }

  // ---------- mezcla de fuentes ----------

  // Sección local propietaria de una publicación: primera sección de categoría
  // que la reclama; el resto (historias, eventos, D.E.P…) pertenece a 'historias'.
  function fakeSectionFor(post) {
    var category = String((post && post.category) || '').trim();
    for (var name in SECTIONS) {
      if (!Object.prototype.hasOwnProperty.call(SECTIONS, name)) continue;
      var def = SECTIONS[name];
      if (def.scope !== 'category' || !def.categories) continue;
      for (var i = 0; i < def.categories.length; i++) {
        if (def.categories[i] === category) return name;
      }
    }
    return 'historias';
  }

  // El fake de una sección solo se oculta cuando esa sección está en 'real' y
  // el canal ya respondió; si falló y hay fallback, el fake se mantiene.
  function fakeHiddenByReal(post) {
    var owner = fakeSectionFor(post);
    return modeFor(owner) === 'real' && !!realServed[owner];
  }

  function mergedPosts() {
    var out = [];
    var seen = {};
    realSections().forEach(function (section) {
      (realPosts[section] || []).forEach(function (post) {
        if (!post || !post.slug || seen[post.slug]) return;
        seen[post.slug] = true;
        out.push(post);
      });
    });
    var fakePosts = fake ? fake.posts : [];
    fakePosts.forEach(function (post) {
      if (!post || seen[post.slug]) return;
      if (fakeHiddenByReal(post)) return; // la sección ya se sirve del canal
      seen[post.slug] = true;
      out.push(post);
    });
    return out;
  }

  function inHistoriasFeed(post) {
    var category = String((post && post.category) || '').trim();
    return HISTORIAS_EXCLUDED.indexOf(category) === -1;
  }

  // Lectura por sección: en 'real' devuelve solo lo del canal; en 'fake' su
  // ámbito local (home, al ser una vista, ve todo lo cargado).
  function getPostsFor(section) {
    var def = SECTIONS[section];
    if (!def) return getAllPosts();
    if (modeFor(section) === 'real') {
      if (realServed[section]) return (realPosts[section] || []).slice();
      // Canal caído con fallback: la sección se queda con su fake, igual que
      // el feed, en vez de devolver una lista vacía.
      if (!options().fallbackOnError) return [];
    }
    if (def.scope === 'view') return getAllPosts();
    var out = [];
    var fakePosts = fake ? fake.posts : [];
    for (var i = 0; i < fakePosts.length; i++) {
      var post = fakePosts[i];
      if (realBySlug[post.slug]) continue; // una sección fake lee solo datos locales
      if (def.scope === 'rest') {
        if (inHistoriasFeed(post)) out.push(post);
        continue;
      }
      if (fakeSectionFor(post) === section) out.push(post);
    }
    return out;
  }

  // ---------- API pública ----------

  function normalizeSections(sections) {
    if (sections === undefined || sections === null) return null;
    if (typeof sections === 'string') return [sections];
    return Array.isArray(sections) ? sections : null;
  }

  // Carga mínima: solo la sección pedida. El JSON local se descarga únicamente
  // si esa sección está en fake o si el canal falla y hay que degradar.
  function ensureSection(section) {
    var def = SECTIONS[section];
    if (!def) return load();                 // sección desconocida: catálogo
    if (def.scope === 'view') return load(); // 'home' es una vista de todo
    if (modeFor(section) === 'real') {
      return loadRealSection(section).catch(function () {
        return options().fallbackOnError ? loadFake() : null;
      });
    }
    return loadFake();
  }

  // load()               -> catálogo completo (chat, home): fake + todas las reales
  // load(['gatos'])      -> solo esa sección (y solo su llamada al canal)
  function load(sections) {
    var list = normalizeSections(sections);
    if (list) {
      var seen = {};
      var uniq = [];
      list.forEach(function (section) {
        if (section && SECTIONS[section] && !seen[section]) {
          seen[section] = true;
          uniq.push(section);
        }
      });
      if (!uniq.length) {
        return Promise.resolve({ site: fake ? fake.site : {}, posts: [], sections: {} });
      }
      return Promise.all(uniq.map(ensureSection)).then(function () {
        var state = {};
        var posts = [];
        uniq.forEach(function (section) {
          state[section] = { mode: modeFor(section), served: !!realServed[section] };
          posts = posts.concat(getPostsFor(section));
        });
        return { site: fake ? fake.site : {}, posts: posts, sections: state };
      });
    }
    if (loaded) return Promise.resolve(loaded);
    if (pending) return pending;
    pending = loadFake().then(function () {
      var allSections = realSections();
      if (!allSections.length) {
        return { site: fake.site, posts: fake.posts.slice(), sections: {} };
      }
      return Promise.all(allSections.map(function (section) {
        return loadRealSection(section).catch(function () { return []; });
      })).then(function () {
        var state = {};
        allSections.forEach(function (section) { state[section] = { mode: 'real', served: !!realServed[section] }; });
        return { site: fake.site, posts: mergedPosts(), sections: state };
      });
    }).then(function (result) {
      loaded = result;
      pending = null;
      return result;
    }).catch(function (err) {
      console.error('[publicaciones-api]', err);
      pending = null;
      loaded = { site: {}, posts: [], sections: {} };
      return loaded;
    });
    return pending;
  }  function getAllPosts() {
    return loaded ? loaded.posts.slice() : [];
  }

  // Detalle por ficha: una sola llamada 'publicacion&slug=' cuando está en real.
  function detalleReal() {
    var cfg = config();
    var sec = (cfg.sections && cfg.sections.detalle) || {};
    var mode = sec.mode || cfg.defaultMode || 'fake';
    return mode === 'real' && !!endpointBase();
  }

  function loadPost(slug) {
    var wanted = decodeURIComponent(String(slug || ''));
    if (!wanted) return Promise.resolve({ post: null, notFound: true });
    var api = detalleReal() ? cliente() : null;
    if (!api) {
      return loadFake().then(function () { return { post: getPostBySlug(wanted) || localPostBySlug(wanted) }; });
    }
    return api.ficha(wanted).then(function (res) {
      if (res && res.status === 'gone') return { post: null, gone: true, message: res.error || '' };
      if (!res || res.status !== 'success') {
        // Compatibilidad: un enlace antiguo a una ficha local sigue abriéndose
        // aunque el canal no conozca ese slug.
        return loadFake().then(function () {
          var local = getPostBySlug(wanted) || localPostBySlug(wanted);
          if (local) return { post: local };
          return { post: null, notFound: true, message: (res && res.error) || '' };
        });
      }
      var post = normalizePost(res.data, { canal: true });
      if (post && post.slug) {
        post.url = 'post.html?slug=' + encodeURIComponent(post.slug);
        realBySlug[post.slug] = 'detalle';
      }
      return { post: post, redirect: res.redirect || null };
    }).catch(function () {
      // Sin red: lo ya cargado en el listado sigue sirviendo la ficha.
      return load().then(function () { return { post: getPostBySlug(wanted) }; });
    });
  }

  // Búsqueda directa en el JSON local, aunque su sección ya esté en real:
  // conserva los enlaces antiguos a fichas que aún no están en el canal.
  function localPostBySlug(slug) {
    if (!fake) return null;
    var wanted = decodeURIComponent(String(slug || ''));
    for (var i = 0; i < fake.posts.length; i++) {
      if (fake.posts[i].slug === wanted) return fake.posts[i];
    }
    return null;
  }

  function getPostBySlug(slug) {
    if (!slug || !loaded) return null;
    var wanted = decodeURIComponent(String(slug));
    return loaded.posts.find(function (post) { return post.slug === wanted; }) || null;
  }

  function getSiteConfig() {
    return loaded ? loaded.site : {};
  }

  function getSource(section) {
    return modeFor(section);
  }

  // Taxonomías del canal (filtros). Devuelve la promesa del sobre.
  function taxonomias(type) {
    var query = { endpoint: 'taxonomias' };
    if (type) query.type = type;
    var api = cliente();
    if (api) return api.taxonomias(type);
    return requestChannel(query);
  }

  function fallbackImage(src) {
    if (!src || !String(src).trim()) return FALLBACK_IMAGE;
    return String(src);
  }

  // Copia superficial: evita compartir la config entre llamadas.
  function shallow(base, extra) {
    var out = {};
    if (base) {
      for (var key in base) {
        if (Object.prototype.hasOwnProperty.call(base, key)) out[key] = base[key];
      }
    }
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
      }
    }
    return out;
  }

  return {
    load: load,
    getAllPosts: getAllPosts,
    getPostsFor: getPostsFor,
    getPostBySlug: getPostBySlug,
    loadPost: loadPost,
    getSiteConfig: getSiteConfig,
    getSource: getSource,
    taxonomias: taxonomias,
    fallbackImage: fallbackImage,
    urlEstatica: function (slug) {
      var s = String(slug == null ? '' : slug).trim();
      if (!s) return '';
      return 'publicaciones/' + encodeURIComponent(s) + '.html';
    }
  };
})();
