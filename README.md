# Gastrofinder – Genussatlas

Der **Gastrofinder** ist eine regionale Open Data App für Restaurants und Cafés. Das ODAS-Portal legt Ort und Umkreis fest; Besucherinnen und Besucher finden geladene Betriebe auf einer Karte, in einer Ergebnisliste oder in einem Katalog und öffnen bei Bedarf Detailangaben.

## Was die App kann

- ausschließlich DZT-Datensätze mit den exakten schema.org-Typen `Restaurant` und `CafeOrCoffeeShop`,
- Karte mit Leaflet, Marker-Clustering, Restaurant-/Café-Symbolen und Suchgebietskreis,
- Name-/Ortssuche, Typfilter, Küchenfilter einschließlich „Nicht angegeben“ und Distanz-/Namenssortierung,
- seitenweises Nachladen: maximal 200 eindeutige Quell-IDs pro Quellseite, zunächst 24 sichtbare Einträge,
- Detailansicht mit Beschreibung, Adresse, Öffnungszeiten, Website, Telefon, Route und Bildnachweisen,
- lokale Karten-/Font-Bibliotheken, Desktop- und Mobile-Darstellung sowie Tastaturfokus.

Öffnungszeiten sind Angaben der Quelle. Die App berechnet daraus **keine** Live-Anzeige „jetzt geöffnet“ oder „geschlossen“. Fehlende Angaben werden als „nicht angegeben“ ausgewiesen.

## Konfiguration

Die App erwartet die folgenden Instanz-Einstellungen:

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

Der Store setzt den DZT-API-Key serverseitig. Die App enthält keinen API-Key. Die im ODAS-Live-System erforderliche Relay-Prüfung (A13) ist ein separater, nicht durch einen lokalen Mockup erfüllter Abnahmeschritt.

## Datenmodell und Rechte

`assets/schema.json` beschreibt das normalisierte `GastroPoi`-Modell. Die Übersicht lädt IDs, Typen, Punkt, Adressort, Küche, Lizenz und ein Vorschaubild; Beschreibung, vollständige Adresse, Öffnungszeiten, Kontakt und weitere Bilder werden erst für eine ausgewählte ID angefragt.

Die Datensatzlizenz wird nicht auf Bilder übertragen. Ein Bild erscheint nur mit eigenem nachweisbaren Urheber-/Lizenznachweis. Bibliotheken, Fonts und GeoNames-Lizenz sind lokal dokumentiert in [`app/vendor/THIRD-PARTY.md`](app/vendor/THIRD-PARTY.md), [`app/data/README.md`](app/data/README.md) und den dort genannten Lizenzdateien. Kartenkacheln von OpenStreetMap werden mit Attribution geladen; DZT-Bildhosts sind quellenabhängig und werden im jeweiligen Bildnachweis angezeigt.

## Lokal prüfen

Voraussetzung ist eine aktuelle ODAS-/Live-Server-Umgebung. Vom Projektordner aus:

```bash
node --check app/app.js
node --check app/app-base.js
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -p 'test_places.py'
```

Für die Browsermatrix wird ein statischer Server auf einem freien localhost-Port gestartet und `http://127.0.0.1:<port>/app/` geöffnet. `tests/browser-fixtures.js` ist **nur ein Testwerkzeug** und gehört nicht zum Lieferumfang. Es ersetzt DZT-Antworten durch synthetische Bindings und markiert die Ansicht sichtbar als Testdaten. Die Fixture-Anleitung steht in [`tests/BROWSER-CHECKS.md`](tests/BROWSER-CHECKS.md).

Ein lokaler Aufruf von `/dzt` ohne ODAS-Relay liefert erwartungsgemäß keinen echten DZT-Datensatz. Das ist keine Aussage über die Live-Anbindung.

## Paket und Veröffentlichung

- ODAS-Paketformat: `2`
- API-Version: `1`
- App-Version: `1.0.0`
- ZIP-Inhalt wird durch das unveränderte Template-Makefile aus `app/`, `assets/`, `app-package.json` und `CHANGELOG.md` erstellt.
- Das Paket ist lokal geprüft. Ein eigenes öffentliches Repository, ein finaler Repository-Link und eine echte ODAS-Zielinstanz sind noch nicht autorisiert; deshalb wird hier kein GitHub-Pfad erfunden und keine Live-Veröffentlichung behauptet.

## Projektstruktur

```text
app/app.js                 App-Logik, Relay, Datenmodell, State und Darstellung
app/app.css                Genussatlas-Layout und Responsive-/Fokusregeln
app/data/                  GeoNames-Index und Lizenzhinweise
app/vendor/                Bootstrap, Leaflet, MarkerCluster, Fonts und Lizenzen
assets/schema.json         Frictionless Table Schema
assets/odas-app-icon.svg   ODAS-Icon
assets/*_Screenshot.png    synthetisch markierte Browser-Screenshots
odas-config/config.json    lokaler Konfigurationsspiegel
odas-services              nur Tourismus Deutschland
```

## Lizenz- und Nachweisgrenze

Fremde Runtime-Bibliotheken und Fonts behalten ihre jeweiligen Lizenzen. Für DZT-Datensätze und Bilder gelten die in der Quelle bzw. im Datensatz ausgewiesenen Rechte. Der Anbieter der App gibt keine neue Lizenz für fremde Daten oder Bilder an.
