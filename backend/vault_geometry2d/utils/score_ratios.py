"""
Ratio-based scoring: match boss (u,v) to template x/y ratios independently.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

import numpy as np


def extract_template_ratios(template_uv: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Extract unique x- and y-ratios from template points."""
    x_ratios = np.unique(template_uv[:, 0])
    y_ratios = np.unique(template_uv[:, 1])
    return np.sort(x_ratios), np.sort(y_ratios)


def match_boss_to_ratios(
    boss_uv: Tuple[float, float],
    x_ratios: np.ndarray,
    y_ratios: np.ndarray,
    tolerance: float,
) -> Tuple[Optional[int], Optional[int], float, float]:
    """Match one boss (u,v) to closest template ratios in x and y. Returns (x_idx, y_idx, x_dist, y_dist)."""
    u, v = float(boss_uv[0]), float(boss_uv[1])
    x_dists = np.abs(x_ratios - u)
    x_min_idx = np.argmin(x_dists)
    x_min_dist = float(x_dists[x_min_idx])
    x_match_idx = int(x_min_idx) if x_min_dist <= tolerance else None
    y_dists = np.abs(y_ratios - v)
    y_min_idx = np.argmin(y_dists)
    y_min_dist = float(y_dists[y_min_idx])
    y_match_idx = int(y_min_idx) if y_min_dist <= tolerance else None
    return x_match_idx, y_match_idx, x_min_dist, y_min_dist


def score_template_ratios(
    template_uv: np.ndarray,
    bosses_uv: np.ndarray,
    tolerance: float,
) -> Tuple[Dict[str, object], Dict[int, Dict[str, object]]]:
    """Score one template: match each boss to template ratios; return summary and per-boss matches."""
    x_ratios, y_ratios = extract_template_ratios(template_uv)
    per_boss_matches: Dict[int, Dict[str, object]] = {}
    matched_bosses = matched_ratio_combinations = 0
    total_x_error = total_y_error = 0.0
    used_combinations: Dict[Tuple[int, int], List[int]] = {}

    for boss_idx in range(bosses_uv.shape[0]):
        boss_uv = bosses_uv[boss_idx]
        x_idx, y_idx, x_dist, y_dist = match_boss_to_ratios(boss_uv, x_ratios, y_ratios, tolerance)
        is_matched = (x_idx is not None) and (y_idx is not None)
        if is_matched:
            matched_bosses += 1
            total_x_error += x_dist
            total_y_error += y_dist
            combo = (x_idx, y_idx)
            if combo not in used_combinations:
                used_combinations[combo] = []
                matched_ratio_combinations += 1
            used_combinations[combo].append(boss_idx)
        per_boss_matches[boss_idx] = {
            "x_ratio_idx": x_idx,
            "y_ratio_idx": y_idx,
            "x_ratio": float(x_ratios[x_idx]) if x_idx is not None else None,
            "y_ratio": float(y_ratios[y_idx]) if y_idx is not None else None,
            "x_dist": x_dist,
            "y_dist": y_dist,
            "matched": is_matched,
            "boss_uv": [float(boss_uv[0]), float(boss_uv[1])],
        }

    n_bosses = bosses_uv.shape[0]
    n_x, n_y = len(x_ratios), len(y_ratios)
    matched_count = matched_bosses
    boss_coverage = matched_bosses / n_bosses if n_bosses > 0 else 0.0
    ratio_coverage = matched_ratio_combinations / (n_x * n_y) if (n_x * n_y) > 0 else 0.0
    avg_x = total_x_error / matched_count if matched_count > 0 else float("inf")
    avg_y = total_y_error / matched_count if matched_count > 0 else float("inf")
    avg_error = (avg_x + avg_y) / 2.0 if matched_count > 0 else float("inf")
    error_norm = avg_error / max(tolerance, 1e-6)
    unmatched_penalty = 1.0 - boss_coverage
    score = boss_coverage - 0.25 * error_norm - 0.05 * unmatched_penalty
    score = max(-1.0, min(1.0, score))

    summary = {
        "matched_bosses": matched_bosses,
        "n_bosses": n_bosses,
        "matched_ratio_combinations": matched_ratio_combinations,
        "n_x_ratios": n_x,
        "n_y_ratios": n_y,
        "n_template_points": template_uv.shape[0],
        "boss_coverage": boss_coverage,
        "ratio_coverage": ratio_coverage,
        "avg_x_error": avg_x,
        "avg_y_error": avg_y,
        "avg_error": avg_error,
        "error_norm": error_norm,
        "unmatched_penalty": unmatched_penalty,
        "score": score,
        "is_cross_template": False,
    }
    return summary, per_boss_matches


