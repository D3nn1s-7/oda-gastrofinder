const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.cjs");

const SOURCE = "https://proxy.opendatagermany.io/api/ts/v1/kg/sparql";
const QUERY = "SELECT * WHERE { ?s ?p ?o }";

function bindingsResponse(bindings = []) {
  return new Response(JSON.stringify({ head: { vars: ["id", "subject", "predicate", "object"] }, results: { bindings } }), {
    status: 200,
    headers: { "Content-Type": "application/sparql-results+json" },
  });
}

async function captureRelay(pathname, response = bindingsResponse()) {
  const calls = [];
  const api = loadApp({
    window: { location: { pathname } },
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      return response;
    },
  });
  const bindings = await api.fetchDztBindings(SOURCE, QUERY, {});
  return { api, calls, bindings };
}

test("DZT-Abrufe verwenden ausschließlich das lokale ODAS-dzt-Relay", async () => {
  for (const pathname of [
    "/app",
    "/app/",
    "/app/index.html",
    "/view/portal/gastrofinder/instance/",
    "/view/portal/gastrofinder/instance/index.html",
  ]) {
    const { calls } = await captureRelay(pathname);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/dzt\?path=/);
    assert.doesNotMatch(calls[0].url, /odp-data|proxy\.opendatagermany\.io/);
    const relayUrl = new URL(calls[0].url, "https://local.test");
    const path = relayUrl.searchParams.get("path");
    assert.match(path, /^ts\/v1\/kg\/sparql\?query=/);
    assert.equal(new URLSearchParams(path.split("?")[1]).get("query"), QUERY);
    assert.equal(calls[0].options.method, "GET");
    assert.equal(calls[0].options.headers.Accept, "application/sparql-results+json");
  }
});

test("eine leere SPARQL-Antwort ist ein gültiges Seitenende", async () => {
  const { bindings } = await captureRelay("/app/");
  assert.equal(bindings.length, 0);
});

test("HTTP-Status und Relay-Probleme erhalten unterscheidbare Fehlercodes", async () => {
  const cases = [
    [401, {}, "ACCESS"],
    [403, {}, "ACCESS"],
    [404, {}, "RELAY"],
    [500, {}, "HTTP"],
    [429, { "Retry-After": "2" }, "RATE_LIMIT"],
  ];
  for (const [status, headers, code] of cases) {
    const api = loadApp({
      window: { location: { pathname: "/app/" } },
      fetch: async () => new Response("top secret internal body", { status, headers }),
    });
    await assert.rejects(
      api.fetchDztBindings(SOURCE, QUERY, {}),
      (error) => error.code === code && !error.message.includes("top secret"),
    );
  }
});

test("Retry-After wird in einen Retry-Zeitpunkt übersetzt", async () => {
  const api = loadApp({
    window: { location: { pathname: "/app/" } },
    fetch: async () => new Response("", { status: 429, headers: { "Retry-After": "3" } }),
  });
  const before = Date.now();
  await assert.rejects(
    api.fetchDztBindings(SOURCE, QUERY, {}),
    (error) => error.code === "RATE_LIMIT" && error.retryAt >= before + 2500 && error.retryAt <= Date.now() + 3500,
  );
});

test("HTML, leerer Body, defektes JSON und strukturell falsche Bindings sind PAYLOAD", async () => {
  const invalidResponses = [
    new Response("<html>no</html>", { status: 200 }),
    new Response("", { status: 200 }),
    new Response("{broken", { status: 200 }),
    new Response(JSON.stringify({ results: {} }), { status: 200 }),
    new Response(JSON.stringify({ results: { bindings: [{ id: { value: "x" } }] } }), { status: 200 }),
  ];
  for (const response of invalidResponses) {
    const api = loadApp({
      window: { location: { pathname: "/app/" } },
      fetch: async () => response,
    });
    await assert.rejects(api.fetchDztBindings(SOURCE, QUERY, {}), (error) => error.code === "PAYLOAD");
  }
});

test("Netzwerkfehler werden markiert, Abbruch bleibt Abbruch", async () => {
  const networkApi = loadApp({
    window: { location: { pathname: "/app/" } },
    fetch: async () => { throw new TypeError("Failed to fetch"); },
  });
  await assert.rejects(networkApi.fetchDztBindings(SOURCE, QUERY, {}), (error) => error.code === "NETWORK");

  const abort = new Error("aborted");
  abort.name = "AbortError";
  const abortApi = loadApp({
    window: { location: { pathname: "/app/" } },
    fetch: async () => { throw abort; },
  });
  await assert.rejects(abortApi.fetchDztBindings(SOURCE, QUERY, {}), (error) => error === abort);
});

test("eine unzulässige oder leere Quelle wird vor dem Fetch abgewiesen", async () => {
  for (const source of ["", "https://example.org/sparql", "javascript:alert(1)"]) {
    let called = false;
    const api = loadApp({
      window: { location: { pathname: "/app/" } },
      fetch: async () => { called = true; return bindingsResponse(); },
    });
    assert.throws(() => api.validateGastroSource({ apiurls: [{ name: "dztsparql", url: source }] }), /Datenquelle|Quelle/);
    assert.equal(called, false);
  }
});
