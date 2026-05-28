# Appendix A: Cut-Typology Matching Algorithm

This appendix documents the algorithm behind [Step 4C — Cut-Typology Matching](../workflow/step-4/cut-typology-matching.md). It is intended for reproducibility and for readers who want to understand how the per-boss table and the leading variant are derived.

The reference implementation lives in `backend/services/geometry2d/cut_typology_matching_service.py`.

## Inputs

- **ROI** — the rectangle saved in Step 4A, parameterised by centre `(cx, cy)`, size `(w, h)`, and rotation `θ`.
- **Reference points** — bosses and the four ROI corners saved in Step 4B. Corners are anchors and are never scored against templates.
- **Parameters** — `starcutMin`, `starcutMax`, `includeStarcut`, `includeInner`, `includeOuter`, and the per-axis `tolerance` (default 0.03 in normalised bay units).

## 1. Unit-space conversion

Every reference point's image coordinate `(x, y)` is mapped into the ROI's unit square `(u, v) ∈ [0, 1]²` by the ROI's affine transform. From this point on all matching is done in unit space, so it is independent of ROI rotation or pixel scale.

## 2. Template variants

For each enabled family the service generates a variant:

- **Starcut `n`** for every `n ∈ [starcutMin, starcutMax]` — an *n × n* regular grid with cut-line ratios `{0, 1/n, 2/n, …, 1}` on both axes.
- **Circlecut inner** — circle centred on the bay with radius `½·max(w, h)`. Construction-line intersections with bisectors and corner rays yield non-fractional cut ratios.
- **Circlecut outer** — circle centred on the bay with radius `½·hypot(w, h)` (passes through the corners). Same construction.

Each variant carries a `template_uv` keypoint set plus the overlay geometry rendered on the canvas.

## 3. Per-axis candidate ratios

For every boss `(u, v)`, and independently on each axis, the service collects all candidate cut-ratios from all enabled non-cross variants:

```
x_candidates = { (variant_label, ratio, error=|u − ratio|)
                  : ratio ∈ variant.x_ratios, error ≤ tolerance }
y_candidates = { (variant_label, ratio, error=|v − ratio|)
                  : ratio ∈ variant.y_ratios, error ≤ tolerance }
```

Each candidate list is sorted by the same key that ranks variants (family complexity → *n* → error → ratio) so the *leading* candidate per axis already reflects the parsimony prior.

The full candidate lists — not just the leaders — are persisted to `boss_axis_candidates.json` so that switching the reading later is just a re-emit, not a re-match.

## 4. Match state per boss

Given a boss's leading `x` and `y` candidates:

| `match_state` | Condition |
|----|----|
| `matched`   | both `x` and `y` candidates exist (i.e. both ≤ tolerance) |
| `partial`   | exactly one axis hits; the other is missed |
| `unmatched` | neither axis hits |

A partial-match boss snaps to its cut-line on the hit axis and keeps its raw measured coordinate on the missed axis — this is what the **Idealised** view in Step 4D renders.

## 5. Whole-template derivation

A non-cross variant `V` is considered a match for boss `B` iff `V` appears in both `B.x_candidates` and `B.y_candidates`. (Cross-template variants pair an x-source with a y-source, but the cross family is disabled by default.) For each such `V`, the boss's `(xRatio, yRatio, xError, yError)` are taken from the lowest-error candidate carrying that variant label on each axis.

## 6. Variant ranking (the parsimony prior)

Variants are ranked by the tuple

```
key = (-matchedCount, familyComplexity, n, variantLabel)
```

where `familyComplexity` is `0` for starcut, `1` for circlecut, `2` for cross-template, and `9999` otherwise; `n` is the divisor for starcut variants (`9999` for circlecuts). The leading variant after sorting becomes `bestVariantLabel`.

This encodes a **family → *n* → error** priority: when two families match the same number of bosses, we prefer the simpler family; among starcuts that tie, we prefer the smaller grid. The historical justification is parsimony — medieval designers reached for the simplest figure that fits.

## 7. Reading selector

The reading dropdown in the panel (`starcut` / `circlecut_inner` / `circlecut_outer` / `mixed`) re-emits `boss_cut_typology_match.csv` from the cached axis candidates:

- For each boss, on each axis, the service picks the first candidate that matches the reading family — falling back to *no match* if no candidate satisfies it.
- `mixed` keeps each boss's own leading per-axis choice (this is what the auto-selected leading variant uses).

No new matching is performed; the CSV and summary counters are simply recomputed from `boss_axis_candidates.json`.

## 8. Outputs

| File | Contents |
|------|----------|
| `2d_geometry/cut_typology_matching/cut_typology_result.json` | Full payload — variants, per-boss rows, params, `bestVariantLabel`, `ranAt`. |
| `2d_geometry/cut_typology_matching/boss_cut_typology_match.csv` | One row per reference point; the canonical per-boss table the UI renders. |
| `2d_geometry/cut_typology_matching/boss_axis_candidates.json` | Cached per-axis candidate lists used by the reading-selector. |
| `2d_geometry/cut_typology_matching/node_points.json` | Persisted reference-point set used by 4C (auto-refreshed corners + bosses). |

## Choosing the tolerance

The default `tolerance = 0.03` sits just below the minimum gap between adjacent starcut cut-line ratios at the default `starcutMax = 6` — namely `1 / (6 · 5) ≈ 0.0333`. Setting tolerance below this gap guarantees that *at most one* starcut grid can claim any given coordinate, so the family/*n* prior is doing real work rather than masking ambiguity. If you raise `starcutMax` to 7 or 8, tighten the tolerance accordingly (e.g. `1 / (7 · 6) ≈ 0.0238` for `starcutMax = 7`).
