# Step 4B: Reference Points

## Purpose

This sub-stage prepares the set of **node points** — bosses and ROI corner anchors — that the cut-typology matching and bay-plan reconstruction stages rely on. Accurate node placement is the foundation for all subsequent geometric analysis.

## Point types

The application works with two kinds of node:

**Boss nodes**
:   Derived from the boss centroids detected in sub-stage 4A. Each boss represents a rib junction (keystone) visible in the projection. Boss positions are expressed in both image-space (x, y) and ROI unit-space (u, v).

**Corner nodes**
:   Four synthetic points placed at the ROI corners (NW, NE, SE, SW), corresponding to the bay's wall-plate or springer positions at (0, 0), (1, 0), (1, 1), and (0, 1) in unit space. These provide fixed anchors for boundary-edge reconstruction.

## What the application does

When this sub-stage loads, the backend returns the current node state:

1. If no saved node set exists, it builds one from the boss report plus the four corner anchors.
2. Each point is tagged with a `source` (auto-detected or manual) and a `pointType` (boss or corner).
3. All points are projected into (u, v) coordinates and flagged if they fall outside the ROI bounds.

Saving persists the edited point set to `2d_geometry/cut_typology_matching/node_points.json`. Resetting reverts to the auto-detected bosses plus corners and clears any prior matching results.

## What you do here

- **Review the detected bosses** on the canvas, overlaid on the projection image with the ROI visible.
- **Add or remove points** — drag to reposition, delete spurious detections, or manually place bosses that were missed by the automatic detection.
- **Filter points** — the Node Preparation panel lets you filter by inside/outside the ROI, helping identify outliers.
- **Toggle corner inclusion** — optionally include or exclude ROI corner anchors depending on whether the bay boundaries are architecturally meaningful springers.
- **Save the point set** before moving to sub-stage 4C.

## Why it matters

The quality of cut-typology matching depends directly on the accuracy of the node set. Undetected bosses will produce false-negative template matches; spurious points will inflate match counts for incorrect templates. Taking time to verify and correct the node set here avoids compounding errors in the matching and reconstruction stages.

## Expected result

Before continuing to sub-stage 4C you should have:

- a saved set of node points that accurately represents every visible boss
- corner anchors positioned at the bay's true springer or wall-plate locations
- confidence that no significant boss has been omitted and no false detection remains
