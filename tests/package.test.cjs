const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "app-package.json"), "utf8"));
const cfg = JSON.parse(fs.readFileSync(path.join(root, "odas-config/config.json"), "utf8"));
const schema = JSON.parse(fs.readFileSync(path.join(root, "assets/schema.json"), "utf8"));

function exists(relative) {
  assert.equal(fs.existsSync(path.join(root, relative)), true, `missing ${relative}`);
}

test("Beschreibungen und Quellenkonfiguration bleiben identisch", () => {
  assert.deepEqual(pkg.beschreibung, pkg["instanz-config"].beschreibung.default);
  assert.equal(pkg.beschreibung[0], "_multiline_");
  assert.deepEqual(Object.keys(cfg).sort(), Object.keys(pkg["instanz-config"]).sort());
  assert.deepEqual(pkg["odas-services"], ["tourismus-deutschland"]);
  assert.equal(pkg["instanz-config"].ort.default, "");
  assert.equal(pkg["instanz-config"].radiusKm.default, "25");
});

test("die Paketbeschreibung ist Gastrofinder-spezifisch und vollständig gegliedert", () => {
  const text = pkg.beschreibung.join("\n");
  assert.match(text, /Gastrofinder/);
  assert.match(text, /## Methodik/);
  assert.match(text, /## Datenquelle/);
  assert.match(text, /## Open Data App/);
  assert.match(text, /https:\/\/open-data-germany\.org\//);
  assert.match(text, /https:\/\/proxy\.opendatagermany\.io\/api\/ts\/v1\/kg\/sparql/);
  assert.doesNotMatch(text, /Generic Open Data App|Technische ODAS-Vorlage|Platzhalter/);
});

test("die Instanzkonfiguration enthält genau die vier Geo-Felder ohne Altschlüssel", () => {
  const fields = pkg["instanz-config"];
  assert.deepEqual(Object.keys(fields).sort(), [
    "apiurls", "beschreibung", "brandingCSS", "brandingCSSFile", "datenschutz",
    "fusszeile", "icon", "impressum", "kontakt", "latitude", "longitude",
    "ort", "radiusKm", "seitentitel", "titel", "urlDaten",
  ]);
  assert.equal("proxyAktiv" in fields, false);
  assert.equal("proxyAktiv" in cfg, false);
  for (const key of ["ort", "radiusKm", "latitude", "longitude"]) {
    assert.equal(fields[key].category, "sonstiges");
  }
  assert.deepEqual(fields.radiusKm.format.optionen, ["5", "10", "25", "50", "100"]);
  assert.equal(typeof fields.latitude.default, "string");
  assert.equal(typeof fields.longitude.default, "string");
});

test("Schema, Screenshots, Icon und Lizenzhinweise sind lieferbar", () => {
  assert.equal(pkg["app-package-version"], "2");
  assert.equal(pkg["api-version"], "1");
  assert.equal(pkg["app-version"], "1.2.1");
  assert.deepEqual(pkg.screenshots, ["assets/Desktop_Screenshot.png", "assets/Mobile_Screenshot.png"]);
  for (const asset of [...pkg.screenshots, pkg["odas-app-icon"], pkg["app-icon"], pkg.daten.schema]) exists(asset);
  assert.equal(schema.primaryKey, "id");
  assert.deepEqual(schema.fields.map((field) => field.name), [
    "id", "types", "name", "address", "lat", "lng", "distanceKm", "cuisines",
    "images", "dataLicense", "description", "openingHours", "websites", "telephones",
  ]);
  assert.match(fs.readFileSync(path.join(root, "README.md"), "utf8"), /\/dzt/);
  assert.match(fs.readFileSync(path.join(root, "README.md"), "utf8"), /nicht.*veröffentlicht|Repository/i);
  assert.match(fs.readFileSync(path.join(root, "app/vendor/THIRD-PARTY.md"), "utf8"), /CC BY 4\.0|OFL/);
});

test("Changelog und lokale Konfiguration nennen die aktuelle Version", () => {
  const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /^## 1\.2\.1 - \d{4}-\d{2}-\d{2}/m);
  assert.equal(pkg["app-version"], "1.2.1");
  assert.equal(cfg.titel, "Gastrofinder");
  assert.equal(cfg.seitentitel, "Gastrofinder");
  assert.equal(cfg.ort, "Berlin");
  assert.equal(cfg.apiurls[0].name, "dztsparql");
});
