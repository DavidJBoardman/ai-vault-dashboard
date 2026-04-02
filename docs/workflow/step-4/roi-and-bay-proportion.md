# Step 4A: ROI and Bay Proportion

## Purpose

This sub-stage defines the **Region of Interest (ROI)** — a rotatable rectangle that isolates a single vault bay on the projection image. The ROI establishes the coordinate frame for all subsequent 2D geometry work and provides the bay's aspect ratio, which is a key input for cut-typology matching.

## What the application does

When you trigger the **Analyse** action the backend runs the following sequence:

1. **Load the saved ROI** from `segmentations/index.json` (centre, width, height, rotation).
2. **Resolve the projection image** and compute the image-space aspect ratio.
3. **Compute anisotropy factors** from the projection metadata so that the *vault ratio* reflects true world-space proportions rather than pixel proportions.
4. **Suggest ratio patterns** — a ranked list of simple modular ratios (e.g. 2:1, 3:2, 6:5) and irrational proportions (e.g. 1:√2) that approximate the measured vault ratio.
5. **Detect bosses** by running connected-component analysis on the boss segmentation masks and converting centroids to normalised (u, v) coordinates within the ROI.
6. **Optional auto-correction** — a grid-search over small ROI translations, scale adjustments, and rotations to maximise alignment between detected bosses and template keypoints. Three presets are available: *fast*, *balanced*, and *precise*, each trading speed against search resolution.

Results are persisted to `2d_geometry/roi.json` and `2d_geometry/boss_report.json`.

## What you do here

- **Position the ROI** over the vault bay using the interactive canvas. Drag to move, corner handles to resize, and the rotation handle to align the rectangle with the bay boundaries.
- **Review the evidence layers** — toggle segmentation group overlays to verify the ROI encloses the correct region.
- **Run the analysis** to compute the vault ratio and detect bosses.
- **Optionally enable auto-correction** if the ROI alignment is uncertain. The auto-correct preset adjusts the ROI to improve boss-to-template fit.
- **Save the ROI** before moving to sub-stage 4B.

## Key outputs

| Output | Description |
|--------|-------------|
| **Vault ratio** | The bay's width-to-height proportion, corrected for projection anisotropy. Medieval bays were typically set out using modular ratios or simple geometric proportions.[^1] |
| **Ratio suggestions** | Candidate proportional systems ranked by proximity to the measured ratio. |
| **Boss report** | Detected boss centroids with (u, v) positions, ready for reference-point editing. |
| **Auto-correct metadata** | If enabled: the correction delta, score gain, and search parameters. |

[^1]: See [Plans — Tracing the Past](https://www.tracingthepast.org.uk/2021/04/07/designing_plans/) for discussion of medieval bay proportions and modular/geometric ratio systems.

## Why it matters

The later reference-point, typology, and reconstruction stages all operate within the ROI's unit-square coordinate system. A poorly positioned or incorrectly proportioned ROI will propagate errors through every downstream result.

## Expected result

Before continuing to sub-stage 4B you should have:

- a saved ROI that cleanly encloses the bay
- a vault ratio and ratio-pattern suggestions that are consistent with the visible evidence
- a boss report with detected centroids plotted on the canvas
