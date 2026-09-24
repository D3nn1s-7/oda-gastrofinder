import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools" / "build-places.py"


def geonames_row(identifier, name, lat, lng, country, modified="2026-09-01"):
    fields = [""] * 19
    fields[0] = str(identifier)
    fields[1] = name
    fields[4] = str(lat)
    fields[5] = str(lng)
    fields[8] = country
    fields[10] = "05"
    fields[11] = "1"
    fields[18] = modified
    return "\t".join(fields)


class PlacesBuilderTests(unittest.TestCase):
    def run_builder(self, rows, output):
        source_zip = output.with_suffix(".zip")
        with zipfile.ZipFile(source_zip, "w") as archive:
            archive.writestr("cities1000.txt", "\n".join(rows) + "\n")
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                str(source_zip),
                str(output),
                "--retrieved-at",
                "2026-09-22",
            ],
            capture_output=True,
            text=True,
        )

    def test_filters_to_germany_and_keeps_duplicate_names(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "orte-de.json"
            result = self.run_builder(
                [
                    geonames_row(20, "Neustadt", 50.0, 9.0, "DE"),
                    geonames_row(10, "Neustadt", 49.0, 8.0, "DE"),
                    geonames_row(30, "Wien", 48.2, 16.4, "AT"),
                ],
                output,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            data = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual([place["id"] for place in data["places"]], ["10", "20"])
            self.assertEqual([place["name"] for place in data["places"]], ["Neustadt", "Neustadt"])
            self.assertEqual(data["source"]["url"], "https://download.geonames.org/export/dump/cities1000.zip")
            self.assertEqual(data["source"]["license"], "CC BY 4.0")
            self.assertEqual(data["source"]["retrievedAt"], "2026-09-22")
            self.assertEqual(len(data["source"]["sha256"]), 64)
            self.assertEqual(data["source"]["maxModificationDate"], "2026-09-01")

    def test_malformed_rows_fail_loudly(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "orte-de.json"
            result = self.run_builder(
                [
                    geonames_row(10, "Gültig", 49.0, 8.0, "DE"),
                    "nur\twenig\tFelder",
                ],
                output,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Ungültige GeoNames-Zeile 2", result.stderr)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
