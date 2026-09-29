const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("assets/odas-app-icon.svg is valid SVG with warm gourmet gradient and cloche/cutlery shapes", () => {
  const svg = fs.readFileSync(path.join(__dirname, "../assets/odas-app-icon.svg"), "utf8");
  assert.match(svg, /<svg[^>]+viewBox="0 0 512 512"/);
  assert.match(svg, /rx="108"/);
  assert.match(svg, /#193629|#28543d/); // warm forest green
  assert.match(svg, /#a66b32|#d59b2d|#fdf8ed/); // gold/copper/ivory
});

test("renderGastroShell renders assets/odas-app-icon.svg in cockpit header and brandbar", () => {
  const code = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
  assert.match(code, /assets\/odas-app-icon\.svg/);
  assert.match(code, /gf-cockpit-logo/);
});

test("app.css styles .gf-cockpit-logo with appropriate dimensions and rounded corners", () => {
  const css = fs.readFileSync(path.join(__dirname, "../app/app.css"), "utf8");
  assert.match(css, /\.gf-cockpit-logo/);
});
