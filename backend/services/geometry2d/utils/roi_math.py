from __future__ import annotations

import math
from typing import Dict, Tuple


RoiParams = Dict[str, float]


def image_to_unit(point_xy: Tuple[float, float], roi: RoiParams) -> Tuple[float, float]:
    """Map image pixel coordinates (x, y) into ROI unit-square coordinates."""
    x, y = point_xy
    cx, cy = float(roi["cx"]), float(roi["cy"])
    w, h = float(roi["w"]), float(roi["h"])
    if w == 0 or h == 0:
        raise ValueError("ROI width/height cannot be zero when converting coordinates")

    angle = math.radians(float(roi.get("rotation_deg", 0.0)))
    dx = x - cx
    dy = y - cy
    s = math.sin(angle)
    c = math.cos(angle)

    # Undo rotation and normalise into [0, 1] space.
    x_local = c * dx + s * dy
    y_local = -s * dx + c * dy
    u = (x_local / w) + 0.5
    v = (y_local / h) + 0.5
    return float(u), float(v)


def unit_to_image(point_uv: Tuple[float, float], roi: RoiParams) -> Tuple[float, float]:
    """Map ROI unit-square coordinates (u, v) into image pixel coordinates."""
    u, v = point_uv
    cx, cy = float(roi["cx"]), float(roi["cy"])
    w, h = float(roi["w"]), float(roi["h"])

    angle = math.radians(float(roi.get("rotation_deg", 0.0)))
    x_local = (float(u) - 0.5) * w
    y_local = (float(v) - 0.5) * h
    s = math.sin(angle)
    c = math.cos(angle)

    x = cx + (c * x_local) - (s * y_local)
    y = cy + (s * x_local) + (c * y_local)
    return float(x), float(y)
