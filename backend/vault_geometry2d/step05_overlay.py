"""
Step 05 — Overlay starcut or circlecut template on the projection with boss points.

Reads analysis from Step 04 and boss_report for image path. Template overlays require
`best_variant.json`; if absent (per-boss all-match mode), Step05 exits gracefully.

Outputs:
- template_overlay.png: The single best-matching template from Step 04 (e.g. starcut_n=4
  or circlecut_inner), drawn on the background with all bosses. Which template is chosen
  depends on which variant matched the most bosses.
- circlecut_inner_overlay.png: Circlecut inner template on background + segmented bosses.
- circlecut_outer_overlay.png: Circlecut outer template on background + segmented bosses.
- final.png: Per-boss candidate overlay (from report_draw_utils).
- With --all-variants: one overlay per variant (variant_<label>.png) with matched bosses highlighted.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Set

import cv2
import numpy as np

from src.vault_geometry2d.utils.cut_utils import unit_to_image, RoiParams
from src.vault_geometry2d.utils.starcut import draw_grid_guides
from src.vault_geometry2d.utils.circle_starcut import draw_inner_circle_starcut, draw_outer_circle_starcut
from src.vault_geometry2d.utils.report_draw_utils import save_final_overlay

COLOUR_MATCHED = (0, 255, 0)   # green
COLOUR_UNMATCHED = (120, 120, 120)  # gray


def _draw_variant_template(out: np.ndarray, roi: RoiParams, variant_label: str, result: Dict[str, object], alpha: float = 0.85) -> np.ndarray:
    """Draw the template(s) for this variant. Cross variants draw both x and y templates."""
    template_type = result.get("template_type") or ""
    variant = result.get("variant")
    n = result.get("n")
    if template_type == "cross":
        # Parse e.g. "starcut_n=4_x+circlecut_inner_y" to draw both
        m = re.match(r"(.+)_x\+(.+)_y", variant_label)
        if m:
            x_part, y_part = m.group(1), m.group(2)
            if "starcut_n=" in x_part:
                nn = int(x_part.split("=")[1])
                out = draw_grid_guides(out, roi, nn, alpha=alpha * 0.6)
            elif "circlecut_inner" in x_part:
                out = draw_inner_circle_starcut(out, roi, alpha=alpha * 0.6)
            elif "circlecut_outer" in x_part:
                out = draw_outer_circle_starcut(out, roi, alpha=alpha * 0.6)
            if "starcut_n=" in y_part:
                nn = int(y_part.split("=")[1])
                out = draw_grid_guides(out, roi, nn, alpha=alpha * 0.6)
            elif "circlecut_inner" in y_part:
                out = draw_inner_circle_starcut(out, roi, alpha=alpha * 0.6)
            elif "circlecut_outer" in y_part:
                out = draw_outer_circle_starcut(out, roi, alpha=alpha * 0.6)
        else:
            out = draw_grid_guides(out, roi, 2, alpha=alpha)
    elif variant == "standard" and n is not None:
        out = draw_grid_guides(out, roi, int(n), alpha=alpha)
    elif variant == "inner":
        out = draw_inner_circle_starcut(out, roi, alpha=alpha)
    elif variant == "outer":
        out = draw_outer_circle_starcut(out, roi, alpha=alpha)
    else:
        out = draw_grid_guides(out, roi, 2, alpha=alpha)
    return out


def draw_template_overlay(
    base_img: np.ndarray,
    roi: RoiParams,
    best_result: Dict[str, object],
    bosses_uv: np.ndarray,
    boss_ids: List[object],
    out_path: Path,
    matched_indices: Optional[Set[int]] = None,
) -> None:
    """Draw template and boss points. If matched_indices is set, highlight those (green), dim others (gray)."""
    out = base_img.copy()
    out = _draw_variant_template(out, roi, str(best_result.get("variant_label", "")), best_result)

    for i in range(bosses_uv.shape[0]):
        u, v = float(bosses_uv[i, 0]), float(bosses_uv[i, 1])
        x, y = unit_to_image((u, v), roi)
        if matched_indices is not None:
            colour = COLOUR_MATCHED if i in matched_indices else COLOUR_UNMATCHED
            radius = 22 if i in matched_indices else 14
        else:
            colour, radius = COLOUR_MATCHED, 20
        cv2.circle(out, (x, y), radius, colour, 2)
        bid = boss_ids[i] if i < len(boss_ids) else i
        cv2.putText(out, str(bid), (x + radius + 2, y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_path), out)
    print(f"[Step05] Wrote template overlay to {out_path}")


def run_step05(project_dir: str | Path, all_variants: bool = False) -> None:
    """Load Step 04 outputs and boss_report, draw template overlay(s) and final overlay."""
    project_dir = Path(project_dir)
    analysis_dir = project_dir / "analysis"
    boss_report_path = project_dir / "boss_report.json"

    if not analysis_dir.exists() or not (analysis_dir / "explanations.json").exists():
        print("[Step05] No analysis/explanations.json; run Step 04 first.")
        return

    with (analysis_dir / "explanations.json").open("r", encoding="utf-8") as f:
        per_boss = json.load(f)

    with boss_report_path.open("r", encoding="utf-8") as f:
        boss_report = json.load(f)
    roi = boss_report.get("roi")
    roi_effective_path = analysis_dir / "roi_effective.json"
    if roi_effective_path.exists():
        with roi_effective_path.open("r", encoding="utf-8") as f:
            roi_effective = json.load(f)
        if isinstance(roi_effective, dict):
            roi = roi_effective
    report_images = boss_report.get("images", {}) or {}
    img_path = report_images.get("image_path_unstretched")
    if not img_path:
        print("[Step05] No image_path_unstretched in boss_report; skip overlay.")
        return

    base_img = cv2.imread(str(img_path), cv2.IMREAD_COLOR)
    if base_img is None:
        print(f"[Step05] Failed to load image: {img_path}")
        return

    combined_path = analysis_dir / "bosses_combined.json"
    if not combined_path.exists():
        print("[Step05] Missing analysis/bosses_combined.json; run Step 04 first.")
        return
    with combined_path.open("r", encoding="utf-8") as f:
        combined_data = json.load(f)
    if not isinstance(combined_data, list) or len(combined_data) == 0:
        print("[Step05] bosses_combined.json is empty or invalid.")
        return
    boss_ids = [str(item.get("boss_id", "")) for item in combined_data]
    bosses_uv = np.array([item.get("boss_uv", [0.0, 0.0]) for item in combined_data], dtype=float).reshape(-1, 2)

    overlay_dir = analysis_dir / "overlays"
    overlay_dir.mkdir(parents=True, exist_ok=True)

    # Resolve best variant: from best_variant.json, or infer from variant_matched_bosses + results_full
    best_result: Optional[Dict[str, object]] = None
    best_variant_path = analysis_dir / "best_variant.json"
    if best_variant_path.exists():
        with best_variant_path.open("r", encoding="utf-8") as f:
            best_variant = json.load(f)
        best_result = {
            "variant": best_variant.get("variant"),
            "n": best_variant.get("n"),
            "variant_label": best_variant.get("variant_label", ""),
            "template_type": best_variant.get("template_type"),
        }
    else:
        variant_matches_path = analysis_dir / "variant_matched_bosses.json"
        results_full_path = analysis_dir / "results_full.json"
        if variant_matches_path.exists() and results_full_path.exists():
            with variant_matches_path.open("r", encoding="utf-8") as f:
                variant_matched_boss_indices = json.load(f)
            with results_full_path.open("r", encoding="utf-8") as f:
                results_full = json.load(f)
            by_label = {r["variant_label"]: r for r in results_full if "variant_label" in r}
            best_label = None
            best_count = -1
            for label, indices in variant_matched_boss_indices.items():
                if len(indices) > best_count:
                    best_count = len(indices)
                    best_label = label
            if best_label and best_label in by_label:
                r = by_label[best_label]
                best_result = {
                    "variant": r.get("variant"),
                    "n": r.get("n"),
                    "variant_label": best_label,
                    "template_type": r.get("template_type"),
                }
                print(f"[Step05] Inferred best variant from match counts: {best_label} (matched {best_count})")
        if best_result is None:
            print("[Step05] best_variant.json not present; drawing boss overlay and final overlay only.")

    if best_result is not None:
        # Best variant template overlay (all bosses in green)
        draw_template_overlay(
            base_img,
            roi,
            best_result,
            bosses_uv,
            boss_ids,
            overlay_dir / "template_overlay.png",
            matched_indices=None,
        )
    else:
        # Boss-only overlay when no single best variant is available
        out = base_img.copy()
        for i in range(bosses_uv.shape[0]):
            u, v = float(bosses_uv[i, 0]), float(bosses_uv[i, 1])
            x, y = unit_to_image((u, v), roi)
            cv2.circle(out, (x, y), 20, COLOUR_MATCHED, 2)
            bid = boss_ids[i] if i < len(boss_ids) else i
            cv2.putText(out, str(bid), (x + 22, y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.imwrite(str(overlay_dir / "boss_overlay.png"), out)
        print(f"[Step05] Wrote boss overlay to {overlay_dir / 'boss_overlay.png'}")

    # Circlecut inner and outer overlays: template on background + segmented bosses,
    # with matched bosses highlighted (green) and unmatched dimmed (grey)
    variant_matched_boss_indices: Dict[str, List[int]] = {}
    variant_matches_path = analysis_dir / "variant_matched_bosses.json"
    if variant_matches_path.exists():
        with variant_matches_path.open("r", encoding="utf-8") as f:
            variant_matched_boss_indices = json.load(f)
    inner_matched = set(variant_matched_boss_indices.get("circlecut_inner", []))
    outer_matched = set(variant_matched_boss_indices.get("circlecut_outer", []))
    n_bosses = bosses_uv.shape[0]
    if inner_matched:
        print(f"[Step05] circlecut_inner: {len(inner_matched)}/{n_bosses} bosses covered by template (green=covered, grey=not)")
    if outer_matched:
        print(f"[Step05] circlecut_outer: {len(outer_matched)}/{n_bosses} bosses covered by template (green=covered, grey=not)")

    circle_inner_result = {"variant": "inner", "variant_label": "circlecut_inner", "template_type": "circlecut", "n": None}
    circle_outer_result = {"variant": "outer", "variant_label": "circlecut_outer", "template_type": "circlecut", "n": None}
    draw_template_overlay(
        base_img, roi, circle_inner_result, bosses_uv, boss_ids,
        overlay_dir / "circlecut_inner_overlay.png",
        matched_indices=inner_matched if inner_matched else None,
    )
    draw_template_overlay(
        base_img, roi, circle_outer_result, bosses_uv, boss_ids,
        overlay_dir / "circlecut_outer_overlay.png",
        matched_indices=outer_matched if outer_matched else None,
    )

    save_final_overlay(base_img, roi, per_boss, overlay_dir / "final.png")

    # Per-variant overlays: each template with matched bosses highlighted
    if all_variants:
        variant_matches_path = analysis_dir / "variant_matched_bosses.json"
        results_full_path = analysis_dir / "results_full.json"
        if variant_matches_path.exists() and results_full_path.exists():
            with variant_matches_path.open("r", encoding="utf-8") as f:
                variant_matched_boss_indices = json.load(f)
            with results_full_path.open("r", encoding="utf-8") as f:
                results_full = json.load(f)
            by_label = {r["variant_label"]: r for r in results_full if "variant_label" in r}
            for variant_label, matched_indices_list in variant_matched_boss_indices.items():
                result = by_label.get(variant_label, best_result)
                if result is None:
                    continue
                matched_set = set(matched_indices_list)
                safe_label = re.sub(r"[^\w\-=]", "_", variant_label)
                path = overlay_dir / f"variant_{safe_label}.png"
                draw_template_overlay(
                    base_img,
                    roi,
                    result,
                    bosses_uv,
                    boss_ids,
                    path,
                    matched_indices=matched_set,
                )
            print(f"[Step05] Wrote {len(variant_matched_boss_indices)} per-variant overlays to {overlay_dir}")
        else:
            print("[Step05] --all-variants unavailable without results_full.json metadata.")
    print("[Step05] Done.")


if __name__ == "__main__":
    import sys
    argv = sys.argv[1:]
    if not argv:
        print("Usage: step05_overlay.py <project_dir> [--all-variants]")
        sys.exit(1)
    project_dir = argv[0]
    all_variants = "--all-variants" in argv
    run_step05(project_dir, all_variants=all_variants)
