# Step 3: Segmentation

## Purpose

Identify and label architectural features on the projection image so later stages can work from clean masks instead of raw imagery.

## How segmentation works

The application uses **SAM 3** to turn user prompts into feature masks.[^1] In practice, you show the model where a rib, boss, or other region is by drawing prompts on the image, then review and keep only the masks that are useful.

[^1]: SAM 3 extends the prompt-driven segmentation framework with concept-level understanding, enabling the model to associate masks with semantic categories without task-specific retraining; see Carion et al., "SAM 3: Segment Anything with Concepts", [arXiv:2511.16719](https://arxiv.org/abs/2511.16719), 2025.

## Workflow

### 1. Select the projection image

Choose the projection generated in Step 2. The image is displayed on the segmentation canvas.

### 2. Define the masks you need

Before drawing prompts, decide which feature groups you need. For most geometry work that means ribs and bosses first.

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

- If the mask correctly captures the feature, keep it.
- If the mask is too large, too small, or noisy, adjust the prompt and run again.
- Repeat for each feature instance or class.

### 5. Manage visibility and save

Use the overlay controls to toggle masks on and off. Save the segmentation state before leaving this step.

## Interface controls

| Control | What it does |
|---------|-------------|
| Feature class selector | Sets which class the next mask will be assigned to |
| Polygon / box / ROI tools | Draw prompts on the canvas |
| Mask visibility toggles | Show or hide individual or grouped masks |
| Save button | Persists the segmentation state for downstream steps |
| Reset button | Clears unsaved changes for the current session |

## Tips

- **Ribs**: several focused prompts usually work better than one very broad prompt.
- **Bosses**: a tight box or polygon is often enough.
- **Occlusions**: keep the visible evidence clean rather than forcing a speculative mask through missing areas.

## What to check before moving on

- Rib masks cover the main rib surfaces without too much spill onto adjacent masonry.
- Bosses are marked clearly enough for later geometry steps.
- The segmentation state has been saved.

## Expected result

Saved segmentation masks for the features needed in Step 4.
