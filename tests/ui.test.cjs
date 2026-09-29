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

test("die Shell hält Fullscreen-Map, Brandbar, Cockpit und Status getrennt", () => {
  const api = loadApp();
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  const root = { innerHTML: "", classList: { add() {}, remove() {}, toggle() {} } };
  api.renderGastroShell(root, state);
  assert.match(root.innerHTML, /class="gf-fullscreen-wrapper/);
  assert.match(root.innerHTML, /data-gf-brandbar/);
  assert.match(root.innerHTML, /data-gf="map"/);
  assert.match(root.innerHTML, /data-gf-cockpit/);
  assert.match(root.innerHTML, /data-gf="results-list"/);
  assert.match(root.innerHTML, /aria-live="polite"/);
  assert.match(root.innerHTML, /id="gf-[^"]+-search"/);
  assert.doesNotMatch(root.innerHTML, /data-gf="toolbar"/);
  assert.doesNotMatch(root.innerHTML, /data-gf="details"/);
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

test("mehrteilige, saisonale und über Mitternacht reichende Zeiten bleiben vollständig", () => {
  const api = loadApp();
  const markup = api.renderGastroDetails(samplePoi({
    openingHours: [
      { days: ["https://schema.org/Monday"], opens: "11:00", closes: "14:00" },
      { days: ["https://schema.org/Monday"], opens: "17:00", closes: "22:00" },
      { days: ["https://schema.org/Friday"], opens: "22:00", closes: "02:00", validFrom: "2026-01-01", validThrough: "2026-12-31" },
    ],
  }), "gf-test", "ready");
  assert.match(markup, /<strong>Montag<\/strong>: 11:00–14:00/);
  assert.match(markup, /<strong>Montag<\/strong>: 17:00–22:00/);
  assert.match(markup, /<strong>Freitag<\/strong>: 22:00–02:00 bis zum Folgetag/);
  assert.match(markup, /gültig 2026-01-01 bis 2026-12-31/);
  assert.doesNotMatch(markup, /Jetzt geöffnet|geschlossen/);
});

test("Beschreibungen mit HTML-Fragmenten werden als Text ausgegeben", () => {
  const api = loadApp();
  const markup = api.renderGastroDetails(samplePoi({
    description: '<script>window.__gastroXss=1</script><b>safe</b>',
  }), "gf-test", "ready");
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script\b|<b>safe<\/b>/);
});

test("das mobile Panel speichert die ausdrückliche Kompakt-/Vergrößert-Auswahl", () => {
  const api = loadApp();
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  let expanded = null;
  const root = { querySelector: () => ({ setAttribute: (_name, value) => { expanded = value; } }) };
  api.setGastroSheet(root, state, "expanded");
  assert.equal(state.sheet, "expanded");
  assert.equal(expanded, "true");
  api.setGastroSheet(root, state, "compact");
  assert.equal(state.sheet, "compact");
  assert.equal(expanded, "false");
});

test("Teilen verwendet die kanonische Instanz-URL und fällt bei Clipboard-Fehlern auf ein Feld zurück", async () => {
  let copied = null;
  const api = loadApp({
    window: { location: { origin: "https://portal.example", pathname: "/view/p/gastrofinder/i/", search: "?x=1" } },
    navigator: { clipboard: { writeText: async (value) => { copied = value; throw new Error("denied"); } } },
  });
  const appended = [];
  const root = { querySelector: () => null, appendChild: (node) => appended.push(node) };
  const result = await api.shareGastroInstance(root);
  assert.equal(copied, "https://portal.example/view/p/gastrofinder/i/#startseite");
  assert.equal(result.copied, false);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].readOnly, true);
  assert.equal(appended[0].value, copied);
});

test("Galerie öffnet modal, schließt und stellt den Auslöserfokus wieder her", () => {
  const listeners = {};
  const dialog = {
    open: false,
    isConnected: true,
    innerHTML: "",
    setAttribute() {},
    addEventListener(type, handler) { listeners[type] = handler; },
    showModal() { this.open = true; },
    close() { this.open = false; if (listeners.close) listeners.close(); },
    focus() {},
  };
  let active = null;
  const opener = { isConnected: true, focus() { active = this; } };
  const document = {
    createElement(tag) { return tag === "dialog" ? dialog : { setAttribute() {}, addEventListener() {} }; },
  };
  const api = loadApp({ document });
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  state.selectedId = "https://example.org/x";
  state.byId.set(state.selectedId, samplePoi({
    images: [{ url: "https://example.org/photo.jpg", title: "Bild", credit: "Test", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" }],
  }));
  const root = { querySelector: () => null };
  assert.equal(api.openGastroGallery(root, state, opener), true);
  assert.equal(dialog.open, true);
  api.closeGastroGallery(root, state);
  assert.equal(dialog.open, false);
  assert.equal(active, opener);
  assert.equal(state.runtime.gallery, null);
});

test("Schließen der Details kehrt zum Auslöser oder zur Ergebnisüberschrift zurück", () => {
  const api = loadApp();
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  let focused = null;
  const opener = { isConnected: true, focus() { focused = this; } };
  state.runtime.detailOpener = opener;
  api.closeGastroDetails(state, { querySelector: () => null });
  assert.equal(focused, opener);
  assert.equal(state.selectedId, null);
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

test("focusPoiOnMap centers map, closes catalog, and opens marker popup", () => {
  const api = loadApp();
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  const poi = samplePoi({ id: "https://example.org/test-poi", lat: 52.52, lng: 13.405 });
  state.byId.set(poi.id, poi);
  state.runtime.active = true;

  let viewSet = null;
  let popupOpened = false;
  state.runtime.map = {
    setView: (coords, zoom) => { viewSet = { coords, zoom }; },
    getZoom: () => 14,
  };
  state.runtime.markerById = new Map();
  state.runtime.markerById.set(poi.id, {
    openPopup: () => { popupOpened = true; },
  });

  assert.equal(typeof api.focusPoiOnMap, "function", "focusPoiOnMap must be exported");
  api.focusPoiOnMap(state, poi.id);

  assert.equal(viewSet.coords[0], 52.52);
  assert.equal(viewSet.coords[1], 13.405);
  assert.equal(popupOpened, true);
});
