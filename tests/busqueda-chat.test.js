'use strict';

const test = require('node:test');
const assert = require('node:assert');

const busqueda = require('../js/busqueda-publicaciones.js');

function ficha(extra) {
  return Object.assign({
    slug: 'ficha',
    title: 'Ficha',
    excerpt: '',
    category: 'Gatos en adopción',
    type: 'animal',
    status: 'en_adopcion',
    tags: [],
    animal: { species: 'gato', names: ['Ficha'] }
  }, extra);
}

const FIXTURE = [
  ficha({ slug: 'gata-trufa', title: 'Trufa, gata de 1 año', animal: { species: 'gato', names: ['Trufa'] }, tags: ['tranquila'] }),
  ficha({ slug: 'perro-nube', title: 'Nube, mestizo de 2 años', category: 'Perros en adopción', animal: { species: 'perro', names: ['Nube'] } }),
  ficha({ slug: 'perro-bo', title: 'Bo', category: 'Perros en adopción', status: 'reservado', animal: { species: 'perro', names: ['Bo'], compatibility: 'sin gatos' } }),
  ficha({ slug: 'grupo-camada', title: 'Camada otoño', type: 'animal_grupo', status: 'en_acogida', category: 'Perros en adopción', group: { species: 'perro', groupName: 'Camada Otoño' } }),
  { slug: 'evento-jornada', title: 'Jornada de puertas abiertas', category: 'Eventos', type: 'evento', status: 'programado', event: { startDate: '2026-12-01', location: { city: 'Irún' } } },
  { slug: 'historia-anual', title: 'Un año de adopciones', category: 'Historias', type: 'historia', contentHtml: '<p>Resumen del año</p>' },
  ficha({ slug: 'gata-retirada', status: 'gone' }),
  ficha({ slug: 'perro-redirect', category: 'Perros en adopción', animal: { species: 'perro', names: ['Otro'] }, redirect: { slug: 'perro-nube' } })
];

function slugs(resultados) {
  return resultados.map((r) => r.post.slug);
}

function especies(resultados) {
  return resultados
    .map((r) => (r.post.animal && r.post.animal.species) || (r.post.group && r.post.group.species) || '')
    .filter(Boolean);
}

test('encuentra por nombre y no depende de mayúsculas ni acentos', () => {
  assert.equal(busqueda.buscar(FIXTURE, 'trufa')[0].post.slug, 'gata-trufa');
  assert.deepEqual(slugs(busqueda.buscar(FIXTURE, 'GATA')), slugs(busqueda.buscar(FIXTURE, 'gata')));
  assert.ok(slugs(busqueda.buscar(FIXTURE, 'otono')).includes('grupo-camada'));
});

test('no mezcla especies aunque el texto mencione al otro animal', () => {
  ['gato', 'gata', 'gatito'].forEach((consulta) => {
    const encontrados = busqueda.buscar(FIXTURE, consulta);
    assert.ok(encontrados.length > 0, 'sin resultados para ' + consulta);
    assert.ok(!especies(encontrados).includes('perro'), consulta + ' devolvió un perro');
  });
  const perros = busqueda.buscar(FIXTURE, 'perro');
  assert.ok(!especies(perros).includes('gato'), 'perro devolvió un gato');
  assert.ok(!slugs(perros).includes('gata-trufa'));
});

test('entiende sinónimos, grupos y eventos', () => {
  assert.ok(slugs(busqueda.buscar(FIXTURE, 'gatito')).includes('gata-trufa'));
  const camada = busqueda.buscar(FIXTURE, 'camada');
  assert.ok(slugs(camada).includes('grupo-camada'));
  assert.equal(camada[0].etiqueta, 'En acogida');
  const jornada = busqueda.buscar(FIXTURE, 'jornada');
  assert.ok(slugs(jornada).includes('evento-jornada'));
  assert.equal(jornada[0].tipo, 'evento');
  assert.equal(jornada[0].etiqueta, 'Evento');
});

test('la etiqueta de estado distingue reservado y adopción', () => {
  const bo = busqueda.buscar(FIXTURE, 'bo');
  assert.equal(bo[0].post.slug, 'perro-bo');
  assert.equal(bo[0].etiqueta, 'Reservado');
  assert.equal(busqueda.buscar(FIXTURE, 'trufa')[0].etiqueta, 'En adopción');
});

