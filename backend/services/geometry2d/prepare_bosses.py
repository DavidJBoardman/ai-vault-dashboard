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


def _extract_instance_centroid(mask_path: Path, min_area: int = 10) -> Optional[Tuple[float, float, int]]:
    mask_img = cv2.imread(str(mask_path), cv2.IMREAD_UNCHANGED)
    if mask_img is None:
        raise ValueError(f"Failed to load boss mask: {mask_path}")

    bw = _normalise_binary(mask_img)
    ys, xs = np.nonzero(bw > 0)
    area = int(len(xs))
    if area < min_area:
        return None

    cx = float(xs.mean())
    cy = float(ys.mean())
    return cx, cy, area


def _extract_instance_centroids_from_index(
    seg_dir: Path,
    *,
    min_area: int = 10,
) -> List[Dict[str, Any]]:
    """Read boss-stone instance masks and preserve their segmentation labels.

    Returns dicts with cx, cy, area, label so the downstream report can carry
    the step-3 segmentation tag (e.g. "boss stone A") instead of renumbering.
    """
    index_path = seg_dir / "index.json"
    if not index_path.exists():
        return []

    with index_path.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    raw_segmentations = payload.get("segmentations")
    if not isinstance(raw_segmentations, list):
        return []

    items: List[Dict[str, Any]] = []
    for seg in raw_segmentations:
        if not isinstance(seg, dict):
            continue
        group_id = str(seg.get("groupId", "")).strip().lower()
        # Accept both the canonical "boss_stone" id and legacy per-mask ids
        # like "boss_stone_e", "boss_stone_f" that were created before
        # extract_group_id was updated to strip alphabetical suffixes.
        if group_id != "boss_stone" and not group_id.startswith("boss_stone_"):
            continue
        mask_file = seg.get("maskFile")
        if not isinstance(mask_file, str) or not mask_file:
            continue
        mask_path = seg_dir / mask_file
        if not mask_path.exists():
            continue
        centroid = _extract_instance_centroid(mask_path, min_area=min_area)
        if centroid is None:
            continue
        cx, cy, area = centroid
        items.append(
            {
                "cx": cx,
                "cy": cy,
                "area": area,
                "label": str(seg.get("label") or "").strip(),
            }
        )

    return items


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

    manual_points = _parse_manual_points(manual_bosses)
    items: List[Dict[str, Any]]
    if manual_points is not None:
        items = [{"cx": x, "cy": y, "area": 0, "label": ""} for x, y in manual_points]
        detection_mode = "manual"
    else:
        items = _extract_instance_centroids_from_index(seg_dir, min_area=min_area)
        detection_mode = "segmentation_instances"
        if not items:
            if not mask_path.exists():
                raise FileNotFoundError(f"Boss group mask not found: {mask_path}")
            items = [
                {"cx": cx, "cy": cy, "area": area, "label": ""}
                for cx, cy, area in _extract_centroids(mask_path, min_area=min_area)
            ]
            detection_mode = "auto_components"

    bosses: List[Dict[str, Any]] = []
    boss_ids: List[int] = []
    for idx, item in enumerate(items, start=1):
        cx = float(item["cx"])
        cy = float(item["cy"])
        area = int(item["area"])
        # Preserve the step-3 segmentation label (e.g. "boss stone A") so the
        # reference points in step-4 carry the same tag. Fall back to the
        # numeric id when the segmentation source did not provide a label.
        label = str(item.get("label") or "").strip() or str(idx)
        u, v = image_to_unit((cx, cy), roi_params)
        bosses.append(
            {
                "id": idx,
                "component_id": idx,
                "label": label,
                "area": area,
                "centroid_xy": {"x": cx, "y": cy},
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
