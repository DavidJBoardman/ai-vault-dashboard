"""Automatic ROI correction using the original Step03 score-search method."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from services.geometry2d.utils.roi_math import image_to_unit
from services.geometry2d.utils.template_keypoints import generate_keypoints

RoiParams = Dict[str, float]
DEFAULT_TOL = 0.01

AUTO_CORRECT_PRESETS: Dict[str, Dict[str, Any]] = {
    "fast": {
        "tolerance": 0.009,
        "xy_step": 4.0,
        "xy_range": 12.0,
        "n_range": (2, 6),
        "include_scale": True,
        "scale_step": 0.01,
        "scale_range": 0.01,
        "include_rotation": True,
        "rotation_step": 0.5,
        "rotation_range": 0.75,
        "regularisation_weight": 0.08,
        "improvement_margin": 0.003,
    },
    "balanced": {
        "tolerance": 0.008,
        "xy_step": 2.0,
        "xy_range": 16.0,
        "n_range": (2, 6),
        "include_scale": True,
        "scale_step": 0.005,
        "scale_range": 0.015,
        "include_rotation": True,
        "rotation_step": 0.25,
        "rotation_range": 1.0,
        "regularisation_weight": 0.05,
        "improvement_margin": 0.002,
    },
    "precise": {
        "tolerance": 0.007,
        "xy_step": 1.0,
        "xy_range": 20.0,
        "n_range": (2, 6),
        "include_scale": True,
        "scale_step": 0.0025,
        "scale_range": 0.02,
        "include_rotation": True,
        "rotation_step": 0.1,
        "rotation_range": 1.5,
        "regularisation_weight": 0.03,
        "improvement_margin": 0.001,
    },
}


def resolve_auto_correct_options(config: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Resolve user config into validated kwargs for `auto_correct_roi_params`."""
    cfg = config if isinstance(config, dict) else {}
    preset = str(cfg.get("preset", "balanced")).lower().strip()
    if preset not in AUTO_CORRECT_PRESETS:
        preset = "balanced"

    base = dict(AUTO_CORRECT_PRESETS[preset])
    merged = {**base}
    for key in (
        "tolerance",
        "xy_step",
        "xy_range",
        "include_scale",
        "scale_step",
        "scale_range",
        "include_rotation",
        "rotation_step",
        "rotation_range",
        "regularisation_weight",
        "improvement_margin",
    ):
        if key in cfg:
            merged[key] = cfg[key]

    raw_n_range = cfg.get("n_range", base.get("n_range", (2, 6)))
    if isinstance(raw_n_range, (list, tuple)) and len(raw_n_range) == 2:
        n0 = int(raw_n_range[0])
        n1 = int(raw_n_range[1])
        n0 = max(2, min(6, n0))
        n1 = max(n0, min(6, n1))
        merged["n_range"] = (n0, n1)
    else:
        merged["n_range"] = tuple(base["n_range"])

    merged["tolerance"] = float(max(0.001, min(0.05, float(merged["tolerance"]))))
    merged["xy_step"] = float(max(0.5, min(8.0, float(merged["xy_step"]))))
    merged["xy_range"] = float(max(4.0, min(40.0, float(merged["xy_range"]))))
    merged["include_scale"] = bool(merged["include_scale"])
    merged["scale_step"] = float(max(0.001, min(0.05, float(merged["scale_step"]))))
    merged["scale_range"] = float(max(0.0, min(0.08, float(merged["scale_range"]))))
    merged["include_rotation"] = bool(merged["include_rotation"])
    merged["rotation_step"] = float(max(0.05, min(2.0, float(merged["rotation_step"]))))
    merged["rotation_range"] = float(max(0.0, min(8.0, float(merged["rotation_range"]))))
    merged["regularisation_weight"] = float(max(0.0, min(1.0, float(merged["regularisation_weight"]))))
    merged["improvement_margin"] = float(max(0.0, min(0.1, float(merged["improvement_margin"]))))
    merged["preset"] = preset
    return merged


