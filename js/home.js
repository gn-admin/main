(function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escAttr(v) { return esc(v); }

  function animalName(post) {
    if (post && post.animal && Array.isArray(post.animal.names) && post.animal.names.length) {
      return post.animal.names.join(' & ');
    }
    var t = (post && post.title) || '';
    // Algunos títulos del canal incluyen descripción tras la coma
    // ("Nube, mestizo de 2 años"); en la marquesina solo el nombre.
    if (t.indexOf(',') !== -1) t = t.split(',')[0];
    return String(t).trim();
  }

  function animalIcon(post) {
    var species = '';
    if (post && post.animal && post.animal.species) species = post.animal.species;
    else if (post && post.category) species = post.category;
    var s = String(species).toLowerCase();
    if (s.indexOf('gat') !== -1) return '🐱';
    if (s.indexOf('perr') !== -1 || s.indexOf('perro') !== -1) return '🐕';
    return '🐾';
  }

  function fichaUrl(p) {
    if (p && p.urlEstatica) return p.urlEstatica;
    return 'post/?slug=' + encodeURIComponent(p.slug);
  }

  function imgOf(p) {
    if (p && p.image) return p.image;
    if (p && p.coverImage && p.coverImage.src) return p.coverImage.src;
    return 'assets/images/logo.jpg';
  }

  function altOf(p) {
    if (p && p.imageAlt) return p.imageAlt;
    return (p && p.title) || 'Animal';
  }

  function uniquePosts(posts) {
    var seen = {};
    var out = [];
    (posts || []).forEach(function (p) {
      if (!p || !p.slug || seen[p.slug]) return;
      if (p.status === 'gone' || p.redirect) return;
      seen[p.slug] = true;
      out.push(p);
    });
    return out;
  }

  function initCarousel(root) {
    var track = root.querySelector('.carousel-track');
    var slides = Array.prototype.slice.call(root.querySelectorAll('.carousel-slide'));
    var prev = root.querySelector('[data-carousel-prev]');
    var next = root.querySelector('[data-carousel-next]');
    var dotsWrap = root.querySelector('.carousel-dots');
    if (!track || !slides.length) return;
    var index = 0;
    var perView = 1;
    var timer = null;
    function calcPerView() {
      var w = root.clientWidth || window.innerWidth;
      perView = w >= 1100 ? 3 : (w >= 800 ? 2 : 1);
      return perView;
    }
    function maxIndex() { return Math.max(0, slides.length - calcPerView()); }
    function renderDots() {
      if (!dotsWrap) return;
      var count = maxIndex() + 1;
      dotsWrap.innerHTML = '';
      for (var i = 0; i < count; i++) {
        (function (i) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'carousel-dot' + (i === index ? ' active' : '');
          b.setAttribute('aria-label', 'Ir al grupo ' + (i + 1));
          b.addEventListener('click', function () { go(i); });
          dotsWrap.appendChild(b);
        })(i);
      }
    }
    function update() {
      var pv = calcPerView();
      if (index > maxIndex()) index = maxIndex();
      var pct = (100 / pv) * index;
      track.style.transform = 'translateX(-' + pct + '%)';
      if (dotsWrap) {
        Array.prototype.slice.call(dotsWrap.querySelectorAll('.carousel-dot')).forEach(function (d, i) { d.classList.toggle('active', i === index); });
      }
    }
    function go(i) { index = Math.min(Math.max(0, i), maxIndex()); update(); }
    function step(dir) { go(index + dir); }
    function start() { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches || slides.length <= calcPerView()) return; stop(); timer = window.setInterval(function () { go(index >= maxIndex() ? 0 : index + 1); }, 4500); }
    function stop() { if (timer) { window.clearInterval(timer); timer = null; } }
    if (prev) prev.addEventListener('click', function () { step(-1); start(); });
    if (next) next.addEventListener('click', function () { step(1); start(); });
    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', start);
    window.addEventListener('resize', function () { renderDots(); update(); });
    renderDots(); update(); start();
  }

  function run() {
    var marquee = document.querySelector('[data-marquee]');
    var track = document.querySelector('[data-carousel-track]');
    var eventsGrid = document.querySelector('[data-events-stories]');
    if (!marquee && !track && !eventsGrid) return;

    var api = (typeof PublicacionesAPI !== 'undefined') ? PublicacionesAPI : null;
    if (!api) return;

    var sections = ['gatos', 'perros', 'acogidas', 'eventos', 'historias'];
    api.load(sections).then(function () {
      // Animals for marquee + carousel
      var animals = [];
      ['gatos', 'perros', 'acogidas'].forEach(function (s) {
        animals = animals.concat(api.getPostsFor(s) || []);
      });
      animals = uniquePosts(animals);

      // Marquee: only names + icon
      if (marquee) {
        var chips = animals.map(function (p) {
          return '<span class="chip"><span class="chip-dot"></span>' + animalIcon(p) + ' ' + esc(animalName(p)) + '</span>';
        });
        // duplicate for seamless loop
        marquee.innerHTML = chips.concat(chips).join('');
      }

      // Carousel: animal cards
      if (track) {
        track.innerHTML = animals.map(function (p) {
          var url = fichaUrl(p);
          var img = imgOf(p);
          var alt = altOf(p);
          var meta = p.category || 'Adopción';
          var excerpt = p.excerpt || '';
          return '<div class="carousel-slide"><article class="card"><a href="' + escAttr(url) + '"><img src="' + escAttr(img) + '" alt="' + escAttr(alt) + '" loading="lazy" onerror="this.onerror=null;this.src=\'assets/images/logo.jpg\'"></a><div class="card-body"><p class="meta">' + esc(meta) + '</p><h3>' + esc(p.title) + '</h3><p>' + esc(excerpt) + '</p><a class="card-link" href="' + escAttr(url) + '">Conocer historia →</a></div></article></div>';
        }).join('');
        var carouselRoot = track.closest('[data-carousel]');
        if (carouselRoot) initCarousel(carouselRoot);
      }

      // Events + stories
      if (eventsGrid) {
        var events = uniquePosts((api.getPostsFor('eventos') || []).concat(api.getPostsFor('historias') || []));
        // sort by date desc
        events.sort(function (a, b) {
          return String(b.date || '').localeCompare(String(a.date || ''));
        });
        events = events.slice(0, 6);
        eventsGrid.innerHTML = events.map(function (p) {
          var url = fichaUrl(p);
          var img = imgOf(p);
          var alt = altOf(p);
          var meta = (p.category || '') + (p.dateFormatted || p.date ? ' · ' + esc(p.dateFormatted || String(p.date).slice(0, 10)) : '');
          return '<article class="card reveal event-row is-visible"><img src="' + escAttr(img) + '" alt="' + escAttr(alt) + '" loading="lazy" onerror="this.onerror=null;this.src=\'assets/images/logo.jpg\'"><div class="card-body"><p class="meta">' + meta + '</p><h3><a href="' + escAttr(url) + '">' + esc(p.title) + '</a></h3></div></article>';
        }).join('');
      }
    }).catch(function () { /* keep empty */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
