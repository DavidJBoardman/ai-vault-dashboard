# Step 4B: Reference Points

## Purpose

This sub-stage prepares the set of **reference points** used to support the later geometric analysis. These are visible helper points on the vault projection, such as notable bosses and boundary anchors, that help the software interpret how the historic design plan may have been laid out.

Accurate reference points are important because the later matching and reconstruction stages use them to infer the underlying geometric structure of the bay.

## What you are looking for

In this step, you are identifying the most useful geometric guide points in the bay.

These usually include:

- **Boss points**: visible bosses or rib-junction points inside the ROI
- **Corner anchors**: the ROI corners, used as boundary reference points for the bay

The goal is not simply to collect points, but to place the points that best support interpretation of the original vault design.

## Workflow

![Screenshot showing Step 4B interface with reference points over the ROI and projection image. Visible points mark bosses and ROI corners. Layers panel is open for toggling overlays.](../../images/step-4/step4b-reference.png){ width="800" .center }

1. Review the detected bosses on the canvas, overlaid on the projection image with the ROI visible.
2. Add or remove points: drag to reposition, delete spurious detections, or manually place bosses that were missed by the automatic detection.
3. Filter points: the Node Preparation panel lets you filter by inside/outside the ROI, helping identify outliers.
4. Toggle corner inclusion — optionally include or exclude ROI corner anchors depending on whether the bay boundaries are architecturally meaningful springers.
5. Save the point set before moving to sub-stage 4C.
