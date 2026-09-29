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
