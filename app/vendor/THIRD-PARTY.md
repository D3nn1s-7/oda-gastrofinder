# Drittanbieter-Bibliotheken und Fonts

Alle Laufzeitdateien werden lokal aus `app/` geladen. Es gibt keine CDN- oder SRI-Abhängigkeit.

| Komponente | Version / Quelle | Lizenz / Datei | SHA-256 (geprüfte Datei) |
|---|---|---|---|
| Bootstrap CSS/JS | 5.3.8, aus `oda-generic` | MIT, `app/vendor/bootstrap/LICENSE` | CSS `d85327d99c7a3ee1f9b5d0500d1370acea3ad2db39c163c2f51f232baedbdede`; JS `e4fd49181388c48ec5040bd3fe66f57c29c8e67fcd8502b3354b96ec7ab47cc7` |
| Leaflet JS/CSS | 1.9.4, aus `oda-generic` | BSD-2-Clause, `app/vendor/leaflet/LICENSE` | JS `db49d009c841f5ca34a888c96511ae936fd9f5533e90d8b2c4d57596f4e5641a`; CSS `a7837102824184820dfa198d1ebcd109ff6d0ff9a2672a074b9a1b4d147d04c6` |
| Leaflet.markercluster JS/CSS | 1.5.3, `https://unpkg.com/leaflet.markercluster@1.5.3/dist/` bzw. GitHub Release-Tag `v1.5.3` | MIT, `app/vendor/markercluster/LICENSE` | JS `1e4e1d22972a3926f48598e0caf14e3fe7049835d428a344fed4f9e3665b3508`; Cluster-CSS `614dea0a98ff3f4ead74f04918f6b1d1b9ba435c25b5fc23b21a394d1e3e4d87`; Default-CSS `61258232d98d64dc2a7b1e02130d67421bc5b9bda5994eef70228ff97570c170` |
| QR-Code-Generator | `qrcode-generator` 1.4.4; minifizierte Datei ist byte-identisch zum [cdnjs-Artefakt](https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js); [npm-Paket 1.4.4](https://www.npmjs.com/package/qrcode-generator/v/1.4.4), [Upstream-Tag `js1.4.4`](https://github.com/kazuhikoarase/qrcode-generator/tree/js1.4.4) | MIT, `app/vendor/qrcode/LICENSE` ([Upstream-Lizenz](https://raw.githubusercontent.com/kazuhikoarase/qrcode-generator/js1.4.4/LICENSE)) | `qrcode.min.js` `164fc2c1c9eaf0a03aa8dfdb855e82e41a5c6922fbad8bb3238116207e26bef7` |
| Manrope Regular/Bold | Google Fonts, Projektstand der freigegebenen Studie | OFL 1.1, `app/vendor/fonts/LICENSE-Manrope.txt` | Regular `a13d9b41b0a471ce58f0e46d377fa3cc76615e4632c3b15eb397caadf7a13f0a`; Bold `b9584e099e0e7f1e1e914c3037aabb9010c50346a3ce8df5eeeeecc0563044d8` |
| Fraunces Medium | Google Fonts, Projektstand der freigegebenen Studie | OFL 1.1, `app/vendor/fonts/LICENSE-Fraunces.txt` | `0c2fad18ed36cc400041f1e281ee79954a329b345caffc38dfaa3bb8bcef57de` |

GeoNames `cities1000` und die DZT-/OpenStreetMap-Daten werden nicht als eigene Bibliothek gebündelt. Herkunft, Lizenz und Nutzungsgrenzen stehen in `app/data/README.md`, `app/data/LICENSE-GeoNames-CC-BY-4.0.txt` und `tests/evidence/dzt-contract.md`. OpenStreetMap-Kacheln werden zur Laufzeit mit sichtbarer Attribution geladen; DZT-Bilder werden nur mit eigenem Rechtenachweis verwendet.
