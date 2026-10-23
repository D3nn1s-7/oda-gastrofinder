const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.cjs");

// Läuft gegen die ausgelieferte app/app.js (keine Funktionskopie).
// Fehlerhinweise müssen die Fehlerklasse unterscheiden, die bei 429
// verbleibende Wartezeit nennen und einen Klick während der Wartezeit
// sichtbar bestätigen, statt still nichts zu tun.

function statusTarget() {
  const status = { textContent: "" };
  const root = { querySelector: (sel) => (sel === '[data-gf="status"]' ? status : null) };
  return { root, status };
}

function pageState(error) {
  return {
    page: { error, busy: false, done: false, retryAt: error && error.retryAt ? error.retryAt : 0 },
    byId: new Map(),
  };
}

test("Übersichtshinweise unterscheiden die Fehlerklassen", () => {
  const api = loadApp({ Date });
  const cases = [
    [{ code: "ACCESS", message: "Zugang abgelehnt", status: 401 }, /abgelehnt/, /informieren/],
    [{ code: "RELAY", message: "Relay fehlt", status: 404 }, /Relay/],
    [{ code: "PAYLOAD", message: "Antwort kein JSON" }, /ungültig/, /gelesen/],
    [{ code: "HTTP", message: "Serverfehler", status: 500 }, /nicht erreichbar/],
  ];
  for (const [error, ...patterns] of cases) {
    const { root, status } = statusTarget();
    api.updateGastroStatus(root, pageState(error), { partial: true });
    for (const pattern of patterns) assert.match(status.textContent, pattern, `code=${error.code}`);
  }
});

test("Abfragelimit nennt die verbleibende Wartezeit und später die spätere Variante", () => {
  const api = loadApp({ Date });
  const future = { code: "RATE_LIMIT", message: "limit", retryAt: Date.now() + 60000 };
  const active = statusTarget();
  api.updateGastroStatus(active.root, pageState(future), { partial: true });
  assert.match(active.status.textContent, /Zu viele Anfragen/);
  assert.match(active.status.textContent, /ca\. \d+ Sekunden/);

  const past = { code: "RATE_LIMIT", message: "limit", retryAt: Date.now() - 1000 };
  const elapsed = statusTarget();
  api.updateGastroStatus(elapsed.root, pageState(past), { partial: true });
  assert.match(elapsed.status.textContent, /Zu viele Anfragen/);
  assert.doesNotMatch(elapsed.status.textContent, /Sekunden/);
});

test("Konfigurationsfehler behalten ihre konkrete Meldung", () => {
  const api = loadApp({ Date });
  const { root, status } = statusTarget();
  api.updateGastroStatus(root, pageState({ code: "CONFIG", message: "Die Region ist noch nicht aufgelöst." }), { partial: true });
  assert.match(status.textContent, /Region ist noch nicht aufgelöst/);
});

test("Ein Klick während der Abfragelimit-Wartezeit aktualisiert den Hinweis, statt still zu enden", async () => {
  const api = loadApp({ Date });
  let notified = 0;
  const state = {
    runtime: { active: true, generation: 1, pageAbort: null },
    page: { done: false, busy: false, retryAt: Date.now() + 60000, error: null },
    region: { lat: 52.52, lng: 13.405 },
    sourceUrl: "https://example.org/sparql",
  };
  await api.loadNextGastroPage(state, () => notified++);
  assert.equal(notified, 1, "Cooldown-Klick muss notify() auslösen");
  assert.equal(state.page.busy, false);
});

test("Detailfehler nennen zusätzlich die Fehlerklasse", () => {
  const api = loadApp({ Date });
  const html = api.renderGastroHeroDetails({ id: "x", name: "Demo-Bistro" }, "gf-test", "error", { code: "ACCESS", message: "Zugang abgelehnt" });
  assert.match(html, /Detailangaben konnten nicht geladen/);
  assert.match(html, /abgelehnt/);
});

test("Konfigurationsfehleranzeige: fehlende Quelle und falscher Typ bleiben unterscheidbar", () => {
  const api = loadApp({ Date });
  const kontext = { label: "DZT Knowledge Graph (SPARQL)", typLabel: "Wissensdatenbank (SPARQL)", erwarteterTyp: "sparql" };
  const keine = api.classifyOdasFehler(new Error("Es ist keine Datenquelle konfiguriert."), { ...kontext, url: "" });
  assert.equal(keine.kind, "KEINE_QUELLE");

  const container = { innerHTML: "" };
  api.renderOdasFehler(container, new Error("Es ist keine Datenquelle konfiguriert."), { ...kontext, url: "" });
  assert.match(container.innerHTML, /keine Datenquelle konfiguriert/i);

  const wrong = { innerHTML: "" };
  api.renderOdasFehler(wrong, new Error("unpassend"), { ...kontext, url: "https://example.org/wrong" });
  assert.match(wrong.innerHTML, /Typ passt nicht/);
});
