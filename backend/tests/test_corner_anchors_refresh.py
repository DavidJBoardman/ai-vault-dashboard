import unittest
from pathlib import Path
import sys
from typing import Dict
from unittest.mock import MagicMock

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
sys.modules.setdefault("cv2", MagicMock())

from services.geometry2d.utils.corner_anchors import (
    CORNER_REFERENCE_SPECS,
    refresh_corner_points,
)


ROI_A: Dict[str, float] = {
    "cx": 100.0,
    "cy": 100.0,
    "w": 200.0,
    "h": 200.0,
    "rotation_deg": 0.0,
    "scale": 1.0,
}
ROI_B: Dict[str, float] = {
    "cx": 300.0,
    "cy": 250.0,
    "w": 400.0,
    "h": 300.0,
    "rotation_deg": 0.0,
    "scale": 1.0,
}


class RefreshCornerPointsTests(unittest.TestCase):
    def test_appends_four_corners_when_input_has_none(self):
        points = [
            {"id": 1, "label": "boss stone A", "x": 110.0, "y": 110.0,
             "source": "auto", "pointType": "boss"},
        ]
        result = refresh_corner_points(points, ROI_A)

        bosses = [p for p in result if p["pointType"] == "boss"]
        corners = [p for p in result if p["pointType"] == "corner"]
        self.assertEqual(len(bosses), 1)
        self.assertEqual(len(corners), 4)
        self.assertEqual({c["label"] for c in corners},
                         {label for label, _ in CORNER_REFERENCE_SPECS})

    def test_corner_positions_track_roi(self):
        result = refresh_corner_points([], ROI_A)
        corners = {c["label"]: (c["x"], c["y"]) for c in result}
        # ROI_A center (100,100), w=h=200, rotation=0 → corners at (0,0)..(200,200)
        self.assertAlmostEqual(corners["Corner C"][0], 0.0, places=3)
        self.assertAlmostEqual(corners["Corner C"][1], 0.0, places=3)
        self.assertAlmostEqual(corners["Corner B"][0], 200.0, places=3)
        self.assertAlmostEqual(corners["Corner B"][1], 200.0, places=3)

    def test_strips_stale_corners_and_replaces(self):
        points = [
            {"id": 1, "label": "boss stone A", "x": 50.0, "y": 50.0,
             "source": "auto", "pointType": "boss"},
            {"id": 99, "label": "Corner C", "x": -999.0, "y": -999.0,
             "source": "auto", "pointType": "corner"},
        ]
        result = refresh_corner_points(points, ROI_A)
        corner_c = next(c for c in result if c["label"] == "Corner C")
        # Stale -999/-999 must be discarded; refreshed Corner C lives at ROI TL.
        self.assertAlmostEqual(corner_c["x"], 0.0, places=3)
        self.assertAlmostEqual(corner_c["y"], 0.0, places=3)

    def test_corners_move_when_roi_changes(self):
        result_a = refresh_corner_points([], ROI_A)
        result_b = refresh_corner_points([], ROI_B)
        c_a = next(c for c in result_a if c["label"] == "Corner B")
        c_b = next(c for c in result_b if c["label"] == "Corner B")
        # Different ROI → different absolute coords for "Corner B" (BR).
        self.assertNotAlmostEqual(c_a["x"], c_b["x"], places=1)

    def test_preserves_boss_rows_unchanged(self):
        points = [
            {"id": 1, "label": "boss stone A", "x": 110.0, "y": 110.0,
             "source": "manual", "pointType": "boss"},
            {"id": 2, "label": "boss stone B", "x": 150.0, "y": 90.0,
             "source": "auto", "pointType": "boss"},
        ]
        result = refresh_corner_points(points, ROI_A)
        bosses = sorted(
            (p for p in result if p["pointType"] == "boss"),
            key=lambda p: p["id"],
        )
        self.assertEqual(bosses[0]["x"], 110.0)
        self.assertEqual(bosses[0]["source"], "manual")
        self.assertEqual(bosses[1]["label"], "boss stone B")

    def test_idempotent(self):
        once = refresh_corner_points([], ROI_A)
        twice = refresh_corner_points(once, ROI_A)
        self.assertEqual(len(twice), len(once))
        self.assertEqual(
            sorted(p["label"] for p in twice),
            sorted(p["label"] for p in once),
        )

    def test_corner_ids_do_not_collide_with_bosses(self):
        points = [
            {"id": 1, "label": "boss A", "x": 1.0, "y": 1.0,
             "source": "auto", "pointType": "boss"},
            {"id": 7, "label": "boss B", "x": 2.0, "y": 2.0,
             "source": "auto", "pointType": "boss"},
        ]
        result = refresh_corner_points(points, ROI_A)
        ids = [p["id"] for p in result]
        self.assertEqual(len(ids), len(set(ids)))


import json
import tempfile

from services.geometry2d.cut_typology_matching_service import CutTypologyMatchingService


class CutTypologyServiceCornerRefreshTests(unittest.TestCase):
    def _write_project(
        self,
        project_dir: Path,
        roi_params: Dict[str, float],
        saved_points: list,
    ) -> None:
        geom_dir = project_dir / "2d_geometry"
        geom_dir.mkdir(parents=True, exist_ok=True)
        (geom_dir / "roi.json").write_text(json.dumps({"params": roi_params}))
        boss_report = {
            "bosses": [
                {"id": 1, "label": "boss stone A",
                 "centroid_xy": {"x": 110.0, "y": 110.0}},
            ]
        }
        (geom_dir / "boss_report.json").write_text(json.dumps(boss_report))

        cut_dir = geom_dir / "cut_typology_matching"
        cut_dir.mkdir(parents=True, exist_ok=True)
        (cut_dir / "node_points.json").write_text(
            json.dumps({"points": saved_points})
        )

    def test_read_or_build_refreshes_corners_against_current_roi(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            # Persisted file contains a stale corner that does not match the
            # current ROI; the read path should overwrite it.
            stale_points = [
                {"id": 1, "label": "boss stone A", "x": 110.0, "y": 110.0,
                 "source": "manual", "pointType": "boss"},
                {"id": 2, "label": "Corner C", "x": -999.0, "y": -999.0,
                 "source": "auto", "pointType": "corner"},
            ]
            self._write_project(project_dir, dict(ROI_A), stale_points)

            service = CutTypologyMatchingService()
            points = service._read_or_build_points(project_dir)

            corners = [p for p in points if p["pointType"] == "corner"]
            self.assertEqual(len(corners), 4)
            corner_c = next(c for c in corners if c["label"] == "Corner C")
            self.assertAlmostEqual(corner_c["x"], 0.0, places=3)
            self.assertAlmostEqual(corner_c["y"], 0.0, places=3)

            # Manual boss edit must survive.
            boss = next(p for p in points if p["pointType"] == "boss")
            self.assertEqual(boss["x"], 110.0)
            self.assertEqual(boss["source"], "manual")


if __name__ == "__main__":
    unittest.main()
