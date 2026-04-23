"""
Intrados line tracing service.

Traces the center lines (intrados) of rib masks by finding the center-bottom edge
of each rib profile - the point that is both horizontally centered and at the
lowest Z within that center region.
"""

import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path


def trace_intrados_line(
    points_3d: np.ndarray,
    num_slices: int = 50,
    smooth_window: int = 5,
    center_tolerance: float = 0.3,
    z_percentile: float = 10.0
) -> np.ndarray:
    """
    Trace the intrados (center) line of a rib from its constituent 3D points.
    
    Algorithm:
    1. Find the principal axis (direction the rib runs) using PCA
    2. Slice the rib perpendicular to this axis
    3. For each slice:
       a. Find the horizontal centroid (center of the rib in X/Y)
       b. Filter to points near this center (within center_tolerance)
       c. Among centered points, find the lowest Z (the intrados)
    4. Smooth the resulting line
    
    Args:
        points_3d: Nx3 array of 3D points belonging to the rib
        num_slices: Number of slices along the rib length
        smooth_window: Window size for smoothing the result
        center_tolerance: Fraction of slice width to consider as "center"
        z_percentile: Percentile of Z values to use (lower = closer to bottom edge)
    
    Returns:
        Mx3 array of points forming the intrados line
    """
    if len(points_3d) < 20:
        return np.array([])
    
    # STEP 1: Find the principal axis using PCA
    centroid = points_3d.mean(axis=0)
    centered = points_3d - centroid
    
    cov = np.cov(centered.T)
    eigenvalues, eigenvectors = np.linalg.eigh(cov)
    
    # Principal axis is the eigenvector with the largest eigenvalue (rib direction)
    sorted_indices = np.argsort(eigenvalues)[::-1]
    principal_axis = eigenvectors[:, sorted_indices[0]]  # Longest direction
    secondary_axis = eigenvectors[:, sorted_indices[1]]  # Width direction
    
    # Ensure consistent direction
    if principal_axis[0] < 0:
        principal_axis = -principal_axis
    
    # STEP 2: Project points onto principal axis for slicing
    projections = np.dot(centered, principal_axis)
    min_proj = projections.min()
    max_proj = projections.max()
    
    rib_length = max_proj - min_proj
    if rib_length < 0.1:
        return np.array([centroid])
    
    print(f"    Rib length: {rib_length:.2f}m, slicing into {num_slices} sections")
    
    # STEP 3: Process each slice
    slice_boundaries = np.linspace(min_proj, max_proj, num_slices + 1)
    intrados_points = []
    
    for i in range(num_slices):
        # Get points in this slice
        slice_mask = (projections >= slice_boundaries[i]) & (projections < slice_boundaries[i + 1])
        slice_points = points_3d[slice_mask]
        
        if len(slice_points) < 5:
            continue
        
        # Find the horizontal centroid of this slice (X/Y center)
        slice_centroid_xy = slice_points[:, :2].mean(axis=0)
        
        # Calculate distance from center for each point (in X/Y only)
        xy_distances = np.linalg.norm(slice_points[:, :2] - slice_centroid_xy, axis=1)
        
        # Find the width of this slice
        slice_width = xy_distances.max() if len(xy_distances) > 0 else 1.0
        
        # Filter to points near the center (within center_tolerance of the width)
        center_radius = slice_width * center_tolerance
        center_mask = xy_distances <= center_radius
        center_points = slice_points[center_mask]
        
        if len(center_points) < 3:
            # If too few center points, use all points in slice
            center_points = slice_points
        
        # Among centered points, find the lowest Z values
        z_values = center_points[:, 2]
        
        # Use percentile to avoid extreme outliers
        target_z = np.percentile(z_values, z_percentile)
        
        # Find the point closest to this target Z
        z_distances = np.abs(z_values - target_z)
        best_idx = np.argmin(z_distances)
        
        intrados_points.append(center_points[best_idx])
    
    if len(intrados_points) < 3:
        return np.array([centroid])
    
    intrados_line = np.array(intrados_points)
    print(f"    Found {len(intrados_line)} intrados points before smoothing")
    
    # STEP 4: Remove outliers based on Z consistency
    z_vals = intrados_line[:, 2]
    z_median = np.median(z_vals)
    z_std = np.std(z_vals)
    
    if z_std > 0.01:
        # Keep points within 2 std of median
        keep_mask = np.abs(z_vals - z_median) < 2.5 * z_std
        if keep_mask.sum() >= 3:
            intrados_line = intrados_line[keep_mask]
            print(f"    After Z outlier removal: {len(intrados_line)} points")
    
    # STEP 5: Smooth the line using moving average
    if len(intrados_line) >= smooth_window:
        smoothed = np.zeros_like(intrados_line)
        half_window = smooth_window // 2
        
        for i in range(len(intrados_line)):
            start = max(0, i - half_window)
            end = min(len(intrados_line), i + half_window + 1)
            smoothed[i] = intrados_line[start:end].mean(axis=0)
        
        intrados_line = smoothed
    
    # STEP 6: Final median filter on Z to remove any spikes
    if len(intrados_line) >= 5:
        z_vals = intrados_line[:, 2].copy()
        for i in range(2, len(z_vals) - 2):
            window = z_vals[i-2:i+3]
            intrados_line[i, 2] = np.median(window)
    
    return intrados_line


