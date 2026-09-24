# Browser-Prüfungen für den Gastrofinder

Diese Datei dokumentiert die gezielten, lokalen Browserfälle. Die DZT-Antworten werden ausschließlich durch `browser-fixtures.js` ersetzt; einFixture ist kein Live-Nachweis.

## Start

1. Vom Projektordner `oda-gastrofinder/` aus einen statischen Server auf einem freien localhost-Port starten.
2. `http://127.0.0.1:<port>/app/` öffnen.
3. `tests/fixtures.js` und danach `tests/browser-fixtures.js` als lokale Testskripte laden.
4. `await installGastroFixture("success")` ausführen.

Der Initialaufruf von `/app/dzt` liefert lokal ohne Relay einen erwarteten 404. Nach der Fixture-Installation werden ausschließlich die Relay-Anfragen durch synthetische SPARQL-Bindings beantwortet. OSM-Kacheln dürfen separat geladen werden.

## Szenarien

| Modus | Erwartung |
|---|---|
| `success` | Karte, Liste, Typ-/Küchenfilter und Detailansicht werden mit synthetischen Daten bedient. |
| `paging` | Drei Seiten mit 200 + 200 + 1 IDs und anschließend eine leere Seite; 401 IDs bleiben erreichbar. |
| `all-invalid` | Eine volle Seite mit außerhalb liegenden Punkten wird verworfen, der Cursor bleibt fortsetzbar. |
| `empty` | Abgeschlossene leere Quelle zeigt „Keine Daten gefunden.“. |
| `detail-error` | Übersicht bleibt nutzbar; Detailbereich zeigt einen separaten Fehler. |
| `xss` | Name/Beschreibung mit HTML-Fragmenten; kein Skript-/Bildkontakt und keine globale XSS-Variable. |
| `image` | Eigenes lokales SVG-Testbild mit Nachweis; Galerie, Fokus und Bildwechsel prüfen. |
| `image-fail` | Defektes Testbild führt zu einer fotofreien Darstellung, nicht zu kaputter Gesamtansicht. |
| `error-401`, `error-403`, `error-404`, `error-429`, `error-500` | Statuszustände bleiben unterscheidbar; kein Kontakt zum direkten DZT-Host. |
| `html-200`, `broken-json` | HTML-/JSON-Fehler werden als Payloadfehler behandelt. |

## Interaktions- und Geometrieproben

- Karte/List/Katalog umschalten; Filter, Auswahl und Listenposition bleiben erhalten.
- `Gebiet anzeigen` verändert nur den Kartenausschnitt.
- Auswahl über Liste, Katalog und Karte testen; Rapid-Auswahl A→B mit verspäteter A-Antwort prüfen.
- Vor/nach Resize den Kartenmittelpunkt und `invalidateSize({ animate: false, pan: true })` prüfen.
- Navigationswechsel über Logo und vorhandene Menüseiten ausführen; nach Rückkehr keine doppelte Leaflet-Karte.
- Viewports 320×740, 390×844, 768×1024 und 1440×900 sowie 390×500 und 200-%-Zoom prüfen.
- Eigene sichtbare Buttons und Links auf mindestens 44×44 CSS-Pixel prüfen.
- Kein horizontales Seitenscrollen; Footer, OSM-Attribution und letzte Bildnachweise erreichbar.
- `fetch`-Requestliste enthält keine direkte DZT- oder `/odp-data`-Anfrage.

## Ergebnisprotokoll

`window.gastroFixtureResult` enthält `mode`, `requests`, `unexpected` und `errors`. Der tatsächliche Screenshot-/Geometrie-Befund wird unter `tests/evidence/` abgelegt, nicht im App-Paket.

## Autorisierte Nicht-Loopback-Prüfung

Für die App-Browserprüfung wird **nicht** `localhost` oder `127.0.0.1` verwendet. Der Loopback-Zweig von `app-base.js` lädt die lokale Config und entspricht nicht dem autorisierten Instanzpfad. Der lokale ODAS-Testzugang ist:

```text
http://odas-dev.invalid:3000
```

Die read-only Inventurprüfung am ODAS-Testziel wird unter `tests/evidence/redesign-browser.md` dokumentiert. Für die nicht veröffentlichte Gastrofinder-Implementierung wird die App nur über eine temporäre, nicht eingecheckte Nicht-Loopback-Fixture-Instanz geprüft; dabei wird der Nicht-Loopback-`app-base.js`-Pfad mit einer temporären `app/config` geprüft. Das ist kein Live-Nachweis und keine Veröffentlichung.

Die Fixture-Screenshots `redesign-*.png` sind statische, aus dem tatsächlich gerenderten Fixture-DOM erzeugte Layout-Snapshots mit schematischem Kartenhintergrund. `redesign-live-ip.png` ist der direkt gerenderte Browserstand am Nicht-Loopback-Testhost mit synthetischen Daten. Alle Bilder tragen den Banner `Synthetische Testdaten · keine Live-Daten`.
