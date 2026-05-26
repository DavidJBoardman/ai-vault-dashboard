import json
import tempfile
import unittest
from pathlib import Path
import sys
from unittest.mock import MagicMock


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

sys.modules.setdefault("cv2", MagicMock())

from services.geometry2d.cut_typology_matching_service import CutTypologyMatchingService


class CutTypologyAxisMatchingTests(unittest.TestCase):
    def test_axis_cut_labels_are_chosen_independently(self):
        variants = CutTypologyMatchingService()._build_variants(
            {"cx": 0.0, "cy": 0.0, "w": 100.0, "h": 100.0, "rotation_deg": 0.0, "scale": 1.0},
            {
                "starcutMin": 2,
                "starcutMax": 6,
                "includeStarcut": True,
                "includeInner": False,
                "includeOuter": False,
                "allowCrossTemplate": False,
                "tolerance": 0.02,
            },
        )

        match = CutTypologyMatchingService._build_axis_cut_match(
            boss_uv=(0.3210788971349534, 0.48258786546119137),
            variants=variants,
            tolerance=0.02,
        )

        self.assertEqual(match["xCut"], "starcut_n=3")
        self.assertEqual(match["yCut"], "starcut_n=2")
        self.assertAlmostEqual(match["xRatio"], 1.0 / 3.0, places=6)
        self.assertAlmostEqual(match["yRatio"], 0.5, places=6)
        self.assertLessEqual(match["xError"], 0.02)
        self.assertLessEqual(match["yError"], 0.02)

    def test_axis_cut_match_can_fail_per_axis(self):
        variants = CutTypologyMatchingService()._build_variants(
            {"cx": 0.0, "cy": 0.0, "w": 100.0, "h": 100.0, "rotation_deg": 0.0, "scale": 1.0},
            {
                "starcutMin": 2,
                "starcutMax": 3,
                "includeStarcut": True,
                "includeInner": False,
                "includeOuter": False,
                "allowCrossTemplate": False,
                "tolerance": 0.02,
            },
        )

        match = CutTypologyMatchingService._build_axis_cut_match(
            boss_uv=(0.3210788971349534, 0.48258786546119137),
            variants=variants,
            tolerance=0.02,
        )

        self.assertEqual(match["xCut"], "starcut_n=3")
        self.assertEqual(match["yCut"], "starcut_n=2")
        self.assertTrue(match["matched"])

    def test_axis_cut_match_exposes_candidates(self):
        variants = CutTypologyMatchingService()._build_variants(
            {"cx": 0.0, "cy": 0.0, "w": 100.0, "h": 100.0, "rotation_deg": 0.0, "scale": 1.0},
            {
                "starcutMin": 2,
                "starcutMax": 4,
                "includeStarcut": True,
                "includeInner": False,
                "includeOuter": False,
                "allowCrossTemplate": False,
                "tolerance": 0.02,
            },
        )

        match = CutTypologyMatchingService._build_axis_cut_match(
            boss_uv=(0.5, 0.5),
            variants=variants,
            tolerance=0.02,
        )

        self.assertIn("xCandidates", match)
        self.assertIn("yCandidates", match)
        # 0.5 hits the n=2 grid (ratio 0.5) and the n=4 grid (ratio 0.5).
        x_cuts = {c["cut"] for c in match["xCandidates"]}
        self.assertIn("starcut_n=2", x_cuts)
        self.assertIn("starcut_n=4", x_cuts)
        # First candidate is the priority winner (smallest n).
        self.assertEqual(match["xCandidates"][0]["cut"], "starcut_n=2")


