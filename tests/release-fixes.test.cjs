const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, loadAppWithFixtures, validConfig } = require("./helpers.cjs");

const REGION = { ort: "Berlin", lat: 52.52, lng: 13.405, radiusKm: 25 };
const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const PHOTO_LICENSE = "https://creativecommons.org/licenses/by/4.0/";

function makeElement(tagName = "div") {
  const listeners = new Map();
  const selectors = new Map();
  const attributes = new Map();
  const classes = new Set();
  const element = {
    tagName: tagName.toUpperCase(),
    listeners,
    selectors,
    attributes,
    children: [],
    style: {},
    isConnected: true,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, force) => force ? classes.add(name) : classes.delete(name),
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) || null; },
    hasAttribute(name) { return attributes.has(name); },
    addEventListener(type, handler) {
      const existing = listeners.get(type) || [];
      existing.push(handler);
      listeners.set(type, existing);
    },
    removeEventListener(type, handler) {
      listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== handler));
    },
    dispatch(type, event = {}) {
      const detail = { type, target: element, preventDefault() {}, stopPropagation() {}, ...event };
      for (const handler of listeners.get(type) || []) handler(detail);
      return detail;
    },
    querySelector(selector) { return selectors.get(selector) || null; },
    querySelectorAll(selector) { return selectors.get(`${selector}[]`) || []; },
    closest(selector) {
      if (selector === "button" && this.tagName === "BUTTON") return this;
      if (selector === "[data-gf-catalog-card]") return this.catalogCard || null;
      if (selector === "[data-gf-select]" && this.hasAttribute("data-gf-select")) return this;
      if (selector === "[data-bs-dismiss='modal']" && this.hasAttribute("data-bs-dismiss")) return this;
      return null;
    },
    focus() { if (element.ownerDocument) element.ownerDocument.activeElement = element; },
    appendChild(child) { this.children.push(child); child.parentNode = this; child.isConnected = true; return child; },
    remove() { this.isConnected = false; if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); },
  };
  return element;
}