def trace_all_rib_intrados(
    e57_points: np.ndarray,
    e57_colors: Optional[np.ndarray],
    rib_masks: Dict[str, np.ndarray],
    projection_metadata: Dict[str, Any],
    centroid: np.ndarray,
    num_slices: int = 50,
    depth_percentile: float = 25.0,
    outlier_threshold: float = 1.5,
    continuity_threshold: float = 0.15,
    max_step_meters: float = 0.5,
    floor_plane_z: Optional[float] = None,
    exclusion_box: Optional[Dict[str, float]] = None
) -> Dict[str, Dict[str, Any]]:
    """
    Trace intrados lines for all rib masks.
    
    Args:
        e57_points: Full E57 point cloud (Nx3)
        e57_colors: Optional colors (Nx3)
        rib_masks: Dict of mask_id -> 2D mask array
        projection_metadata: Projection settings (bounds, resolution, etc.)
        centroid: Centroid used during projection
        num_slices: Number of slices per rib
        depth_percentile: Percentile for Z selection (lower = closer to bottom)
        outlier_threshold: IQR multiplier for Z range
        continuity_threshold: Max Z deviation fraction
        max_step_meters: Maximum step between points
        floor_plane_z: Exclude points below this Z
        exclusion_box: Exclude points inside this box
    
    Returns:
        Dict of mask_id -> {
            "points_3d": intrados line points,
            "points_2d": projected 2D points for visualization,
            "point_count": number of rib points found
        }
    """
    resolution = projection_metadata.get("resolution", 2048)
    bounds = projection_metadata.get("bounds", {})
    perspective = projection_metadata.get("perspective", "bottom")
    bottom_up = projection_metadata.get("bottom_up", True)
    
    min_x = bounds.get("min_x", -5)
    max_x = bounds.get("max_x", 5)
    min_y = bounds.get("min_y", -5)
    max_y = bounds.get("max_y", 5)
    
    # Center points (same as projection did)
    centred_points = e57_points - centroid
    
    # Project to 2D (same logic as projection)
    if perspective == "top":
        proj_x = centred_points[:, 0]
        proj_y = centred_points[:, 1]
    elif perspective == "bottom":
        proj_x = centred_points[:, 0]
        proj_y = -centred_points[:, 1]
    elif perspective == "north":
        proj_x = centred_points[:, 0]
        proj_y = centred_points[:, 2]
    elif perspective == "south":
        proj_x = -centred_points[:, 0]
        proj_y = centred_points[:, 2]
    elif perspective == "east":
        proj_x = -centred_points[:, 1]
        proj_y = centred_points[:, 2]
    elif perspective == "west":
        proj_x = centred_points[:, 1]
        proj_y = centred_points[:, 2]
    else:
        proj_x = centred_points[:, 0]
        proj_y = centred_points[:, 1]
    
    if bottom_up:
        proj_y = -proj_y
    
    # Map to pixel coordinates
    range_x = max_x - min_x
    range_y = max_y - min_y
    max_range = max(range_x, range_y) if max(range_x, range_y) > 0 else 1.0
    
    margin = 0.05
    effective_res = int(resolution * (1 - 2 * margin))
    offset = int(resolution * margin)
    
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2
    
    px = ((proj_x - center_x) / max_range + 0.5) * effective_res + offset
    py = ((proj_y - center_y) / max_range + 0.5) * effective_res + offset
    
    px_int = np.clip(px.astype(np.int32), 0, resolution - 1)
    py_int = np.clip(py.astype(np.int32), 0, resolution - 1)
    
    # Process each rib mask
    results = {}
    
    for mask_id, mask in rib_masks.items():
        print(f"  Tracing intrados for {mask_id}...")
        
        # Find points that fall within this mask (vectorized — avoid Python loop over ~27M points per mask)
        mh, mw = int(mask.shape[0]), int(mask.shape[1])
        in_bounds = (px_int >= 0) & (px_int < mw) & (py_int >= 0) & (py_int < mh)
        in_mask = np.zeros(len(e57_points), dtype=bool)
        in_mask[in_bounds] = mask[py_int[in_bounds], px_int[in_bounds]] > 127
        
        rib_points = e57_points[in_mask]
        original_count = len(rib_points)
        print(f"    Found {original_count} points in mask")
        
        # Apply floor plane exclusion
        if floor_plane_z is not None:
            above_floor = rib_points[:, 2] >= floor_plane_z
            rib_points = rib_points[above_floor]
            print(f"    After floor plane filter (Z >= {floor_plane_z:.2f}): {len(rib_points)} points")
        
        # Apply exclusion box
        if exclusion_box is not None and exclusion_box.get("enabled", True):
            box_min_x = exclusion_box.get("minX", float("-inf"))
            box_max_x = exclusion_box.get("maxX", float("inf"))
            box_min_y = exclusion_box.get("minY", float("-inf"))
            box_max_y = exclusion_box.get("maxY", float("inf"))
            box_min_z = exclusion_box.get("minZ", float("-inf"))
            box_max_z = exclusion_box.get("maxZ", float("inf"))
            
            # Keep points OUTSIDE the exclusion box
            inside_box = (
                (rib_points[:, 0] >= box_min_x) & (rib_points[:, 0] <= box_max_x) &
                (rib_points[:, 1] >= box_min_y) & (rib_points[:, 1] <= box_max_y) &
                (rib_points[:, 2] >= box_min_z) & (rib_points[:, 2] <= box_max_z)
            )
            rib_points = rib_points[~inside_box]
            print(f"    After exclusion box: {len(rib_points)} points")
        
        if len(rib_points) < 20:
            print(f"    Skipping - too few points after filtering")
            continue
        
        # Trace the intrados line - find center-bottom of each slice
        intrados_3d = trace_intrados_line(
            rib_points, 
            num_slices=num_slices,
            smooth_window=5,
            center_tolerance=0.3,  # Look at center 30% of rib width
            z_percentile=depth_percentile  # Use lower percentile for bottom edge
        )
        
        if len(intrados_3d) < 2:
            print(f"    Skipping - could not trace line")
            continue
        
        # Project intrados back to 2D for visualization
        intrados_centered = intrados_3d - centroid
        
        if perspective == "bottom":
            int_proj_x = intrados_centered[:, 0]
            int_proj_y = -intrados_centered[:, 1]
        else:
            int_proj_x = intrados_centered[:, 0]
            int_proj_y = intrados_centered[:, 1]
        
        if bottom_up:
            int_proj_y = -int_proj_y
        
        int_px = ((int_proj_x - center_x) / max_range + 0.5) * effective_res + offset
        int_py = ((int_proj_y - center_y) / max_range + 0.5) * effective_res + offset
        
        intrados_2d = np.column_stack([int_px, int_py])
        
        results[mask_id] = {
            "points_3d": intrados_3d.tolist(),
            "points_2d": intrados_2d.tolist(),
            "point_count": len(rib_points),
            "line_length": len(intrados_3d),
        }

        print(f"    [OK] Traced {len(intrados_3d)} intrados points")

    return results