def _extract_boss_xy(boss_payload: Dict[str, Any]) -> np.ndarray:
    bosses = boss_payload.get("bosses", [])
    points: List[Tuple[float, float]] = []
    if not isinstance(bosses, list):
        return np.array(points, dtype=float).reshape(-1, 2)
    for boss in bosses:
        if not isinstance(boss, dict):
            continue
        xy = boss.get("centroid_xy")
        if not isinstance(xy, dict):
            continue
        x = xy.get("x")
        y = xy.get("y")
        if isinstance(x, (int, float)) and isinstance(y, (int, float)):
            points.append((float(x), float(y)))
    return np.array(points, dtype=float).reshape(-1, 2)


def _score_roi(
    roi: RoiParams,
    bosses_xy: np.ndarray,
    candidate_ratios: List[Tuple[np.ndarray, np.ndarray]],
    tolerance: float,
) -> float:
    bosses_uv = np.array([image_to_unit((float(x), float(y)), roi) for x, y in bosses_xy], dtype=float)
    best = float("-inf")
    for x_ratios, y_ratios in candidate_ratios:
        x_dists = np.min(np.abs(bosses_uv[:, 0:1] - x_ratios[None, :]), axis=1)
        y_dists = np.min(np.abs(bosses_uv[:, 1:2] - y_ratios[None, :]), axis=1)
        matched = (x_dists <= tolerance) & (y_dists <= tolerance)
        matched_bosses = int(np.count_nonzero(matched))

        n_bosses = int(bosses_uv.shape[0])
        boss_coverage = float(matched_bosses / n_bosses) if n_bosses > 0 else 0.0
        if matched_bosses > 0:
            avg_error = float((np.sum(x_dists[matched]) + np.sum(y_dists[matched])) / (2.0 * matched_bosses))
            error_norm = avg_error / max(tolerance, 1e-6)
        else:
            error_norm = float("inf")

        unmatched_penalty = 1.0 - boss_coverage
        score = boss_coverage - 0.25 * error_norm - 0.05 * unmatched_penalty
        score = float(max(-1.0, min(1.0, score)))
        best = max(best, score)
    return float(best)


def _regularisation_penalty(
    dx: float,
    dy: float,
    sw: float,
    sh: float,
    drot: float,
    *,
    xy_range: float,
    rotation_range: float,
    include_scale: bool,
    include_rotation: bool,
) -> float:
    penalty = (dx / max(xy_range, 1e-6)) ** 2 + (dy / max(xy_range, 1e-6)) ** 2
    if include_scale:
        penalty += (sw - 1.0) ** 2 + (sh - 1.0) ** 2
    if include_rotation:
        penalty += (drot / max(rotation_range, 1e-6)) ** 2
    return float(penalty)


