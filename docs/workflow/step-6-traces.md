# Step 6: 3D Geometry Traces

## Purpose

Establish the **intrados lines** that Step 7 will measure. Traces can come from automatic extraction, imported `3DM` curves, or both.

## Trace sources

### Automatic traces

The application derives candidate rib lines automatically from processed imagery using edge detection and skeletonisation, then splits the result into individual line candidates.[^1] This gives you a fast starting point rather than a finished scholarly interpretation.

Automatic traces work best where ribs are clearly separated and well captured in the scan.

### Manual traces from Rhino 3DM

If you have manually traced the rib geometry in Rhino or another tool that exports `3DM`, you can import those curves directly. Manual traces are preferable when automatic extraction is unreliable.

The importer reads **all curves** from the file regardless of layer name. There is no requirement for a specific layer structure in the `3DM` file.

---

## What you do here

1. **Inspect automatic traces.** Review the detected lines in the 3D canvas overlaid on the point cloud.

2. **Import manual traces (optional).** If automatic extraction is unsatisfactory for some or all ribs, click **Import 3DM** and select your file. Imported curves appear on the 3D canvas immediately alongside the point cloud.

3. **Compare sources.** If you have both automatic and manual traces, compare them side by side using the visibility toggles.

4. **Select the active trace set.** Choose whether to use automatic traces, manual traces, or both.

5. **Confirm the trace set** before moving to Step 7.

---

## Importing a 3DM file

1. Click **Import 3DM** in the sidebar.
2. Select a `3DM` file from the file browser.
3. The imported curves are read from all layers in the file and displayed on the 3D canvas immediately.
4. If the file contains no curves, a warning is shown — check that the file was exported with curves rather than meshes or surfaces.

!!! tip
    The importer accepts any `3DM` file regardless of how its layers are named. Export all rib curves to a single file in Rhino; the application will import them all.

!!! note
    After a successful import the active trace set is automatically switched to **Both** if automatic traces also exist, so you can compare the two sources side by side right away.

---

## State persistence

All trace settings — which source is active, visibility toggles, line width, and confirmed status — are saved to the project file on every change. If you close and reopen the application, the page restores to exactly the state you left it in, including any imported manual traces.

---

## Exporting traces

Once you have confirmed the trace set you can export it for use in other applications.

| Format | Extension | Use case |
|--------|-----------|---------|
| Rhino 3DM | `.3dm` | Round-trip to Rhino for further editing or documentation |
| Wavefront OBJ | `.obj` | General 3D interchange — import into Blender, AutoCAD, etc. |
| AutoCAD DXF | `.dxf` | 2D CAD applications and documentation drawings |

Click **Export** in the sidebar, select a format, and choose a save location.

---

## Interface controls

| Control | What it does |
|---------|-------------|
| Automatic / manual / both toggle | Switches which trace source is shown and used downstream |
| Import 3DM button | Opens a file browser to load a Rhino `3DM` file; curves appear in the 3D canvas immediately |
| Auto / manual visibility toggles | Show or hide each trace source overlay independently |
| Line width slider | Adjusts the display thickness of trace lines in the 3D canvas |
| Rib list | Lists all detected or imported traces; click to highlight in the 3D canvas |
| Export button | Exports the confirmed trace set to 3DM, OBJ, or DXF |
| Confirm button | Confirms the active trace set for Step 7 |

---

## What to check before moving on

- The main ribs you intend to measure each have a usable trace.
- Traces follow the rib centre as closely as practical.
- Obvious spurious lines have been excluded.
- If you imported manual traces, check that they appear correctly overlaid on the point cloud.

## Expected result

A confirmed set of traces ready for measurement in Step 7.

[^1]: Related reference: Zhang, T.Y. and Suen, C.Y., "A Fast Parallel Algorithm for Thinning Digital Patterns", *Communications of the ACM* 27(3), 1984, 236–239.
