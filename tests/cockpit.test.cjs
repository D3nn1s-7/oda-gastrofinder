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
    removeAttribute: (k) => { delete attributes[k]; },
    style: {},
    innerHTML: "",
    querySelector: function (sel) {
      // Very basic selector check on self or innerHTML
      if (sel.includes("brandbar") || sel.includes("top-banner")) {
        return createMockElement("div");
      }
      return createMockElement("div");
    },
    querySelectorAll: () => []
  };
}

function loadGastroScope() {
  const code = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
  const sandbox = {
    console,
    URL,
    window: { location: { hostname: "test.local", pathname: "/view/test/app/inst1/" } },
    document: {
      addEventListener: () => {},
      querySelector: () => createMockElement(),
      querySelectorAll: () => [],
      createElement: (t) => createMockElement(t)
    },
    sessionStorage: { getItem: () => null, setItem: () => {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

test("renderGastroCard produces compact card with thumbnail and details link", () => {
  const scope = loadGastroScope();
  assert.strictEqual(typeof scope.renderGastroCard, "function");

  const samplePoi = {
    id: "https://example.org/p1",
    name: "Ristorante Roma",
    description: "Leckere Pasta und Pizza.",
    images: [{
      url: "https://example.org/roma.jpg",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      credit: "Testfotografie",
    }],
    distanceKm: 1.2,
    city: "Berlin",
    street: "Mittelstraße 5",
    isRestaurant: true,
    isCafe: false,
    cuisines: "italienisch"
  };

  const html = scope.renderGastroCard(samplePoi, "test-uid", false);
  assert.ok(html.includes("Ristorante Roma"), "Must contain POI name");
  assert.ok(html.includes("1,2 km") || html.includes("1.2 km"), "Must contain distance");
  assert.ok(html.includes("https://example.org/roma.jpg"), "Must render thumbnail image");
  assert.ok(html.includes("Details ansehen"), "Must have Details ansehen link or button");
  assert.ok(!html.includes("width: 250px"), "Must not contain huge inline card styling");
});

test("renderGastroShell produces top banner and collapsible cockpit", () => {
  const scope = loadGastroScope();
  assert.strictEqual(typeof scope.renderGastroShell, "function");

  const root = createMockElement("div");
  const state = {
    region: { ort: "Berlin", radiusKm: 25 },
    runtime: { uid: "test1" },
    config: { titel: "Gastrofinder", ort: "Berlin", umkreis: 25 }
  };

  scope.renderGastroShell(root, state);
  assert.ok(root.innerHTML.includes("Gastrofinder"), "Root must contain app title");
  assert.ok(root.innerHTML.includes("Berlin"), "Top banner or brand must include city");
  assert.ok(root.innerHTML.includes("25 km"), "Top banner or brand must include radius");
});
