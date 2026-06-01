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

from services.geometry2d.utils.scale import (
    compute_metres_per_pixel,
    metres_per_pixel_from_metadata,
)


class MetresPerPixelFromMetadataTests(unittest.TestCase):
    def test_uses_larger_range_over_effective_resolution(self):
        # 10 m wide, 4 m tall projected into 1000 px with 5% margins each side
        # => effective_res = 900 px, max_range = 10 m => 10/900 m per pixel.
        metadata = {
            "resolution": 1000,
            "bounds": {"min_x": -5.0, "max_x": 5.0, "min_y": -2.0, "max_y": 2.0},
        }
        mpp = metres_per_pixel_from_metadata(metadata)
        self.assertIsNotNone(mpp)
        self.assertAlmostEqual(mpp, 10.0 / 900.0, places=9)

    def test_applies_user_scale_multiplier(self):
        metadata = {
            "resolution": 1000,
            "bounds": {"min_x": 0.0, "max_x": 9.0, "min_y": 0.0, "max_y": 1.0},
        }
        base = metres_per_pixel_from_metadata(metadata, scale=1.0)
        scaled = metres_per_pixel_from_metadata(metadata, scale=2.0)
        self.assertAlmostEqual(scaled, base * 2.0, places=9)

    def test_returns_none_when_bounds_missing(self):
        self.assertIsNone(metres_per_pixel_from_metadata({"resolution": 1000}))

    def test_returns_none_when_degenerate_range(self):
        metadata = {
            "resolution": 1000,
            "bounds": {"min_x": 1.0, "max_x": 1.0, "min_y": 2.0, "max_y": 2.0},
        }
        self.assertIsNone(metres_per_pixel_from_metadata(metadata))


class ComputeMetresPerPixelTests(unittest.TestCase):
    def _make_project(self, tmp: Path) -> Path:
        project_dir = tmp / "proj"
        (project_dir / "2d_geometry").mkdir(parents=True)
        (project_dir / "projections").mkdir(parents=True)
        roi = {
            "projection_id": "abc",
            "params": {"cx": 0, "cy": 0, "w": 10, "h": 10, "scale": 1.0},
        }
        (project_dir / "2d_geometry" / "roi.json").write_text(json.dumps(roi))
        metadata = {
            "resolution": 2000,
            "bounds": {"min_x": -3.0, "max_x": 3.0, "min_y": -1.0, "max_y": 1.0},
        }
        (project_dir / "projections" / "abc_metadata.json").write_text(json.dumps(metadata))
        return project_dir

    def test_reads_roi_and_projection_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = self._make_project(Path(tmp))
            mpp = compute_metres_per_pixel(project_dir)
            # 6 m range over (2000 * 0.9) = 1800 effective px.
            self.assertAlmostEqual(mpp, 6.0 / 1800.0, places=9)

    def test_returns_none_when_roi_absent(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(compute_metres_per_pixel(Path(tmp)))


if __name__ == "__main__":
    unittest.main()
