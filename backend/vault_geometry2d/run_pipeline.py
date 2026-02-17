"""
Run the full vault_geometry2d pipeline in a clear, step-by-step sequence.

Usage:
    python src/vault_geometry2d/run_pipeline.py [project_dir]
"""

from __future__ import annotations

from pathlib import Path

from src.vault_geometry2d.step01_roi import run_step01
from src.vault_geometry2d.step02_prepare_boss import run_step02
from src.vault_geometry2d.step03_roi_correction import run_step03
from src.vault_geometry2d.step04_boss_cut_matching import run_step04_from_params
from src.vault_geometry2d.step05_overlay import run_step05
from src.vault_geometry2d.step06_delaunay_ribs import run_step06


def _discover_image(project_dir: Path) -> Path | None:
    """Prefer *original_colour_gaussian.png, then *gaussian*.png, then first .png."""
    candidates = list(project_dir.glob("*original_colour_gaussian*.png"))
    if not candidates:
        candidates = list(project_dir.glob("*gaussian*.png"))
    if not candidates:
        candidates = list(project_dir.glob("*.png"))
    return candidates[0] if candidates else None


def _discover_boss_mask(project_dir: Path, image_path: Path | None) -> Path | None:
    """Prefer *gaussian_mask*.png, then <image_stem>_mask.png, then *mask*.png."""
    candidates = list(project_dir.glob("*gaussian*mask*.png"))
    if not candidates and image_path is not None:
        fallback = project_dir / f"{image_path.stem}_mask.png"
        if fallback.exists():
            return fallback
    if not candidates:
        candidates = list(project_dir.glob("*mask*.png"))
    return candidates[0] if candidates else None


if __name__ == "__main__":
    project_dir = Path(
        "data/temp/ottery/projection2d-gaussian/TtP_Ottery_point_cloud_choir_C6"
    ).resolve()
    if not project_dir.is_dir():
        raise FileNotFoundError(f"Project directory not found: {project_dir}")

    skip_step01 = True
    skip_step02 = True
    skip_step03 = True
    skip_step04 = True
    skip_step05 = False
    skip_step06 = False

    roi_path = project_dir / "roi.json"
    boss_report_path = project_dir / "boss_report.json"

    # %% --------------------------------------------------------------------------------
    # STEP 01: ROI SELECTION
    # --------------------------------------------------------------------------------
    step01_image_path = _discover_image(project_dir)
    step01_roi_path = roi_path
    if not skip_step01:
        if step01_image_path is None:
            raise FileNotFoundError(f"No input PNG found in {project_dir}")
        print("[run_pipeline] Step 01: ROI selection")
        run_step01(step01_image_path, step01_roi_path)
    else:
        print("[run_pipeline] Step 01: ROI selection skipped")

    # %% --------------------------------------------------------------------------------
    # STEP 02: PREPARE BOSS REPORT
    # --------------------------------------------------------------------------------
    step02_project_dir = project_dir
    step02_roi_path = roi_path
    step02_boss_mask_path = _discover_boss_mask(project_dir, step01_image_path)
    step02_overlay_path = project_dir / "boss_overlay.png"
    step02_rgb_colour = "255,0,0"
        
    if not skip_step02:
        if step02_boss_mask_path is None:
            raise FileNotFoundError(f"No boss mask PNG found in {project_dir}")
        print("[run_pipeline] Step 02: Prepare boss report")
        run_step02(
            step02_project_dir,
            roi_path=step02_roi_path,
            boss_mask_path=step02_boss_mask_path,
            out_overlay_path=step02_overlay_path,
            rgb_colour=step02_rgb_colour,
        )
        if not boss_report_path.exists():
            raise FileNotFoundError(f"Expected output missing: {boss_report_path}")
    else:
        print("[run_pipeline] Step 02: Prepare boss report skipped")

    # %% --------------------------------------------------------------------------------
    # STEP 03: ROI CORRECTION
    # --------------------------------------------------------------------------------
    step03_project_dir = project_dir
    step03_show_image = True
    step03_ignore_correction = False  # if True, keeps original ROI but still writes Step03 outputs
    if not skip_step03:
        print("[run_pipeline] Step 03: ROI correction")
        run_step03(
            step03_project_dir,
            show_image=step03_show_image,
            ignore_correction=step03_ignore_correction,
        )
    else:
        print("[run_pipeline] Step 03: ROI correction skipped")

    # %% --------------------------------------------------------------------------------
    # STEP 04: BOSS-CUT MATCHING
    # --------------------------------------------------------------------------------
    step04_project_dir = project_dir
    step04_starcut_min = 2
    step04_starcut_max = 6
    step04_tolerance = 0.01
    print("[run_pipeline] Step 04: Boss-cut matching")
    if not skip_step04:
        run_step04_from_params(
            step04_project_dir,
            starcut_min=step04_starcut_min,
            starcut_max=step04_starcut_max,
            tolerance=step04_tolerance,
        )
    else:
        print("[run_pipeline] Step 04: Boss-cut matching skipped")

    # %% --------------------------------------------------------------------------------
    # STEP 05: OVERLAY GENERATION
    # --------------------------------------------------------------------------------
    step05_project_dir = project_dir
    step05_all_variants = True
    if not skip_step05:
        print("[run_pipeline] Step 05: Overlay generation")
        run_step05(step05_project_dir, all_variants=step05_all_variants)
    else:
        print("[run_pipeline] Step 05: Overlay generation skipped")

    # %% --------------------------------------------------------------------------------
    # STEP 06: DELAUNAY RIBS
    # --------------------------------------------------------------------------------
    step06_project_dir = project_dir
    step06_include_cross = True
    step06_include_half_anchors = False
    show_image = True
    print("[run_pipeline] Step 06: Delaunay ribs")
    if not skip_step06:
        run_step06(
        step06_project_dir,
            include_cross=step06_include_cross,
            include_half_anchors=step06_include_half_anchors,
            show=show_image,
        )
    else:
        print("[run_pipeline] Step 06: Delaunay ribs skipped")

    print("[run_pipeline] Done.")
