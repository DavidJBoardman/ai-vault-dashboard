# Step 4B: Reference Points

## Purpose

This sub-stage prepares the **reference points** used in later geometry analysis. In most cases these are boss locations plus the ROI corners or other boundary anchors.

Accurate reference points matter because the later matching and reconstruction stages use them as the geometric skeleton for the bay.

## What you are looking for

In this step, you are identifying the most useful geometric guide points in the bay.

These usually include:

- **Boss points**: visible bosses or rib-junction points inside the ROI
- **Corner anchors**: the ROI corners, used as boundary reference points for the bay

The goal is not to place as many points as possible. The goal is to keep the points that best represent the bay geometry.

## Workflow

![Screenshot showing Step 4B interface with reference points over the ROI and projection image. Visible points mark bosses and ROI corners. Layers panel is open for toggling overlays.](../../images/step-4/step4b-reference.png){ width="800" .center }

1. Review the detected boss points on the canvas.
2. Remove obvious false detections.
3. Add or reposition points where an important boss has been missed or misplaced.
4. Decide whether the ROI corners should be included as boundary anchors.
5. Save the point set before moving on.

## What to check before moving on

- The main bosses inside the ROI are represented.
- Spurious points outside the bay have been removed.
- Corner anchors are included only if they help the interpretation.
