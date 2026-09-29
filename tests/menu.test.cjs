const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("ensureGlobalOffcanvasSetup moves offcanvas to document.body and sets up toggling", () => {
  const code = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
  assert.match(code, /function ensureGlobalOffcanvasSetup\s*\(/);
  assert.match(code, /document\.body\.appendChild\(offcanvasNav\)/);
  assert.match(code, /function ensureQrNavMenuItem\s*\(/);
  assert.match(code, /initGlobalMenu/);
});

test("app.css includes styling for #offcanvasNavbar.offcanvas", () => {
  const css = fs.readFileSync(path.join(__dirname, "../app/app.css"), "utf8");
  assert.match(css, /#offcanvasNavbar\.offcanvas/);
  assert.match(css, /z-index:\s*1065/);
});
