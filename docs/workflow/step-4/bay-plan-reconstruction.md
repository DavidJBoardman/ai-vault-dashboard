# Step 4D: Bay-Plan Reconstruction

## Purpose

This final Step 4 sub-stage reconstructs the **bay plan** from the ROI, reference points, matching results, and segmentation masks. The checked nodes and reconstructed plan can also be exported as a `DXF` drawing for CAD and downstream documentation workflows.

## Workflow

![Bay-Plan Reconstruction: workflow stepper (Bay-Plan active); left panel with reconstruction settings and score breakdown; canvas showing the reconstructed node-and-edge graph over the projection image.](../../images/step-4/step4d-bay-plan.png){ width="800" .center }

### 1. Review the reconstruction settings

Start with the default settings. Tune the advanced parameters below only if the defaults do not produce satisfactory results. 

| Parameter | Description |
|-----------|-------------|
| Reconstruction mode | **Evidence-guided graph** (default) or **Delaunay** |
| Angle tolerance | Minimum angular separation between candidate directions per node (evidence-guided mode) |
| Candidate min score | Rib-mask overlap threshold for accepting a candidate edge (evidence-guided mode) |
| Candidate max distance | Maximum (u, v) distance between nodes for a candidate edge |
| Corridor width | Pixel width of the rib-mask overlap corridor |
| Min / max node degree | Degree bounds for the graph-selection and repair passes |
| Boundary tolerance | (u, v) margin for classifying a node as lying on the ROI boundary |
| Enforce planarity | Whether to reject edges that would cross existing selected edges |
| Use ROI boundary (Delaunay) | When in Delaunay mode, include the four ROI edges as Steiner constraints |
| Use cross axes (Delaunay) | Add the two ROI diagonals as Steiner constraints |
| Use half lines (Delaunay) | Add the four ROI half-axes (bisectors) as Steiner constraints |

The internal candidate-generation routine for evidence-guided mode is `angular_nearest` (you'll see this label in raw diagnostics); see [Appendix B](../../appendix/bay-plan-algorithm.md) for the full algorithm.

### 2. Run reconstruction

The backend loads the **measured** boss positions saved by sub-stage 4B (the raw segmented locations, not the idealised template positions from 4C) along with the grouped rib-segmentation mask. The idealised template positions from 4C are kept alongside as a parallel view but are not used for graph scoring. They're scored against the rib mask, which lives in measured-image space. The reconstruction then:

1. **Generates candidate edges:** for each node, finds nearby neighbours in distinct directions and scores each edge by rib-mask overlap.[^1] An alternative Delaunay mode is available when mask evidence is weak.[^2]
2. **Selects the final graph:** adds boundary edges first, then greedily adds candidates in score order (subject to degree limits and optional planarity), and repairs any under-connected nodes.
3. **Scores the result** on four weighted components:

| Component | Weight | Description |
|-----------|--------|-------------|
| Edge evidence | 55 % | Mean rib-mask overlap score of non-boundary edges |
| Boundary coverage | 20 % | Proportion of mandatory boundary edges present |
| Degree satisfaction | 15 % | Proportion of nodes within the degree bounds |
| Mutual support | 10 % | Proportion of edges confirmed in both directions |

### 3. Inspect and edit

- Compare the graph against the underlying projection and masks using the layer toggles.
- Use the **Measured / Idealised** view toggle at the top of the panel to switch the rendered node positions:
    - **Measured** (default): bosses sit at their segmented positions in the projection image. This is the graph the reconstruction algorithm was scored against.
    - **Idealised**: bosses snap to the nearest cut-line ratios of the template variant matched in Step 4C. Bosses that 4C could not match remain at their measured position in both views. The toggle is disabled when no 4C matches exist.
- Add missing edges or remove wrong ones manually. Manual edits are saved alongside the computed graph.

If the graph has obvious errors, try the following before editing manually:

- Lower **candidate min score** to recover missing edges in areas with weak rib-mask evidence.
- Raise **max node degree** if key junctions are losing edges.
- Lower **candidate max distance** if the graph connects nodes across the bay that should not be linked.
- Switch **reconstruction mode** to **Delaunay** for comparison. If it produces a cleaner graph, the rib-mask evidence may be too noisy for the evidence-guided pass.

### Inspect-mode hover popup

Switch the canvas tool to **Inspect** (top-right canvas toolbar) and hover a labelled boss. The popup shows the Step 4C match result for that boss:

- **Cut typology:** the matched axis cuts (e.g., `starcut_n=3 × starcut_n=2`).
- **Errors:** how far each axis was from the nearest cut-line ratio, as a percentage.
- **Match status:** `matched` (both axes within tolerance), `partial (x only)` / `partial (y only)` (one axis hit, the other did not), or `no match`.

Partial-match bosses are rendered in **amber** on the canvas to distinguish them from full matches (template colour) and unmatched bosses (default colour). In **Idealised** view they snap on the hit axis only and keep their measured coordinate on the missed axis.

Use this to find bosses where 4C struggled before deciding whether to re-run matching or move on.

### Idealised overlay

Tick **Show idealised overlay** in the bay-plan panel to paint the *other* view as a faded comparison alongside the active one:

- In Measured view, the overlay renders the idealised graph in violet dashed lines.
- In Idealised view, the overlay renders the measured graph in orange dashed lines.
- Magenta dashed snap lines connect each measured boss to its idealised counterpart, making per-boss residuals readable at a glance.

The overlay is disabled until at least one boss has an idealised position from Step 4C.

### 4. Export the plan as DXF

Once the graph has been reviewed, use the `DXF` export to save the reconstructed bay plan. The export emits four CAD layers so both views are available downstream:

- `BAY_RIBS_MEASURED` and `BAY_NODES_MEASURED`,the measured (segmented) graph used for scoring.
- `BAY_RIBS_IDEAL` and `BAY_NODES_IDEAL`, the idealised view derived from Step 4C. Bosses without a 4C match are omitted from these layers.

The final node set (including saved manual corrections) and the reconstructed plan edges that define the 2D rib layout are written into both layer groups.

Use this file when you need a CAD-readable record of the Step 4 result before continuing to the 3D reprojection stages.

[^1]: Related reference: Steger, C., "An Unbiased Detector of Curvilinear Structures", *IEEE Transactions on Pattern Analysis and Machine Intelligence* 20(2), 1998, 113–125.

[^2]: Related reference: Shewchuk, J.R., "Triangle: Engineering a 2D Quality Mesh Generator and Delaunay Triangulator", *Applied Computational Geometry*, Springer, 1996, 203–222.

## Why it matters

The bay plan is the main 2D output: Step 5 reprojects it into three-dimensional space. Errors here, such as missing ribs, false connections, misplaced nodes, propagate into all downstream 3D geometry.

## Before moving on

Before leaving Step 4 you should have:

- a bay plan whose edges match the visible rib pattern
- any necessary manual corrections applied
- a `DXF` export of the nodes and reconstructed plan if an external CAD record is needed
- a saved result ready for Step 5
