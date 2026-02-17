"""
Utilities for loading boss centroids and generating analytic template keypoints.
"""

from __future__ import annotations

import json
import math
from itertools import combinations
from typing import Iterable, List, Literal, Optional, Sequence, Tuple

import numpy as np

from src.vault_geometry2d.utils.cut_utils import RoiParams, unit_to_image, image_to_unit, ray_circle_point


# --------------------------------------------------------------------------- #
# Boss utilities
# --------------------------------------------------------------------------- #
def load_boss_uv(path: str) -> np.ndarray:
    """Load boss centroids (unit UV) from a JSON report."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if "boss_uv" in data and isinstance(data["boss_uv"], Sequence):
        arr = np.array(data["boss_uv"], dtype=float)
        return arr.reshape(-1, 2)
    bosses = data.get("bosses", [])
    uv = []
    for boss in bosses:
        u = boss.get("unit_uv", {}).get("u")
        v = boss.get("unit_uv", {}).get("v")
        if u is not None and v is not None:
            uv.append((float(u), float(v)))
    return np.array(uv, dtype=float).reshape(-1, 2)


def load_boss_xy(path: str) -> np.ndarray:
    """Load boss centroids (image XY) from a JSON report."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    bosses = data.get("bosses", [])
    xy: List[Tuple[float, float]] = []
    for boss in bosses:
        image_xy = boss.get("image_xy", {})
        x = image_xy.get("x")
        y = image_xy.get("y")
        if x is not None and y is not None:
            xy.append((float(x), float(y)))
    return np.array(xy, dtype=float).reshape(-1, 2)


# --------------------------------------------------------------------------- #
# Geometry helpers
# --------------------------------------------------------------------------- #
def clip_unit(value: float, step: float = 0.01) -> float:
    # return round(value/step)*step
    return min(1.0, max(0.0, value))


def dedupe_points(points: Iterable[Tuple[float, float]], tol: float = 1e-6) -> List[Tuple[float, float]]:
    out: List[Tuple[float, float]] = []
    for p in points:
        px, py = round(float(p[0]), 6), round(float(p[1]), 6)
        if not any(math.hypot(px - qx, py - qy) <= tol for qx, qy in out):
            out.append((px, py))
    return out


def segment_intersection(
    a: Tuple[float, float],
    b: Tuple[float, float],
    c: Tuple[float, float],
    d: Tuple[float, float],
    tol: float = 1e-9,
) -> Optional[Tuple[float, float]]:
    ax, ay = a
    bx, by = b
    cx, cy = c
    dx, dy = d

    r_x, r_y = bx - ax, by - ay
    s_x, s_y = dx - cx, dy - cy
    denom = r_x * s_y - r_y * s_x
    if abs(denom) <= tol:
        return None
    u_x, u_y = cx - ax, cy - ay
    t = (u_x * s_y - u_y * s_x) / denom
    u = (u_x * r_y - u_y * r_x) / denom
    if -tol <= t <= 1.0 + tol and -tol <= u <= 1.0 + tol:
        px = ax + t * r_x
        py = ay + t * r_y
        return (clip_unit(px), clip_unit(py))
    return None


def line_circle_intersections(
    start_uv: Tuple[float, float],
    end_uv: Tuple[float, float],
    roi: RoiParams,
    radius_px: float,
    tol: float = 1e-9,
) -> List[Tuple[float, float]]:
    """Intersect a unit-space segment with a circle in image space (respects ROI rotation).

    Maps endpoints to image pixels using `unit_to_image`, computes line–circle
    intersections in image coordinates about (cx,cy), then maps back to unit
    using `image_to_unit`.
    """
    cx, cy = float(roi["cx"]), float(roi["cy"])  # circle centre
    sx, sy = unit_to_image(start_uv, roi)
    ex, ey = unit_to_image(end_uv, roi)
    dx = float(ex - sx)
    dy = float(ey - sy)
    a = dx * dx + dy * dy
    if a <= tol:
        return []
    # vector from circle centre to start point
    fx = float(sx) - cx
    fy = float(sy) - cy
    b = 2.0 * (dx * fx + dy * fy)
    c = fx * fx + fy * fy - float(radius_px) * float(radius_px)
    disc = b * b - 4.0 * a * c
    if disc < -tol:
        return []
    disc = max(0.0, disc)
    sqrt_disc = math.sqrt(disc)
    intersections: List[Tuple[float, float]] = []
    for sign in (-1.0, 1.0):
        t = (-b + sign * sqrt_disc) / (2.0 * a)
        if -tol <= t <= 1.0 + tol:
            xi = float(sx) + t * dx
            yi = float(sy) + t * dy
            u, v = image_to_unit((xi, yi), roi)
            intersections.append((clip_unit(u), clip_unit(v)))
    return dedupe_points(intersections, tol=1e-6)


def collect_segment_intersections(segments: Iterable[Tuple[Tuple[float, float], Tuple[float, float]]]) -> List[Tuple[float, float]]:
    points: List[Tuple[float, float]] = []
    for (a, b), (c, d) in combinations(segments, 2):
        pt = segment_intersection(a, b, c, d)
        if pt is not None:
            points.append(pt)
    return points


def standard_segments(n: int) -> List[Tuple[Tuple[float, float], Tuple[float, float]]]:
    if n % 2 == 0:
        return [
            ((0.0, 0.0), (1.0, 1.0)),
            ((1.0, 0.0), (0.0, 1.0)),
            ((0.5, 0.0), (0.5, 1.0)),
            ((0.0, 0.5), (1.0, 0.5)),
        ]

    return [
        ((0.0, 0.0), (1.0, 1.0)),
        ((1.0, 0.0), (0.0, 1.0)),
    ]


