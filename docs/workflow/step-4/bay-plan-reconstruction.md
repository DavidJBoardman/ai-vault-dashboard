# Step 4D: Bay-Plan Reconstruction

## Purpose

This final Step 4 sub-stage reconstructs the **bay plan** from the ROI, reference points, matching results, and segmentation masks. The bay plan is the main 2D output that later gets reprojected into 3D.

## What the application does

Reconstruction proceeds through a multi-phase pipeline:

### 1. Load reference rows

The backend loads the saved node points from sub-stage 4B. Where a boss was successfully matched in sub-stage 4C, its **ideal** template position is used in preference to the raw centroid. Corner anchors are always included.

### 2. Load the rib mask

A grouped rib-segmentation mask is loaded from the project's segmentation data. This mask acts as evidence for whether a proposed edge actually follows visible rib material.

### 3. Generate candidate edges

Two reconstruction modes are available:

**Angular-nearest candidates** (default)
:   For each node, the algorithm looks for nearby neighbours in distinct directions. Each possible edge is then scored by how well a narrow corridor between the two nodes overlaps the rib mask.[^1]

**Delaunay comparison**
:   An alternative mode that builds a constrained Delaunay-style graph from the same node set.[^2] This is useful as a comparison view or when rib-mask evidence is weak.

Both methods can contribute to the final candidate set, and the app also preserves key boundary connections.

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

- Run the reconstruction and inspect the resulting graph on the canvas.
- If the graph is too dense or too sparse, adjust the settings and run again.
- Use the layer toggles to compare the graph against the underlying projection and masks.
- Add missing edges or remove wrong ones manually before you continue.

[^1]: Related reference: Steger, C., "An Unbiased Detector of Curvilinear Structures", *IEEE Transactions on Pattern Analysis and Machine Intelligence* 20(2), 1998, 113–125.

[^2]: Related reference: Shewchuk, J.R., "Triangle: Engineering a 2D Quality Mesh Generator and Delaunay Triangulator", *Applied Computational Geometry*, Springer, 1996, 203–222.

## Why it matters

The bay plan is the most significant output of the entire 2D analysis. It encodes the vault's rib network as a computationally tractable graph that Step 5 reprojects into three-dimensional space. Errors in the bay plan — missing ribs, false connections, or misplaced nodes — will propagate into the 3D geometry and affect all subsequent measurements.

## Expected result

Before leaving Step 4 you should have:

- a bay plan whose edges match the visible rib pattern
- any necessary manual corrections applied
- a saved result ready for Step 5
