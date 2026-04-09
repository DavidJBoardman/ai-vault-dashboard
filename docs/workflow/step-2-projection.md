# Step 2: Generate Projection

## Purpose

Convert the loaded 3D scan into a 2D orthographic image that exposes the vault surface for segmentation and geometry work.

## How projection works

Points are accumulated onto the image plane using a **1D Gaussian splat**: each 3D point contributes intensity to its projected pixel weighted by a Gaussian function of its distance from the projection focal plane along the view axis.[^1] Summing these weighted contributions across all points produces a smooth density image that fills small gaps between neighbouring points and reduces aliasing, giving clearer rib definition than a simple point-drop or max-depth render.

[^1]: Gaussian splatting accumulates point contributions via a kernel function rather than hard per-pixel binning; the foundational formulation is given in Westover, L.A., "Footprint Evaluation for Volume Rendering", *ACM SIGGRAPH Computer Graphics* 24(4), 1990, 245–252.

## Choosing a perspective

Vault Analyser supports multiple orthographic viewpoints. The choice depends on which surface you are analysing:

| Perspective | Use when |
|-------------|----------|
| **Bottom (intrados)** | Analysing the underside of the vault — the usual starting point for rib geometry |
| **Top (extrados)** | Analysing the vault's upper surface |
| **North / South / East / West** | Analysing a particular elevation or section if the vault is not viewed from directly below |

For most vault-rib analysis, start with the **Bottom** projection.

## What you do here

1. Select a projection perspective from the controls.
2. Set the resolution. A higher resolution gives more detail but takes longer to generate and produces a larger file. For initial exploration, a moderate resolution is sufficient; for final analysis, use the highest resolution your hardware can handle in reasonable time.
3. Click **Generate Projection** and wait for the image to appear in the preview panel.
4. Inspect the result — ribs, bosses, and bay boundaries should be clearly distinguishable.
5. If the projection is unclear (e.g., obscured by structural elements above or below), try adjusting the depth range or switching perspective.
6. Repeat for any additional projections you need (e.g., both bottom and a cardinal direction for a complex vault).

## Interface controls

| Control | What it does |
|---------|-------------|
| Perspective selector | Chooses the projection axis (bottom, top, north, south, east, west) |
| Resolution / scale | Sets image pixel density relative to the scan's physical dimensions |
| Generate button | Triggers the projection computation |
| Preview panel | Displays the resulting 2D image |

## What to check before moving on

- Ribs are visible as distinct lines or ridges against the vault surface.
- Boss positions (rib junctions) are identifiable.
- The bay boundary is recognisable.
- There is no obvious clipping or distortion that would misrepresent the geometry.

## Expected result

At least one usable 2D projection saved and ready for segmentation in Step 3.
