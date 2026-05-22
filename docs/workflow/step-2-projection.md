# Step 2: Generate Projection

## Purpose

Convert the loaded 3D scan into a 2D orthographic image that exposes the vault surface for segmentation and geometry work.

## How projection works

Points are accumulated onto the image plane using a **1D Gaussian splat**: each 3D point contributes intensity to its projected pixel weighted by a Gaussian function of its distance from the projection focal plane along the view axis.[^1] Summing these weighted contributions across all points produces a smooth density image that fills small gaps between neighbouring points and reduces aliasing, giving clearer rib definition than a simple point-drop or max-depth render.

[^1]: Gaussian splatting accumulates point contributions via a kernel function rather than hard per-pixel binning; the foundational formulation is given in Westover, L.A., "Footprint Evaluation for Volume Rendering", *ACM SIGGRAPH Computer Graphics* 24(4), 1990, 245–252.

## What happens automatically

When you arrive at Step 2, the application immediately generates a projection using the default settings (Bottom Up, standard resolution). The result appears in the preview panel within a few seconds.

A confirmation prompt is shown once the image is ready:

> **Does this projection look OK?**
> - **Yes, continue** — accepts the projection and advances to Step 3.
> - **Generate a different one** — opens the settings panel so you can change the perspective, resolution, or Gaussian spread and regenerate.

For most vaults, the default bottom-up projection is the correct starting point and you can proceed directly.

## Choosing a perspective

Vault Analyser supports multiple orthographic viewpoints. The choice depends on which surface you are analysing:

| Perspective | Use when |
|-------------|----------|
| **Bottom (intrados)** | Analysing the underside of the vault — the usual starting point for rib geometry |
| **Top (extrados)** | Analysing the vault's upper surface |
| **North / South / East / West** | Analysing a particular elevation or section if the vault is not viewed from directly below |

For most rib analysis, the **Bottom Up** projection (selected by default) is the correct choice.

## Regenerating with different settings

If the default projection is not clear enough — ribs are faint, the image is blurred, or the viewpoint is wrong:

1. Click **Generate a different one** (or use the regenerate panel if you have already accepted a projection).
2. Adjust one or more settings:
   - **Perspective** — change the projection axis.
   - **Resolution / scale** — increase for finer detail at the cost of longer processing time.
   - **Gaussian spread (σ)** and **kernel size** — reduce spread for sharper edges on narrow ribs; increase it to fill gaps in sparse point clouds.
3. Click **Generate Projection** and wait for the preview to update.
4. Inspect the result and accept or regenerate again as needed.

## Interface controls

| Control | What it does |
|---------|-------------|
| Perspective selector | Chooses the projection axis |
| Resolution / scale | Sets image size and output detail |
| Gaussian σ / kernel | Controls how much each point spreads on the image plane |
| Generate Projection button | Triggers the projection computation |
| Preview panel | Displays the resulting 2D image |

![Step 2 — Projection interface with approval prompt](../images/step-2/step2a-projections.png){ width="800" .center }

## What to check before moving on

- The main rib pattern is visible and distinct.
- Boss stone locations can be identified.
- The image is not obviously clipped, blurred, or misleading.

## Expected result

At least one accepted projection ready for segmentation in Step 3.
