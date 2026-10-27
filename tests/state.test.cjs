const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAppWithFixtures, validConfig } = require("./helpers.cjs");

const SOURCE = validConfig.apiurls[0].url;
const REGION = { ort: "Berlin", lat: 52.52, lng: 13.405, radiusKm: 25 };

function newState(api) {
  const state = api.createGastroState(SOURCE, REGION);
  state.runtime.active = true;
  state.runtime.generation = 1;
  return state;
}

function page(api, start, count, options = {}) {
  return api.normalizeDztRows(api.makeGastroPage(start, count, options), REGION, "overview");
}

function idsOf(view) {
  return Array.from(view.pois, (poi) => poi.id);
}

test("eine vollständig verworfene volle Seite beendet die Quelle nicht", () => {
  const api = loadAppWithFixtures();
  const state = newState(api);
  const ids = Array.from({ length: 200 }, (_, i) => `https://example.org/gastro/${String(i).padStart(4, "0")}`);
  api.commitGastroPage(state, {
    sourceIds: ids,
    pois: [],
    excluded: ids.map((id) => ({ id, reason: "coordinates" })),
  });
  assert.equal(state.page.cursor, ids.at(-1));
  assert.equal(state.page.done, false);
  assert.equal(state.byId.size, 0);
  assert.equal(state.page.excluded.size, 200);
  api.commitGastroPage(state, { sourceIds: [], pois: [], excluded: [] });
  assert.equal(state.page.done, true);
});

test("200 + 200 + 1 + leere Seite ergeben 401 erreichbare Quell-IDs", () => {
  const api = loadAppWithFixtures();
  const state = newState(api);
  for (const [start, count] of [[0, 200], [200, 200], [400, 1]]) {
    api.commitGastroPage(state, page(api, start, count));
  }
  assert.equal(state.byId.size, 401);
  assert.equal(state.page.cursor, "https://example.org/gastro/0400");
  assert.equal(state.page.done, false);
  api.commitGastroPage(state, { sourceIds: [], pois: [], excluded: [] });
  assert.equal(state.byId.size, 401);
  assert.equal(state.page.done, true);
});

test("doppelte Zeilen, Typen und Seiten erzeugen keine Dublette", () => {
  const api = loadAppWithFixtures();
  const state = newState(api);
  api.commitGastroPage(state, page(api, 0, 1));
  const overlapping = page(api, 0, 2, { types: ["https://schema.org/Restaurant", "https://schema.org/CafeOrCoffeeShop"] });
  api.commitGastroPage(state, overlapping);
  assert.equal(state.byId.size, 2);
  assert.equal(state.byId.get("https://example.org/gastro/0000").types.length, 1);
  assert.equal(state.byId.get("https://example.org/gastro/0001").types.length, 2);
  assert.throws(
    () => api.commitGastroPage(state, page(api, 0, 1)),
    (error) => error.code === "CURSOR",
  );
});

test("ein nicht fortschreitender Cursor wird vor jeder Mutation abgewiesen", () => {
  const api = loadAppWithFixtures();
  const state = newState(api);
  api.commitGastroPage(state, page(api, 0, 1));
  const before = { cursor: state.page.cursor, count: state.byId.size };
  assert.throws(
    () => api.commitGastroPage(state, {
      sourceIds: ["https://example.org/gastro/0000"], pois: [], excluded: [],
    }),
    (error) => error.code === "CURSOR",
  );
  assert.equal(state.page.cursor, before.cursor);
  assert.equal(state.byId.size, before.count);
});

