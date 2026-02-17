"""
Step 02 — Prepare boss inputs: detect bosses from a colour mask (or manual points) and write boss_report.json.

Pipeline rule: from step02 onward everything is in UNSTRETCHED space. ROI (step01) is defined
on the unstretched image; overlays and (u,v) are in unstretched coordinates. If you pass a
stretched mask (e.g. from projection2d-gaussian), we convert it to unstretched once at input—
no jumping between stretched/unstretched later. Restretch only when needed (e.g. projecting back to 3D).

- Load ROI from step01 (unstretched pixel frame).
- If using a mask: align to stretched image size, then rescale_binary_mask(stretched→unstretched);
  detect on the unstretched mask; centroid_xy and boss_uv are in unstretched space.
- Overlay is drawn on image_path_unstretched.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional, Sequence

from src.vault_geometry2d.utils.cut_utils import load_roi
from src.vault_geometry2d.utils.boss_utils import (
    BossDetection,
    collect_bosses_from_binary,
    collect_bosses_from_points,
    parse_colour_to_bgr,
    binary_from_bgr_by_colour,
    clean_binary_mask,
    load_manual_points,
    dedupe_points,
    draw_boss_overlay,
    min_pairwise_distance,
    list_too_close,
)
from src.vault_geometry2d.utils.prepare_boss_io import (
    rescale_binary_mask,
    sanity_check,
    save_report,
)


def prepare_boss_report(
    project_dir: str | Path,
    *,
    roi_path: Optional[Path] = None,
    boss_mask_path: Optional[str | Path] = None,
    points_path: Optional[str | Path] = None,
    rgb_colour: str = "255,0,0",
    out_json_path: Optional[Path] = None,
    out_overlay_path: Optional[Path] = None,
    min_area: int = 20,
    max_area: Optional[int] = 100000,
    min_count: int = 4,
    max_count: int = 30,
    duplicate_tol: float = 0.01,
    dedupe: bool = True,
    drop_oob: bool = True,
    recommended_tol_unit: float = 0.03,
) -> Path:
    """
    Load ROI, detect bosses from mask or points, write boss_report.json.
    Returns path to the written boss_report.json.
    """
    import cv2

    project_dir = Path(project_dir)
    roi_path = roi_path or project_dir / "roi.json"
    out_json_path = out_json_path or project_dir / "boss_report.json"
    if not roi_path.exists():
        raise FileNotFoundError(f"ROI not found: {roi_path}. Run Step 01 first.")

    roi, meta = load_roi(str(roi_path))
    print(f"[Step02] Loaded ROI: centre=({roi['cx']:.1f}, {roi['cy']:.1f}), size=({roi['w']:.1f}, {roi['h']:.1f})")

    detections: List[BossDetection]
    did_rescale = False
    aniso = None

    if boss_mask_path is not None:
        mask_path = Path(boss_mask_path)
        if not mask_path.exists():
            raise FileNotFoundError(f"Boss mask not found: {mask_path}")
        img = cv2.imread(str(mask_path), cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"Failed to load mask: {mask_path}")
        img_h, img_w = img.shape[:2]
        base_image_path = str(meta.get("image_path")) if meta.get("image_path") else None
        # Normalize mask to unstretched in one go: resize to STRETCHED size (mask is usually
        # from stretched render), then rescale_binary_mask(stretched→unstretched). Result and
        # all downstream (centroid_xy, overlay) stay in unstretched space.
        image_path_stretched = str(meta.get("image_path")) if meta.get("image_path") else None
        if image_path_stretched:
            ref = cv2.imread(image_path_stretched, cv2.IMREAD_COLOR)
            if ref is not None and (img_w != ref.shape[1] or img_h != ref.shape[0]):
                img = cv2.resize(img, (ref.shape[1], ref.shape[0]), interpolation=cv2.INTER_NEAREST)
        bgr = parse_colour_to_bgr(rgb_colour)
        raw = binary_from_bgr_by_colour(img, bgr)
        raw, did_rescale, aniso = rescale_binary_mask(raw, base_image_path)
        cleaned = clean_binary_mask(raw)
        detections = collect_bosses_from_binary(
            cleaned,
            roi=roi,
            min_area=min_area,
            max_area=max_area,
        )
        mask_path_str = str(mask_path)
    elif points_path is not None:
        detections = collect_bosses_from_points(load_manual_points(Path(points_path)), roi)
        mask_path_str = None
    else:
        raise ValueError("Provide either boss_mask_path or points_path.")

    if drop_oob:
        detections = [d for d in detections if not d.out_of_bounds]

    if dedupe and len(detections) > 1:
        pts = [d.centroid_uv for d in detections]
        _filtered, _pairs, removed_indices = dedupe_points(pts, duplicate_tol)
        if removed_indices:
            keep = [i not in set(removed_indices) for i in range(len(detections))]
            detections = [d for i, d in enumerate(detections) if keep[i]]

    print(f"[Step02] Detected {len(detections)} boss centroids (post-filter).")

    sanity = sanity_check(
        detections=detections,
        min_count=min_count,
        max_count=max_count,
        duplicate_tol=duplicate_tol,
    )
    print("[Step02] Sanity:", json.dumps(sanity, indent=2))

    save_report(
        detections,
        roi,
        sanity,
        out_json_path,
        recommended_tol_unit=recommended_tol_unit,
        mask_path=mask_path_str,
        mask_rescaled=did_rescale if boss_mask_path else None,
        base_image_path=str(meta.get("image_path")) if meta.get("image_path") else None,
        image_path_unstretched=str(meta.get("image_path_unstretched")) if meta.get("image_path_unstretched") else None,
        anisotropy=float(aniso) if aniso is not None else None,
    )

    if out_overlay_path is not None:
        unstretched = meta.get("image_path_unstretched")
        if unstretched:
            draw_boss_overlay(str(unstretched), detections, out_overlay_path)
            print(f"[Step02] Wrote boss overlay to {out_overlay_path}")
        else:
            print("[Step02] No image_path_unstretched in ROI; skip overlay.")

    return out_json_path


def run_step02(
    project_dir: str | Path,
    *,
    roi_path: Optional[Path] = None,
    boss_mask_path: Optional[str | Path] = None,
    points_path: Optional[str | Path] = None,
    rgb_colour: str = "255,0,0",
    out_json_path: Optional[Path] = None,
    out_overlay_path: Optional[Path] = None,
    min_area: int = 20,
    max_area: Optional[int] = 100000,
    min_count: int = 4,
    max_count: int = 30,
    duplicate_tol: float = 0.01,
    dedupe: bool = True,
    drop_oob: bool = True,
    recommended_tol_unit: float = 0.03,
) -> Path:
    """Prepare boss inputs from mask or points; write boss_report.json. Returns path to boss_report.json."""
    return prepare_boss_report(
        project_dir,
        roi_path=roi_path,
        boss_mask_path=boss_mask_path,
        points_path=points_path,
        rgb_colour=rgb_colour,
        out_json_path=out_json_path,
        out_overlay_path=out_overlay_path,
        min_area=min_area,
        max_area=max_area,
        min_count=min_count,
        max_count=max_count,
        duplicate_tol=duplicate_tol,
        dedupe=dedupe,
        drop_oob=drop_oob,
        recommended_tol_unit=recommended_tol_unit,
    )


def _parse_argv(argv: list[str]) -> tuple[Path, dict]:
    project_dir = Path(argv[0]) if argv else Path(".")
    opts: dict = {}
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--roi" and i + 1 < len(argv):
            opts["roi_path"] = Path(argv[i + 1]); i += 2
        elif a == "--boss-mask" and i + 1 < len(argv):
            opts["boss_mask_path"] = argv[i + 1]; i += 2
        elif a == "--points" and i + 1 < len(argv):
            opts["points_path"] = Path(argv[i + 1]); i += 2
        elif a == "--rgb-colour" and i + 1 < len(argv):
            opts["rgb_colour"] = argv[i + 1]; i += 2
        elif a == "--out-json" and i + 1 < len(argv):
            opts["out_json_path"] = Path(argv[i + 1]); i += 2
        elif a == "--out-overlay" and i + 1 < len(argv):
            opts["out_overlay_path"] = Path(argv[i + 1]); i += 2
        elif a == "--min-area" and i + 1 < len(argv):
            opts["min_area"] = int(argv[i + 1]); i += 2
        elif a == "--max-area" and i + 1 < len(argv):
            opts["max_area"] = int(argv[i + 1]); i += 2
        elif a == "--min-count" and i + 1 < len(argv):
            opts["min_count"] = int(argv[i + 1]); i += 2
        elif a == "--max-count" and i + 1 < len(argv):
            opts["max_count"] = int(argv[i + 1]); i += 2
        elif a == "--duplicate-tol" and i + 1 < len(argv):
            opts["duplicate_tol"] = float(argv[i + 1]); i += 2
        elif a == "--no-dedupe":
            opts["dedupe"] = False; i += 1
        elif a == "--no-drop-oob":
            opts["drop_oob"] = False; i += 1
        elif a == "--recommended-tol" and i + 1 < len(argv):
            opts["recommended_tol_unit"] = float(argv[i + 1]); i += 2
        else:
            i += 1
    return project_dir, opts


if __name__ == "__main__":
    import sys
    argv = sys.argv[1:]
    if not argv:
        print("Usage: step02_prepare_boss.py <project_dir> [--boss-mask PATH] [--roi PATH] ...")
        sys.exit(1)
    project_dir, opts = _parse_argv(argv)
    opts.setdefault("roi_path", project_dir / "roi.json")
    opts.setdefault("out_overlay_path", project_dir / "boss_overlay.png")
    run_step02(project_dir, **opts)
    print("Done.")
