const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadApp } = require("./helpers.cjs");

test("assets/odas-app-icon.svg is valid SVG with warm gourmet gradient and cloche/cutlery shapes", () => {
  const svg = fs.readFileSync(path.join(__dirname, "../assets/odas-app-icon.svg"), "utf8");
  assert.match(svg, /<svg[^>]+viewBox="0 0 512 512"/);
  assert.match(svg, /rx="108"/);
  assert.match(svg, /#193629|#28543d/); // warm forest green
  assert.match(svg, /#a66b32|#d59b2d|#fdf8ed/); // gold/copper/ivory
});

test("renderGastroShell resolves the app icon for local and ODAS app roots", () => {
  const code = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
  assert.match(code, /resolveGastroBrandAssetUrl/);
  assert.match(code, /gf-cockpit-logo/);
  const api = loadApp();
  assert.equal(api.resolveGastroBrandAssetUrl("odas-app-icon.svg", { hostname: "localhost", pathname: "/app/" }), "../assets/odas-app-icon.svg");
  assert.equal(api.resolveGastroBrandAssetUrl("odas-app-icon.svg", { hostname: "odas.example", pathname: "/view/abc/" }), "assets/odas-app-icon.svg");
});

test("app.css styles .gf-cockpit-logo with appropriate dimensions and rounded corners", () => {
  const css = fs.readFileSync(path.join(__dirname, "../app/app.css"), "utf8");
  assert.match(css, /\.gf-cockpit-logo/);
});
