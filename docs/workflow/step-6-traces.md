# Step 6: 3D Geometry Traces

## Purpose

Establish the **intrados lines** that Step 7 will measure. Traces can come from automatic extraction, imported `3DM` curves, or both.

## Trace sources

### Automatic traces

The application can derive candidate rib lines automatically from processed imagery using edge detection and skeletonisation, then split the result into individual line candidates.[^1] This gives you a fast starting point rather than a finished scholarly interpretation.

Automatic traces work best where ribs are clearly separated and well captured in the scan.

### Manual traces from Rhino 3DM

If you have manually traced the rib geometry in Rhino or another tool that exports `3DM`, you can import those traces directly. Manual traces are preferable when automatic extraction is unreliable.

To import: click **Import 3DM**, select the file, and map the Rhino layer names to the corresponding rib identifiers in the application.

## What you do here

1. **Inspect automatic traces.** Review the detected lines in the 3D canvas.

2. **Import manual traces (optional).** If automatic extraction is unsatisfactory for some or all ribs, import a `3DM` file and review the imported lines.

3. **Compare sources.** If you have both automatic and manual traces, compare them side by side.

4. **Select the active trace set.** Choose whether to use automatic traces, manual traces, or both.

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

- The main ribs you intend to measure each have a usable trace.
- Traces follow the rib centre as closely as practical.
- Obvious spurious lines have been excluded.

## Expected result

A confirmed set of traces ready for measurement in Step 7.

[^1]: Related reference: Zhang, T.Y. and Suen, C.Y., "A Fast Parallel Algorithm for Thinning Digital Patterns", *Communications of the ACM* 27(3), 1984, 236–239.
