import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.app_paths import resolve_e57_path


class ResolveE57PathTests(unittest.TestCase):
    def test_returns_existing_absolute_path_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            scan = Path(tmp) / "scan.e57"
            scan.write_text("e57", encoding="utf-8")
            self.assertEqual(resolve_e57_path(str(scan)), str(scan))

    def test_resolves_basename_against_uploads_dir(self):
        # Legacy projects (Electron >=32 drag-drop) stored only the basename.
        with tempfile.TemporaryDirectory() as tmp:
            uploads = Path(tmp) / "uploads"
            uploads.mkdir()
            stored_copy = uploads / "abc123_scan.e57"
            stored_copy.write_text("e57", encoding="utf-8")
            resolved = resolve_e57_path("scan.e57", uploads_dir=uploads)
            self.assertEqual(resolved, str(stored_copy))

    def test_resolves_exact_name_in_uploads_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            uploads = Path(tmp) / "uploads"
            uploads.mkdir()
            stored_copy = uploads / "scan.e57"
            stored_copy.write_text("e57", encoding="utf-8")
            resolved = resolve_e57_path("scan.e57", uploads_dir=uploads)
            self.assertEqual(resolved, str(stored_copy))

    def test_returns_none_for_empty_or_missing(self):
        self.assertIsNone(resolve_e57_path(None))
        self.assertIsNone(resolve_e57_path(""))
        with tempfile.TemporaryDirectory() as tmp:
            uploads = Path(tmp) / "uploads"
            uploads.mkdir()
            self.assertIsNone(resolve_e57_path("missing.e57", uploads_dir=uploads))

    def test_does_not_guess_when_multiple_matches(self):
        # Ambiguous basename -> refuse to guess rather than load the wrong scan.
        with tempfile.TemporaryDirectory() as tmp:
            uploads = Path(tmp) / "uploads"
            uploads.mkdir()
            (uploads / "abc_scan.e57").write_text("e57", encoding="utf-8")
            (uploads / "def_scan.e57").write_text("e57", encoding="utf-8")
            self.assertIsNone(resolve_e57_path("scan.e57", uploads_dir=uploads))


if __name__ == "__main__":
    unittest.main()
