const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("initGastroMap registers HomeControl as native Leaflet Control in bottomright", () => {
  const code = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
  assert.match(code, /L\.Control\.extend\(/);
  assert.match(code, /position:\s*["']bottomright["']/);
  assert.match(code, /gf-map-home-btn|gf-home-control-bar/);
});

test("app.css positions .gf-legend centered at bottom without right-edge collision", () => {
  const css = fs.readFileSync(path.join(__dirname, "../app/app.css"), "utf8");
  assert.match(css, /\.gf-legend\s*\{[^}]*left:\s*50%/);
  assert.match(css, /transform:\s*translateX\(-50%\)/);
});

test("updateGastroMarkers binds interactive preview popup with thumbnail and details action", () => {
  const code = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
  const fnMatch = code.match(/function updateGastroMarkers\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "updateGastroMarkers must be defined");
  const fnBody = fnMatch[0];

  assert.ok(fnBody.includes("bindPopup"), "updateGastroMarkers must bind popup to markers");
  assert.ok(fnBody.includes("gf-map-popup"), "Popup must use gf-map-popup container");
  assert.ok(fnBody.includes("Details ansehen"), "Popup must include 'Details ansehen' button");
  assert.ok(fnBody.includes("gf-btn-forest"), "Popup button must use gf-btn-forest class");
});

test("app.css styles .gf-leaflet-popup with gourmet design tokens", () => {
  const css = fs.readFileSync(path.join(__dirname, "../app/app.css"), "utf8");
  assert.ok(css.includes(".gf-leaflet-popup"), "app.css must define .gf-leaflet-popup");
  assert.match(css, /\.gf-leaflet-popup[^{]*\{[^}]*var\(--gf-surface\)/);
});