def score_cross_template_ratios(
    x_template_uv: np.ndarray,
    y_template_uv: np.ndarray,
    bosses_uv: np.ndarray,
    tolerance: float,
    x_label: str,
    y_label: str,
) -> Tuple[Dict[str, object], Dict[int, Dict[str, object]]]:
    """Score using x-ratios from one template and y-ratios from another."""
    x_ratios, _ = extract_template_ratios(x_template_uv)
    _, y_ratios = extract_template_ratios(y_template_uv)
    per_boss_matches: Dict[int, Dict[str, object]] = {}
    matched_bosses = matched_ratio_combinations = 0
    total_x_error = total_y_error = 0.0
    used_combinations: Dict[Tuple[int, int], List[int]] = {}

    for boss_idx in range(bosses_uv.shape[0]):
        boss_uv = bosses_uv[boss_idx]
        x_idx, y_idx, x_dist, y_dist = match_boss_to_ratios(boss_uv, x_ratios, y_ratios, tolerance)
        is_matched = (x_idx is not None) and (y_idx is not None)
        if is_matched:
            matched_bosses += 1
            total_x_error += x_dist
            total_y_error += y_dist
            combo = (x_idx, y_idx)
            if combo not in used_combinations:
                used_combinations[combo] = []
                matched_ratio_combinations += 1
            used_combinations[combo].append(boss_idx)
        per_boss_matches[boss_idx] = {
            "x_ratio_idx": x_idx,
            "y_ratio_idx": y_idx,
            "x_ratio": float(x_ratios[x_idx]) if x_idx is not None else None,
            "y_ratio": float(y_ratios[y_idx]) if y_idx is not None else None,
            "x_dist": x_dist,
            "y_dist": y_dist,
            "matched": is_matched,
            "boss_uv": [float(boss_uv[0]), float(boss_uv[1])],
            "x_template": x_label,
            "y_template": y_label,
        }

    n_bosses = bosses_uv.shape[0]
    n_x, n_y = len(x_ratios), len(y_ratios)
    matched_count = matched_bosses
    boss_coverage = matched_bosses / n_bosses if n_bosses > 0 else 0.0
    ratio_coverage = matched_ratio_combinations / (n_x * n_y) if (n_x * n_y) > 0 else 0.0
    avg_x = total_x_error / matched_count if matched_count > 0 else float("inf")
    avg_y = total_y_error / matched_count if matched_count > 0 else float("inf")
    avg_error = (avg_x + avg_y) / 2.0 if matched_count > 0 else float("inf")
    error_norm = avg_error / max(tolerance, 1e-6)
    unmatched_penalty = 1.0 - boss_coverage
    score = boss_coverage - 0.25 * error_norm - 0.05 * unmatched_penalty
    score = max(-1.0, min(1.0, score))

    summary = {
        "matched_bosses": matched_bosses,
        "n_bosses": n_bosses,
        "matched_ratio_combinations": matched_ratio_combinations,
        "n_x_ratios": n_x,
        "n_y_ratios": n_y,
        "boss_coverage": boss_coverage,
        "ratio_coverage": ratio_coverage,
        "avg_x_error": avg_x,
        "avg_y_error": avg_y,
        "avg_error": avg_error,
        "error_norm": error_norm,
        "unmatched_penalty": unmatched_penalty,
        "score": score,
        "x_template": x_label,
        "y_template": y_label,
        "is_cross_template": True,
    }
    return summary, per_boss_matches
