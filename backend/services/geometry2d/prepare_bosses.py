"""Prepare boss centroids for Geometry2D pipeline."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

from services.geometry2d.utils.roi_math import image_to_unit


def _normalise_binary(mask_img: np.ndarray) -> np.ndarray:
    if mask_img.ndim == 3:
        # If alpha exists, use it first; otherwise grayscale conversion.
        if mask_img.shape[2] == 4:
            binary = mask_img[:, :, 3]
        else:
            binary = cv2.cvtColor(mask_img, cv2.COLOR_BGR2GRAY)
    else:
        binary = mask_img
    _, bw = cv2.threshold(binary, 1, 255, cv2.THRESH_BINARY)
    return bw


def _extract_centroids(mask_path: Path, min_area: int = 10) -> List[Tuple[float, float, int]]:
    mask_img = cv2.imread(str(mask_path), cv2.IMREAD_UNCHANGED)
    if mask_img is None:
        raise ValueError(f"Failed to load boss mask: {mask_path}")

    bw = _normalise_binary(mask_img)
    num_labels, _labels, stats, centroids = cv2.connectedComponentsWithStats(bw, connectivity=8)

    points: List[Tuple[float, float, int]] = []
    for label in range(1, num_labels):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area < min_area:
            continue
        cx, cy = float(centroids[label][0]), float(centroids[label][1])
        points.append((cx, cy, area))

    # Stable numbering from top-to-bottom, then left-to-right.
    points.sort(key=lambda p: (p[1], p[0]))
    return points


def _parse_manual_points(points: Optional[Sequence[Dict[str, float]]]) -> Optional[List[Tuple[float, float]]]:
    if not points:
        return None

    out: List[Tuple[float, float]] = []
    for p in points:
        if not isinstance(p, dict) or "x" not in p or "y" not in p:
            raise ValueError("manualBosses entries must be objects with x and y")
        out.append((float(p["x"]), float(p["y"])))

    out.sort(key=lambda xy: (xy[1], xy[0]))
    return out


def prepare_bosses_for_geometry2d(
    project_dir: Path,
    *,
    roi_payload: Dict[str, Any],
    manual_bosses: Optional[Sequence[Dict[str, float]]] = None,
    min_area: int = 10,
) -> Dict[str, Any]:
    """Extract and persist boss centres to `2d_geometry/boss_report.json`."""
    roi_params = roi_payload.get("params")
    if not isinstance(roi_params, dict):
        raise ValueError("ROI payload missing params")

    seg_dir = project_dir / "segmentations"
    mask_path = seg_dir / "group_boss_stone.png"
    if not mask_path.exists():
        raise FileNotFoundError(f"Boss group mask not found: {mask_path}")

    manual_points = _parse_manual_points(manual_bosses)
    if manual_points is not None:
        points_xy = [(x, y, 0) for x, y in manual_points]
        detection_mode = "manual"
    else:
        points_xy = _extract_centroids(mask_path, min_area=min_area)
        detection_mode = "auto"

    bosses: List[Dict[str, Any]] = []
    boss_ids: List[int] = []
    for idx, (cx, cy, area) in enumerate(points_xy, start=1):
        u, v = image_to_unit((float(cx), float(cy)), roi_params)
        bosses.append(
            {
                "id": idx,
                "component_id": idx,
                "area": int(area),
                "centroid_xy": {"x": float(cx), "y": float(cy)},
                "centroid_uv": {"u": float(u), "v": float(v)},
                "out_of_bounds": bool(not (0.0 <= u <= 1.0 and 0.0 <= v <= 1.0)),
            }
        )
        boss_ids.append(idx)

    payload: Dict[str, Any] = {
        "source": "services.geometry2d.prepare_bosses",
        "created_at": datetime.now().isoformat(),
        "images": {
            "image_path": roi_payload.get("image_path"),
            "boss_mask_path": str(mask_path.resolve()),
        },
        "roi": roi_params,
        "boss_ids": boss_ids,
        "boss_count": len(bosses),
        "detection_mode": detection_mode,
        "sanity": {
            "count": len(bosses),
            "has_any": bool(bosses),
            "out_of_bounds_count": sum(1 for b in bosses if b["out_of_bounds"]),
        },
        "bosses": bosses,
    }

    out_dir = project_dir / "2d_geometry"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "boss_report.json"
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    return payload
