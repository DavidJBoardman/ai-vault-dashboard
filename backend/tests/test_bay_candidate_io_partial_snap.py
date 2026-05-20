"""Verify partial 4C matches produce an axis-only idealised position."""

import csv
import json
import tempfile
from pathlib import Path
from unittest import TestCase

from services.geometry2d.utils.bay_candidate_io import load_reference_rows


class PartialSnapTests(TestCase):
    def _setup_project(self, tmp: Path, match_rows):
        """Write minimal ROI + boss_report + match CSV so load_reference_rows runs."""
        # ROI in unit coords (cx=0.5, cy=0.5, w=1, h=1) makes image_to_unit a
        # straightforward x/imageWidth mapping when we use unit-valued boss uv.
        geom_dir = tmp / "2d_geometry"
        geom_dir.mkdir(parents=True, exist_ok=True)
        (geom_dir / "roi.json").write_text(
            json.dumps({
                "params": {"cx": 0.5, "cy": 0.5, "w": 1.0, "h": 1.0, "rotation_deg": 0.0, "scale": 1.0},
                "image_path": "",
            })
        )

        # Minimal boss_report.json with the measured UV. This populates base_rows
        # so the partial-match merge in load_reference_rows has something to
        # join against.
        bosses = []
        for row in match_rows:
            uv = row["_meas_uv"]
            bosses.append({
                "id": row["boss_id"],
                "centroid_uv": {"u": uv[0], "v": uv[1]},
            })
        (geom_dir / "boss_report.json").write_text(json.dumps({"bosses": bosses}))

        match_dir = geom_dir / "cut_typology_matching"
        match_dir.mkdir(parents=True, exist_ok=True)
        csv_path = match_dir / "boss_cut_typology_match.csv"
        # Use the same column set the production CSV writes.
        fieldnames = list(match_rows[0].keys())
        with csv_path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for row in match_rows:
                writer.writerow({k: v for k, v in row.items() if not k.startswith("_")})

    def _make_row(self, boss_id, label, meas_uv, *, x_ratio=None, y_ratio=None, match_state="unmatched"):
        u, v = meas_uv
        return {
            "boss_id": boss_id,
            "point_label": label,
            "point_type": "boss",
            "variant_label": "None",
            "template_type": "None",
            "x_cut": "starcut_n=2" if x_ratio is not None else "None",
            "y_cut": "starcut_n=2" if y_ratio is not None else "None",
            "x_ratio": "None" if x_ratio is None else str(x_ratio),
            "y_ratio": "None" if y_ratio is None else str(y_ratio),
            "boss_uv": str([u, v]),
            "template_uv": "None",
            "boss_xy": "[0, 0]",
            "template_xy": "None",
            "x_error": "0" if x_ratio is not None else "None",
            "y_error": "0" if y_ratio is not None else "None",
            "matched": "True" if match_state == "matched" else "False",
            "match_state": match_state,
            "_meas_uv": meas_uv,
        }

    def test_partial_x_only_uses_measured_v(self):
        with tempfile.TemporaryDirectory() as tmp_str:
            tmp = Path(tmp_str)
            self._setup_project(tmp, [
                self._make_row("b1", "boss A", (0.55, 0.3), x_ratio=0.5, match_state="partial"),
            ])
            resolved = {row["id"]: row for row in load_reference_rows(tmp)}
            row = resolved["b1"]
            self.assertEqual(row["source"], "partial")
            ideal = row["idealUv"]
            self.assertIsNotNone(ideal)
            self.assertAlmostEqual(ideal[0], 0.5)  # snapped to xRatio
            self.assertAlmostEqual(ideal[1], 0.3)  # measured v passthrough

    def test_partial_y_only_uses_measured_u(self):
        with tempfile.TemporaryDirectory() as tmp_str:
            tmp = Path(tmp_str)
            self._setup_project(tmp, [
                self._make_row("b2", "boss B", (0.2, 0.55), y_ratio=0.5, match_state="partial"),
            ])
            resolved = {row["id"]: row for row in load_reference_rows(tmp)}
            row = resolved["b2"]
            self.assertEqual(row["source"], "partial")
            self.assertAlmostEqual(row["idealUv"][0], 0.2)  # measured u
            self.assertAlmostEqual(row["idealUv"][1], 0.5)  # snapped to yRatio

    def test_unmatched_boss_has_no_ideal(self):
        with tempfile.TemporaryDirectory() as tmp_str:
            tmp = Path(tmp_str)
            self._setup_project(tmp, [
                self._make_row("b3", "boss C", (0.1, 0.1), match_state="unmatched"),
            ])
            resolved = {row["id"]: row for row in load_reference_rows(tmp)}
            row = resolved["b3"]
            self.assertIsNone(row.get("idealUv"))
            self.assertNotEqual(row["source"], "partial")
