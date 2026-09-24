# Generic Open Data App

Die **Generic Open Data App** ist die technische Ausgangsbasis für neue Apps im
[Open Data App Store](https://open-data-app-store.de/). Sie enthält das gemeinsame
ODAS-Seitenlayout, Hash-Routing, Instanz-Konfiguration und ein optionales Proxy-Muster.

Die Vorlage entspricht der
[Open Data App Spezifikation](https://open-data-apps.github.io/open-data-app-docs/open-data-app-spezifikation/).
Vor einer Veröffentlichung müssen Fachlogik, Metadaten, Datenmodell, Beschreibung,
Screenshots und Icon durch app-spezifische Inhalte ersetzt werden.

## Funktionen

- Single Page Application mit teilbaren Hash-Routen
- Seiten für Start, Beschreibung, Kontakt, Datenschutz und Impressum
- sichtbarer Fehlerzustand bei nicht ladbarer Konfiguration
- HTML-Passthrough für konfigurierte Rich-Text-Seiten
- konfigurierbares Portal-Logo mit Link zur Startseite
- lokale Konfigurationsvorschau mit maskierter HTML-Ausgabe
- direkter Datenabruf oder ODAS-Proxy über `proxyAktiv`
- Bootstrap, Leaflet und Chart.js vendored in `app/vendor/` — kein CDN-Request, kein Build-Schritt

## Vendorte Bibliotheken

`app/vendor/` liefert die für die Darstellung benötigten Programmbibliotheken direkt mit
der App aus, statt sie von einem CDN (jsDelivr, unpkg.com) zu laden — Voraussetzung für
einen tatsächlich autarken Standalone-Betrieb (F-07 Teil 2). Das Template führt
`app/vendor/bootstrap/`, `app/vendor/chartjs/` und `app/vendor/leaflet/` mit; die
Vorlage-App selbst referenziert nur Bootstrap. Referenziert werden die Bibliotheken in
`app/index.html` bzw. über die Promise-basierten Loader (`loadScriptOnce`/
`loadStyleOnce` in `app/app.js`) mit einem einfachen relativen Pfad
(`vendor/bootstrap/…`, `vendor/chartjs/…`, `vendor/leaflet/…`), genau wie
`app-base.css` oder `app.js` — das funktioniert unverändert in allen drei Betriebsarten
(ODAS-Live, Docker-Standalone, lokaler Test), weil `vendor/` **innerhalb** von `app/`
liegt und damit nicht der pfadabhängigen Auflösung aus F-29 unterliegt (die nur
Geschwisterverzeichnisse von `app/` betrifft, wie `assets/`).

Die Regel gilt für **jede** Programmbibliothek: alles vendoren, Versionen exakt pinnen
(kein `@latest`, kein reiner Major-Pin), kein CDN-Request. Der tatsächlich
ausgelieferte Bestand wird von `tools/odas-vendor-check/` im Wurzelverzeichnis des
App-Portfolios gegen ein SHA-256-Manifest geprüft (`check.py`); Abweichungen meldet das
Werkzeug als `DRIFT`, `FEHLEND`, `UNBEKANNT` oder `VERWAIST`.

## Für wen ist diese Vorlage?

Die Vorlage richtet sich an Kommunen, öffentliche Einrichtungen und Entwicklungsteams,
die eine neue Open-Data-App aufbauen oder technisch prüfen möchten. Für die Vorschau ist
kein besonderes Datenfachwissen erforderlich; für eine konkrete App werden Kenntnisse der
jeweiligen Datenquelle benötigt.

## Architektur

App-spezifischer Code gehört nach `app/app.js` und `app/app.css`. Die Dateien
`app/app-base.js`, `app/app-base.css` und `app/index.html` bilden den austauschbaren
Template-Laufzeitkern. Neue Apps sollten diese Base-Dateien nur bewusst und dokumentiert
ändern.

Die Funktion `app(configdata, enclosingHtmlDivElement)` erzeugt den Startseiteninhalt.
`addToHead()` bleibt außerhalb und nach `app()` definiert. Optionale Bibliotheken werden
in konkreten Apps über dedizierte Promise-basierte Loader aus `app/app.js` geladen.

Gibt `app()` einen String zurück, schreibt die Base ihn nach `#main-content`. Rendert die
App stattdessen selbst in das übergebene Element, gibt sie nichts (bzw. `null`) zurück;
die Base lässt den Inhaltsbereich dann unangetastet.

### Optionaler Hook `onPageLeave(page)`

Apps mit Laufzeit-Ressourcen — einer Leaflet-Karte, einem `setInterval`, offenen
Event-Listenern — definieren in `app/app.js`:

```js
function onPageLeave(page) {
  // page ist die Seite, die gleich gerendert wird ("startseite", "impressum", …)
}
```

Die Base ruft die Funktion am Anfang von `loadPage()` auf, also **vor** dem Rendern der
neuen Seite. Fehlt sie, passiert nichts. Damit bleibt `app/app-base.js` unverändert zum
Template, auch wenn eine App beim Seitenwechsel aufräumen muss.

### Optionaler Hook `renderPageOverride(page)`

Apps, die den Standard-Content einer der festen Seiten (`startseite`, `beschreibung`,
`kontakt`, `datenschutz`, `impressum`) durch eigenes Markup ersetzen wollen, definieren in
`app/app.js`:

```js
function renderPageOverride(page) {
  if (page === "beschreibung") {
    return "<div>…eigenes Markup…</div>";
  }
  return null; // für alle anderen Seiten den Standard-Content der Base verwenden
}
```

Die Base ruft die Funktion am Anfang von `loadPage()` auf. Liefert sie `undefined` oder
`null` zurück (oder fehlt sie), rendert `loadPage()` den bisherigen Standard-Content aus
dem `switch`-Block. Damit muss eine App `loadPage()` nicht per Monkey-Patch überschreiben,
um einzelne Seiten anzupassen.

## Konfiguration

| Parameter | Zweck | Pflicht |
| --- | --- | --- |
| `titel` | sichtbarer Titel in der Kopfzeile | ja |
| `seitentitel` | Titel des Browser-Tabs | ja |
| `icon` | Portal-Logo in der Kopfzeile | ja |
| `beschreibung` | HTML-Inhalt der Seite „Über diese App“ | ja |
| `kontakt` | HTML-Inhalt der Kontaktseite | ja |
| `datenschutz` | HTML-Inhalt der Datenschutzseite | ja |
| `impressum` | HTML-Inhalt des Impressums | ja |
| `fusszeile` | Inhalt der Fußzeile | ja |
| `brandingCSS` | optionaler CSS-Code der Instanz | nein |
| `brandingCSSFile` | optionale URL zu einer Branding-CSS-Datei | nein |
| `urlDaten` | Katalogseite des Datensatzes | nein |
| `apiurls` | Array benannter Datenressourcen (`name`, `label`, `url`); direkter Datei- oder API-Endpunkt je Eintrag | nein |
| `proxyAktiv` | `nein` für Direktabruf, `ja` für ODAS-Proxy | ja |

Jeder von `app/app.js` gelesene Konfigurationswert muss in `app-package.json` unter
`instanz-config` deklariert und in `odas-config/config.json` für lokale Tests gespiegelt
sein. Die Generic-App enthält bewusst keine fachliche Datenquelle.

## Datenmodell

`assets/schema.json` ist ein gültiges Frictionless Table Schema als Strukturbeispiel.
Abgeleitete Apps ersetzen es vollständig durch die Felder ihrer tatsächlichen Datentabelle
und aktualisieren gleichzeitig den `daten`-Block in `app-package.json`.

## ODAS-Proxy

- `proxyAktiv: "nein"`: `fetchOdasResource()` lädt die Ressource direkt.
- `proxyAktiv: "ja"`: Die Funktion sendet einen `POST` an den app-lokalen
  `odp-data`-Endpunkt und übergibt nur Pfad und Query im URL-kodierten Parameter `path`.
- Der App-Basispfad funktioniert für `/app/`, `/app` und `/app/index.html`.
- Echte Proxy-Antworten lassen sich nur im ODAS-Live-System prüfen. Lokal werden
  Konfigurationsverdrahtung, Statusanzeige und der Direktmodus getestet.

## Lokale Entwicklung

### Docker Compose

```bash
make build up
```

Die App ist anschließend unter <http://localhost:8090> erreichbar. Die App erkennt
Localhost (127.0.0.1/localhost) automatisch und lädt dann `odas-config/config.json`;
kein Edit an `app/app-base.js` nötig.

### VS Code Live Server

Live Server wird aus der Projektwurzel gestartet. Die App liegt dann üblicherweise unter
`http://127.0.0.1:5500/app/`.

```json
{
  "liveServer.settings.host": "127.0.0.1",
  "liveServer.settings.root": "/",
  "liveServer.settings.file": "app/index.html"
}
```

`liveServer.settings.root` bleibt `/`, damit `app/` und `odas-config/` als Geschwisterpfade
erreichbar sind. Auch hier erkennt die App Localhost automatisch und lädt `odas-config/config.json`;
kein Edit an `app/app-base.js` nötig.

## Prüfung und Auslieferung

```bash
node --check app/app.js
node --check app/app-base.js
python3 -m json.tool app-package.json >/dev/null
python3 -m json.tool odas-config/config.json >/dev/null
python3 -m json.tool assets/schema.json >/dev/null
make zip
```

Das ZIP enthält ausschließlich `app/`, `assets/`, `app-package.json` und `CHANGELOG.md`.
Lokale Dateien unter `odas-config/` werden nicht ausgeliefert.

## Wichtige Dateien

| Datei | Zweck |
| --- | --- |
| `app/app.js` | app-spezifischer Startseiteninhalt und Proxy-Hilfsfunktionen |
| `app/app.css` | app-spezifisches Styling |
| `app/app-base.js` | Konfiguration, Routing und gemeinsame Seitendarstellung |
| `app/index.html` | gemeinsames, responsives HTML-Grundgerüst |
| `app-package.json` | Store-Metadaten und Instanz-Konfiguration |
| `assets/schema.json` | Frictionless-Datenschema |
| `odas-config/config.json` | lokale Testkonfiguration |

## Betriebsarten

Die App kann lokal, eigenstaendig hinter einem Traefik-Reverse-Proxy oder ueber den ODAS
betrieben werden.

### Datenabruf: `proxyAktiv`

| Wert   | Bedeutung                                                                   |
| ------ | --------------------------------------------------------------------------- |
| `nein` | Direkter Abruf der Daten-URL. Standard fuer Entwicklung und Standalone.      |
| `ja`   | Abruf ueber den ODAS-Proxy `…/odp-data`. Nur im ODAS-Live-System verfuegbar. |

Bei `nein` muss die Datenquelle CORS freigeben.

### Standalone-Betrieb

Voraussetzung: ein laufender Traefik mit dem externen Docker-Netzwerk `proxynet`,
dem EntryPoint `websecure` und dem Zertifikatsresolver `letsencrypt`.

1. In `docker-compose.standalone.yml` den Platzhalter `app1.example.com` durch den
   echten FQDN ersetzen.
2. In `odas-config/config.json` `proxyAktiv` auf `nein` belassen.
3. Starten:

```bash
STANDALONE=true make up
STANDALONE=true make logs
STANDALONE=true make down
```

Im Standalone-Betrieb entfaellt die lokale Portfreigabe; Traefik terminiert TLS und
leitet auf den internen Nginx-Port 80 weiter. Die Konfiguration wird aus derselben
`odas-config/config.json` gelesen wie in der Entwicklung und von Nginx unter `/config`
ausgeliefert.

### Beim Aufruf kontaktierte Drittanbieter

Beim Aufruf dieser App werden keine externen Server für Programmbibliotheken kontaktiert; alle Bibliotheken werden lokal aus `app/vendor/` ausgeliefert. Die Vorlage ruft selbst keine Datenquelle ab; eine abgeleitete App ergänzt den Abruf ihrer Datenquelle hier.

### Auslieferung an den ODAS

`make zip` erzeugt das Liefer-ZIP mit `app/`, `assets/`, `app-package.json` und
`CHANGELOG.md`. Die Infrastrukturdateien (`Dockerfile`, `docker-compose*.yml`,
`nginx.conf`, `Makefile`) sind nicht Teil der Auslieferung. Das ZIP ist ein Bauartefakt und wird nicht mitversioniert, sondern bei Bedarf mit `make zip` erzeugt.

## Autor

© 2026 Ondics GmbH
