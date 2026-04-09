# Step 7: Measurements and Analysis

## Purpose

Compute quantitative geometric properties for each rib, including radius, length, apex, springing points, and impost distance.

## How arc fitting works

Each rib trace is approximated as a circular arc using **least-squares circle fitting**.[^1] This gives a practical measurement model for comparing ribs, while the fit error tells you when a rib does not behave like a simple circular arc.

[^1]: Related reference: Coope, I.D., "Circle Fitting by Linear and Nonlinear Least Squares", *Journal of Optimization Theory and Applications* 76 (1993), 381–388.

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

4. **Set the impost line.** Accept the auto-calculated height or enter a manual value if you have a surveyed reference.

5. **Review and compare groups.** Compare similar ribs and look for obvious outliers.

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

- All intended ribs have measurements.
- Fit errors are not unexpectedly high.
- Apex and springing positions look plausible.

## Expected result

A saved set of per-rib measurements ready for Step 8.
