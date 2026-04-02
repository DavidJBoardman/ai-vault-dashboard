# Step 4: 2D Geometry Analysis

## Purpose

This step performs the main two-dimensional geometric interpretation of the segmented vault data. It takes the projection image and segmentation masks produced in Steps 2–3 and works towards a **bay-plan** — the network of intrados lines (rib centre-lines) that defines the vault's planimetric design.

Medieval vault plans were conceived as intersecting patterns of ribs, laid out through iterative geometrical operations on a rectangular bay.[^1] Vault Analyser replicates this logic computationally: it establishes the bay rectangle, locates the bosses (rib junctions), tests which geometric template best explains their positions, and reconstructs the rib network.

[^1]: For background on medieval vault-plan geometry see [Plans — Tracing the Past](https://www.tracingthepast.org.uk/2021/04/07/designing_plans/).

## Sub-stages

2D Geometry Analysis is consisted of four sequential sub-stages, labelled **4A–4D** in the interface:

| Sub-stage | Name | Key action |
|-----------|------|------------|
| **4A** | [ROI and Bay Proportion](roi-and-bay-proportion.md) | Define the analysis region and compute the bay's aspect ratio |
| **4B** | [Reference Points](reference-points.md) | Review and adjust the boss and corner nodes used by later stages |
| **4C** | [Cut-Typology Matching](cut-typology-matching.md) | Score each boss against starcut and circlecut templates to identify the best-fit design typology |
| **4D** | [Bay-Plan Reconstruction](bay-plan-reconstruction.md) | Infer the rib network as a graph of nodes and edges |

Each sub-stage persists its results before the next can run, so the data flow is strictly sequential: **ROI → nodes → matching → reconstruction**.

## Interface layout

![Step 4 Interface Layout](../../images/step-4/step4_interface_layout.png){ width="800" .center }


## Key concepts

**ROI (Region of Interest)**
:   A rotatable rectangle that isolates one vault bay on the projection image. All subsequent geometry is calculated in a normalised **unit-square** coordinate system (u, v) mapped from this rectangle.

**Boss**
:   A raised keystone or junction where ribs meet. Bosses are detected automatically from the segmentation masks and represented as point nodes at their centroids.

**Cut typology**
:   The family of geometric templates — starcuts, inner circlecuts, and outer circlecuts — used to explain the positions of bosses within the bay. The term *cut* refers to the fractional divisions produced by each template's construction lines.

**Bay plan**
:   The final graph of nodes (bosses and bay corners) connected by edges (ribs), representing the vault's two-dimensional rib pattern.

<!-- ## Why this step matters

This is the most interpretation-heavy part of the workflow. The bay-plan reconstruction produced here feeds directly into Step 5 (3D reprojection) and all downstream measurement and analysis steps. An accurate bay plan is essential for reliable three-dimensional rib geometry. -->

## Expected result

<!-- Before moving on to Step 5 you should have: -->

- a saved ROI analysis with vault-ratio metadata
- a reviewed and saved set of reference points (bosses and corners)
- a completed cut-typology matching result with a credible best-fit template
- a reconstructed bay-plan graph that faithfully represents the visible rib pattern
