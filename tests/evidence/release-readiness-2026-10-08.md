# Verifikation Gastrofinder 1.2.3

Prüfdatum: **2026-10-08**. Umgebung: Node.js 26.10.0, Python 3.14.8, Google Chrome 153.0.8010.52, VS-Code-Live-Server. Die gemeinsamen `app-base.*`, `index.html` und Containerdateien wurden nicht verändert.

Die Browsermatrix verwendet kontrollierte synthetische Antworten, den echten App-Code, native Klick-/Tastaturereignisse und ein nachgebildetes flaches ODAS-Auslieferungslayout. Sie ist **keine Portalabnahme**. Die unten gesondert genannten authentifizierten DZT-Abfragen sind read-only Design-Time-Tests; der Schlüssel lag nie im Browser oder Repository.

## Automatisierte Tests

- `PYTHONDONTWRITEBYTECODE=1 make test`: 129/129 Node-Tests, 2/2 Python-Ortsindextests, 1/1 Test der tatsächlichen ZIP-Rezeptur; Syntax und JSON erfolgreich.
- Portfolio-Konfigurationslint ohne Befund. Docker-Compose-Basiskonfiguration und Kombination mit Standalone-Override syntaktisch validiert; kein Docker-Image-Build.
- Neue Regressionen riefen echte Runtime-Funktionen auf und wurden zunächst rot, danach grün ausgeführt: sichtbare Detailpipeline, Cache-Wiederöffnung, Loading-Close/Abort, Rechte/Rohdaten, Sprachvarianten, Galerie-Fokus einschließlich später Bootstrap-Transition, Listener-Cleanup und Retry-After.

## Browsermatrix: 13/13 erfolgreich

1. Küchensuche; Details per Enter aus Liste, Wiederöffnung ohne zweiten Abruf, Katalog, Markerpopup und Navigation zurück zur einzigen Karte.
2. Getrennte Daten-/Bildnachweise, echte JSON-LD-Knoten, Hero per Enter, Lightbox/Escape/Fokusrückgabe, verweigerte Zwischenablage ohne falsches Erfolgssignal, Hashwechsel mit Galerie-Cleanup.
3. Verzögerte Detailantwort A nach Schließen und Öffnen von B überschreibt B nicht.
4. Detail-HTTP-500 mit sichtbarem Fehler und erfolgreichem Wiederholen; Übersicht bleibt nutzbar.
5.–8. Flache ODAS-Basis: fehlende Quelle ohne Fetch, gültig leer, falsches HTTP-200-Format und HTTP 500.
9. HTML-/Script-Payload bleibt Text.
10.–13. 320, 390, 768 und 1440 px ohne horizontale Überbreite; lokale Assets ohne 404.

Die veröffentlichten Live-Server-/Konsolenschritte aus README/BROWSER-CHECKS wurden zusätzlich unverändert ausgeführt: 24 Fixture-Karten, keine Fixture-Fehler. Storebilder wurden nach Abschluss von UI-Animationen mit sichtbarer Kennzeichnung synthetischer Daten aufgenommen.

## Aktueller DZT-Vertrag

- Generierte Übersicht, Vaihingen an der Enz / 5 km: HTTP 200, 527 RDF-Bindings, 17 normalisierte Betriebe, 9 nachgewiesene Vorschaubilder.
- Generierte Detailabfrage eines echten Restaurants: HTTP 200, 29 Bindings, 936 Zeichen aus dem verschachtelten CreativeWork-Beschreibungstext; Datensatzlizenz und Attribution vorhanden. Dieser konkrete Betrieb liefert kein Bild.
- Verschachtelte Bild-/Datensatz-Rechteinhaber werden über Namen aufgelöst, nicht als rohe IRIs angezeigt. Die RDF-Subjekte bleiben im Export korrekt zugeordnet.
- Eine anfängliche Python-urllib-Probe lieferte 403. Dieselben Zugriffe mit authentifiziertem curl lieferten 200; kein allgemeiner Zugangsfehler oder leerer Datenbestand wurde daraus abgeleitet.

## Grenzen

Keine neue ODAS-Instanz gebucht oder verändert, kein GitHub-Push, keine Aussage über regionale Vollständigkeit. Rechte historischer Fotos/Demos in der Git-Historie werden durch Ersetzen des aktuellen Baums nicht rückwirkend geklärt. Historische Screenshots/Entwicklungsnachweise wurden außerhalb des App-Repositories archiviert.
