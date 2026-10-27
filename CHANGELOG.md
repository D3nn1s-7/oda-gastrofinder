# Changelog

## 1.2.18 - 2026-10-27
- FIX: Ergebnisliste: Bildnachweise liegen nicht mehr über dem kleinen Vorschaubild, sondern unter dem Kartentext; Urheber, Lizenz und Quelle bleiben vollständig verlinkt (Desktop und Mobile).
- TEST: Markup-Test und opt-in Browserregression `tests/list-card-credit.browser.cjs` (Google Chrome, 1440/390/320 px).
- DOC: Storebilder mit der korrigierten Ergebnisliste neu aufgenommen.

## 1.2.17 - 2026-10-27
- FIX: Sortierung nach Name folgt der deutschen Sortierung: Namen mit Umlauten („Bäckerei …“), Kleinschreibung und führenden Anführungszeichen stehen an der richtigen Stelle, Zahlen werden numerisch sortiert (bisher Unicode-Codepunkte). Gefunden beim Dev-Test von 1.2.16.

## 1.2.16 - 2026-10-27
- CHG: Nutzerentscheidung: Alle im DZT Knowledge Graph hinterlegten Bilder (`schema:image`) werden verwendet, ohne Filter nach Lizenz oder Urheberangabe. Vorhandene Urheber-, Lizenz- und Quellenangaben werden weiter angezeigt, auch für weitere CC-Lizenzen (z. B. BY-NC-SA, BY-ND); die Datensatzlizenz wird nicht als Bildlizenz übernommen.
- FIX: Liste und Katalog wählen das erste Bild mit Bild-URL.
- ENH: Eigene Illustrationen für Restaurant und Café statt Symbolzeichen, wenn kein Foto vorhanden ist oder ein Bild nicht geladen werden kann.
- FIX: Galerie zeigt keinen leeren Lizenzlink mehr, wenn die Quelle keine Lizenz nennt.
- TEST: `tests/images.test.cjs`; zwei Tests der früheren Bildrechte-Regel an die Nutzerentscheidung angepasst.

## 1.2.15 - 2026-10-27
- FIX: Mobile Ergebnisliste: Die schwebende Schaltfläche „Karte ansehen“ verdeckt „Mehr anzeigen“ und „Weitere Daten laden“ nicht mehr; ein Tippen auf „Mehr anzeigen“ zeigt weitere Orte statt zur Karte zu wechseln (320/390 px).
- FIX: Öffnungszeiten lesbarer: Wochentage von Montag bis Sonntag (alle sieben als „Täglich“, Folgen als Spanne), Uhrzeiten als HH:MM, Schließzeit Mitternacht als 24:00, Gültigkeit als deutsches Datum; abgelaufene Zeiträume werden ausgeblendet. Echte Zeiten über Mitternacht bleiben als „bis zum Folgetag“ erkennbar.
- TEST: Laufzeittests für Öffnungszeiten und opt-in Browserregression `tests/mobile-list-footer.browser.cjs` (Google Chrome) ergänzt.
- DOC: Repository-Angabe, Prüfverweise und Mobile-Store-Bild aktualisiert.

## 1.2.14 - 2026-10-23
- FIX: Sichtbare Fehlerhinweise der Übersicht und der Details unterscheiden die Fehlerklasse (Zugriff abgelehnt, Relay nicht möglich, Abfragelimit, ungültige Antwort, Quelle nicht erreichbar) statt zwei Sammeltexte; bei Abfragelimit mit Wartezeit wird die verbleibende Zeit angezeigt.
- FIX: Ein Klick auf „Weitere Daten laden“ während der Abfragelimit-Wartezeit bestätigt den Hinweis sichtbar, statt still nichts zu tun.
- TEST: Gezielte Laufzeittests für Fehlerhinweise, Wartezeit, Cooldown-Bestätigung und Konfigurationsfehleranzeige ergänzt (137 Node-Tests).
- CHG: `app/index.html` wieder bytegleich mit der Generic-Vorlage (zwei Header-Spaltenklassen angeglichen).

## 1.2.13 - 2026-10-16
- FIX: Datenvertrag für die Store-Datenprüfung des aufgegebenen Frictionless-Branches entfernt (`daten.pruefung`, `assets/datenvertraege.json`, Testfälle). Der Store prüft auf `dev` gegen `assets/schema.json`; die App selbst ist unverändert.

## 1.2.12 - 2026-10-14
- DOCS: Datenschutztexte in README, Paket und lokaler Config an die Portfolio-Bausteine angeglichen (Bibliotheks-Satz, gleiche Drittanbieterliste); Markdown-Rest `**…**` in der lokalen Config durch `<strong>` ersetzt.

## 1.2.11 - 2026-10-14
- CHG: Datenvertrag `assets/datenvertraege.json` auf die flache Form der Store-Datenprüfung umgestellt: ein Eintrag je Slot (`dienst: "tourismus-odg"`); Pflicht oder optional folgt allein `erforderlich` des Slots. Prüfinhalt und Testfälle unverändert.

## 1.2.10 - 2026-10-13
- FIX: Standard-Fehleranzeige gibt präzisere Tipps: ein „Failed to fetch“ ohne Proxy-Kontext erhält einen Netzwerk-Hinweis statt `proxyAktiv`; der 404-Hinweis gilt nur noch für echte HTTP-404-Antworten und nennt den lokal fehlenden Proxy/Relay statt pauschal „Datensatz auf dem Portal nicht gefunden“.
- UI: Die Konfigurationsgruppe der Datenquellen heißt wie im übrigen Portfolio „URLs zu Datenressourcen“ (passend zum Hinweistext der Fehleranzeige).

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
