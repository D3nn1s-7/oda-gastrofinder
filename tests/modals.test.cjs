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
      contains: (c) => classList.has(c)
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

test("openDetailModal and helper functions are defined", () => {
  const scope = loadGastroScope();
  assert.strictEqual(typeof scope.openDetailModal, "function", "openDetailModal must be defined");
  assert.strictEqual(typeof scope.openLightbox, "function", "openLightbox must be defined");
  assert.strictEqual(typeof scope.openQrModal, "function", "openQrModal must be defined");
});

test("renderGastroHeroDetails does not output raw IRIs as description", () => {
  const scope = loadGastroScope();
  assert.strictEqual(typeof scope.renderGastroHeroDetails, "function");

  const poiWithIri = {
    id: "https://example.org/p1",
    name: "Café Test",
    description: "http://onlim.com/entity/944a0ee8-c173-4b08-aae8-639e73dca62b",
    lat: 52.5,
    lng: 13.4,
    phone: "030 12345",
    website: "https://cafe-test.de",
    images: [{ url: "https://example.org/pic.jpg", title: "Pic" }]
  };

  const html = scope.renderGastroHeroDetails(poiWithIri, "uid", "ready");
  assert.ok(!html.includes("http://onlim.com/entity/"), "Must not display raw IRI in description");
  assert.ok(html.includes("Route öffnen") || html.includes("maps/dir"), "Must include route button");
  assert.ok(html.includes("tel:03012345") || html.includes("030 12345"), "Must include phone link");
});

test("renderGastroHeroDetails includes ODTA copy button in raw JSON accordion", () => {
  const scope = loadGastroScope();
  const poi = {
    id: "https://example.org/p1",
    name: "Café Test",
    raw: { "@id": "https://example.org/p1", name: "Café Test" }
  };
  const html = scope.renderGastroHeroDetails(poi, "test-uid", "ready");
  assert.ok(html.includes("gf-test-uid-copy-raw-btn") || html.includes("copy-raw-btn"), "Must include copy button in ODTA accordion");
  assert.ok(html.includes("In Zwischenablage kopieren"), "Button label must be 'In Zwischenablage kopieren'");
});

test("detail modal dismiss via hidden.bs.modal resets state.selectedId", () => {
  const scope = loadGastroScope();
  const state = scope.createGastroState("https://proxy.opendatagermany.io/api/ts/v1/kg/sparql", {
    lat: 52.52, lng: 13.405, radiusKm: 25, ort: "Berlin"
  });
  state.runtime.active = true;
  state.runtime.uid = "test-uid";
  state.selectedId = "https://example.org/p1";

  const listeners = {};
  const mockModalEl = {
    ...createMockElement("div"),
    addEventListener: (evt, fn) => {
      listeners[evt] = fn;
    },
    dispatchEvent: (evt) => {
      if (listeners[evt.type]) listeners[evt.type](evt);
    }
  };

  scope.setupDetailModalListeners(mockModalEl, state, () => {});
  assert.strictEqual(typeof listeners["hidden.bs.modal"], "function", "hidden.bs.modal listener must be registered");

  // Fire hidden.bs.modal
  listeners["hidden.bs.modal"]();
  assert.strictEqual(state.selectedId, null, "state.selectedId must be reset to null upon modal hidden");
});
