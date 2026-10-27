// Opt-in Browserregression (vorhandene Playwright-Installation, Google Chrome):
//   PLAYWRIGHT_MODULE=/pfad/zu/playwright node --test tests/mobile-list-footer.browser.cjs
// Prüft in der mobilen Ergebnisliste, dass die schwebende Schaltfläche „Karte ansehen“
// die Schaltflächen „Mehr anzeigen“ und „Weitere Daten laden“ nicht verdeckt und dass
// ein Tippen auf „Mehr anzeigen“ weitere Orte zeigt, statt zur Karte zu wechseln.
// Alle Anfragen werden aus dem Repository bzw. synthetischen Fixtures bedient; es gibt
// keinen Netzwerk- oder DZT-Zugriff.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const root = path.resolve(__dirname, "..");
const ORIGIN = "http://127.0.0.1:4173";
const fixtures = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "fixtures.js"), "utf8"), fixtures);

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

async function serveRepository(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.fulfill({ status: 204, body: "" });
    if (url.pathname.endsWith("/dzt")) {
      const query = new URLSearchParams((url.searchParams.get("path") || "").split("?")[1] || "").get("query") || "";
      const firstPage = !/FILTER\(STR\(\?id\) >/.test(query);
      const bindings = firstPage ? fixtures.makeGastroPage(0, 200, {}) : [];
      return route.fulfill({ status: 200, contentType: "application/sparql-results+json", body: JSON.stringify({ results: { bindings } }) });
    }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!file.startsWith(root) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: types[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
  });
}

for (const [width, height] of [[390, 844], [320, 700]]) {
  test(`mobile Liste ${width}px: Listenfuß bleibt neben „Karte ansehen“ bedienbar`, async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await serveRepository(page);
      await page.goto(`${ORIGIN}/app/#startseite`);
      const state = "document.querySelector('#main-content').gastroState";
      await page.waitForFunction(`${state}&&${state}.byId.size===200&&!${state}.page.busy`, null, { timeout: 30000 });
      await page.locator("[data-gf-bottom-switcher]").tap();
      await page.waitForFunction(`${state}.runtime.mobileView==='list'`);
      await page.evaluate(() => {
        const scroll = document.querySelector("[data-gf='results-scroll']");
        scroll.scrollTop = scroll.scrollHeight;
      });
      // Bis zum Ende der echten Übergänge der Liste warten (keine Animation abkürzen).
      await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime)).map((a) => a.finished.catch(() => {})));
      });

      for (const selector of ["[data-gf-show-more]", "[data-gf-load-next]"]) {
        const hits = await page.evaluate((sel) => {
          const element = document.querySelector(sel);
          const box = element.getBoundingClientRect();
          return [box.left + 4, box.left + box.width / 2, box.right - 4].map((x) => {
            const hit = document.elementFromPoint(x, box.top + box.height / 2);
            if (element.contains(hit)) return "frei";
            return hit && hit.closest("[data-gf-bottom-switcher]") ? "verdeckt durch Karte ansehen" : `verdeckt durch ${hit ? hit.tagName : "nichts"}`;
          });
        }, selector);
        assert.deepEqual(hits, ["frei", "frei", "frei"], `${selector} bei ${width}px`);
      }

      const before = await page.evaluate(`${state}.visible.list`);
      await page.locator("[data-gf-show-more]").tap();
      await page.waitForFunction(`${state}.visible.list>${before}`, null, { timeout: 5000 });
      assert.equal(await page.evaluate(`${state}.runtime.mobileView`), "list");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    } finally {
      await browser.close();
    }
  });
}
