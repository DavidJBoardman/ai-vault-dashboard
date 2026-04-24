"""Measurement service for 3D geometric calculations."""

import asyncio
import math
import os
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
from scipy import optimize


class MeasurementService:
    """Service for calculating geometric measurements on vault ribs."""
    
    def __init__(self):
        self.traces: Dict[str, np.ndarray] = {}
        self.measurements: Dict[str, Dict[str, Any]] = {}
        self.hypotheses: Dict[str, Dict[str, Any]] = {}
        self.last_grouping_diagnostics: Optional[Dict[str, Any]] = None
    
    async def calculate(
        self,
        trace_id: str,
        segment_start: float,
        segment_end: float,
    ) -> Dict[str, Any]:
        """Calculate measurements for a trace segment."""
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            self._calculate,
            trace_id,
            segment_start,
            segment_end,
        )
        return result
    
    def _calculate(
        self,
        trace_id: str,
        segment_start: float,
        segment_end: float,
    ) -> Dict[str, Any]:
        """Internal measurement calculation."""
        
        # Get trace points
        if trace_id not in self.traces:
            # Generate demo trace
            self.traces[trace_id] = self._generate_demo_trace()
        
        points = self.traces[trace_id]
        
        # Extract segment
        n_points = len(points)
        start_idx = int(segment_start * n_points)
        end_idx = int(segment_end * n_points)
        segment = points[start_idx:end_idx]
        
        if len(segment) < 3:
            segment = points  # Use full trace if segment too small
        
        # Calculate arc parameters
        arc_params = self._fit_arc(segment)

        # Calculate point distances from arc for visualization
        point_distances = self._calculate_point_distances_from_arc(segment, arc_params)
        
        # Calculate rib length
        rib_length = self._calculate_length(segment)

        # Find apex and springing points
        apex = self._find_apex(segment)
        springing = self._find_springing_points(segment)
        
        # Convert segment points to list format for API response
        segment_points = segment.tolist()
        
        return {
            "arc_radius": arc_params["radius"],
            "rib_length": rib_length,
            "apex_point": apex,
            "springing_points": springing,
            "fit_error": arc_params["error"],
            "point_distances": point_distances.tolist(),
            "segment_points": segment_points,
            "arc_center": arc_params["center"],
            "arc_basis_u": arc_params["basis_u"],
            "arc_basis_v": arc_params["basis_v"],
            "arc_start_angle": arc_params["start_angle"],
            "arc_end_angle": arc_params["end_angle"],
        }

    def calculate_impost_line(
        self,
        boundary_margin: float = 0.5,
        min_rise: float = 1.0,
        impost_height: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Calculate impost line and per-rib impost distance.

        impost_distance = springing_point_z - global_impost_height

        The impost height in Auto mode is the median of springing-point Z values
        (where the ribs leave the wall/pier), not the arc-centre Z, which can sit
        far below the floor depending on arch geometry.

        Args:
            boundary_margin: Margin from vault boundary to identify springing ribs
            min_rise: Minimum rise (Z range) to consider a rib
            impost_height: User-defined impost line height (e.g., floor plane Z).
                          If None, calculated as median of springing-point Z values.
        """

        if not self.traces:
            raise ValueError("No ribs available for impost calculation.")

        # Compute global XY bounds
        all_points = np.vstack(list(self.traces.values()))
        x_vals = all_points[:, 0]
        y_vals = all_points[:, 1]

        x_min, x_max = x_vals.min(), x_vals.max()
        y_min, y_max = y_vals.min(), y_vals.max()

        candidate_z = []
        rib_data: Dict[str, Dict[str, Any]] = {}

        for rib_id, points in self.traces.items():
            if len(points) < 3:
                continue

            z_vals = points[:, 2]
            z_min = float(z_vals.min())
            z_max = float(z_vals.max())
            z_range = z_max - z_min

            # Filter by rise
            if z_range < min_rise:
                continue

            min_idx = int(np.argmin(z_vals))
            x_low, y_low = points[min_idx][0], points[min_idx][1]

            near_boundary = (
                (x_low < x_min + boundary_margin) or
                (x_low > x_max - boundary_margin) or
                (y_low < y_min + boundary_margin) or
                (y_low > y_max - boundary_margin)
            )

            if not near_boundary:
                continue

            # Use springing-point Z as the candidate for auto impost height
            springing_z = float(points[min_idx][2])
            candidate_z.append(springing_z)

            # Still fit the arc so we can expose the arc centre if needed
            arc_params = self._fit_arc(points)

            rib_data[rib_id] = {
                "arc_center_z": float(arc_params["center"]["z"]),
                "arc_center": arc_params["center"],
                "springing_z": springing_z,
                "springing_point": {
                    "x": float(points[min_idx][0]),
                    "y": float(points[min_idx][1]),
                    "z": springing_z,
                },
            }

        if not candidate_z:
            raise ValueError("No ribs identified as springing ribs.")

        # Auto: median of springing-point Z values (architecturally correct reference).
        # Floor-plane: use the value provided by the user.
        if impost_height is None:
            impost_height = float(np.median(candidate_z))
        else:
            impost_height = float(impost_height)

        # impost_distance = how far each springing point sits above the impost line
        for rib_id in rib_data:
            springing_z = rib_data[rib_id]["springing_z"]
            rib_data[rib_id]["impost_distance"] = float(springing_z - impost_height)

        return {
            "impost_height": impost_height,
            "num_ribs_used": len(rib_data),
            "ribs": rib_data,
        }
    
    async def _async_calculate_impost_line(
        self,
        boundary_margin: float = 0.5,
        min_rise: float = 1.0,
        impost_height: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Async wrapper for impost line calculation."""
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            self.calculate_impost_line,
            boundary_margin,
            min_rise,
            impost_height,
        )
        return result
    
    def _generate_demo_trace(self) -> np.ndarray:
        """Generate a demo rib trace."""
        
        # Create a curved rib profile
        t = np.linspace(0, np.pi, 100)
        
        # Parametric curve for a pointed arch rib
        x = 5 * np.sin(t)
        y = np.zeros_like(t)
        z = 5 * (1 - np.cos(t))
        
        # Add some noise
        x += np.random.normal(0, 0.02, len(t))
        y += np.random.normal(0, 0.02, len(t))
        z += np.random.normal(0, 0.02, len(t))
        
        return np.column_stack([x, y, z])
    
    def _fit_arc(self, points: np.ndarray) -> Dict[str, Any]:
        """Fit a circular arc to the points."""
        
        # Project to 2D (XZ plane for simplicity)
        centroid = np.mean(points, axis=0)
        U, S, Vt = np.linalg.svd(points - centroid)
        u = Vt[0]
        v = Vt[1]

        coords2d = np.dot(points - centroid, np.vstack((u, v)).T)
        x = coords2d[:, 0]
        z = coords2d[:, 1]

        def compute_angle_span(cx: float, cz: float) -> Tuple[float, float]:
            rel_x = x - cx
            rel_z = z - cz
            angles = np.arctan2(rel_z, rel_x)
            unwrapped = np.unwrap(angles)
            return float(unwrapped[0]), float(unwrapped[-1])
        
        # Initial guess for circle: center at mean, radius = mean distance
        x_mean, z_mean = np.mean(x), np.mean(z)
        distances = np.sqrt((x - x_mean)**2 + (z - z_mean)**2)
        r_guess = np.mean(distances)  # Use mean instead of max
        
        def residuals(params):
            cx, cz, r = params
            return np.sqrt((x - cx)**2 + (z - cz)**2) - r
        
        try:
            result = optimize.least_squares(
                residuals,
                [x_mean, z_mean, r_guess],
                bounds=([-np.inf, -np.inf, 0.01], [np.inf, np.inf, np.inf])
            )
            
            cx, cz, radius = result.x
            error = np.sqrt(np.mean(result.fun**2))
            start_angle, end_angle = compute_angle_span(float(cx), float(cz))
            
            # Reconstruct 3D center from 2D projection
            center_3d = centroid + cx * u + cz * v
            normal = Vt[2]  # normal to the best-fit plane
            
            return {
                "radius": float(radius),
                "center": {"x": float(center_3d[0]), "y": float(center_3d[1]), "z": float(center_3d[2])},
                "center_2d": (float(cx), float(cz)),
                "normal": normal.tolist(),
                "basis_u": {"x": float(u[0]), "y": float(u[1]), "z": float(u[2])},
                "basis_v": {"x": float(v[0]), "y": float(v[1]), "z": float(v[2])},
                "start_angle": start_angle,
                "end_angle": end_angle,
                "error": float(error)
            }
        except Exception:
            # Fallback 3D center
            center_3d = centroid + x_mean * u + z_mean * v
            normal = np.cross(u, v)
            norm_len = np.linalg.norm(normal)
            normal = normal / norm_len if norm_len > 1e-9 else normal
            start_angle, end_angle = compute_angle_span(float(x_mean), float(z_mean))
            return {
                "radius": float(r_guess),
                "center": {"x": float(center_3d[0]), "y": float(center_3d[1]), "z": float(center_3d[2])},
                "center_2d": (float(x_mean), float(z_mean)),
                "normal": normal.tolist(),
                "basis_u": {"x": float(u[0]), "y": float(u[1]), "z": float(u[2])},
                "basis_v": {"x": float(v[0]), "y": float(v[1]), "z": float(v[2])},
                "start_angle": start_angle,
                "end_angle": end_angle,
                "error": 0.5
            }
    
    def _calculate_length(self, points: np.ndarray) -> float:
        """Calculate the arc length of the rib."""
        
        diffs = np.diff(points, axis=0)
        distances = np.sqrt(np.sum(diffs**2, axis=1))
        return float(np.sum(distances))
    
    def _find_apex(self, points: np.ndarray) -> Dict[str, float]:
        """Find the apex (highest point) of the rib."""
        
        # Find point with maximum z
        apex_idx = np.argmax(points[:, 2])
        apex = points[apex_idx]
        
        return {"x": float(apex[0]), "y": float(apex[1]), "z": float(apex[2])}
    
    def _find_springing_points(self, points: np.ndarray) -> List[Dict[str, float]]:
        """Find the springing points (base points) of the rib."""
        
        # First and last points are typically springing points
        springing = []
        
        for point in [points[0], points[-1]]:
            springing.append({
                "x": float(point[0]),
                "y": float(point[1]),
                "z": float(point[2]),
            })
        
        return springing
    
    def _calculate_point_distances_from_arc(
      self,
      points: np.ndarray,
      arc_params: Dict[str, Any],
  ) -> np.ndarray:
      """Calculate point-to-arc distances in the fitted arc frame.
      
      Args:
          points: Array of 3D points (N x 3)
          arc_params: Fitted arc parameters returned by _fit_arc()
      
      Returns:
          Unsigned distance from each point to the closest point on the
          finite fitted arc segment (N,)
      """

      if points.size == 0:
          return np.array([], dtype=float)

      center_dict = arc_params.get("center", {})
      center = np.array(
          [
              float(center_dict.get("x", 0.0)),
              float(center_dict.get("y", 0.0)),
              float(center_dict.get("z", 0.0)),
          ],
          dtype=float,
      )

      basis_u_dict = arc_params.get("basis_u", {})
      basis_v_dict = arc_params.get("basis_v", {})
      u = np.array(
          [
              float(basis_u_dict.get("x", 1.0)),
              float(basis_u_dict.get("y", 0.0)),
              float(basis_u_dict.get("z", 0.0)),
          ],
          dtype=float,
      )
      v = np.array(
          [
              float(basis_v_dict.get("x", 0.0)),
              float(basis_v_dict.get("y", 0.0)),
              float(basis_v_dict.get("z", 1.0)),
          ],
          dtype=float,
      )

      u_len = float(np.linalg.norm(u))
      v_len = float(np.linalg.norm(v))
      if u_len <= 1e-9 or v_len <= 1e-9:
          # Fallback to sphere-like radial residuals if basis vectors are unavailable.
          radius = max(float(arc_params.get("radius", 0.0)), 0.0)
          rel = points - center
          return np.abs(np.linalg.norm(rel, axis=1) - radius)

      u = u / u_len
      v = v / v_len

      radius = max(float(arc_params.get("radius", 0.0)), 0.0)
      start_angle = float(arc_params.get("start_angle", 0.0))
      end_angle = float(arc_params.get("end_angle", start_angle))
      finite_arc = np.isfinite(start_angle) and np.isfinite(end_angle)

      rel = points - center
      x_coords = rel @ u
      z_coords = rel @ v
      point_angles = np.arctan2(z_coords, x_coords)

      if finite_arc:
          # Lift point angles onto the same unwrapped branch as the fitted arc.
          point_angles = start_angle + np.mod(point_angles - start_angle + np.pi, 2.0 * np.pi) - np.pi
          angle_min = min(start_angle, end_angle)
          angle_max = max(start_angle, end_angle)
          closest_angles = np.clip(point_angles, angle_min, angle_max)
      else:
          closest_angles = point_angles

      closest_points = (
          center
          + (radius * np.cos(closest_angles))[:, np.newaxis] * u
          + (radius * np.sin(closest_angles))[:, np.newaxis] * v
      )

      return np.linalg.norm(points - closest_points, axis=1)
    
    async def chord_method_analysis(self, hypothesis_id: str) -> Dict[str, Any]:
        """Perform three-circle chord method analysis."""
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            self._chord_method_analysis,
            hypothesis_id,
        )
        return result
    
    def _chord_method_analysis(self, hypothesis_id: str) -> Dict[str, Any]:
        """Internal chord method analysis."""
        
        # Get hypothesis data (or generate demo)
        if hypothesis_id not in self.hypotheses:
            # Generate demo analysis
            pass
        
        # Three-circle method: fit three circles to different rib segments
        # This is a simplified implementation
        
        r1 = 5.0 + np.random.normal(0, 0.2)
        r2 = 4.5 + np.random.normal(0, 0.2)
        r3 = 5.5 + np.random.normal(0, 0.2)
        
        centers = [
            {"x": -2.0, "y": 0.0, "z": 2.0},
            {"x": 0.0, "y": 0.0, "z": 3.5},
            {"x": 2.0, "y": 0.0, "z": 2.0},
        ]
        
        # Determine predicted method based on circle relationships
        r_ratio = max(r1, r2, r3) / min(r1, r2, r3)
        
        if r_ratio < 1.1:
            predicted_method = "Single center method"
        elif r_ratio < 1.3:
            predicted_method = "Three-center pointed arch"
        else:
            predicted_method = "Multi-center compound arch"
        
        # Calculate additional metrics
        calculations = {
            "r1": r1,
            "r2": r2,
            "r3": r3,
            "ratio_r1_r2": r1 / r2,
            "ratio_r2_r3": r2 / r3,
            "mean_radius": np.mean([r1, r2, r3]),
            "span": 10.0,
            "rise": 5.0,
            "rise_span_ratio": 0.5,
        }
        
        return {
            "predicted_method": predicted_method,
            "three_circle": {
                "r1": r1,
                "r2": r2,
                "r3": r3,
                "centers": centers,
            },
            "calculations": calculations,
            "confidence": 0.82,
        }
    
    def _tangent_at_endpoint(
        self,
        points: np.ndarray,
        at_end: bool,
        n_pts: int = 8,
    ) -> np.ndarray:
        """
        Return the unit tangent vector at one end of a rib, pointing *outward*
        - i.e. in the direction the rib is heading away from its body toward
        the keystone gap.

        Uses SVD on the last ``n_pts`` points to find the principal direction,
        then orients it outward.  This is more robust than a simple two-point
        difference when the trace is noisy.

        Args:
            points:  Ordered (N, 3) point array for the rib.
            at_end:  True  -> tangent at points[-1] (last point, forward direction)
                     False -> tangent at points[0]  (first point, reversed direction)
            n_pts:   How many points at the tip to use for the local tangent.
                     Clamped so it never crosses the trace midpoint.
        """
        n_points = len(points)
        if n_points < 2:
            return np.array([0.0, 0.0, 1.0], dtype=float)

        max_tip_points = max(2, min(n_pts, max(2, n_points - 1)))
        svd_tip_points = max(3, min(max_tip_points, max(3, n_points // 3)))
        direction: Optional[np.ndarray] = None

        # Prefer SVD for sufficiently long traces; otherwise a directional
        # finite-difference fallback is more stable than noisy local SVD.
        if n_points >= 8:
            segment = points[-svd_tip_points:] if at_end else points[:svd_tip_points]
            centered = segment - segment.mean(axis=0)
            if np.linalg.norm(centered) > 1e-12:
                try:
                    _, singular_vals, vt = np.linalg.svd(centered, full_matrices=False)
                    if len(singular_vals) > 0 and singular_vals[0] > 1e-10:
                        direction = vt[0]
                except np.linalg.LinAlgError:
                    direction = None

        if direction is None:
            if at_end:
                body_idx = max(0, n_points - 1 - max_tip_points)
                direction = points[-1] - points[body_idx]
            else:
                body_idx = min(n_points - 1, max_tip_points - 1)
                direction = points[0] - points[body_idx]

            if np.linalg.norm(direction) < 1e-10:
                direction = points[-1] - points[0]
                if not at_end:
                    direction = -direction

        if at_end:
            ref_idx = max(0, n_points - 1 - max_tip_points)
            outward_ref = points[-1] - points[ref_idx]
        else:
            ref_idx = min(n_points - 1, max_tip_points - 1)
            outward_ref = points[0] - points[ref_idx]

        if np.linalg.norm(outward_ref) < 1e-10:
            outward_ref = direction

        if np.dot(direction, outward_ref) < 0:
            direction = -direction

        length = np.linalg.norm(direction)
        if length < 1e-12:
            return np.array([0.0, 0.0, 1.0], dtype=float)

        return direction / length

    def detect_rib_groups(
        self,
        max_gap: float = 0.5,
        angle_threshold_deg: float = 25.0,
        radius_tolerance: float = 0.15,
        bosses: Optional[np.ndarray] = None,
        boss_gap_factor: float = 0.6,
        plane_normal_threshold_deg: float = 18.0,
        min_points_for_reliable_arc_fit: int = 15,
        debug_label: Optional[str] = None,
        diagnostics: bool = False,
        diagnostics_focus_rib: Optional[str] = None,
    ) -> List[List[str]]:
        """
        Detect groups of ribs that are continuations of the same structural rib,
          split by a keystone or boss stone.

          Priorities for pairing ribs:

             1. Arc compatibility (same best-fit arc within tolerance):
                 - radius agreement,
                 - plane-normal agreement,
                 - low merged-fit error when both traces are fit together.

             2. Endpoint proximity:
                 - nearest endpoint pair must be close enough (with optional boss-
                    midpoint relaxation).

             3. Directionality is secondary:
                 - tangential handshake is used as a soft tie-breaker, not a hard
                    rejection, except for almost-coincident endpoints where diverging
                    tangents strongly indicate different ribs.

             Additional anti-overgrouping rule:
                 - Endpoint uniqueness: each rib endpoint may connect to at most one
                    continuation candidate (greedy by best arc score, then shortest gap).

        Returns a list of groups; singletons appear as a one-element group.
        """
        rib_ids = list(self.traces.keys())
        if not rib_ids:
            return []

        min_points_for_reliable_arc_fit = max(3, int(min_points_for_reliable_arc_fit))
        min_valid_radius = 1e-6
        boss_gap_factor = float(np.clip(boss_gap_factor, 0.1, 1.0))
        plane_normal_threshold_deg = float(np.clip(plane_normal_threshold_deg, 1.0, 45.0))
        debug_enabled = self._rib_grouping_debug_enabled()
        label = debug_label or "single-pass"
        collect_diagnostics = bool(diagnostics or diagnostics_focus_rib)

        rejection_counts: Dict[str, int] = {}
        rib_rejection_counts: Dict[str, Dict[str, int]] = {}
        pair_diagnostics: List[Dict[str, Any]] = []
        accepted_pairs: List[Dict[str, Any]] = []

        def should_collect_pair(rib_a: str, rib_b: str) -> bool:
            if not collect_diagnostics:
                return False
            if not diagnostics_focus_rib:
                return True
            return rib_a == diagnostics_focus_rib or rib_b == diagnostics_focus_rib

        def record_rejection(reason: str) -> None:
            rejection_counts[reason] = rejection_counts.get(reason, 0) + 1

        def record_rib_rejection(rib_id: str, reason: str) -> None:
            by_reason = rib_rejection_counts.setdefault(rib_id, {})
            by_reason[reason] = by_reason.get(reason, 0) + 1

        def reject_pair(reason: str, pair_payload: Optional[Dict[str, Any]] = None) -> None:
            record_rejection(reason)
            if not pair_payload:
                return

            rib_a = str(pair_payload.get("ribA", ""))
            rib_b = str(pair_payload.get("ribB", ""))
            if rib_a:
                record_rib_rejection(rib_a, reason)
            if rib_b:
                record_rib_rejection(rib_b, reason)

            if should_collect_pair(rib_a, rib_b):
                pair_diagnostics.append({
                    **pair_payload,
                    "decision": "rejected",
                    "reason": reason,
                })

        cos_tol = np.cos(np.deg2rad(angle_threshold_deg))
        # Enforce near-collinearity of continuation direction across a split rib:
        # endpoint tangents should oppose each other strongly (anti-parallel).
        direction_match_deg = max(6.0, angle_threshold_deg * 0.85)
        cos_direction_match = np.cos(np.deg2rad(direction_match_deg))
        cos_plane_tol = np.cos(np.deg2rad(plane_normal_threshold_deg))
        relaxed_plane_threshold_deg = min(45.0, plane_normal_threshold_deg + 8.0)
        cos_plane_tol_relaxed = np.cos(np.deg2rad(relaxed_plane_threshold_deg))
        max_boss_gap = min(max_gap * 2.0, 1.0)  # relaxed threshold when boss stone in gap
        antiparallel_max_gap = min(max_gap * 0.8, 0.4)

        # Pre-fit arc parameters to evaluate pair compatibility cheaply.
        fit_by_rib: Dict[str, Dict[str, Any]] = {}
        radius_by_rib: Dict[str, float] = {}
        normal_by_rib: Dict[str, np.ndarray] = {}
        fit_error_by_rib: Dict[str, float] = {}
        reliable_fit_ribs: set = set()
        for rib_id in rib_ids:
            pts = self.traces.get(rib_id)
            if pts is None or len(pts) < 3:
                continue
            try:
                fit = self._fit_arc(pts)
                fit_by_rib[rib_id] = fit

                radius = float(fit.get("radius", 0.0))
                if np.isfinite(radius) and radius > min_valid_radius:
                    radius_by_rib[rib_id] = radius

                fit_error = float(fit.get("error", np.inf))
                if np.isfinite(fit_error) and fit_error >= 0.0:
                    fit_error_by_rib[rib_id] = fit_error

                normal_raw = np.asarray(fit.get("normal", []), dtype=float)
                if normal_raw.shape == (3,):
                    normal_len = float(np.linalg.norm(normal_raw))
                    if normal_len > 1e-9:
                        normal_by_rib[rib_id] = normal_raw / normal_len

                if (
                    len(pts) >= min_points_for_reliable_arc_fit
                    and rib_id in radius_by_rib
                    and rib_id in normal_by_rib
                ):
                    reliable_fit_ribs.add(rib_id)
            except Exception:
                # Leave this rib uncached.
                continue

        merged_fit_cache: Dict[Tuple[str, str], Dict[str, Any]] = {}

        def merged_fit_for_pair(
            rib_a: str,
            rib_b: str,
            points_a: np.ndarray,
            points_b: np.ndarray,
        ) -> Optional[Dict[str, Any]]:
            key = tuple(sorted((rib_a, rib_b)))
            if key in merged_fit_cache:
                return merged_fit_cache[key]
            try:
                merged_fit_cache[key] = self._fit_arc(np.vstack([points_a, points_b]))
                return merged_fit_cache[key]
            except Exception:
                return None

        # Build undirected adjacency graph
        adj: Dict[str, set] = {rid: set() for rid in rib_ids}
        candidate_edges: List[Tuple[float, float, str, str, bool, bool, Dict[str, Any]]] = []
        considered_pairs = 0
        n = len(rib_ids)
        for i in range(n):
            for j in range(i + 1, n):
                a, b = rib_ids[i], rib_ids[j]
                pts_a = self.traces.get(a)
                pts_b = self.traces.get(b)
                if pts_a is None or pts_b is None:
                    reject_pair("missing_trace", {
                        "passLabel": label,
                        "ribA": a,
                        "ribB": b,
                    })
                    continue
                if len(pts_a) < 3 or len(pts_b) < 3:
                    reject_pair("insufficient_points", {
                        "passLabel": label,
                        "ribA": a,
                        "ribB": b,
                        "pointCountA": len(pts_a),
                        "pointCountB": len(pts_b),
                    })
                    continue

                considered_pairs += 1

                # Gate 1 - nearest endpoint pair and gap cap
                # Endpoints: (first, last) for each rib
                a0, a1 = pts_a[0], pts_a[-1]
                b0, b1 = pts_b[0], pts_b[-1]
                dists = {
                    (False, False): float(np.linalg.norm(a0 - b0)),
                    (False, True):  float(np.linalg.norm(a0 - b1)),
                    (True,  False): float(np.linalg.norm(a1 - b0)),
                    (True,  True):  float(np.linalg.norm(a1 - b1)),
                }
                (a_end, b_end), min_dist = min(dists.items(), key=lambda x: x[1])
                pair_payload: Dict[str, Any] = {
                    "passLabel": label,
                    "ribA": a,
                    "ribB": b,
                    "aEndpoint": "end" if a_end else "start",
                    "bEndpoint": "end" if b_end else "start",
                    "gapDistance": min_dist,
                }

                # Determine effective gap threshold: larger if a boss stone
                # sits near the midpoint of the gap between the two endpoints
                effective_gap = max_gap
                if bosses is not None and len(bosses) > 0 and min_dist > max_gap:
                    a_near = pts_a[-1] if a_end else pts_a[0]
                    b_near = pts_b[-1] if b_end else pts_b[0]
                    midpoint = (a_near + b_near) / 2.0
                    boss_dists = np.linalg.norm(bosses - midpoint, axis=1)
                    nearest_boss_dist = float(np.min(boss_dists))
                    # Boss must be roughly between the two endpoints
                    if nearest_boss_dist < min_dist * boss_gap_factor:
                        effective_gap = max_boss_gap

                if min_dist > effective_gap:
                    pair_payload["effectiveGap"] = effective_gap
                    reject_pair("gap_too_large", pair_payload)
                    continue

                # Gate 2 - same best-fit arc compatibility
                fit_a = fit_by_rib.get(a)
                fit_b = fit_by_rib.get(b)
                radius_a = radius_by_rib.get(a)
                radius_b = radius_by_rib.get(b)
                normal_a = normal_by_rib.get(a)
                normal_b = normal_by_rib.get(b)
                err_a = fit_error_by_rib.get(a, np.inf)
                err_b = fit_error_by_rib.get(b, np.inf)

                if (
                    fit_a is None
                    or fit_b is None
                    or radius_a is None
                    or radius_b is None
                ):
                    reject_pair("arc_fit_missing", pair_payload)
                    continue

                both_reliable = a in reliable_fit_ribs and b in reliable_fit_ribs
                effective_radius_tolerance = (
                    radius_tolerance
                    if both_reliable
                    else min(0.5, radius_tolerance * 1.5)
                )
                relative_diff = abs(radius_a - radius_b) / max(radius_a, radius_b)
                pair_payload["radiusRelativeDiff"] = relative_diff
                pair_payload["radiusTolerance"] = effective_radius_tolerance
                if relative_diff > effective_radius_tolerance:
                    reject_pair("radius_mismatch", pair_payload)
                    continue

                if normal_a is None or normal_b is None:
                    reject_pair("plane_missing", pair_payload)
                    continue

                alignment = abs(float(np.dot(normal_a, normal_b)))
                required_plane_alignment = cos_plane_tol if both_reliable else cos_plane_tol_relaxed
                pair_payload["planeAlignment"] = alignment
                pair_payload["planeThreshold"] = required_plane_alignment
                if alignment < required_plane_alignment:
                    reject_pair("plane_mismatch", pair_payload)
                    continue

                merged_fit = merged_fit_for_pair(a, b, pts_a, pts_b)
                if merged_fit is None:
                    reject_pair("merged_fit_failed", pair_payload)
                    continue

                merged_error = float(merged_fit.get("error", np.inf))
                if not np.isfinite(merged_error):
                    reject_pair("merged_error_invalid", pair_payload)
                    continue

                baseline_error = max(err_a, err_b, 1e-3)
                allowed_merged_error = max(0.03, baseline_error * 2.6)
                if not both_reliable:
                    allowed_merged_error *= 1.35
                pair_payload["mergedFitError"] = merged_error
                pair_payload["mergedErrorAllowed"] = allowed_merged_error
                if merged_error > allowed_merged_error:
                    reject_pair("merged_arc_mismatch", pair_payload)
                    continue

                # gap_vec: unit vector from A's junction point toward B's
                a_near = pts_a[-1] if a_end else pts_a[0]
                b_near = pts_b[-1] if b_end else pts_b[0]
                gap_vec = b_near - a_near
                gap_len = np.linalg.norm(gap_vec)
                directional_penalty = 0.0
                tan_a = self._tangent_at_endpoint(pts_a, at_end=a_end)
                tan_b = self._tangent_at_endpoint(pts_b, at_end=b_end)

                # Hard gate: ribs must have almost the same continuation direction.
                # With outward tangents at both endpoints, this means near anti-parallel.
                opposition = -float(np.dot(tan_a, tan_b))
                pair_payload["directionOpposition"] = opposition
                pair_payload["directionThreshold"] = cos_direction_match
                if opposition < cos_direction_match:
                    reject_pair("direction_mismatch", pair_payload)
                    continue

                if gap_len < 0.05:
                    # Endpoints practically coincident — gap vector is noise,
                    # but still check that the tangents are anti-parallel
                    # (continuations go "through" the junction; ribs springing
                    # from the same point diverge outward).
                    if float(np.dot(tan_a, tan_b)) > -cos_direction_match:
                        reject_pair("coincident_not_antiparallel", pair_payload)
                        continue  # tangents not anti-parallel — different ribs
                else:
                    gap_vec = gap_vec / gap_len

                    # Directionality is a tie-breaker only.
                    handshake_ok = (
                        float(np.dot(tan_a, gap_vec)) >= cos_tol
                        and float(np.dot(tan_b, -gap_vec)) >= cos_tol
                    )
                    antiparallel_ok = (
                        gap_len <= antiparallel_max_gap
                        and float(np.dot(tan_a, tan_b)) < -cos_tol
                    )
                    if not handshake_ok and not antiparallel_ok:
                        directional_penalty = 0.15

                arc_quality = (
                    (merged_error / max(allowed_merged_error, 1e-6))
                    + (relative_diff / max(effective_radius_tolerance, 1e-6))
                )
                score = arc_quality + directional_penalty
                pair_payload["arcQuality"] = arc_quality
                pair_payload["score"] = score
                pair_payload["directionalPenalty"] = directional_penalty
                if should_collect_pair(a, b):
                    pair_diagnostics.append({
                        **pair_payload,
                        "decision": "candidate",
                        "reason": None,
                    })
                candidate_edges.append((score, min_dist, a, b, bool(a_end), bool(b_end), pair_payload))

        # Keep only the best candidate per endpoint to prevent chain over-merging.
        used_endpoints: set = set()
        candidate_edges.sort(key=lambda item: (item[0], item[1]))
        accepted_edges = 0
        for _, _, a, b, a_end, b_end, pair_payload in candidate_edges:
            endpoint_a = (a, a_end)
            endpoint_b = (b, b_end)
            if endpoint_a in used_endpoints or endpoint_b in used_endpoints:
                reject_pair("endpoint_already_used", pair_payload)
                continue
            used_endpoints.add(endpoint_a)
            used_endpoints.add(endpoint_b)
            adj[a].add(b)
            adj[b].add(a)
            accepted_edges += 1
            accepted_pairs.append({
                **pair_payload,
                "decision": "accepted",
                "reason": None,
            })

        # Connected components via BFS
        visited: set = set()
        groups: List[List[str]] = []
        for rib_id in rib_ids:
            if rib_id in visited:
                continue
            component: List[str] = []
            queue = [rib_id]
            visited.add(rib_id)
            while queue:
                current = queue.pop(0)
                component.append(current)
                for neighbor in adj[current]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
            groups.append(component)

        if debug_enabled:
            rejected_total = sum(rejection_counts.values())
            top_rejections = sorted(
                rejection_counts.items(),
                key=lambda item: item[1],
                reverse=True,
            )[:5]
            top_repr = ", ".join([f"{name}={count}" for name, count in top_rejections]) or "none"
            print(
                f"[RibGrouping:{label}] ribs={len(rib_ids)} pairs={considered_pairs} "
                f"candidates={len(candidate_edges)} accepted_edges={accepted_edges} "
                f"groups={len(groups)} rejected={rejected_total} top={top_repr}"
            )

        if collect_diagnostics:
            rejected_total = sum(rejection_counts.values())
            top_rejections = [
                {"reason": reason, "count": count}
                for reason, count in sorted(
                    rejection_counts.items(),
                    key=lambda item: item[1],
                    reverse=True,
                )
            ]
            self.last_grouping_diagnostics = {
                "passLabel": label,
                "consideredPairs": considered_pairs,
                "candidatePairs": len(candidate_edges),
                "acceptedPairs": accepted_edges,
                "rejectedPairs": rejected_total,
                "topRejections": top_rejections,
                "pairDiagnostics": pair_diagnostics,
                "acceptedPairDiagnostics": accepted_pairs,
                "perRibRejectionCounts": rib_rejection_counts,
            }
        else:
            self.last_grouping_diagnostics = None

        return groups

    @staticmethod
    def _rib_grouping_debug_enabled() -> bool:
        value = os.getenv("DEBUG_RIB_GROUPING", "")
        return value.lower() in {"1", "true", "yes", "on"}

    def _validate_relaxed_group(
        self,
        group_ids: List[str],
        max_gap_ratio: float = 0.45,
        max_absolute_gap: float = 0.5,
        high_radius_drift: float = 0.30,
        min_plane_alignment_deg: float = 16.0,
        min_points_for_fit: int = 6,
        max_merged_error_factor: float = 2.8,
        min_merged_error_abs: float = 0.05,
    ) -> bool:
        """Apply conservative guards to relaxed second-pass candidate groups."""
        if len(group_ids) < 2:
            return False

        valid_ids = [
            rid for rid in group_ids
            if rid in self.traces and len(self.traces[rid]) >= 3
        ]
        if len(valid_ids) < 2:
            return False

        length_by_rib: Dict[str, float] = {
            rid: self._calculate_length(self.traces[rid])
            for rid in valid_ids
        }
        cos_plane_tol = np.cos(np.deg2rad(min_plane_alignment_deg))
        fit_cache: Dict[str, Dict[str, Any]] = {}

        def fit_for(rib_id: str) -> Dict[str, Any]:
            if rib_id not in fit_cache:
                fit_cache[rib_id] = self._fit_arc(self.traces[rib_id])
            return fit_cache[rib_id]

        for i in range(len(valid_ids)):
            for j in range(i + 1, len(valid_ids)):
                a, b = valid_ids[i], valid_ids[j]
                pts_a = self.traces[a]
                pts_b = self.traces[b]

                # Guard 1: reject unrealistically large endpoint gaps.
                a0, a1 = pts_a[0], pts_a[-1]
                b0, b1 = pts_b[0], pts_b[-1]
                min_gap = min(
                    float(np.linalg.norm(a0 - b0)),
                    float(np.linalg.norm(a0 - b1)),
                    float(np.linalg.norm(a1 - b0)),
                    float(np.linalg.norm(a1 - b1)),
                )
                short_len = max(min(length_by_rib[a], length_by_rib[b]), 1e-6)
                allowed_gap = max(max_absolute_gap, max_gap_ratio * short_len)
                if min_gap > allowed_gap:
                    return False

                if len(pts_a) < min_points_for_fit or len(pts_b) < min_points_for_fit:
                    continue

                # Guard 2: if radius drift is high, enforce stronger plane alignment.
                fit_a = fit_for(a)
                fit_b = fit_for(b)
                radius_a = float(fit_a.get("radius", 0.0))
                radius_b = float(fit_b.get("radius", 0.0))

                if radius_a <= 1e-6 or radius_b <= 1e-6:
                    continue

                relative_diff = abs(radius_a - radius_b) / max(radius_a, radius_b)
                if relative_diff <= high_radius_drift:
                    continue

                normal_a = np.asarray(fit_a.get("normal", []), dtype=float)
                normal_b = np.asarray(fit_b.get("normal", []), dtype=float)
                if normal_a.shape != (3,) or normal_b.shape != (3,):
                    return False

                norm_a = float(np.linalg.norm(normal_a))
                norm_b = float(np.linalg.norm(normal_b))
                if norm_a <= 1e-9 or norm_b <= 1e-9:
                    return False

                alignment = abs(float(np.dot(normal_a / norm_a, normal_b / norm_b)))
                if alignment < cos_plane_tol:
                    return False

        # Guard 3: all members should still sit on one merged best-fit arc.
        try:
            individual_errors = [
                float(fit_for(rid).get("error", np.inf))
                for rid in valid_ids
            ]
            baseline_error = max(
                [err for err in individual_errors if np.isfinite(err) and err >= 0.0] + [1e-3]
            )
            merged_points = np.vstack([self.traces[rid] for rid in valid_ids])
            merged_error = float(self._fit_arc(merged_points).get("error", np.inf))
            allowed_error = max(min_merged_error_abs, baseline_error * max_merged_error_factor)
            if not np.isfinite(merged_error) or merged_error > allowed_error:
                return False
        except Exception:
            return False

        return True

    def detect_rib_groups_two_pass(
        self,
        max_gap: float = 0.5,
        angle_threshold_deg: float = 25.0,
        radius_tolerance: float = 0.15,
        bosses: Optional[np.ndarray] = None,
        boss_gap_factor: float = 0.6,
        plane_normal_threshold_deg: float = 18.0,
        diagnostics: bool = False,
        diagnostics_focus_rib: Optional[str] = None,
    ) -> List[List[str]]:
        """Run strict grouping first, then a guarded relaxed pass on non-locked ribs."""
        rib_ids = list(self.traces.keys())
        if not rib_ids:
            self.last_grouping_diagnostics = None
            return []

        pass1_groups = self.detect_rib_groups(
            max_gap=max_gap,
            angle_threshold_deg=angle_threshold_deg,
            radius_tolerance=radius_tolerance,
            bosses=bosses,
            boss_gap_factor=boss_gap_factor,
            plane_normal_threshold_deg=plane_normal_threshold_deg,
            min_points_for_reliable_arc_fit=15,
            debug_label="pass1",
            diagnostics=diagnostics,
            diagnostics_focus_rib=diagnostics_focus_rib,
        )
        pass1_diag = self.last_grouping_diagnostics
        pass1_groups = [sorted(group) for group in pass1_groups]

        # Keep larger strict groups fixed; allow small strict groups (e.g. pairs)
        # to be refined in the relaxed pass.
        locked_groups = [group for group in pass1_groups if len(group) >= 3]
        locked_ribs = {
            rid
            for group in locked_groups
            for rid in group
        }
        pass2_pool = [rid for rid in rib_ids if rid not in locked_ribs]
        if len(pass2_pool) < 2:
            if diagnostics:
                self.last_grouping_diagnostics = {
                    "mode": "two-pass",
                    "passes": [pass1_diag] if pass1_diag else [],
                    "lockedRibs": sorted(list(locked_ribs)),
                    "pass2Pool": pass2_pool,
                    "pass2AddedGroups": 0,
                }
            return pass1_groups

        relaxed_service = MeasurementService()
        relaxed_service.traces = {
            rid: self.traces[rid]
            for rid in pass2_pool
            if rid in self.traces
        }

        pass2_groups = relaxed_service.detect_rib_groups(
            max_gap=max(max_gap, 0.6),
            angle_threshold_deg=max(angle_threshold_deg, 22.0),
            radius_tolerance=max(radius_tolerance, 0.25),
            bosses=bosses,
            boss_gap_factor=max(boss_gap_factor, 0.75),
            plane_normal_threshold_deg=max(plane_normal_threshold_deg, 26.0),
            min_points_for_reliable_arc_fit=6,
            debug_label="pass2",
            diagnostics=diagnostics,
            diagnostics_focus_rib=diagnostics_focus_rib,
        )
        pass2_diag = relaxed_service.last_grouping_diagnostics

        pass2_accepted: List[List[str]] = []
        used_in_pass2: set = set()
        for group in pass2_groups:
            if len(group) <= 1:
                continue
            normalized_group = sorted(group)
            if any(rid in used_in_pass2 for rid in normalized_group):
                continue
            if not self._validate_relaxed_group(normalized_group):
                continue

            pass2_accepted.append(normalized_group)
            used_in_pass2.update(normalized_group)

        final_groups: List[List[str]] = [group for group in locked_groups]
        final_groups.extend(pass2_accepted)

        grouped_final = {
            rid
            for group in final_groups
            for rid in group
        }

        # Preserve strict-pass medium-confidence groups (mostly pairs) if they
        # were not superseded by pass 2.
        for group in pass1_groups:
            if len(group) < 2 or len(group) >= 3:
                continue
            if any(rid in grouped_final for rid in group):
                continue
            final_groups.append(group)
            grouped_final.update(group)

        for rid in rib_ids:
            if rid not in grouped_final:
                final_groups.append([rid])

        if self._rib_grouping_debug_enabled():
            print(
                f"[RibGrouping:two-pass] pass1={len(pass1_groups)} "
                f"locked={len(locked_groups)} pass2_pool={len(pass2_pool)} "
                f"pass2_added={len(pass2_accepted)} "
                f"final={len(final_groups)}"
            )

        if diagnostics:
            self.last_grouping_diagnostics = {
                "mode": "two-pass",
                "passes": [diag for diag in [pass1_diag, pass2_diag] if diag],
                "lockedRibs": sorted(list(locked_ribs)),
                "pass2Pool": pass2_pool,
                "pass2AddedGroups": len(pass2_accepted),
                "finalGroupCount": len(final_groups),
            }
        else:
            self.last_grouping_diagnostics = None

        return final_groups

    def calculate_group_measurements(
        self,
        group_ids: List[str],
    ) -> Dict[str, Any]:
        """
        Fit a single arc to the merged point cloud of a rib group.

        rib_length = sum of individual arc lengths (avoids inflating with
        keystone gaps that are missing from the traces).

        arc_center_z is returned so the caller can compute:
            impost_distance = arc_center_z - impost_height
        """
        valid_ids = [
            rid for rid in group_ids
            if rid in self.traces and len(self.traces[rid]) >= 3
        ]
        if not valid_ids:
            raise ValueError(f"No valid traces for group {group_ids}")

        merged_points = np.vstack([self.traces[rid] for rid in valid_ids])
        arc_params = self._fit_arc(merged_points)
        rib_length = sum(
            self._calculate_length(self.traces[rid]) for rid in valid_ids
        )
        apex = self._find_apex(merged_points)
        springing = self._find_springing_points(merged_points)

        return {
            "arc_radius": arc_params["radius"],
            "rib_length": float(rib_length),
            "apex_point": apex,
            "springing_points": springing,
            "fit_error": arc_params["error"],
            "arc_center": arc_params["center"],
            "arc_center_z": float(arc_params["center"]["z"]),
        }

    # ------------------------------------------------------------------
    # Apex & Span helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _polyline_z_intersection(
        pts: np.ndarray,
        z: float,
        from_end: bool = True,
    ) -> Optional[np.ndarray]:
        """Find where a 3-D polyline crosses a horizontal plane at *z*.

        Walks consecutive segments and returns the linearly-interpolated
        3-D point of the first crossing found.

        Parameters
        ----------
        pts : (N, 3) array
            Ordered polyline vertices.
        z : float
            Target Z elevation.
        from_end : bool
            If *True* walk from ``pts[-1]`` toward ``pts[0]`` (i.e. from
            the springing end toward the boss).  Otherwise walk forward.

        Returns
        -------
        np.ndarray or None
            Interpolated ``[x, y, z]`` at the crossing, or *None* if the
            polyline never crosses *z*.
        """
        if len(pts) < 2:
            return None

        indices = range(len(pts) - 1, 0, -1) if from_end else range(len(pts) - 1)

        for i in indices:
            if from_end:
                a, b = pts[i], pts[i - 1]
            else:
                a, b = pts[i], pts[i + 1]

            z_a, z_b = float(a[2]), float(b[2])

            # Check if the segment straddles or touches z
            if (z_a - z) * (z_b - z) > 0:
                continue  # both on same side

            dz = z_b - z_a
            if abs(dz) < 1e-12:
                # Segment is essentially horizontal at z — return midpoint
                return (a + b) / 2.0

            t = (z - z_a) / dz
            t = max(0.0, min(1.0, t))
            return a + t * (b - a)

        return None

    def _assign_ribs_to_bosses(
        self,
        bosses: List[Dict[str, Any]],
        max_distance: float = 2.0,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Assign each rib to its nearest boss by endpoint proximity.

        For every rib the **upper** endpoint (nearest to any boss) is
        identified.  If the distance is below *max_distance* the rib is
        assigned to that boss.

        Returns
        -------
        mapping : dict
            ``{boss_id: [{ rib_id, boss_end_idx (0 or -1),
                           springing_point (3,),
                           outward_vector_xy (2,) }, ...]}``

            ``outward_vector_xy`` is the unit XY direction **from the boss
            toward the springing point** — i.e. the direction the rib
            extends outward from the boss in plan view.
        """
        boss_positions = {
            b["id"]: np.array([b["x"], b["y"], b["z"]], dtype=float)
            for b in bosses
        }

        mapping: Dict[str, List[Dict[str, Any]]] = {bid: [] for bid in boss_positions}

        for rib_id, pts in self.traces.items():
            if len(pts) < 3:
                continue

            first = pts[0]
            last = pts[-1]

            best_dist = float("inf")
            best_boss_id: Optional[str] = None
            best_end_idx: int = 0

            for bid, bpos in boss_positions.items():
                d0 = float(np.linalg.norm(first - bpos))
                d1 = float(np.linalg.norm(last - bpos))
                if d0 < d1 and d0 < best_dist:
                    best_dist = d0
                    best_boss_id = bid
                    best_end_idx = 0
                elif d1 <= d0 and d1 < best_dist:
                    best_dist = d1
                    best_boss_id = bid
                    best_end_idx = -1

            if best_boss_id is not None and best_dist <= max_distance:
                springing = pts[-1] if best_end_idx == 0 else pts[0]
                boss_pt = boss_positions[best_boss_id]
                # Outward direction: from boss toward the rib's springing point
                outward = springing - boss_pt
                outward_xy = np.array([outward[0], outward[1]])
                norm = np.linalg.norm(outward_xy)
                if norm > 1e-12:
                    outward_xy = outward_xy / norm
                else:
                    outward_xy = np.array([0.0, 0.0])

                mapping[best_boss_id].append({
                    "rib_id": rib_id,
                    "boss_end_idx": best_end_idx,
                    "springing_point": springing,
                    "outward_vector_xy": outward_xy,
                })

        return mapping

    def _pair_ribs_at_boss(
        self,
        rib_entries: List[Dict[str, Any]],
        symmetry_angle_tol_deg: float = 30.0,
    ) -> List[Tuple[str, str]]:
        """Pair ribs at a boss by axis symmetry.

        Two ribs form a valid pair when the XY direction from the boss
        toward one rib's springing point, **reflected about the global X
        or Y axis**, is approximately parallel to the other rib's outward
        direction.

        This captures ribs that together form a pointed arch through the
        boss — for example a rib from the NW corner paired with one from
        the SW corner (X-axis symmetric) or NW paired with NE (Y-axis
        symmetric).  Diagonal opposites like NW↔SE are explicitly *not*
        matched because they are symmetric about a diagonal, not X or Y.

        Parameters
        ----------
        rib_entries
            List of entries produced by ``_assign_ribs_to_bosses()`` for a
            single boss.  Each must contain ``outward_vector_xy`` (unit
            2-vector, boss → springing in XY).
        symmetry_angle_tol_deg
            Maximum angle (degrees) between a reflected outward vector and
            its candidate partner for the pair to be accepted.

        Returns
        -------
        pairs : list[(rib_a_id, rib_b_id)]
        """
        if len(rib_entries) < 2:
            return []

        cos_tol = float(np.cos(np.radians(symmetry_angle_tol_deg)))

        used: set = set()
        pairs: List[Tuple[str, str]] = []

        for i, ea in enumerate(rib_entries):
            if ea["rib_id"] in used:
                continue
            va = ea["outward_vector_xy"]  # shape (2,)
            if np.linalg.norm(va) < 1e-12:
                continue

            best_j: Optional[int] = None
            best_score = -2.0  # higher = more perfectly symmetric (max 1.0)

            for j, eb in enumerate(rib_entries):
                if j <= i or eb["rib_id"] in used:
                    continue
                vb = eb["outward_vector_xy"]
                if np.linalg.norm(vb) < 1e-12:
                    continue

                # X-axis symmetry: reflect vb about X axis (negate Y component)
                dot_x = float(va[0] * vb[0] + va[1] * (-vb[1]))
                # Y-axis symmetry: reflect vb about Y axis (negate X component)
                dot_y = float(va[0] * (-vb[0]) + va[1] * vb[1])

                score = max(dot_x, dot_y)

                if score < cos_tol:
                    continue  # not sufficiently symmetric about either axis

                if score > best_score:
                    best_score = score
                    best_j = j

            if best_j is not None:
                used.add(ea["rib_id"])
                used.add(rib_entries[best_j]["rib_id"])
                pairs.append((ea["rib_id"], rib_entries[best_j]["rib_id"]))

        return pairs

    @staticmethod
    def _arc_point_at_z(
        arc: Dict[str, Any],
        target_z: float,
    ) -> Optional[np.ndarray]:
        """Find the 3D point on the arc extension closest to its end angle
        that reaches the given Z height.

        The arc is parameterised as P(t) = center + R*(cos t * u + sin t * v),
        so P_z(t) = c_z + R*(cos t * u_z + sin t * v_z) = target_z.
        This is A*cos t + B*sin t = C with closed-form solutions.
        We pick the solution nearest the arc's end angle (the crown side).
        """
        c = np.array([arc["center"]["x"], arc["center"]["y"], arc["center"]["z"]])
        r = float(arc["radius"])
        u = np.array([arc["basis_u"]["x"], arc["basis_u"]["y"], arc["basis_u"]["z"]])
        v = np.array([arc["basis_v"]["x"], arc["basis_v"]["y"], arc["basis_v"]["z"]])
        end_angle = float(arc["end_angle"])

        A = r * u[2]
        B = r * v[2]
        C = target_z - c[2]
        amp = math.sqrt(A * A + B * B)
        if amp < 1e-12:
            return None
        ratio = C / amp
        if abs(ratio) > 1.0:
            if abs(ratio) > 1.0 + 1e-6:
                return None
            ratio = max(-1.0, min(1.0, ratio))

        base = math.atan2(B, A)
        delta = math.acos(ratio)
        candidates = [base + delta, base - delta]

        def angle_dist(theta: float) -> float:
            d = (theta - end_angle) % (2 * math.pi)
            return min(d, 2 * math.pi - d)

        best_theta = min(candidates, key=angle_dist)
        pt = c + r * (math.cos(best_theta) * u + math.sin(best_theta) * v)
        return pt

    @staticmethod
    def _arc_arc_intersection(
        arc_a: Dict[str, Any],
        arc_b: Dict[str, Any],
    ) -> Optional[List[np.ndarray]]:
        """Find the intersection points of two 3D circles.

        Each arc dict must contain ``center`` ({x,y,z}), ``radius``,
        ``basis_u`` ({x,y,z}), ``basis_v`` ({x,y,z}).

        The two circles are projected to a **common plane** (average of
        their planes), then a standard 2D circle-circle intersection is
        performed, and the result is lifted back to 3D.

        Returns ``None`` if the circles do not intersect (too far apart or
        concentric) or up to 2 intersection points as numpy arrays.
        """
        c_a = np.array([arc_a["center"]["x"], arc_a["center"]["y"], arc_a["center"]["z"]])
        c_b = np.array([arc_b["center"]["x"], arc_b["center"]["y"], arc_b["center"]["z"]])
        r_a = arc_a["radius"]
        r_b = arc_b["radius"]

        # Build common plane from the averaged normal of both arcs
        u_a = np.array([arc_a["basis_u"]["x"], arc_a["basis_u"]["y"], arc_a["basis_u"]["z"]])
        v_a = np.array([arc_a["basis_v"]["x"], arc_a["basis_v"]["y"], arc_a["basis_v"]["z"]])
        n_a = np.cross(u_a, v_a)
        n_a_len = np.linalg.norm(n_a)
        if n_a_len > 1e-12:
            n_a = n_a / n_a_len

        u_b = np.array([arc_b["basis_u"]["x"], arc_b["basis_u"]["y"], arc_b["basis_u"]["z"]])
        v_b = np.array([arc_b["basis_v"]["x"], arc_b["basis_v"]["y"], arc_b["basis_v"]["z"]])
        n_b = np.cross(u_b, v_b)
        n_b_len = np.linalg.norm(n_b)
        if n_b_len > 1e-12:
            n_b = n_b / n_b_len

        # Ensure normals point the same way for averaging
        if np.dot(n_a, n_b) < 0:
            n_b = -n_b

        n = (n_a + n_b) / 2.0
        n_len = np.linalg.norm(n)
        if n_len < 1e-12:
            return None
        n = n / n_len

        # Build an orthonormal frame for the common plane
        # Choose the common-plane U axis as unit(c_b - c_a) projected onto plane
        d = c_b - c_a
        d_proj = d - np.dot(d, n) * n
        d_proj_len = np.linalg.norm(d_proj)
        if d_proj_len < 1e-12:
            return None  # coincident centres projected — no unique intersection
        e1 = d_proj / d_proj_len
        e2 = np.cross(n, e1)

        # Project both centres to 2D in this frame
        origin = (c_a + c_b) / 2.0  # arbitrary origin on the plane
        def to2d(p: np.ndarray) -> np.ndarray:
            v = p - origin
            return np.array([np.dot(v, e1), np.dot(v, e2)])

        ca2 = to2d(c_a)
        cb2 = to2d(c_b)

        # Standard 2D circle-circle intersection
        dx = cb2[0] - ca2[0]
        dy = cb2[1] - ca2[1]
        dist = np.sqrt(dx * dx + dy * dy)

        if dist > r_a + r_b + 1e-9:
            return None  # too far apart
        if dist < abs(r_a - r_b) - 1e-9:
            return None  # one circle inside the other
        if dist < 1e-12:
            return None  # concentric

        a = (r_a * r_a - r_b * r_b + dist * dist) / (2.0 * dist)
        h_sq = r_a * r_a - a * a
        if h_sq < 0:
            h_sq = 0.0
        h = np.sqrt(h_sq)

        mx = ca2[0] + a * dx / dist
        my = ca2[1] + a * dy / dist

        pts_2d = []
        pts_2d.append(np.array([mx + h * dy / dist, my - h * dx / dist]))
        if h > 1e-12:
            pts_2d.append(np.array([mx - h * dy / dist, my + h * dx / dist]))

        # Lift back to 3D
        pts_3d = []
        for p2 in pts_2d:
            p3 = origin + p2[0] * e1 + p2[1] * e2
            pts_3d.append(p3)

        return pts_3d

    def _fit_pairing_side_arc(
        self,
        rib_ids: List[str],
        arc_cache: Dict[str, Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        """Fit one shared arc for a pairing side from one or more ribs."""
        valid_ids: List[str] = []
        for rib_id in rib_ids:
            if rib_id in valid_ids:
                continue
            pts = self.traces.get(rib_id)
            if pts is None or len(pts) < 3:
                continue
            valid_ids.append(rib_id)

        if not valid_ids:
            return None

        if len(valid_ids) == 1:
            cached = arc_cache.get(valid_ids[0])
            if cached is not None:
                return cached
            return self._fit_arc(self.traces[valid_ids[0]])

        merged_points = np.vstack([self.traces[rib_id] for rib_id in valid_ids])
        if len(merged_points) < 3:
            return None
        return self._fit_arc(merged_points)

        merged_points = np.vstack([self.traces[rib_id] for rib_id in valid_ids])
        if len(merged_points) < 3:
            return None
        return self._fit_arc(merged_points)

    def _compute_semicircular_apex(
        self,
        group_id: str,
        group_name: str,
        rib_ids: List[str],
        arc_cache: Dict[str, Dict[str, Any]],
        bosses_raw: List[Dict[str, Any]],
        impost_height: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Compute apex and span for a semicircular group.

        A semicircular group is its own pair — it doesn't need an opposing
        rib.  The span is the horizontal distance between the two outermost
        springing points.  The apex is:
        - **Single rib**: the max-Z point on the fitted mathematical arc.
        - **Multi-rib**: the arc-arc intersection of adjacent ribs (meeting
          at a boss stone), taking the highest Z intersection.
        """
        base = {
            "groupId": group_id,
            "groupName": group_name,
            "apex": None,
            "apexHeight": None,
            "span": None,
            "springingPoints": [],
            "status": "insufficient-data",
        }

        # Filter to ribs we actually have traces for
        valid_ids = [rid for rid in rib_ids if rid in self.traces and len(self.traces[rid]) >= 3]
        if not valid_ids:
            return base

        # ── Springing points (outermost endpoints of the group) ─────────
        # For each rib, the springing point is the endpoint with the lower Z.
        # For the whole group, we want the two outermost springing points.
        all_endpoints: List[np.ndarray] = []
        for rid in valid_ids:
            pts = self.traces[rid]
            first, last = pts[0], pts[-1]
            all_endpoints.append(first)
            all_endpoints.append(last)

        if len(all_endpoints) < 2:
            return base

        # The two outermost springing points are the two endpoints with the
        # lowest Z (the base of the semicircular arch).
        sorted_by_z = sorted(all_endpoints, key=lambda p: p[2])
        spring_a = sorted_by_z[0]
        spring_b = sorted_by_z[1]

        # If there are boss stones, exclude endpoints that are near a boss
        # (those are inner junctions, not springing points).
        if len(valid_ids) > 1 and bosses_raw:
            boss_pts = np.array([[b["x"], b["y"], b["z"]] for b in bosses_raw])
            outer_endpoints: List[np.ndarray] = []
            for ep in all_endpoints:
                dists = np.linalg.norm(boss_pts - ep, axis=1)
                if np.min(dists) > 0.5:  # not near any boss → outer
                    outer_endpoints.append(ep)
            if len(outer_endpoints) >= 2:
                outer_sorted = sorted(outer_endpoints, key=lambda p: p[2])
                spring_a = outer_sorted[0]
                spring_b = outer_sorted[1]

        # Use impost_height if available for consistent Z
        spring_z = impost_height if impost_height is not None else min(spring_a[2], spring_b[2])

        spring_a_dict = {"x": float(spring_a[0]), "y": float(spring_a[1]), "z": float(spring_z)}
        spring_b_dict = {"x": float(spring_b[0]), "y": float(spring_b[1]), "z": float(spring_z)}
        base["springingPoints"] = [spring_a_dict, spring_b_dict]

        # ── Span: horizontal distance between the two springing points ──
        dx = spring_a[0] - spring_b[0]
        dy = spring_a[1] - spring_b[1]
        span = float(np.sqrt(dx * dx + dy * dy))
        base["span"] = span

        # ── Apex ────────────────────────────────────────────────────────
        if len(valid_ids) == 1:
            # Single rib: find max-Z on the fitted arc analytically.
            # P(θ) = center + R*(cosθ * u + sinθ * v)
            # P_z(θ) = c_z + R*(cosθ * u_z + sinθ * v_z)
            # dP_z/dθ = R*(-sinθ * u_z + cosθ * v_z) = 0
            # → tanθ = v_z / u_z
            arc = arc_cache.get(valid_ids[0])
            if not arc:
                return base

            c = np.array([arc["center"]["x"], arc["center"]["y"], arc["center"]["z"]])
            r = float(arc["radius"])
            u = np.array([arc["basis_u"]["x"], arc["basis_u"]["y"], arc["basis_u"]["z"]])
            v = np.array([arc["basis_v"]["x"], arc["basis_v"]["y"], arc["basis_v"]["z"]])

            A = r * u[2]
            B = r * v[2]
            if abs(A) < 1e-12 and abs(B) < 1e-12:
                # Arc lies in a horizontal plane — apex is just the center
                apex_pt = c
            else:
                # Two candidate angles where dP_z/dθ = 0: θ and θ + π
                theta = math.atan2(B, A)
                candidates = [theta, theta + math.pi]
                # Pick the one that gives the higher Z
                best_pt = None
                best_z = -np.inf
                for t in candidates:
                    pt = c + r * (math.cos(t) * u + math.sin(t) * v)
                    if pt[2] > best_z:
                        best_z = pt[2]
                        best_pt = pt
                apex_pt = best_pt

            apex_dict = {"x": float(apex_pt[0]), "y": float(apex_pt[1]), "z": float(apex_pt[2])}
            base["apex"] = apex_dict
            base["apexHeight"] = float(apex_pt[2])
            base["status"] = "ok"

        else:
            # Multi-rib: order ribs by their midpoint position along the
            # springing-point axis, then intersect adjacent pairs.
            # The axis direction is spring_a → spring_b.
            axis = spring_b[:2] - spring_a[:2]
            axis_len = np.linalg.norm(axis)
            if axis_len < 1e-12:
                return base
            axis_dir = axis / axis_len

            def rib_projection(rid: str) -> float:
                pts = self.traces[rid]
                mid = pts[len(pts) // 2]
                return float(np.dot(mid[:2] - spring_a[:2], axis_dir))

            ordered = sorted(valid_ids, key=rib_projection)

            intersections: List[np.ndarray] = []
            for i in range(len(ordered) - 1):
                arc_a = arc_cache.get(ordered[i])
                arc_b = arc_cache.get(ordered[i + 1])
                if not arc_a or not arc_b:
                    continue
                pts = self._arc_arc_intersection(arc_a, arc_b)
                if pts:
                    # Take the intersection with the highest Z
                    best = max(pts, key=lambda p: p[2])
                    intersections.append(best)

            if not intersections:
                # Fallback: use max-Z across all individual arc apexes
                best_apex = None
                best_z = -np.inf
                for rid in valid_ids:
                    arc = arc_cache.get(rid)
                    if not arc:
                        continue
                    c = np.array([arc["center"]["x"], arc["center"]["y"], arc["center"]["z"]])
                    r_val = float(arc["radius"])
                    u_v = np.array([arc["basis_u"]["x"], arc["basis_u"]["y"], arc["basis_u"]["z"]])
                    v_v = np.array([arc["basis_v"]["x"], arc["basis_v"]["y"], arc["basis_v"]["z"]])
                    A_v = r_val * u_v[2]
                    B_v = r_val * v_v[2]
                    theta = math.atan2(B_v, A_v)
                    for t in [theta, theta + math.pi]:
                        pt = c + r_val * (math.cos(t) * u_v + math.sin(t) * v_v)
                        if pt[2] > best_z:
                            best_z = pt[2]
                            best_apex = pt
                if best_apex is not None:
                    apex_dict = {"x": float(best_apex[0]), "y": float(best_apex[1]), "z": float(best_apex[2])}
                    base["apex"] = apex_dict
                    base["apexHeight"] = float(best_apex[2])
                    base["status"] = "ok"
                return base

            # Average all intersection points for the apex
            avg = np.mean(intersections, axis=0)
            apex_dict = {"x": float(avg[0]), "y": float(avg[1]), "z": float(avg[2])}
            base["apex"] = apex_dict
            base["apexHeight"] = float(avg[2])
            base["status"] = "ok"

        return base

    def calculate_apex_span(
        self,
        bosses: List[Dict[str, Any]],
        max_boss_distance: float = 2.0,
        symmetry_angle_tol_deg: float = 30.0,
        impost_height: Optional[float] = None,
        pairings: Optional[List[Dict[str, Any]]] = None,
        semicircular_groups: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Compute architectural apex per boss and span per rib.

        Parameters
        ----------
        bosses
            ``[{id, x, y, z, label}, ...]`` — 3D boss positions.
        max_boss_distance
            Maximum distance from a rib endpoint to a boss for assignment.
        symmetry_angle_tol_deg
            Tolerance (degrees) for the axis-symmetry check when pairing
            ribs.  Two ribs are paired if reflecting one's outward direction
            about the global X **or** Y axis yields a vector within this
            angle of the other's outward direction.
        impost_height
            If provided, used as the Z of the springing plane for span
            projection.  Otherwise each rib's own springing Z is used.
        pairings
            Optional user-defined pairings. Each pairing must contain two
            sides, where each side provides one or more rib ids. A single
            best-fit arc is calculated per side and intersected in a common
            2D projection plane.

        Returns
        -------
        dict with keys ``bosses`` (list) and ``ribs`` (dict).
        """
        # 1. Assign ribs to bosses
        mapping = self._assign_ribs_to_bosses(bosses, max_boss_distance)

        # Pre-compute arc fits for every rib (cached per call)
        arc_cache: Dict[str, Dict[str, Any]] = {}
        for rid, pts in self.traces.items():
            if len(pts) >= 3:
                arc_cache[rid] = self._fit_arc(pts)

        boss_results: List[Dict[str, Any]] = []
        rib_results: Dict[str, Dict[str, Any]] = {}
        pairing_results: List[Dict[str, Any]] = []

        for boss in bosses:
            bid = boss["id"]
            entries = mapping.get(bid, [])
            assigned_ids = [e["rib_id"] for e in entries]

            # 2. Pair ribs at this boss (axis-symmetry pairing)
            pairs = self._pair_ribs_at_boss(entries, symmetry_angle_tol_deg)

            # 3. Compute apex per pair via arc-arc intersection
            pair_details: List[Dict[str, Any]] = []
            apex_candidates: List[np.ndarray] = []

            for rid_a, rid_b in pairs:
                arc_a = arc_cache.get(rid_a)
                arc_b = arc_cache.get(rid_b)
                if arc_a is None or arc_b is None:
                    continue

                inter_pts = self._arc_arc_intersection(arc_a, arc_b)
                if inter_pts is None or len(inter_pts) == 0:
                    continue

                # Pick the intersection with the larger Z (crown side)
                best = max(inter_pts, key=lambda p: p[2])
                apex_candidates.append(best)
                pair_details.append({
                    "ribA": rid_a,
                    "ribB": rid_b,
                    "intersection": {
                        "x": float(best[0]),
                        "y": float(best[1]),
                        "z": float(best[2]),
                    },
                })

            # 4. Average apex (or fall back to boss position)
            if apex_candidates:
                avg = np.mean(apex_candidates, axis=0)
                apex_3d = {"x": float(avg[0]), "y": float(avg[1]), "z": float(avg[2])}
            else:
                # Fallback: use the boss's own 3D position
                apex_3d = {"x": boss["x"], "y": boss["y"], "z": boss["z"]}

            boss_results.append({
                "bossId": bid,
                "bossLabel": boss.get("label", bid),
                "bossPosition": {"x": boss["x"], "y": boss["y"], "z": boss["z"]},
                "apex": apex_3d,
                "ribPairs": pair_details,
                "assignedRibs": assigned_ids,
            })

            # 5. Compute span per rib at this boss
            for entry in entries:
                rid = entry["rib_id"]
                spring = entry["springing_point"]  # numpy (3,)
                spring_z = float(impost_height) if impost_height is not None else float(spring[2])

                # Project apex down to the springing-Z plane
                proj_apex = np.array([apex_3d["x"], apex_3d["y"], spring_z])

                # Project springing corner to the impost plane too
                proj_spring = spring.copy()
                if impost_height is not None:
                    # Walk the polyline from the springing end to find
                    # the XY where the rib crosses Z = impost_height
                    pts = self.traces.get(rid)
                    if pts is not None and len(pts) >= 2:
                        # boss_end_idx 0 → springing is at end; -1 → at start
                        from_end = entry["boss_end_idx"] == 0
                        hit = self._polyline_z_intersection(pts, impost_height, from_end=from_end)
                        if hit is not None:
                            proj_spring = hit
                        else:
                            # Rib doesn't cross the plane — keep XY, set Z
                            proj_spring = np.array([spring[0], spring[1], spring_z])
                    else:
                        proj_spring = np.array([spring[0], spring[1], spring_z])
                # else: no impost height → keep physical springing point

                # Horizontal distance from projected springing to projected apex
                dx = proj_apex[0] - proj_spring[0]
                dy = proj_apex[1] - proj_spring[1]
                span = float(np.sqrt(dx * dx + dy * dy))

                rib_results[rid] = {
                    "ribId": rid,
                    "bossId": bid,
                    "span": span,
                    "springingPoint": {
                        "x": float(proj_spring[0]),
                        "y": float(proj_spring[1]),
                        "z": float(proj_spring[2]),
                    },
                    "projectedApex": {
                        "x": float(proj_apex[0]),
                        "y": float(proj_apex[1]),
                        "z": float(proj_apex[2]),
                    },
                }

        if pairings:
            for pairing in pairings:
                if not isinstance(pairing, dict):
                    continue

                pairing_id = str(pairing.get("pairingId", "")).strip()
                if not pairing_id:
                    continue

                pairing_name = str(pairing.get("pairingName", "")).strip() or pairing_id
                sides_raw = pairing.get("sides", [])

                if not isinstance(sides_raw, list) or len(sides_raw) != 2:
                    pairing_results.append({
                        "pairingId": pairing_id,
                        "pairingName": pairing_name,
                        "sideLabels": [],
                        "apex": None,
                        "apexHeight": None,
                        "status": "insufficient-data",
                        "warning": "Pairing must contain exactly two sides.",
                    })
                    continue

                side_labels: List[str] = []
                side_arcs: List[Optional[Dict[str, Any]]] = []

                for idx, side in enumerate(sides_raw):
                    if isinstance(side, dict):
                        side_label = (
                            str(side.get("sideLabel", "")).strip()
                            or str(side.get("sideId", "")).strip()
                            or f"Side {idx + 1}"
                        )
                        rib_ids_raw = side.get("ribIds", [])
                    else:
                        side_label = f"Side {idx + 1}"
                        rib_ids_raw = []

                    side_labels.append(side_label)

                    normalized_rib_ids: List[str] = []
                    if isinstance(rib_ids_raw, list):
                        for rib_id in rib_ids_raw:
                            rid = str(rib_id).strip()
                            if not rid or rid in normalized_rib_ids:
                                continue
                            normalized_rib_ids.append(rid)

                    side_arcs.append(self._fit_pairing_side_arc(normalized_rib_ids, arc_cache))

                if side_arcs[0] is None or side_arcs[1] is None:
                    pairing_results.append({
                        "pairingId": pairing_id,
                        "pairingName": pairing_name,
                        "sideLabels": side_labels,
                        "apex": None,
                        "apexHeight": None,
                        "status": "insufficient-data",
                        "warning": "Insufficient rib data to fit both pairing-side arcs.",
                    })
                    continue

                inter_pts = self._arc_arc_intersection(side_arcs[0], side_arcs[1])
                if inter_pts is None or len(inter_pts) == 0:
                    pairing_results.append({
                        "pairingId": pairing_id,
                        "pairingName": pairing_name,
                        "sideLabels": side_labels,
                        "apex": None,
                        "apexHeight": None,
                        "status": "no-intersection",
                        "warning": "No intersection found in the shared 2D projection.",
                    })
                    continue

                best = max(inter_pts, key=lambda p: p[2])
                apex = {
                    "x": float(best[0]),
                    "y": float(best[1]),
                    "z": float(best[2]),
                }
                pairing_results.append({
                    "pairingId": pairing_id,
                    "pairingName": pairing_name,
                    "sideLabels": side_labels,
                    "apex": apex,
                    "apexHeight": apex["z"],
                    "status": "ok",
                    "warning": None,
                })

        # Recompute span for each pairing side (group) as a whole:
        # use the outermost/lowest rib's springing point and arc projection,
        # then store the same group span for every rib in the side.
        for pr in pairing_results:
            if pr["status"] != "ok" or pr["apex"] is None:
                continue
            apex_z = pr["apex"]["z"]
            # Find the original pairing input to get rib IDs per side
            sides_raw = None
            for pairing in (pairings or []):
                if not isinstance(pairing, dict):
                    continue
                if str(pairing.get("pairingId", "")).strip() == pr["pairingId"]:
                    sides_raw = pairing.get("sides", [])
                    break
            if not sides_raw:
                continue
            for side in sides_raw:
                if not isinstance(side, dict):
                    continue
                # Collect valid rib IDs for this side (group)
                rib_ids = [
                    str(r).strip()
                    for r in (side.get("ribIds", []) if isinstance(side.get("ribIds"), list) else [])
                ]
                rib_ids = [
                    r for r in rib_ids
                    if r in arc_cache
                    and self.traces.get(r) is not None
                    and len(self.traces[r]) >= 2
                ]
                if not rib_ids:
                    continue

                # Find the outermost/lowest rib: the one whose springing endpoint
                # has the lowest Z (most grounded in the wall).
                def _spring_endpoint_z(rid: str) -> float:
                    pts = self.traces[rid]
                    return min(float(pts[0][2]), float(pts[-1][2]))

                outermost_rid = min(rib_ids, key=_spring_endpoint_z)
                outer_pts = self.traces[outermost_rid]
                from_end = float(outer_pts[-1][2]) < float(outer_pts[0][2])
                spring_3d = outer_pts[-1].copy() if from_end else outer_pts[0].copy()
                if impost_height is not None:
                    hit = self._polyline_z_intersection(outer_pts, impost_height, from_end=from_end)
                    if hit is not None:
                        spring_3d = hit
                    else:
                        spring_3d = np.array([float(spring_3d[0]), float(spring_3d[1]), float(impost_height)])

                # Project the outermost rib's arc to the pairing apex Z
                arc_pt = self._arc_point_at_z(arc_cache[outermost_rid], apex_z)
                if arc_pt is None:
                    continue

                proj_apex_dict = {
                    "x": float(arc_pt[0]),
                    "y": float(arc_pt[1]),
                    "z": float(arc_pt[2]),
                }
                spring_dict = {
                    "x": float(spring_3d[0]),
                    "y": float(spring_3d[1]),
                    "z": float(spring_3d[2]),
                }
                dx = float(arc_pt[0]) - float(spring_3d[0])
                dy = float(arc_pt[1]) - float(spring_3d[1])
                group_span = float(np.sqrt(dx * dx + dy * dy))

                # Store the group span under every rib in the side
                for rid in rib_ids:
                    if rid in rib_results:
                        rib_results[rid]["span"] = group_span
                        rib_results[rid]["projectedApex"] = proj_apex_dict
                        rib_results[rid]["springingPoint"] = spring_dict
                    else:
                        rib_results[rid] = {
                            "ribId": rid,
                            "bossId": None,
                            "span": group_span,
                            "springingPoint": spring_dict,
                            "projectedApex": proj_apex_dict,
                        }

        # ── Phase: Semicircular groups ──────────────────────────────
        semicircular_results: List[Dict[str, Any]] = []
        if semicircular_groups:
            for sg in semicircular_groups:
                sc_result = self._compute_semicircular_apex(
                    group_id=sg["groupId"],
                    group_name=sg["groupName"],
                    rib_ids=sg["ribIds"],
                    arc_cache=arc_cache,
                    bosses_raw=bosses,
                    impost_height=impost_height,
                )
                semicircular_results.append(sc_result)

                # Write per-rib half-span into rib_results so export picks it up.
                # Each rib gets its own half-span = horizontal distance from
                # that rib's springing point to the semicircular apex.
                if sc_result.get("status") == "ok" and sc_result.get("apex") is not None:
                    apex_dict = sc_result["apex"]
                    apex_xy = np.array([apex_dict["x"], apex_dict["y"]])
                    spring_z = impost_height if impost_height is not None else 0.0

                    for rid in sg["ribIds"]:
                        pts = self.traces.get(rid)
                        if pts is None or len(pts) < 2:
                            continue

                        # Identify this rib's springing point: the endpoint
                        # farther (horizontally) from the apex.
                        first, last = pts[0], pts[-1]
                        d_first = float(np.linalg.norm(first[:2] - apex_xy))
                        d_last = float(np.linalg.norm(last[:2] - apex_xy))
                        springing = first if d_first > d_last else last

                        # Project springing to impost plane if available
                        proj_spring = springing.copy()
                        if impost_height is not None:
                            from_end = d_first > d_last  # springing is at first → from start
                            hit = self._polyline_z_intersection(pts, impost_height, from_end=not from_end)
                            if hit is not None:
                                proj_spring = hit
                            else:
                                proj_spring = np.array([springing[0], springing[1], spring_z])

                        proj_apex = np.array([apex_dict["x"], apex_dict["y"], proj_spring[2]])
                        dx = proj_apex[0] - proj_spring[0]
                        dy = proj_apex[1] - proj_spring[1]
                        half_span = float(np.sqrt(dx * dx + dy * dy))

                        rib_results[rid] = {
                            "ribId": rid,
                            "bossId": None,
                            "span": half_span,
                            "springingPoint": {
                                "x": float(proj_spring[0]),
                                "y": float(proj_spring[1]),
                                "z": float(proj_spring[2]),
                            },
                            "projectedApex": {
                                "x": float(proj_apex[0]),
                                "y": float(proj_apex[1]),
                                "z": float(proj_apex[2]),
                            },
                        }

        return {
            "bosses": boss_results,
            "ribs": rib_results,
            "pairingApex": pairing_results,
            "semicircularApex": semicircular_results,
        }

    async def save_hypothesis(
        self,
        name: str,
        description: str,
        measurements: List[Dict[str, Any]],
    ) -> str:
        """Save a measurement hypothesis."""
        
        import uuid
        hypothesis_id = str(uuid.uuid4())
        
        self.hypotheses[hypothesis_id] = {
            "id": hypothesis_id,
            "name": name,
            "description": description,
            "measurements": measurements,
        }
        
        return hypothesis_id
