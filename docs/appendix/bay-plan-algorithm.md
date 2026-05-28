# Appendix B: Bay-Plan Reconstruction Algorithm

This appendix documents the algorithm behind [Step 4D, Bay-Plan Reconstruction](../workflow/step-4/bay-plan-reconstruction.md). The reference implementation lives in `backend/services/geometry2d/bay_plan_candidate_service.py`, with the geometry/scoring kernels in `backend/services/geometry2d/utils/bay_candidate_cv.py`.

## Inputs

- **Reference points:** measured boss positions from Step 4B and the four ROI corner anchors.
- **Grouped rib mask:** a binary image with the rib pixels grouped by Step 3 segmentation (`segmentations/grouped_rib.png`).
- **ROI parameters:** used to convert image-space pixel distances to and from normalised `(u, v)`.
- **Parameters:** `angleToleranceDeg`, `candidateMinScore`, `candidateMaxDistanceUv`, `corridorWidthPx`, `minNodeDegree`, `maxNodeDegree`, `boundaryToleranceUv`, `enforcePlanarity`, and the `reconstructionMode` switch.

The 4C *idealised* positions are loaded alongside the measured ones but are **not** used for graph scoring. They live in unit-space, whereas the rib-mask evidence lives in measured image space. Idealised positions ride along on the output payload so the canvas can render them under the **Idealised** view toggle and the DXF export can emit the second layer group.

## Mode 1: Evidence-guided graph (default)

This is the `reconstructionMode = "current"` branch (UI label: *Evidence-guided graph*; the underlying candidate generator is internally tagged `angular_nearest`).

### B.1 Candidate-edge generation

For each node `i`, the service considers nearby neighbours `j` within `candidateMaxDistanceUv` in unit space, ordered by distance. It groups them into **directional spokes**: two neighbours whose connecting rays from `i` are within `angleToleranceDeg` of each other share a spoke, and only the nearest neighbour in each spoke survives as a candidate. This avoids generating co-linear duplicate edges through closely-spaced bosses.

For every surviving candidate `(i, j)` the service evaluates a **rib-mask corridor score**:

1. Rasterise a rectangle of width `corridorWidthPx` centred on the segment `ij`.
2. Compute the fraction of foreground rib-mask pixels inside that corridor.
3. Subtract a small penalty (`0.20 × penalty`) for evidence that a third boss lies on or near the segment, clamped to `[0, 1]`.

Candidates with a final score below `candidateMinScore` are dropped. The remaining set is the **candidate pool**, each candidate carrying its score and a `mutual` flag indicating whether the reverse direction (`j` → `i`) also produced it.

### B.2 Boundary edges

Nodes whose `(u, v)` lies within `boundaryToleranceUv` of any ROI edge are classified as boundary nodes. The ROI's four edges become **mandatory boundary edges** between consecutive boundary nodes. They're added first regardless of their candidate-pool membership (subject to a low `boundaryEdgeScoreFloor`), because the bay rectangle must close.

### B.3 Greedy selection with degree limits

After boundary edges are seeded, the remaining candidate pool is sorted by score (descending) and added greedily, subject to three constraints:

- **Degree bound:** neither endpoint may exceed `maxNodeDegree`.
- **Planarity:** when `enforcePlanarity` is on, an edge is rejected if it would cross an already-selected edge.
- **Mutuality:** controlled by `mutualOnly` (default on); only edges that were generated symmetrically from both endpoints are eligible.

### B.4 Degree-repair pass

After the greedy pass, any node whose degree is below `minNodeDegree` is repaired by relaxing the constraints one at a time, first the score floor, then mutuality, and adding the best remaining candidate that doesn't violate the degree cap. This guarantees no orphan or single-edge node remains where evidence allows otherwise.

### B.5 Scoring the final graph

Four components are computed over the final edge set:

| Component | Symbol | Definition |
|-----------|--------|------------|
| Edge evidence | `E` | Mean corridor-overlap score of non-boundary edges |
| Boundary coverage | `B` | Fraction of mandatory boundary edges actually present |
| Degree satisfaction | `D` | Fraction of nodes whose degree lies in `[minNodeDegree, maxNodeDegree]` |
| Mutual support | `M` | Fraction of non-boundary edges flagged `mutual` |

The headline `overallScore` is the convex combination

```
overallScore = 0.55·E + 0.20·B + 0.15·D + 0.10·M
```

The weights live in `bay_candidate_cv.py:score_selected_graph` and are intentionally rib-mask-dominated: in practice the rib evidence is what disambiguates valid from invalid reconstructions, while boundary and degree act as sanity checks.

## Mode 2: Delaunay (topology-only fallback)

This is the `reconstructionMode = "delaunay"` branch, intended for scans where rib-mask evidence is too sparse for the evidence-guided pass.

The service builds a constrained Delaunay triangulation over the boss + corner node set. Three optional Steiner constraint families can be toggled in the panel:

- **ROI boundary** (default on): the four ROI edges.
- **Cross axes:** the two ROI diagonals.
- **Half lines:** the four ROI bisectors.

The triangulation edges become the bay-plan edges. No corridor scoring or greedy selection runs; `overallScore` is reported as `0` and the result is flagged with `fallbackApplied: false, fallbackReason: "Topology-only Delaunay reconstruction"` so the UI can distinguish it from a scored result.

Delaunay output uses the same payload shape as the evidence-guided branch, so all downstream code (canvas, idealised overlay, DXF export, manual edits) works unchanged.

## Manual edits

Manual edge add/remove operations from the canvas are persisted via the `save_manual_edges` endpoint:

1. The incoming edge list replaces the result's `edges` field.
2. Edges that already existed keep their `isConstraint` / `isManual` flags; new edges are marked `isManual: true`.
3. In evidence-guided mode the four-component score is recomputed against the new edge set so the UI's score breakdown stays honest after manual cleanup.
4. In Delaunay mode the score stays zeroed.

A `manual_override` entry is appended to `optimisationDiagnostics` with a timestamp and edge count.

## Outputs

| File | Contents |
|------|----------|
| `2d_geometry/bay_plan/bay_plan_result.json` | Full payload: nodes (measured + idealised), edges, candidate pool, score breakdown, params, `ranAt`. |
| `2d_geometry/bay_plan/bay_plan_state.json` | Last-run summary used to restore UI state on reload. |
| `2d_geometry/bay_plan/bay_plan_debug.png` | Diagnostic overlay (rib mask, spokes, candidates, selected edges). |

The DXF export reads `bay_plan_result.json` and writes the four-layer file described in [Step 4D § Export](../workflow/step-4/bay-plan-reconstruction.md#4-export-the-plan-as-dxf).
