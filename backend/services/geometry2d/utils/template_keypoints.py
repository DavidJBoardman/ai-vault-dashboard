"""Template keypoint generation utilities shared across Geometry2D stages."""

from __future__ import annotations

import math
from itertools import combinations
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np

from services.geometry2d.utils.roi_math import image_to_unit, unit_to_image

RoiParams = Dict[str, float]


def _clip_unit(value: float) -> float:
    return min(1.0, max(0.0, float(value)))


def _dedupe_points(points: Iterable[Tuple[float, float]], tol: float = 1e-6) -> List[Tuple[float, float]]:
    out: List[Tuple[float, float]] = []
    for p in points:
        px, py = round(float(p[0]), 6), round(float(p[1]), 6)
        if not any(math.hypot(px - qx, py - qy) <= tol for qx, qy in out):
            out.append((px, py))
    return out


def _segment_intersection(
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
        return (_clip_unit(px), _clip_unit(py))
    return None


def _collect_segment_intersections(
    segments: Iterable[Tuple[Tuple[float, float], Tuple[float, float]]]
) -> List[Tuple[float, float]]:
    points: List[Tuple[float, float]] = []
    for (a, b), (c, d) in combinations(segments, 2):
        pt = _segment_intersection(a, b, c, d)
        if pt is not None:
            points.append(pt)
    return points


def _circle_radius_px(variant: str, w: float, h: float) -> float:
    if variant == "inner":
        return 0.5 * max(w, h)
    if variant == "outer":
        return 0.5 * math.hypot(w, h)
    raise ValueError("variant must be 'inner' or 'outer'")


def _ray_circle_point(centre: Tuple[float, float], target: Tuple[float, float], radius: float) -> Tuple[float, float]:
    c = np.array(centre, dtype=float)
    v = np.array(target, dtype=float) - c
    n = float(np.linalg.norm(v))
    if n == 0:
        return float(c[0]), float(c[1])
    p = c + radius * (v / n)
    return float(p[0]), float(p[1])


def _line_circle_intersections(
    start_uv: Tuple[float, float],
    end_uv: Tuple[float, float],
    roi: RoiParams,
    radius_px: float,
    tol: float = 1e-9,
) -> List[Tuple[float, float]]:
    cx, cy = float(roi["cx"]), float(roi["cy"])
    sx, sy = unit_to_image(start_uv, roi)
    ex, ey = unit_to_image(end_uv, roi)
    dx = float(ex - sx)
    dy = float(ey - sy)
    a = dx * dx + dy * dy
    if a <= tol:
        return []
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
            intersections.append((_clip_unit(u), _clip_unit(v)))
    return _dedupe_points(intersections, tol=1e-6)


def _grid_intersections(n: int) -> List[Tuple[float, float]]:
    pts: List[Tuple[float, float]] = []
    n = int(max(1, n))
    for i in range(0, n + 1):
        u = i / n
        for j in range(0, n + 1):
            v = j / n
            pts.append((_clip_unit(u), _clip_unit(v)))
    return _dedupe_points(pts, tol=1e-6)


def _circle_cardinals_unit(variant: str, roi: RoiParams) -> List[Tuple[float, float]]:
    cx, cy = float(roi["cx"]), float(roi["cy"])
    w = float(roi["w"])
    h = float(roi["h"])
    r_px = _circle_radius_px(variant, w, h)
    mt = unit_to_image((0.5, 0.0), roi)
    mr = unit_to_image((1.0, 0.5), roi)
    mb = unit_to_image((0.5, 1.0), roi)
    ml = unit_to_image((0.0, 0.5), roi)
    pt = image_to_unit(_ray_circle_point((cx, cy), mt, r_px), roi)
    pr = image_to_unit(_ray_circle_point((cx, cy), mr, r_px), roi)
    pb = image_to_unit(_ray_circle_point((cx, cy), mb, r_px), roi)
    pl = image_to_unit(_ray_circle_point((cx, cy), ml, r_px), roi)

    tb = float(np.mean([abs(pt[1] - 0), abs(pb[1] - 1)]))
    lr = float(np.mean([abs(pl[0] - 0), abs(pr[0] - 1)]))
    return [(pt[0], 0 - tb), (1 + lr, pr[1]), (pb[0], 1 + tb), (0 - lr, pl[1])]


def _circle_segments(
    variant: str,
    roi: RoiParams,
) -> Tuple[List[Tuple[Tuple[float, float], Tuple[float, float]]], List[Tuple[float, float]]]:
    pt, pr, pb, pl = _circle_cardinals_unit(variant, roi)
    segments = [
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
    return segments, [pt, pr, pb, pl]


def generate_keypoints(
    variant: str,
    *,
    n: Optional[int] = None,
    roi: Optional[RoiParams] = None,
) -> List[Tuple[float, float]]:
    """
    Generate template keypoints in ROI unit space.

    Supported variants:
    - `standard`: n-by-n grid intersections
    - `inner`: circle-starcut template
    - `outer`: circle-starcut (outer) template
    """
    if variant == "standard":
        if n is None or n < 2:
            raise ValueError("standard variant requires n >= 2")
        return _grid_intersections(int(n))

    if variant in ("inner", "outer"):
        if roi is None:
            raise ValueError("circle variants require roi params")
        w = float(roi["w"])
        h = float(roi["h"])
        radius_px = _circle_radius_px(variant, w, h)
        segments, cardinals = _circle_segments(variant, roi)
        points: List[Tuple[float, float]] = []
        points.extend(cardinals)
        points.extend(_collect_segment_intersections(segments))
        for start, end in segments:
            points.extend(_line_circle_intersections(start, end, roi, radius_px))
        return _dedupe_points(points, tol=1e-2)

    raise ValueError("variant must be 'standard', 'inner', or 'outer'")

