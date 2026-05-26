"""End-to-end smoke test for the post-refactor Pipeline A path."""

import json
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from services.geometry2d.cut_typology_matching_service import CutTypologyMatchingService


class PipelineEquivalenceSmokeTests(TestCase):
    def _make_project(self, project_dir: Path) -> None:
        (project_dir / "2d_geometry").mkdir(parents=True, exist_ok=True)
        (project_dir / "2d_geometry" / "cut_typology_matching").mkdir(parents=True, exist_ok=True)
        roi_payload = {
            "params": {
                "cx": 500.0,
                "cy": 500.0,
                "w": 1000.0,
                "h": 1000.0,
                "rotation_deg": 0.0,
                "scale": 1.0,
            }
        }
        (project_dir / "2d_geometry" / "roi.json").write_text(json.dumps(roi_payload))

    def test_run_matching_produces_consistent_outputs(self):
        # Four bosses on a 3-grid (1/3 and 2/3 along each axis), in image
        # coords with cx=cy=500, w=h=1000 → u,v of 1/3 → x=y=333.
        points = [
            {"id": 1, "label": "b1", "x": 333, "y": 333, "pointType": "boss"},
            {"id": 2, "label": "b2", "x": 667, "y": 333, "pointType": "boss"},
            {"id": 3, "label": "b3", "x": 333, "y": 667, "pointType": "boss"},
            {"id": 4, "label": "b4", "x": 667, "y": 667, "pointType": "boss"},
        ]
        params = {
            "starcutMin": 2,
            "starcutMax": 4,
            "includeStarcut": True,
            "includeInner": False,
            "includeOuter": False,
            "tolerance": 0.03,
        }

        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            self._make_project(project_dir)

            with patch(
                "services.geometry2d.cut_typology_matching_service.get_project_dir",
                return_value=project_dir,
            ):
                service = CutTypologyMatchingService()
                payload = service._run_matching_sync(
                    project_id="test", params=params, points=points,
                )

        # Sanity: variants computed, best variant chosen, all bosses present.
        self.assertGreater(len(payload["variants"]), 0)
        self.assertIsNotNone(payload["bestVariantLabel"])

        boss_rows = [
            row for row in payload["perBoss"]
            if str(row.get("pointType", "boss")) != "corner"
        ]
        self.assertEqual(len(boss_rows), 4)

        # Every match[] entry must be derivable from the boss's axis
        # candidates: the (xTemplate or variantLabel) appears in xCandidates,
        # same for y.
        for row in boss_rows:
            axis_match = row.get("axisCutMatch") or {}
            x_labels = {str(c["cut"]) for c in (axis_match.get("xCandidates") or [])}
            y_labels = {str(c["cut"]) for c in (axis_match.get("yCandidates") or [])}
            for match in row["matches"]:
                if match.get("isCrossTemplate"):
                    self.assertIn(str(match["xTemplate"]), x_labels)
                    self.assertIn(str(match["yTemplate"]), y_labels)
                else:
                    self.assertIn(str(match["variantLabel"]), x_labels)
                    self.assertIn(str(match["variantLabel"]), y_labels)

        # Variant summary matchedCount must equal the number of boss rows
        # whose matches[] contains that variant.
        for variant_summary in payload["variants"]:
            label = str(variant_summary["variantLabel"])
            counted = sum(
                1 for row in boss_rows
                if any(str(m["variantLabel"]) == label for m in row["matches"])
            )
            self.assertEqual(variant_summary["matchedCount"], counted)

        # starcut_n=3 should match all four bosses on this fixture.
        starcut3 = next(
            (v for v in payload["variants"] if v["variantLabel"] == "starcut_n=3"),
            None,
        )
        self.assertIsNotNone(starcut3)
        self.assertEqual(starcut3["matchedCount"], 4)
