# Step 5: Reprojection to 3D

## Purpose

Map the 2D segmentation masks and rib geometry back onto the original 3D point cloud so that trace and measurement work in later steps is grounded in the actual scan.

## What the application does

The backend uses the projection metadata recorded in Step 2 to reverse the orthographic projection: each pixel in the 2D mask is cast back into 3D space and matched to the nearest scan points. The result is a colour-coded point cloud where every rib and feature group is labelled in three dimensions and can be inspected before committing to the trace stage.

Heavy reprojection results are cached to disk. Revisiting the page with the same settings loads almost instantly.

---

## What you do here

1. **Choose which segmentation groups to include.** Enable the groups you want to carry forward — usually ribs and boss stones at minimum.

2. **Review the 3D preview.** Check that the coloured overlays sit on the correct rib and boss geometry.

3. **Check masked and unmasked points.** Toggle visibility to make sure the selected features are not drifting onto unrelated masonry.

4. **Trim rib endpoint turns (optional).** If any automatically extracted intrados lines curve sharply at their ends, open the **Trim Rib Endpoints** panel to cut them back.

5. **Confirm the reprojection** before moving to Step 6.

---

## Projection orientation

Step 5 uses the same projection orientation you chose in Step 2. The default is **Top-down**, meaning the camera looks down at the vault from above. All subsequent steps — traces, measurements, and exports — use whatever orientation is recorded in the project.

If the 3D preview looks inverted or offset, go back to Step 2 and re-run the projection with the correct orientation before continuing.

---

## Trim Rib Endpoints

Automatically traced intrados lines occasionally turn sharply at their ends when the extracted skeleton follows minor scan noise near the rib terminus. The **Trim Rib Endpoints** tool lets you cut back each end independently without discarding the whole trace.

### Opening the panel

In the sidebar, locate the **Trim Rib Endpoints** callout box. Click a rib line in the 3D canvas — the line highlights in amber and the floating trim panel opens.

If no line is selected, the callout shows *"Click a rib line in the 3D view to select it"*.

### Using the floating panel

The panel can be dragged anywhere on screen by its title bar — useful when working at different screen resolutions or when the default position overlaps the 3D canvas.

| Control | What it does |
|---------|-------------|
| **Start trim** slider | Removes points from the beginning of the line, as a percentage of total length |
| **End trim** slider | Removes points from the end of the line |
| Percentage readout | Shows the exact trim value next to each slider |
| Points removed label | Shows how many points will be dropped from each end |
| Visual range bar | Grey bar with an amber segment showing the retained portion |

1. Drag the **Start trim** slider right to cut the first section of the line.
2. Drag the **End trim** slider left to cut the last section.
3. The 3D canvas updates in real time as you move the sliders.
4. Click **Apply Trim** (amber) to save the change, or **Cancel** to discard and deselect.

!!! tip
    Start with small adjustments — 5–10% is usually enough to remove a sharp endpoint turn. The retained amber segment in the range bar gives a quick visual read of how much of the line you are keeping.

!!! note
    Applied trims are saved to the project immediately. To reset a line to its original extent, re-run the intrados extraction from Step 4 for that rib.

### Closing the panel

Click **Cancel** or click elsewhere in the 3D canvas to deselect the current line and close the panel.

---

## Interface controls

| Control | What it does |
|---------|-------------|
| Segmentation group toggles | Include or exclude each feature class in the reprojection |
| Masked / unmasked point visibility | Isolate one group for inspection |
| 3D preview canvas | Interactive point-cloud view with reprojected colour labels; click any rib line to select it |
| Trim Rib Endpoints callout | Shows selection status; click a line to open the trim panel |
| Confirm button | Persists the reprojection state for Step 6 |

---

## What to check before moving on

- The coloured points sit on the intended features with no obvious spatial offset.
- Rib traces follow the rib centre lines closely at both ends — no sharp turns visible.
- The result is reliable enough to trust for the tracing step.

## Expected result

A confirmed 3D reprojection with clean rib endpoint traces, ready for Step 6.
