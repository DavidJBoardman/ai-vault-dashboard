# Step 6: 3D Geometry Traces

## Purpose

Establish the **intrados lines** — the 3D centre-lines of the vault ribs — that Step 7 will measure. Traces can come from automatic extraction or from a manually produced Rhino model, or both.

## Trace sources

### Automatic traces

The application extracts rib centre-lines automatically from the reprojected scan data using morphological skeletonisation of the rib mask followed by connected-component analysis to segment individual ribs. The result is a set of ordered 3D polylines, one per detected rib.

Automatic traces work well for clearly separated ribs with good point-cloud coverage. They may be incomplete where ribs are occluded, have low point density, or merge at boss keystones.

### Manual traces from Rhino 3DM

If you have manually traced the rib geometry in Rhino (or another tool that exports `3DM`), you can import those traces directly. Manual traces are preferable when automatic extraction is unreliable, or when you want precise control over rib endpoint positions.

To import: click **Import 3DM**, select the file, and map the Rhino layer names to the corresponding rib identifiers in the application.

## What you do here

1. **Inspect automatic traces.** Review the detected rib lines in the 3D canvas. Check that each rib is represented by a single continuous line without large gaps, and that the line follows the rib's centre-surface rather than its edge.

2. **Import manual traces (optional).** If automatic extraction is unsatisfactory for some or all ribs, import a `3DM` file and review the imported lines.

3. **Compare sources.** If you have both automatic and manual traces, the application shows them side by side. Use this comparison to decide which source is more reliable for each rib.

4. **Select the active trace set.** Choose whether to use automatic traces, imported traces, or a combination (with manual traces taking precedence for those ribs where they exist).

5. **Save the confirmed trace set** before moving to Step 7.

## Interface controls

| Control | What it does |
|---------|-------------|
| Automatic / manual / combined toggle | Switches which trace source is shown and used downstream |
| Import 3DM button | Opens a file browser to load a Rhino `3DM` file |
| Rib list | Lists all detected or imported traces; click to highlight in the 3D canvas |
| Visibility toggles | Show or hide automatic and manual trace overlays independently |
| Save button | Confirms the active trace set for Step 7 |

## What to check before moving on

- Every visible rib in the vault has a corresponding trace.
- Trace lines follow rib centre-lines, not edges or adjacent surfaces.
- No spurious traces are included (e.g. wall surface lines or fillet arches that are not part of the rib network).

## Expected result

A confirmed set of 3D rib traces that accurately represents the vault's rib network, ready for measurement in Step 7.
