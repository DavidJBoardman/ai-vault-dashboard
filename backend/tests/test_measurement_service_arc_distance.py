import unittest
from pathlib import Path
import sys

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


if __name__ == "__main__":
    unittest.main()