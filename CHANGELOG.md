# Changelog

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
