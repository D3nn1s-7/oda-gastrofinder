#!/usr/bin/env python3
"""Exercise the actual Makefile ZIP recipe in an isolated copy."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]

class PackageTest(unittest.TestCase):
    def test_command_targets_run_even_when_same_named_files_exist(self):
        with tempfile.TemporaryDirectory(prefix="odas-make-target-test-") as tmp:
            root = Path(tmp)
            shutil.copy2(ROOT / "Makefile", root / "Makefile")
            for target in ("up", "down", "down-volumes", "logs", "build", "bash", "ps", "config", "test", "zip", "check-app"):
                (root / target).touch()
                result = subprocess.run(["make", "--dry-run", target], cwd=root, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertNotIn("is up to date", result.stdout, target)
                self.assertNotIn("Nothing to be done", result.stdout, target)
                self.assertTrue(result.stdout.strip(), target)

    def test_rebuild_removes_deleted_members_and_ships_current_package(self):
        with tempfile.TemporaryDirectory(prefix="odas-package-test-") as tmp:
            root = Path(tmp) / ROOT.name
            root.mkdir()
            for name in ("app", "assets"):
                shutil.copytree(ROOT / name, root / name)
            for name in ("Makefile", "app-package.json", "CHANGELOG.md", "LICENSE"):
                shutil.copy2(ROOT / name, root / name)
            obsolete = root / "app" / "obsolete-test-member.txt"
            obsolete.write_text("must disappear from the rebuilt archive", encoding="utf-8")
            archive = root / (root.name + ".zip")
            def build():
                result = subprocess.run(["make", "zip"], cwd=root, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            build()
            with zipfile.ZipFile(archive) as first:
                self.assertIn("app/obsolete-test-member.txt", first.namelist())
            obsolete.unlink()
            package = json.loads((root / "app-package.json").read_text(encoding="utf-8"))
            package["app-version"] = "9.9.9"
            (root / "app-package.json").write_text(json.dumps(package), encoding="utf-8")
            build()
            with zipfile.ZipFile(archive) as rebuilt:
                names = rebuilt.namelist()
                self.assertNotIn("app/obsolete-test-member.txt", names)
                self.assertIn("LICENSE", names)
                self.assertEqual(rebuilt.read("app-package.json"), (root / "app-package.json").read_bytes())
                self.assertTrue(all(n.startswith(("app/", "assets/")) or n in
                                    ("app-package.json", "CHANGELOG.md", "LICENSE") for n in names))
                self.assertFalse(any("__pycache__" in n or n.endswith(".DS_Store") for n in names))
            self.assertEqual(list(root.glob(".odas-zip.*")), [])

if __name__ == "__main__":
    unittest.main()
