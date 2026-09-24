const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, loadAppWithFixtures } = require("./helpers.cjs");

const REGION = { ort: "Berlin", lat: 52.52, lng: 13.405, radiusKm: 25 };
const RESTAURANT = "https://schema.org/Restaurant";
const CAFE = "https://schema.org/CafeOrCoffeeShop";

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalize(api, rows, stage = "detail") {
  return plain(api.normalizeDztRows(rows, REGION, stage));
}

test("nur exakte Restaurant- und Café-Typen werden zugelassen", () => {
  const api = loadAppWithFixtures();
  const rejected = api.makeGastroRows({ types: ["https://schema.org/FoodEstablishment"] });
  const bar = api.makeGastroRows({ id: "https://example.org/bar", types: ["https://schema.org/BarOrPub"] });
  const result = normalize(api, [...rejected, ...bar]);
  assert.equal(result.pois.length, 0);
  assert.deepEqual(result.sourceIds, [
    "https://example.org/gastro/0001",
    "https://example.org/bar",
  ]);
  assert.equal(result.excluded.length, 2);
});

test("mehrere Typen und vervielfachte Tripel ergeben genau einen Betrieb", () => {
  const api = loadAppWithFixtures();
  const rows = api.makeGastroRows({ types: [RESTAURANT, CAFE] });
  const result = normalize(api, [...rows, ...rows]);
  assert.equal(result.pois.length, 1);
  assert.equal(result.pois[0].types.length, 2);
  assert.deepEqual(result.sourceIds, ["https://example.org/gastro/0001"]);
});

test("ein fehlender Quell-Identifikator wird nicht ersetzt", () => {
  const api = loadAppWithFixtures();
  const result = normalize(api, api.makeGastroRows({ omitIdTerm: true }));
  assert.equal(result.pois.length, 0);
  assert.deepEqual(result.sourceIds, []);
  assert.equal(result.excluded[0].reason, "id");
});

test("Sprachauswahl bevorzugt Deutsch, dann neutral und erst danach andere Sprachen", () => {
  const api = loadAppWithFixtures();
  const preferred = normalize(api, api.makeGastroRows({
    names: [
      { value: "English name", lang: "en" },
      { value: "Neutral name", lang: "" },
      { value: "Deutscher Name", lang: "de" },
    ],
  })).pois[0];
  assert.equal(preferred.name, "Deutscher Name");

  const neutral = normalize(api, api.makeGastroRows({
    names: [
      { value: "English name", lang: "en" },
      { value: "Neutral name", lang: "" },
    ],
  })).pois[0];
  assert.equal(neutral.name, "Neutral name");

  const missing = normalize(api, api.makeGastroRows({ name: null })).pois[0];
  assert.equal(missing.name, "Name nicht angegeben");
});

