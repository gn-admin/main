/*
 * Fuente de datos de publicaciones (Fase 1: todo en datos locales "fake").
 *
 * Cambiar `mode` de una sección a 'real' la alimenta del canal público
 * (Web App de Apps Script) sin tocar los renderizadores. La configuración la
 * consume `js/publicaciones-api.js`; el plan completo está en
 * docs/plan-fuente-datos-fake-endpoint.md.
 *
 * Debe cargarse antes que `publicaciones-api.js` (y por tanto antes que
 * `blog-api.js` y `main.js`).
 */
(function () {
  'use strict';

  window.NEBAK_DATA_SOURCE = {
    version: 1,

    // 'fake' = data/blog-posts.json | 'real' = canal público.
    // Activado en las secciones que ya consume el canal (historias, gatos,
    // perros, home y detalle); acogidas/adoptados/casos siguen en fake
    // porque sus páginas aún son HTML fijo.
    defaultMode: 'fake',

    // Web App /exec del canal público (solo lectura, sin token).
    // Vacío => 'real' no es utilizable y se degrada a fake con aviso.
    endpointBase: 'https://script.google.com/macros/s/AKfycbw4_FLxXrizvhP-Xq7wkeLVafrWkd13boi13bNi1KKaZijoWvTmpQAnwjy3n9LgmCv3/exec',

    // Interruptor por sección: aquí se hace la migración progresiva.
    sections: {
      historias:      { mode: 'real' },
      gatos:          { mode: 'real' },
            perros:          { mode: 'real' },
      otros:           { mode: 'fake' },
      acogidas:       { mode: 'real' },
      adoptados:      { mode: 'real' },
      casosExternos:  { mode: 'real' },
      grupos:         { mode: 'real' },
      eventos:        { mode: 'real' },
      apadrinamiento: { mode: 'fake' }, // el canal aún no expone este dato
      home:           { mode: 'real' },
      detalle:        { mode: 'real' }
    },

    options: {
      pageSize: 24,           // el canal admite un máximo de 50
      timeoutMs: 15000,
      transport: 'auto',      // 'auto' = fetch y, si falla, JSONP | 'jsonp'
      fallbackOnError: true,  // si el canal falla, la sección sigue en fake
      showFakeBadge: false,
      debug: false            // trazas de qué fuente usa cada sección
    }
  };
})();
