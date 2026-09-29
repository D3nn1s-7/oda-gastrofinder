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
      contains: (c) => classList.has(c)
    },
    attributes,
    setAttribute: (k, v) => { attributes[k] = String(v); },
    getAttribute: (k) => attributes[k] || null,
    style: {
      removeProperty: () => {}
    },
    innerHTML: "",
    remove: () => {},
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

function loadGastroScope(extraGlobals = {}) {
  const code = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
  const body = createMockElement("body");
  const mainContent = createMockElement("div");
  mainContent.id = "main-content";

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    window: {
      location: { hostname: "test.local", pathname: "/view/test/app/inst1/" },
      bootstrap: {
        Modal: {
          getInstance: () => ({ hide: () => {} })
        }
      }
    },
    document: {
      addEventListener: () => {},
      getElementById: (id) => (id === "main-content" ? mainContent : null),
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: (t) => createMockElement(t),
      body
    },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    configData: {
      beschreibung: "Informationen zur Gastronomie-Methodik.",
      kontakt: "Kontakt: team@example.org",
      datenschutz: "Datenschutzhinweise.",
      impressum: "Impressumsangaben."
    },
    ...extraGlobals
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { sandbox, body, mainContent };
}

test("renderPageOverride returns null for startseite and formatted card for secondary pages", () => {
  const { sandbox } = loadGastroScope();
  assert.strictEqual(sandbox.renderPageOverride("startseite"), null, "startseite must return null");

  for (const page of ["beschreibung", "kontakt", "datenschutz", "impressum"]) {
    const html = sandbox.renderPageOverride(page);
    assert.ok(html !== null, `${page} must return rendered HTML`);
    assert.ok(html.includes("gf-secondary-wrapper"), `${page} must contain secondary wrapper`);
    assert.ok(html.includes("#startseite"), `${page} must link back to #startseite`);
    assert.ok(html.includes("Zurück zur Karte"), `${page} must have 'Zurück zur Karte' text`);
  }

  assert.strictEqual(sandbox.renderPageOverride("unbekannt"), null, "Unknown page must return null");
});

test("onPageLeave cleans up full-screen classes, modals and backdrops", () => {
  const { sandbox, body, mainContent } = loadGastroScope();
  body.classList.add("gf-app-fullscreen");
  body.classList.add("modal-open");

  let disposed = false;
  mainContent.gastroState = {
    runtime: {
      active: true,
      map: { remove: () => {} },
      events: { abort: () => {} }
    }
  };
  // Wrap disposeGastroRuntime to verify it gets called
  const origDispose = sandbox.disposeGastroRuntime;
  sandbox.disposeGastroRuntime = (st) => {
    disposed = true;
    if (origDispose) origDispose(st);
  };

  sandbox.onPageLeave("beschreibung");

  assert.ok(!body.classList.contains("gf-app-fullscreen"), "Must remove gf-app-fullscreen from body");
  assert.ok(!body.classList.contains("modal-open"), "Must remove modal-open from body");
  assert.strictEqual(disposed, true, "Must call disposeGastroRuntime when leaving startseite");
});
