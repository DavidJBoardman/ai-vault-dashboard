"""
Step 04 — Boss-cut ratio matching with optional geometric ROI re-fit.

Matches each boss (u,v) to template ratios and records which cut(s) can generate it.
No global score ranking is used in this step.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

from src.vault_geometry2d.utils.cut_utils import unit_to_image, image_to_unit, RoiParams
from src.vault_geometry2d.utils.register_utils import load_boss_xy, generate_keypoints
from src.vault_geometry2d.utils.score_ratios import extract_template_ratios, match_boss_to_ratios
from src.vault_geometry2d.utils.report_utils import write_explanations_bundle, write_boss_template_match_csv

DEFAULT_TOL = 0.01

TYPE_STARCUT = "starcut"
TYPE_CIRCLECUT = "circlecut"


@dataclass
class Step04Config:
    project_dir: Path
    starcut_min: int = 2
    starcut_max: int = 6
    include_starcut: bool = True
    include_inner: bool = True
    include_outer: bool = True
    allow_cross_template: bool = True
    tolerance: float = DEFAULT_TOL


def load_refit_roi(analysis_dir: Path) -> Optional[Dict[str, float]]:
    """Load geometric ROI from analysis/roi_refit.json if present."""
    path = analysis_dir / "roi_refit.json"
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    roi = data.get("roi")
    return roi if isinstance(roi, dict) else None


def _variant_label(template_type: str, n: Optional[int], subtype: Optional[str]) -> str:
    if template_type == TYPE_STARCUT and n is not None:
        return f"starcut_n={n}"
    if template_type == TYPE_CIRCLECUT and subtype:
        return f"circlecut_{subtype}"
    return f"{template_type}_{subtype or n or '?'}"


def _match_template(
    template_uv: np.ndarray,
    bosses_uv: np.ndarray,
    tolerance: float,
) -> Dict[int, Dict[str, object]]:
    x_ratios, y_ratios = extract_template_ratios(template_uv)
    out: Dict[int, Dict[str, object]] = {}
    for boss_idx in range(bosses_uv.shape[0]):
        boss_uv = bosses_uv[boss_idx]
        x_idx, y_idx, x_dist, y_dist = match_boss_to_ratios(tuple(boss_uv), x_ratios, y_ratios, tolerance)
        is_matched = (x_idx is not None) and (y_idx is not None)
        out[boss_idx] = {
            "x_ratio_idx": x_idx,
            "y_ratio_idx": y_idx,
            "x_ratio": float(x_ratios[x_idx]) if x_idx is not None else None,
            "y_ratio": float(y_ratios[y_idx]) if y_idx is not None else None,
            "x_dist": float(x_dist),
            "y_dist": float(y_dist),
            "matched": is_matched,
            "boss_uv": [float(boss_uv[0]), float(boss_uv[1])],
        }
    return out


def _match_cross_template(
    x_template_uv: np.ndarray,
    y_template_uv: np.ndarray,
    bosses_uv: np.ndarray,
    tolerance: float,
    x_label: str,
    y_label: str,
) -> Dict[int, Dict[str, object]]:
    x_ratios, _ = extract_template_ratios(x_template_uv)
    _, y_ratios = extract_template_ratios(y_template_uv)
    out: Dict[int, Dict[str, object]] = {}
    for boss_idx in range(bosses_uv.shape[0]):
        boss_uv = bosses_uv[boss_idx]
        x_idx, y_idx, x_dist, y_dist = match_boss_to_ratios(tuple(boss_uv), x_ratios, y_ratios, tolerance)
        is_matched = (x_idx is not None) and (y_idx is not None)
        out[boss_idx] = {
            "x_ratio_idx": x_idx,
            "y_ratio_idx": y_idx,
            "x_ratio": float(x_ratios[x_idx]) if x_idx is not None else None,
            "y_ratio": float(y_ratios[y_idx]) if y_idx is not None else None,
            "x_dist": float(x_dist),
            "y_dist": float(y_dist),
            "matched": is_matched,
            "boss_uv": [float(boss_uv[0]), float(boss_uv[1])],
            "x_template": x_label,
            "y_template": y_label,
        }
    return out


def run_step04(ctx: Step04Config) -> Dict[str, object]:
    """
    Run boss-cut matching and write outputs.
    Returns dict with keys: out_dir, roi, bosses_uv, boss_ids, per_boss, variant_matched_boss_indices.
    """
    out_dir = ctx.project_dir / "analysis"
    out_dir.mkdir(parents=True, exist_ok=True)

    boss_report_path = ctx.project_dir / "boss_report.json"
    if not boss_report_path.exists():
        raise FileNotFoundError(f"Missing {boss_report_path}; run Step 02 (prepare_boss) first.")

    with boss_report_path.open("r", encoding="utf-8") as f:
        boss_report = json.load(f)
    roi = boss_report.get("roi")
    boss_ids: List[object] = list(boss_report["boss_ids"])

    refit_roi = load_refit_roi(out_dir)
    if refit_roi:
        roi = refit_roi
        print("[Step04] Applied geometric ROI re-fit from analysis/roi_refit.json")

    bosses_xy = load_boss_xy(str(boss_report_path))
    bosses_uv = np.array([image_to_unit((float(x), float(y)), roi) for x, y in bosses_xy], dtype=float).reshape(-1, 2)
    tol_used = float(ctx.tolerance)

    # Candidates: (template_type, n or None, subtype, internal_label, keypoints)
    candidates: List[Tuple[str, Optional[int], Optional[str], str, List[Tuple[float, float]]]] = []
    if ctx.include_starcut:
        for n in range(ctx.starcut_min, ctx.starcut_max + 1):
            candidates.append((TYPE_STARCUT, n, None, "standard", generate_keypoints("standard", n)))
    if ctx.include_inner:
        candidates.append((TYPE_CIRCLECUT, None, "inner", "inner", generate_keypoints("inner", roi=roi)))
    if ctx.include_outer:
        candidates.append((TYPE_CIRCLECUT, None, "outer", "outer", generate_keypoints("outer", roi=roi)))
    if not candidates:
        raise ValueError("At least one template variant must be included (starcut or circlecut).")

    all_per_boss_matches: Dict[str, Dict[int, Dict[str, object]]] = {}
    variant_matched_boss_indices: Dict[str, List[int]] = {}
    result_by_label: Dict[str, Dict[str, object]] = {}

    # Single-template matching
    for template_type, n, subtype, internal_label, keypts in candidates:
        template_uv = np.array(keypts, dtype=float)
        variant_label = _variant_label(template_type, n, subtype)
        per_boss_matches = _match_template(template_uv, bosses_uv, tol_used)
        all_per_boss_matches[variant_label] = per_boss_matches
        matched_indices = [idx for idx, info in per_boss_matches.items() if info.get("matched")]
        variant_matched_boss_indices[variant_label] = matched_indices
        result_by_label[variant_label] = {
            "template_type": template_type,
            "variant": internal_label,
            "n": n,
            "variant_label": variant_label,
            "is_cross_template": False,
        }
        print(f"  {variant_label}: matched={len(matched_indices)}/{bosses_uv.shape[0]}")

    # Cross-template matching
    if ctx.allow_cross_template:
        starcut_cands = [(t, n, sub, lab, kp) for t, n, sub, lab, kp in candidates if t == TYPE_STARCUT]
        circle_cands = [(t, n, sub, lab, kp) for t, n, sub, lab, kp in candidates if t == TYPE_CIRCLECUT]
        if starcut_cands and circle_cands:
            for (_s, xn, _xs, _xl, x_kp) in starcut_cands:
                for (_c, _yn, ysub, _yl, y_kp) in circle_cands:
                    x_v = _variant_label(TYPE_STARCUT, xn, None)
                    y_v = _variant_label(TYPE_CIRCLECUT, None, ysub)
                    cross_label = f"{x_v}_x+{y_v}_y"
                    pm = _match_cross_template(
                        np.array(x_kp, dtype=float),
                        np.array(y_kp, dtype=float),
                        bosses_uv,
                        tol_used,
                        x_v,
                        y_v,
                    )
                    all_per_boss_matches[cross_label] = pm
                    matched_indices = [idx for idx, info in pm.items() if info.get("matched")]
                    variant_matched_boss_indices[cross_label] = matched_indices
                    result_by_label[cross_label] = {
                        "template_type": "cross",
                        "variant": "cross",
                        "n": None,
                        "variant_label": cross_label,
                        "is_cross_template": True,
                    }
                    print(f"  {cross_label}: matched={len(matched_indices)}/{bosses_uv.shape[0]}")
            for (_c, _xn, xsub, _xl, x_kp) in circle_cands:
                for (_s, yn, _ys, _yl, y_kp) in starcut_cands:
                    x_v = _variant_label(TYPE_CIRCLECUT, None, xsub)
                    y_v = _variant_label(TYPE_STARCUT, yn, None)
                    cross_label = f"{x_v}_x+{y_v}_y"
                    pm = _match_cross_template(
                        np.array(x_kp, dtype=float),
                        np.array(y_kp, dtype=float),
                        bosses_uv,
                        tol_used,
                        x_v,
                        y_v,
                    )
                    all_per_boss_matches[cross_label] = pm
                    matched_indices = [idx for idx, info in pm.items() if info.get("matched")]
                    variant_matched_boss_indices[cross_label] = matched_indices
                    result_by_label[cross_label] = {
                        "template_type": "cross",
                        "variant": "cross",
                        "n": None,
                        "variant_label": cross_label,
                        "is_cross_template": True,
                    }
                    print(f"  {cross_label}: matched={len(matched_indices)}/{bosses_uv.shape[0]}")

    per_boss: Dict[object, Dict[str, object]] = {}
    for boss_idx, boss_id in enumerate(boss_ids):
        bu, bv = float(bosses_uv[boss_idx, 0]), float(bosses_uv[boss_idx, 1])
        bx, by = unit_to_image((bu, bv), roi)
        matches: List[Dict[str, object]] = []
        for variant_label, variant_matches in all_per_boss_matches.items():
            info = variant_matches.get(boss_idx, {})
            if not info.get("matched", False):
                continue
            result_meta = result_by_label.get(variant_label, {})
            is_cross = bool(result_meta.get("is_cross_template", False))
            if is_cross:
                x_cut = str(info.get("x_template") or "")
                y_cut = str(info.get("y_template") or "")
            else:
                x_cut = variant_label
                y_cut = variant_label
            x_ratio = info.get("x_ratio")
            y_ratio = info.get("y_ratio")
            template_xy = None
            if x_ratio is not None and y_ratio is not None:
                tx, ty = unit_to_image((float(x_ratio), float(y_ratio)), roi)
                template_xy = [int(tx), int(ty)]
            matches.append({
                "variant_label": variant_label,
                "template_type": result_meta.get("template_type"),
                "is_cross_template": is_cross,
                "x_cut": x_cut,
                "y_cut": y_cut,
                "x_ratio": x_ratio,
                "y_ratio": y_ratio,
                "x_error": info.get("x_dist"),
                "y_error": info.get("y_dist"),
                "template_uv": [x_ratio, y_ratio],
                "template_xy": template_xy,
                "matched": True,
            })
        per_boss[boss_id] = {
            "boss_uv": [bu, bv],
            "boss_xy": [int(bx), int(by)],
            "matched_any": len(matches) > 0,
            "matched_count": len(matches),
            "matches": matches,
        }

    write_explanations_bundle(out_dir, per_boss)
    write_boss_template_match_csv(out_dir, per_boss, boss_ids)

    with (out_dir / "variant_matched_bosses.json").open("w", encoding="utf-8") as f:
        json.dump(variant_matched_boss_indices, f, indent=2)

    # Best variant = one with most matched bosses (for Step05 template overlay)
    best_label: Optional[str] = None
    best_count = -1
    for label, indices in variant_matched_boss_indices.items():
        if len(indices) > best_count:
            best_count = len(indices)
            best_label = label
    if best_label is not None and result_by_label:
        best_meta = result_by_label[best_label]
        best_variant = {
            "variant": best_meta.get("variant"),
            "n": best_meta.get("n"),
            "variant_label": best_label,
            "template_type": best_meta.get("template_type"),
            "matched_count": best_count,
        }
        with (out_dir / "best_variant.json").open("w", encoding="utf-8") as f:
            json.dump(best_variant, f, indent=2)
        print(f"[Step04] Wrote best_variant.json: {best_label} (matched {best_count}/{bosses_uv.shape[0]})")
    results_full = list(result_by_label.values())
    with (out_dir / "results_full.json").open("w", encoding="utf-8") as f:
        json.dump(results_full, f, indent=2)

    combined = []
    for index, boss_id in enumerate(boss_ids):
        combined.append({
            "boss_id": str(boss_id),
            "boss_uv": [float(bosses_uv[index, 0]), float(bosses_uv[index, 1])],
        })
    with (out_dir / "bosses_combined.json").open("w", encoding="utf-8") as f:
        json.dump(combined, f, indent=2)
    with (out_dir / "roi_effective.json").open("w", encoding="utf-8") as f:
        json.dump(roi, f, indent=2)

    return {
        "out_dir": out_dir,
        "roi": roi,
        "bosses_uv": bosses_uv,
        "boss_ids": boss_ids,
        "per_boss": per_boss,
        "variant_matched_boss_indices": variant_matched_boss_indices,
    }


def run_step04_from_params(
    project_dir: str | Path,
    *,
    starcut_min: int = 2,
    starcut_max: int = 6,
    include_starcut: bool = True,
    include_inner: bool = True,
    include_outer: bool = True,
    allow_cross_template: bool = True,
    tolerance: float = DEFAULT_TOL,
) -> Dict[str, object]:
    """Run step 04 from project path and options. Returns result dict from run_step04."""
    project_dir = Path(project_dir)
    starcut_min = max(1, starcut_min)
    starcut_max = max(starcut_min, starcut_max)
    ctx = Step04Config(
        project_dir=project_dir,
        starcut_min=starcut_min,
        starcut_max=starcut_max,
        include_starcut=include_starcut,
        include_inner=include_inner,
        include_outer=include_outer,
        allow_cross_template=allow_cross_template,
        tolerance=tolerance,
    )
    return run_step04(ctx)


def _parse_argv(argv: list[str]) -> tuple[Path, dict]:
    project_dir = Path(argv[0]) if argv else Path(".")
    opts: dict = {}
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--starcut-min" and i + 1 < len(argv):
            opts["starcut_min"] = int(argv[i + 1]); i += 2
        elif a == "--starcut-max" and i + 1 < len(argv):
            opts["starcut_max"] = int(argv[i + 1]); i += 2
        elif a == "--no-starcut":
            opts["include_starcut"] = False; i += 1
        elif a == "--no-inner":
            opts["include_inner"] = False; i += 1
        elif a == "--no-outer":
            opts["include_outer"] = False; i += 1
        elif a == "--no-cross":
            opts["allow_cross_template"] = False; i += 1
        else:
            i += 1
    return project_dir, opts


if __name__ == "__main__":
    import sys
    argv = sys.argv[1:]
    if not argv:
        print("Usage: step04_boss_cut_matching.py <project_dir> [--starcut-min N] [--starcut-max N] ...")
        sys.exit(1)
    project_dir, opts = _parse_argv(argv)
    run_step04_from_params(project_dir, **opts)
    print(f"Wrote results to {project_dir / 'analysis'}")
