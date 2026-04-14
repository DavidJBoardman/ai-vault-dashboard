"""Measurement service for 3D geometric calculations."""

import asyncio
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
            
            # Reconstruct 3D center from 2D projection
            center_3d = centroid + cx * u + cz * v
            normal = Vt[2]  # normal to the best-fit plane
            
            return {
                "radius": float(radius),
                "center": {"x": float(center_3d[0]), "y": float(center_3d[1]), "z": float(center_3d[2])},
                "center_2d": (float(cx), float(cz)),
                "normal": normal.tolist(),
                "error": float(error)
            }
        except Exception:
            # Fallback 3D center
            center_3d = centroid + x_mean * u + z_mean * v
            normal = np.cross(u, v)
            norm_len = np.linalg.norm(normal)
            normal = normal / norm_len if norm_len > 1e-9 else normal
            return {
                "radius": float(r_guess),
                "center": {"x": float(center_3d[0]), "y": float(center_3d[1]), "z": float(center_3d[2])},
                "center_2d": (float(x_mean), float(z_mean)),
                "normal": normal.tolist(),
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
        - i.e. in the direction the rib is heading away from its body toward
        the keystone gap.

        Args:
            points:  Ordered (N, 3) point array for the rib.
            at_end:  True  -> tangent at points[-1] (last point, forward direction)
                     False -> tangent at points[0]  (first point, reversed direction)
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
          2. The nearest endpoint pair is within ``max_gap`` metres - the gap
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

                # Gate 1 - radius similarity
                ra = arc_radii.get(a, 0.0)
                rb = arc_radii.get(b, 0.0)
                if ra > 0 and rb > 0:
                    if abs(ra - rb) / max(ra, rb) > radius_tolerance:
                        continue

                # Gate 2 - nearest endpoint pair and gap cap
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
                    # Endpoints coincide - treat as connected without direction check
                    adj[a].add(b)
                    adj[b].add(a)
                    continue
                gap_vec = gap_vec / gap_len

                # Gate 3 - handshake direction
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
