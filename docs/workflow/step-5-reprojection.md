# Step 5: Reprojection to 3D

## Purpose

Map the Step 3 segmentation masks back onto the original 3D point cloud, then trace the **intrados line** of each rib so that the trace and measurement work in later steps is grounded in the actual scan.

!!! note
    Step 5 needs only the Step 3 masks, not the Step 4 bay plan. It unlocks as soon as Step 3 is complete.

## What the application does

### Reprojection

The backend uses the projection settings recorded in Step 2 to project each **original E57 point** onto the 2D image. A point that lands inside a mask takes that mask's label. The result is a colour-coded point cloud in which every rib and feature group is labelled in three dimensions, ready to inspect before tracing.

### Intrados tracing

Clicking **Trace Intrados Lines** traces one line per rib mask:

1. **Collect the rib's points.** Take all scan points labelled with that rib. Drop any below the impost line or inside the exclusion box (see below).
2. **Find the rib's direction.** Principal component analysis (PCA) gives the direction the rib runs in.
3. **Slice.** Cut the rib into 50 slices across that direction.
4. **Pick the intrados.** In each slice, keep the points near the rib's horizontal centre and take the lower quartile (25th percentile) of their heights. That point is the intrados.
5. **Smooth.** Apply a moving average along the line.
6. **Trim boss turns automatically.** Where a boss stone makes the line bend sharply (more than 40°) within the last 30% at either end, cut the line back at that bend.

Heavy reprojection results are cached to disk. Revisiting the page with the same settings loads almost instantly.

Heavy reprojection results are cached to disk. Revisiting the page with the same settings loads almost instantly.

---

## What you do here

1. **Choose which segmentation groups to include.** Enable the groups you want to carry forward — usually ribs and boss stones at minimum.

2. **Review the 3D preview.** Check that the coloured overlays sit on the correct rib and boss geometry.

3. **Check masked and unmasked points.** Toggle visibility to make sure the selected features are not drifting onto unrelated masonry.

4. **Set the tracing exclusions (optional).** Use these to keep points that do not belong to the rib out of the traces:
    - **Impost Line (exclude below):** points below this height are ignored. By default it sits 10% of the way up the scan's height range.
    - **Exclusion Box (exclude inside):** points inside the red box are ignored.

    Use them to remove walls, capitals or stray points that the reprojection has picked up.

5. **Bridge ribs through boss stones (optional).** Tick this to join pairs of ribs that meet in line at a boss into one continuous arc, traced through the boss's own points. This is useful for reconstructing whole arches.

6. **Trace the intrados lines.** Click **Trace Intrados Lines** (or **Re-trace Intrados** after changing a setting).

7. **Trim rib endpoint turns (optional).** If a traced line still curves sharply at an end, open the **Trim Rib Endpoints** panel to cut it back.

8. **Continue to Traces.** If the impost line was changed after tracing, a warning asks you to re-trace, because Step 7 uses the same impost line.

---

## Projection orientation

Step 5 uses the same projection orientation you chose in Step 2. The default is **Top-down**, meaning the camera looks down at the vault from above. All subsequent steps — traces, measurements, and exports — use whatever orientation is recorded in the project.

If the 3D preview looks inverted or offset, go back to Step 2 and re-run the projection with the correct orientation before continuing.

---

## Trim Rib Endpoints

Traced intrados lines can still turn at their ends, usually where a rib runs into a boss stone or picks up scan noise near its end. The automatic trim catches sharp turns only. The **Trim Rib Endpoints** tool lets you cut back each end independently without discarding the whole trace.

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
    Applied trims are saved to the project immediately. To reset a line to its original extent, click **Re-trace Intrados**. This re-traces every rib and discards all manual trims.

### Closing the panel

Click **Cancel** or click elsewhere in the 3D canvas to deselect the current line and close the panel.

---

## Interface controls

| Control | What it does |
|---------|-------------|
| Segmentation group toggles | Include or exclude each feature class in the reprojection |
| Masked / unmasked point visibility | Isolate one group for inspection |
| 3D preview canvas | Interactive point-cloud view with reprojected colour labels; click any rib line to select it |
| Impost Line (exclude below) | Ignores points below the chosen height when tracing; Step 7 also uses it |
| Exclusion Box (exclude inside) | Ignores points inside an adjustable X/Y/Z box when tracing |
| Bridge ribs through boss stones | Joins rib pairs that meet in line at a boss into one continuous arc |
| Trace Intrados Lines / Re-trace Intrados | Runs the intrados tracing described above |
| Trim Rib Endpoints callout | Shows selection status; click a line to open the trim panel |
| Continue to Traces | Saves the reprojection and traces for Step 6 |

---

## What to check before moving on

- The coloured points sit on the intended features with no obvious spatial offset.
- Rib traces follow the rib centre lines closely at both ends — no sharp turns visible.
- The result is reliable enough to trust for the tracing step.

## Expected result

A confirmed 3D reprojection with clean rib endpoint traces, ready for Step 6.
