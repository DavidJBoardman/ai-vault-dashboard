# Step 5: Reprojection to 3D

## Purpose

Map the 2D bay plan and segmentation results back onto the original 3D point cloud so later trace and measurement work is grounded in the scan.

## What the application does

The backend reprojects selected masks and geometry into 3D by using the projection metadata saved earlier. The result is a point-cloud view where the interpreted 2D work can be checked against the original scan.

## What you do here

1. **Choose which segmentation groups to include.** Enable the groups you want to carry forward, usually ribs and bosses first.

2. **Review the 3D preview.** Check that the coloured overlays sit on the correct rib and boss geometry.

3. **Check masked and unmasked points.** Toggle visibility to make sure the selected features are not drifting onto unrelated masonry.

4. **Confirm or adjust.** If the reprojection looks wrong, go back to Step 3 or Step 4 and correct the source data before proceeding.

5. **Save the reprojection state** before moving to Step 6.

## Interface controls

| Control | What it does |
|---------|-------------|
| Segmentation group toggles | Include or exclude each feature class in the reprojection |
| Masked / unmasked point visibility | Isolate one group for inspection |
| 3D preview canvas | Interactive point-cloud view with reprojected labels |
| Save button | Persists the reprojection state for Step 6 |

## What to check before moving on

- The coloured points sit on the intended features.
- There is no obvious spatial offset.
- The result is good enough to trust for tracing.

## Expected result

A confirmed 3D reprojection ready for Step 6.
