"""
Boss report I/O: rescale mask to unstretched geometry, sanity check, save_report.
Used by step02_prepare_boss; keeps vault_geometry2d self-contained.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Optional, Sequence

import cv2
import numpy as np

from src.vault_geometry2d.utils.boss_utils import BossDetection, min_pairwise_distance, list_too_close
from src.vault_geometry2d.utils.cut_utils import RoiParams
from src.vault_geometry2d.utils.unstretch import compute_anisotropy_factors


def rescale_binary_mask(
    binary: np.ndarray,
    base_image_path: Optional[str],
) -> tuple[np.ndarray, bool, Optional[float]]:
    """Rescale a stretched mask back to the unstretched geometry.

    Returns (rescaled_mask, did_rescale, anisotropy). Uses nearest-neighbour.
    """
    did = False
    aniso: Optional[float] = None
    if base_image_path:
        factors = compute_anisotropy_factors(str(base_image_path))
        if factors is not None:
            _sx, _sy, anisotropy = factors
            aniso = float(anisotropy)
            if abs(anisotropy - 1.0) > 1e-6:
                h, w = binary.shape[:2]
                new_h = max(1, int(round(h / float(anisotropy))))
                binary = cv2.resize(binary, (w, new_h), interpolation=cv2.INTER_NEAREST)
                did = True
    return binary, did, aniso


def sanity_check(
    detections: Sequence[BossDetection],
    min_count: int,
    max_count: int,
    duplicate_tol: float,
) -> Dict[str, object]:
    points_uv = [det.centroid_uv for det in detections]
    count = len(points_uv)
    min_dist = min_pairwise_distance(points_uv)
    close_pairs = list_too_close(points_uv, duplicate_tol)
    out_of_bounds = [det.component_id for det in detections if det.out_of_bounds]
    return {
        "count": count,
        "count_ok": min_count <= count <= max_count,
        "min_pairwise_dist": min_dist,
        "duplicates_below_tol": close_pairs,
        "out_of_bounds_ids": out_of_bounds,
    }


def save_report(
    detections: Sequence[BossDetection],
    roi: RoiParams,
    sanity: Dict[str, object],
    output_path: Path,
    recommended_tol_unit: float,
    *,
    mask_path: Optional[str] = None,
    mask_rescaled: Optional[bool] = None,
    base_image_path: Optional[str] = None,
    image_path_unstretched: Optional[str] = None,
    anisotropy: Optional[float] = None,
) -> None:
    boss_uv = [(det.centroid_uv[0], det.centroid_uv[1]) for det in detections]
    boss_ids = [det.component_id for det in detections]
    data = {
        "roi": roi,
        "boss_uv": boss_uv,
        "boss_ids": boss_ids,
        "bosses": [
            {
                "id": det.component_id,
                "area": det.area,
                "bbox": det.bbox,
                "image_xy": {"x": det.centroid_xy[0], "y": det.centroid_xy[1]},
                "unit_uv": {"u": det.centroid_uv[0], "v": det.centroid_uv[1]},
                "out_of_bounds": det.out_of_bounds,
            }
            for det in detections
        ],
        "sanity": sanity,
        "recommended_tol_unit": recommended_tol_unit,
    }
    data["mask_info"] = {
        "path": mask_path,
        "rescaled_to_unstretched": bool(mask_rescaled) if mask_rescaled is not None else None,
        "anisotropy": anisotropy,
    }
    data["images"] = {
        "base_image_path": base_image_path,
        "image_path_unstretched": image_path_unstretched,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote boss report to {output_path}")
