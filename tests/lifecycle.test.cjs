const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAppWithFixtures, validConfig } = require("./helpers.cjs");

const SOURCE = validConfig.apiurls[0].url;
const REGION = { ort: "Berlin", lat: 52.52, lng: 13.405, radiusKm: 25 };

function stateFor(api, rows) {
  const state = api.createGastroState(SOURCE, REGION);
  state.runtime.active = true;
  state.runtime.generation = 1;
  api.commitGastroPage(state, api.normalizeDztRows(rows, REGION, "overview"));
  return state;
}

function responseFor(api, id) {
  return new Response(JSON.stringify({
    results: { bindings: api.makeGastroRows({ id }) },
  }), { status: 200, headers: { "Content-Type": "application/sparql-results+json" } });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("eine verspätete A-Antwort überschreibt weder B-Details noch den sichtbaren Zustand", async () => {
  const pending = { a: deferred(), b: deferred() };
  const calls = [];
  let api;
  api = loadAppWithFixtures({
    fetch: async (url) => {
      const path = new URL(url, "https://local.test").searchParams.get("path");
      const query = new URLSearchParams(path.split("?")[1]).get("query");
      calls.push(query);
      return query.includes("/a>") ? pending.a.promise : pending.b.promise;
    },
  });
  const rows = [
    ...api.makeGastroRows({ id: "https://example.org/a" }),
    ...api.makeGastroRows({ id: "https://example.org/b" }),
  ];
  const state = stateFor(api, rows);
  let notifications = 0;
  const a = api.selectGastroPoi(state, "https://example.org/a", () => { notifications += 1; });
  await settle();
  const b = api.selectGastroPoi(state, "https://example.org/b", () => { notifications += 1; });
  await settle();
  pending.b.resolve(responseFor(api, "https://example.org/b"));
  await b;
  assert.equal(state.selectedId, "https://example.org/b");
  assert.equal(state.detail.busy, false);
  assert.ok(state.details.has("https://example.org/b"));

  pending.a.resolve(responseFor(api, "https://example.org/a"));
  await a;
  assert.equal(state.selectedId, "https://example.org/b");
  assert.equal(state.details.has("https://example.org/a"), false);
  assert.equal(state.detail.error, null);
  assert.equal(calls.length, 2);
  assert.equal(notifications, 1);
});

test("ein alter Fehler wird nach B nicht sichtbar und verändert Busy nicht", async () => {
  const pending = { a: deferred(), b: deferred() };
  const api = loadAppWithFixtures({
    fetch: async (url) => {
      const path = new URL(url, "https://local.test").searchParams.get("path");
      const query = new URLSearchParams(path.split("?")[1]).get("query");
      return query.includes("/a>") ? pending.a.promise : pending.b.promise;
    },
  });
  const state = stateFor(api, [
    ...api.makeGastroRows({ id: "https://example.org/a" }),
    ...api.makeGastroRows({ id: "https://example.org/b" }),
  ]);
  const a = api.selectGastroPoi(state, "https://example.org/a", () => {});
  await settle();
  const b = api.selectGastroPoi(state, "https://example.org/b", () => {});
  await settle();
  pending.b.resolve(responseFor(api, "https://example.org/b"));
  await b;
  pending.a.reject(new Error("alter Fehler"));
  await a;
  assert.equal(state.selectedId, "https://example.org/b");
  assert.equal(state.detail.error, null);
  assert.equal(state.detail.busy, false);
});

test("eine bereits geladene Detailauswahl erzeugt keinen zweiten Abruf", async () => {
  let calls = 0;
  const api = loadAppWithFixtures({
    fetch: async () => {
      calls += 1;
      return responseFor(api, "https://example.org/a");
    },
  });
  const state = stateFor(api, api.makeGastroRows({ id: "https://example.org/a" }));
  await api.selectGastroPoi(state, "https://example.org/a", () => {});
  await api.selectGastroPoi(state, "https://example.org/a", () => {});
  assert.equal(calls, 1);
});

test("eine 429-Antwort sperrt nur die manuelle Wiederholung bis Retry-After", async () => {
  let calls = 0;
  const api = loadAppWithFixtures({
    fetch: async () => {
      calls += 1;
      return new Response("", { status: 429, headers: { "Retry-After": "60" } });
    },
  });
  const state = api.createGastroState(SOURCE, REGION);
  state.runtime.active = true;
  state.runtime.generation = 1;
  await api.loadNextGastroPage(state, () => {});
  await api.loadNextGastroPage(state, () => {});
  assert.equal(calls, 1);
  assert.ok(state.page.retryAt > Date.now());
  assert.equal(state.page.busy, false);
});

test("ein inaktiver Mount startet keinen Datenabruf", async () => {
  let calls = 0;
  const api = loadAppWithFixtures({ fetch: async () => { calls += 1; return new Response("{}", { status: 200 }); } });
  const state = api.createGastroState(SOURCE, REGION);
  state.runtime.active = false;
  await api.loadNextGastroPage(state, () => {});
  assert.equal(calls, 0);
});

test("eine Detailantwort mit einer anderen Quell-ID wird nicht gecacht", async () => {
  const api = loadAppWithFixtures({
    fetch: async () => responseFor(api, "https://example.org/other"),
  });
  const state = stateFor(api, api.makeGastroRows({ id: "https://example.org/a" }));
  await api.selectGastroPoi(state, "https://example.org/a", () => {});
  assert.equal(state.details.has("https://example.org/a"), false);
  assert.equal(state.detail.error.code, "DETAIL");
});

test("eine gemischte Detailantwort mit zusätzlicher ID wird nicht gecacht", async () => {
  const api = loadAppWithFixtures({
    fetch: async () => new Response(JSON.stringify({
      results: { bindings: [
        ...api.makeGastroRows({ id: "https://example.org/a" }),
        ...api.makeGastroRows({ id: "https://example.org/other" }),
      ] },
    }), { status: 200 }),
  });
  const state = stateFor(api, api.makeGastroRows({ id: "https://example.org/a" }));
  await api.selectGastroPoi(state, "https://example.org/a", () => {});
  assert.equal(state.details.has("https://example.org/a"), false);
  assert.equal(state.detail.error.code, "DETAIL");
});

test("Dispose bricht Requests ab, räumt Ressourcen und verhindert spätere Notifications", async () => {
  const pending = deferred();
  const api = loadAppWithFixtures({ fetch: async () => pending.promise });
  const state = stateFor(api, api.makeGastroRows({ id: "https://example.org/a" }));
  let removed = 0;
  let center = 0;
  state.runtime.map = {
    getCenter: () => ({ lat: 1, lng: 2 }),
    remove: () => { removed += 1; },
  };
  state.runtime.events = { abort: () => { center += 1; } };
  state.runtime.debounceTimer = setTimeout(() => {}, 10000);
  let notifications = 0;
  const request = api.selectGastroPoi(state, "https://example.org/a", () => { notifications += 1; });
  await settle();
  api.disposeGastroRuntime(state);
  assert.equal(state.runtime.active, false);
  assert.equal(state.runtime.map, null);
  assert.equal(state.page.busy, false);
  assert.equal(state.detail.busy, false);
  assert.equal(removed, 1);
  assert.equal(center, 1);
  assert.equal(state.runtime.debounceTimer, null);
  pending.resolve(responseFor(api, "https://example.org/a"));
  await request;
  assert.equal(notifications, 0);
  api.disposeGastroRuntime(state);
  assert.equal(removed, 1);
});
