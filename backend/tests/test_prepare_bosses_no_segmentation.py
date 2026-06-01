"""Tests for boss preparation when step 3 has no boss segmentations."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from services.geometry2d.prepare_bosses import prepare_bosses_for_geometry2d

ROI_PARAMS = {
    "cx": 512.0,
    "cy": 512.0,
    "w": 400.0,
    "h": 300.0,
    "rotation_deg": 0.0,
    "scale": 1.0,
}


class PrepareBossesNoSegmentationTests(unittest.TestCase):
    def test_empty_boss_report_when_no_masks(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            (project_dir / "segmentations").mkdir(parents=True)

            payload = prepare_bosses_for_geometry2d(
                project_dir,
                roi_payload={"params": ROI_PARAMS, "image_path": "projection.png"},
            )

            self.assertEqual(payload["boss_count"], 0)
            self.assertEqual(payload["detection_mode"], "none")
            self.assertFalse(payload["sanity"]["has_any"])

            report_path = project_dir / "2d_geometry" / "boss_report.json"
            self.assertTrue(report_path.exists())
            saved = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertEqual(saved["bosses"], [])
            self.assertIsNone(saved["images"]["boss_mask_path"])


if __name__ == "__main__":
    unittest.main()
