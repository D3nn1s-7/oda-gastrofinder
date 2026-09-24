# Gastrofinder – Genussatlas Fullscreen

Der **Gastrofinder** ist eine regionale Open Data App für Restaurants und Cafés. Die Startseite ist als Fullscreen-Karte mit schwebenden Funktionsleisten, einer einklappbaren Genuss-Cockpit-Säule, Vollbild-Katalog und Hero-Detailansicht gestaltet. Das ODAS-Portal legt Ort und Umkreis fest; Besucherinnen und Besucher sehen nur den geladenen Bestand im konfigurierten Suchgebiet.

## Was die App kann

- ausschließlich DZT-Datensätze mit den exakten schema.org-Typen `Restaurant` und `CafeOrCoffeeShop`,
- Fullscreen-Map mit Leaflet, Marker-Clustering, Suchgebietskreis, Home-/Zoom-Steuerung und Waldgrün-/Kupfer-Semantik,
- schwebende Brandbar mit Ort, Radius und Portalhinweis,
- schwebende Aktionen für Katalog, Teilen und ODAS-Menü,
- einklappbare Cockpit-Säule mit Name-/Ortssuche, Typ-/Küchenfilter, Sortierung, Trefferliste und Nachladen,
- Vollbild-Katalog mit den aktuell gefilterten Betrieben,
- Hero-Detaildialog mit Beschreibung, Adresse, Öffnungszeiten, Kontakt, Route, Website und Bildnachweisen,
- mobile Umschaltung zwischen Karte und vollständiger Ergebnisliste,
- einheitlich gestaltete Sekundärseiten für Beschreibung, Kontakt, Datenschutz und Impressum,
- lokale Karten-/Font-Bibliotheken, sichtbare Fokuszustände und `prefers-reduced-motion`.

Öffnungszeiten sind Angaben der Quelle. Die App berechnet daraus **keine** Live-Anzeige „jetzt geöffnet“ oder „geschlossen“. Fehlende Angaben werden als „nicht angegeben“ ausgewiesen.

## Konfiguration

| Schlüssel | Bedeutung |
|---|---|
| `ort` | Ort oder Region für die Offline-Ortsauflösung; Paketstandard leer. |
| `radiusKm` | Umkreis als String aus `5`, `10`, `25`, `50` oder `100`; Paketstandard `25`. |
| `latitude` / `longitude` | Optionales vollständiges Koordinatenpaar. Es ist nötig, wenn der Ort im Index fehlt oder mehrdeutig ist. |
| `apiurls.dztsparql` | Benannte DZT-SPARQL-Ressource. |

Der Portalbetreiber bestimmt das Suchgebiet. Die Besucheransicht bietet keine freie Deutschland- oder GPS-Ortsuche. Für die Auflösung wird ein mitgelieferter deutscher GeoNames-`cities1000`-Auszug verwendet; bei unbekannten oder mehrdeutigen Namen muss das Betreiber-Koordinatenpaar gesetzt werden. Weitere Grenzen stehen in [`app/data/README.md`](app/data/README.md).

## Datenweg und Relay

Im ODAS-Betrieb lädt die App Daten **nicht** direkt vom DZT-Host und nicht über `/odp-data`. Stattdessen verwendet sie den DZT-Relay der App-Instanz:

```text
GET <App-Basispfad>/dzt?path=ts/v1/kg/sparql?query=...
```

Der Store setzt den DZT-API-Key serverseitig. Die App enthält keinen API-Key. Die echte Relay-Prüfung (A13) benötigt eine freigegebene Gastrofinder-Zielinstanz und ist nicht durch lokale Fixtures erfüllt.

## Datenmodell und Rechte

`assets/schema.json` beschreibt das normalisierte `GastroPoi`-Modell. Die Übersicht lädt IDs, Typen, Punkt, Adressort, Küche, Lizenz und ein Vorschaubild; Beschreibung, vollständige Adresse, Öffnungszeiten, Kontakt und weitere Bilder werden erst für eine ausgewählte ID angefragt.

