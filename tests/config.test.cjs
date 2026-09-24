const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, validConfig } = require("./helpers.cjs");

const EXPECTED_SOURCE = "https://proxy.opendatagermany.io/api/ts/v1/kg/sparql";

function withConfig(overrides) {
  return { ...validConfig, ...overrides };
}

function assertConfigError(config, code, message) {
  assert.throws(
    () => loadApp().validateGastroConfig(config),
    (error) => error.code === code && message.test(error.message),
  );
}

test("Konfiguration kennt keinen stillen Ersatzort", () => {
  const api = loadApp();
  assert.equal(typeof api.validateGastroConfig, "function");
  assert.throws(() => api.validateGastroConfig(withConfig({ ort: " " })), /Ort/);
  assert.throws(
    () => api.validateGastroConfig(withConfig({ longitude: "" })),
    /Koordinaten/,
  );
  assert.throws(
    () => api.validateGastroConfig(withConfig({ radiusKm: "25x" })),
    /Umkreis/,
  );
  assert.throws(
    () => api.validateGastroConfig(withConfig({ apiurls: [] })),
    /Datenquelle/,
  );
  assert.equal(api.validateGastroConfig(validConfig).radiusKm, 25);
});

test("die vollständige und leere Quellkonfiguration werden vor jedem Abruf unterschieden", () => {
  assertConfigError(withConfig({ apiurls: [] }), "NO_SOURCE", /Datenquelle/);
  assertConfigError(withConfig({ apiurls: [{ name: "dztsparql", url: "" }] }), "NO_SOURCE", /Datenquelle/);
  assertConfigError(
    withConfig({ apiurls: [{ name: "dztsparql", url: "{{appconfig.datensatz-apiurl}}" }] }),
    "NO_SOURCE",
    /Datenquelle/,
  );
  assertConfigError(
    withConfig({ apiurls: [{ name: "anderes", label: "DZT SPARQL", url: EXPECTED_SOURCE }] }),
    "NO_SOURCE",
    /dztsparql/,
  );
});

test("nur der kanonische HTTPS-SPARQL-Endpunkt ist zulässig", () => {
  const wrong = [
    "http://proxy.opendatagermany.io/api/ts/v1/kg/sparql",
    "https://example.org/api/ts/v1/kg/sparql",
    "https://user:secret@proxy.opendatagermany.io/api/ts/v1/kg/sparql",
    "https://proxy.opendatagermany.io/api/ts/v1/kg/sparql?query=SELECT",
    "https://proxy.opendatagermany.io/api/ts/v1/kg/sparql#fragment",
    "https://proxy.opendatagermany.io/api/ts/v1/kg/sparql/",
  ];
  for (const url of wrong) {
    assertConfigError(withConfig({ apiurls: [{ name: "dztsparql", url }] }), "CONFIG", /Datenquelle/);
  }
});

test("Koordinaten werden als vollständiges, endliches Paar geprüft", () => {
  for (const config of [
    withConfig({ latitude: "" }),
    withConfig({ longitude: "" }),
    withConfig({ latitude: "52,52" }),
    withConfig({ longitude: "13.405x" }),
    withConfig({ latitude: "NaN", longitude: "13.405" }),
    withConfig({ latitude: "52.52", longitude: "Infinity" }),
    withConfig({ latitude: "-90.0001", longitude: "0" }),
    withConfig({ latitude: "0", longitude: "180.0001" }),
  ]) {
    assertConfigError(config, "CONFIG", /Koordinaten/);
  }

  const negativeZero = loadApp().validateGastroConfig(
    withConfig({ latitude: " -0 ", longitude: "0" }),
  ).explicitCenter;
  assert.equal(negativeZero.lat, -0);
  assert.equal(negativeZero.lng, 0);
  const boundary = loadApp().validateGastroConfig(
    withConfig({ latitude: "90", longitude: "180" }),
  ).explicitCenter;
  assert.equal(boundary.lat, 90);
  assert.equal(boundary.lng, 180);
});

test("Radius und Ortsname werden ohne stille Ersetzung validiert", () => {
  for (const radiusKm of ["", "0", "24.999", "101", "25x", "1e309"]) {
    assertConfigError(withConfig({ radiusKm }), "CONFIG", /Umkreis/);
  }
  assert.throws(
    () => loadApp().validateGastroConfig(withConfig({ ort: " \u00a0 " })),
    /Ort/,
  );
  assert.equal(
    loadApp().validateGastroConfig(withConfig({ radiusKm: " 5 ", ort: " Burladingen " })).ort,
    "Burladingen",
  );
});
