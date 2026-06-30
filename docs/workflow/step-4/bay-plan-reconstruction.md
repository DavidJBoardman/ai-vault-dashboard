# Step 4D: Bay-Plan Reconstruction

## Purpose

This final Step 4 sub-stage reconstructs the **bay plan** from the ROI, reference points, matching results, and segmentation masks. The bay plan is the main 2D output: Step 5 reprojects it into three dimensions, so errors here (missing ribs, false connections, misplaced nodes) carry through to all downstream 3D geometry. The reviewed nodes and plan can also be exported as a `DXF` drawing for CAD and documentation.

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

### 2. Run reconstruction

Click **Run reconstruction**. The app proposes edges between nearby bosses, scores each by how well it overlaps the rib mask,[^1] then keeps the best set while honouring the degree limits and closing the bay boundary. An alternative **Delaunay** mode is available when the rib evidence is weak.[^2] The result is scored out of 100 on rib-mask evidence, boundary coverage, degree satisfaction, and mutual support.

Scoring runs on the **measured** boss positions saved in 4B (the raw segmented locations), because the rib mask lives in measured image space. The idealised positions from 4C ride alongside as a parallel view but are never scored.

!!! info "How it works"
    For candidate generation, the selection passes, and the exact score weights, see [Appendix B](../../appendix/bay-plan-algorithm.md).

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

Switch the canvas tool to **Inspect** (top right of the canvas toolbar) and hover a labelled boss to see its Step 4C match: the matched cuts (e.g. `starcut_n=3 × starcut_n=2`), how far each axis sat from the nearest cut line as a percentage, and the match status (`matched`, `partial`, or `no match`).

Partial-match bosses are drawn in **amber** to set them apart from full matches (template colour) and unmatched bosses (default colour). Use this to find bosses where 4C struggled before deciding whether to run matching again or move on.

### Idealised overlay

Tick **Show idealised overlay** in the bay-plan panel to paint the *other* view as a faded comparison alongside the active one:

- In Measured view, the overlay renders the idealised graph in violet dashed lines.
- In Idealised view, the overlay renders the measured graph in orange dashed lines.
- Magenta dashed snap lines connect each measured boss to its idealised counterpart, making per-boss residuals readable at a glance.

The overlay is disabled until at least one boss has an idealised position from Step 4C.

### 4. Export the plan as DXF

Once the graph has been reviewed, use the `DXF` export to save the reconstructed bay plan as a CAD-readable record. It emits four layers so both views are available downstream, including any manual corrections:

- `BAY_RIBS_MEASURED` and `BAY_NODES_MEASURED`: the measured (segmented) graph used for scoring.
- `BAY_RIBS_IDEAL` and `BAY_NODES_IDEAL`: the idealised view from Step 4C. Bosses without a 4C match are left out of these layers.

[^1]: Related reference: Steger, C., "An Unbiased Detector of Curvilinear Structures", *IEEE Transactions on Pattern Analysis and Machine Intelligence* 20(2), 1998, 113–125.

[^2]: Related reference: Shewchuk, J.R., "Triangle: Engineering a 2D Quality Mesh Generator and Delaunay Triangulator", *Applied Computational Geometry*, Springer, 1996, 203–222.

## Before moving on

Before leaving Step 4 you should have:

- a bay plan whose edges match the visible rib pattern
- any necessary manual corrections applied
- a `DXF` export of the nodes and reconstructed plan if an external CAD record is needed
- a saved result ready for Step 5

If you later change the ROI (4A), the reference points (4B), or the matching result (4C) and save them again, this reconstruction is marked **Update needed** in the workflow stepper. A reconstruction saved before this tracking existed is marked the same way, so run it once to set a baseline. Run reconstruction again to pick up the change, or **Dismiss** the note if it does not affect the result (see [Sub-stage dependencies and staleness](index.md#sub-stage-dependencies-and-staleness)).
