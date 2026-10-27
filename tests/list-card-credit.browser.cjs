// Opt-in Browserregression (vorhandene Playwright-Installation, Google Chrome):
//   PLAYWRIGHT_MODULE=/pfad/zu/playwright node --test tests/list-card-credit.browser.cjs
// Prüft in der Ergebnisliste, dass Bildnachweise das kleine Vorschaubild nicht verdecken
// und vollständig im Kartenrahmen bleiben. Alle Anfragen kommen aus dem Repository bzw.
// synthetischen Fixtures; kein Netzwerk- oder DZT-Zugriff.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const root = path.resolve(__dirname, "..");
const ORIGIN = "http://127.0.0.1:4174";
const fixtures = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "fixtures.js"), "utf8"), fixtures);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const LONG_CREDIT = "visitspandau, Claudia Schwaier, Lizenz: Wirtschaftsförderung Spandau";

async function serveRepository(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.fulfill({ status: 204, body: "" });
    if (url.pathname.endsWith("/dzt")) {
      const query = new URLSearchParams((url.searchParams.get("path") || "").split("?")[1] || "").get("query") || "";
      const firstPage = !/FILTER\(STR\(\?id\) >/.test(query);
      const bindings = firstPage ? fixtures.makeGastroPage(0, 12, {
        images: [{ url: `${ORIGIN}/tests/fixtures/photo.svg`, credit: LONG_CREDIT, licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://example.org/quelle" }],
      }) : [];
      return route.fulfill({ status: 200, contentType: "application/sparql-results+json", body: JSON.stringify({ results: { bindings } }) });
    }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!file.startsWith(root) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: types[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
  });
}

for (const [width, height, mobile] of [[1440, 900, false], [390, 844, true], [320, 700, true]]) {
  test(`Ergebnisliste ${width}px: Bildnachweis verdeckt das Vorschaubild nicht`, async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await serveRepository(page);
      await page.goto(`${ORIGIN}/app/#startseite`);
      const state = "document.querySelector('#main-content').gastroState";
      await page.waitForFunction(`${state}&&${state}.byId.size===12&&!${state}.page.busy`, null, { timeout: 30000 });
      if (mobile) {
        await page.locator("[data-gf-bottom-switcher]").tap();
        await page.waitForFunction(`${state}.runtime.mobileView==='list'`);
      }
      await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime)).map((a) => a.finished.catch(() => {})));
      });
      const result = await page.evaluate(() => {
        const card = document.querySelector("[data-gf-card]");
        card.scrollIntoView({ block: "center", behavior: "instant" });
        const img = card.querySelector(".gf-card-thumb-img").getBoundingClientRect();
        const credit = card.querySelector(".gf-card-photo-credit");
        const c = credit.getBoundingClientRect();
        const k = card.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(img.right, c.right) - Math.max(img.left, c.left)) * Math.max(0, Math.min(img.bottom, c.bottom) - Math.max(img.top, c.top));
        const points = [[.25, .25], [.5, .5], [.75, .75], [.5, .9]].map(([fx, fy]) => {
          const hit = document.elementFromPoint(img.left + img.width * fx, img.top + img.height * fy);
          return hit && hit.classList.contains("gf-card-thumb-img") ? "Bild" : (hit ? hit.className || hit.tagName : "nichts");
        });
        return { overlap, points, inside: c.left >= k.left - 1 && c.right <= k.right + 1 && c.bottom <= k.bottom + 1, text: credit.innerText, scrollWidth: document.documentElement.scrollWidth };
      });
      assert.equal(result.overlap, 0, JSON.stringify(result));
      assert.deepEqual(result.points, ["Bild", "Bild", "Bild", "Bild"], JSON.stringify(result));
      assert.ok(result.inside, `Nachweis ragt aus der Karte: ${JSON.stringify(result)}`);
      assert.match(result.text, /visitspandau/);
      assert.equal(result.scrollWidth, width);
    } finally {
      await browser.close();
    }
  });
}