class CutTypologyEvidencePersistenceTests(unittest.TestCase):
    def test_axis_evidence_written_with_candidates(self):
        service = CutTypologyMatchingService()
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp) / "proj"
            (project_dir / "2d_geometry" / "cut_typology_matching").mkdir(parents=True)
            service._write_axis_evidence(
                project_dir=project_dir,
                roi={"cx": 0.0, "cy": 0.0, "w": 100.0, "h": 100.0, "rotation_deg": 0.0, "scale": 1.0},
                params={"tolerance": 0.02},
                ran_at="2026-05-22T11:00:00",
                points_with_uv=[
                    {"id": 1, "label": "boss A", "pointType": "boss", "u": 0.5, "v": 0.5, "x": 100.0, "y": 100.0},
                ],
                axis_cut_matches_by_id={
                    1: {
                        "xCandidates": [{"cut": "starcut_n=2", "ratio": 0.5, "error": 0.0}],
                        "yCandidates": [{"cut": "starcut_n=2", "ratio": 0.5, "error": 0.0}],
                    }
                },
            )

            evidence = json.loads(service._axis_evidence_path(project_dir).read_text())
            self.assertEqual(len(evidence["bosses"]), 1)
            self.assertEqual(evidence["bosses"][0]["xCandidates"][0]["cut"], "starcut_n=2")

    def test_set_reading_rewrites_csv_picking_starcut(self):
        service = CutTypologyMatchingService()
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp) / "proj"
            (project_dir / "2d_geometry" / "cut_typology_matching").mkdir(parents=True)
            # One boss with both starcut and circlecut candidates on each axis.
            service._write_axis_evidence(
                project_dir=project_dir,
                roi={"cx": 50.0, "cy": 50.0, "w": 100.0, "h": 100.0, "rotation_deg": 0.0, "scale": 1.0},
                params={"tolerance": 0.02},
                ran_at="2026-05-22T11:00:00",
                points_with_uv=[
                    {"id": 1, "label": "boss A", "pointType": "boss", "u": 0.5, "v": 0.5, "x": 100.0, "y": 100.0},
                ],
                axis_cut_matches_by_id={
                    1: {
                        "xCandidates": [
                            {"cut": "circlecut_inner", "ratio": 0.5, "error": 0.001},
                            {"cut": "starcut_n=2", "ratio": 0.5, "error": 0.0},
                        ],
                        "yCandidates": [
                            {"cut": "circlecut_inner", "ratio": 0.5, "error": 0.002},
                            {"cut": "starcut_n=2", "ratio": 0.5, "error": 0.0},
                        ],
                    }
                },
            )
            result = service._set_reading_sync_with_dir(project_dir, "starcut")
            self.assertEqual(result["coverage"], 1.0)

            csv_path = service._matching_csv_path(project_dir)
            self.assertTrue(csv_path.exists())
            content = csv_path.read_text()
            self.assertIn("starcut_n=2", content)
            # circlecut_inner should NOT appear in this CSV because reading=starcut.
            self.assertNotIn("circlecut_inner", content)

    def test_set_reading_preserves_corner_rows(self):
        """Corner reference rows must survive a reading switch."""
        import csv as _csv
        service = CutTypologyMatchingService()
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp) / "proj"
            (project_dir / "2d_geometry" / "cut_typology_matching").mkdir(parents=True)
            service._write_axis_evidence(
                project_dir=project_dir,
                roi={"cx": 50.0, "cy": 50.0, "w": 100.0, "h": 100.0, "rotation_deg": 0.0, "scale": 1.0},
                params={"tolerance": 0.02},
                ran_at="2026-05-22T11:00:00",
                points_with_uv=[
                    {"id": 1, "label": "boss A", "pointType": "boss", "u": 0.5, "v": 0.5, "x": 100.0, "y": 100.0},
                    {"id": 2, "label": "Corner A", "pointType": "corner", "u": 0.0, "v": 0.0, "x": 0.0, "y": 0.0},
                    {"id": 3, "label": "Corner B", "pointType": "corner", "u": 1.0, "v": 0.0, "x": 100.0, "y": 0.0},
                ],
                axis_cut_matches_by_id={
                    1: {
                        "xCandidates": [{"cut": "starcut_n=2", "ratio": 0.5, "error": 0.0}],
                        "yCandidates": [{"cut": "starcut_n=2", "ratio": 0.5, "error": 0.0}],
                    },
                },
            )
            result = service._set_reading_sync_with_dir(project_dir, "starcut")

            # The summary metrics describe bosses only — corners aren't counted.
            self.assertEqual(result["total"], 1)
            self.assertEqual(result["matched"], 1)

            csv_path = service._matching_csv_path(project_dir)
            rows = list(_csv.DictReader(csv_path.open("r", encoding="utf-8")))
            self.assertEqual(len(rows), 3)
            corner_rows = [r for r in rows if r["point_type"] == "corner"]
            self.assertEqual(len(corner_rows), 2)
            for cr in corner_rows:
                self.assertEqual(cr["variant_label"], "roi_corner")
                self.assertEqual(cr["template_type"], "corner")
                self.assertEqual(cr["match_state"], "unmatched")


if __name__ == "__main__":
    unittest.main()
