const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createMockElement(tagName = "div") {
  const children = [];
  const classList = new Set();
  const attributes = {};
  return {
    tagName: tagName.toUpperCase(),
    children,
    classList: {
      add: (c) => classList.add(c),
      remove: (c) => classList.delete(c),
      contains: (c) => classList.has(c),
      toggle: (c, val) => (val ?? !classList.has(c) ? classList.add(c) : classList.delete(c))
    },
    attributes,
    setAttribute: (k, v) => { attributes[k] = String(v); },
    getAttribute: (k) => attributes[k] || null,
    style: {},
    innerHTML: "",
    querySelector: () => createMockElement("div"),
    querySelectorAll: () => []
  };
}

function loadGastroScope() {
  const code = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
  const sandbox = {
    console,
    window: {
      location: { hostname: "test.local", pathname: "/view/test/app/inst1/" },
      bootstrap: {
        Modal: {
          getOrCreateInstance: () => ({ show: () => {}, hide: () => {} }),
          getInstance: () => null
        }
      }
    },
    document: {
      addEventListener: () => {},
      getElementById: () => createMockElement(),
      querySelector: () => createMockElement(),
      querySelectorAll: () => [],
      createElement: (t) => createMockElement(t),
      body: createMockElement("body")
    },
    sessionStorage: { getItem: () => null, setItem: () => {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

test("renderGastroCatalog renders dual actions ('Auf Karte' and 'Details') for each card", () => {
  const scope = loadGastroScope();
  const state = scope.createGastroState("https://proxy.opendatagermany.io/api/ts/v1/kg/sparql", {
    lat: 52.52,
    lng: 13.405,
    radiusKm: 25,
    ort: "Berlin"
  });

  const poi = {
    id: "https://example.org/poi1",
    name: "Gasthaus Zur Linde",
    description: "Gemütliches Gasthaus mit deutscher Küche.",
    lat: 52.52,
    lng: 13.405,
    city: "Berlin",
    street: "Lindenstr. 10",
    distanceKm: 1.5,
    cuisines: "deutsch",
    types: ["https://schema.org/Restaurant"],
    imageUrl: "https://example.org/linde.jpg",
    images: [{ url: "https://example.org/linde.jpg", title: "Linde" }]
  };

  state.byId.set(poi.id, poi);
  const view = scope.deriveGastroView(state);
  const html = scope.renderGastroCatalog(view, state);

  assert.ok(html.includes("data-gf-catalog-card"), "Must render catalog card container");
  assert.ok(html.includes("data-gf-catalog-map"), "Must include 'Auf Karte' action");
  assert.ok(html.includes("data-gf-catalog-detail"), "Must include 'Details' action");
  assert.ok(html.includes("gf-catalog-img") || html.includes("gf-catalog-thumb"), "Must include catalog image container");
  assert.ok(html.includes("Gasthaus Zur Linde"), "Must render POI name");
});

test("mobile drawer toggling updates view mode and switcher button state", () => {
  const scope = loadGastroScope();
  const state = scope.createGastroState("https://proxy.opendatagermany.io/api/ts/v1/kg/sparql", {
    lat: 52.52,
    lng: 13.405,
    radiusKm: 25,
    ort: "Berlin"
  });

  const switcherBtn = createMockElement("button");
  const root = {
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      toggle(c, v) { if (v) this.classes.add(c); else this.classes.delete(c); },
      contains(c) { return this.classes.has(c); }
    },
    querySelector: (sel) => (sel === "[data-gf-bottom-switcher]" ? switcherBtn : createMockElement())
  };

  // Switch to mobile list mode
  scope.setGastroMobileView(root, state, "list");
  assert.strictEqual(state.runtime.mobileView, "list", "Runtime mobileView must be 'list'");
  assert.ok(root.classList.contains("gf-mobile-list"), "Root must have gf-mobile-list class");
  assert.strictEqual(switcherBtn.attributes["aria-pressed"], "true", "Switcher aria-pressed must be true");

  // Switch back to mobile map mode
  scope.setGastroMobileView(root, state, "map");
  assert.strictEqual(state.runtime.mobileView, "map", "Runtime mobileView must be 'map'");
  assert.ok(!root.classList.contains("gf-mobile-list"), "Root must not have gf-mobile-list class");
  assert.strictEqual(switcherBtn.attributes["aria-pressed"], "false", "Switcher aria-pressed must be false");
});
