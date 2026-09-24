const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadGastroScope() {
  const code = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
  const sandbox = {
    console,
    window: { location: { hostname: "test.local", pathname: "/view/test/app/inst1/" } },
    document: { addEventListener: () => {}, querySelector: () => null, createElement: () => ({}) },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ results: { bindings: [] } }) })
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

test("buildGastroSparqlQuery creates valid geo-filtered SPARQL query for gastronomy", () => {
  const scope = loadGastroScope();
  assert.strictEqual(typeof scope.buildGastroSparqlQuery, "function", "buildGastroSparqlQuery must be exported/available");
  
  const query = scope.buildGastroSparqlQuery(52.52, 13.405, 25);
  assert.ok(query.includes("inst:dzt-geo-shapes"), "Query must include elasticsearch connector");
  assert.ok(query.includes("schema:Restaurant"), "Query must include schema:Restaurant");
  assert.ok(query.includes("schema:CafeOrCoffeeShop"), "Query must include schema:CafeOrCoffeeShop");
  assert.ok(query.includes("GROUP BY ?s"), "Query must group by subject");
  assert.ok(query.includes("isLiteral(?descDe)"), "Query must safeguard that description is a literal to prevent raw IRIs");
  assert.ok(query.includes("13.405"), "Query must contain longitude");
  assert.ok(query.includes("52.52"), "Query must contain latitude");
  assert.ok(query.includes("25km"), "Query must contain radius");
});

test("convertGastroBindingToPoi normalizes SPARQL bindings into clean POI objects", () => {
  const scope = loadGastroScope();
  assert.strictEqual(typeof scope.convertGastroBindingToPoi, "function", "convertGastroBindingToPoi must be available");

  const sampleBinding = {
    s: { value: "https://example.org/item/restaurant1" },
    name: { value: "Café Schön" },
    desc: { value: "Gemütliches Café am Fluss." },
    lat: { value: "52.5300" },
    lng: { value: "13.4100" },
    street: { value: "Uferstraße 12" },
    postal: { value: "10115" },
    city: { value: "Berlin" },
    phone: { value: "+49 30 123456" },
    web: { value: "https://cafe-schoen.de" },
    types: { value: "https://schema.org/CafeOrCoffeeShop,https://schema.org/Restaurant" },
    imgs: { value: "https://images.example.org/img1.jpg|https://images.example.org/img2.jpg" },
    cuisines: { value: "deutsch, hausgemacht" }
  };

  const poi = scope.convertGastroBindingToPoi(sampleBinding, 52.52, 13.405);
  assert.strictEqual(poi.id, "https://example.org/item/restaurant1");
  assert.strictEqual(poi.name, "Café Schön");
  assert.strictEqual(poi.description, "Gemütliches Café am Fluss.");
  assert.strictEqual(poi.lat, 52.53);
  assert.strictEqual(poi.lng, 13.41);
  assert.ok(typeof poi.distanceKm === "number" && poi.distanceKm >= 0, "Distance must be calculated");
  assert.strictEqual(poi.street, "Uferstraße 12");
  assert.strictEqual(poi.postalCode, "10115");
  assert.strictEqual(poi.city, "Berlin");
  assert.strictEqual(poi.phone, "+49 30 123456");
  assert.strictEqual(poi.website, "https://cafe-schoen.de");
  assert.strictEqual(poi.imageUrl, "https://images.example.org/img1.jpg");
  assert.strictEqual(poi.images.length, 2);
  assert.ok(poi.isCafe, "Must be classified as café");
  assert.ok(poi.isRestaurant, "Must be classified as restaurant");
  assert.strictEqual(poi.cuisines, "deutsch, hausgemacht");
});
