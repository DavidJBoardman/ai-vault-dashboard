"""
Step 03 — Optional geometric ROI re-fit.

This step searches small geometric adjustments to the ROI parameters
(`cx`, `cy`, `w`, `h`, `rotation_deg`) and keeps the variant that gives
the best proxy template score.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from src.vault_geometry2d.utils.cut_utils import image_to_unit, rectangle_vertices, draw_dashed_line
from src.vault_geometry2d.utils.register_utils import generate_keypoints, load_boss_xy
from src.vault_geometry2d.utils.score_ratios import score_template_ratios

DEFAULT_TOL = 0.01


def draw_refit_visualisation(
    project_dir: Path,
    roi_original: Dict[str, float],
    roi_refit: Dict[str, float],
    result: Dict[str, object],
    out_path: Optional[Path] = None,
    show_image: bool = True,
) -> None:
    """Draw original and refitted ROI on the unstretched image."""
    boss_report_path = project_dir / "boss_report.json"
    if not boss_report_path.exists():
        return
    with boss_report_path.open("r", encoding="utf-8") as f:
        boss_report = json.load(f)
    image_path = None
    images = boss_report.get("images", {})
    if isinstance(images, dict):
        image_path = images.get("image_path_unstretched")
    if not image_path:
        image_path = boss_report.get("image_path_unstretched")
    if not image_path:
        print("[Step03] No unstretched image path in boss_report; skip visualisation.")
        return

    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        print("[Step03] Failed to load unstretched image; skip visualisation.")
        return
    overlay = image.copy()

    orig_vertices = rectangle_vertices(roi_original)
    for i in range(4):
        p0 = orig_vertices[i]
        p1 = orig_vertices[(i + 1) % 4]
        draw_dashed_line(overlay, p0, p1, (0, 0, 255), thickness=2, dash_length=10, gap_length=5)

    refit_vertices = rectangle_vertices(roi_refit)
    pts = np.array(refit_vertices, dtype=np.int32)
    cv2.polylines(overlay, [pts], True, (0, 255, 0), 3, cv2.LINE_AA)

    legend_h = 150
    cv2.rectangle(overlay, (10, 10), (760, legend_h), (40, 40, 40), -1)
    cv2.rectangle(overlay, (10, 10), (760, legend_h), (180, 180, 180), 2)
    font = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(overlay, "Step03 ROI Re-fit Visualisation", (24, 35), font, 0.8, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(overlay, f"Score: {result['base_score']:.5f} -> {result['best_score']:.5f}", (24, 63), font, 0.65, (255, 255, 0), 2, cv2.LINE_AA)
    cv2.putText(overlay, f"Improved: {result['improved']}  Gain: {result['score_gain']:+.5f}", (24, 88), font, 0.6, (0, 255, 255), 1, cv2.LINE_AA)
    delta = result.get("delta", {})
    cv2.putText(
        overlay,
        (
            f"Delta: dx={delta.get('dx', 0.0):+.2f}px dy={delta.get('dy', 0.0):+.2f}px "
            f"sw={delta.get('sw', 1.0):.4f} sh={delta.get('sh', 1.0):.4f} drot={delta.get('drot_deg', 0.0):+.3f} deg"
        ),
        (24, 113),
        font,
        0.55,
        (200, 255, 200),
        1,
        cv2.LINE_AA,
    )
    cv2.line(overlay, (24, 134), (64, 134), (0, 0, 255), 2, cv2.LINE_AA)
    cv2.putText(overlay, "Original ROI (red dashed)", (74, 139), font, 0.55, (0, 0, 255), 1, cv2.LINE_AA)
    cv2.line(overlay, (330, 134), (370, 134), (0, 255, 0), 3, cv2.LINE_AA)
    cv2.putText(overlay, "Refitted ROI (green solid)", (380, 139), font, 0.55, (0, 255, 0), 1, cv2.LINE_AA)

    if out_path is None:
        out_path = project_dir / "analysis" / "roi_refit_overlay.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_path), overlay)
    print(f"[Step03] Wrote ROI re-fit visualisation to {out_path}")

    if show_image:
        cv2.imshow("Step03 ROI Re-fit Visualisation", overlay)
        print("[Step03] Press any key to close the visualisation window...")
        cv2.waitKey(0)
        cv2.destroyAllWindows()


def _score_roi(
    roi: Dict[str, float],
    bosses_xy: np.ndarray,
    candidates: List[np.ndarray],
    tolerance: float,
) -> float:
    bosses_uv = np.array([image_to_unit((float(x), float(y)), roi) for x, y in bosses_xy], dtype=float)
    best = float("-inf")
    for template_uv in candidates:
        summary, _ = score_template_ratios(template_uv, bosses_uv, tolerance)
        best = max(best, float(summary["score"]))
    return best


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
    return penalty


def _passthrough_original_roi_result(
    project_dir: Path,
    *,
    tolerance: float,
    n_range: Tuple[int, int],
    include_scale: bool,
    scale_step: float,
    scale_range: float,
    include_rotation: bool,
    rotation_step: float,
    rotation_range: float,
    regularisation_weight: float,
    improvement_margin: float,
    xy_step: float,
    xy_range: float,
) -> Optional[Dict[str, object]]:
    boss_report_path = project_dir / "boss_report.json"
    if not boss_report_path.exists():
        print("[Step03] No boss_report.json; skip ROI re-fit.")
        return None

    with boss_report_path.open("r", encoding="utf-8") as f:
        boss_report = json.load(f)
    roi_base = boss_report.get("roi")
    if not roi_base:
        print("[Step03] No roi in boss_report; skip.")
        return None

    bosses_xy = load_boss_xy(str(boss_report_path))
    if bosses_xy.shape[0] < 2:
        print("[Step03] Too few bosses; skip re-fit.")
        return None

    candidates: List[np.ndarray] = []
    for n in range(n_range[0], min(n_range[1] + 1, 6)):
        kp = generate_keypoints("standard", n)
        candidates.append(np.array(kp, dtype=float))
    candidates.append(np.array(generate_keypoints("inner", roi=roi_base), dtype=float))

    base_score = _score_roi(roi_base, bosses_xy, candidates, tolerance)

    return {
        "roi": dict(roi_base),
        "improved": False,
        "base_score": float(base_score),
        "best_score": float(base_score),
        "score_gain": 0.0,
        "delta": {"dx": 0.0, "dy": 0.0, "sw": 1.0, "sh": 1.0, "drot_deg": 0.0},
        "search": {
            "skipped": True,
            "reason": "use original roi (correction disabled)",
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
    }


def fit_roi_refit(
    project_dir: str | Path,
    *,
    tolerance: float = DEFAULT_TOL,
    xy_step: float = 4.0,
    xy_range: float = 16.0,
    n_range: Tuple[int, int] = (2, 5),
    include_scale: bool = True,
    scale_step: float = 0.01,
    scale_range: float = 0.03,
    include_rotation: bool = True,
    rotation_step: float = 0.5,
    rotation_range: float = 2.0,
    regularisation_weight: float = 0.0,
    improvement_margin: float = 1e-6,
) -> Optional[Dict[str, object]]:
    project_dir = Path(project_dir)
    boss_report_path = project_dir / "boss_report.json"
    if not boss_report_path.exists():
        print("[Step03] No boss_report.json; skip ROI re-fit.")
        return None

    with boss_report_path.open("r", encoding="utf-8") as f:
        boss_report = json.load(f)
    roi_base = boss_report.get("roi")
    if not roi_base:
        print("[Step03] No roi in boss_report; skip.")
        return None

    bosses_xy = load_boss_xy(str(boss_report_path))
    if bosses_xy.shape[0] < 2:
        print("[Step03] Too few bosses; skip re-fit.")
        return None

    if xy_step <= 0 or scale_step <= 0 or rotation_step <= 0:
        raise ValueError("Step sizes must be > 0.")
    if xy_range < 0 or scale_range < 0 or rotation_range < 0:
        raise ValueError("Ranges must be >= 0.")
    if regularisation_weight < 0:
        raise ValueError("regularisation_weight must be >= 0.")
    if improvement_margin < 0:
        raise ValueError("improvement_margin must be >= 0.")

    candidates: List[np.ndarray] = []
    for n in range(n_range[0], min(n_range[1] + 1, 6)):
        kp = generate_keypoints("standard", n)
        candidates.append(np.array(kp, dtype=float))
    candidates.append(np.array(generate_keypoints("inner", roi=roi_base), dtype=float))

    n_xy = max(1, int(round(2 * xy_range / xy_step)) + 1)
    dx_vals = np.linspace(-xy_range, xy_range, n_xy)
    dy_vals = np.linspace(-xy_range, xy_range, n_xy)

    if include_scale:
        n_scale = max(1, int(round(2 * scale_range / scale_step)) + 1)
        sw_vals = np.linspace(1.0 - scale_range, 1.0 + scale_range, n_scale)
        sh_vals = np.linspace(1.0 - scale_range, 1.0 + scale_range, n_scale)
    else:
        sw_vals = [1.0]
        sh_vals = [1.0]

    if include_rotation:
        n_rot = max(1, int(round(2 * rotation_range / rotation_step)) + 1)
        rot_vals = np.linspace(-rotation_range, rotation_range, n_rot)
    else:
        rot_vals = [0.0]

    base_score = _score_roi(roi_base, bosses_xy, candidates, tolerance)
    best_score = base_score
    best_obj = base_score
    best_roi = dict(roi_base)
    best_delta = {"dx": 0.0, "dy": 0.0, "sw": 1.0, "sh": 1.0, "drot_deg": 0.0}

    total_tests = len(dx_vals) * len(dy_vals) * len(sw_vals) * len(sh_vals) * len(rot_vals)
    print(f"[Step03] Testing {total_tests} geometric ROI combinations...")

    tested = 0
    for dx in dx_vals:
        for dy in dy_vals:
            for sw in sw_vals:
                for sh in sh_vals:
                    for drot in rot_vals:
                        roi_test = dict(roi_base)
                        roi_test["cx"] = float(roi_base["cx"] + dx)
                        roi_test["cy"] = float(roi_base["cy"] + dy)
                        roi_test["w"] = float(roi_base["w"] * sw)
                        roi_test["h"] = float(roi_base["h"] * sh)
                        roi_test["rotation_deg"] = float(roi_base.get("rotation_deg", 0.0) + drot)
                        score = _score_roi(roi_test, bosses_xy, candidates, tolerance)
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
                        tested += 1
                        if tested % 500 == 0:
                            print(f"[Step03] Progress: {tested}/{total_tests} tests...")

    improved = best_score > (base_score + improvement_margin)
    if not improved:
        best_roi = dict(roi_base)
        best_delta = {"dx": 0.0, "dy": 0.0, "sw": 1.0, "sh": 1.0, "drot_deg": 0.0}
        best_score = base_score

    return {
        "roi": best_roi,
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
    }


def run_step03(
    project_dir: str | Path,
    out_dir: Optional[Path] = None,
    *,
    ignore_correction: bool = False,
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
    visualise: bool = True,
    show_image: bool = True,
) -> Optional[Dict[str, object]]:
    project_dir = Path(project_dir)
    out_dir = out_dir or (project_dir / "analysis")
    out_dir.mkdir(parents=True, exist_ok=True)

    if ignore_correction:
        print("[Step03] Correction disabled; using original ROI.")
        result = _passthrough_original_roi_result(
            project_dir,
            tolerance=tolerance,
            n_range=n_range,
            include_scale=include_scale,
            scale_step=scale_step,
            scale_range=scale_range,
            include_rotation=include_rotation,
            rotation_step=rotation_step,
            rotation_range=rotation_range,
            regularisation_weight=regularisation_weight,
            improvement_margin=improvement_margin,
            xy_step=xy_step,
            xy_range=xy_range,
        )
    else:
        result = fit_roi_refit(
            project_dir,
            tolerance=tolerance,
            xy_step=xy_step,
            xy_range=xy_range,
            n_range=n_range,
            include_scale=include_scale,
            scale_step=scale_step,
            scale_range=scale_range,
            include_rotation=include_rotation,
            rotation_step=rotation_step,
            rotation_range=rotation_range,
            regularisation_weight=regularisation_weight,
            improvement_margin=improvement_margin,
        )
    if result is None:
        return None

    out_path = out_dir / "roi_refit.json"
    payload = {
        "source": "vault_geometry2d.step03_roi_correction",
        **result,
    }
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    delta = result["delta"]
    print(f"[Step03] Wrote {out_path}")
    print(
        "[Step03] "
        f"improved={result['improved']} "
        f"score={result['base_score']:.5f}->{result['best_score']:.5f} "
        f"dx={delta['dx']:+.2f}px dy={delta['dy']:+.2f}px "
        f"sw={delta['sw']:.4f} sh={delta['sh']:.4f} drot={delta['drot_deg']:+.3f}°"
    )

    if visualise:
        try:
            with (project_dir / "boss_report.json").open("r", encoding="utf-8") as f:
                boss_report = json.load(f)
            roi_original = boss_report.get("roi")
            if isinstance(roi_original, dict):
                draw_refit_visualisation(
                    project_dir,
                    roi_original=roi_original,
                    roi_refit=result["roi"],
                    result=result,
                    out_path=out_dir / "roi_refit_overlay.png",
                    show_image=show_image,
                )
        except Exception as exc:
            print(f"[Step03] Warning: failed to generate visualisation: {exc}")
    return payload


def _parse_argv(argv: list[str]) -> tuple[str | Path, dict]:
    project_dir = argv[0] if argv else "."
    opts: dict = {}
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--tol" and i + 1 < len(argv):
            opts["tolerance"] = float(argv[i + 1]); i += 2
        elif a in ("--ignore-correction", "--skip-correction", "--use-original-roi"):
            opts["ignore_correction"] = True; i += 1
        elif a == "--xy-step" and i + 1 < len(argv):
            opts["xy_step"] = float(argv[i + 1]); i += 2
        elif a == "--xy-range" and i + 1 < len(argv):
            opts["xy_range"] = float(argv[i + 1]); i += 2
        elif a == "--include-scale":
            opts["include_scale"] = True; i += 1
        elif a == "--scale-step" and i + 1 < len(argv):
            opts["scale_step"] = float(argv[i + 1]); i += 2
        elif a == "--scale-range" and i + 1 < len(argv):
            opts["scale_range"] = float(argv[i + 1]); i += 2
        elif a == "--include-rotation":
            opts["include_rotation"] = True; i += 1
        elif a == "--rotation-step" and i + 1 < len(argv):
            opts["rotation_step"] = float(argv[i + 1]); i += 2
        elif a == "--rotation-range" and i + 1 < len(argv):
            opts["rotation_range"] = float(argv[i + 1]); i += 2
        elif a == "--regularisation" and i + 1 < len(argv):
            opts["regularisation_weight"] = float(argv[i + 1]); i += 2
        elif a == "--improvement-margin" and i + 1 < len(argv):
            opts["improvement_margin"] = float(argv[i + 1]); i += 2
        elif a == "--no-visualise":
            opts["visualise"] = False; i += 1
        elif a == "--no-show":
            opts["show_image"] = False; i += 1
        else:
            i += 1
    return project_dir, opts


if __name__ == "__main__":
    import sys
    argv = sys.argv[1:]
    if not argv:
        print("Usage: step03_roi_correction.py <project_dir> [--ignore-correction] [--no-show] ...")
        sys.exit(1)
    project_dir, opts = _parse_argv(argv)
    run_step03(project_dir, **opts)
    print("Done.")
