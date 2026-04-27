import unittest
from pathlib import Path
import sys
from unittest.mock import patch

import numpy as np


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.measurement_service import MeasurementService


class MeasurementServiceArcDistanceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = MeasurementService()

        center = np.array([2.0, -1.0, 4.0], dtype=float)
        u_raw = np.array([1.0, 1.0, 0.3], dtype=float)
        v_raw = np.array([-0.2, 0.5, 1.0], dtype=float)
        u = u_raw / np.linalg.norm(u_raw)
        v = v_raw - np.dot(v_raw, u) * u
        v = v / np.linalg.norm(v)

        self.center = center
        self.u = u
        self.v = v
        self.radius = 3.2
        self.start_angle = -0.9
        self.end_angle = 1.1

        self.arc_params = {
            "center": {"x": float(center[0]), "y": float(center[1]), "z": float(center[2])},
            "radius": float(self.radius),
            "basis_u": {"x": float(u[0]), "y": float(u[1]), "z": float(u[2])},
            "basis_v": {"x": float(v[0]), "y": float(v[1]), "z": float(v[2])},
            "start_angle": float(self.start_angle),
            "end_angle": float(self.end_angle),
        }

    def _points_on_arc(self, angles: np.ndarray) -> np.ndarray:
        return (
            self.center
            + (self.radius * np.cos(angles))[:, np.newaxis] * self.u
            + (self.radius * np.sin(angles))[:, np.newaxis] * self.v
        )

    def test_points_on_rotated_finite_arc_are_near_zero(self) -> None:
        angles = np.linspace(self.start_angle, self.end_angle, 80)
        points = self._points_on_arc(angles)

        distances = self.service._calculate_point_distances_from_arc(points, self.arc_params)

        self.assertLess(float(np.max(distances)), 1e-9)

    def test_local_perturbation_creates_local_distance_spike(self) -> None:
        angles = np.linspace(self.start_angle, self.end_angle, 80)
        points = self._points_on_arc(angles)
        points[30:40] = points[30:40] + np.array([0.0, 0.0, 0.08])

        distances = self.service._calculate_point_distances_from_arc(points, self.arc_params)

        self.assertGreater(float(np.mean(distances[30:40])), 0.02)
        self.assertLess(float(np.mean(distances[:10])), 1e-4)

    def test_distance_is_clamped_to_finite_arc_endpoints(self) -> None:
        outside_angle = self.end_angle + 0.45
        point = self._points_on_arc(np.array([outside_angle]))[0]
        points = np.array([point])

        distance = float(
            self.service._calculate_point_distances_from_arc(points, self.arc_params)[0]
        )
        expected = float(2.0 * self.radius * np.sin((outside_angle - self.end_angle) / 2.0))

        self.assertAlmostEqual(distance, expected, places=6)


class MeasurementServiceFitErrorSemanticsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = MeasurementService()

    @staticmethod
    def _synthetic_arc_points(
        radius: float = 5.0,
        n: int = 80,
        start: float = -1.2,
        end: float = 1.2,
    ) -> np.ndarray:
        t = np.linspace(start, end, n)
        x = radius * np.cos(t)
        y = 0.2 * np.sin(2.0 * t)
        z = radius * np.sin(t) + 4.0
        return np.column_stack([x, y, z])

    def test_single_measurement_fit_error_matches_point_distance_rmse(self) -> None:
        pts = self._synthetic_arc_points()
        pts[20:30, 2] += 0.05
        self.service.traces["rib-a"] = pts

        result = self.service._calculate("rib-a", 0.0, 1.0)
        expected = float(np.sqrt(np.mean(np.square(np.asarray(result["point_distances"], dtype=float)))))

        self.assertAlmostEqual(float(result["fit_error"]), expected, places=10)

    def test_group_measurement_fit_error_matches_point_distance_rmse(self) -> None:
        pts = self._synthetic_arc_points()
        pts[35:45, 2] += 0.07

        self.service.traces["rib-1"] = pts[:40]
        self.service.traces["rib-2"] = pts[40:]

        merged = np.vstack([self.service.traces["rib-1"], self.service.traces["rib-2"]])
        arc = self.service._fit_arc(merged)
        dists = self.service._calculate_point_distances_from_arc(merged, arc)
        expected = self.service._calculate_fit_error_from_distances(dists)

        grouped = self.service.calculate_group_measurements(["rib-1", "rib-2"])
        self.assertAlmostEqual(float(grouped["fit_error"]), expected, places=10)

    def test_fallback_fit_error_is_not_fixed_constant(self) -> None:
        pts_a = self._synthetic_arc_points(radius=4.0)
        pts_b = self._synthetic_arc_points(radius=7.0)

        with patch("services.measurement_service.optimize.least_squares", side_effect=RuntimeError("boom")):
            fit_a = self.service._fit_arc(pts_a)
            fit_b = self.service._fit_arc(pts_b)

        self.assertTrue(np.isfinite(float(fit_a["error"])))
        self.assertTrue(np.isfinite(float(fit_b["error"])))
        self.assertGreaterEqual(float(fit_a["error"]), 0.0)
        self.assertGreaterEqual(float(fit_b["error"]), 0.0)
        self.assertNotEqual(float(fit_a["error"]), 0.5)
        self.assertNotEqual(float(fit_b["error"]), 0.5)
        self.assertNotAlmostEqual(float(fit_a["error"]), float(fit_b["error"]), places=12)


if __name__ == "__main__":
    unittest.main()