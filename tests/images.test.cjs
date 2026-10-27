const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, loadAppWithFixtures } = require("./helpers.cjs");

// Nutzerentscheidung 27.10.2026: Alle im DZT Knowledge Graph hinterlegten Bilder werden
// verwendet, ohne Filter nach Lizenz oder Urheberangabe. Vorhandene Angaben werden gezeigt.
const REGION = { ort: "Berlin", lat: 52.52, lng: 13.405, radiusKm: 25 };
const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";

test("alle Bilder mit URL werden übernommen, auch ohne Lizenz, mit weiterer Lizenz oder ohne Urheber", () => {
  const api = loadAppWithFixtures();
  const rows = api.makeGastroRows({
    licenseUrl: CC0,
    images: [
      { id: "a", url: "https://example.org/a.jpg" },
      { id: "b", url: "https://example.org/b.jpg", licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/" },
      { id: "c", url: "https://example.org/c.jpg", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" },
      { id: "d", url: "https://example.org/d.jpg", credit: "Fotografin Beispiel", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" },
    ],
  });
  const images = api.normalizeDztRows(rows, REGION, "detail").pois[0].images;
  assert.deepEqual(Array.from(images, (image) => image.url), ["a", "b", "c", "d"].map((id) => `https://example.org/${id}.jpg`));
  assert.equal(images[0].licenseUrl, "", "keine Bildlizenz aus der Datensatzlizenz ableiten");
  assert.equal(images[1].licenseUrl, "https://creativecommons.org/licenses/by-nc-sa/4.0/");
  assert.equal(images[3].credit, "Fotografin Beispiel");
  assert.ok(images.every((image) => api.gastroImageIsUsable(image)));
});

test("in der Übersicht erscheint auch ein Bild ohne Lizenz", () => {
  const api = loadAppWithFixtures();
  const rows = api.makeGastroRows({ licenseUrl: CC0, images: [{ id: "x", url: "https://example.org/x.jpg" }] });
  const poi = api.normalizeDztRows(rows, REGION, "overview").pois[0];
  assert.equal(poi.images.length, 1);
  assert.match(api.renderGastroCard(poi, "gf-test"), /<img class="gf-card-thumb-img" src="https:\/\/example\.org\/x\.jpg"/);
  assert.match(api.renderGastroCatalogCard(poi, "gf-test"), /<img src="https:\/\/example\.org\/x\.jpg" class="gf-catalog-img"/);
});

test("die Übersicht wählt das erste Bild mit Bild-URL", () => {
  const api = loadApp();
  const query = api.buildOverviewQuery(REGION);
  const selections = query.match(/NOT EXISTS \{ \?id schema:image \?other[^}]*\}/g) || [];
  assert.equal(selections.length, 2, query);
  for (const selection of selections) assert.match(selection, /\?other schema:contentUrl/);
});

test("Bildnachweis zeigt vorhandene Angaben, auch für weitere CC-Lizenzen, und nichts Erfundenes", () => {
  const api = loadApp();
  const ncsa = api.renderGastroImageAttribution({ url: "https://example.org/a.jpg", licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/" });
  assert.match(ncsa, /href="https:\/\/creativecommons\.org\/licenses\/by-nc-sa\/4\.0\/"[^>]*>Lizenz CC BY-NC-SA 4\.0/);
  assert.match(ncsa, /Urheber nicht angegeben/);
  const nd = api.renderGastroImageAttribution({ url: "https://example.org/a.jpg", licenseUrl: "https://creativecommons.org/licenses/by-nd/4.0/deed.de", credit: "Studio" });
  assert.match(nd, /Studio/);
  assert.match(nd, /Lizenz CC BY-ND 4\.0/);
  const other = api.renderGastroImageAttribution({ url: "https://example.org/a.jpg", licenseUrl: "https://example.org/eigene-lizenz" });
  assert.match(other, />Lizenz</);
  assert.equal(api.renderGastroImageAttribution({ url: "https://example.org/a.jpg" }), "");
});

test("Galerie zeigt keinen leeren Lizenzlink, wenn die Quelle keine Lizenz nennt", () => {
  const api = loadApp();
  const html = api.galleryImageMarkup({ url: "https://example.org/a.jpg", title: "Bild" });
  assert.doesNotMatch(html, /href=""/);
  assert.doesNotMatch(html, />Lizenz/);
});

test("ohne Foto erscheinen eigene Illustrationen für Restaurant und Café statt Symbolzeichen", () => {
  const api = loadApp();
  const restaurant = { id: "https://example.org/r", name: "Demo-Restaurant", types: ["https://schema.org/Restaurant"], images: [] };
  const cafe = { id: "https://example.org/c", name: "Demo-Café", types: ["https://schema.org/CafeOrCoffeeShop"], images: [] };
  for (const render of [api.renderGastroCard, api.renderGastroCatalogCard]) {
    const r = render(restaurant, "gf-test");
    const c = render(cafe, "gf-test");
    assert.match(r, /<svg class="gf-placeholder-art gf-placeholder-restaurant"/);
    assert.match(c, /<svg class="gf-placeholder-art gf-placeholder-cafe"/);
    assert.doesNotMatch(r + c, /🍴|☕/);
    assert.match(r, /aria-hidden="true"/);
  }
  assert.match(api.renderGastroCatalogCard(cafe, "gf-test"), /Kein Foto vorhanden/);
});
