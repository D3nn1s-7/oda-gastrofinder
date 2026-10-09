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

function pngOrientation(relative) {
  const bytes = fs.readFileSync(path.join(root, relative));
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")), `${relative} must have a PNG signature`);
  assert.equal(bytes.readUInt32BE(8), 13, `${relative} must have a 13-byte IHDR chunk`);
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR", `${relative} must start with an IHDR chunk`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.ok(width > 0 && height > 0, `${relative} must have positive dimensions`);
  return width > height ? "landscape" : height > width ? "portrait" : "square";
}

test("Beschreibungen und Quellenkonfiguration bleiben identisch", () => {
  assert.deepEqual(pkg.beschreibung, pkg["instanz-config"].beschreibung.default);
  assert.equal(pkg.beschreibung[0], "_multiline_");
  assert.deepEqual(Object.keys(cfg).sort(), Object.keys(pkg["instanz-config"]).sort());
  assert.deepEqual(pkg["odas-services"], ["tourismus-odg"]);
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
  assert.match(text, /appinstanz\.apiurls\.1/);
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
  assert.match(pkg["app-version"], /^\d+\.\d+\.\d+$/);
  const expectedScreenshots = [
    "assets/Desktop_Screenshot.png",
    "assets/Desktop_Screenshot_2.png",
    "assets/Desktop_Screenshot_3.png",
    "assets/Mobile_Screenshot.png",
    "assets/Mobile_Screenshot_2.png",
    "assets/Mobile_Screenshot_3.png",
  ];
  assert.deepEqual(pkg.screenshots, expectedScreenshots);
  assert.equal(new Set(pkg.screenshots).size, 6, "six screenshot references must be distinct");
  const orientations = pkg.screenshots.map(pngOrientation);
  assert.equal(orientations.filter((orientation) => orientation === "landscape").length, 3, "need three landscape PNGs");
  assert.equal(orientations.filter((orientation) => orientation === "portrait").length, 3, "need three portrait PNGs");
  assert.equal(orientations.filter((orientation) => orientation === "square").length, 0, "screenshots cannot be square");
  for (const asset of [...pkg.screenshots, pkg["odas-app-icon"], pkg["app-icon"], pkg.daten.schema]) exists(asset);
  assert.equal(schema.primaryKey, "id");
  assert.deepEqual(schema.fields.map((field) => field.name), [
    "id", "types", "name", "address", "lat", "lng", "distanceKm", "cuisines",
    "images", "dataLicense", "description", "openingHours", "websites", "telephones", "raw",
  ]);
  assert.match(fs.readFileSync(path.join(root, "README.md"), "utf8"), /\/dzt/);
  assert.match(fs.readFileSync(path.join(root, "README.md"), "utf8"), /nicht.*veröffentlicht|Repository/i);
  assert.match(fs.readFileSync(path.join(root, "app/vendor/THIRD-PARTY.md"), "utf8"), /CC BY 4\.0|OFL/);
});

test("Changelog und lokale Konfiguration nennen die aktuelle Version", () => {
  const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const latestEntry = changelog.match(/^## (\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})/m);
  assert.ok(latestEntry, "Changelog must start with a dated semantic-version entry");
  assert.equal(latestEntry[1], pkg["app-version"]);
  assert.equal(cfg.titel, "Gastrofinder");
  assert.equal(cfg.seitentitel, "Gastrofinder");
  assert.equal(cfg.ort, "Berlin");
  assert.equal(cfg.apiurls[0].name, "dztsparql");
});