def circle_standard_segments(pt, pr, pb, pl) -> List[Tuple[Tuple[float, float], Tuple[float, float]]]:
    return [
        ((0.0, 0.0), (1.0, 1.0)),
        ((1.0, 0.0), (0.0, 1.0)),
        ((0.0, 0.0), (0.0, 1.0)),
        ((0.0, 0.0), (1.0, 0.0)),
        ((0.0, 1.0), (1.0, 1.0)),
        ((1.0, 1.0), (1.0, 0.0)),
        (pt, pb),
        (pl, pr),
        ((0.0, 0.0), pb),
        ((0.0, 0.0), pr),
        ((1.0, 0.0), pl),
        ((1.0, 0.0), pb),
        ((1.0, 1.0), pl),
        ((1.0, 1.0), pt),
        ((0.0, 1.0), pr),
        ((0.0, 1.0), pt),
    ]


def division_guides(n: int) -> List[Tuple[Tuple[float, float], Tuple[float, float]]]:
    """Return vertical and horizontal 1/n guide segments in unit space."""
    guides: List[Tuple[Tuple[float, float], Tuple[float, float]]] = []
    for i in range(1, n):
        u = i / n
        guides.append(((u, 0.0), (u, 1.0)))  # vertical
        guides.append(((0.0, u), (1.0, u)))  # horizontal
    return guides


def grid_intersections(n: int) -> List[Tuple[float, float]]:
    """Return all intersections of the 1/n grid (including borders)."""
    pts: List[Tuple[float, float]] = []
    n = int(max(1, n))
    for i in range(0, n + 1):
        u = i / n
        for j in range(0, n + 1):
            v = j / n
            pts.append((clip_unit(u), clip_unit(v)))
    return dedupe_points(pts, tol=1e-6)


def circle_radius_px(variant: Literal["inner", "outer"], w: float, h: float) -> float:
    if variant == "inner":
        # Matches draw_circle_starcut construction (fits larger side first)
        return 0.5 * max(w, h)
    if variant == "outer":
        return 0.5 * math.hypot(w, h)
    raise ValueError("variant must be 'inner' or 'outer'")


def circle_cardinals_unit(variant: Literal["inner", "outer"], roi: RoiParams) -> List[Tuple[float, float]]:
    """Compute circle cardinals via image-space rays (matches renderer).

    Uses ROI centre and the four rectangle midpoints in image space; casts
    rays to the circle of radius set by variant and maps back to unit coords.
    This mirrors circle_starcut's construction and respects ROI rotation.
    """
    cx, cy = float(roi["cx"]), float(roi["cy"])
    w = float(roi["w"])
    h = float(roi["h"])
    r_px = circle_radius_px(variant, w, h)
    # rectangle side midpoints in image space
    mt = unit_to_image((0.5, 0.0), roi)
    mr = unit_to_image((1.0, 0.5), roi)
    mb = unit_to_image((0.5, 1.0), roi)
    ml = unit_to_image((0.0, 0.5), roi)
    centre_xy = (int(round(cx)), int(round(cy)))
    pt_xy = ray_circle_point(centre_xy, mt, int(round(r_px)))
    pr_xy = ray_circle_point(centre_xy, mr, int(round(r_px)))
    pb_xy = ray_circle_point(centre_xy, mb, int(round(r_px)))
    pl_xy = ray_circle_point(centre_xy, ml, int(round(r_px)))
    # map back to unit
    pt = image_to_unit(pt_xy, roi)
    pr = image_to_unit(pr_xy, roi)
    pb = image_to_unit(pb_xy, roi)
    pl = image_to_unit(pl_xy, roi)

    tb = float(np.mean([abs(pt[1]-0), abs(pb[1]-1)]))
    lr = float(np.mean([abs(pl[0]-0), abs(pr[0]-1)]))
    pt = (pt[0], 0-tb)
    pr = (1+lr, pr[1])
    pb = (pb[0], 1+tb)
    pl = (0-lr, pl[1])
    return [pt, pr, pb, pl]


def circle_segments(
    variant: Literal["inner", "outer"],
    roi: RoiParams,
) -> Tuple[List[Tuple[Tuple[float, float], Tuple[float, float]]], List[Tuple[float, float]]]:
    cardinals = circle_cardinals_unit(variant, roi)
    pt, pr, pb, pl = cardinals
    segments: List[Tuple[Tuple[float, float], Tuple[float, float]]] = []
    segments.extend(circle_standard_segments(pt, pr, pb, pl))
    return segments, cardinals


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def generate_keypoints(
    variant: Literal["standard", "inner", "outer"],
    n: Optional[int] = None,
    roi: Optional[RoiParams] = None,
) -> List[Tuple[float, float]]:
    if variant == "standard":
        if n is None or n < 2:
            raise ValueError("standard starcut requires n >= 2")
        # Simplified: use only 1/n grid intersections (including borders)
        return grid_intersections(int(n))
    elif variant in ("inner", "outer"):
        points = []
        if roi is None:
            raise ValueError("circle starcut variants require ROI dimensions")
        w = float(roi["w"])
        h = float(roi["h"])
        radius_px = circle_radius_px(variant, w, h)
        segments, cardinals = circle_segments(variant, roi)
        points.extend(cardinals)
        points.extend(collect_segment_intersections(segments))
        for start, end in segments:
            points.extend(line_circle_intersections(start, end, roi, radius_px))

        points = dedupe_points(points, tol=1e-2)
        return points
    else:
        raise ValueError("variant must be 'standard', 'inner', or 'outer'")
