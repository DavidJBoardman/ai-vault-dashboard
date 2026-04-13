# Step 1: Upload E57 Scan

## Purpose

Load the point-cloud dataset into the application and confirm it is ready for the rest of the workflow.

## What you do here

1. Select or drag-and-drop an `E57` file onto the upload area.
2. Wait for the file to load and for the preview to appear.
3. Inspect the 3D preview to confirm the scan orientation and coverage look correct.
4. Adjust the preview point-count slider if you need a lighter or denser preview.
5. Check the backend health indicator. It should be online before you continue.

## Interface controls

| Control | What it does |
|---------|-------------|
| File selector / drag-and-drop area | Opens a file browser or accepts a dragged `E57` file |
| Point-count slider | Sets the number of points rendered in the preview (does not affect the stored data) |
| Upload / Open button | Sends the file to the backend for processing |
| Backend health indicator | Shows whether the processing service is running and reachable |

## What to check before moving on

- The vault is visible in the expected orientation.
- The preview does not look obviously clipped or incomplete.
- No upload or backend error is shown.

!!! note "File size"
    `E57` files from terrestrial laser scans are often large. The initial load can take time, especially on the first pass through a new project.

## Expected result

A successfully loaded scan with a visible 3D preview and no errors. You can now continue to Step 2.
