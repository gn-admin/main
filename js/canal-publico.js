/*
 * Cliente del canal público (admin-dashboard → Web App de Apps Script).
 *
 * Mismo contrato que TRANSFERIR_A_MAIN.md §A.2.4: `fetch` con respaldo JSONP,
 * envelope intacto (success/warning/error/gone) y helpers por página.
 * No depende de librerías y debe cargarse antes que `publicaciones-api.js`.
 */
var CanalPublico = (function () {
  'use strict';

  function crearCanal(opciones) {
    var opts = opciones || {};
    var base = String(opts.baseUrl || '').replace(/\/+$/, '');
    var dominio = String(opts.dominio || '').replace(/\/+$/, '');
    var timeoutMs = Number(opts.timeoutMs) || 15000;

    function canonica(ruta) {
      return dominio ? dominio + ruta : ruta;
    }

    function url(endpoint, params) {
      var u = new URL(base);
      u.searchParams.set('endpoint', endpoint);
      var extra = params || {};
      for (var key in extra) {
        if (!Object.prototype.hasOwnProperty.call(extra, key)) continue;
        var value = extra[key];
        if (value === undefined || value === null || value === '') continue;
        u.searchParams.set(key, value);
      }
      return u;
    }

    // Respaldo para navegadores que bloquean scripts de terceros.
    function jsonp(endpoint, params) {
      return new Promise(function (resolve, reject) {
        if (typeof document === 'undefined') {
          reject(new Error('JSONP no disponible sin DOM'));
          return;
        }
        var nombre = 'gnCanal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        var script = document.createElement('script');
        var cerrado = false;
        var timer = setTimeout(function () { cerrar(reject, new Error('JSONP sin respuesta')); }, timeoutMs);

        function cerrar(fn, valor) {
          if (cerrado) return;
          cerrado = true;
          clearTimeout(timer);
          try { delete window[nombre]; } catch (e) { window[nombre] = undefined; }
          if (script.parentNode) script.parentNode.removeChild(script);
          fn(valor);
        }

        window[nombre] = function (data) { cerrar(resolve, data); };
        script.onerror = function () { cerrar(reject, new Error('JSONP no cargó')); };
        script.async = true;
        var extra = {};
        for (var k in (params || {})) {
          if (Object.prototype.hasOwnProperty.call(params, k)) extra[k] = params[k];
        }
        extra.callback = nombre;
        script.src = url(endpoint, extra).toString();
        document.head.appendChild(script);
      });
    }

    // Devuelve el sobre tal cual (el HTTP es 200 también en error/gone).
    function pedir(endpoint, params, config) {
      var respaldo = !config || config.respaldo !== false;
      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
      return fetch(url(endpoint, params).toString(), {
        credentials: 'omit',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      }).then(function (texto) {
        if (timer) clearTimeout(timer);
        var data = JSON.parse(texto);
        if (!data || !data.status) throw new Error('Canal sin envoltorio');
        return data;
      }).catch(function (err) {
        if (timer) clearTimeout(timer);
        if (!respaldo) throw err;
        return jsonp(endpoint, params);
      });
    }

    return {
      url: url,
      pedir: pedir,
      jsonp: jsonp,
      canonica: canonica,
      listado: function (params) { return pedir('publicaciones', params || {}); },
      seccion: function (tipo, params) {
        var extra = {};
        for (var k in (params || {})) {
          if (Object.prototype.hasOwnProperty.call(params, k)) extra[k] = params[k];
        }
        extra.type = tipo;
        return pedir('publicaciones', extra);
      },
      ficha: function (slug) { return pedir('publicacion', { slug: slug }); },
      taxonomias: function (tipo) { return pedir('taxonomias', tipo ? { type: tipo } : {}); },
      config: function () { return pedir('config-publica', {}); },
      retiradas: function () { return pedir('retiradas', {}, { respaldo: false }); },
      redirects: function () { return pedir('redirects', {}, { respaldo: false }); },
      sitemap: function () { return pedir('sitemap', {}, { respaldo: false }); }
    };
  }

  return { crearCanal: crearCanal };
})();
