import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

sys.modules.setdefault("cv2", MagicMock())

from services.geometry2d.utils.bay_candidate_io import load_boss_match_records


def write_match_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "boss_id",
                "point_type",
                "matched",
                "x_cut",
                "y_cut",
                "boss_uv",
                "template_uv",
                "x_error",
                "y_error",
            ],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


class LoadBossMatchRecordsTests(unittest.TestCase):
    def _project(self, rows: list[dict] | None) -> Path:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        project_dir = Path(tmp.name)
        if rows is not None:
            write_match_csv(
                project_dir / "2d_geometry" / "cut_typology_matching" / "boss_cut_typology_match.csv",
                rows,
            )
        return project_dir

    def test_matched_boss_carries_cut_labels_and_errors(self) -> None:
        project_dir = self._project(rows=[{
            "boss_id": "B1",
            "point_type": "boss",
            "matched": "true",
            "x_cut": "starcut_n=3",
            "y_cut": "starcut_n=2",
            "boss_uv": "[0.33, 0.50]",
            "template_uv": "[0.333, 0.500]",
            "x_error": "0.004",
            "y_error": "0.002",
        }])

        records = load_boss_match_records(project_dir)

        self.assertIn("B1", records)
        record = records["B1"]
        self.assertEqual(record["matched"], True)
        self.assertEqual(record["xTemplateLabel"], "starcut_n=3")
        self.assertEqual(record["yTemplateLabel"], "starcut_n=2")
        self.assertAlmostEqual(record["xError"], 0.004)
        self.assertAlmostEqual(record["yError"], 0.002)

    def test_unmatched_boss_has_null_match_fields(self) -> None:
        project_dir = self._project(rows=[{
            "boss_id": "B2",
            "point_type": "boss",
            "matched": "false",
            "x_cut": "None",
            "y_cut": "None",
            "boss_uv": "[0.41, 0.62]",
            "template_uv": "None",
            "x_error": "None",
            "y_error": "None",
        }])

        records = load_boss_match_records(project_dir)

        self.assertIn("B2", records)
        record = records["B2"]
        self.assertEqual(record["matched"], False)
        self.assertIsNone(record["xTemplateLabel"])
        self.assertIsNone(record["yTemplateLabel"])
        self.assertIsNone(record["xError"])
        self.assertIsNone(record["yError"])

    def test_missing_csv_returns_empty_mapping(self) -> None:
        project_dir = self._project(rows=None)
        records = load_boss_match_records(project_dir)
        self.assertEqual(records, {})


if __name__ == "__main__":
    unittest.main()