test('los filtros limitan por tipo, especie y situación', () => {
  const gatos = busqueda.buscar(FIXTURE, '', 'gatos');
  assert.ok(gatos.length > 0);
  assert.ok(especies(gatos).every((especie) => especie === 'gato'));
  assert.ok(!slugs(gatos).includes('perro-nube'));

  const eventos = busqueda.buscar(FIXTURE, '', 'eventos');
  assert.ok(eventos.length > 0);
  assert.ok(eventos.every((r) => r.tipo === 'evento'));

  const acogida = busqueda.buscar(FIXTURE, '', 'acogida');
  assert.deepEqual(slugs(acogida), ['grupo-camada']);

  const adopcion = busqueda.buscar(FIXTURE, '', 'adopcion');
  assert.ok(slugs(adopcion).includes('gata-trufa'));
  assert.ok(!slugs(adopcion).includes('grupo-camada'), 'en acogida no es adopción');
  assert.ok(!slugs(adopcion).includes('perro-bo'), 'reservado no es adopción');

  const historias = busqueda.buscar(FIXTURE, '', 'historias');
  assert.deepEqual(slugs(historias), ['historia-anual']);
});

test('oculta fichas retiradas y redirigidas', () => {
  const todos = slugs(busqueda.buscar(FIXTURE, '', 'animales'));
  assert.ok(!todos.includes('gata-retirada'));
  assert.ok(!todos.includes('perro-redirect'));
  assert.ok(!slugs(busqueda.buscar(FIXTURE, 'perro')).includes('perro-redirect'));
});

test('sin coincidencias devuelve vacío y sin consulta limita a 8', () => {
  assert.deepEqual(busqueda.buscar(FIXTURE, 'xyzzy'), []);

  const muchos = Array.from({ length: 12 }, (_, i) => ficha({
    slug: 'gato-' + i,
    title: 'Gato ' + i,
    animal: { species: 'gato', names: ['Gato ' + i] }
  }));
  assert.equal(busqueda.buscar(muchos, '').length, 8);
  assert.equal(busqueda.buscar(muchos, 'gato').length, 8);
});

test('una consulta sin palabras útiles no devuelve el catálogo', () => {
  assert.deepEqual(busqueda.buscar(FIXTURE, 'de la'), []);
  assert.deepEqual(busqueda.buscar(FIXTURE, 'quiero'), []);
  assert.deepEqual(busqueda.buscar(FIXTURE, 'a'), []);
  // Sin consulta sí se listan fichas (comportamiento del inicio del chat).
  assert.ok(busqueda.buscar(FIXTURE, '').length > 0);
});

test('el límite es configurable y el filtro se combina con la consulta', () => {
  const muchos = Array.from({ length: 12 }, (_, i) => ficha({
    slug: 'gato-' + i,
    title: 'Gato ' + i,
    animal: { species: 'gato', names: ['Gato ' + i] }
  }));
  assert.equal(busqueda.buscar(muchos, '', '', 3).length, 3);
  assert.equal(busqueda.buscar(muchos, 'gato', 'gatos', 5).length, 5);

  assert.deepEqual(slugs(busqueda.buscar(FIXTURE, 'trufa', 'gatos')), ['gata-trufa']);
  assert.deepEqual(busqueda.buscar(FIXTURE, 'trufa', 'perros'), []);
  assert.deepEqual(busqueda.buscar(FIXTURE, 'nube', 'gatos'), []);
});

test('datos reales: gatos y eventos del catálogo', () => {
  const canal = require('../data/publicaciones.json').posts;
  const gatos = busqueda.buscar(canal, 'gato');
  assert.ok(gatos.length > 0, 'no encontró gatos en el catálogo real');
  assert.ok(!especies(gatos).includes('perro'));

  const eventos = busqueda.buscar(canal, 'evento');
  assert.ok(eventos.length > 0, 'no encontró eventos en el catálogo real');
  assert.ok(eventos.every((r) => r.tipo === 'evento'));

  const sinResultados = busqueda.buscar(canal, 'xyzzy');
  assert.deepEqual(sinResultados, []);
});
