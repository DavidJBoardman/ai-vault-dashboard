# Step 5: Reprojection to 3D

## Purpose

Map the 2D bay-plan and segmentation results back onto the original 3D point cloud, so that rib geometry and boss positions are grounded in real-world scan coordinates before measurement.

## What the application does

The backend reprojects each segmentation mask and the bay-plan node/edge graph into 3D by reversing the orthographic projection applied in Step 2. Points in the scan that fall within a mask region are labelled with the corresponding feature class; the 2D node coordinates are lifted to 3D using the depth values recorded in the original scan.

## What you do here

1. **Choose which segmentation groups to include.** Enable the rib and boss masks (and any other feature classes) you want to carry forward. Exclude masks that were used only for visual reference or that you know are noisy.

2. **Review the 3D preview.** The canvas shows the point cloud with selected masks applied as coloured overlays. Verify that the coloured regions align with the actual rib surfaces and boss positions in 3D. Misalignment here usually indicates a poorly positioned ROI in Step 4A or a segmentation mask that drifted outside the rib.

3. **Check masked and unmasked points.** Toggle the visibility of masked and unmasked point groups to confirm the feature boundaries look correct in 3D, not just in the 2D projection.

4. **Confirm or adjust.** If the reprojection looks wrong, return to Step 4 (to correct the ROI or bay plan) or Step 3 (to refine the masks) before continuing. Do not proceed with a misaligned reprojection — errors here affect all downstream measurements.

5. **Save the reprojection state** before moving to Step 6.

## Interface controls

| Control | What it does |
|---------|-------------|
| Segmentation group toggles | Include or exclude each feature class in the reprojection |
| Masked / unmasked point visibility | Isolate one group for inspection |
| 3D preview canvas | Interactive point-cloud view with reprojected labels |
| Save button | Persists the reprojection state for Step 6 |

## What to check before moving on

- Coloured (masked) points sit on rib surfaces, not on adjacent stonework or open space.
- Boss positions appear at the correct rib junctions in 3D.
- No obvious spatial offset between the 2D-derived annotations and the 3D scan.

## Expected result

A confirmed 3D reprojection with correctly labelled feature points, ready to drive intrados trace extraction in Step 6.
