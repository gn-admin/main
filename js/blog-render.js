(function () {
  'use strict';

  function raizRelativa() {
    var link = document.querySelector('link[rel="stylesheet"][href*="main.css"]');
    if (link) {
      var href = link.getAttribute('href') || '';
      if (href.indexOf('../') === 0) return '../';
    }
    return '';
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderError(root, message) {
    root.innerHTML = '<a class="card-link" href="../historias/">← Volver a historias</a>' +
      '<div class="post-sheet" style="margin-top:1rem"><h1>No encontramos esta ficha</h1><p>' + esc(message) + '</p><p><a class="btn btn-primary" href="../historias/">Ver historias</a></p></div>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('blogPostDetail');
    if (!root || typeof HistoriasAPI === 'undefined') return;
    if (typeof PostTemplate === 'undefined') {
      renderError(root, 'No se pudo cargar la plantilla de la ficha.');
      return;
    }
    var params = new URLSearchParams(window.location.search);
    var slug = params.get('slug');
    var fromParam = params.get('from');
    if (!slug) { renderError(root, 'El enlace no incluye el identificador de la publicación.'); return; }
    HistoriasAPI.loadPost(slug).then(function (resultado) {
      var post = resultado && resultado.post;
      if (!post) {
        if (resultado && resultado.gone) {
          var meta = document.createElement('meta');
          meta.name = 'robots';
          meta.content = 'noindex,nofollow';
          document.head.appendChild(meta);
        }
        renderError(root, (resultado && resultado.gone)
          ? (resultado.message || 'Esta publicación se ha retirado.')
          : 'Puede que la publicación se haya movido o ya no esté disponible.');
        return;
      }
      // Slug histórico: misma ficha, URL nueva (sin recargar).
      if (resultado.redirect && resultado.redirect.slug && resultado.redirect.slug !== post.slug) {
        params.set('slug', resultado.redirect.slug);
        if (window.history && history.replaceState) {
          history.replaceState(null, '', 'post/?' + params.toString());
        }
      }
      // La ficha estática es la canónica: evita que el SPA compita en buscadores.
      if (post && post.urlEstatica) {
        var estatica = post.urlEstatica;
        if (!/^https?:\/\//i.test(estatica)) {
          estatica = raizRelativa() + post.urlEstatica;
        }
        var canonical = document.querySelector('link[rel="canonical"]');
        if (!canonical) {
          canonical = document.createElement('link');
          canonical.rel = 'canonical';
          document.head.appendChild(canonical);
        }
        canonical.href = estatica;
      }
      document.title = post.title + ' · Grupo Nebak';
      root.innerHTML = PostTemplate.renderArticle(post, {
        from: fromParam,
        fallbackImage: HistoriasAPI.fallbackImage
      });
      PostTemplate.initCarousels(root);
      // Publicaciones relacionadas por categoría (filtro avanzado de detalle).
      try {
        var todos = (typeof HistoriasAPI.getAllPosts === 'function') ? (HistoriasAPI.getAllPosts() || []) : [];
        var relacionadas = todos.filter(function (p) {
          return p && p.slug && p.slug !== post.slug && (p.category || '') === (post.category || '');
        }).slice(0, 4);
        if (relacionadas.length) {
          var html = '<section class="post-related" style="margin-top:2rem"><h2>Más de ' + esc(post.category || 'esta categoría') + '</h2><ul>';
          relacionadas.forEach(function (p) {
            var url = (p.urlEstatica) ? (raizRelativa() + p.urlEstatica) : ('post/?slug=' + encodeURIComponent(p.slug));
            html += '<li><a href="' + esc(url) + '">' + esc(p.title) + '</a></li>';
          });
          html += '</ul></section>';
          root.insertAdjacentHTML('beforeend', html);
        }
      } catch (e) { /* sin bloquear */ }
    }).catch(function (err) {
      renderError(root, 'No se pudo cargar la publicación. Comprueba tu conexión o inténtalo de nuevo.');
      console.error(err);
    });
  });
})();
