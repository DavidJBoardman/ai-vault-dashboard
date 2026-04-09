# Step 3: Segmentation

## Purpose

Identify and label architectural features — ribs, bosses, and other elements — on the projection image so that later stages have clean binary masks to work with.

## How segmentation works

The application uses the **Segment Anything Model (SAM)** to generate feature masks from user-supplied prompts.[^1] You describe *where* a feature is (using a polygon, bounding box, or point), and the model returns a pixel-level mask for that region. You do not need to trace every pixel manually — the model generalises from the prompt geometry.

[^1]: SAM uses a prompt-driven approach to instance segmentation that generalises across object types without retraining; see Kirillov et al., "Segment Anything", ICCV 2023, [arXiv:2304.02643](https://arxiv.org/abs/2304.02643).

## Workflow

### 1. Select the projection image

Choose the projection generated in Step 2. The image is displayed on the segmentation canvas.

### 2. Define a feature class

Before drawing a prompt, select or create a **feature class** (e.g. *Rib*, *Boss Stone*, *Web*). Each mask you create is associated with a class; the class label determines how the mask is used in later stages.

For rib-geometry analysis you need at minimum:

- a **Rib** class covering the visible rib surfaces
- a **Boss Stone** class covering the boss keystones

### 3. Draw a prompt

Use one of the prompt tools to indicate the target feature:

| Tool | How to use |
|------|-----------|
| **Polygon prompt** | Click to place vertices around or along the feature; double-click to close |
| **Bounding box prompt** | Drag a rectangle enclosing the feature |
| **ROI** | Define a broad region to constrain the model's attention |

After drawing, the model processes the prompt and returns a candidate mask. Review it in the canvas overlay.

### 4. Accept, adjust, or retry

- If the mask correctly captures the feature, **accept** it.
- If the mask is too large, too small, or incorrectly shaped, adjust the prompt geometry and re-run, or use the mask editing tools to correct the boundary.
- Repeat for each feature instance or class.

### 5. Manage visibility and save

Use the **Overlays** panel to toggle individual masks on and off. When satisfied, **save** the segmentation state. Step 4 reads the saved masks, so you must save before continuing.

## Interface controls

| Control | What it does |
|---------|-------------|
| Feature class selector | Sets which class the next mask will be assigned to |
| Polygon / box / ROI tools | Draw prompts on the canvas |
| Mask visibility toggles | Show or hide individual or grouped masks |
| Save button | Persists the segmentation state for downstream steps |
| Reset button | Clears unsaved changes for the current session |

## Tips

- **Ribs**: Trace along several representative sections of a rib rather than prompting the whole vault at once. The model produces more accurate masks from focused prompts.
- **Bosses**: A tight bounding box around each boss typically works well. If bosses are closely spaced, prompt them individually.
- **Occlusions**: If parts of a rib are hidden by later stonework, prompt only the visible sections and accept an incomplete mask — the geometry stages can tolerate gaps.

## What to check before moving on

- A rib mask that covers the main rib network without large gaps or excessive noise.
- A boss mask (or per-boss masks) that captures the keystones clearly.
- The saved segmentation state is confirmed in the status bar.

## Expected result

Saved segmentation masks for the features needed in Step 4, ready for geometric interpretation.
