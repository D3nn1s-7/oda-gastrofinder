const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, validConfig } = require("./helpers.cjs");

function regionFor(api, overrides = {}) {
  const config = api.validateGastroConfig({ ...validConfig, ...overrides });
  return { config, api };
}

test("gleiche Ortsnamen verlangen Betreiberkoordinaten", () => {
  const api = loadApp();
  const { config } = regionFor(api, { ort: "Neustadt", latitude: "", longitude: "" });
  const places = [
    { id: "1", name: "Neustadt", lat: 49, lng: 8, admin1: "08", admin2: "1" },
    { id: "2", name: "Neustadt", lat: 50, lng: 9, admin1: "06", admin2: "2" },
  ];
  assert.throws(() => api.resolveGastroRegion(config, places), /mehrdeutig/);
  assert.throws(() => api.resolveGastroRegion(config, []), /nicht gefunden/);
});

test("Radius prüft ungerundete Entfernung", () => {
  const api = loadApp();
  const center = { lat: 52.52, lng: 13.405 };
  const point = { lat: 52.75, lng: 13.405 };
  const distance = api.distanceKm(center, point);
  assert.equal(api.isInGastroRegion(point, { ...center, radiusKm: distance - 0.00001 }), false);
  assert.equal(api.isInGastroRegion(point, { ...center, radiusKm: distance + 0.00001 }), true);
  assert.equal(api.isInGastroRegion({ lat: "", lng: "" }, { ...center, radiusKm: 25 }), false);
});

test("Haversine uses the agreed earth radius before display rounding", () => {
  const distance = loadApp().distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
  assert.ok(distance > 111.19 && distance < 111.2, `unexpected distance ${distance}`);
});

test("eindeutige Orte werden NFC- und whitespace-normalisiert", () => {
  const api = loadApp();
  const { config } = regionFor(api, { ort: "  Burladingen ", latitude: "", longitude: "" });
  const region = api.resolveGastroRegion(config, [
    { id: "1", name: "Burladingen", lat: 52.05, lng: 7.12, admin1: "05", admin2: "1" },
  ]);
  assert.equal(region.ort, "Burladingen");
  assert.equal(region.lat, 52.05);
  assert.equal(region.lng, 7.12);
});

test("ein explizites Koordinatenpaar gewinnt und braucht keinen Ortsindex", () => {
  const api = loadApp();
  const { config } = regionFor(api, { ort: "Freiewahl", latitude: "48.1", longitude: "9.2" });
  const region = api.resolveGastroRegion(config, []);
  assert.equal(region.ort, "Freiewahl");
  assert.equal(region.lat, 48.1);
  assert.equal(region.lng, 9.2);
});

test("ungültige Koordinaten werden nicht als Treffer verortet", () => {
  const api = loadApp();
  assert.equal(api.isInGastroRegion({ lat: 91, lng: 0 }, { lat: 0, lng: 0, radiusKm: 100 }), false);
  assert.equal(api.isInGastroRegion({ lat: 0, lng: 181 }, { lat: 0, lng: 0, radiusKm: 100 }), false);
});
