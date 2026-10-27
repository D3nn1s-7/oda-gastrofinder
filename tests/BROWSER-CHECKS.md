# Reproduzierbare Browserprüfung

Die synthetischen SPARQL-Fixtures sind kein Nachweis des echten DZT-Relays. Sie prüfen die aktuelle Runtime auf beiden Daten- und Bedienpfaden, ohne API-Key im Browser.

## Lokaler Start

1. Live Server aus der Projektwurzel starten (`liveServer.settings.root: "/"`).
2. `http://127.0.0.1:5500/app/` öffnen; bei anderer Konfiguration den aktiven Port verwenden.
3. Ein anfänglicher `/app/dzt`-404 ist ohne ODAS-Backend zu erwarten. Für die Testdaten in der Browser-Konsole ausführen:

```js
for (const src of ["../tests/fixtures.js", "../tests/browser-fixtures.js"]) {
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
await installGastroFixture("success");
```

Vor jedem anderen Szenario neu laden und die Fixture erneut installieren. `window.gastroFixtureResult` protokolliert Requests, unerwartete Abrufe und Fehler. Der Demo-Hinweis muss sichtbar bleiben. Base-Dateien, Instanzkonfiguration des Stores und Produktionsdaten werden nicht geändert.

## Szenarien

| Modus | Zu prüfender Zustand |
|---|---|
| `success` | Karte/Liste/Katalog, Filter/Sortierung, echtes Detail-Nachladen |
| `paging` | 200 + 200 + 1 + leere Seite: 401 eindeutige IDs erreichbar |
| `all-invalid` | Verworfene volle Seite beendet Quellpaging nicht still |
| `empty` | Gültige leere Quelle klar als leer angezeigt |
| `detail-error` | Übersicht nutzbar, sichtbarer separater Detailfehler |
| `xss` | Fremdtext bleibt Text, keine ausführbaren HTML-/Script-Senken |
| `image` | Nachweis je Foto, Galerie, Tastatur, Fokus und Rückkehr |
| `image-fail` | Bildausfall beschädigt nicht die übrige Detailansicht |
| `error-401`, `error-403`, `error-404`, `error-429`, `error-500` | Fehlerstatus unterscheidbar, kein direkter DZT-Aufruf |
| `html-200`, `broken-json` | Falsche Antwort nicht als „keine Treffer“ behandeln |

## Besonders wichtige Regressionen

- Über **Liste, Katalog und Markerpopup** Details öffnen; die zweite Antwort muss Beschreibung/Öffnungszeiten tatsächlich ergänzen. Nicht nur `selectGastroPoi()` isoliert testen.
- A→B schnell auswählen bzw. Dialog vor Antwort schließen: verspätete A-Antwort darf B nicht überschreiben und keinen geschlossenen Dialog erneut öffnen.
- Vollständigen Urheber/Lizenz/Quelle eines Testbildes mit dem sichtbaren Nachweis abgleichen; Datensatznachweis getrennt vom Foto.
- Rohdatenansicht enthält tatsächliche JSON-LD-Knoten, nicht `{}`. Kopierfehler darf kein „Kopiert“ erzeugen.
- Nur in `cuisines` vorkommendes Wort suchen; passender Betrieb bleibt auffindbar.
- Detail-/Galerieaktionen mit Tastatur bedienen, Escape schließen und Fokus zurückerhalten.
- In der Ergebnisliste „Details ansehen“ hovern und per Tab fokussieren: weiße Schrift auf dunkelgrünem Hintergrund, Textkontrast mindestens 4,5:1; Tastaturfokus sichtbar und Enter öffnet weiterhin Details. Erst nach Ende der CSS-Transition messen (Regression seit 1.2.5).
- Hashwechsel bei offener Galerie/Modal; nach Rückkehr keine Alt-Overlays oder zweite Karte.
- App-Icon unter `/app/` und `app/index.html` ohne Asset-404.
- Breiten 320, 390, 768 und 1440 px; keine horizontale Dokumentüberbreite, mobile Liste samt letztem Eintrag erreichbar.

## ODAS-Auslieferung getrennt prüfen

Auf einer echten ODAS-Testinstanz liegen die App-Dateien flach an der Instanzbasis; `assets/` ist dort direkt relativ erreichbar. Die Config kommt vom Store, Daten vom `/dzt`-Relay. Ein lokaler Fixture-Lauf beweist diesen externen Dienst nicht. Vor Live-Abnahme den finalen ZIP-Stand an der ausdrücklich autorisierten Testinstanz prüfen.

Aktueller Prüfstand: siehe [`CHANGELOG.md`](../CHANGELOG.md) (Version 1.2.15) sowie die opt-in Browserregressionen `tests/menu-motion.browser.cjs` und `tests/mobile-list-footer.browser.cjs`. Historischer Prüfnachweis zum Runtime-Stand 1.2.3: [`evidence/release-readiness-2026-10-08.md`](evidence/release-readiness-2026-10-08.md). Ältere Entwicklungszwischenstände sind nicht die aktuelle Abnahme und wurden aus dem aktiven Screenshotbestand archiviert.