def auto_correct_roi_params(
    original_roi: RoiParams,
    boss_payload: Dict[str, Any],
    *,
    tolerance: float = DEFAULT_TOL,
    xy_step: float = 4.0,
    xy_range: float = 20.0,
    n_range: Tuple[int, int] = (2, 5),
    include_scale: bool = True,
    scale_step: float = 0.01,
    scale_range: float = 0.02,
    include_rotation: bool = True,
    rotation_step: float = 0.5,
    rotation_range: float = 1.5,
    regularisation_weight: float = 0.0,
    improvement_margin: float = 1e-6,
) -> Optional[Dict[str, Any]]:
    """Port of legacy Step03 ROI correction based on geometric score search."""
    bosses_xy = _extract_boss_xy(boss_payload)
    if bosses_xy.shape[0] < 2:
        return None
    if xy_step <= 0 or scale_step <= 0 or rotation_step <= 0:
        return None
    if xy_range < 0 or scale_range < 0 or rotation_range < 0:
        return None
    if regularisation_weight < 0 or improvement_margin < 0:
        return None

    candidates: List[np.ndarray] = []
    for n in range(n_range[0], min(n_range[1] + 1, 6)):
        candidates.append(np.array(generate_keypoints("standard", n=n), dtype=float))
    candidates.append(np.array(generate_keypoints("inner", roi=original_roi), dtype=float))
    candidate_ratios: List[Tuple[np.ndarray, np.ndarray]] = []
    for template_uv in candidates:
        x_ratios = np.sort(np.unique(template_uv[:, 0]))
        y_ratios = np.sort(np.unique(template_uv[:, 1]))
        candidate_ratios.append((x_ratios, y_ratios))

    n_xy = max(1, int(round(2 * xy_range / xy_step)) + 1)
    dx_vals = np.linspace(-xy_range, xy_range, n_xy)
    dy_vals = np.linspace(-xy_range, xy_range, n_xy)

    if include_scale:
        n_scale = max(1, int(round(2 * scale_range / scale_step)) + 1)
        sw_vals: Sequence[float] = np.linspace(1.0 - scale_range, 1.0 + scale_range, n_scale)
        sh_vals: Sequence[float] = np.linspace(1.0 - scale_range, 1.0 + scale_range, n_scale)
    else:
        sw_vals = [1.0]
        sh_vals = [1.0]

    if include_rotation:
        n_rot = max(1, int(round(2 * rotation_range / rotation_step)) + 1)
        rot_vals: Sequence[float] = np.linspace(-rotation_range, rotation_range, n_rot)
    else:
        rot_vals = [0.0]

    base_score = _score_roi(original_roi, bosses_xy, candidate_ratios, tolerance)
    best_score = base_score
    best_obj = base_score
    best_roi = dict(original_roi)
    best_delta = {"dx": 0.0, "dy": 0.0, "sw": 1.0, "sh": 1.0, "drot_deg": 0.0}

    for dx in dx_vals:
        for dy in dy_vals:
            for sw in sw_vals:
                for sh in sh_vals:
                    for drot in rot_vals:
                        roi_test = dict(original_roi)
                        roi_test["cx"] = float(original_roi["cx"] + float(dx))
                        roi_test["cy"] = float(original_roi["cy"] + float(dy))
                        roi_test["w"] = float(original_roi["w"] * float(sw))
                        roi_test["h"] = float(original_roi["h"] * float(sh))
                        roi_test["rotation_deg"] = float(original_roi.get("rotation_deg", 0.0) + float(drot))
                        score = _score_roi(roi_test, bosses_xy, candidate_ratios, tolerance)
                        penalty = _regularisation_penalty(
                            float(dx),
                            float(dy),
                            float(sw),
                            float(sh),
                            float(drot),
                            xy_range=xy_range,
                            rotation_range=rotation_range,
                            include_scale=include_scale,
                            include_rotation=include_rotation,
                        )
                        objective = score - regularisation_weight * penalty
                        if objective > best_obj:
                            best_obj = objective
                            best_score = score
                            best_roi = roi_test
                            best_delta = {
                                "dx": float(dx),
                                "dy": float(dy),
                                "sw": float(sw),
                                "sh": float(sh),
                                "drot_deg": float(drot),
                            }

    improved = bool(best_score > (base_score + improvement_margin))
    if not improved:
        best_roi = dict(original_roi)
        best_delta = {"dx": 0.0, "dy": 0.0, "sw": 1.0, "sh": 1.0, "drot_deg": 0.0}
        best_score = base_score

    return {
        "params": best_roi,
        "meta": {
            "method": "step03_score_search",
            "preset": "custom",
            "improved": improved,
            "base_score": float(base_score),
            "best_score": float(best_score),
            "score_gain": float(best_score - base_score),
            "delta": best_delta,
            "search": {
                "xy_step": float(xy_step),
                "xy_range": float(xy_range),
                "include_scale": bool(include_scale),
                "scale_step": float(scale_step),
                "scale_range": float(scale_range),
                "include_rotation": bool(include_rotation),
                "rotation_step": float(rotation_step),
                "rotation_range": float(rotation_range),
                "regularisation_weight": float(regularisation_weight),
                "improvement_margin": float(improvement_margin),
                "tolerance": float(tolerance),
                "n_range": [int(n_range[0]), int(n_range[1])],
            },
            "boss_count": int(bosses_xy.shape[0]),
        },
    }
