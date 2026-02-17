"""
Grid and starcut drawing for vault geometry (ROI outline + 1/n guides).
"""
from __future__ import annotations

import math
from pathlib import Path
import sys
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

project_root = Path(__file__).resolve().parents[2]
if project_root not in sys.path:
    sys.path.append(str(project_root))

from src.vault_geometry2d.utils.cut_utils import RoiParams, unit_to_image, draw_dashed_line, rectangle_vertices, show_overlay


def _draw_1n_guides(image: np.ndarray, roi: RoiParams, n: int, colour_grid: Tuple[int, int, int], thickness_grid: int) -> np.ndarray:
    """Draw 1/n guides."""
    for i in range(1, n):
        u = i / n
        # vertical at x = u
        p_top = unit_to_image((u, 0.0), roi)
        p_bottom = unit_to_image((u, 1.0), roi)
        draw_dashed_line(image, p_top, p_bottom, colour_grid, thickness_grid)

        # horizontal at y = u
        p_left = unit_to_image((0.0, u), roi)
        p_right = unit_to_image((1.0, u), roi)
        draw_dashed_line(image, p_left, p_right, colour_grid, thickness_grid)
    return image


def draw_grid_guides(
    image: np.ndarray,
    roi: RoiParams,
    n: int,
    *,
    colour_outline: Tuple[int, int, int] = (0, 180, 0),
    colour_grid: Tuple[int, int, int] = (43, 75, 238),
    thickness_outline: int = 9,
    thickness_grid: int = 3,
    alpha: float = 1.0,
    vis_steps: bool = False,
) -> np.ndarray:
    """Draw only the ROI outline and 1/n grid guides (no star frame)."""
    if n < 2:
        raise ValueError("n must be >= 2 for grid guides")

    overlay = image.copy() if image is not None else np.zeros((int(roi["h"]), int(roi["w"]), 3), dtype=np.uint8)

    # Outline
    verts = rectangle_vertices(roi)
    cv2.polylines(overlay, [np.array(verts, dtype=np.int32)], True, colour_outline, thickness_outline)
    if vis_steps:
        show_overlay(overlay, "grid: bay rectangular outline")

    # 1/n guides only
    _draw_1n_guides(overlay, roi, n, colour_grid, thickness_grid)
    if vis_steps:
        show_overlay(overlay, f"grid: 1/n guides n = {n}")

    out = image.copy()
    cv2.addWeighted(overlay, alpha, out, 1.0 - alpha, 0, out)
    return out


def draw_standard_starcut(
    image: np.ndarray,
    roi: RoiParams,
    n: int,
    *,
    colour_outline: Tuple[int, int, int] = (0, 180, 0),
    colour_grid: Tuple[int, int, int] = (43, 75, 238),
    colour_star: Tuple[int, int, int] = (255, 255, 0),
    thickness_outline: int = 9,
    thickness_grid: int = 3,
    thickness_star: int = 6,
    alpha: float = 1.0,
    vis_steps: bool = False,
) -> np.ndarray:
    """Render a basic standard starcut overlay for divisor `n` within the ROI."""
    if n < 2:
        raise ValueError("n must be >= 2 for standard starcut")

    if image is None:
        overlay = np.zeros((int(roi["h"]), int(roi["w"]), 3), dtype=np.uint8)
    else:
        overlay = image.copy()

    verts = rectangle_vertices(roi)
    cv2.polylines(overlay, [np.array(verts, dtype=np.int32)], True, colour_outline, thickness_outline)
    if vis_steps:
        show_overlay(overlay, "stage1: bay rectangular outline")

    p00 = unit_to_image((0.0, 0.0), roi)
    p10 = unit_to_image((1.0, 0.0), roi)
    p11 = unit_to_image((1.0, 1.0), roi)
    p01 = unit_to_image((0.0, 1.0), roi)
    mt = unit_to_image((0.5, 0.0), roi)
    mr = unit_to_image((1.0, 0.5), roi)
    mb = unit_to_image((0.5, 1.0), roi)
    ml = unit_to_image((0.0, 0.5), roi)

    def draw_star(a: Tuple[int, int], b: Tuple[int, int]) -> None:
        cv2.line(overlay, a, b, (255, 255, 255), thickness_star + 2, cv2.LINE_AA)
        cv2.line(overlay, a, b, colour_star, thickness_star, cv2.LINE_AA)

    draw_star(p00, p11)
    draw_star(p10, p01)
    draw_star(ml, mr)
    draw_star(mb, mt)
    if vis_steps:
        show_overlay(overlay, "stage2: Ridge ribs")

    _draw_1n_guides(overlay, roi, n, colour_grid, thickness_grid)
    if vis_steps:
        show_overlay(overlay, f"stage4: 1/n guides n = {n}")

    out = image.copy()
    cv2.addWeighted(overlay, alpha, out, 1.0 - alpha, 0, out)
    return out