Die Datensatzlizenz wird nicht auf Bilder übertragen. Ein Bild erscheint nur mit eigenem nachweisbaren Urheber-/Lizenznachweis. Bibliotheken, Fonts und GeoNames-Lizenz sind lokal dokumentiert in [`app/vendor/THIRD-PARTY.md`](app/vendor/THIRD-PARTY.md), [`app/data/README.md`](app/data/README.md) und den dort genannten Lizenzdateien. Kartenkacheln von OpenStreetMap werden mit Attribution geladen; DZT-Bildhosts sind quellenabhängig und werden im jeweiligen Bildnachweis angezeigt.

## Lokal prüfen

Voraussetzung ist eine aktuelle ODAS-/Live-Server-Umgebung. Für die Tests wird die App **nicht** über `localhost` oder `127.0.0.1` aufgerufen, weil `app-base.js` dort den lokalen Config-Zweig verwendet. Das autorisierte ODAS-Testziel ist:

```text
http://odas-dev.invalid:3000
```

Für die nicht veröffentlichte Gastrofinder-Implementierung wurde zusätzlich ein temporärer Nicht-Loopback-Fixture-Host verwendet. Die temporäre `app/config` und der Fixture-Server waren nicht eingecheckt und sind nicht Teil des Lieferumfangs.

Vom Projektordner aus:

```bash
node --check app/app.js
node --check app/app-base.js
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -p 'test_places.py'
python3 -m json.tool app-package.json >/dev/null
python3 -m json.tool odas-config/config.json >/dev/null
python3 -m json.tool assets/schema.json >/dev/null
python3 ../tools/odas-config-lint/lint.py .
```

Die Browser-Fixture ersetzt DZT-Antworten ausschließlich durch synthetische SPARQL-Bindings. Sie ist **kein Live-Nachweis**. Anleitung und Szenarien stehen in [`tests/BROWSER-CHECKS.md`](tests/BROWSER-CHECKS.md); die aktuellen Nachweise liegen in [`tests/evidence/redesign-browser.md`](tests/evidence/redesign-browser.md) und [`tests/evidence/redesign-acceptance.md`](tests/evidence/redesign-acceptance.md).

Ein lokaler Aufruf von `/dzt` ohne ODAS-Relay liefert erwartungsgemäß keinen echten DZT-Datensatz. Das ist keine Aussage über die Live-Anbindung.

## Paket und Veröffentlichung

- ODAS-Paketformat: `2`
- API-Version: `1`
- App-Version: `1.1.0`
- ZIP-Inhalt: `app/`, `assets/`, `app-package.json` und `CHANGELOG.md`
- Das Paket ist lokal geprüft.
- Ein eigenes öffentliches Repository, ein finaler Repository-Link und eine echte ODAS-Zielinstanz sind noch nicht autorisiert.
- Es wurde keine Live-Instanz gebucht und keine Veröffentlichung behauptet.

## Projektstruktur

```text
app/app.js                 Fullscreen-Shell, Katalog, Dialog, Lifecycle und Datenlogik
app/app.css                Genussatlas-Layout, Floating Controls und responsive Zustände
app/data/                  GeoNames-Index und Lizenzhinweise
app/vendor/                Bootstrap, Leaflet, MarkerCluster, Fonts und Lizenzen
assets/schema.json         Frictionless Table Schema
assets/odas-app-icon.svg   ODAS-Icon
assets/*_Screenshot.png    synthetisch markierte Redesign-Screenshots
odas-config/config.json    lokaler Konfigurationsspiegel
odas-services              nur Tourismus Deutschland
```

## Lizenz- und Nachweisgrenze

Fremde Runtime-Bibliotheken und Fonts behalten ihre jeweiligen Lizenzen. Für DZT-Datensätze und Bilder gelten die in der Quelle bzw. im Datensatz ausgewiesenen Rechte. Der Anbieter der App gibt keine neue Lizenz für fremde Daten oder Bilder an.
