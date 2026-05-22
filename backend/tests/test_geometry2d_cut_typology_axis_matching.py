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


if __name__ == "__main__":
    unittest.main()
