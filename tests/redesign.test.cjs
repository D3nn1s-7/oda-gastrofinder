const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
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

test("Katalog rendert den aktuellen gefilterten Bestand mit Rückweg", () => {
  const api = loadApp();
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  const poi = samplePoi({ name: "Synthetic Bistro" });
  state.byId.set(poi.id, poi);
  const markup = api.renderGastroCatalog(api.deriveGastroView(state), state);
  assert.match(markup, /data-gf-catalog-overlay/);
  assert.match(markup, /Synthetic Bistro/);
  assert.match(markup, /Zurück zur Karte/);
  assert.match(markup, /data-gf-catalog-card/);
});

test("Katalogzustand öffnet und schließt ohne Kartenwechsel", () => {
  const api = loadApp();
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  const root = { innerHTML: "", classList: { toggle() {} }, querySelector: () => null };
  api.openGastroCatalog(root, state);
  assert.equal(state.runtime.catalogOpen, true);
  assert.equal(state.view, "catalog");
  api.closeGastroCatalog(root, state);
  assert.equal(state.runtime.catalogOpen, false);
  assert.equal(state.view, "map");
});

test("Hero-Dialog rendert belastbare Aktionen und escapt Detailtexte", () => {
  const api = loadApp();
  const markup = api.renderGastroHeroDetails(samplePoi({
    name: "<b>Synthetic</b>",
    description: "<script>bad()</script>",
    websites: ["https://example.org"],
    telephones: ["+49 30 123"],
  }), "gf-test", "ready");
  assert.match(markup, /class="gf-detail-dialog/);
  assert.match(markup, /&lt;b&gt;Synthetic&lt;\/b&gt;/);
  assert.doesNotMatch(markup, /<script\b/);
  assert.match(markup, /Route öffnen/);
  assert.match(markup, /Anrufen/);
  assert.match(markup, /Website besuchen/);
});

test("Detaildialog wird bei Escape geschlossen und Fokus zurückgegeben", () => {
  const api = loadAppWithFixtures();
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  state.runtime.active = true;
  const opener = { isConnected: true, focus() { this.focused = true; } };
  let closed = 0;
  state.runtime.detailDialog = { element: { close: () => { closed += 1; } }, opener };
  api.closeGastroDetailDialog({ querySelector: () => null }, state);
  assert.equal(closed, 1);
  assert.equal(opener.focused, true);
  assert.equal(state.runtime.detailDialog, null);
});

test("alle Sekundärseiten verwenden das gemeinsame Layout", () => {
  const api = loadApp({ configData: { beschreibung: "<h2>Methodik</h2>" } });
  for (const page of ["beschreibung", "kontakt", "datenschutz", "impressum"]) {
    const markup = api.renderPageOverride(page);
    assert.match(markup, /gf-secondary-wrapper/);
    assert.match(markup, /Zurück zur Karte/);
    assert.match(markup, /DZT · ODAS/);
    assert.match(markup, /gf-secondary-body/);
  }
  assert.equal(api.renderPageOverride("startseite"), null);
});

test("serverseitig gerenderter Markdown-Inhalt wird nicht erneut escaped", () => {
  const api = loadApp({ configData: { kontakt: "<p>Portal <strong>ODAS</strong></p>" } });
  const markup = api.renderPageOverride("kontakt");
  assert.match(markup, /<p>Portal <strong>ODAS<\/strong><\/p>/);
});

test("app.js kann ohne Lexical-Kollision zweimal geladen werden", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
  const context = vm.createContext({ console, URL, URLSearchParams, AbortController, Map, Set });
  vm.runInContext(source, context, { filename: "app/app.js" });
  assert.doesNotThrow(() => vm.runInContext(source, context, { filename: "app/app.js" }));
});

test("eine ungültige Konfiguration beendet den Fullscreen-Zustand", () => {
  const classes = new Set(["gf-app-fullscreen"]);
  const document = { body: { classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) } } };
  const api = loadApp({ document });
  const root = { innerHTML: "", classList: { remove() {} } };
  api.app({}, root);
  assert.equal(classes.has("gf-app-fullscreen"), false);
});

test("mobiles Cockpit bleibt nach Einklappen über den Bottom-Switcher bedienbar", () => {
  const api = loadApp();
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  const root = { classList: { toggle() {}, remove() {} }, querySelector: () => null };
  state.runtime.mobileView = "list";
  root.classList.add = () => {};
  api.setGastroCockpitCollapsed(root, state, true);
  assert.equal(state.runtime.mobileView, "map");
  api.setGastroMobileView(root, state, "list");
  assert.equal(state.runtime.mobileView, "list");
  assert.equal(state.runtime.cockpitCollapsed, false);
});