test("Filter, Mehrfachtypen und Küchenmissing werden auf den geladenen Bestand angewendet", () => {
  const api = loadAppWithFixtures();
  const state = newState(api);
  const rows = [
    ...api.makeGastroRows({ id: "https://example.org/a", name: "Café Atlas", types: ["https://schema.org/CafeOrCoffeeShop"], cuisines: ["deutsch"], address: { locality: "Berlin" } }),
    ...api.makeGastroRows({ id: "https://example.org/b", name: "Restaurant Atlas", types: ["https://schema.org/Restaurant", "https://schema.org/CafeOrCoffeeShop"], cuisines: [], address: { locality: "Potsdam" } }),
    ...api.makeGastroRows({ id: "https://example.org/c", name: "Café Atlas", types: ["https://schema.org/CafeOrCoffeeShop"], cuisines: ["italienisch"], address: { locality: "Berlin" } }),
  ];
  api.commitGastroPage(state, api.normalizeDztRows(rows, REGION, "overview"));
  let view = api.deriveGastroView(state);
  assert.equal(view.counts.all, 3);
  assert.equal(view.counts.restaurant, 1);
  assert.equal(view.counts.cafe, 3);
  assert.deepEqual(Array.from(view.cuisineOptions).sort(), ["deutsch", "italienisch", "missing"]);

  state.filters.text = "atlas";
  state.filters.type = "restaurant";
  state.filters.cuisine = "missing";
  view = api.deriveGastroView(state);
  assert.deepEqual(idsOf(view), ["https://example.org/b"]);

  state.filters.text = "";
  state.filters.type = "all";
  state.filters.cuisine = "all";
  state.sort = "name";
  view = api.deriveGastroView(state);
  assert.deepEqual(idsOf(view), ["https://example.org/a", "https://example.org/c", "https://example.org/b"]);
});

test("Mehr anzeigen verändert nur die Darstellungsgrenze und erreicht 72 Katalogeinträge", () => {
  const api = loadAppWithFixtures();
  const state = newState(api);
  api.commitGastroPage(state, page(api, 0, 72));
  assert.equal(state.visible.catalog, 24);
  api.showMoreGastroResults(state, "catalog");
  api.showMoreGastroResults(state, "catalog");
  assert.equal(state.visible.catalog, 72);
  assert.equal(api.deriveGastroView(state).pois.length, 72);
  assert.equal(state.visible.list, 24);
});

test("Ein Klick auf Nachladen ruft genau eine Relay-Seite ab und schützt bei Fehlern den Bestand", async () => {
  const api = loadAppWithFixtures({ fetch: async () => new Response(JSON.stringify({ results: { bindings: api.makeGastroPage(0, 1) } }), { status: 200 }) });
  const state = newState(api);
  let notifications = 0;
  let busyDuringNotify = null;
  await api.loadNextGastroPage(state, () => { notifications += 1; busyDuringNotify = state.page.busy; });
  assert.equal(state.byId.size, 1);
  assert.equal(state.page.loaded, true);
  assert.equal(notifications, 1);
  assert.equal(busyDuringNotify, false);
  assert.equal(state.page.busy, false);

  const before = state.page.cursor;
  const failing = loadAppWithFixtures({ fetch: async () => new Response("no", { status: 500 }) });
  const failedState = newState(failing);
  failing.commitGastroPage(failedState, page(failing, 0, 1));
  await failing.loadNextGastroPage(failedState, () => {});
  assert.equal(failedState.byId.size, 1);
  assert.equal(failedState.page.cursor, "https://example.org/gastro/0000");
  assert.equal(failedState.page.busy, false);
  assert.ok(failedState.page.error);
  assert.equal(before, "https://example.org/gastro/0000");
});

test("Namenssortierung folgt der deutschen Sortierung (Umlaute, Groß-/Kleinschreibung, Satzzeichen, Zahlen)", () => {
  const api = loadAppWithFixtures();
  const names = ["Burger Buddys", "Zur Linde", "Bäckerei Dreißig", "\"Trattoria Bella Vita\"", "arkona Café", "Café 10", "Café 9"];
  const pois = names.map((name, index) => ({ id: `https://example.org/${index}`, name }));
  const sorted = Array.from(pois.sort((a, b) => api.comparePoiOrder(a, b, "name")), (poi) => poi.name);
  assert.deepEqual(sorted, ["arkona Café", "Bäckerei Dreißig", "Burger Buddys", "Café 9", "Café 10", "\"Trattoria Bella Vita\"", "Zur Linde"]);
});
