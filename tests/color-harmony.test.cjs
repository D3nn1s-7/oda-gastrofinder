const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appJsPath = path.join(__dirname, "..", "app", "app.js");
const appCssPath = path.join(__dirname, "..", "app", "app.css");

test("Color Harmony: detail modal uses gourmet palette without red accents", () => {
  const code = fs.readFileSync(appJsPath, "utf8");
  const fnMatch = code.match(/function renderGastroHeroDetails\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "renderGastroHeroDetails must be defined");
  const fnBody = fnMatch[0];

  // No red Bootstrap danger classes or hardcoded red/magenta colors
  assert.ok(!fnBody.includes("text-danger"), "renderGastroHeroDetails must not use text-danger");
  assert.ok(!fnBody.includes("btn-danger"), "renderGastroHeroDetails must not use btn-danger");
  assert.ok(!fnBody.includes("btn-outline-danger"), "renderGastroHeroDetails must not use btn-outline-danger");
  assert.ok(!fnBody.includes("#b91c1c"), "renderGastroHeroDetails must not hardcode red #b91c1c");
  assert.ok(!fnBody.includes("#c026d3"), "renderGastroHeroDetails must not hardcode magenta #c026d3");

  // Must use forest green for Restaurant and copper for Cafe
  assert.ok(
    fnBody.includes("gf-badge-restaurant") || fnBody.includes("var(--gf-forest)"),
    "Restaurant badge must use forest green palette"
  );
  assert.ok(
    fnBody.includes("gf-badge-cafe") || fnBody.includes("var(--gf-copper)"),
    "Cafe badge must use copper palette"
  );

  // Must use gourmet forest action button
  assert.ok(
    fnBody.includes("gf-btn-forest") || fnBody.includes("btn-forest"),
    "Primary button must use gourmet forest styling"
  );
});

test("Color Harmony: QR modal copy button uses gourmet forest styling", () => {
  const code = fs.readFileSync(appJsPath, "utf8");
  const qrMatch = code.match(/(?:async\s+)?function openQrModal\([\s\S]*?\n\}/);
  assert.ok(qrMatch, "openQrModal must be defined");
  const qrBody = qrMatch[0];

  assert.ok(!qrBody.includes("btn-danger"), "QR copy button must not use btn-danger");
  assert.ok(
    qrBody.includes("gf-btn-forest") || qrBody.includes("btn-forest"),
    "QR copy button must use gourmet forest styling"
  );
});

test("Color Harmony: app.css contains no orange focus #e65100 and defines gourmet classes", () => {
  const css = fs.readFileSync(appCssPath, "utf8");
  assert.ok(!css.includes("#e65100"), "app.css must not use #e65100");
  assert.ok(css.includes(".gf-badge-restaurant"), "app.css must define .gf-badge-restaurant");
  assert.ok(css.includes(".gf-badge-cafe"), "app.css must define .gf-badge-cafe");
  assert.ok(css.includes(".gf-btn-forest"), "app.css must define .gf-btn-forest");
  assert.ok(css.includes(".gf-btn-outline-forest"), "app.css must define .gf-btn-outline-forest");
});

test("Color Harmony: catalog view uses gourmet palette without Bootstrap blue or slate outliers", () => {
  const jsCode = fs.readFileSync(appJsPath, "utf8");
  const fnMatch = jsCode.match(/function renderGastroCatalogCard\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "renderGastroCatalogCard must be defined");
  const fnBody = fnMatch[0];

  assert.ok(!fnBody.includes("btn-outline-primary"), "Catalog card must not use btn-outline-primary");
  assert.ok(!fnBody.includes("btn-primary"), "Catalog card must not use btn-primary");
  assert.ok(fnBody.includes("gf-btn-outline-forest"), "Catalog card map action must use gf-btn-outline-forest");
  assert.ok(fnBody.includes("gf-btn-forest"), "Catalog card detail action must use gf-btn-forest");

  const css = fs.readFileSync(appCssPath, "utf8");
  const catalogCardSection = css.match(/\.gf-catalog-card\s*\{[\s\S]*?\}/);
  assert.ok(catalogCardSection, ".gf-catalog-card CSS rule must exist");
  assert.ok(!catalogCardSection[0].includes("#e2e8f0"), ".gf-catalog-card must not use #e2e8f0");
  assert.ok(catalogCardSection[0].includes("var(--gf-line)"), ".gf-catalog-card must use var(--gf-line)");

  const catalogBadgeSection = css.match(/\.gf-catalog-dist-badge\s*\{[\s\S]*?\}/);
  assert.ok(catalogBadgeSection, ".gf-catalog-dist-badge CSS rule must exist");
  assert.ok(!catalogBadgeSection[0].includes("rgba(15, 23, 42"), ".gf-catalog-dist-badge must not use slate rgba(15, 23, 42)");
});