function createModalDocument() {
  const ids = new Map();
  const modalContent = makeElement("div");
  modalContent.querySelector = (selector) => modalContent.selectors.get(selector) || null;
  const body = makeElement("body");
  body.appendChild = (child) => {
    child.parentNode = body;
    child.isConnected = true;
    body.children.push(child);
    if (child.id) ids.set(child.id, child);
  };
  const doc = {
    body,
    readyState: "complete",
    activeElement: null,
    listeners: new Map(),
    createElement(tagName) {
      const el = makeElement(tagName);
      if (tagName === "div") {
        el.querySelector = (selector) => {
          if (selector === ".modal-content" || /-detail-modal-content$/.test(selector)) return modalContent;
          return el.selectors.get(selector) || null;
        };
      }
      el.ownerDocument = doc;
      return el;
    },
    getElementById(id) { return ids.get(id) || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(type, handler) {
      const existing = doc.listeners.get(type) || [];
      existing.push(handler);
      doc.listeners.set(type, existing);
    },
    removeEventListener(type, handler) {
      doc.listeners.set(type, (doc.listeners.get(type) || []).filter((entry) => entry !== handler));
    },
  };
  body.ownerDocument = doc;
  return { document: doc, ids, body, modalContent };
}

function makeRuntimeRoot() {
  const root = makeElement("main");
  const list = makeElement("div");
  root.selectors.set('[data-gf="results-list"]', list);
  return { root, list };
}

function poiState(api, rows) {
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  state.runtime.active = true;
  state.runtime.generation = 1;
  state.runtime.uid = "release-test";
  api.commitGastroPage(state, api.normalizeDztRows(rows, REGION, "overview"));
  return state;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

function detailResponse(api, options = {}) {
  return new Response(JSON.stringify({
    results: { bindings: api.makeGastroRows(options) },
  }), { status: 200, headers: { "Content-Type": "application/sparql-results+json" } });
}

function clickTarget(id, catalog = false) {
  const button = makeElement("button");
  button.setAttribute("data-gf-select", "");
  button.setAttribute("data-gf-id", id);
  if (catalog) button.catalogCard = makeElement("article");
  return button;
}

function bindModalRuntime(api, overrides = {}) {
  const dom = createModalDocument();
  let shows = 0;
  let hides = 0;
  const modalInstance = {
    show() { shows += 1; },
    hide() { hides += 1; },
  };
  const rootAndList = makeRuntimeRoot();
  const sandbox = api;
  sandbox.document = dom.document;
  sandbox.window = {
    location: { hostname: "test.local", pathname: "/view/test/app/inst1/" },
    bootstrap: { Modal: { getOrCreateInstance: () => modalInstance, getInstance: () => modalInstance } },
  };
  const state = poiState(api, api.makeGastroRows({ id: "https://example.org/a", name: "Übersicht A" }));
  state.runtime.root = rootAndList.root;
  api.bindGastroShellEvents(rootAndList.root, state);
  return { ...dom, root: rootAndList.root, list: rootAndList.list, state, modalInstance, get shows() { return shows; }, get hides() { return hides; } };
}

test("Listen- und Katalogklick laden und rendern denselben Server-Detaildatensatz", async () => {
  for (const source of ["list", "catalog"]) {
    const request = deferred();
    let detailCalls = 0;
    const api = loadAppWithFixtures({ fetch: async () => { detailCalls += 1; return request.promise; } });
    const ui = bindModalRuntime(api);
    const target = clickTarget("https://example.org/a", source === "catalog");
    if (source === "list") {
      ui.list.dispatch("click", { target });
    } else {
      ui.root.dispatch("click", { target });
    }
    assert.equal(detailCalls, 1, `${source} click must fetch detail data`);
    assert.match(ui.modalContent.innerHTML, /Details werden geladen/);
    assert.equal(ui.shows, 1, "the Bootstrap detail modal opens while loading");

    request.resolve(detailResponse(api, { id: "https://example.org/a", name: "Geladener Datensatz A", description: "Detailtext aus der Antwort." }));
    await settle();
    assert.equal(ui.state.details.get("https://example.org/a").description, "Detailtext aus der Antwort.");
    assert.match(ui.modalContent.innerHTML, /Detailtext aus der Antwort\./);
    assert.doesNotMatch(ui.modalContent.innerHTML, /Übersicht A/);
  }
});

test("ein schließen vor der Detailantwort invalidiert die Auswahl und öffnet nichts erneut", async () => {
  const request = deferred();
  let detailCalls = 0;
  let detailSignal;
  const api = loadAppWithFixtures({ fetch: async (_url, options) => { detailCalls += 1; detailSignal = options.signal; return request.promise; } });
  const ui = bindModalRuntime(api);
  ui.list.dispatch("click", { target: clickTarget("https://example.org/a") });
  assert.equal(detailCalls, 1);
  const modal = ui.document.getElementById("gf-release-test-detail-modal");
  assert.ok(modal);
  modal.dispatch("hidden.bs.modal");
  assert.equal(detailSignal.aborted, true);
  assert.equal(ui.state.selectedId, null);
  request.resolve(detailResponse(api, { id: "https://example.org/a", description: "Nicht mehr anzeigen" }));
  await settle();
  assert.equal(ui.state.details.has("https://example.org/a"), false);
  assert.equal(ui.shows, 1);
  assert.doesNotMatch(ui.modalContent.innerHTML, /Nicht mehr anzeigen/);
});

test("bereits geladene Details erscheinen nach Modal-Schließen und erneutem Öffnen ohne zweiten Abruf", async () => {
  let detailCalls = 0;
  const api = loadAppWithFixtures({
    fetch: async () => {
      detailCalls += 1;
      return detailResponse(api, { id: "https://example.org/a", description: "Gecachte Detailbeschreibung" });
    },
  });
  const ui = bindModalRuntime(api);

  api.openDetailModal(ui.state, "https://example.org/a");
  assert.equal(detailCalls, 1);
  await settle();
  assert.match(ui.modalContent.innerHTML, /Gecachte Detailbeschreibung/);

  const modal = ui.document.getElementById("gf-release-test-detail-modal");
  modal.dispatch("hidden.bs.modal");
  assert.equal(ui.state.selectedId, null);
  api.openDetailModal(ui.state, "https://example.org/a");
  await settle();

  assert.equal(detailCalls, 1);
  assert.match(ui.modalContent.innerHTML, /Gecachte Detailbeschreibung/);
  assert.doesNotMatch(ui.modalContent.innerHTML, /Details werden geladen/);
  assert.equal(ui.shows, 2);
});

test("Detail-Ladeansicht bietet natives Schließen und ein verborgenes Modal bricht den Abruf ab", async () => {
  const request = deferred();
  let detailSignal;
  const api = loadAppWithFixtures({
    fetch: async (_url, options) => {
      detailSignal = options.signal;
      return request.promise;
    },
  });
  const ui = bindModalRuntime(api);
  ui.list.dispatch("click", { target: clickTarget("https://example.org/a") });

  assert.match(ui.modalContent.innerHTML, /<button[^>]+data-bs-dismiss="modal"[^>]+aria-label="Schließen"/);
  const modal = ui.document.getElementById("gf-release-test-detail-modal");
  modal.dispatch("hidden.bs.modal");
  assert.equal(detailSignal.aborted, true);
  assert.equal(ui.state.selectedId, null);
  request.resolve(detailResponse(api, { id: "https://example.org/a", description: "Nach dem Schließen nicht anzeigen" }));
  await settle();
  assert.equal(ui.state.details.has("https://example.org/a"), false);
  assert.doesNotMatch(ui.modalContent.innerHTML, /Nach dem Schließen nicht anzeigen/);
});

test("Detailfehler zeigen Retry; erneuter Abruf rendert danach die echten Details", async () => {
  let calls = 0;
  const api = loadAppWithFixtures({
    fetch: async () => {
      calls += 1;
      return calls === 1
        ? new Response("Relay nicht verfügbar", { status: 502 })
        : detailResponse(api, { id: "https://example.org/a", description: "Nach Retry verfügbar" });
    },
  });
  const ui = bindModalRuntime(api);
  const retry = makeElement("button");
  const originalQuerySelector = ui.modalContent.querySelector.bind(ui.modalContent);
  ui.modalContent.querySelector = (selector) => {
    if (selector === "[data-gf-detail-retry]" && ui.modalContent.innerHTML.includes("data-gf-detail-retry")) return retry;
    return originalQuerySelector(selector);
  };

  ui.list.dispatch("click", { target: clickTarget("https://example.org/a") });
  await settle();
  assert.equal(calls, 1);
  assert.match(ui.modalContent.innerHTML, /data-gf-detail-retry/);
  retry.dispatch("click");
  await settle();
  assert.equal(calls, 2);
  assert.match(ui.modalContent.innerHTML, /Nach Retry verfügbar/);
});

test("Detail-Retry respektiert Retry-After auch nach dem Schließen", async () => {
  let calls = 0;
  const api = loadAppWithFixtures({ fetch: async () => {
    calls += 1;
    return calls === 1
      ? new Response("{}", { status: 429, headers: { "Retry-After": "60" } })
      : detailResponse(api, { id: "https://example.org/a", name: "Nach Wartezeit" });
  } });
  const ui = bindModalRuntime(api);
  await api.selectGastroPoi(ui.state, "https://example.org/a");
  assert.equal(calls, 1);
  assert(ui.state.detail.retryAt > Date.now());
  await api.selectGastroPoi(ui.state, "https://example.org/a");
  assert.equal(calls, 1, "vor Retry-After kein zweiter Netzwerkabruf");
  api.closeGastroDetails(ui.state, ui.root);
  await api.selectGastroPoi(ui.state, "https://example.org/a");
  assert.equal(calls, 1, "auch Wiederöffnen umgeht die serverseitige Pause nicht");
  ui.state.detail.retryAt = Date.now() - 1;
  await api.selectGastroPoi(ui.state, "https://example.org/a");
  assert.equal(calls, 2);
  assert.equal(ui.state.details.get("https://example.org/a").name, "Nach Wartezeit");
});

test("DZT-Rohdaten sind JSON-LD mit Root, verbundenen Knoten und RDF-Termmetadaten", () => {
  const api = loadAppWithFixtures();
  const id = "https://example.org/gastro/raw";
  const rows = api.makeGastroRows({
    id,
    names: [{ value: "Café Français", lang: "fr" }, { value: "Café Berlin", lang: "de-AT" }],
    images: [{ url: "https://images.example/photo.jpg", sourceUrl: "https://gallery.example/photo/7", credit: "Foto-Team", licenseUrl: PHOTO_LICENSE }],
  });
  rows.push({
    id: { type: "uri", value: id },
    subject: { type: "uri", value: id },
    predicate: { type: "uri", value: "https://example.org/ontology/number" },
    object: { type: "literal", value: "7", datatype: "http://www.w3.org/2001/XMLSchema#integer" },
  });
  const poi = api.normalizeDztRows(rows, REGION, "detail").pois[0];
  assert.equal(poi.name, "Café Berlin");
  assert.ok(Array.isArray(poi.raw["@graph"]));
  const graph = poi.raw["@graph"];
  const root = graph.find((node) => node["@id"] === id);
  const addressRef = root["https://schema.org/address"][0]["@id"];
  assert.ok(graph.some((node) => node["@id"] === addressRef), "connected address node must be retained");
  assert.equal(root["https://example.org/ontology/number"][0]["@value"], "7");
  assert.equal(root["https://example.org/ontology/number"][0]["@type"], "http://www.w3.org/2001/XMLSchema#integer");
  assert.ok(root["https://schema.org/name"].some((value) => value["@language"] === "de-AT"));
});

test("Bildnachweise verwenden ausschließlich Foto-Rechte und zeigen die Datensatzlizenz separat", () => {
  const api = loadAppWithFixtures();
  const poi = api.normalizeDztRows(api.makeGastroRows({
    id: "https://example.org/gastro/rights",
    licenseUrl: CC0,
    images: [{
      url: "https://images.example/cafe.jpg",
      sourceUrl: "https://gallery.example/cafe/12",
      credit: "Fotografin Beispiel",
      licenseUrl: PHOTO_LICENSE,
    }],
  }), REGION, "detail").pois[0];
  const html = api.renderGastroHeroDetails(poi, "rights-test", "ready");
  assert.match(html, /Fotografin Beispiel/);
  assert.ok(html.includes(`href="${PHOTO_LICENSE}"`));
  assert.match(html, /https:\/\/gallery\.example\/cafe\/12/);
  assert.ok(html.includes(`href="${CC0}"`));
  assert.doesNotMatch(html, /Bild: DZT/);
  const card = api.renderGastroCard(poi, "rights-card");
  assert.match(card, /Fotografin Beispiel/);
  assert.match(card, /creativecommons\.org\/licenses\/by\/4\.0/);
});

test("Lightbox bleibt in der Modal-Fokusfalle, fängt Escape früh ab und erhält eigenen Fokuszyklus", () => {
  const opener = makeElement("button");
  const close = makeElement("button");
  const previous = makeElement("button");
  const next = makeElement("button");
  const lightbox = makeElement("div");
  lightbox.selectors.set(".gf-lightbox-close-btn", close);
  lightbox.selectors.set(".gf-lightbox-prev", previous);
  lightbox.selectors.set(".gf-lightbox-next", next);
  lightbox.selectors.set(".gf-lightbox-caption", makeElement("div"));
  lightbox.selectors.set(".gf-lightbox-img", makeElement("img"));
  lightbox.selectors.set(".gf-lightbox-counter", makeElement("div"));
  lightbox.selectors.set("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])[]", [close, previous, next]);
  const body = makeElement("body");
  body.appendChild = (el) => { el.parentNode = body; el.isConnected = true; body.children.push(el); };
  const modalRoot = makeElement("div");
  modalRoot.appendChild = (el) => { el.parentNode = modalRoot; el.isConnected = true; modalRoot.children.push(el); };
  opener.closest = (selector) => selector === ".modal" ? modalRoot : null;
  const listeners = new Map();
  const listenerOptions = new Map();
  const timers = [];
  const root = makeElement("main");
  const doc = {
    body,
    activeElement: opener,
    createElement: () => lightbox,
    getElementById: (id) => id === "gf-lightbox-overlay" ? lightbox : id === "main-content" ? root : null,
    querySelectorAll: () => [],
    addEventListener(type, handler, options) { listeners.set(type, handler); listenerOptions.set(type, options); },
    removeEventListener(type, handler, options) {
      if (listeners.get(type) === handler && listenerOptions.get(type) === options) {
        listeners.delete(type);
        listenerOptions.delete(type);
      }
    },
  };
  opener.ownerDocument = close.ownerDocument = previous.ownerDocument = next.ownerDocument = doc;
  const api = loadApp({ document: doc, setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {} });
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  state.runtime.active = true;
  root.gastroState = state;
  api.setupDetailModalListeners(modalRoot, state);
  modalRoot.dispatch("show.bs.modal");
  const photo = {
    name: "Café Lichtblick",
    images: [{ url: "https://images.example/cafe.jpg", credit: "Fotografin Beispiel", licenseUrl: PHOTO_LICENSE, sourceUrl: "https://gallery.example/cafe/12" }],
  };
  api.openLightbox(photo, 0, state, opener);
  assert.match(lightbox.innerHTML, /Fotografin Beispiel/);
  assert.match(lightbox.innerHTML, /creativecommons\.org\/licenses\/by\/4\.0/);
  assert.equal(lightbox.parentNode, modalRoot, "Lightbox muss innerhalb der Bootstrap-Modalwurzel liegen");
  assert.equal(doc.activeElement, close);

  close.dispatch("click");
  assert.equal(lightbox.isConnected, true, "ein MouseEvent darf nicht als sofortiges PageLeave interpretiert werden");
  assert.equal(state.runtime.lightbox, null);
  doc.activeElement = modalRoot; // Bootstrap aktiviert die Eltern-Fokusfalle nach der Fade-Transition.
  modalRoot.dispatch("shown.bs.modal");
  assert.equal(doc.activeElement, opener, "eine späte shown-Transition darf die Fokusrückgabe nicht überschreiben");
  timers.shift()();
  assert.equal(lightbox.isConnected, false);

  modalRoot.dispatch("show.bs.modal");
  api.openLightbox(photo, 0, state, opener);
  doc.activeElement = modalRoot;
  modalRoot.dispatch("shown.bs.modal");
  assert.equal(doc.activeElement, close, "auch während der Galerie darf die Eltern-Transition den Fokus nicht stehlen");
  assert.equal(listenerOptions.get("keydown"), true, "Tastaturbehandlung läuft in der Capture-Phase vor Bootstrap");
  let prevented = false;
  listeners.get("keydown")({ key: "Tab", shiftKey: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(doc.activeElement, next);

  let escapePrevented = false;
  let escapeStopped = false;
  listeners.get("keydown")({
    key: "Escape",
    preventDefault() { escapePrevented = true; },
    stopPropagation() { escapeStopped = true; },
  });
  assert.equal(escapePrevented, true);
  assert.equal(escapeStopped, true);
  assert.equal(doc.activeElement, opener);

  const parentShownHandlers = (modalRoot.listeners.get("shown.bs.modal") || []).length;
  const parentHiddenHandlers = (modalRoot.listeners.get("hidden.bs.modal") || []).length;
  for (let index = 0; index < 3; index += 1) {
    api.openLightbox(photo, 0, state, opener).close();
  }
  assert.equal((modalRoot.listeners.get("shown.bs.modal") || []).length, parentShownHandlers, "kein Anwachsen von Parent-Handlern im bereits sichtbaren Modal");
  assert.equal((modalRoot.listeners.get("hidden.bs.modal") || []).length, parentHiddenHandlers);
  api.openLightbox(photo, 0, state, opener);
  api.onPageLeave("beschreibung");
  assert.equal(state.runtime.lightbox, null);
  assert.equal(listeners.has("keydown"), false);
  assert.equal(lightbox.isConnected, false);
  assert.equal(doc.activeElement, opener);
});

test("Hero-Fotogalerie ist ein nativer Button und Detail-Link erreicht mindestens 44px", () => {
  const api = loadAppWithFixtures();
  const html = api.renderGastroHeroDetails({
    id: "https://example.org/a", name: "A",
    images: [{ url: "https://images.example/a.jpg", credit: "Test", licenseUrl: CC0 }],
  }, "kbd", "ready");
  assert.match(html, /<button[^>]+data-gf-hero-gallery/);
  assert.match(html, /type="button"/);
  const css = require("node:fs").readFileSync(require("node:path").join(__dirname, "../app/app.css"), "utf8");
  const detailLink = css.match(/\.gf-btn-detail-link\s*\{([^}]*)\}/);
  assert.ok(detailLink);
  assert.match(detailLink[1], /min-height:\s*44px/);
  assert.doesNotMatch(detailLink[1], /min-height:\s*auto/);
});

test("Gastro-Textsuche berücksichtigt Küchen und Deutsch-Varianten", () => {
  const api = loadAppWithFixtures();
  const state = poiState(api, api.makeGastroRows({ id: "https://example.org/a", cuisines: ["Sizilianisch"] }));
  state.filters.text = "sizilianisch";
  assert.equal(api.deriveGastroView(state).pois.length, 1);
  assert.equal(api.chooseLocalizedValue([
    { value: "English", lang: "en" },
    { value: "Österreichisch", lang: "de-AT" },
  ]), "Österreichisch");
  assert.equal(api.chooseLocalizedValue([{ value: "Schweizer Deutsch", lang: "de-CH" }]), "Schweizer Deutsch");
});

test("das App-Icon wird nur lokal unter /app/ relativ zu ../assets aufgelöst", () => {
  const api = loadApp();
  assert.equal(api.resolveGastroBrandAssetUrl("odas-app-icon.svg", { hostname: "localhost", pathname: "/app/" }), "../assets/odas-app-icon.svg");
  assert.equal(api.resolveGastroBrandAssetUrl("odas-app-icon.svg", { hostname: "127.0.0.1", pathname: "/app/index.html" }), "../assets/odas-app-icon.svg");
  assert.equal(api.resolveGastroBrandAssetUrl("odas-app-icon.svg", { hostname: "localhost", pathname: "/" }), "assets/odas-app-icon.svg");
  assert.equal(api.resolveGastroBrandAssetUrl("odas-app-icon.svg", { hostname: "odas.example", pathname: "/app/" }), "assets/odas-app-icon.svg");
});

test("fehlgeschlagenes Clipboard-Kopieren zeigt keinen Erfolg und lässt JSON manuell kopierbar", async () => {
  const dom = createModalDocument();
  const copyButton = makeElement("button");
  copyButton.textContent = "In Zwischenablage kopieren";
  const status = makeElement("p");
  dom.modalContent.selectors.set("#gf-copy-test-copy-raw-btn", copyButton);
  dom.modalContent.selectors.set("[data-gf-copy-status]", status);
  const api = loadApp({
    document: dom.document,
    navigator: { clipboard: { writeText: async () => { throw new Error("denied"); } } },
    window: { location: { hostname: "test.local", pathname: "/view/test/app/inst1/" }, bootstrap: { Modal: { getOrCreateInstance: () => ({ show() {} }) } } },
  });
  const state = api.createGastroState(validConfig.apiurls[0].url, REGION);
  state.runtime.active = true;
  state.runtime.uid = "copy-test";
  state.byId.set("https://example.org/a", { id: "https://example.org/a", name: "A", raw: { "@graph": [{ "@id": "https://example.org/a" }] } });
  state.selectedId = "https://example.org/a";
  api.openDetailModal(state, "https://example.org/a");
  copyButton.dispatch("click");
  await settle();
  assert.notEqual(copyButton.textContent, "Kopiert! ✓");
  assert.match(status.textContent, /manuell kopieren|nicht möglich/i);
  assert.match(dom.modalContent.innerHTML, /@graph/);
});
