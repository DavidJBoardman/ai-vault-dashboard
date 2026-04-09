# Step 7: Measurements and Analysis

## Purpose

Compute quantitative geometric properties for each rib: arc radius, rib length, apex height, springing-point positions, and impost distance.

## How arc fitting works

Each rib trace is modelled as a circular arc. The application fits the best-fit circle to the 3D point sequence using **least-squares circle fitting**, which minimises the sum of squared radial residuals between the trace points and the fitted circle.[^1] The fit is performed in the plane best aligned with the rib's local geometry. The residual (fit error) tells you how well a circular arc describes the rib — low values indicate a clean circular section; higher values may indicate a pointed or compound-curve rib.

[^1]: Coope, I.D., "Circle Fitting by Linear and Nonlinear Least Squares", *Journal of Optimization Theory and Applications* 76 (1993), 381–388.

## Measurements calculated

| Measurement | Description |
|-------------|-------------|
| **Arc radius** | Radius of the best-fit circle through the rib trace |
| **Rib length** | Path length along the trace from springing point to apex |
| **Apex point** | The highest point on the rib (maximum Z coordinate) |
| **Springing points** | The endpoints where the rib meets the wall, pier, or boss |
| **Fit error** | RMS residual of the arc fit — a quality indicator |
| **Impost distance** | Vertical distance from the springing point to the impost line |

## Impost line

The impost line is the horizontal reference plane at the level where the ribs spring from the piers or walls. In **Auto** mode the application estimates this as the median Z value of all springing points across the vault. You can override it with a manually specified height if you have an independent survey reference.

## What you do here

1. **Review the rib list.** Each rib from Step 6 appears as a row. Confirm the list is complete and all ribs are correctly identified.

2. **Run measurements.** Click **Calculate** (or run per-rib) to compute arc fits and derived values. Processing time scales with the number of points per rib.

3. **Inspect results.** For each rib, review:
   - The arc radius — compare ribs of the same type (tiercerons, liernes) to check for consistency.
   - The fit error — ribs with high residuals may need manual trace correction or indicate a non-circular profile.
   - The apex and springing positions in the 3D canvas overlay.

4. **Set the impost line.** Accept the auto-calculated height or enter a manual value if you have a surveyed reference. The impost distance is recalculated automatically.

5. **Review and compare groups.** Use the grouping tools to compare ribs by type or bay position. Consistent radii across a group are a good sign; outliers may indicate a measurement or trace error.

6. **Save results** before proceeding to Step 8.

## Interface controls

| Control | What it does |
|---------|-------------|
| Rib list | Shows all traces with status and summary values |
| Calculate / Run all button | Triggers arc fitting and measurement for selected or all ribs |
| Arc overlay toggle | Shows the fitted arc alongside the trace in the 3D canvas |
| Impost height control | Sets manual impost Z value, or reverts to auto |
| Group / compare panel | Groups ribs for comparative review |
| Export button | Saves measurements to a CSV file |

## What to check before moving on

- All ribs have computed arc radii and low fit errors (no unexpectedly high residuals).
- Apex and springing positions look geometrically plausible in the 3D canvas.
- The impost line is set at a sensible architectural reference height.

## Expected result

A complete set of per-rib measurements saved and ready for the three-circle chord method analysis in Step 8.
