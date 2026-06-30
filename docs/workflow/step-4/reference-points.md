# Step 4B: Reference Points

## Purpose

This sub-stage prepares the **reference points**: the boss locations and optional corner anchors that the later matching, reconstruction, and measurement stages use as the geometric skeleton of the bay. The aim is to keep the points that best represent the bay geometry, not to place as many as possible.

## Workflow

![Screenshot of the Step 4B interface: the editable reference points table on the left, with name, pixel position, and source/ROI columns, and the Bay Preview on the right showing labelled points with the Selected, Manual, and Outside ROI legend.](../../images/step-4/step4b-reference.png){ width="800" .center }

## Reading the canvas

Points are drawn over the bottom projection image and coloured by state. The legend above the Bay Preview explains the colours:

- **Selected**: a hollow ring with a sky blue outline, marking the point currently highlighted in the table.
- **Manual**: a solid amber dot, a point you added by hand.
- **Outside ROI**: a solid red dot, a point that falls outside the current ROI.

Points found automatically are drawn in white with a blue outline, and the ROI corner anchors are drawn in cyan.

## The reference points table

Each point is one row. Selecting a row highlights the matching point on the canvas, and selecting a point on the canvas highlights its row.

- **# / Name**: the row number, followed by an editable letter label. Labels use the letters A to Y (the letters I, O and Z are skipped). A to D are reserved for the ROI corners, and bosses are labelled from E onwards. Each name must be unique; duplicate names are shown in red and stop you saving until you fix them.
- **X PX / Y PX**: the point's position in pixels. You can type a new value in place, then press **Enter** to confirm or **Escape** to cancel.
- **Source / ROI**: two small badges. The source badge shows **A** when the point was found automatically (from the bosses segmented in Step 3) or **M** when you added it by hand. The ROI badge shows **In** when the point sits inside the ROI or **Out** when it sits outside.

## Controls

- **Include ROI corners**: adds the four corners of the current ROI as corner anchors, labelled A to D. These corners always come from the saved ROI, so if you go back to 4A and adjust it, they refresh automatically the next time you open 4B; you never need to place them by hand. Untick this box if you do not want the corners as reference points.
- **All / In ROI / Outside**: filter the table to show every point, only the points inside the ROI, or only the points outside it.
- **Add Point**: drops a new manual point near the centre of the ROI and gives it the next free letter. Move it by editing its coordinates or by dragging it on the canvas.
- **Reset to Detected**: discards your edits and restores the points that were found automatically. This saves straight away.
- **Save Reference Points**: stores the point set. The header reads **Saved** or **Unsaved**. The button is greyed out while saving, when there is nothing new to save, or while any names are duplicated.

## Recommended workflow

1. Review the detected boss points on the canvas and in the table.
2. Remove any obvious false detections using the delete button on the row.
3. Add or move points where an important boss is missing or misplaced, and rename them if needed.
4. Check that no names are duplicated (no red rows).
5. Save the point set before moving on.

## Before moving on

- The main bosses inside the ROI are represented.
- Stray points outside the bay have been removed.
- Corner anchors are included only if they help the interpretation.
- Remember that saving here marks **Cut-Typology (4C)** and **Bay Plan (4D)** as **Update needed** in the workflow stepper. Run them again to pick up the new point positions, or **Dismiss** the note if the change does not affect them (see [Sub-stage dependencies and staleness](index.md#sub-stage-dependencies-and-staleness)). Work that you have not saved never affects the later stages; only saving does.

Click **Cut-Typology Matching** on the workflow stepper bar at the top to continue to sub-stage 4C.
