"""Schema-level checks for the 4C match CSV partial-match columns."""

import csv
import tempfile
from pathlib import Path
from unittest import TestCase

from services.geometry2d.cut_typology_matching_service import CutTypologyMatchingService


class WriteMatchCsvAxisColumnsTests(TestCase):
    def _write(self, per_boss_rows):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            (project_dir / "2d_geometry" / "cut_typology_matching").mkdir(parents=True, exist_ok=True)
            roi = {"cx": 0.5, "cy": 0.5, "w": 1.0, "h": 1.0, "rotation_deg": 0.0}
            CutTypologyMatchingService._write_match_csv(project_dir, roi, per_boss_rows)
            csv_path = project_dir / "2d_geometry" / "cut_typology_matching" / "boss_cut_typology_match.csv"
            return list(csv.DictReader(csv_path.open("r", encoding="utf-8")))

    def test_full_match_row_emits_matched_state(self):
        rows = self._write([
            {
                "id": "b1",
                "label": "boss A",
                "u": 0.5,
                "v": 0.5,
                "x": 100,
                "y": 100,
                "pointType": "boss",
                "matches": [
                    {"variantLabel": "starcut_n=2", "templateType": "starcut", "u": 0.5, "v": 0.5}
                ],
                "axisCutMatch": {
                    "xCut": "starcut_n=2", "yCut": "starcut_n=2",
                    "xRatio": 0.5, "yRatio": 0.5,
                    "xError": 0.0, "yError": 0.0,
                    "matched": True,
                },
            }
        ])
        self.assertEqual(rows[0]["match_state"], "matched")
        self.assertEqual(rows[0]["x_ratio"], "0.5")
        self.assertEqual(rows[0]["y_ratio"], "0.5")

    def test_partial_x_only_emits_partial_state(self):
        rows = self._write([
            {
                "id": "b2",
                "label": "boss B",
                "u": 0.5,
                "v": 0.3,
                "x": 100,
                "y": 80,
                "pointType": "boss",
                "matches": [],
                "axisCutMatch": {
                    "xCut": "starcut_n=2", "yCut": None,
                    "xRatio": 0.5, "yRatio": None,
                    "xError": 0.0, "yError": None,
                    "matched": False,
                },
            }
        ])
        self.assertEqual(rows[0]["match_state"], "partial")
        self.assertEqual(rows[0]["x_ratio"], "0.5")
        self.assertEqual(rows[0]["y_ratio"], "None")
        self.assertEqual(rows[0]["template_uv"], "None")

    def test_partial_y_only_emits_partial_state(self):
        rows = self._write([
            {
                "id": "b3",
                "label": "boss C",
                "u": 0.2,
                "v": 0.5,
                "x": 50,
                "y": 100,
                "pointType": "boss",
                "matches": [],
                "axisCutMatch": {
                    "xCut": None, "yCut": "starcut_n=2",
                    "xRatio": None, "yRatio": 0.5,
                    "xError": None, "yError": 0.0,
                    "matched": False,
                },
            }
        ])
        self.assertEqual(rows[0]["match_state"], "partial")
        self.assertEqual(rows[0]["x_ratio"], "None")
        self.assertEqual(rows[0]["y_ratio"], "0.5")

    def test_unmatched_emits_unmatched_state(self):
        rows = self._write([
            {
                "id": "b4",
                "label": "boss D",
                "u": 0.1,
                "v": 0.1,
                "x": 20,
                "y": 20,
                "pointType": "boss",
                "matches": [],
                "axisCutMatch": {
                    "xCut": None, "yCut": None,
                    "xRatio": None, "yRatio": None,
                    "xError": None, "yError": None,
                    "matched": False,
                },
            }
        ])
        self.assertEqual(rows[0]["match_state"], "unmatched")

    def test_corner_rows_stay_unmatched(self):
        rows = self._write([
            {
                "id": "c1",
                "label": "corner A",
                "u": 0.0,
                "v": 0.0,
                "x": 0,
                "y": 0,
                "pointType": "corner",
                "matches": [],
                "axisCutMatch": None,
            }
        ])
        self.assertEqual(rows[0]["match_state"], "unmatched")
        self.assertEqual(rows[0]["x_ratio"], "None")
        self.assertEqual(rows[0]["y_ratio"], "None")
