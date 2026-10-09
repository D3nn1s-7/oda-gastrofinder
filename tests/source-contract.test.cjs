const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppWithFixtures } = require('./helpers.cjs');
const region = { lat: 52.52, lng: 13.405, radiusKm: 25 };
const schema = 'https://schema.org/';
const id = 'https://example.org/gastro/contract';

function setup(options = {}) {
  const app = loadAppWithFixtures();
  const rows = app.makeGastroRows({ id, description: '', ...options });
  const add = (subject, predicate, value, type = 'literal', lang = '') => rows.push(
    app.fixtureRow(id, subject, schema + predicate, app.fixtureTerm(value, type, lang))
  );
  return { app, rows, add };
}

test('CreativeWork description resolves language-tagged text instead of exposing the node IRI', () => {
  const { app, rows, add } = setup();
  add(id, 'description', id + '/description', 'uri');
  add(id + '/description', 'text', 'English description', 'literal', 'en');
  add(id + '/description', 'text', 'Deutsche Beschreibung', 'literal', 'de-DE');
  assert.equal(app.normalizeDztRows(rows, region, 'detail').pois[0].description, 'Deutsche Beschreibung');
});

test('photo credit preserves copyright notice and resolved creator/holder names', () => {
  const imageId = id + '/image';
  const { app, rows, add } = setup({ images: [{ id: imageId, url: 'https://example.org/photo.jpg', title: 'Originaltitel', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' }] });
  add(imageId, 'copyrightNotice', 'Demo-Bildherausgeber');
  add(imageId, 'creator', id + '/creator', 'uri');
  add(imageId, 'copyrightHolder', id + '/holder', 'uri');
  add(id + '/creator', 'name', 'Demo-Fotografin');
  add(id + '/holder', 'name', 'Demo-Rechteinhaber');
  const image = app.normalizeDztRows(rows, region, 'detail').pois[0].images[0];
  assert(image);
  for (const name of ['Demo-Bildherausgeber', 'Demo-Fotografin', 'Demo-Rechteinhaber']) assert(image.credit.includes(name));
  assert(!image.credit.includes('https://example.org/'));
  assert.equal(image.title, 'Originaltitel');
});

test('a supplied copyright notice is evidence, but an unresolved creator IRI is not', () => {
  const imageId = id + '/image';
  const { app, rows, add } = setup({ images: [{ id: imageId, url: 'https://example.org/photo.jpg', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' }] });
  add(imageId, 'creator', id + '/unresolved', 'uri');
  assert.equal(app.normalizeDztRows(rows, region, 'detail').pois[0].images.length, 0);
  add(imageId, 'copyrightNotice', 'Demo-Bildherausgeber');
  assert.equal(app.normalizeDztRows(rows, region, 'detail').pois[0].images[0].credit, 'Demo-Bildherausgeber');
});

test('dataset attribution preserves sdLicense author/holder alongside publisher and notice', () => {
  const { app, rows, add } = setup({ licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', publisher: 'Demo-Datenherausgeber' });
  add(id + '/data-license', 'author', id + '/data-author', 'uri');
  add(id + '/data-license', 'copyrightHolder', id + '/data-holder', 'uri');
  add(id + '/data-author', 'name', 'Demo-Datenautor');
  add(id + '/data-holder', 'name', 'Demo-Datenrechteinhaber');
  add(id, 'copyrightNotice', 'Demo-Datenhinweis');
  const rights = app.normalizeDztRows(rows, region, 'detail').pois[0].dataLicense;
  for (const name of ['Demo-Datenherausgeber', 'Demo-Datenautor', 'Demo-Datenrechteinhaber', 'Demo-Datenhinweis']) assert(rights.attribution.includes(name));
  assert(!rights.attribution.includes('https://example.org/'));
});

test('detail query requests nested text and associates rights-party triples with their actual subject', () => {
  const { app } = setup();
  const query = app.buildDetailQuery(id);
  assert.match(query, /schema:text/);
  assert.match(query, /VALUES \?rightsLink \{ schema:image schema:sdLicense \}/);
  assert.match(query, /\?rightsNode \?rightsParty \?subject/);
  assert.doesNotMatch(query, /\?nestedSubject \?predicate \?object/);
});
