/*
 * Búsqueda de publicaciones para el asistente (chat).
 *
 * A diferencia del filtro anterior (coincidencia literal del texto completo),
 * aquí se indexan fichas de animal, grupos, eventos e historias por campos y
 * se puntúan las coincidencias con sinónimos (gato/gata, perro/cachorro,
 * evento/jornada...). Así se encuentran fichas por nombre, especie, estado,
 * carácter, ubicación o tipo de publicación.
 *
 * API:
 *   window.NebakBusqueda.buscar(posts, consulta, filtro)
 *     -> [{ post, score, tipo, etiqueta }]  (máximo 8, mejor puntuación primero)
 *   filtro: '' | 'animales' | 'eventos' | 'historias' | 'acogida' |
 *           'adopcion' | 'gatos' | 'perros'
 *   window.NebakBusqueda.tipo(post)     -> 'animal' | 'evento' | 'historia'
 *   window.NebakBusqueda.etiqueta(post) -> 'En adopción' | 'En acogida' | ...
 */
(function (root) {
  'use strict';

  var GROUPS = [
    ['gato', 'gata', 'gatos', 'gatas', 'gatito', 'gatita', 'felino', 'felina'],
    ['perro', 'perra', 'perros', 'perras', 'can'],
    ['adoptar', 'adopcion', 'adopciones', 'adopta', 'adoptado', 'adoptada', 'adoptante'],
    ['acoger', 'acogida', 'acogidas', 'acogido', 'acogida temporal', 'temporal'],
    ['voluntariado', 'voluntario', 'voluntaria', 'voluntarios', 'colaborar', 'colaboracion'],
    ['donar', 'donacion', 'donaciones', 'teaming', 'bizum', 'cuota', 'socio', 'socia', 'socios'],
    ['evento', 'eventos', 'jornada', 'jornadas', 'campana', 'campanas', 'puertas abiertas', 'fiesta'],
    ['historia', 'historias', 'blog', 'noticia', 'noticias', 'final feliz', 'finales felices'],
    ['urgente', 'urgencia', 'urgentes'],
    ['cachorro', 'cachorra', 'cachorros', 'bebe', 'pequeno', 'pequena', 'pequenos', 'pequenas'],
    ['senior', 'mayor', 'mayores', 'veterano', 'veterana'],
    ['macho', 'masculino'],
    ['hembra', 'femenino'],
    ['grupo', 'grupos', 'camada', 'camadas', 'hermanos', 'hermanas']
  ];

  var STOPWORDS = {
    de: 1, la: 1, el: 1, los: 1, las: 1, un: 1, una: 1, unos: 1, unas: 1,
    y: 1, o: 1, en: 1, con: 1, por: 1, para: 1, que: 1, al: 1, del: 1,
    mi: 1, me: 1, tu: 1, su: 1, mis: 1, es: 1, son: 1, hay: 1, esta: 1,
    quiero: 1, busco: 1, buscar: 1, ver: 1, sobre: 1, mas: 1, muy: 1,
    algun: 1, alguna: 1, alguno: 1, como: 1, donde: 1, cuando: 1
  };

  // Claves que no aportan a la búsqueda (identificadores, media, SEO...).
  var IGNORE_KEYS = {
    id: 1, slug: 1, url: 1, canonical: 1, seo: 1, image: 1, imageAlt: 1,
    coverimage: 1, gallery: 1, videos: 1, icons: 1, publication: 1,
    content: 1, contenthtml: 1, urlestatica: 1, cta: 1, createdat: 1,
    updatedat: 1, publishedat: 1, status: 1, type: 1, category: 1,
    fecha: 1, date: 1, redirect: 1, featured: 1, listed: 1, orden: 1
  };

  // Orden de peso por campo: el título y el nombre del animal mandan.
  var WEIGHTS = { title: 7, names: 6, tags: 4, category: 3, body: 1.5 };

  function normalizar(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var EXPANSIONS = {};
  var SPECIES_FOR_WORD = {};
  GROUPS.forEach(function (group) {
    var words = group.map(normalizar);
    // 'gato' y 'perro' fijan la especie: la consulta no debe mezclar especies
    // aunque la ficha mencione a la otra ("sin gatos", "convive con perros").
    var species = words[0] === 'gato' ? 'gato' : (words[0] === 'perro' ? 'perro' : '');
    words.forEach(function (word) {
      EXPANSIONS[word] = (EXPANSIONS[word] || []).concat(words);
      if (species) SPECIES_FOR_WORD[word] = species;
    });
  });

  function stripHtml(value) {
    return String(value == null ? '' : value).replace(/<[^>]*>/g, ' ');
  }

  function flatten(value, out, depth) {
    if (value == null || depth > 4) return out;
    if (typeof value === 'string' || typeof value === 'number') {
      out.push(String(value));
      return out;
    }
    if (Array.isArray(value)) {
      value.forEach(function (item) { flatten(item, out, depth + 1); });
      return out;
    }
    if (typeof value === 'object') {
      for (var key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        if (IGNORE_KEYS[String(key).toLowerCase()]) continue;
        flatten(value[key], out, depth + 1);
      }
    }
    return out;
  }

  function tipo(post) {
    var type = normalizar(post && post.type);
    var cat = normalizar(post && post.category);
    if (type === 'evento' || (post && post.event) || /\beventos?\b/.test(cat)) return 'evento';
    if (type === 'animal' || type === 'animal grupo' || type === 'animal_grupo') return 'animal';
    if (post && (post.animal || post.group)) return 'animal';
    if (/adopcion|acogida|acogidas|adoptados|caso externo|grupo/.test(cat)) return 'animal';
    return 'historia';
  }

  function etiqueta(post) {
    var estado = normalizar(post && post.status);
    var kind = tipo(post);
    if (kind === 'evento') return 'Evento';
    if (/adoptad/.test(estado)) return 'Adoptado';
    if (/acogida/.test(estado)) return 'En acogida';
    if (/reservad/.test(estado)) return 'Reservado';
    if (/urgente/.test(estado)) return 'Urgente';
    if (kind === 'animal') return /acogida/.test(normalizar(post && post.category)) ? 'En acogida' : 'En adopción';
    return 'Historia';
  }

  function postSpecies(post) {
    var species = normalizar((post.animal && post.animal.species) || (post.group && post.group.species) || '');
    if (species) {
      if (species.indexOf('gato') !== -1) return 'gato';
      if (species.indexOf('perro') !== -1) return 'perro';
      return species;
    }
    var cat = normalizar([post.category, post.title].filter(Boolean).join(' '));
    if (/\bgatos?\b|\bgata\b/.test(cat)) return 'gato';
    if (/\bperros?\b|\bperra\b/.test(cat)) return 'perro';
    return '';
  }

  function textFrom(value) {
    if (Array.isArray(value)) return value.map(textFrom).join(' ');
    if (value && typeof value === 'object') return flatten(value, [], 0).join(' ');
    return stripHtml(value);
  }

  var cache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;

  function indexPost(post) {
    if (cache) {
      var hit = cache.get(post);
      if (hit) return hit;
    }
    var names = [];
    if (post.animal && post.animal.names) names = names.concat(post.animal.names);
    if (post.group && post.group.groupName) names.push(post.group.groupName);
    if (post.group && post.group.members) names = names.concat(textFrom(post.group.members).split(' '));
    var bodyParts = [post.excerpt, textFrom(post.content || post.contentHtml)];
    if (post.animal) bodyParts.push(flatten(post.animal, [], 0).join(' '));
    if (post.group) bodyParts.push(flatten(post.group, [], 0).join(' '));
    if (post.event) bodyParts.push(flatten(post.event, [], 0).join(' '));
    var index = {
      title: normalizar(post.title),
      names: normalizar(names.join(' ')),
      tags: normalizar(Array.isArray(post.tags) ? post.tags.join(' ') : post.tags),
      category: normalizar([post.category, post.type, etiqueta(post), post.dateFormatted].filter(Boolean).join(' ')),
      body: normalizar(bodyParts.filter(Boolean).join(' '))
    };
    if (cache) cache.set(post, index);
    return index;
  }

  function fieldScore(text, variants) {
    if (!text) return 0;
    var best = 0;
    for (var i = 0; i < variants.length; i++) {
      var variant = variants[i];
      if (!variant) continue;
      var from = 0;
      while (from <= text.length) {
        var idx = text.indexOf(variant, from);
        if (idx === -1) break;
        var beforeOk = idx === 0 || text.charAt(idx - 1) === ' ';
        var end = idx + variant.length;
        var afterOk = end === text.length || text.charAt(end) === ' ';
        if (beforeOk && afterOk) { best = 1; break; }
        // Prefijo de palabra ("adop" -> "adopcion"), solo desde 4 letras.
        if (beforeOk && variant.length >= 4) best = Math.max(best, 0.8);
        from = idx + 1;
      }
      if (best === 1) break;
    }
    return best;
  }

  function queryGroups(consulta) {
    var tokens = normalizar(consulta).split(' ').filter(function (token) {
      return token.length >= 2 && !STOPWORDS[token];
    });
    var seen = {};
    var groups = [];
    tokens.forEach(function (token) {
      var variants = EXPANSIONS[token] ? EXPANSIONS[token].slice() : [token];
      if (!EXPANSIONS[token]) {
        if (token.length > 4 && token.charAt(token.length - 1) === 's') variants.push(token.slice(0, -1));
        else variants.push(token + 's');
      }
      var key = variants.join('|');
      if (seen[key]) return;
      seen[key] = 1;
      groups.push(variants);
    });
    return groups;
  }

  function scorePost(index, groups, requireAll) {
    var total = 0;
    var matched = 0;
    groups.forEach(function (variants) {
      var best = 0;
      for (var field in WEIGHTS) {
        var value = fieldScore(index[field], variants);
        if (value) best = Math.max(best, value * WEIGHTS[field]);
      }
      if (best) {
        matched++;
        total += best;
      }
    });
    if (!matched) return 0;
    if (requireAll && matched < groups.length) return 0;
    return total + matched * 2;
  }

  function matchesFilter(post, filtro) {
    if (!filtro) return true;
    var kind = tipo(post);
    var cat = normalizar(post.category);
    var estado = normalizar(post.status);
    var species = normalizar((post.animal && post.animal.species) || (post.group && post.group.species) || '');
    switch (filtro) {
      case 'animales': return kind === 'animal';
      case 'eventos': return kind === 'evento';
      case 'historias': return kind === 'historia';
      // El estado manda cuando existe; la categoría solo cubre fichas sin estado.
      case 'acogida': return /acogida/.test(estado) || (!estado && /acogida/.test(cat));
      case 'adopcion': return kind === 'animal' && (/adopcion/.test(estado) || (!estado && /adopcion/.test(cat)));
      case 'gatos': return species === 'gato' || /\bgatos?\b|\bgata\b/.test(cat + ' ' + normalizar(post.title));
      case 'perros': return species === 'perro' || /\bperros?\b|\bperra\b/.test(cat + ' ' + normalizar(post.title));
      default: return true;
    }
  }

  function buscar(posts, consulta, filtro) {
    var speciesWanted = {};
    normalizar(consulta).split(' ').forEach(function (word) {
      if (SPECIES_FOR_WORD[word]) speciesWanted[SPECIES_FOR_WORD[word]] = 1;
    });
    var pool = (Array.isArray(posts) ? posts : []).filter(function (post) {
      if (!post || post.redirect || post.status === 'gone') return false;
      if (!matchesFilter(post, filtro)) return false;
      var species = postSpecies(post);
      if (species && Object.keys(speciesWanted).length && !speciesWanted[species]) return false;
      return true;
    });
    var groups = queryGroups(consulta);
    var limit = 8;

    if (!groups.length) {
      return pool.slice(0, limit).map(function (post) {
        return { post: post, score: 0, tipo: tipo(post), etiqueta: etiqueta(post) };
      });
    }

    var hits = [];
    pool.forEach(function (post) {
      var score = scorePost(indexPost(post), groups, true);
      if (score) hits.push({ post: post, score: score });
    });
    if (!hits.length) {
      // Segunda pasada: alguna coincidencia (búsqueda amplia), peor puntuada.
      pool.forEach(function (post) {
        var score = scorePost(indexPost(post), groups, false);
        if (score) hits.push({ post: post, score: score * 0.6 });
      });
    }
    hits.sort(function (a, b) { return b.score - a.score; });
    return hits.slice(0, limit).map(function (hit) {
      return { post: hit.post, score: hit.score, tipo: tipo(hit.post), etiqueta: etiqueta(hit.post) };
    });
  }

  var api = { buscar: buscar, tipo: tipo, etiqueta: etiqueta, normalizar: normalizar };
  root.NebakBusqueda = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
