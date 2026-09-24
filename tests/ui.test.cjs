const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, loadAppWithFixtures, validConfig } = require("./helpers.cjs");

const REGION = { ort: "Berlin", lat: 52.52, lng: 13.405, radiusKm: 25 };
const RESTAURANT = "https://schema.org/Restaurant";
const CAFE = "https://schema.org/CafeOrCoffeeShop";

function samplePoi(overrides = {}) {
  return {
    id: "https://example.org/x",
    name: "Synthetic Restaurant",
    types: [RESTAURANT],
    address: { street: "Teststraße 1", postalCode: "10115", locality: "Berlin" },
    lat: 52.52,
    lng: 13.405,
    distanceKm: 1.23,
    cuisines: ["deutsch"],
    images: [],
    dataLicense: { url: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: "" },
    description: "",
    openingHours: [],
    websites: [],
    telephones: [],
    ...overrides,
  };
}

test("fremde Namen sind kein ausführbares Kartenmarkup", () => {
  const api = loadApp();
  const card = api.renderGastroCard(samplePoi({
    name: '<img src=x onerror="window.__gastroXss=1">',
  }), "gf-test", false);
  assert.match(card, /&lt;img/);
  assert.doesNotMatch(card, /<img\b/);
  assert.match(card, /<button\b/);
  assert.match(card, /Restaurant/);
  assert.match(card, /data-gf-id="https:\/\/example\.org\/x"/);
  assert.doesNotMatch(card, /(?:^|\s)id="https:\/\/example\.org\/x"/);
});

test("Kartenkarten beschriften beide Typen und lassen nur nachgewiesene Bilder zu", () => {
  const api = loadApp();
  const poi = samplePoi({
    types: [RESTAURANT, CAFE],
    images: [{
      url: "https://example.org/photo.jpg",
      title: "Synthetic <photo>",
      credit: "Test credit",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    }],
  });
  const card = api.renderGastroCard(poi, "gf-test", true);
  assert.match(card, /Restaurant/);
  assert.match(card, /Café/);
  assert.match(card, /<img\b/);
  assert.match(card, /Synthetic &lt;photo&gt;/);
  assert.match(card, /aria-pressed="true"/);
  assert.match(card, /gf-test-card/);
});

test("die Shell hält Toolbar, Karte, Ergebnisfläche und Details getrennt", () => {
  const api = loadApp();
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  const root = { innerHTML: "" };
  api.renderGastroShell(root, state);
  assert.match(root.innerHTML, /class="gf-root/);
  assert.match(root.innerHTML, /data-gf="toolbar"/);
  assert.match(root.innerHTML, /data-gf="map"/);
  assert.match(root.innerHTML, /data-gf="results"/);
  assert.match(root.innerHTML, /data-gf="details"/);
  assert.match(root.innerHTML, /aria-live="polite"/);
  assert.match(root.innerHTML, /id="gf-[^"]+-search"/);
});

test("Detailstatus loading erfindet keine fehlenden Angaben", () => {
  const api = loadApp();
  const loading = api.renderGastroDetails(samplePoi({ name: "Café Atlas" }), "gf-test", "loading");
  assert.match(loading, /Details werden geladen/);
  assert.doesNotMatch(loading, /Küche nicht angegeben/);
  assert.doesNotMatch(loading, /Öffnungszeiten nicht angegeben/);

  const ready = api.renderGastroDetails(samplePoi({
    name: "Café Atlas",
    cuisines: [],
    openingHours: [],
  }), "gf-test", "ready");
  assert.match(ready, /Küche nicht angegeben/);
  assert.match(ready, /Öffnungszeiten nicht angegeben/);
  assert.match(ready, /Café Atlas/);
});

test("eine leere Änderungsauswahl erzeugt keine UI-Exception", () => {
  const api = loadAppWithFixtures();
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  state.runtime.active = true;
  assert.doesNotThrow(() => api.updateGastroView({ querySelector: () => null }, state));
});

test("ein verspäteter Kartenloader nach Seitenwechsel erzeugt keine Karte", async () => {
  const mapCalls = [];
  const mapNode = { nodeName: "DIV" };
  const root = {
    innerHTML: "",
    classList: { add() {}, remove() {} },
    querySelector(selector) { return selector === '[data-gf="map"]' ? mapNode : null; },
    querySelectorAll() { return []; },
  };
  const layer = { addTo() { return this; }, clearLayers() {}, addLayer() {} };
  const mapObject = {
    setView() {}, invalidateSize() {}, remove() {}, panTo() {},
  };
  const fakeL = {
    map() { mapCalls.push(true); return mapObject; },
    setView() {},
    tileLayer() { return { addTo() {} }; },
    circle() { return { addTo() { return this; } }; },
    markerClusterGroup() { return layer; },
    layerGroup() { return layer; },
  };
  const document = {
    head: {
      appendChild(node) {
        if (node.tagName === "LINK") {
          setTimeout(() => node.onload && node.onload(), 0);
        } else {
          setTimeout(() => {
            if (String(node.src).endsWith("leaflet.js")) window.L = fakeL;
            if (node.onload) node.onload();
          }, 5);
        }
      },
    },
    querySelector() { return null; },
    createElement(tag) { return { tagName: tag.toUpperCase(), dataset: {} }; },
    getElementById() { return root; },
  };
  const window = { location: { pathname: "/app/", origin: "http://127.0.0.1" } };
  const api = loadApp({ window, document, fetch: async () => new Response(JSON.stringify({ results: { bindings: [] } })) });
  const promise = api.app({
    ...validConfig,
    latitude: "52.52",
    longitude: "13.405",
  }, root);
  api.onPageLeave("beschreibung");
  await promise;
  assert.equal(mapCalls.length, 0);
  assert.equal(root.gastroState.runtime.active, false);
});
