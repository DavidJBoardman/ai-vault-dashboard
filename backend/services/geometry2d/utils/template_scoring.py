"""Template ratio scoring utilities for Geometry2D matching tasks."""

from __future__ import annotations

from typing import Dict, Optional, Tuple

import numpy as np


def extract_template_ratios(template_uv: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Extract sorted unique x/y template ratios from UV points."""
    x_ratios = np.unique(template_uv[:, 0])
    y_ratios = np.unique(template_uv[:, 1])
    return np.sort(x_ratios), np.sort(y_ratios)


def match_boss_to_ratios(
    boss_uv: Tuple[float, float],
    x_ratios: np.ndarray,
    y_ratios: np.ndarray,
    tolerance: float,
) -> Tuple[Optional[int], Optional[int], float, float]:
    """Match one boss (u,v) to closest x/y template ratios."""
    u, v = float(boss_uv[0]), float(boss_uv[1])
    x_dists = np.abs(x_ratios - u)
    x_min_idx = int(np.argmin(x_dists))
    x_min_dist = float(x_dists[x_min_idx])
    x_match_idx = x_min_idx if x_min_dist <= tolerance else None

    y_dists = np.abs(y_ratios - v)
    y_min_idx = int(np.argmin(y_dists))
    y_min_dist = float(y_dists[y_min_idx])
    y_match_idx = y_min_idx if y_min_dist <= tolerance else None
    return x_match_idx, y_match_idx, x_min_dist, y_min_dist


def score_template_ratios(
    template_uv: np.ndarray,
    bosses_uv: np.ndarray,
    tolerance: float,
) -> Dict[str, float]:
    """Compute summary score and metrics for one template-vs-boss matching."""
    x_ratios, y_ratios = extract_template_ratios(template_uv)
    matched_bosses = 0
    total_x_error = 0.0
    total_y_error = 0.0

    for i in range(bosses_uv.shape[0]):
        x_idx, y_idx, x_dist, y_dist = match_boss_to_ratios(
            (float(bosses_uv[i][0]), float(bosses_uv[i][1])),
            x_ratios,
            y_ratios,
            tolerance,
        )
        if x_idx is not None and y_idx is not None:
            matched_bosses += 1
            total_x_error += float(x_dist)
            total_y_error += float(y_dist)

    n_bosses = bosses_uv.shape[0]
    boss_coverage = matched_bosses / n_bosses if n_bosses > 0 else 0.0
    if matched_bosses > 0:
        avg_error = (total_x_error + total_y_error) / (2.0 * matched_bosses)
        error_norm = avg_error / max(tolerance, 1e-6)
    else:
        avg_error = float("inf")
        error_norm = float("inf")

    unmatched_penalty = 1.0 - boss_coverage
    score = boss_coverage - 0.25 * error_norm - 0.05 * unmatched_penalty
    score = float(max(-1.0, min(1.0, score)))

    return {
        "score": score,
        "boss_coverage": float(boss_coverage),
        "avg_error": float(avg_error),
        "error_norm": float(error_norm),
        "matched_bosses": float(matched_bosses),
        "n_bosses": float(n_bosses),
    }