def bridge_rib_intrados_through_boss_stones(
    rib_results: Dict[str, Dict[str, Any]],
    e57_points: np.ndarray,
    boss_stone_masks: Dict[str, np.ndarray],
    boss_stone_meta: Dict[str, Dict],
    projection_metadata: Dict[str, Any],
    centroid: np.ndarray,
    proximity_threshold: float = 1.0,
    collinearity_threshold: float = -0.4,
    num_boss_slices: int = 20,
) -> Dict[str, Dict[str, Any]]:
    """
    For each boss stone, find pairs of rib intrados lines whose endpoints
    approach it from approximately opposite directions (collinear through the
    boss).  For each such pair, stitch rib_a + boss_bridge + rib_b into a
    single continuous arc line that can be used to reconstruct the full arch.

    The bridge section is traced by running ``trace_intrados_line`` on the
    boss stone's own 3D points (same PCA/slicing approach as ribs).  If the
    boss stone yields too few points a linear fallback is used.

    Args:
        rib_results:           Output of ``trace_all_rib_intrados``.
        e57_points:            Full E57 point cloud (Nx3).
        boss_stone_masks:      boss_mask_id -> 2-D uint8 mask array.
        boss_stone_meta:       boss_mask_id -> {label, color}.
        projection_metadata:   Same projection settings used for rib tracing.
        centroid:              Centroid used during projection.
        proximity_threshold:   Max distance (m) from rib endpoint to boss
                               centroid to qualify as "near" the boss.
        collinearity_threshold: Max cosine between the two endpoint directions
                               to qualify as collinear (default -0.4 ≈ 114°).
        num_boss_slices:       Slices used when tracing through boss stone.

    Returns:
        Dict of bridge_id -> {
            points_3d, points_2d, point_count, line_length,
            isBridge, ribAId, ribBId, bossId
        }
    """
    if not boss_stone_masks or not rib_results:
        return {}

    # ── Projection setup (mirrors trace_all_rib_intrados) ──────────────────
    resolution = projection_metadata.get("resolution", 2048)
    bounds = projection_metadata.get("bounds", {})
    perspective = projection_metadata.get("perspective", "bottom")
    bottom_up = projection_metadata.get("bottom_up", True)
    min_x = bounds.get("min_x", -5)
    max_x = bounds.get("max_x", 5)
    min_y = bounds.get("min_y", -5)
    max_y = bounds.get("max_y", 5)
    margin = 0.05
    effective_res = int(resolution * (1 - 2 * margin))
    offset = int(resolution * margin)
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2
    max_range = max(max_x - min_x, max_y - min_y) or 1.0

    # Project all E57 points to pixels once
    centred_all = e57_points - centroid
    if perspective == "top":
        proj_x_all, proj_y_all = centred_all[:, 0], centred_all[:, 1]
    elif perspective == "bottom":
        proj_x_all, proj_y_all = centred_all[:, 0], -centred_all[:, 1]
    elif perspective == "north":
        proj_x_all, proj_y_all = centred_all[:, 0], centred_all[:, 2]
    elif perspective == "south":
        proj_x_all, proj_y_all = -centred_all[:, 0], centred_all[:, 2]
    elif perspective == "east":
        proj_x_all, proj_y_all = -centred_all[:, 1], centred_all[:, 2]
    elif perspective == "west":
        proj_x_all, proj_y_all = centred_all[:, 1], centred_all[:, 2]
    else:
        proj_x_all, proj_y_all = centred_all[:, 0], centred_all[:, 1]

    if bottom_up:
        proj_y_all = -proj_y_all

    px_all = ((proj_x_all - center_x) / max_range + 0.5) * effective_res + offset
    py_all = ((proj_y_all - center_y) / max_range + 0.5) * effective_res + offset
    px_int_all = np.clip(px_all.astype(np.int32), 0, resolution - 1)
    py_int_all = np.clip(py_all.astype(np.int32), 0, resolution - 1)

    def _project_back_to_2d(pts_3d: np.ndarray) -> np.ndarray:
        c = pts_3d - centroid
        if perspective == "bottom":
            ix, iy = c[:, 0], -c[:, 1]
        elif perspective == "top":
            ix, iy = c[:, 0], c[:, 1]
        elif perspective == "north":
            ix, iy = c[:, 0], c[:, 2]
        elif perspective == "south":
            ix, iy = -c[:, 0], c[:, 2]
        elif perspective == "east":
            ix, iy = -c[:, 1], c[:, 2]
        elif perspective == "west":
            ix, iy = c[:, 1], c[:, 2]
        else:
            ix, iy = c[:, 0], c[:, 1]
        if bottom_up:
            iy = -iy
        px2 = ((ix - center_x) / max_range + 0.5) * effective_res + offset
        py2 = ((iy - center_y) / max_range + 0.5) * effective_res + offset
        return np.column_stack([px2, py2])

    bridges: Dict[str, Dict[str, Any]] = {}

    for boss_id, boss_mask in boss_stone_masks.items():
        # ── Extract 3-D points within this boss stone mask ──────────────
        mh, mw = int(boss_mask.shape[0]), int(boss_mask.shape[1])
        in_bounds = (
            (px_int_all >= 0) & (px_int_all < mw) &
            (py_int_all >= 0) & (py_int_all < mh)
        )
        in_mask = np.zeros(len(e57_points), dtype=bool)
        in_mask[in_bounds] = boss_mask[py_int_all[in_bounds], px_int_all[in_bounds]] > 127
        boss_pts = e57_points[in_mask]

        if len(boss_pts) < 10:
            print(f"  Bridge: skipping boss {boss_id[:8]} — only {len(boss_pts)} pts")
            continue

        boss_centroid_3d = boss_pts.mean(axis=0)
        print(f"  Bridge: boss {boss_id[:8]} centroid={np.round(boss_centroid_3d,2)}, pts={len(boss_pts)}")

        # ── Find rib trace endpoints near this boss stone ────────────────
        near: List[Dict] = []
        for mask_id, line_data in rib_results.items():
            pts = np.array(line_data["points_3d"])
            if len(pts) < 4:
                continue

            for end_idx, end_tag in [(0, "start"), (-1, "end")]:
                dist = float(np.linalg.norm(pts[end_idx] - boss_centroid_3d))
                if dist >= proximity_threshold:
                    continue
                # Direction vector: from a few points back toward the endpoint
                if end_tag == "start":
                    look_back = pts[min(4, len(pts) - 1)]
                    dir_vec = pts[0] - look_back
                else:
                    look_back = pts[max(-5, -len(pts))]
                    dir_vec = pts[-1] - look_back
                norm = float(np.linalg.norm(dir_vec))
                if norm < 1e-6:
                    continue
                near.append({
                    "mask_id": mask_id,
                    "endpoint": pts[end_idx],
                    "direction": dir_vec / norm,
                    "end": end_tag,
                    "pts": pts,
                    "dist": dist,
                })

        if len(near) < 2:
            print(f"  Bridge: boss {boss_id[:8]} — only {len(near)} endpoints nearby, skipping")
            continue

        print(f"  Bridge: boss {boss_id[:8]} — {len(near)} rib endpoints within {proximity_threshold}m")

        # ── Pair ribs that approach from approximately opposite sides ────
        used: set = set()
        for i in range(len(near)):
            if i in used:
                continue
            ep_a = near[i]
            best_j, best_cos = -1, collinearity_threshold

            for j in range(len(near)):
                if j == i or j in used:
                    continue
                if ep_a["mask_id"] == near[j]["mask_id"]:
                    continue
                cos = float(np.dot(ep_a["direction"], near[j]["direction"]))
                if cos < best_cos:
                    best_cos = cos
                    best_j = j

            if best_j == -1:
                continue

            ep_b = near[best_j]
            used.add(i)
            used.add(best_j)

            print(f"  Bridge: pairing {ep_a['mask_id'][:8]}({ep_a['end']}) + "
                  f"{ep_b['mask_id'][:8]}({ep_b['end']}), cos={best_cos:.2f}")

            # ── Trace through boss stone ─────────────────────────────────
            boss_trace = trace_intrados_line(
                boss_pts,
                num_slices=num_boss_slices,
                smooth_window=3,
                center_tolerance=0.5,
                z_percentile=25.0,
            )

            if len(boss_trace) < 2:
                # Fallback: straight-line interpolation endpoint-to-endpoint
                print(f"  Bridge: fallback linear bridge for boss {boss_id[:8]}")
                t = np.linspace(0, 1, 8)
                boss_trace = np.array([
                    ep_a["endpoint"] * (1 - ti) + ep_b["endpoint"] * ti
                    for ti in t
                ])

            # ── Orient and stitch ────────────────────────────────────────
            # rib_a: its boss-side endpoint should be last
            pts_a = ep_a["pts"].copy()
            if ep_a["end"] == "start":
                pts_a = pts_a[::-1]

            # rib_b: its boss-side endpoint should be first
            pts_b = ep_b["pts"].copy()
            if ep_b["end"] == "end":
                pts_b = pts_b[::-1]

            # Orient boss trace so its start is closest to pts_a[-1]
            if np.linalg.norm(boss_trace[-1] - pts_a[-1]) < np.linalg.norm(boss_trace[0] - pts_a[-1]):
                boss_trace = boss_trace[::-1]

            full_arc = np.vstack([pts_a, boss_trace, pts_b])
            full_2d = _project_back_to_2d(full_arc)

            bridge_id = f"bridge-{boss_id[:8]}-{ep_a['mask_id'][:8]}-{ep_b['mask_id'][:8]}"
            bridges[bridge_id] = {
                "points_3d": full_arc.tolist(),
                "points_2d": full_2d.tolist(),
                "point_count": len(boss_pts),
                "line_length": len(full_arc),
                "isBridge": True,
                "ribAId": ep_a["mask_id"],
                "ribBId": ep_b["mask_id"],
                "bossId": boss_id,
            }
            print(f"  Bridge: arc has {len(full_arc)} points "
                  f"({len(pts_a)} + {len(boss_trace)} + {len(pts_b)})")

    return bridges
