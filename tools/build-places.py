#!/usr/bin/env python3
"""Build the German GeoNames cities1000 index used by Gastrofinder."""

import argparse
import hashlib
import json
import math
import re
import sys
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

SOURCE_URL = "https://download.geonames.org/export/dump/cities1000.zip"
SOURCE_LICENSE = "CC BY 4.0"
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("source_zip", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument(
        "--retrieved-at",
        default=datetime.now(timezone.utc).date().isoformat(),
    )
    return parser.parse_args()


def validate_date(value, label, line_number):
    if not DATE_PATTERN.fullmatch(value):
        raise ValueError(f"Ungültiges {label} in GeoNames-Zeile {line_number}")
    try:
        date.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f"Ungültiges {label} in GeoNames-Zeile {line_number}") from error


def read_places(source_zip):
    with zipfile.ZipFile(source_zip) as archive:
        if "cities1000.txt" not in archive.namelist():
            raise ValueError("Die ZIP-Datei enthält cities1000.txt nicht.")
        rows = archive.read("cities1000.txt").decode("utf-8").splitlines()

    places = []
    modification_dates = []
    for line_number, line in enumerate(rows, 1):
        fields = line.split("\t")
        if len(fields) != 19:
            raise ValueError(f"Ungültige GeoNames-Zeile {line_number}")
        identifier = fields[0]
        if not identifier.isdigit():
            raise ValueError(f"Ungültige GeoNames-ID in Zeile {line_number}")
        try:
            latitude = float(fields[4])
            longitude = float(fields[5])
        except ValueError as error:
            raise ValueError(f"Ungültige Koordinaten in GeoNames-Zeile {line_number}") from error
        if not math.isfinite(latitude) or not -90 <= latitude <= 90:
            raise ValueError(f"Ungültiger Breitengrad in GeoNames-Zeile {line_number}")
        if not math.isfinite(longitude) or not -180 <= longitude <= 180:
            raise ValueError(f"Ungültiger Längengrad in GeoNames-Zeile {line_number}")
        validate_date(fields[18], "Änderungsdatum", line_number)
        modification_dates.append(fields[18])
        if fields[8] != "DE":
            continue
        places.append(
            {
                "id": identifier,
                "name": fields[1],
                "admin1": fields[10],
                "admin2": fields[11],
                "lat": latitude,
                "lng": longitude,
            }
        )

    if not places:
        raise ValueError("Die Quelle enthält keinen deutschen Eintrag.")
    places.sort(key=lambda place: int(place["id"]))
    return places, max(modification_dates)


def main():
    args = parse_args()
    try:
        validate_date(args.retrieved_at, "Abrufdatum", 0)
        places, max_modification_date = read_places(args.source_zip)
        payload = {
            "source": {
                "url": SOURCE_URL,
                "license": SOURCE_LICENSE,
                "retrievedAt": args.retrieved_at,
                "sha256": hashlib.sha256(args.source_zip.read_bytes()).hexdigest(),
                "maxModificationDate": max_modification_date,
            },
            "places": places,
        }
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output_json.with_suffix(args.output_json.suffix + ".tmp")
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temporary.replace(args.output_json)
    except (OSError, UnicodeError, ValueError, zipfile.BadZipFile) as error:
        print(f"Fehler: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
