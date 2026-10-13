# Changelog

## 1.2.9 - 2026-10-13
- FIX: Datenquellenfehler (fehlende Quelle, falscher Endpunkt) zeigen die Portfolio-Standardfehleranzeige (`renderOdasFehler`, Variante A); Ort-, Umkreis- und Koordinatenfehler bleiben unverändert.
- FIX: `safeHttpUrl` gibt gültige URLs unverändert zurück; Lizenz- und Routenlink sind direkt an `safeHttpUrl` gebunden.

## 1.2.8 - 2026-10-13
- ENH: Datenvertrag `assets/datenvertraege.json` für die Store-Datenprüfung: die DZT-Quelle `dztsparql` ist ausdrücklich von der Frictionless-Prüfung ausgenommen (`daten.pruefung`).

## 1.2.7 - 2026-10-09
- FIX: Burger-Menü verwendet die native Bootstrap-Transition statt einer abrupt anlaufenden eigenen Kurve; reduzierte Bewegung wird nicht mehr durch `!important` überschrieben.
- TEST: Opt-in-Browserregression für native Menütransition und reduzierte Bewegung ergänzt.
- DOC: Finaler Screenshot-Dokumentationsstand vom 2026-10-12 (sechs synthetische Bilder, drei Motive, Desktop/Mobile); keine DZT-Livedaten, keine Live-Abnahme und keine Produktions- oder Veröffentlichungsfreigabe.

## 1.2.6 - 2026-10-09
- FIX: Katalog-Bildnachweise haben einen eigenen umbrechenden Bereich; lange Credits und Lizenzlinks überlagern keine Betriebsangaben mehr.
- FIX: Einheitliches Gastrofinder-App-Logo auf Sekundärseiten und im Menükopf, ohne Portal-/Instanzkonfiguration zu überschreiben.
- FIX: Bedienaktionen, Links, Navigation und Fokuszustände verwenden konsistent Grün; Braun bleibt der Café-Kennzeichnung vorbehalten.
- DOC: Aktuelle sechs Desktop-/Mobile-Screenshots und Bildnachweise aktualisiert.

## 1.2.5 - 2026-10-08
- FIX: „Details ansehen“ in der Ergebnisliste bleibt bei Hover und Tastaturfokus durch weiße Schrift auf dunkelgrünem Hintergrund deutlich lesbar.

## 1.2.4 - 2026-10-08
- DOC: Drei aktuelle Desktop- und drei Mobile-Screenshots für Übersicht, Katalog und Details aufgenommen und im Paket verknüpft; Laufzeitverhalten unverändert.

## 1.2.3 - 2026-10-08
- FIX: Sichtbare Detailaktionen mit dem validierten Detailabruf verbunden; Lade-, Fehler- und Auswahlzustände bleiben synchron.
- FIX: Datensatz- und Bildnachweise in Details und Galerie erhalten; echte RDF-Quelldaten als JSON-LD und ehrliche Rückmeldung beim Kopieren.
- FIX: Küchensuche, regionale deutsche Sprachkennzeichen, lokale Assetpfade und Tastatur-/Touchbedienung korrigiert.
- FIX: Verschachtelte DZT-Beschreibungstexte und Rechteinhaber korrekt aufgelöst; Detail-`Retry-After`, Cache-Wiederöffnung und Galerie-Fokus/Listener über Modalübergänge abgesichert.
- DOC: README, Paketbeschreibung, Datenschutz, Schema, Lizenznachweise und Store-Screenshots aktualisiert; eigener Code unter MIT.
- BUILD: Eigenständiges `make test`; ZIPs werden frisch einschließlich Lizenztext statt als veraltbares Update gebaut.

## 1.2.2 - 2026-10-02
- FIX: ODAS-Service-Deklaration in `odas-services` korrigiert.

