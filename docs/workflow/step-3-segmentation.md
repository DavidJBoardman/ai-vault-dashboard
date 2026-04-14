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

1. Select the **ROI** tool from the four-tool row (or it is selected by default when the page opens).
2. Click and drag on the projection image to draw the rectangle.
3. Refine the position and size:
   - **Drag the interior** to move the whole rectangle.
   - **Drag a corner or edge handle** to resize.
   - **Drag the rotation handle** (arc above the top edge) to rotate the rectangle to align with the bay.

The ROI panel (visible when the ROI tool is active) shows the current size as a percentage of the image and the rotation angle. If masks are already present, it also shows how many fall inside versus outside the boundary.

!!! tip
    Rotate the ROI to match the axis of the bay rather than forcing a straight rectangle onto a skewed scan. Even a few degrees of correction can significantly improve the quality of the geometry analysis in Step 4.

### Confirming the ROI

Once you are satisfied with the boundary:

1. In the ROI panel, click **Confirm ROI & Set Corners A–D**.
2. Four gold dot markers labelled **A**, **B**, **C**, **D** (top-left, top-right, bottom-right, bottom-left) are placed at the exact corner positions as mask entries.
3. The ROI status pill changes to **✓ ROI** and the segmentation tools become active.

If you need to adjust the boundary after confirming, switch back to the ROI tool and redraw. The confirmation is cleared automatically when the rectangle is moved or resized, and must be re-confirmed before segmenting.

### Removing masks outside the ROI

After segmenting, you can remove any masks that fall outside the bay boundary:

- In the ROI panel (with the ROI tool active), click **Remove N Outside ROI** if the button is visible.
- The backend classifies every mask by pixel overlap rather than just bounding-box centre, so masks that touch the ROI edge are retained.
- This operation permanently deletes the outside masks from the project file. Review the list before proceeding.

---

## Stage 2 — Segmenting features

### Choosing what to segment

For rib-geometry analysis you need at minimum:

- **Rib** masks covering the visible rib surfaces.
- **Boss stone** masks for the boss keystones at rib intersections.

The corner markers A–D are placed automatically during ROI confirmation; you do not need to draw them separately.

### Segmentation tools

Four tools are available in the tool row below the SAM button. Switch between them with a single click.

| Tool | Icon | Use for |
|------|------|---------|
| **Polygon** | Hexagon | Drawing closed outlines around features for guided segmentation |
| **Box** | Scan | Drawing bounding boxes as positive or negative prompts |
| **ROI** | Square | Adjusting the vault bay boundary (Stage 1) |
| **Eraser** | Eraser | Removing unwanted portions of an existing mask |

The Polygon, Box, and Eraser tools are disabled until the ROI is confirmed.

### Text prompts

Text prompts tell SAM what kind of feature you are looking for before running segmentation. They act as a semantic guide in addition to the spatial prompt.

**Quick presets** — click any of the preset buttons to add it as a text prompt:

| Preset | Use for |
|--------|---------|
| `rib` | Main rib ribs |
| `boss stone` | Keystone bosses at rib junctions |
| `corner` | Corner keystones |
| `keystone` | Generic keystone elements |
| `intrados` | Vault soffit surface |
| `tiercerons` | Secondary ribs from springer to ridge |
| `lierne` | Short linking ribs between main ribs |
| `vault cell` | The cells of webbing between ribs |

**Custom prompts** — type into the custom prompt field and press **Enter** or click **+** to add terms not covered by the presets.

Active prompts appear as tags below the input. Click **×** on a tag to remove it.

!!! note
    When using the **Box** or **Polygon** tools to run segmentation, only the name assigned to that box or polygon is used as the text prompt — not the active text prompt list. This allows you to run multiple targeted segmentations in one pass without changing the global prompt list.

### Running SAM segmentation

With at least one text prompt set:

