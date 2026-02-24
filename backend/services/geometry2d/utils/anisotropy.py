from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import cv2
import numpy as np


def _find_projection_prefix(image_path: Path) -> str:
    name = image_path.stem
    suffix = "_colour"
    return name[: -len(suffix)] if name.endswith(suffix) else name


def _find_metadata_for_image(image_path: str) -> Optional[Path]:
    p = Path(image_path)
    if not p.exists():
        return None
    prefix = _find_projection_prefix(p)
    json_candidate = p.parent / f"{prefix}_metadata.json"
    if json_candidate.exists():
        return json_candidate
    npy_candidate = p.parent / f"{prefix}_metadata_gaussian.npy"
    if npy_candidate.exists():
        return npy_candidate
    return None


def _find_coords_for_image(image_path: str) -> Optional[Path]:
    p = Path(image_path)
    if not p.exists():
        return None
    prefix = _find_projection_prefix(p)
    candidate = p.parent / f"{prefix}_coordinates.npy"
    if candidate.exists():
        return candidate
    candidate_gaussian = p.parent / f"{prefix}_coordinates_gaussian.npy"
    if candidate_gaussian.exists():
        return candidate_gaussian
    return None


def _world_extents_from_metadata(meta: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    if "range_vals" in meta:
        try:
            r = np.asarray(meta["range_vals"], dtype=float)
            w = float(r[0])
            h = float(r[1])
            if w > 0 and h > 0:
                return w, h
        except Exception:
            pass

    bounds = meta.get("bounds")
    if isinstance(bounds, dict):
        try:
            w = float(bounds["max_x"]) - float(bounds["min_x"])
            h = float(bounds["max_y"]) - float(bounds["min_y"])
            if w > 0 and h > 0:
                return w, h
        except Exception:
            pass

    keys = ("min_x", "max_x", "min_y", "max_y")
    if all(k in meta for k in keys):
        w = float(meta["max_x"]) - float(meta["min_x"])
        h = float(meta["max_y"]) - float(meta["min_y"])
        if w > 0 and h > 0:
            return w, h

    return None


def _world_extents_from_coords(coords_path: Path) -> Optional[Tuple[float, float]]:
    try:
        arr = np.load(str(coords_path))
        a = np.asarray(arr, dtype=float)
        if a.ndim >= 3 and a.shape[2] >= 2:
            xs = a[:, :, 0]
            ys = a[:, :, 1]
        elif a.ndim >= 2 and a.shape[1] >= 2:
            xs = a[:, 0]
            ys = a[:, 1]
        else:
            return None
        w = float(np.max(xs) - np.min(xs))
        h = float(np.max(ys) - np.min(ys))
        if w > 0 and h > 0:
            return w, h
    except Exception:
        return None
    return None


def _load_metadata(metadata_path: Path) -> Optional[Dict[str, Any]]:
    try:
        if metadata_path.suffix == ".json":
            with metadata_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, dict) else None
        if metadata_path.suffix == ".npy":
            data = np.load(str(metadata_path), allow_pickle=True).item()
            return data if isinstance(data, dict) else None
    except Exception:
        return None
    return None


def compute_anisotropy_factors(image_path: str) -> Optional[Tuple[float, float, float]]:
    """Compute image/world scaling factors as (sx, sy, anisotropy)."""
    wh: Optional[Tuple[float, float]] = None

    meta_path = _find_metadata_for_image(image_path)
    if meta_path:
        meta = _load_metadata(meta_path)
        if meta:
            wh = _world_extents_from_metadata(meta)

    if wh is None:
        coords_path = _find_coords_for_image(image_path)
        if coords_path:
            wh = _world_extents_from_coords(coords_path)

    if not wh:
        return None

    img = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if img is None:
        return None
    h_px, w_px = img.shape[:2]
    if h_px <= 0 or w_px <= 0:
        return None

    w_world, h_world = wh
    r_world = w_world / h_world
    r_img = float(w_px) / float(h_px)
    anisotropy = r_world / r_img
    sx = float(w_px) / w_world
    sy = float(h_px) / h_world
    return sx, sy, anisotropy

