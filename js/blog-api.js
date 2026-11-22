/* Fachada de historias: delega en PublicacionesAPI (fuente configurable). */
var HistoriasAPI = (function () {
  'use strict';
  var FALLBACK_IMAGE = 'assets/images/logo.jpg';

  function api() {
    return (typeof PublicacionesAPI !== 'undefined') ? PublicacionesAPI : null;
  }

  function load() {
    var a = api();
    if (!a) return Promise.resolve({ site: {}, posts: [] });
    return a.load(['historias']).then(function () {
      return { site: a.getSiteConfig(), posts: a.getPostsFor('historias') };
    });
  }
  // El índice de historias lee la sección 'historias' (el resto editorial), no
  // el catálogo completo: así una sección en real no arrastra datos locales.
  function getAllPosts() { var a = api(); return a ? a.getPostsFor('historias') : []; }
  function getPostBySlug(slug) { var a = api(); return a ? a.getPostBySlug(slug) : null; }
  // Detalle asíncrono: usa 'publicacion&slug=' en modo real y cae al listado.
  function loadPost(slug) {
    var a = api();
    return a ? a.loadPost(slug) : Promise.resolve({ post: null, notFound: true });
  }
  function getSiteConfig() { var a = api(); return a ? a.getSiteConfig() : {}; }
  function fallbackImage(src) {
    if (!src || !String(src).trim()) return FALLBACK_IMAGE;
    return String(src);
  }
  return { load: load, getAllPosts: getAllPosts, getPostBySlug: getPostBySlug, loadPost: loadPost, getSiteConfig: getSiteConfig, fallbackImage: fallbackImage };
})();