test("Bildrechte werden objektbezogen geprüft und nicht von der Datensatzlizenz abgeleitet", () => {
  const api = loadAppWithFixtures();
  const rows = api.makeGastroRows({
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    images: [
      { id: "a", url: "https://example.org/a.jpg", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" },
      { id: "b", url: "https://example.org/b.jpg", credit: "Testurheber", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" },
      { id: "c", url: "https://example.org/c.jpg" },
    ],
  });
  const result = normalize(api, rows);
  assert.equal(result.pois[0].images.length, 2);
  assert.deepEqual(result.pois[0].images.map((image) => image.url), [
    "https://example.org/a.jpg",
    "https://example.org/b.jpg",
  ]);
  assert.equal(result.pois[0].images[1].credit, "Testurheber");
});

test("eine unbekannte oder fehlende Datensatzlizenz sperrt den Betrieb", () => {
  const api = loadAppWithFixtures();
  for (const licenseUrl of [null, "https://example.org/unknown-license"]) {
    const result = normalize(api, api.makeGastroRows({ licenseUrl }));
    assert.equal(result.pois.length, 0);
    assert.equal(result.excluded[0].reason, "rights");
  }
});

test("mehrwertige Küchen und sichere Kontakte bleiben erhalten", () => {
  const api = loadAppWithFixtures();
  const rows = api.makeGastroRows({
    cuisines: ["deutsch", "international", { value: "https://schema.org/ItalianCuisine", type: "uri" }],
    websites: ["https://example.org/menu", "javascript:alert(1)", "//evil.example", "mailto:test@example.org"],
    telephones: ["+49 30 123456", "<script>", "030 987654"],
  });
  const poi = normalize(api, rows).pois[0];
  assert.deepEqual(poi.cuisines, ["deutsch", "international"]);
  assert.deepEqual(poi.websites, ["https://example.org/menu"]);
  assert.deepEqual(poi.telephones, ["+49 30 123456", "030 987654"]);
});

test("Punktkoordinaten werden validiert und widersprüchliche Geometrie wird verworfen", () => {
  const api = loadAppWithFixtures();
  const cases = [
    [[{ lat: null, lng: null }], "coordinates"],
    [[{ lat: "", lng: 13.4 }], "coordinates"],
    [[{ lat: 52.8, lng: 13.4 }], "outside"],
    [[{ lat: 52.52, lng: 13.405 }, { lat: 53, lng: 14 }], "coordinates"],
  ];
  for (const [geoPoints, reason] of cases) {
    const result = normalize(api, api.makeGastroRows({ geoPoints }));
    assert.equal(result.pois.length, 0);
    assert.equal(result.excluded[0].reason, reason);
  }
  const valid = normalize(api, api.makeGastroRows()).pois[0];
  assert.equal(valid.lat, 52.52);
  assert.equal(valid.lng, 13.405);
  assert.ok(valid.distanceKm >= 0);
});

test("Adressen, Beschreibung und Öffnungszeiten werden als Detaildaten aufbereitet", () => {
  const api = loadAppWithFixtures();
  const rows = api.makeGastroRows({
    address: { street: "Hauptstraße 5", postalCode: "10115", locality: "Berlin" },
    description: "Seasonal cuisine",
    hours: [{ days: ["Monday", "Tuesday"], opens: "11:00", closes: "14:00" }],
  });
  const poi = normalize(api, rows, "detail").pois[0];
  assert.equal(poi.address.street, "Hauptstraße 5");
  assert.equal(poi.address.postalCode, "10115");
  assert.equal(poi.address.locality, "Berlin");
  assert.equal(poi.description, "Seasonal cuisine");
  assert.deepEqual(poi.openingHours[0].days, [
    "https://schema.org/Monday",
    "https://schema.org/Tuesday",
  ]);
  assert.equal(poi.openingHours[0].opens, "11:00");
});

test("die Übersicht behält höchstens ein Bild", () => {
  const api = loadAppWithFixtures();
  const rows = api.makeGastroRows({
    images: [
      { url: "https://example.org/b.jpg", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" },
      { url: "https://example.org/a.jpg", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" },
    ],
  });
  const poi = normalize(api, rows, "overview").pois[0];
  assert.equal(poi.images.length, 1);
  assert.equal(poi.images[0].url, "https://example.org/a.jpg");
});

test("Übersichts- und Detailabfrage trennen IDs, Geometrie und ausführliche Felder", () => {
  const api = loadApp();
  const overview = api.buildOverviewQuery(REGION, "https://example.org/after?x=1");
  assert.equal(overview.includes("\\nPREFIX"), false);
  assert.match(overview, /^PREFIX schema: <https:\/\/schema\.org\/>\nPREFIX rdf:/);
  const inner = overview.match(/SELECT DISTINCT \?id WHERE \{([\s\S]*?)\} ORDER BY STR\(\?id\) LIMIT 200/)[1];
  assert.match(overview, /LIMIT 200/);
  assert.equal((overview.match(/LIMIT 200/g) || []).length, 1);
  assert.match(inner, /schema:Restaurant schema:CafeOrCoffeeShop/);
  assert.match(inner, /geo_shape/);
  assert.match(inner, /13\.405/);
  assert.match(inner, /https:\/\/example\.org\/after\?x=1/);
  assert.doesNotMatch(inner, /schema:name|schema:description/);
  assert.doesNotMatch(overview, /schema:description/);
  assert.equal(overview.includes("> . ?s ?p ?o"), false);

  const detail = api.buildDetailQuery("https://example.org/gastro/0001");
  assert.match(detail, /VALUES \?id \{ <https:\/\/example\.org\/gastro\/0001> \}/);
  assert.match(detail, /schema:openingHoursSpecification/);
  assert.doesNotMatch(detail, /BIND\(\?subject AS \?subject\)/);
  assert.equal((detail.match(/LIMIT 200/g) || []).length, 0);
  assert.throws(() => api.buildDetailQuery("https://example.org/x> . ?s ?p ?o"), /IRI/);
});

test("Quell-IDs werden nach Unicode-Codepoints und sicherer IRI-Syntax validiert", () => {
  const api = loadApp();
  assert.ok(api.compareSourceIds("z", "ä") < 0);
  assert.ok(api.compareSourceIds("é", "e") > 0);
  assert.equal(api.sparqlIri("https://example.org/a%20b"), "<https://example.org/a%20b>");
  for (const value of [
    "javascript:alert(1)",
    "//example.org/x",
    "https://user:pass@example.org/x",
    "https://example.org/x y",
    "https://example.org/x\\y",
    "https://example.org/x`y",
  ]) {
    assert.throws(() => api.sparqlIri(value), /IRI/);
  }
});
