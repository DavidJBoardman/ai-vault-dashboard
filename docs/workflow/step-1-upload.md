# Step 1: Upload E57 Scan

## Purpose

Load the point-cloud dataset into the application and verify it is ready for projection.

## What you do here

1. Select or drag-and-drop an `E57` file onto the upload area.
2. Wait for the backend to parse and index the scan — progress is shown in the status bar.
3. Inspect the 3D preview to confirm the scan looks correct (correct orientation, no obvious missing regions, colour or intensity data present if expected).
4. Adjust the preview point-count slider if the initial render is too dense or too sparse for a quick visual check.
5. Check the backend health indicator — it must be green before the upload can proceed.

## Interface controls

| Control | What it does |
|---------|-------------|
| File selector / drag-and-drop area | Opens a file browser or accepts a dragged `E57` file |
| Point-count slider | Sets the number of points rendered in the preview (does not affect the stored data) |
| Upload / Open button | Sends the file to the backend for processing |
| Backend health indicator | Shows whether the processing service is running and reachable |

## What to check before moving on

- The preview shows the vault scan in the expected orientation.
- No error message appears in the status bar.
- The point count and bounding-box dimensions look plausible for the structure.

!!! note "File size"
    E57 files from terrestrial laser scans are often several gigabytes. Allow time for the initial parse; the progress indicator will confirm when the backend is ready.

## Expected result

A successfully loaded scan with a visible 3D preview and no errors reported. You can now proceed to Step 2.
