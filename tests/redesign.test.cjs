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
