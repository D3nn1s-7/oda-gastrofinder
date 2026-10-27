const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.cjs");

// Läuft gegen die ausgelieferte app/app.js. Das Datum ist fest, damit das
// Ausblenden abgelaufener Zeiträume reproduzierbar bleibt.
function fixedDate(iso) {
  const now = new Date(iso).getTime();
  return class FixedDate extends Date {
    constructor(...args) {
      if (args.length) super(...args);
      else super(now);
    }
    static now() {
      return now;
    }
  };
}

const day = (name) => `https://schema.org/${name}`;
const loadAt = (iso = "2026-10-27T12:00:00+01:00") => loadApp({ Date: fixedDate(iso) });

test("alle sieben Tage werden als täglich, Zeiten als HH:MM und Mitternacht als 24:00 gezeigt", () => {
  const html = loadAt().renderGastroHours([{
    days: ["Friday", "Monday", "Saturday", "Sunday", "Thursday", "Tuesday", "Wednesday"].map(day),
    opens: "10:00:00",
    closes: "00:00:00",
    validFrom: "2026-01-01T10:00:00+01:00",
    validThrough: "2026-12-31T00:00:00+01:00",
  }]);
  assert.match(html, /<strong>Täglich<\/strong>: 10:00–24:00 · gültig 01\.01\.2026–31\.12\.2026/);
  assert.doesNotMatch(html, /Folgetag/);
  assert.doesNotMatch(html, /\d{2}:\d{2}:\d{2}/);
  assert.doesNotMatch(html, /T10:00/);
});

test("Wochentage stehen in der Reihenfolge Montag bis Sonntag, Folgen werden zusammengefasst", () => {
  const html = loadAt().renderGastroHours([{
    days: ["Wednesday", "Friday", "Monday", "Tuesday", "PublicHolidays"].map(day),
    opens: "9:00",
    closes: "17:30",
  }]);
  assert.match(html, /<strong>Montag–Mittwoch, Freitag, Feiertage<\/strong>: 09:00–17:30/);
});

test("zwei aufeinanderfolgende Tage bleiben einzeln genannt", () => {
  const html = loadAt().renderGastroHours([{ days: ["Sunday", "Saturday"].map(day), opens: "11:00", closes: "15:00" }]);
  assert.match(html, /<strong>Samstag, Sonntag<\/strong>: 11:00–15:00/);
});

test("abgelaufene Zeiträume werden ausgeblendet, gültige nach Beginn sortiert", () => {
  const html = loadAt().renderGastroHours([
    { days: [day("Monday")], opens: "10:00", closes: "18:00", validFrom: "2027-01-01T00:00:00+01:00", validThrough: "2027-12-31T00:00:00+01:00" },
    { days: [day("Monday")], opens: "09:00", closes: "17:00", validFrom: "2025-01-01T00:00:00+01:00", validThrough: "2025-12-31T00:00:00+01:00" },
    { days: [day("Monday")], opens: "11:00", closes: "19:00", validFrom: "2026-01-01T00:00:00+01:00", validThrough: "2026-12-31T00:00:00+01:00" },
  ]);
  assert.doesNotMatch(html, /2025/);
  assert.doesNotMatch(html, /09:00–17:00/);
  const current = html.indexOf("gültig 01.01.2026–31.12.2026");
  const future = html.indexOf("gültig 01.01.2027–31.12.2027");
  assert.ok(current > -1 && future > current, html);
});

test("ein heute endender Zeitraum gilt noch; einseitige Zeiträume werden verständlich benannt", () => {
  const html = loadAt().renderGastroHours([
    { days: [day("Tuesday")], opens: "08:00", closes: "12:00", validThrough: "2026-10-27" },
    { days: [day("Wednesday")], opens: "08:00", closes: "12:00", validFrom: "2026-11-01" },
  ]);
  assert.match(html, /<strong>Dienstag<\/strong>: 08:00–12:00 · gültig bis 27\.10\.2026/);
  assert.match(html, /<strong>Mittwoch<\/strong>: 08:00–12:00 · gültig ab 01\.11\.2026/);
});

test("nur abgelaufene Angaben werden nicht als aktuelle Öffnungszeiten gezeigt", () => {
  const html = loadAt().renderGastroHours([
    { days: [day("Monday")], opens: "10:00", closes: "18:00", validThrough: "2025-12-31T00:00:00+01:00" },
  ]);
  assert.equal(html, "Keine aktuell gültigen Öffnungszeiten angegeben");
});

test("echte Zeiten über Mitternacht bleiben als Folgetag erkennbar, fremde Werte bleiben Text", () => {
  const html = loadAt().renderGastroHours([
    { days: [day("Friday")], opens: "22:00:00", closes: "02:00:00" },
    { days: ["<img src=x onerror=alert(1)>"], opens: "", closes: "" },
  ]);
  assert.match(html, /<strong>Freitag<\/strong>: 22:00–02:00 bis zum Folgetag/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /nicht angegeben \/ nicht angegeben/);
});