1. Click **Run SAM Segmentation**.
2. The model processes the full image using the active text prompts and returns masks for all detected instances.
3. New masks are merged into the existing set — see [Duplicate handling](#duplicate-handling) below.
4. Any masks outside the ROI are automatically removed after each run.

### Box prompts (Find Similar)

Use box prompts to point the model at specific instances:

1. Select the **Box** tool.
2. Drag a rectangle around the target feature on the canvas. A dialog appears asking for a name (e.g. `rib`, `boss stone`).
3. Use the **+/−** toggle on a drawn box to mark it as a positive prompt (include) or negative prompt (exclude). Negative prompts tell the model what to avoid.
4. Add as many boxes as you need across the image.
5. Click **Find Similar** to run segmentation using all drawn boxes simultaneously.

The box name becomes the class label for all masks produced by that prompt. This is the most reliable way to segment many instances of the same feature type in one pass.

!!! tip
    Draw one clear positive box on the best visible example of the feature, plus one or two negative boxes on areas you want the model to avoid (e.g. a shadow or an adjacent feature of a similar shape). This combination usually produces much cleaner results than a positive prompt alone.

### Polygon prompts (Find in Polygons)

Polygon prompts let you restrict the model's search to irregular regions of the image:

1. Select the **Polygon** tool.
2. Click to place vertices around the region of interest. Click an existing vertex to remove it.
3. The polygon closes and is saved when you click **Save** (or press **Enter**); press **Escape** to cancel the current polygon.
4. Name the polygon when prompted (e.g. `rib`).
5. Click **Find in Polygons** to run segmentation constrained to the drawn polygon regions.

Multiple polygons can be drawn before running segmentation.

### Eraser tool

Use the eraser to remove portions of an existing mask without deleting it entirely:

1. Select the **Eraser** tool.
2. In the eraser panel, set the **Brush size** using the slider.
3. Select the mask you want to edit from the mask list in the panel.
4. Paint over the canvas. The erased areas are removed from the selected mask in real time.

Only visible masks appear in the eraser's selection list.

---

## Duplicate handling

Each time new masks are returned from SAM, they are merged with the existing masks using these rules:

- **IoU threshold of 0.35.** If a new mask overlaps an existing mask by more than 35% of their combined area, they are considered duplicates.
- **Quality replacement.** If the new mask has a higher predicted IoU quality score than the existing one, the existing mask is replaced. If the new mask is lower quality, it is discarded.
- **No false duplicates.** Masks that only partially overlap (below the threshold) are kept as separate instances.

This means repeated segmentation runs progressively improve mask quality rather than accumulating junk.

---

## Mask management

### Overlay controls

At the top of the image panel:

- **Opacity slider** — adjusts how strongly the coloured masks are blended over the projection image. Drag left to see through the masks to the imagery beneath, or right for full coverage.
- **Labels toggle** — shows or hides the short label identifier on each mask in the canvas overlay. Labels are shown automatically after the ROI is confirmed.

### Segments panel

Below the tool card, all current masks are listed grouped by feature type. Within each group:

- **Show/hide group** — the group header checkbox toggles all masks in the group at once.
- **Show/hide individual mask** — the checkbox next to each mask entry.
- **Rename mask** — double-click the label, or click the pencil icon to edit the name inline. Press Enter to save or Escape to cancel.
- **Delete mask** — click the trash icon next to the mask.
- **Delete whole group** — click the trash icon on the group header.
- **Reorder** — drag masks within the list using the grip handle on the left.

### Mask labelling

Masks are automatically labelled when they are created:

- **Corner markers** receive labels A, B, C, D (always the first four alphabetical slots).
- **Boss stones** receive labels E, F, G, … continuing after the corners.
- **All other feature types** (ribs, etc.) receive sequential numeric labels: `rib #1`, `rib #2`, …

The short suffix letter or number is shown on the canvas overlay (e.g. `E` rather than `boss stone E`) to keep the image uncluttered.

---

## What to check before moving on

- The ROI tightly encloses the vault bay, with all four corner markers (A–D) visible.
- Rib masks cover the main rib surfaces without large gaps or excessive spill onto adjacent masonry.
- Boss stones are marked clearly at the main rib intersections.
- No major masks are missing or obviously wrong.
- The segmentation has been saved (click **Continue to Step 4** to save and proceed).

## Expected result

A set of saved segmentation masks — ribs, boss stones, and corner markers — ready for the 2D geometry analysis in Step 4.
