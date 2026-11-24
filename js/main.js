(function () {
  window.__nebakImgFallback = function (el) { el.onerror = null; el.src = raizRelativa() + 'assets/images/logo.jpg'; };
  'use strict';
  document.documentElement.classList.add('js');

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // La canónica de una ficha es su página estática; si aún no existe, se usa
  // el enlace dinámico antiguo.
  function raizRelativa() {
    var link = document.querySelector('link[rel="stylesheet"][href*="main.css"]');
    if (link) {
      var href = link.getAttribute('href') || '';
      if (href.indexOf('../') === 0) return '../';
    }
    return '';
  }

  function fichaUrl(p, from) {
    if (p && p.urlEstatica) return raizRelativa() + p.urlEstatica;
    return 'post/?slug=' + encodeURIComponent(p.slug) + '&from=' + encodeURIComponent(from || 'historias');
  }

  // Envío de formularios: EmailJS + reCAPTCHA cuando hay configuración; si no,
  // se mantiene el modo simulado (sin peticiones externas).
  function submitFormPayload(payload) {
    var transport = window.NebakFormsTransport;
    if (transport && typeof transport.send === 'function') return transport.send(payload);
    return new Promise(function (resolve) {
      window.setTimeout(function () { resolve({ simulated: true }); }, 900);
    });
  }

  function formErrorMessage(err) {
    try { console.warn('[NebakForms] no se pudo enviar el formulario', err); } catch (_) {}
    var transport = window.NebakFormsTransport;
    if (transport && typeof transport.errorMessage === 'function') return transport.errorMessage(err);
    return 'No se ha podido enviar el formulario. Inténtalo de nuevo en unos segundos o escríbenos a nebakadopciones@gmail.com.';
  }

  function showFormStatus(el, text, isError) {
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', !!isError);
    el.setAttribute('role', isError ? 'alert' : 'status');
    el.classList.add('show');
  }

  function clearFormStatus(el) {
    if (!el) return;
    el.classList.remove('show', 'is-error');
    el.setAttribute('role', 'status');
  }

  if (window.NebakFormsTransport && typeof window.NebakFormsTransport.preload === 'function') {
    try { window.NebakFormsTransport.preload(); } catch (_) {}
  }

  // Year
  $$('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  // Mobile nav
  var nav = $('#siteNav');
  var toggle = $('.nav-toggle');
  function setNav(open) {
    if (!nav || !toggle) return;
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (toggle) {
    toggle.addEventListener('click', function () { setNav(!nav.classList.contains('open')); });
  }
  document.addEventListener('click', function (e) {
    if (!nav || !toggle) return;
    if (!nav.classList.contains('open')) return;
    if (nav.contains(e.target) || toggle.contains(e.target)) return;
    setNav(false);
  });

  // Dropdowns
  $$('.nav-dropdown > button').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var item = btn.closest('.nav-dropdown');
      var open = item.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      $$('.nav-dropdown.open').forEach(function (other) {
        if (other !== item) {
          other.classList.remove('open');
          var b = other.querySelector('button');
          if (b) b.setAttribute('aria-expanded', 'false');
        }
      });
    });
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('.nav-dropdown')) return;
    $$('.nav-dropdown.open').forEach(function (item) {
      item.classList.remove('open');
      var b = item.querySelector('button');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      setNav(false);
      $$('.nav-dropdown.open').forEach(function (item) {
        item.classList.remove('open');
        var b = item.querySelector('button');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
    }
  });

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reveal on scroll (with stagger support via classes)
  var reveals = $$('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  } else if (reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  // Subtle interactive tilt for media/cards
  (function initTilt() {
    if (reduced || !window.matchMedia('(pointer: fine)').matches) return;
    $$('.hero-media, .split-media .rounded-img, .impact-band').forEach(function (el) {
      if (el.dataset.tiltBound) return;
      el.dataset.tiltBound = '1';
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = 'perspective(900px) rotateX(' + (-y * 3.5).toFixed(2) + 'deg) rotateY(' + (x * 4.5).toFixed(2) + 'deg) translateY(-2px)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  })();

  // Dynamic adoption listings (cats/dogs) with search & filters
  (function initAdoptionListings() {
    var containers = $$('[data-adoption-list]');
    if (!containers.length) return;
    function norm(s){ return (s||'').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
    function imgPath(p){ if(!p) return ''; var s=String(p); if(s.indexOf('http://')===0 || s.indexOf('https://')===0 || s.indexOf('../')===0 || s.charAt(0)==='/') return s; return raizRelativa()+s; }
    function sameCat(a,b){ return norm(a) === norm(b); }
    function tagFlags(p){
      var t = norm([p.title,p.excerpt,p.content,(p.tags||[]).join(' ')].join(' '));
      return {
        urgente: /urgent|urgente/.test(t),
        cachorro: /cachorr|gatit|beb[eé]|meses?/.test(t),
        adulto: /adult|senior|a[nñ]os?/.test(t) && !/meses?/.test(t),
        especial: /especial|ciego|ciega|tuert|neuron|cuidados/.test(t)
      };
    }
    var api = (typeof PublicacionesAPI !== 'undefined') ? PublicacionesAPI : null;
    if (!api) return;
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
    var secciones = [];
    var faltaSeccion = false;
    containers.forEach(function(root){
      var c = root.getAttribute('data-adoption-list');
      var s = /gatos/i.test(c) ? 'gatos'
        : (/perros/i.test(c) ? 'perros'
        : (/otro/i.test(c) ? 'otros'
        : (/acogid/i.test(c) ? 'acogidas'
        : (/adoptad/i.test(c) ? 'adoptados'
        : (/caso externo/i.test(c) ? 'casosExternos'
        : (/grupo/i.test(c) ? 'grupos'
        : (/evento/i.test(c) ? 'eventos' : '')))))));

      if (!s) faltaSeccion = true;
      else if (secciones.indexOf(s) === -1) secciones.push(s);
    });
    api.load(faltaSeccion ? undefined : secciones).then(function(){
      // Pequeño retraso para que el card "Cargando datos" sea visible
      // aunque el endpoint responda rápido (mejor UX).
      return new Promise(function (resolve) { setTimeout(resolve, 600); });
    }).then(function(){
      var posts = api.getAllPosts();
      containers.forEach(function(root){
        var cat = root.getAttribute('data-adoption-list');
        var seccion = /gatos/i.test(cat) ? 'gatos'
          : (/perros/i.test(cat) ? 'perros'
          : (/otro/i.test(cat) ? 'otros'
          : (/acogid/i.test(cat) ? 'acogidas'
          : (/adoptad/i.test(cat) ? 'adoptados'
          : (/caso externo/i.test(cat) ? 'casosExternos'
          : (/grupo/i.test(cat) ? 'grupos'
          : (/evento/i.test(cat) ? 'eventos' : '')))))));

        var list = (seccion && typeof api.getPostsFor === 'function')
          ? api.getPostsFor(seccion)
          : posts.filter(function(p){ return sameCat(p.category, cat); });
        var search = document.querySelector('[data-adoption-search="'+cat+'"]');
        var filterSel = document.querySelector('[data-adoption-filter="'+cat+'"]');
        var chipsWrap = document.querySelector('[data-adoption-chips="'+cat+'"]');
        var meta = document.querySelector('[data-adoption-meta="'+cat+'"]');
        var state = { q:'', filter:'all', sort:'recent' };
        var taxonomyStatuses = null; // null = no cargado; [] = sin taxonomías
        var CHIP_KEYS = ['urgente','cachorro','adulto','especial'];

        // En las páginas de adopción el filtro de perfil se deriva del texto
        // (cachorros, adultos, urgente, necesidades especiales); las taxonomías
        // de estado del canal (en_adopcion, reservado...) no aportan aquí.
        var esAdopcion = /gatos|perros|otro/i.test(cat);
        var tipoTax = /grupo/i.test(cat) ? 'animal_grupo'
          : (/evento/i.test(cat) ? 'evento' : 'animal');
        if (esAdopcion) {
          taxonomyStatuses = [];
          renderChips();
        } else if (api.taxonomias) {
          api.taxonomias(tipoTax).then(function (res) {
            var data = (res && res.data) || res || {};
            var statuses = (data.status || data.statuses || []);
            if (Array.isArray(statuses) && statuses.length) {
              taxonomyStatuses = statuses;
              renderChips();
              render();
            }
          }).catch(function () { taxonomyStatuses = []; });
        }

        function renderChips() {
          if (!chipsWrap) return;
          var isTax = !!(taxonomyStatuses && taxonomyStatuses.length);
          var chips = ['<button type="button" class="filter-chip is-active" data-filter="all" aria-pressed="true">Todos</button>'];
          if (isTax) {
            taxonomyStatuses.forEach(function (st) {
              var val = (typeof st === 'string') ? st : (st.value || st.slug || st.label || '');
              var lab = (typeof st === 'string') ? st : (st.label || st.value || st.slug || '');
              if (!val) return;
              chips.push('<button type="button" class="filter-chip" data-filter="' + escAttr(val) + '" aria-pressed="false">' + esc(lab) + '</button>');
            });
          } else {
            chips.push('<button type="button" class="filter-chip" data-filter="urgente" aria-pressed="false">Urgente</button>');
            chips.push('<button type="button" class="filter-chip" data-filter="cachorro" aria-pressed="false">Cachorros</button>');
            chips.push('<button type="button" class="filter-chip" data-filter="adulto" aria-pressed="false">Adultos / Senior</button>');
            chips.push('<button type="button" class="filter-chip" data-filter="especial" aria-pressed="false">Necesidades especiales</button>');
          }
          chipsWrap.innerHTML = chips.join('');
        }

        function render(){
          var q = norm(state.q);
          var filtered = list.filter(function(p){
            // Descartar publicaciones retiradas o redirigidas.
            if (p && (p.status === 'gone' || p.redirect)) return false;
            var text = norm([p.title,p.excerpt,p.category,(p.tags||[]).join(' ')].join(' '));
            if (q && text.indexOf(q) === -1) return false;
            var isTax = !!(taxonomyStatuses && taxonomyStatuses.length);
            if (state.filter !== 'all') {
              if (isTax) {
                if (p.status !== state.filter) return false;
              } else {
                var f = tagFlags(p);
                if (state.filter === 'urgente' && !f.urgente) return false;
                if (state.filter === 'cachorro' && !f.cachorro) return false;
                if (state.filter === 'adulto' && !f.adulto) return false;
                if (state.filter === 'especial' && !f.especial) return false;
              }
            }
            return true;
          });
          if (state.sort === 'name') filtered.sort(function(a,b){ return (a.title||'').localeCompare(b.title||'', 'es'); });
          else filtered.sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); });
          if (meta) meta.textContent = filtered.length + ' caso' + (filtered.length===1?'':'s') + ' mostrado' + (filtered.length===1?'':'s');
          if (!filtered.length) {
            root.innerHTML = '<div class="listing-empty">No hay animales disponibles en este momento.</div>';
            return;
          }
          root.innerHTML = filtered.map(function(p){
            var cNorm = norm(cat);
            var from = (cNorm.indexOf('gatos') !== -1) ? 'gatos'
              : (cNorm.indexOf('perros') !== -1 ? 'perros'
              : (cNorm.indexOf('otro') !== -1 ? 'otros'
              : (cNorm.indexOf('grupo') !== -1 ? 'grupos'
              : (cNorm.indexOf('evento') !== -1 ? 'eventos'
              : (cNorm.indexOf('acogid') !== -1 ? 'acogidas'
              : (cNorm.indexOf('adoptad') !== -1 ? 'adoptados'
              : (cNorm.indexOf('caso externo') !== -1 ? 'casosExternos' : 'historias')))))));

            var href = fichaUrl(p, from);
            var img = imgPath(p.image);
            var flags = tagFlags(p);
            var badges = [];
            if (p.featured) badges.push('Destacado');
            if (p.sponsor && p.sponsor.available) badges.push('Apadrinable');
            if (flags.urgente) badges.push('Urgente');
            if (flags.cachorro) badges.push('Cachorro');
            if (flags.especial) badges.push('Necesidades especiales');
            var badgeHtml = badges.length ? '<p class="meta">' + badges.join(' · ') + '</p>' : '<p class="meta">' + (p.category||'Adopción') + '</p>';
            return '<article class="card listing-card reveal is-visible">' +
              (img ? '<a href="'+href+'"><img src="'+img+'" alt="'+(p.title||'Animal en adopción')+'" loading="lazy" onerror="window.__nebakImgFallback(this)"></a>' : '') +
              '<div class="card-body">' + badgeHtml + '<h3>'+(p.title||'')+'</h3><p>'+(p.excerpt||'')+'</p>' +
              '<a class="card-link" href="'+href+'">Ver ficha →</a></div></article>';
          }).join('');
        }

        if (search) search.addEventListener('input', function(){ state.q = search.value || ''; render(); });
        if (filterSel) filterSel.addEventListener('change', function(){ state.sort = filterSel.value || 'recent'; render(); });
        // Delegación para chips (estáticos o dinámicos por taxonomías).
        if (chipsWrap) {
          chipsWrap.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest ? e.target.closest('[data-filter]') : null;
            if (!btn || !chipsWrap.contains(btn)) return;
            $$('.filter-chip', chipsWrap).forEach(function (b) { b.classList.remove('is-active'); b.setAttribute('aria-pressed', 'false'); });
            btn.classList.add('is-active'); btn.setAttribute('aria-pressed', 'true');
            state.filter = btn.getAttribute('data-filter') || 'all';
            render();
          });
        }
        // Render inicial de chips (fallback) y luego taxonomías.
        renderChips();
        render();
      });
    }).catch(function(){
      containers.forEach(function(root){ root.innerHTML = '<div class="listing-empty">No se pudo cargar el listado ahora mismo. Puedes escribirnos en <a href="../contacto/">contacto</a>.</div>'; });
    });
  })();

  // Simple carousel
  $$('[data-carousel]').forEach(function (root) {
    var track = root.querySelector('.carousel-track');
    var slides = $$('.carousel-slide', root);
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
        $$('.carousel-dot', dotsWrap).forEach(function (d, i) { d.classList.toggle('active', i === index); });
      }
    }
    function go(i) { index = Math.min(Math.max(0, i), maxIndex()); update(); }
    function step(dir) { go(index + dir); }
    function start() { if (reduced || slides.length <= calcPerView()) return; stop(); timer = window.setInterval(function(){ go(index >= maxIndex() ? 0 : index + 1); }, 4500); }
    function stop() { if (timer) { window.clearInterval(timer); timer = null; } }
    if (prev) prev.addEventListener('click', function () { step(-1); start(); });
    if (next) next.addEventListener('click', function () { step(1); start(); });
    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', start);
    window.addEventListener('resize', function () { renderDots(); update(); });
    renderDots(); update(); start();
  });

  // Typed contact/form modal system (conceptos para clasificación de email)
  var NebakForms = (function () {
    var modal, dialog, titleEl, introEl, formEl, successEl, conceptEl, pageEl, lastFocus;
    var typeAliases = { adopt: 'adopcion-animal', acoge: 'acogida', vol: 'voluntariado', donar: 'donaciones' };
    var types = {
      'contacto-general': { title: 'Contacto general', intro: 'Cuéntanos en qué podemos ayudarte y te responderemos lo antes posible.', subject: 'Contacto general', fields: ['asunto','mensaje'], success: 'Gracias por tu mensaje. Hemos registrado tu consulta general.' },
      'voluntariado': { title: 'Voluntariado', intro: 'Cuéntanos cómo te gustaría colaborar, tu disponibilidad y tu zona.', subject: 'Voluntariado', fields: ['tipo_voluntariado','disponibilidad','zona','mensaje'], success: 'Gracias por tu interés en el voluntariado. Te responderemos pronto.' },
      'donaciones': { title: 'Consulta sobre donaciones', intro: 'Resuelve tus dudas sobre cómo colaborar con Nebak.', subject: 'Consulta sobre donaciones', fields: ['tipo_donacion','mensaje'], success: 'Gracias por tu interés en donar. Te responderemos con la información solicitada.' },
      'acogida': { title: 'Solicitud de acogida', intro: 'Ofrecer una casa de acogida es un paso muy valioso. Cuéntanos tu situación.', subject: 'Solicitud de acogida', fields: ['tipo_acogida','duracion','convivencia','mensaje'], success: 'Gracias por tu interés en acoger. Te contactaremos lo antes posible.' },
      'adopcion-animal': { title: 'Consulta de adopción', intro: 'Pregúntanos por este animal y te orientaremos sobre el proceso de adopción.', subject: 'Consulta de adopción', fields: ['animal','mensaje'], success: 'Gracias por tu interés en adoptar. Te responderemos con más información.' },
      'consulta-animal': { title: 'Consulta sobre un caso', intro: 'Escríbenos sobre este caso y te daremos más información.', subject: 'Consulta sobre un caso', fields: ['animal','mensaje'], success: 'Gracias por tu consulta. Te responderemos lo antes posible.' },
      'socio': { title: 'Hacerme socio/a', intro: 'Solicita información para hacerte socio/a de Nebak.', subject: 'Solicitud de socio/a', fields: ['modalidad_socio','mensaje'], success: 'Gracias por tu interés en hacerte socio/a. Te contactaremos pronto.' }
    };
    function esc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function pageName(){ try { return document.title || location.pathname; } catch(e){ return ''; } }
    function ensure() {
      if (modal) return modal;
      modal = document.createElement('div');
      modal.className = 'form-modal';
      modal.id = 'nebakFormModal';
      modal.setAttribute('aria-hidden','true');
      modal.innerHTML = ''+
        '<div class="form-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="nebakFormTitle">'+
          '<div class="form-modal-header">'+
            '<div class="form-modal-header-copy"><p class="eyebrow" id="nebakFormConcept">Formulario</p><h2 id="nebakFormTitle">Contacto</h2></div>'+
            '<button type="button" class="form-modal-close" data-form-close aria-label="Cerrar formulario"><span aria-hidden="true">&times;</span></button>'+
          '</div>'+
          '<div class="form-modal-body">'+
            '<p id="nebakFormIntro" class="form-modal-intro"></p>'+
            '<form id="nebakModalForm" novalidate>'+
              '<input type="hidden" name="form_type" id="nebakFormType">'+
              '<input type="hidden" name="concepto" id="nebakFormConceptValue">'+
              '<input type="hidden" name="origen_pagina" id="nebakFormPage">'+
              '<input type="hidden" name="animal_slug" id="nebakAnimalSlug">'+
              '<div class="form-modal-grid" id="nebakFormFields"></div>'+
              '<div class="actions form-modal-actions"><button class="btn btn-primary" type="submit">Enviar</button><button class="btn btn-secondary" type="button" data-form-close>Cancelar</button></div>'+
              '<p class="form-success" id="nebakFormSuccess" role="status"></p>'+
              '<p class="form-note">Formulario de contacto: incluimos el tipo de consulta y el contexto de la página para clasificar tu mensaje.</p>'+
            '</form>'+
          '</div>'+
        '</div>';
      document.body.appendChild(modal);
      dialog = modal.querySelector('.form-modal-dialog');
      titleEl = modal.querySelector('#nebakFormTitle');
      introEl = modal.querySelector('#nebakFormIntro');
      formEl = modal.querySelector('#nebakModalForm');
      if (window.NebakFormsTransport && typeof window.NebakFormsTransport.installHoneypots === 'function') {
        window.NebakFormsTransport.installHoneypots(formEl);
      }
      successEl = modal.querySelector('#nebakFormSuccess');
      conceptEl = modal.querySelector('#nebakFormConcept');
      pageEl = modal.querySelector('#nebakFormPage');
      modal.addEventListener('click', function(e){ if (e.target === modal) close(); });
      $$('[data-form-close]', modal).forEach(function(b){ b.addEventListener('click', close); });
      document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && modal.classList.contains('is-open')) close(); });
      formEl.addEventListener('submit', function(e){
        e.preventDefault();
        if (!formEl.checkValidity()) { formEl.reportValidity(); return; }
        var btn = formEl.querySelector('button[type="submit"]');
        var orig = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
        formEl.setAttribute('aria-busy', 'true');
        var payload = {};
        new FormData(formEl).forEach(function(v,k){ payload[k]=v; });
        window.__nebakLastFormPayload = payload; // preparado para integración email/backend
        function restore() {
          if (btn) { btn.disabled = false; btn.textContent = orig || 'Enviar'; }
          formEl.removeAttribute('aria-busy');
        }
        function ok(result) {
          formEl.reset();
          modal.querySelector('#nebakFormType').value = payload.form_type || '';
          modal.querySelector('#nebakFormConceptValue').value = payload.concepto || '';
          modal.querySelector('#nebakFormPage').value = payload.origen_pagina || pageName();
          modal.querySelector('#nebakAnimalSlug').value = payload.animal_slug || '';
          restore();
          showFormStatus(successEl, (types[payload.form_type] && types[payload.form_type].success) || 'Gracias. Hemos recibido tu mensaje.', false);
          if (typeof showToast === 'function') {
            showToast(result && result.simulated ? ('Solicitud registrada (' + (payload.concepto || payload.form_type || 'formulario') + ')') : 'Mensaje enviado correctamente');
          }
        }
        function fail(err) {
          restore();
          showFormStatus(successEl, formErrorMessage(err), true);
        }
        submitFormPayload(payload).then(ok, fail);
      });
      formEl.addEventListener('input', function(){ clearFormStatus(successEl); });
      return modal;
    }
    function fieldHtml(name, ctx, cfg) {
      var v = function(k){ return esc((ctx && ctx[k]) || ''); };
      var animalRO = ctx && (ctx.animal || ctx.animal_name) ? ' readonly' : '';
      switch(name) {
        case 'nombre': return '<label>Nombre *<input type="text" name="nombre" required maxlength="100" autocomplete="name"></label>';
        case 'email': return '<label>Email *<input type="email" name="email" required maxlength="250" autocomplete="email"></label>';
        case 'telefono': return '<label>Teléfono<input type="tel" name="telefono" maxlength="50" autocomplete="tel"></label>';
        case 'asunto': return '<label>Asunto<input type="text" name="asunto" maxlength="250" value="'+esc((ctx&&ctx.subject)||cfg.subject||'')+'"></label>';
        case 'tipo_voluntariado': return '<label>Tipo de voluntariado *<select name="tipo_voluntariado" required><option value="">Selecciona una opción</option><option>Colonias felinas / CES</option><option>Rescates y emergencias</option><option>Traslados al veterinario</option><option>Construcción/mantenimiento de casetas</option><option>Difusión y eventos</option><option>Casas de acogida (apoyo)</option><option>Otro</option></select></label>';
        case 'disponibilidad': return '<label>Disponibilidad<input type="text" name="disponibilidad" placeholder="Días, horarios, puntual o regular"></label>';
        case 'zona': return '<label>Zona / localidad<input type="text" name="zona" placeholder="Irún, Hondarribia, Donostia..."></label>';
        case 'tipo_donacion': return '<label>Tipo de consulta de donación *<select name="tipo_donacion" required><option value="">Selecciona una opción</option><option>Donación puntual / transferencia</option><option>Teaming (1 €/mes)</option><option>Hacerme socio/a o cuota</option><option>Donación de material</option><option>Dudas generales sobre donaciones</option><option>Otra colaboración</option></select></label>';
        case 'modalidad_socio': return '<label>Modalidad *<select name="modalidad_socio" required><option value="">Selecciona una opción</option><option>5 €/mes</option><option>60 €/año</option><option>Quiero información</option></select></label>';
        case 'tipo_acogida': return '<label>Tipo de acogida<input type="text" name="tipo_acogida" placeholder="Gato, perro, cachorro, urgencia, cuidados..."></label>';
        case 'duracion': return '<label>Tiempo disponible<input type="text" name="duracion" placeholder="Semanas, meses, según necesidad..."></label>';
        case 'convivencia': return '<label>Convivencia<input type="text" name="convivencia" placeholder="Otros animales, niños, vivienda, etc."></label>';
        case 'animal': return '<label>Animal / caso<input type="text" name="animal" value="'+v('animal')+v('animal_name')+'" placeholder="Nombre del animal o caso"'+animalRO+'></label>';
        case 'mensaje': return '<label>Mensaje *<textarea name="mensaje" required placeholder="'+esc((ctx&&ctx.placeholder)||'Cuéntanos los detalles...')+'">'+esc((ctx&&ctx.message)||'')+'</textarea></label>';
        default: return '';
      }
    }
    function fieldsFor(cfg, ctx) {
      var list = ['nombre','email','telefono'].concat(cfg.fields || ['mensaje']);
      // de-dup keep order
      var seen={}, out=[];
      list.forEach(function(f){ if(!seen[f]){ seen[f]=1; out.push(f); } });
      return out.map(function(f){ return fieldHtml(f, ctx, cfg); }).join('');
    }
    function open(type, ctx) {
      ensure();
      ctx = ctx || {};
      type = typeAliases[type] || type;
      var cfg = types[type] || types['contacto-general'];
      var concept = (ctx.concept || cfg.subject || type);
      titleEl.textContent = cfg.title;
      introEl.textContent = ctx.intro || cfg.intro;
      conceptEl.textContent = concept;
      modal.querySelector('#nebakFormType').value = type;
      modal.querySelector('#nebakFormConceptValue').value = concept;
      modal.querySelector('#nebakFormPage').value = ctx.page || pageName();
      modal.querySelector('#nebakAnimalSlug').value = ctx.animal_slug || ctx.slug || '';
      modal.querySelector('#nebakFormFields').innerHTML = fieldsFor(cfg, ctx);
      if (successEl) successEl.classList.remove('show');
      lastFocus = document.activeElement;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden','false');
      document.body.classList.add('modal-open');
      var first = modal.querySelector('input:not([type="hidden"]), select, textarea, button');
      if (first) try { first.focus(); } catch(e){}
    }
    function close() {
      if (!modal) return;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden','true');
      document.body.classList.remove('modal-open');
      if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch(e){}
    }
    function inferType(el) {
      var t = (el.getAttribute('data-form-type') || el.getAttribute('data-open-form') || '').toLowerCase();
      if (t) return t;
      return 'contacto-general';
    }
    document.addEventListener('click', function(e){
      var trigger = e.target.closest('[data-open-form],[data-form-type]');
      if (!trigger) return;
      if (trigger.tagName === 'A') e.preventDefault();
      var type = inferType(trigger);
      var ctx = {
        concept: trigger.getAttribute('data-form-concept') || '',
        subject: trigger.getAttribute('data-form-subject') || trigger.getAttribute('data-subject') || '',
        animal: trigger.getAttribute('data-animal') || '',
        animal_slug: trigger.getAttribute('data-animal-slug') || '',
        message: trigger.getAttribute('data-message') || '',
        placeholder: trigger.getAttribute('data-placeholder') || '',
        intro: trigger.getAttribute('data-form-intro') || '',
        page: pageName()
      };
      open(type, ctx);
    });
    return { open: open, close: close, types: types };
  })();
  window.NebakForms = NebakForms;

  // Contact/forms (static) with concept metadata
  $$('form[data-static-form]').forEach(function (form) {
    var success = form.querySelector('.form-success');
    var successText = success ? success.textContent : '';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var btn = form.querySelector('button[type="submit"], input[type="submit"]');
      var orig = btn ? (btn.textContent || btn.value) : '';
      if (btn) { btn.disabled = true; if (btn.textContent) btn.textContent = 'Enviando…'; else btn.value = 'Enviando…'; }
      form.setAttribute('aria-busy', 'true');
      var payload = {};
      try { new FormData(form).forEach(function(v,k){ payload[k]=v; }); } catch(_){}
      payload.form_type = form.getAttribute('data-form-type') || payload.form_type || 'formulario-estatico';
      payload.concepto = form.getAttribute('data-form-concept') || payload.concepto || payload.form_type;
      payload.origen_pagina = document.title || location.pathname;
      window.__nebakLastFormPayload = payload;
      function restore() {
        form.removeAttribute('aria-busy');
        if (!btn) return;
        btn.disabled = false;
        if (btn.textContent !== undefined && orig) btn.textContent = orig;
        else if (orig) btn.value = orig;
      }
      submitFormPayload(payload).then(function (result) {
        form.reset();
        // reset() vacía también los campos ocultos: se reponen para el siguiente envío.
        var typeInput = form.querySelector('input[name="form_type"]');
        var conceptInput = form.querySelector('input[name="concepto"]');
        if (typeInput) typeInput.value = payload.form_type;
        if (conceptInput) conceptInput.value = payload.concepto;
        restore();
        showFormStatus(success, successText, false);
        if (typeof showToast === 'function') {
          showToast(result && result.simulated ? ('Solicitud registrada (' + (payload.concepto || payload.form_type) + ')') : 'Mensaje enviado correctamente');
        }
      }, function (err) {
        restore();
        showFormStatus(success, formErrorMessage(err), true);
      });
    });
    form.addEventListener('input', function () {
      clearFormStatus(success);
    });
  });

  // Toast helper
  var toastEl = $('#toast');
  var toastTimer = null;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toastEl.classList.remove('is-visible'); }, 2600);
  }

  // Cookies (banner + modal)
  (function initCookies() {
    var CONSENT_KEY = 'nebak-cookie-consent-v2';
    var banner = $('#cookieBanner');
    var modal = $('#cookieModal');
    var analyticsInput = $('#cookieAnalytics');
    var marketingInput = $('#cookieMarketing');
    if (!banner || !modal) return;

    function readConsent() {
      try { return JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null'); } catch (e) { return null; }
    }
    function applyConsent(c) {
      if (analyticsInput) analyticsInput.checked = !!(c && c.analytics);
      if (marketingInput) marketingInput.checked = !!(c && c.marketing);
    }
    function showBanner() { banner.classList.add('is-visible'); banner.setAttribute('aria-hidden', 'false'); document.body.classList.add('has-cookie'); }
    function hideBanner() { banner.classList.remove('is-visible'); banner.setAttribute('aria-hidden', 'true'); document.body.classList.remove('has-cookie'); }
    function openModal() { applyConsent(readConsent() || { analytics: false, marketing: false }); modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false'); }
    function closeModal() { modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true'); }
    function saveConsent(c, msg) {
      try { localStorage.setItem(CONSENT_KEY, JSON.stringify(c)); } catch (e) {}
      hideBanner(); closeModal(); showToast(msg || 'Preferencias de cookies guardadas.');
    }

    var existing = readConsent();
    if (existing) applyConsent(existing); else showBanner();

    var accept = $('[data-cookie-accept]');
    var options = $('[data-cookie-options]');
    var close = $('[data-cookie-close]');
    var save = $('[data-cookie-save]');
    var rejectAll = $('[data-cookie-reject-all]');
    var modalClose = $('[data-cookie-modal-close]');
    if (accept) accept.addEventListener('click', function () { saveConsent({ necessary: true, analytics: true, marketing: false, ts: Date.now() }, 'Cookies aceptadas.'); });
    if (options) options.addEventListener('click', openModal);
    if (close) close.addEventListener('click', function () { hideBanner(); });
    if (save) save.addEventListener('click', function () { saveConsent({ necessary: true, analytics: !!(analyticsInput && analyticsInput.checked), marketing: !!(marketingInput && marketingInput.checked), ts: Date.now() }); });
    if (rejectAll) rejectAll.addEventListener('click', function () { saveConsent({ necessary: true, analytics: false, marketing: false, ts: Date.now() }, 'Solo se usarán cookies necesarias.'); });
    if (modalClose) modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal(); });
  })();

  // Chat assistant with inline forms and animal search
  (function initChat() {
    var toggle = $('#chatToggle');
    var panel = $('#chatPanel');
    var close = $('#chatClose');
    var body = $('#chatBody');
    if (!toggle || !panel || !body) return;

    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    var headTitle = panel.querySelector('.chat-head h3');
    if (headTitle) {
      if (!headTitle.id) headTitle.id = 'chatTitle';
      panel.setAttribute('aria-labelledby', headTitle.id);
    }
    toggle.setAttribute('aria-haspopup', 'dialog');
    var statusEl = panel.querySelector('.chat-status');
    var lastSearch = { query: '', filter: '' };

    function setStatus(text) { if (statusEl) statusEl.textContent = text; }
    function scrollChatTop() { try { body.scrollTop = 0; } catch (e) {} }
    function focusPanel() {
      window.setTimeout(function () {
        var target = panel.querySelector('#chatAnimalSearch');
        if (!target) {
          target = $$('input:not([type="hidden"]), select, textarea, button', panel).filter(function (el) { return el.offsetParent !== null; })[0];
        }
        if (target) try { target.focus(); } catch (e) {}
      }, 30);
    }
    function open() { panel.classList.add('is-open'); panel.setAttribute('aria-hidden','false'); toggle.setAttribute('aria-expanded','true'); focusPanel(); }
    function closeChat() { panel.classList.remove('is-open'); panel.setAttribute('aria-hidden','true'); toggle.setAttribute('aria-expanded','false'); try { toggle.focus(); } catch (e) {} }

    var blogCache = null;
    function loadPosts(cb) {
      if (blogCache) { cb(blogCache); return; }
      if (typeof PublicacionesAPI === 'undefined') { cb([]); return; }
      PublicacionesAPI.load().then(function () {
        blogCache = PublicacionesAPI.getAllPosts();
        cb(blogCache);
      }).catch(function () { cb([]); });
    }
    function normalize(s) { return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
    function imgPath(p){ if(!p) return ''; var s=String(p); if(s.indexOf('http://')===0 || s.indexOf('https://')===0 || s.indexOf('../')===0 || s.charAt(0)==='/') return s; return raizRelativa()+s; }

    function _composer() { return body.querySelector('.chat-composer'); }
    function _insertBeforeComposer(node) { var c = _composer(); if (c) body.insertBefore(node, c); else body.appendChild(node); }
    function appendMsg(html, role) {
      var msg = document.createElement('div');
      msg.className = 'chat-msg' + (role === 'user' ? ' user' : '');
      msg.innerHTML = html;
      _insertBeforeComposer(msg);
      try { body.scrollTop = body.scrollHeight; } catch (e) {}
      return msg;
    }
    function showTyping() {
      var t = document.createElement('div');
      t.className = 'chat-msg chat-typing';
      t.innerHTML = '<span class="chat-dots" aria-label="Escribiendo"><span></span><span></span><span></span></span>';
      _insertBeforeComposer(t);
      try { body.scrollTop = body.scrollHeight; } catch (e) {}
      return t;
    }
    function scrollToBottom() { try { body.scrollTop = body.scrollHeight; } catch (e) {} }

    function homeView() {
      lastSearch = { query: '', filter: '' };
      setStatus('Listo para ayudarte');
      body.innerHTML = '';
      var welcome = document.createElement('div');
      welcome.className = 'chat-msg';
      welcome.innerHTML = '<strong>Hola, soy Nebi 👋</strong><br>Busco fichas de animales, grupos y casos, eventos e historias, y te abro el formulario que necesites.';
      body.appendChild(welcome);
      var hint = document.createElement('p');
      hint.className = 'chat-hint';
      hint.textContent = 'Prueba con "Trufa", "perro senior", "evento", "acogida" o "voluntariado".';
      body.appendChild(hint);
      var quicks = document.createElement('div');
      quicks.className = 'chat-quick';
      quicks.innerHTML =
        '<button type="button" data-quick="adoptar">Adoptar</button>'+
        '<button type="button" data-quick="acoger">Acoger</button>'+
        '<button type="button" data-quick="voluntariado">Voluntariado</button>'+
        '<button type="button" data-quick="donar">Donar</button>'+
        '<button type="button" data-quick="socio">Socio/a</button>'+
        '<button type="button" data-quick="eventos">Eventos</button>'+
        '<button type="button" data-quick="historias">Historias</button>';
      body.appendChild(quicks);
      var composer = document.createElement('div');
      composer.className = 'chat-composer';
      composer.innerHTML = '<div class="chat-search"><input id="chatAnimalSearch" type="text" placeholder="Busca un animal, evento o historia..." aria-label="Buscar publicaciones o escribir consulta" autocomplete="off"><button type="button" id="chatSearchBtn">Enviar</button></div>';
      body.appendChild(composer);
      wireHome();
      scrollToBottom();
      if (panel.classList.contains('is-open')) focusPanel();
    }
    function escHtml(v) {
      return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Para valores dentro de atributos HTML (comillas simples y dobles).
    function escAttr(v) { return escHtml(v).replace(/'/g, '&#39;'); }

    function chatForm(type) {
      if (type === 'adopcion-animal') formAdopt();
      else if (type === 'acogida') formAcoge();
      else if (type === 'voluntariado') formVol();
      else if (type === 'donaciones') formDonar();
      else if (type === 'socio') formSocio();
      else formContact();
    }

    function routeIntent(q) {
      var raw = (q || '').trim();
      var t = normalize(raw);
      if (raw) appendMsg(escHtml(raw), 'user');
      if (!t) {
        var emptyInput = $('#chatAnimalSearch');
        if (emptyInput) try { emptyInput.focus(); } catch (e) {}
        chatOut('<div class="chat-msg chat-empty">Escribe un nombre, una especie o un tipo de publicación; por ejemplo “Trufa”, “gato”, “evento” o “acogida”.</div>');
        return;
      }
      appendMsg(escHtml(raw), 'user');

      var wantsForm = /\b(formulario|solicitud|rellenar|inscrib|apuntarme|apuntar)\b/.test(t);
      var wantsTo = /(quiero|me gustaria|me interesa|necesito)\s+(adoptar|acoger|ser voluntari|ser socio|ser socia|colaborar|donar|hacerme socio)/.test(t);

      if (/adop/.test(t) && (wantsForm || wantsTo)) { formAdopt(raw); return; }
      if (/acog/.test(t) && (wantsForm || wantsTo)) { formAcoge(raw); return; }
      if (/(volunt|colabor)/.test(t) && (wantsForm || wantsTo)) { formVol(raw); return; }
      if (/\b(socio|socia|socios|socias)\b/.test(t) && (wantsForm || wantsTo)) { formSocio(raw); return; }
      if (/\b(donar|donacion|donaciones|donativo|donativos|teaming|bizum|material|cuota)\b/.test(t) && (wantsForm || wantsTo)) { formDonar(raw); return; }

      // Palabra suelta de intención: atajo directo al formulario.
      if (t.split(/\s+/).filter(Boolean).length === 1) {
        if (/^(adoptar|adopcion|adopciones)$/.test(t)) { formAdopt(raw); return; }
        if (/^(acoger|acogida|acogidas)$/.test(t)) { formAcoge(raw); return; }
        if (/^(voluntariado|voluntario|voluntaria)$/.test(t)) { formVol(raw); return; }
        if (/^(donar|donacion|donaciones|teaming|bizum|material|cuota)$/.test(t)) { formDonar(); return; }
        if (/^(socio|socia|socios|socias)$/.test(t)) { formSocio(); return; }
        if (/^(contacto|contactar|escribir|consulta)$/.test(t)) { formContact(); return; }
      }

      doSearch(raw, '');
    }

    function chatOut(html) {
      var msg = document.createElement('div');
      msg.className = 'chat-msg';
      msg.innerHTML = html;
      _insertBeforeComposer(msg);
      try { body.scrollTop = body.scrollHeight; } catch (e) {}
      return msg;
    }

    function wireSearchSuggestions() {
      $$('[data-chat-search]', body).forEach(function (b) {
        b.addEventListener('click', function () { doSearch(b.getAttribute('data-chat-search') || '', ''); });
      });
      $$('[data-chat-filter]', body).forEach(function (b) {
        b.addEventListener('click', function () { doSearch('', b.getAttribute('data-chat-filter') || ''); });
      });
      $$('[data-chat-form]', body).forEach(function (b) {
        b.addEventListener('click', function () { appendMsg(escHtml(b.textContent || ''), 'user'); chatForm(b.getAttribute('data-chat-form') || ''); });
      });
    }

    function resultUrl(post) {
      var c = normalize(post.category);
      var from = 'historias';
      if (post.type === 'evento' || (post.event && !post.animal)) from = 'eventos';
      else if (c.indexOf('gatos') !== -1) from = 'gatos';
      else if (c.indexOf('perros') !== -1) from = 'perros';
      else if (/adopcion|acogida|adoptados|caso externo|grupo/.test(c)) from = 'acogidas';
      return fichaUrl(post, from);
    }

    function filterChips(active) {
      var options = [['', 'Todos'], ['gatos', 'Gatos'], ['perros', 'Perros'], ['acogida', 'Acogida'], ['eventos', 'Eventos'], ['historias', 'Historias']];
      return '<div class="chat-quick chat-filters">' + options.map(function (o) {
        var on = (active || '') === o[0];
        return '<button type="button" data-chat-refilter="' + o[0] + '" class="' + (on ? 'is-active' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }

    function wireFilterChips() {
      $$('[data-chat-refilter]', body).forEach(function (b) {
        b.addEventListener('click', function () {
          doSearch(lastSearch.query, b.getAttribute('data-chat-refilter') || '');
        });
      });
    }

    function renderSearchResults(items, q, filtro) {
      lastSearch.query = q || '';
      lastSearch.filter = filtro || '';
      var chips = filterChips(filtro);
      if (!items.length) {
        var sugerencia = '';
        var t = normalize(q || '');
        if (/acog/.test(t) || filtro === 'acogida') sugerencia = 'acogida';
        else if (/volunt|colabor/.test(t)) sugerencia = 'voluntariado';
        else if (/donar|donacion/.test(t)) sugerencia = 'donaciones';
        else if (/socio/.test(t)) sugerencia = 'socio';
        else if (/contact|consulta/.test(t)) sugerencia = 'contacto';
        else sugerencia = 'adopcion-animal';
        chatOut('<div class="chat-msg chat-empty">No he encontrado "' + escHtml(q || '') + '". Puedes probar con otro nombre, una especie o cambiar el filtro:' +
          '</div>' + chips +
          '<div class="chat-msg">Si buscabas ayuda con esto, puedo abrirte el formulario correspondiente:</div>' +
          '<div class="chat-opts">' +
            '<button class="chat-opt" type="button" data-chat-form="' + sugerencia + '">Abrir formulario</button>' +
            '<button class="chat-opt" type="button" data-chat-form="contacto-general">Contacto</button>' +
          '</div>');
        wireFilterChips();
        wireSearchSuggestions();
        setStatus('Listo para ayudarte');
        scrollToBottom();
        return;
      }
      var rows = items.map(function (item) {
        var p = item.post || {};
        var img = imgPath(p.image);
        var meta = [item.etiqueta, p.category, p.dateFormatted].filter(Boolean).join(' · ');
        return '<div class="chat-result">' +
          (img ? ('<img src="' + escHtml(img) + '" alt="" loading="lazy" onerror="this.hidden=true">') : '<div></div>') +
          '<div><h4>' + escHtml(p.title) + '</h4><p>' + escHtml(meta) + '</p><a href="' + escHtml(resultUrl(p)) + '">Ver ficha →</a></div>' +
        '</div>';
      }).join('');
      var count = items.length === 1 ? 'Mostrando 1 coincidencia' : 'Mostrando ' + items.length + ' coincidencias';
      chatOut('<div class="chat-msg">' + count + (q ? ' para “' + escHtml(q) + '”' : '') + ':</div>' + chips + '<div class="chat-results">' + rows + '</div>');
      wireFilterChips();
      setStatus('Listo para ayudarte');
      scrollToBottom();
    }

    function doSearch(q, filtro) {
      lastSearch = { query: q || '', filter: filtro || '' };
      setStatus('Buscando…');
      var typing = showTyping();
      if (typing && typing.parentNode) typing.remove();
      loadPosts(function (posts) {
        if (!posts || !posts.length) {
          chatOut('<div class="chat-msg chat-empty">No he podido cargar las publicaciones ahora mismo. Puedes reintentar o abrir un formulario: ' +
            '<button class="chat-back" type="button" data-chat-retry>Reintentar</button> ' +
            '<button class="chat-back" type="button" data-chat-form="adopcion-animal">adopción</button> ' +
            '<button class="chat-back" type="button" data-chat-form="acogida">acogida</button> ' +
            '<button class="chat-back" type="button" data-chat-form="voluntariado">voluntariado</button>.</div>');
          $$('[data-chat-retry]', body).forEach(function (b) {
            b.addEventListener('click', function () { doSearch(lastSearch.query, lastSearch.filter); });
          });
          wireSearchSuggestions();
          setStatus('Sin conexión');
          return;
        }
        var items = [];
        if (window.NebakBusqueda && typeof window.NebakBusqueda.buscar === 'function') {
          items = window.NebakBusqueda.buscar(posts, q, filtro);
        } else {
          // Respaldo mínimo si no se cargó js/busqueda-publicaciones.js.
          var nq = normalize(q);
          items = posts.filter(function (p) {
            return !nq || (normalize(p.title) + ' ' + normalize(p.excerpt) + ' ' + normalize(p.category)).indexOf(nq) !== -1;
          }).slice(0, 8).map(function (p) { return { post: p, etiqueta: p.category || '' }; });
        }
        renderSearchResults(items, q, filtro);
      });
    }

    function wireHome() {
      var btn = $('#chatSearchBtn'); var inp = $('#chatAnimalSearch');
      if (btn) btn.addEventListener('click', function(){ routeIntent(inp ? inp.value : ''); });
      if (inp) inp.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); routeIntent(inp.value || ''); }});
      $$('[data-quick]', body).forEach(function (b) {
        b.addEventListener('click', function(){ routeIntent(b.getAttribute('data-quick') || ''); });
      });
      $$('[data-view]', body).forEach(function (b) {
        b.addEventListener('click', function () {
          appendMsg(escHtml(b.textContent || ''), 'user');
          var v = b.getAttribute('data-view');
          if (v === 'form-adopt') formAdopt();
          else if (v === 'form-acoge') formAcoge();
          else if (v === 'form-vol') formVol();
          else if (v === 'form-donar') formDonar();
          else if (v === 'form-socio') formSocio();
          else if (v === 'form-contact') formContact();
        });
      });
    }

    function backBtn() { return '<button class="chat-back" type="button" data-back>← Volver</button>'; }
    function successMsg(text) { return '<div class="chat-msg" role="status">'+text+'</div>'; }

    function renderForm(title, intro, fieldsHtml, successText, meta) {
      meta = meta || {};
      setStatus('Formulario abierto');
      var introMsg = document.createElement('div');
      introMsg.className = 'chat-msg';
      introMsg.innerHTML = '<strong>'+escHtml(title)+'</strong><br>'+intro;
      _insertBeforeComposer(introMsg);
      var formWrap = document.createElement('div');
      formWrap.innerHTML = '<form class="chat-form-inline" data-chat-inline-form>' +
        '<input type="hidden" name="form_type" value="'+escAttr(meta.form_type||'chat')+'">' +
        '<input type="hidden" name="concepto" value="'+escAttr(meta.concepto||title)+'">' +
        '<input type="hidden" name="origen_pagina" value="'+escAttr(document.title||'main')+'">' +
        fieldsHtml +
        '<div class="chat-actions-row"><button class="chat-btn" type="submit">Enviar</button><button class="chat-btn chat-btn-ghost" type="button" data-back>Cancelar</button></div>' +
        '<p class="form-note">Formulario de contacto: incluimos el tipo de consulta para clasificar tu mensaje.</p></form>';
      var formEl = formWrap.querySelector('form');
      _insertBeforeComposer(formWrap);
      scrollToBottom();
      $$('[data-back]', body).forEach(function (b){ b.addEventListener('click', homeView); });
      var f = $('[data-chat-inline-form]', body);
      if (f && window.NebakFormsTransport && typeof window.NebakFormsTransport.installHoneypots === 'function') {
        window.NebakFormsTransport.installHoneypots(f);
      }
      if (f) {
        var firstField = f.querySelector('input:not([type="hidden"]):not([data-nebak-hp]), select, textarea');
        if (firstField) try { firstField.focus(); } catch (e) {}
      }
      if (f) f.addEventListener('input', function () {
        var notice = $('.chat-form-error', body);
        if (notice) notice.remove();
      });
      if (f) f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!f.checkValidity()) { f.reportValidity(); return; }
        var payload = {};
        try { new FormData(f).forEach(function(v,k){ payload[k]=v; }); } catch(_){}
        window.__nebakLastFormPayload = payload;
        var btn = f.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
        f.setAttribute('aria-busy', 'true');
        submitFormPayload(payload).then(function () {
          appendMsg(successText, ''); var backWrap = document.createElement('div'); backWrap.className = 'chat-actions-row'; backWrap.style.marginTop = '.5rem'; backWrap.innerHTML = '<button class="chat-btn" type="button" data-back>Volver al inicio</button>'; _insertBeforeComposer(backWrap); backWrap.querySelectorAll('[data-back]').forEach(function(b){ b.addEventListener('click', homeView); });
          $$('[data-back]', body).forEach(function (b){ b.addEventListener('click', homeView); });
          setStatus('Mensaje enviado');
          scrollToBottom();
          var statusMsg = $('.chat-msg[role="status"]', body);
          if (statusMsg) { statusMsg.tabIndex = -1; try { statusMsg.focus(); } catch (e) {} }
        }, function (err) {
          if (btn) { btn.disabled = false; btn.textContent = 'Enviar'; }
          f.removeAttribute('aria-busy');
          var notice = $('.chat-form-error', body);
          if (!notice) {
            notice = document.createElement('p');
            notice.className = 'chat-msg chat-empty chat-form-error';
            notice.tabIndex = -1;
            f.appendChild(notice);
          }
          showFormStatus(notice, formErrorMessage(err), true);
          try { notice.focus(); } catch (e) {}
        });
      });
    }

    function formAdopt(prefill) {
      var animal = (prefill && !/(adopt|form|solicitud|rellen)/i.test(prefill)) ? prefill : '';
      renderForm('Adopción', 'Cuéntanos tu interés y te contactamos. Puedes revisar el <a href="'+raizRelativa()+'protocolo/">protocolo de adopción</a> antes de enviar.',
        '<label>Nombre *<input type="text" name="nombre" required maxlength="100" autocomplete="name"></label>'+
        '<label>Email *<input type="email" name="email" required maxlength="250" autocomplete="email"></label>'+
        '<label>Teléfono<input type="tel" name="telefono" maxlength="50" autocomplete="tel"></label>'+
        '<label>¿Qué animal te interesa?<input type="text" name="animal" maxlength="120" placeholder="Nombre o tipo (gato/perro)" value="'+escAttr(animal)+'"></label>'+
        '<label>Mensaje *<textarea name="mensaje" required maxlength="4000" placeholder="Háblanos de tu hogar, experiencia y disponibilidad..."></textarea></label>',
        '¡Gracias! Hemos recibido tu solicitud de adopción. Te responderemos lo antes posible.',
        { form_type:'adopcion-animal', concepto: animal ? ('Consulta de adopción: '+animal) : 'Solicitud de adopción' });
    }
    function formAcoge() {
      renderForm('Acogida temporal', 'Ofrece un hogar temporal mientras el animal encuentra familia. Los gastos veterinarios se acuerdan con la protectora.',
        '<label>Nombre *<input type="text" name="nombre" required maxlength="100" autocomplete="name"></label>'+
        '<label>Email *<input type="email" name="email" required maxlength="250" autocomplete="email"></label>'+
        '<label>Teléfono<input type="tel" name="telefono" maxlength="50" autocomplete="tel"></label>'+
        '<label>Tipo de acogida<input type="text" name="tipo_acogida" maxlength="120" placeholder="Gato, perro, urgencia, cuidados..."></label>'+
        '<label>Tiempo disponible<input type="text" name="duracion" maxlength="120" placeholder="¿Durante cuánto tiempo podrías acoger?"></label>'+
        '<label>Convivencia<input type="text" name="convivencia" maxlength="200" placeholder="Otros animales, niños, vivienda..."></label>'+
        '<label>Mensaje *<textarea name="mensaje" required maxlength="4000" placeholder="¿Tienes otros animales o niños? ¿Qué tipo de acogida puedes ofrecer?"></textarea></label>',
        '¡Gracias! Hemos recibido tu interés en acoger. Te contactaremos pronto.',
        { form_type:'acogida', concepto:'Solicitud de acogida' });
    }
    function formVol() {
      renderForm('Voluntariado', 'Puedes ayudar en colonias, rescates, traslados al veterinario o construcción de casetas, según tu disponibilidad.',
        '<label>Nombre *<input type="text" name="nombre" required maxlength="100" autocomplete="name"></label>'+
        '<label>Email *<input type="email" name="email" required maxlength="250" autocomplete="email"></label>'+
        '<label>Teléfono<input type="tel" name="telefono" maxlength="50" autocomplete="tel"></label>'+
        '<label>Tipo de voluntariado *<select name="tipo_voluntariado" required><option value="">Selecciona una opción</option><option>Colonias felinas / CES</option><option>Rescates y emergencias</option><option>Traslados al veterinario</option><option>Construcción/mantenimiento de casetas</option><option>Difusión y eventos</option><option>Casas de acogida (apoyo)</option><option>Otro</option></select></label>'+
        '<label>Disponibilidad<input type="text" name="disponibilidad" maxlength="120" placeholder="Días, horarios, puntual o regular"></label>'+
        '<label>Zona / localidad<input type="text" name="zona" maxlength="120" placeholder="Irún, Hondarribia, Donostia..."></label>'+
        '<label>¿Cómo te gustaría ayudar? *<textarea name="mensaje" required maxlength="4000" placeholder="Cuéntanos tu disponibilidad, zona y cómo te gustaría colaborar..."></textarea></label>',
        '¡Gracias por tu interés en ser voluntario/a! Te responderemos pronto.',
        { form_type:'voluntariado', concepto:'Voluntariado' });
    }
    function formContact(subject) {
      renderForm('Contacto', 'Escríbenos y te responderemos lo antes posible.',
        '<label>Nombre *<input type="text" name="nombre" required maxlength="100" autocomplete="name"></label>'+
        '<label>Email *<input type="email" name="email" required maxlength="250" autocomplete="email"></label>'+
        '<label>Teléfono<input type="tel" name="telefono" maxlength="50" autocomplete="tel"></label>'+
        '<label>Asunto<input type="text" name="asunto" maxlength="250" value="'+escAttr(subject)+'"></label>'+
        '<label>Mensaje *<textarea name="mensaje" required maxlength="4000" placeholder="Tu mensaje..."></textarea></label>',
        '¡Gracias por tu mensaje! Te responderemos lo antes posible.',
        { form_type:'contacto-general', concepto: subject || 'Contacto general' });
    }
    function formDonar() {
      renderForm('Donaciones', 'Cuéntanos qué tipo de colaboración te interesa y te enviamos la información.',
        '<label>Nombre *<input type="text" name="nombre" required maxlength="100" autocomplete="name"></label>'+
        '<label>Email *<input type="email" name="email" required maxlength="250" autocomplete="email"></label>'+
        '<label>Tipo de consulta *<select name="tipo_donacion" required><option value="">Selecciona una opción</option><option>Donación puntual / transferencia</option><option>Teaming (1 €/mes)</option><option>Hacerme socio/a o cuota</option><option>Donación de material</option><option>Dudas generales sobre donaciones</option><option>Otra colaboración</option></select></label>'+
        '<label>Mensaje *<textarea name="mensaje" required maxlength="4000" placeholder="Cuéntanos qué necesitas saber..."></textarea></label>',
        '¡Gracias por tu interés en donar! Te responderemos con la información solicitada.',
        { form_type:'donaciones', concepto:'Consulta sobre donaciones' });
    }
    function formSocio() {
      renderForm('Hacerme socio/a', 'Déjanos tus datos y te explicamos las modalidades de socio/a.',
        '<label>Nombre *<input type="text" name="nombre" required maxlength="100" autocomplete="name"></label>'+
        '<label>Email *<input type="email" name="email" required maxlength="250" autocomplete="email"></label>'+
        '<label>Modalidad *<select name="modalidad_socio" required><option value="">Selecciona una opción</option><option>5 €/mes</option><option>60 €/año</option><option>Quiero información</option></select></label>'+
        '<label>Mensaje *<textarea name="mensaje" required maxlength="4000" placeholder="Cuéntanos qué modalidad te interesa..."></textarea></label>',
        '¡Gracias por tu interés en hacerte socio/a! Te contactaremos pronto.',
        { form_type:'socio', concepto:'Solicitud de socio/a' });
    }

    toggle.addEventListener('click', function () {
      if (panel.classList.contains('is-open')) closeChat();
      else { if (!body.firstChild) homeView(); open(); }
    });
    if (close) close.addEventListener('click', closeChat);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('is-open')) closeChat(); });
    // Mantener el foco dentro del diálogo mientras está abierto.
    panel.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || !panel.classList.contains('is-open')) return;
      var focusables = $$('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])', panel).filter(function (el) {
        return el.offsetParent !== null;
      });
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (!panel.classList.contains('is-open')) return;
      if (!e.target || e.target.isConnected === false) return;
      if (panel.contains(e.target) || toggle.contains(e.target)) return;
      // No cerrar con un clic fuera si hay un formulario abierto: se perderían los datos.
      if (panel.querySelector('[data-chat-inline-form]')) return;
      closeChat();
    });
  })();
})();
