# Step 4D: Bay-Plan Reconstruction

## Purpose

This final Step 4 sub-stage reconstructs the **bay plan** — a graph of nodes (bosses and corners) connected by edges (ribs) — from the ROI, reference points, matching results, and segmentation masks. The bay plan is the primary two-dimensional output that feeds into the 3D reprojection in Step 5.

## What the application does

Reconstruction proceeds through a multi-phase pipeline:

### 1. Load reference rows

The backend loads the saved node points from sub-stage 4B. Where a boss was successfully matched in sub-stage 4C, its **ideal** template position is used in preference to the raw centroid. Corner anchors are always included.

### 2. Load the rib mask

A grouped rib-segmentation mask is loaded from the project's segmentation data. This binary mask identifies the image regions where ribs are visible and is used as physical evidence to validate candidate edges.

### 3. Generate candidate edges

Two reconstruction modes are available:

**Angular-nearest candidates** (default)
:   For each node, the algorithm identifies the nearest neighbour in each distinct angular direction (with a configurable tolerance). For every candidate edge, a pixel corridor is drawn between the two nodes and scored by its **overlap** with the rib mask — the proportion of corridor pixels that fall on visible rib material.[^1] A **third-boss penalty** discounts edges whose corridor passes close to an intermediate node (which would indicate two shorter ribs rather than one long one). Candidates passing a minimum score threshold are retained.

**Delaunay comparison**
:   An alternative mode that constructs a constrained Delaunay-style triangulation with optional constraint segments (ROI boundary, cross axes, half-lines).[^2] This provides a reference graph against which the angular-nearest results can be compared.

Both methods can be combined: the application merges candidate sets, keeping the higher-scoring edge where duplicates exist, and augments the result with **mandatory boundary edges** — adjacent pairs of nodes along each ROI side.

### 4. Select the candidate graph

A greedy global selection resolves the candidate set into a final graph:

1. **Boundary edges first** — mandatory boundary edges are added unconditionally.
2. **Greedy pass** — remaining candidates are added in descending score order, subject to a configurable maximum node degree and optional planarity enforcement (no crossing edges).
3. **Degree repair** — any node whose degree falls below the configured minimum receives additional edges from the remaining candidates.

### 5. Score the graph

The final bay plan is scored on four weighted components:

| Component | Weight | Description |
|-----------|--------|-------------|
| Edge evidence | 55 % | Mean rib-mask overlap score of non-boundary edges |
| Boundary coverage | 20 % | Proportion of mandatory boundary edges present |
| Degree satisfaction | 15 % | Proportion of nodes within the degree bounds |
| Mutual support | 10 % | Proportion of edges confirmed in both directions |

### 6. Manual edge editing

After the automatic reconstruction, you may add or remove individual edges manually. Manual edits are saved alongside the computed graph.

## Parameters

| Parameter | Description |
|-----------|-------------|
| Reconstruction mode | `angular_nearest` (default) or `delaunay` |
| Angle tolerance | Minimum angular separation between candidate directions per node |
| Candidate min score | Rib-mask overlap threshold for accepting a candidate edge |
| Candidate max distance | Maximum (u, v) distance between nodes for a candidate edge |
| Corridor width | Pixel width of the rib-mask overlap corridor |
| Min / max node degree | Degree bounds for the graph-selection and repair passes |
| Boundary tolerance | (u, v) margin for classifying a node as lying on the ROI boundary |
| Enforce planarity | Whether to reject edges that would cross existing selected edges |

## What you do here

- **Review the reconstruction parameters** — adjust if the default settings produce too many or too few edges.
- **Run the reconstruction** and inspect the resulting graph on the canvas.
- **Toggle layers** — the Reconstruction Layers panel lets you show or hide the base image, ROI, nodes, and reconstructed rib edges independently.
- **Manually correct edges** — add missing ribs or remove incorrect ones using the canvas interaction tools.
- **Copy diagnostics** — the panel provides a diagnostic summary you can copy for review or reporting.
- **Confirm the bay plan** before continuing to Step 5.

[^1]: Evaluating candidate edges by measuring pixel-level feature coverage along a narrow image corridor is a standard heuristic in evidence-based geometric graph construction; a related formulation is described in Steger, C., "An Unbiased Detector of Curvilinear Structures", *IEEE Transactions on Pattern Analysis and Machine Intelligence* 20(2), 1998, 113–125.

[^2]: Constrained Delaunay triangulation guarantees that specified edges appear in the triangulation regardless of the Delaunay criterion, providing a geometrically well-defined reference graph for irregular point sets; see Shewchuk, J.R., "Triangle: Engineering a 2D Quality Mesh Generator and Delaunay Triangulator", *Applied Computational Geometry*, Springer, 1996, 203–222.

## Why it matters

The bay plan is the most significant output of the entire 2D analysis. It encodes the vault's rib network as a computationally tractable graph that Step 5 reprojects into three-dimensional space. Errors in the bay plan — missing ribs, false connections, or misplaced nodes — will propagate into the 3D geometry and affect all subsequent measurements.

## Expected result

Before leaving Step 4 you should have:

- a reconstructed bay-plan graph whose edges match the visible rib pattern
- an overall reconstruction score that reflects strong edge evidence and complete boundary coverage
- any necessary manual corrections applied and saved
- a bay plan that is ready to be reprojected into 3D in Step 5
