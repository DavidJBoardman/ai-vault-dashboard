"""
Inner/outer circle starcut drawing for vault geometry.
"""
from __future__ import annotations

import math
from pathlib import Path
import sys
from typing import Tuple

import cv2
import numpy as np

project_root = Path(__file__).resolve().parents[2]
if project_root not in sys.path:
    sys.path.append(str(project_root))

from src.vault_geometry2d.utils.cut_utils import RoiParams, unit_to_image, draw_dashed_line, rectangle_vertices, ray_circle_point, show_overlay


def _draw_circle(
    image: np.ndarray,
    centre: Tuple[int, int],
    radius: int,
    colour: Tuple[int, int, int] = (220, 220, 220),
    thickness: int = 5,
    outline_colour: Tuple[int, int, int] = (0, 0, 0),
    outline_extra: int = 2,
) -> None:
    """Draw a high-contrast circle (with optional outline) in-place."""
    if radius <= 0:
        return
    cv2.circle(image, centre, radius, outline_colour, thickness + outline_extra, cv2.LINE_AA)
    cv2.circle(image, centre, radius, colour, thickness, cv2.LINE_AA)


def _circle_params_from_roi(roi: RoiParams, variant: str) -> Tuple[Tuple[int, int], int]:
    """Return (centre_xy, radius_px) for inner/outer circle based on ROI."""
    cx, cy = int(round(roi["cx"])), int(round(roi["cy"]))
    w, h = float(roi["w"]), float(roi["h"])
    if variant == "inner":
        r = int(round(max(w, h) * 0.5))
    elif variant == "outer":
        r = int(round(0.5 * math.hypot(w, h)))
    else:
        raise ValueError("variant must be 'inner' or 'outer'")
    return (cx, cy), r


def pad_to_fit_circle(img, centre, radius, colour=(0, 0, 0), extra=8):
    h, w = img.shape[:2]
    cx, cy = centre

    left = max(0, int(math.ceil(radius - cx))) + extra
    top = max(0, int(math.ceil(radius - cy))) + extra
    right = max(0, int(math.ceil(cx + radius - w))) + extra
    bottom = max(0, int(math.ceil(cy + radius - h))) + extra

    if left or top or right or bottom:
        padded = cv2.copyMakeBorder(img, top, bottom, left, right, cv2.BORDER_CONSTANT, value=colour)
        return padded, (cx + left, cy + top)
    return img, (cx, cy)


def draw_circle_starcut(
    image: np.ndarray,
    roi: RoiParams,
    *,
    variant: str = "inner",
    colour_outline: Tuple[int, int, int] = (0, 180, 0),
    colour_star: Tuple[int, int, int] = (255, 255, 0),
    colour_circle: Tuple[int, int, int] = (43, 75, 238),
    thickness_outline: int = 9,
    thickness_star: int = 6,
    thickness_circle: int = 3,
    alpha: float = 1.0,
    vis_steps: bool = False,
) -> np.ndarray:
    """Render an inner/outer circle starcut overlay within the ROI."""

    centre, radius = _circle_params_from_roi(roi, variant)
    padded, shift_centre = pad_to_fit_circle(image, centre, radius)
    dx, dy = shift_centre[0] - centre[0], shift_centre[1] - centre[1]
    roi_shifted = dict(roi)
    roi_shifted["cx"] = roi_shifted["cx"] + dx
    roi_shifted["cy"] = roi_shifted["cy"] + dy

    overlay = padded.copy()

    verts = rectangle_vertices(roi_shifted)
    cv2.polylines(overlay, [np.array(verts, dtype=np.int32)], True, colour_outline, thickness_outline)
    if vis_steps:
        show_overlay(overlay, "stage1: bay rectangular outline")

    p00 = unit_to_image((0.0, 0.0), roi_shifted)
    p10 = unit_to_image((1.0, 0.0), roi_shifted)
    p11 = unit_to_image((1.0, 1.0), roi_shifted)
    p01 = unit_to_image((0.0, 1.0), roi_shifted)
    mt = unit_to_image((0.5, 0.0), roi_shifted)
    mr = unit_to_image((1.0, 0.5), roi_shifted)
    mb = unit_to_image((0.5, 1.0), roi_shifted)
    ml = unit_to_image((0.0, 0.5), roi_shifted)
    pt = ray_circle_point(shift_centre, mt, radius)
    pr = ray_circle_point(shift_centre, mr, radius)
    pb = ray_circle_point(shift_centre, mb, radius)
    pl = ray_circle_point(shift_centre, ml, radius)

    def draw_star(a: Tuple[int, int], b: Tuple[int, int]) -> None:
        cv2.line(overlay, a, b, (255, 255, 255), thickness_star + 2, cv2.LINE_AA)
        cv2.line(overlay, a, b, colour_star, thickness_star, cv2.LINE_AA)

    draw_star(p00, p11)
    draw_star(p10, p01)
    draw_star(ml, mr)
    draw_star(mb, mt)
    if vis_steps:
        show_overlay(overlay, "stage2: Ridge ribs")

    _draw_circle(overlay, shift_centre, radius, colour_circle, thickness_circle)
    if vis_steps:
        show_overlay(overlay, "stage3: Circle (inner or outer)")

    draw_star(pl, pr)
    draw_star(pt, pb)
    draw_star(p10, pl)
    draw_star(p10, pb)
    draw_star(p11, pt)
    draw_star(p11, pl)
    draw_star(p01, pt)
    draw_star(p01, pr)
    draw_star(p00, pr)
    draw_star(p00, pb)

    if vis_steps:
        show_overlay(overlay, "stage4: tiercern chevrons")

    h, w = image.shape[:2]
    overlay = overlay[dy : dy + h, dx : dx + w]
    if vis_steps:
        show_overlay(overlay, "stage5: shift back to original ROI")

    out = image.copy()
    cv2.addWeighted(overlay, alpha, out, 1.0 - alpha, 0, out)
    return out


def draw_inner_circle_starcut(
    image: np.ndarray,
    roi: RoiParams,
    **kwargs,
) -> np.ndarray:
    """Convenience wrapper for the inner-circle starcut."""
    return draw_circle_starcut(image, roi, variant="inner", **kwargs)


def draw_outer_circle_starcut(
    image: np.ndarray,
    roi: RoiParams,
    **kwargs,
) -> np.ndarray:
    """Convenience wrapper for the outer-circle starcut."""
    return draw_circle_starcut(image, roi, variant="outer", **kwargs)
