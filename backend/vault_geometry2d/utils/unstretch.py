import json
from pathlib import Path
from typing import Dict, Optional, Tuple

import cv2
import numpy as np

def load_image(path: str) -> np.ndarray:
    """Robust image loader that supports unicode paths.

    Returns a BGR `np.ndarray`.
    """
    data = np.fromfile(path, dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None or img.size == 0:
        raise ValueError(f"Failed to load image: {path}")
    return img


def _find_metadata_for_image(image_path: str) -> Optional[Path]:
    p = Path(image_path)
    if not p.exists():
        return None
    candidates = list(p.parent.glob("*_metadata_gaussian.npy"))
    return candidates[0] if candidates else None


def _find_coords_for_image(image_path: str) -> Optional[Path]:
    p = Path(image_path)
    if not p.exists():
        return None
    candidates = list(p.parent.glob("*_coordinates_gaussian.npy"))
    return candidates[0] if candidates else None


def _world_extents_from_metadata(meta: Dict[str, object]) -> Optional[Tuple[float, float]]:
    # Direct ranges if provided
    if "range_vals" in meta:
        try:
            r = np.asarray(meta["range_vals"], dtype=float)
            w = float(r[0])
            h = float(r[1])
            if w > 0 and h > 0:
                return w, h
        except Exception:
            pass
    # min/max arrays (min_vals/max_vals)
    if "min_vals" in meta and "max_vals" in meta:
        try:
            mn = np.asarray(meta["min_vals"], dtype=float)
            mx = np.asarray(meta["max_vals"], dtype=float)
            w = float(mx[0] - mn[0])
            h = float(mx[1] - mn[1])
            if w > 0 and h > 0:
                return w, h
        except Exception:
            pass
    if "bounds" in meta:
        try:
            b = np.asarray(meta["bounds"], dtype=float)
            w = float(b[1][0] - b[0][0])
            h = float(b[1][1] - b[0][1])
            if w > 0 and h > 0:
                return w, h
        except Exception:
            pass
    keys = ("min_x", "max_x", "min_y", "max_y")
    if all(k in meta for k in keys):
        w = float(meta["max_x"]) - float(meta["min_x"])  # type: ignore[arg-type]
        h = float(meta["max_y"]) - float(meta["min_y"])  # type: ignore[arg-type]
        if w > 0 and h > 0:
            return w, h
    if "min_xy" in meta and "max_xy" in meta:
        try:
            mn = np.asarray(meta["min_xy"], dtype=float)
            mx = np.asarray(meta["max_xy"], dtype=float)
            w = float(mx[0] - mn[0])
            h = float(mx[1] - mn[1])
            if w > 0 and h > 0:
                return w, h
        except Exception:
            pass
    return None


def _world_extents_from_coords(coords_path: Path) -> Optional[Tuple[float, float]]:
    try:
        arr = np.load(str(coords_path))
        a = np.asarray(arr, dtype=float)
        if a.ndim >= 2 and a.shape[1] >= 2:
            xmin = float(np.min(a[:, 0]))
            xmax = float(np.max(a[:, 0]))
            ymin = float(np.min(a[:, 1]))
            ymax = float(np.max(a[:, 1]))
            w = xmax - xmin
            h = ymax - ymin
            if w > 0 and h > 0:
                return w, h
    except Exception:
        return None
    return None


def compute_anisotropy_factors(image_path: str) -> Optional[Tuple[float, float, float]]:
    # Try metadata first
    wh: Optional[Tuple[float, float]] = None
    meta_path = _find_metadata_for_image(image_path)
    if meta_path:
        try:
            meta = np.load(str(meta_path), allow_pickle=True).item()
            wh = _world_extents_from_metadata(meta)
        except Exception:
            wh = None
    # Fallback to coordinates array if needed
    if wh is None:
        coords_path = _find_coords_for_image(image_path)
        if coords_path:
            wh = _world_extents_from_coords(coords_path)
    if not wh:
        return None
    w_world, h_world = wh
    img = load_image(str(image_path))
    H, W = img.shape[:2]
    r_world = w_world / h_world
    r_img = W / H
    anisotropy = r_world / r_img
    sx = W / w_world
    sy = H / h_world
    return sx, sy, anisotropy


def prepare_unstretched_image(image_path: str, out_dir: str, *, tol: float = 0.005) -> Tuple[str, float]:
    factors = compute_anisotropy_factors(image_path)
    if not factors:
        return image_path, 1.0
    _sx, _sy, anisotropy = factors
    if abs(anisotropy - 1.0) <= tol:
        return image_path, 1.0

    img = load_image(image_path)
    H, W = img.shape[:2]
    s_y = 1.0 / anisotropy
    new_H = max(1, int(round(H * s_y)))
    out = cv2.resize(img, (W, new_H), interpolation=cv2.INTER_CUBIC)

    out_dir_p = Path(out_dir)
    out_dir_p.mkdir(parents=True, exist_ok=True)
    out_path = out_dir_p / f"{Path(image_path).stem}_unstretched.png"
    if not out_path.exists():
        cv2.imwrite(str(out_path), out)
    return str(out_path), s_y
