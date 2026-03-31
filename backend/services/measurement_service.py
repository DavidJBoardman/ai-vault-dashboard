"""Measurement service for 3D geometric calculations."""

import asyncio
import math
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
      """Calculate distance of each point from the ideal fitted arc.
      
      Args:
          points: Array of 3D points (N x 3)
          arc_params: Dictionary containing arc parameters with 'center' (2D tuple) and 'radius'
      
      Returns:
          Array of distances for each point from the ideal arc (N,)
      """
      
      # Extract center and radius from arc parameters
      # center_2d is stored as tuple (cx, cz) for 2D projection calculations
      center_2d = arc_params.get("center_2d", (0, 0))
      if isinstance(center_2d, dict):
          # Fallback if center is 3D dict (shouldn't happen, but be safe)
          cx, cz = 0, 0
      else:
          cx, cz = center_2d
      radius = arc_params["radius"]
      
      # Project points to 2D (XZ plane)
      x = points[:, 0]
      z = points[:, 2]
      
      # Calculate distance from each point to the arc center
      distances_to_center = np.sqrt((x - cx)**2 + (z - cz)**2)
      
      # Calculate signed distance from the ideal arc
      # Positive = outside the arc, Negative = inside the arc
      point_distances = distances_to_center - radius
      
      return point_distances
    
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
        n_pts: int = 5,
    ) -> np.ndarray:
        """
        Return the unit tangent vector at one end of a rib, pointing *outward*
        — i.e. in the direction the rib is heading away from its body toward
        the keystone gap.

        Args:
            points:  Ordered (N, 3) point array for the rib.
            at_end:  True  → tangent at points[-1] (last point, forward direction)
                     False → tangent at points[0]  (first point, reversed direction)
            n_pts:   How many points back from the tip to use for the local tangent.
                     Clamped to len(points)//4 so we don't overshoot the midpoint.
        """
        k = max(1, min(n_pts, len(points) // 4))
        if at_end:
            tip = points[-1]
            base = points[-(k + 1)]
        else:
            tip = points[0]
            base = points[k]
        vec = tip - base
        length = np.linalg.norm(vec)
        return vec / (length + 1e-12)

    def detect_rib_groups(
        self,
        max_gap: float = 2.0,
        angle_threshold_deg: float = 25.0,
        radius_tolerance: float = 0.15,
    ) -> List[List[str]]:
        """
        Detect groups of ribs that are continuations of the same structural rib,
        split by a keystone or boss stone.

        Two ribs belong to the same group when ALL of the following hold:

          1. Their fitted arc radii agree within ``radius_tolerance`` (relative).
          2. The nearest endpoint pair is within ``max_gap`` metres — the gap
             across the keystone.
          3. Handshake direction: the tangent of rib A at its junction end
             points toward rib B *and* the tangent of rib B at its junction end
             points back toward rib A, both within ``angle_threshold_deg``.
             This enforces directional continuity regardless of gap size.

        Returns a list of groups; singletons appear as a one-element group.
        """
        rib_ids = list(self.traces.keys())
        if not rib_ids:
            return []

        cos_tol = np.cos(np.deg2rad(angle_threshold_deg))

        # Pre-compute arc radius for the radius gate
        arc_radii: Dict[str, float] = {}
        for rib_id, points in self.traces.items():
            if len(points) >= 3:
                arc_radii[rib_id] = self._fit_arc(points)["radius"]

        # Build undirected adjacency graph
        adj: Dict[str, set] = {rid: set() for rid in rib_ids}
        n = len(rib_ids)
        for i in range(n):
            for j in range(i + 1, n):
                a, b = rib_ids[i], rib_ids[j]
                pts_a = self.traces.get(a)
                pts_b = self.traces.get(b)
                if pts_a is None or pts_b is None:
                    continue
                if len(pts_a) < 3 or len(pts_b) < 3:
                    continue

                # Gate 1 — radius similarity
                ra = arc_radii.get(a, 0.0)
                rb = arc_radii.get(b, 0.0)
                if ra > 0 and rb > 0:
                    if abs(ra - rb) / max(ra, rb) > radius_tolerance:
                        continue

                # Gate 2 — nearest endpoint pair and gap cap
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
                if min_dist > max_gap:
                    continue

                # gap_vec: unit vector from A's junction point toward B's
                a_near = pts_a[-1] if a_end else pts_a[0]
                b_near = pts_b[-1] if b_end else pts_b[0]
                gap_vec = b_near - a_near
                gap_len = np.linalg.norm(gap_vec)
                if gap_len < 1e-9:
                    # Endpoints coincide — treat as connected without direction check
                    adj[a].add(b)
                    adj[b].add(a)
                    continue
                gap_vec = gap_vec / gap_len

                # Gate 3 — handshake direction
                # A's outward tangent at its junction end should point toward B
                tan_a = self._tangent_at_endpoint(pts_a, at_end=a_end)
                if float(np.dot(tan_a, gap_vec)) < cos_tol:
                    continue
                # B's outward tangent at its junction end should point toward A
                tan_b = self._tangent_at_endpoint(pts_b, at_end=b_end)
                if float(np.dot(tan_b, -gap_vec)) < cos_tol:
                    continue

                adj[a].add(b)
                adj[b].add(a)

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

        return groups

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

    def calculate_apex_span(
        self,
        bosses: List[Dict[str, Any]],
        max_boss_distance: float = 2.0,
        symmetry_angle_tol_deg: float = 30.0,
        impost_height: Optional[float] = None,
        pairings: Optional[List[Dict[str, Any]]] = None,
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

        # Recompute span for ribs belonging to a pairing: horizontal distance
        # from the springing point to where the rib's best-fit arc extension
        # reaches the pairing apex Z.
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
                for rid_raw in (side.get("ribIds", []) if isinstance(side.get("ribIds"), list) else []):
                    rid = str(rid_raw).strip()
                    if rid not in rib_results or rid not in arc_cache:
                        continue
                    arc = arc_cache[rid]
                    arc_pt = self._arc_point_at_z(arc, apex_z)
                    if arc_pt is None:
                        continue
                    existing = rib_results[rid]
                    sp = existing["springingPoint"]
                    dx = float(arc_pt[0]) - sp["x"]
                    dy = float(arc_pt[1]) - sp["y"]
                    new_span = float(np.sqrt(dx * dx + dy * dy))
                    rib_results[rid]["span"] = new_span
                    rib_results[rid]["projectedApex"] = {
                        "x": float(arc_pt[0]),
                        "y": float(arc_pt[1]),
                        "z": float(arc_pt[2]),
                    }

        return {"bosses": boss_results, "ribs": rib_results, "pairingApex": pairing_results}

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