## 1.2.1 - 2026-09-29
- **FIX:** Kartenklick- und Auswahl-Lifecycle entkoppelt (Option 1A) – Schließen des Detailmodals setzt die Kartenauswahl sauber zurück (`hidden.bs.modal`), Klick auf Listeneintrag fokussiert auf der Karte ohne dauerhafte Hervorhebung.
- **STYLE:** Vollständige Harmonisierung der Katalogansicht mit der Gourmet-Farbpalette (Option 2A) – Entfernung von Bootstrap-Standardfarben (Blau) zugunsten von `.gf-btn-outline-forest`, `.gf-btn-forest`, warmen Terracotta-Akzenten und Waldgrün-Badges.
- **FEAT:** Interaktive Leaflet-Marker-Popups (Option 3A) – Klick auf Kartenpin öffnet Vorschau-Popup mit Miniatur, Titel, Distanz, Typ-Badges und Schnellaktion "Details ansehen »".
- **FEAT:** ODTA-Rohdaten-Kopierfunktion im Detail-Modal per Clipboard-API mit visuellem Feedback.

## 1.2.0 - 2026-09-29
- **FEAT:** Gold-Standard-Angleichung an Referenz-Architektur (oda-sehenswuerdigkeiten).
- **FIX:** Behebung des übergroßen SVG-Uhr-Icons im Detail-Modal durch globale Icon-Regeln und explizite SVG-Dimensionen.
- **FEAT:** Bootstrap 5.3 Detail-Modal mit Hero-Foto, Multi-Foto-Strip, bereinigter Beschreibung (keine rohen IRIs) und ODTA-Rohdaten-Akkordeon.
- **FEAT:** Smartphone QR-Code Modal mit qrcode.js und direkter Teilen-Funktion.
- **FEAT:** Vollbild-Foto-Katalog mit dualen Aktionen ("Auf Karte" und "Details").
- **FEAT:** Vollbild-Bilder-Lightbox mit Tastatur- und Wischsteuerung.
- **FEAT:** Dynamischer Top-Banner mit Ort und Radius, einklappbares Genuss-Cockpit mit kompakten Karten (85×80px Thumbnails).
- **PERF:** Optimierte DZT-SPARQL-Projektionsabfrage lädt alle Metadaten in einer einzigen Anfrage.

## 1.1.2 - 2026-09-24
- **FIX:** Sekundärseiten verursachen auf Desktop keinen horizontalen Overflow durch das offscreen positionierte ODAS-Offcanvas.

## 1.1.1 - 2026-09-24
- **FIX:** DZT-Übersichtsabfrage bindet das Prädikat auch für direkte Root-Tripel; Live-Relay-Antworten werden dadurch nicht mehr als unvollständig abgewiesen.

## 1.1.0 - 2026-09-24
- **REDESIGN:** Vollbild-Karte mit schwebenden Funktionsleisten und Genuss-Cockpit.
- **REDESIGN:** Vollbild-Katalog, Hero-Detaildialog und mobile Karte/Liste-Umschaltung.
- **REDESIGN:** Einheitlich gestaltete Sekundärseiten und aktualisierte responsive Screenshots.
- **COMPATIBILITY:** DZT-Typen, Relay, Paging, Lizenz- und Fokusregeln bleiben erhalten.

## 1.0.0 - 2026-09-24
- **NEW:** Gastrofinder als regionaler Restaurant- und Caféfinder mit Genussatlas-Karte, Ergebnisliste und Katalog.
- **NEW:** Ausschließlich exakte DZT-Typen `Restaurant` und `CafeOrCoffeeShop`, transparente Quellseiten und Rechteprüfung.
- **NEW:** Konfigurierbare Ort-/Umkreisauflösung, lokaler GeoNames-Index und explizites Koordinatenpaar.
- **NEW:** Barrierearme Desktop-/Mobile-Ansicht, Detailfokus, native Bildergalerie und lokale Bibliotheken/Fonts.
- **NEW:** ODAS-DZT-Relay als einziger DZT-Laufzeitweg; Veröffentlichung und echter Relay-Nachweis bleiben getrennte Freigaben.
