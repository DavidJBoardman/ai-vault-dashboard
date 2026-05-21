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

from services.geometry2d.utils.bay_candidate_io import load_reference_rows
from services.geometry2d.utils.bay_candidate_cv import collect_boss_nodes


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def write_match_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "boss_id",
                "point_type",
                "matched",
                "boss_uv",
                "template_uv",
            ],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


class BayPlanMeasuredPrecedenceTests(unittest.TestCase):
    def make_project(self, *, csv_rows: list[dict]) -> Path:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        project_dir = Path(tmp.name)
        write_json(
            project_dir / "2d_geometry" / "roi.json",
            {
                "params": {
                    "cx": 50.0,
                    "cy": 50.0,
                    "w": 100.0,
                    "h": 100.0,
                    "rotation_deg": 0.0,
                    "scale": 1.0,
                }
            },
        )
        write_json(
            project_dir / "2d_geometry" / "cut_typology_matching" / "node_points.json",
            {
                "points": [
                    {
                        "id": row["boss_id"],
                        "label": row["boss_id"],
                        "x": 23.0,
                        "y": 34.0,
                        "pointType": "boss",
                        "source": "manual",
                    }
                    for row in csv_rows
                ]
            },
        )
        write_match_csv(
            project_dir / "2d_geometry" / "cut_typology_matching" / "boss_cut_typology_match.csv",
            csv_rows,
        )
        return project_dir

    def test_matched_boss_keeps_measured_uv_as_primary(self) -> None:
        project_dir = self.make_project(csv_rows=[{
            "boss_id": "B1",
            "point_type": "boss",
            "matched": "true",
            "boss_uv": "[0.23, 0.34]",
            "template_uv": "[0.5, 0.5]",
        }])

        rows = load_reference_rows(project_dir)
        bosses = [r for r in rows if r["pointType"] == "boss"]

        self.assertEqual(len(bosses), 1)
        self.assertEqual(bosses[0]["id"], "B1")
        self.assertAlmostEqual(bosses[0]["uv"][0], 0.23)
        self.assertAlmostEqual(bosses[0]["uv"][1], 0.34)
        self.assertIn(bosses[0]["source"], ("manual", "raw"))

    def test_matched_boss_carries_ideal_uv_alongside_measured(self) -> None:
        project_dir = self.make_project(csv_rows=[{
            "boss_id": "B1",
            "point_type": "boss",
            "matched": "true",
            "boss_uv": "[0.23, 0.34]",
            "template_uv": "[0.5, 0.5]",
        }])

        rows = load_reference_rows(project_dir)
        bosses = [r for r in rows if r["pointType"] == "boss"]

        self.assertIn("idealUv", bosses[0])
        self.assertIsNotNone(bosses[0]["idealUv"])
        self.assertAlmostEqual(bosses[0]["idealUv"][0], 0.5)
        self.assertAlmostEqual(bosses[0]["idealUv"][1], 0.5)

    def test_unmatched_boss_has_null_ideal_uv(self) -> None:
        project_dir = self.make_project(csv_rows=[{
            "boss_id": "B2",
            "point_type": "boss",
            "matched": "false",
            "boss_uv": "[0.41, 0.62]",
            "template_uv": "None",
        }])

        rows = load_reference_rows(project_dir)
        bosses = [r for r in rows if r["pointType"] == "boss"]

        self.assertEqual(len(bosses), 1)
        self.assertAlmostEqual(bosses[0]["uv"][0], 0.41)
        self.assertAlmostEqual(bosses[0]["uv"][1], 0.62)
        self.assertIn("idealUv", bosses[0])
        self.assertIsNone(bosses[0]["idealUv"])

    def test_collect_boss_nodes_populates_ideal_xy_from_row(self) -> None:
        roi = {
            "cx": 50.0,
            "cy": 50.0,
            "w": 100.0,
            "h": 100.0,
            "rotation_deg": 0.0,
            "scale": 1.0,
        }
        rows = [
            {"id": "B1", "label": "B1", "uv": (0.2, 0.3), "idealUv": (0.5, 0.5), "source": "manual"},
            {"id": "B2", "label": "B2", "uv": (0.7, 0.8), "idealUv": None, "source": "raw"},
        ]

        nodes = collect_boss_nodes(roi=roi, boss_rows=rows)

        self.assertEqual(len(nodes), 2)
        self.assertEqual(nodes[0].uv, (0.2, 0.3))
        self.assertIsNotNone(nodes[0].ideal_uv)
        self.assertAlmostEqual(nodes[0].ideal_uv[0], 0.5)
        self.assertAlmostEqual(nodes[0].ideal_uv[1], 0.5)
        self.assertIsNotNone(nodes[0].ideal_xy)
        self.assertIsNone(nodes[1].ideal_uv)
        self.assertIsNone(nodes[1].ideal_xy)


if __name__ == "__main__":
    unittest.main()
