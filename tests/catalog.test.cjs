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
    URL,
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
  assert.ok(html.includes("gf-btn-outline-forest"), "Must use gf-btn-outline-forest for map action");
  assert.ok(html.includes("gf-btn-forest"), "Must use gf-btn-forest for detail action");
  assert.ok(!html.includes("btn-outline-primary"), "Must not use Bootstrap btn-outline-primary");
  assert.ok(!html.includes("btn-primary"), "Must not use Bootstrap btn-primary");
  assert.ok(html.includes("gf-catalog-img") || html.includes("gf-catalog-thumb"), "Must include catalog image container");
  assert.ok(html.includes("Gasthaus Zur Linde"), "Must render POI name");
});

test("catalog credits are outside the fixed image area and retain complete rights", () => {
  const scope = loadGastroScope();
  const credit = "Synthetischer Rechteinhaber ".repeat(16);
  const image = { url: "https://example.org/photo.svg", credit, licenseUrl: "https://creativecommons.org/licenses/by/4.0/", sourceUrl: "https://example.org/source" };
  const poi = { id: "https://example.org/long-credit", name: "Demo-Bistro", types: ["https://schema.org/Restaurant"], images: [image] };
  const html = scope.renderGastroCatalogCard(poi);
  const imageArea = html.match(/<div class="gf-catalog-img-wrap">([\s\S]*?)<\/div>/)[1];
  assert.ok(!imageArea.includes("gf-catalog-photo-credit"), "credit must not overflow from the fixed image area");
  assert.ok(html.includes(credit), "complete rights-party text is retained");
  assert.ok(html.includes(image.licenseUrl) && html.includes(image.sourceUrl), "licence and source remain linked");
  assert.ok(html.indexOf("gf-catalog-photo-credit") < html.indexOf("gf-catalog-body"), "credit precedes the card text");
  assert.ok(!scope.renderGastroCatalogCard({ ...poi, images: [] }).includes("gf-catalog-photo-credit"), "no empty credit area without an image");
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

test("list card credits sit below the card text, not over the small thumbnail", () => {
  const scope = loadGastroScope();
  const credit = "CentroVital, Hektikproduktions, Lizenz: CentroVital ".repeat(3).trim();
  const image = { url: "https://example.org/photo.svg", credit, licenseUrl: "https://creativecommons.org/licenses/by/4.0/", sourceUrl: "https://example.org/source" };
  const poi = { id: "https://example.org/list-credit", name: "Demo-Bistro", types: ["https://schema.org/Restaurant"], images: [image] };
  const html = scope.renderGastroCard(poi);
  const thumb = html.match(/<div class="gf-card-thumb-wrap">([\s\S]*?)<\/div>\s*<div class="gf-card-content">/)[1];
  assert.ok(!thumb.includes("gf-card-photo-credit"), "credit must not cover the thumbnail");
  assert.ok(html.indexOf("gf-card-photo-credit") > html.indexOf("gf-card-content"), "credit belongs to the card text");
  assert.ok(html.includes(credit), "complete rights-party text is retained");
  assert.ok(html.includes(image.licenseUrl) && html.includes(image.sourceUrl), "licence and source remain linked");
  assert.ok(!scope.renderGastroCard({ ...poi, images: [] }).includes("gf-card-photo-credit"), "no empty credit area without an image");
});
