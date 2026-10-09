const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appJsPath = path.join(__dirname, "..", "app", "app.js");
const appCssPath = path.join(__dirname, "..", "app", "app.css");

test("Loading Overlay: renderGastroShell includes glassmorphic loading overlay", () => {
  const code = fs.readFileSync(appJsPath, "utf8");
  const shellMatch = code.match(/function renderGastroShell\([\s\S]*?\n\}/);
  assert.ok(shellMatch, "renderGastroShell must be defined");
  const shellBody = shellMatch[0];

  assert.ok(
    shellBody.includes("gf-loading-overlay"),
    "renderGastroShell must include .gf-loading-overlay"
  );
  assert.ok(
    shellBody.includes("gf-loading-card"),
    "renderGastroShell must include .gf-loading-card"
  );
  assert.ok(
    shellBody.includes("gf-loading-spinner-ring"),
    "renderGastroShell must include .gf-loading-spinner-ring"
  );
  assert.ok(
    shellBody.includes('resolveGastroBrandAssetUrl("odas-app-icon.svg")'),
    "loading overlay must show Gourmet app icon"
  );
});

test("Loading Overlay: hideGastroLoadingOverlay function exists and adds gf-fade-out", () => {
  const code = fs.readFileSync(appJsPath, "utf8");
  assert.ok(
    code.includes("function hideGastroLoadingOverlay"),
    "hideGastroLoadingOverlay function must be defined"
  );
  assert.ok(
    code.includes("gf-fade-out"),
    "hideGastroLoadingOverlay must add gf-fade-out class"
  );
});

test("Loading Skeleton: renderGastroLoadingSkeleton produces skeleton cards when busy", () => {
  const code = fs.readFileSync(appJsPath, "utf8");
  assert.ok(
    code.includes("function renderGastroLoadingSkeleton"),
    "renderGastroLoadingSkeleton must be defined"
  );
  assert.ok(
    code.includes("gf-skeleton-list") && code.includes("gf-skeleton-card"),
    "skeleton markup must define gf-skeleton-list and gf-skeleton-card"
  );
});

test("Loading CSS: app.css defines overlay, spinner ring, and skeleton shimmer animations", () => {
  const css = fs.readFileSync(appCssPath, "utf8");
  assert.ok(css.includes(".gf-loading-overlay"), "app.css must define .gf-loading-overlay");
  assert.ok(css.includes(".gf-loading-spinner-ring"), "app.css must define .gf-loading-spinner-ring");
  assert.ok(css.includes("@keyframes gfSpin"), "app.css must define @keyframes gfSpin");
  assert.ok(css.includes(".gf-skeleton-card"), "app.css must define .gf-skeleton-card");
  assert.ok(css.includes("@keyframes gfShimmer"), "app.css must define @keyframes gfShimmer");
});
