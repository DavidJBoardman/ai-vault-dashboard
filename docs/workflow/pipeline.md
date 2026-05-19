# Before You Start

Vault Analyser is organised as an 8-step workflow. Each page in this section explains what the step is for, what to click, and what to check before moving on.

## Workflow sequence

1. Upload an `E57` scan
2. Generate a 2D projection
3. Create segmentation masks
4. Build the 2D bay interpretation
5. Reproject results into 3D
6. Confirm rib traces
7. Calculate measurements
8. Review the final analysis

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` / `Cmd+S` | Save the current project |
| `Ctrl+Z` / `Cmd+Z` | Undo last segmentation change (Step 3) |
| `Ctrl+Y` / `Cmd+Shift+Z` | Redo last undone change (Step 3) |

## How to work effectively

- Work through the steps in order. Most later stages depend on files produced earlier.
- Save at the end of each step, especially after segmentation and geometry edits. Use `Ctrl+S` (Windows/Linux) or `Cmd+S` (Mac) at any point to save quickly without reaching for the toolbar.
- Use a fast exploratory pass first, then return for a cleaner final pass once you know the scan quality and vault layout.
- If a later result looks wrong, go back to the earliest upstream step that could have caused it. In most cases that means projection, segmentation, or ROI placement.

## Typical successful run

For most projects, a good first pass looks like this:

1. Load the scan and confirm it is oriented correctly.
2. Create a bottom-up projection with enough detail to see ribs and bosses.
3. Segment ribs and bosses cleanly.
4. Place the ROI carefully and review the automatically prepared nodes.
5. Reconstruct the bay plan and correct any wrong edges.
6. Check the 3D reprojection before trusting trace or measurement results.

## Main outputs you will create

- One or more projection images
- Saved segmentation masks and groups
- A reviewed Step 4 bay plan
- 3D rib traces
- Measurement tables and exported summaries
