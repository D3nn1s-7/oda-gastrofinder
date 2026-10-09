# Ortsindex für den Gastrofinder

`orte-de.json` ist ein reproduzierbarer, nach Quell-ID sortierter Auszug aus GeoNames `cities1000` für die ausschließlich Offline erfolgende Auflösung des vom Portalbetreiber konfigurierten Ortes.

## Quelle und Lizenz

- Quelle: [GeoNames `cities1000.zip`](https://download.geonames.org/export/dump/cities1000.zip)
- Datenbank: [GeoNames](https://www.geonames.org/)
- Lizenz: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
- Volltext der Lizenz: `LICENSE-GeoNames-CC-BY-4.0.txt`
- Attribution: „This data is licensed under CC BY 4.0; © GeoNames.“

## Erzeugung und Prüfung

- Quelldatei: `cities1000.zip`
- Abrufdatum: 2026-10-08 (erneuter Abruf der offiziellen Quelle)
- SHA-256 der Quelldatei: `45fe6cd44e4b2228bb9fdfca5fc5841a83dbdc6cfa7b360d37e42366bd117838`
- Maximales Änderungsdatum in den ausgewerteten Quellzeilen: 2026-10-07
- Umfang: 7.652 deutsche Einträge

Umgebungsabhängiger Neuaufbau:

```bash
curl --fail --location https://download.geonames.org/export/dump/cities1000.zip -o cities1000.zip
python3 tools/build-places.py cities1000.zip app/data/orte-de.json --retrieved-at YYYY-MM-DD
```

Das Entwicklungsskript und die Tests gehören nicht zum Lieferumfang. Die ZIP-Datei wird nicht in das App-Paket übernommen.

## Grenzen

`cities1000` umfasst Orte nach den GeoNames-Kriterien, insbesondere populationstarke Orte und ausgewählte Verwaltungssitze. Der Auszug ist **kein vollständiges Gemeindeverzeichnis**. Namen können mehrdeutig sein; dann muss der Portalbetreiber ein vollständiges explizites Koordinatenpaar konfigurieren. `admin1` und `admin2` sind unveränderte Quellcodes und werden nicht in eigenständige Gebietsbezeichnungen übersetzt.
