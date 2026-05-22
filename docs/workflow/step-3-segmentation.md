# Step 3: Segmentation

## Purpose

Identify and label the architectural features on the projection image — ribs, boss stones, corners, and any other elements you need — so that later stages work from clean, named masks rather than raw imagery.

## How segmentation works

The application uses **SAM 3** (Segment Anything with Concepts) to turn user-drawn prompts into feature masks.[^1] You direct the model by drawing bounding boxes or polygons around the features you want, optionally guiding it further with text labels. The model returns one or more candidate masks per prompt; you keep what is useful and discard or refine the rest.

[^1]: SAM 3 extends the prompt-driven segmentation framework with concept-level understanding, enabling the model to associate masks with semantic categories without task-specific retraining. See Carion et al., "SAM 3: Segment Anything with Concepts", [arXiv:2511.16719](https://arxiv.org/abs/2511.16719), 2025.

---

## Required order of operations

Segmentation in this step follows a fixed two-stage sequence:

```
1  ROI  →  Confirm  →  2  Segment
```

The workflow progress indicator at the top of the **Segmentation** panel shows which stage you are on. Segmentation tools are locked until the ROI has been confirmed.

---

## Stage 1 — Define the Region of Interest

The ROI is a rotatable rectangle that marks the boundary of the vault bay you are analysing. Confirming it does two things: it places four labelled corner markers (A–D) that become reference points for Step 4, and it unlocks the segmentation tools.

### Drawing the ROI

1. Select the **ROI** tool from the four-tool grid (it is selected by default when the page opens).
2. Click and drag on the projection image to draw the rectangle.
3. Resize and position it so that all **four corners of the ROI align precisely with the four corners of the vault bay**:
   - **Drag the interior** to move the whole rectangle.
   - **Drag a corner or edge handle** to resize.
   - **Drag the rotation handle** (arc above the top edge) to rotate the rectangle to align with the bay axis.

The ROI panel shows the current size as a percentage of the image and the rotation angle. If masks are already present, it also shows how many fall inside versus outside the boundary.

![Stage 1 — Draw and align the ROI to the vault corners](../images/step-3/step3a-select-roi.png){ width="800" .center }

The green rectangle should fit tightly to the vault boundary. Corner handle points are visible at each corner — drag them individually to fine-tune the fit before confirming.

!!! tip
    Rotate the ROI to match the axis of the bay rather than forcing a straight rectangle onto a skewed scan. Even a few degrees of correction can significantly improve the quality of the geometry analysis in Step 4.

### Confirming the ROI

Once you are satisfied with the boundary:

1. Click **Confirm ROI & Set Corners A–D** in the ROI panel.
2. Four gold dot markers labelled **A**, **B**, **C**, **D** (top-left, top-right, bottom-right, bottom-left) are placed at the exact corner positions as mask entries.
3. The ROI status pill changes to **✓ ROI** and the segmentation tools become active.
4. If no segmentation masks exist yet, **rib and boss stone segmentation runs automatically** — see [Auto-segmentation](#auto-segmentation) below.

If you need to adjust the boundary after confirming, switch back to the ROI tool and redraw. The confirmation clears automatically when the rectangle is moved or resized and must be re-confirmed before segmenting.

### Removing masks outside the ROI

After segmenting, any masks that fall outside the bay boundary can be removed:

- In the ROI panel (with the ROI tool active), click **Remove N Outside ROI** if the button is visible.
- The backend classifies every mask by pixel overlap rather than just bounding-box centre, so masks that touch the ROI edge are retained.
- This operation permanently deletes the outside masks from the project file. Review the list before proceeding.

---

## Stage 2 — Segmenting features

### Auto-segmentation

When the ROI is confirmed on a project with no existing masks, segmentation runs automatically for **ribs** and **boss stones**. You do not need to select prompts or click any button — the model searches the full image immediately.

A status card in the Segmentation panel tracks progress:

| Status | Meaning |
|--------|---------|
| Spinner + "Searching for ribs and boss stones…" | Model is running — this takes a few seconds on first load, faster afterwards |
| Green tick + found count | Segmentation complete; review the results on the canvas |
| Amber warning | Nothing detected — adjust the ROI or add features manually with the Box tool |

After the run, all masks falling outside the ROI are removed automatically.

!!! tip
    The first inference run loads the SAM model (about 2 GB). Subsequent runs in the same session are noticeably faster.

### Choosing what to segment

For rib-geometry analysis you need at minimum:

- **Rib** masks covering the visible rib surfaces.
- **Boss stone** masks for the boss keystones at rib intersections.

The corner markers A–D are placed automatically during ROI confirmation; you do not need to draw them separately.

### Segmentation tools

Four tools are available in a 2×2 grid below the SAM button. Switch between them with a single click.

| Tool | Icon | Use for |
|------|------|---------|
| **Polygon** | Hexagon | Drawing closed outlines around features for guided segmentation |
| **Box** | Square | Drawing bounding boxes as positive or negative prompts |
| **ROI** | Scan frame | Adjusting the vault bay boundary (Stage 1) |
| **Eraser** | Eraser | Removing unwanted portions of an existing mask |

The Polygon, Box, and Eraser tools are disabled until the ROI is confirmed.

---

### Re-running segmentation

Use the **Re-run Segmentation** button to search again with the current prompts. This is useful after adjusting the ROI or when the initial run missed features.

By default, re-running searches for `rib` and `boss stone`. To add or change prompts, expand the **Custom prompts** section below the button:

- Click the `rib` or `boss stone` preset buttons to add those terms.
- Type a custom label into the field and press **Enter** or click **+**.
- Active prompts are shown as removable tags.

Alternative terms that can work better on some scans:

- `soffit` or `vault ceiling` — alternative terms for the intrados surface
- `arch line` or `vault rib line` — can work better when ribs are narrow or faint
- `keystone` — for prominent decorative keystones not classified as boss stones
- `tierceron` or `lierne` — for secondary and linking ribs in more complex vaults

### Status feedback

After each segmentation run:

- A **green success card** shows how many ribs and boss stones were found.
- An **amber warning card** appears if nothing was detected, with a suggestion to try the Box tool.
- A **red error card** appears if the backend returned an error.

The processing overlay on the canvas updates throughout the run:

- *"Loading SAM model…"* — first run only; loads once per session.
- *"Searching for ribs and boss stones…"* — model is actively scanning.
- *"This may take a moment for large images…"* — active search in progress.

---

### Box prompts (Find Similar)

Use box prompts when the auto-segmentation missed specific features — boss stones are most commonly missed on the first pass. The Box tool lets you show the model a clear example and have it find all similar features across the image.

![Stage 2 — Box tool showing missing feature guide](../images/step-3/step3b-text-prompt-select.png){ width="800" .center }

A **"Missing boss stones or ribs?"** guide is available below the Re-run button (expand it to see the steps):

1. Select the **Box** tool in the tool grid.
2. Drag a rectangle around a **clear, well-lit example** of the missed feature on the canvas. Name it `boss stone` or `rib` when prompted.
3. Click **Find Similar** — the model searches the entire image for features matching your example.

To improve accuracy, add a **negative box** (click the **+/−** toggle to switch it to **−**) over any shadows, adjacent masonry, or other features you want the model to avoid.

![Box tool — naming a selection](../images/step-3/step3c-box-select.png){ width="800" .center }

After **Find Similar** completes, an inline result appears below the button:

- **Green** — count of features found; drawn boxes are cleared automatically.
- **Amber** — nothing matched; advice on improving the example.
- **Red** — segmentation error.

![Box tool — running Find Similar after marking features](../images/step-3/step3d-find-similar.png){ width="800" .center }

!!! note
    When using the **Box** or **Polygon** tools, only the name assigned to that box or polygon is used as the text prompt — not the active text prompt list. This allows targeted segmentation without changing the global prompt.

The **Polygon** tool works identically but lets you draw a freeform closed outline instead of a rectangle — useful for irregularly shaped features or when you need to exclude a specific sub-region.

---

### Eraser tool

Use the eraser to clean up the edges of an existing mask without deleting it entirely — useful when SAM has spilled over onto adjacent masonry or included a shadow.

1. Select the **Eraser** tool (highlighted red when active).
2. Set the **Brush size** using the slider in the eraser panel.
3. Select the mask you want to edit from the list in the panel.
4. Paint over the canvas to remove those pixels from the selected mask in real time.

![Eraser tool — brush size and mask selection](../images/step-3/step3e-eraser-tool.png){ width="400" .center }

**Visibility while erasing:** when a mask is selected, the eraser automatically dims it to roughly half-opacity so you can see the underlying projection through it, and fades all other masks nearly out of view. The eraser cursor gains a red-tinted fill to remain clearly visible over any mask colour. When you switch away from the Eraser tool the normal display restores.

Only visible masks appear in the eraser's selection list. To erase a mask that is hidden, make it visible first using the checkbox in the Segments panel.

---

## Duplicate handling

Each time new masks are returned from SAM they are merged with the existing masks using these rules:

- **Same-label IoU threshold of 0.35.** A new mask is compared against existing masks of the **same feature type** only. If they overlap by more than 35% of their combined area, they are considered duplicates. Boss stone masks never replace rib masks and vice versa.
- **Quality replacement.** If the new mask has a higher predicted IoU quality score than the existing one, the existing mask is replaced. If the new mask is lower quality, it is discarded.
- **Within-batch deduplication.** Multiple overlapping masks returned in the same SAM run are also deduplicated against each other — the highest-quality mask is kept.
- **Pixel-level NMS on the backend.** Before masks are sent to the frontend, the backend applies greedy pixel-level non-maximum suppression within each label group. This prevents SAM from returning two masks for the same physical rib.

This means repeated segmentation runs progressively improve mask quality rather than accumulating duplicates.

---

## Mask management

### Overlay controls

At the top of the image panel:

- **Opacity slider** — adjusts how strongly the coloured masks are blended over the projection image. Drag left to see more of the underlying scan.
- **Focus toggle** — when enabled, dims all masks except the currently selected or hovered mask (20% opacity for background masks, full opacity for the focused one). Useful for identifying overlapping or adjacent masks.
- **Labels toggle** — shows or hides the short label identifier on each mask in the canvas overlay.

**Hover spotlight:** hovering any mask row in the Segments panel immediately highlights that mask on the canvas (others fade), even when Focus mode is off.

### Segments panel

All current masks are listed below the tool card, grouped by feature type. Within each group:

- **Show/hide group** — the group header checkbox toggles all masks in the group at once.
- **Show/hide individual mask** — the checkbox next to each mask entry.
- **Rename mask** — double-click the label or click the pencil icon; press **Enter** to save or **Escape** to cancel.
- **Delete mask** — click the trash icon next to the mask entry.
- **Delete whole group** — click the trash icon on the group header row.
- **Reorder** — drag masks within the list using the grip handle on the left.

Changes to the mask list are saved to the project file immediately. Every segmentation run also saves automatically, so closing and reopening the project preserves all masks.

### Undo and Redo

The **↩ Undo** and **↪ Redo** buttons in the Segments panel header step back and forward through your mask editing history (up to 10 steps). The keyboard shortcuts also work anywhere on the page:

| Action | Windows / Linux | Mac |
|--------|----------------|-----|
| Undo | `Ctrl+Z` | `Cmd+Z` |
| Redo | `Ctrl+Y` or `Ctrl+Shift+Z` | `Cmd+Shift+Z` |

Every undo and redo saves the restored state to disk immediately, so the project file always reflects what you see on screen.

The following operations are tracked in history:

- Adding masks from any segmentation run (box, polygon, or auto)
- Deleting a single mask or an entire group
- Renaming a mask label
- Eraser strokes (captured at the start of each stroke)
- ROI corner-stone placement
- Drag-and-drop group reclassification

!!! note
    Keyboard shortcuts are suppressed while a text field is focused, so typing in the prompt input or rename field will not accidentally trigger an undo.

### Mask labelling

Masks are automatically labelled when created:

- **Corner markers** receive labels A, B, C, D (always the first four alphabetical slots).
- **Boss stones** receive labels E, F, G, … continuing after the corners.
- **All other feature types** (ribs, etc.) receive sequential numeric labels: `rib #1`, `rib #2`, …

The short suffix letter or number is shown on the canvas overlay (e.g. `E` rather than `boss stone E`) to keep the image uncluttered.

---

## What to check before moving on

- The ROI tightly encloses the vault bay, with all four corner markers (A–D) visible and correctly positioned.
- Rib masks cover the main rib surfaces without large gaps or excessive spill onto adjacent masonry.
- Boss stones are marked clearly at the main rib intersections.
- No major masks are missing or obviously wrong.
- Saving happens automatically after every segmentation run and every manual edit; click **Continue to Step 4** to proceed.

## Expected result

A set of saved segmentation masks — ribs, boss stones, and corner markers — ready for the 2D geometry analysis in Step 4.
