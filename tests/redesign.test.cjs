const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

test("Fullscreen-State wird explizit gesetzt und beim Dispose vollständig zurückgebaut", () => {
  const classes = new Set();
  const body = { classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) } };
  const document = { body, getElementById: () => null };
  const api = loadApp({ document });
  const state = api.createGastroState("https://proxy.opendatagermany.io/api/ts/v1/kg/sparql", null);

  api.setGastroFullscreen({ gastroState: state }, true);
  assert.equal(state.runtime.fullscreen, true);
  assert.ok(classes.has("gf-app-fullscreen"));
  api.disposeGastroRuntime(state);
  assert.equal(state.runtime.fullscreen, false);
  assert.equal(state.runtime.catalogOpen, false);
  assert.equal(state.runtime.mobileView, "map");
});

test("Detaildialog und Cockpit werden beim Dispose geschlossen", () => {
  let dialogClosed = 0;
  let observerDisconnected = 0;
  const api = loadApp();
  const state = api.createGastroState("https://proxy.opendatagermany.io/api/ts/v1/kg/sparql", null);
  state.runtime.active = true;
  state.runtime.catalogOpen = true;
  state.runtime.cockpitCollapsed = true;
  state.runtime.detailDialog = { element: { close: () => { dialogClosed += 1; } }, opener: null };
  state.runtime.resizeObserver = { disconnect: () => { observerDisconnected += 1; } };

  api.disposeGastroRuntime(state);
  assert.equal(dialogClosed, 1);
  assert.equal(observerDisconnected, 1);
  assert.equal(state.runtime.catalogOpen, false);
  assert.equal(state.runtime.cockpitCollapsed, false);
  assert.equal(state.runtime.detailDialog, null);
});

test("die Startseite rendert Fullscreen-Shell, Brandbar, Floating Actions und Cockpit", () => {
  const api = loadApp();
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  const root = { innerHTML: "", classList: { add() {}, remove() {}, toggle() {} } };
  api.renderGastroShell(root, state);
  assert.match(root.innerHTML, /class="gf-fullscreen-wrapper/);
  assert.match(root.innerHTML, /class="gf-map-canvas/);
  assert.match(root.innerHTML, /data-gf-brandbar/);
  assert.match(root.innerHTML, /data-gf-floating-actions/);
  assert.match(root.innerHTML, /data-gf-cockpit/);
  assert.match(root.innerHTML, /data-gf-bottom-switcher/);
  assert.match(root.innerHTML, /data-gf-catalog-toggle/);
  assert.doesNotMatch(root.innerHTML, /data-gf="toolbar"/);
});

test("Cockpit-Zustand ist explizit und aktualisiert die Edge-Tab-Sichtbarkeit", () => {
  const api = loadApp();
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  const classes = { toggle: (name, on) => { state.runtime[name] = on; } };
  const edge = { hidden: false };
  const root = { classList: classes, querySelector: (selector) => selector === "[data-gf-edge-tab]" ? edge : null };
  api.setGastroCockpitCollapsed(root, state, true);
  assert.equal(state.runtime.cockpitCollapsed, true);
  assert.equal(edge.hidden, false);
  api.setGastroCockpitCollapsed(root, state, false);
  assert.equal(state.runtime.cockpitCollapsed, false);
});

test("Kartenmarker verwenden die Genussatlas-Semantik", () => {
  const api = loadApp();
  const restaurant = api.gastroMarkerHtml({ types: ["https://schema.org/Restaurant"] }, false);
  const cafe = api.gastroMarkerHtml({ types: ["https://schema.org/CafeOrCoffeeShop"] }, true);
  assert.match(restaurant, /gf-marker-restaurant/);
  assert.match(cafe, /gf-marker-cafe/);
  assert.match(cafe, /is-selected/);
});

test("Kartenresize läuft nach einer Layoutänderung mit pan:true", () => {
  const calls = [];
  const api = loadApp();
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  state.runtime.map = { invalidateSize: (options) => calls.push(options) };
  api.invalidateGastroMapSize(state);
  return new Promise((resolve) => setTimeout(() => {
    assert.equal(calls.length, 1);
    assert.equal(calls[0].animate, false);
    assert.equal(calls[0].pan, true);
    resolve();
  }, 5));
});

test("die Vollscreen-CSS enthält die sichtbaren Layoutbereiche", () => {
  const css = fs.readFileSync(path.join(__dirname, "../app/app.css"), "utf8");
  for (const selector of [".gf-fullscreen-wrapper", ".gf-map-canvas", ".gf-cockpit", ".gf-brandbar", ".gf-floating-actions"]) {
    assert.match(css, new RegExp(selector.replace(".", "\\.")));
  }
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
