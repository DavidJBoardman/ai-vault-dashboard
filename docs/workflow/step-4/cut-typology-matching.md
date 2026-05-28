# Step 4C: Cut-Typology Matching

## Purpose

This sub-stage identifies which **geometric template** best explains the boss positions inside the bay. The result helps the app regularise the plan before reconstruction.

## Background: starcuts and circlecuts

Medieval vault designers set out rib plans by drawing construction lines through a starting figure inscribed within the rectangular bay. The intersections of these lines defined the positions of bosses and the start/end points of ribs.[^1]

Vault Analyser tests several template families derived from this tradition:

**Starcut (standard grid)**
:   An *n*-by-*n* regular grid dividing the bay into equal fractions along both axes. Grid intersections correspond to the fractional positions at which medieval designers placed tiercerons and lierne junctions. The app tests divisors from *n* = 2 to *n* = 6 by default.

**Inner circlecut**
:   A circle centred on the bay with radius equal to *half* the bay's longest side, so it touches the midpoints of the two longer edges. Intersections between this circle, the bay's bisectors, and lines to the corners produce keypoints that do not correspond to simple fractions.

**Outer circlecut**
:   Similar, but the circle passes through all four bay corners (radius = half diagonal), producing a different set of construction-line intersections.

[^1]: For a detailed account of starcut geometry and its application in medieval vaulting see [Plans — Tracing the Past](https://www.tracingthepast.org.uk/2021/04/07/designing_plans/).

## Workflow

![Cut-Typology Matching: workflow stepper (Cut-Typology active); left panel with match status, distribution, overlay toggles, advanced parameters, and Run matching / Open match table; bay preview with RGB and reference points overlay; bottom match table with filters and CSV download.](../../images/step-4/step4c-cut-typology.png){ width="800" .center }

### 1. Review the matching settings

Start with the default settings. Tune the advanced parameters below only if the defaults do not produce satisfactory results. 

| Parameter | Default | Description |
|-----------|---------|-------------|
| Starcut Min *n* | 2 | Lower bound for standard-grid divisors |
| Starcut Max *n* | 6 | Upper bound for standard-grid divisors. Historically grounded — most documented medieval vault patterns use *n* ≤ 6; increase to 7–8 only if a specific pattern requires it (and tighten the tolerance accordingly) |
| Include starcut | On | Enable standard *n*-by-*n* grid variants |
| Include circlecut inner | On | Enable the inner circle variant |
| Include circlecut outer | On | Enable the outer circle variant |
| Ratio tolerance | 0.03 | Maximum absolute ratio distance (in normalised bay units) for a coordinate to count as matched. Sits below the minimum gap between adjacent cut-line ratios at the default Starcut Max = 6 (gap = 1/(6·5) ≈ 0.033), so each accepted point identifies a unique cut line |

### 2. Run matching

When you run matching, the backend:

1. **Builds template variants:** generates keypoints in (u, v) unit space for each enabled family.
2. **Extracts ratio sets:** collects the unique *x*-ratios and *y*-ratios from each variant's keypoints.
3. **Matches bosses to ratios:** for every boss, finds the nearest *x*- and *y*-ratio. A boss is classified into one of three states:
      - **Matched:** both axes fall within tolerance.
      - **Partial:** only one axis hits (e.g., *x* matches but *y* misses). The hit axis still snaps to its cut-line; the other keeps the measured coordinate.
      - **Unmatched:** neither axis hits.
4. **Ranks variants:** sorts by the number of matched bosses, then by a **parsimony prior** that prefers simpler families (starcut → circlecut → cross-template), then by the lowest divisor *n*, then by total per-axis error. The family prior reflects that medieval designers reached for the simplest figure that fits, see [Appendix A](../../appendix/cut-typology-algorithm.md) for the full rank key.
5. **Persists results:** saves the matching payload to `cut_typology_result.json` and a per-boss CSV to `boss_cut_typology_match.csv`. The CSV includes `match_state`, `x_ratio`, `y_ratio`, the chosen cuts, and a compact `template_uv` cell (4 dp; partial rows show only the hit axis).

Each matched boss receives an idealised template position that can be preferred over the raw centroid during reconstruction.

### 3. Inspect the result

Work through three regions of the panel: the canvas, the summary pill, and the match table. Then decide whether to continue.

**On the canvas**

- Compare the template overlays against the boss positions.
- **Hover or focus a template row** to preview that grid without enabling it permanently. Previews are marked with a **Preview** chip; checked overlays stay in the normal legend. Standardcut overlays draw solid coloured lines for their `n` value.
- **Click a boss marker** to pin a **magenta reference guide** through that point, aligned to the ROI width and height axes. Click the same boss again, or empty canvas to clear it.

**In the summary pill (above the table)**

- A tri-state pill shows **Full**, **Partial**, and **Unmatched** counts for the leading variant, so you can see at a glance how each axis-pair classification covers the bosses.

**In the match table**

- The **Match** column reports `matched` / `partial` / `unmatched` per boss.
- ROI corner rows are tagged with a **Reference** pill, those four anchor the bay frame and are not scored.
- Redundant columns (raw `x_ratio` / `y_ratio` / separate `template_uv`) are hidden by default; everything you need is folded into the single `template_uv` cell.

Continue only when the leading result looks plausible against the visible geometry.

#### Switching the reading

The reading-block dropdown at the top of the panel lets you re-express the per-boss CSV against a chosen family rather than the auto-selected leading variant:

- **starcut:** every boss is reported against its best starcut grid (whichever *n* fits each axis).
- **circlecut inner** / **circlecut outer:** every boss is reported against the chosen circle template.
- **mixed (per-boss):** each boss keeps its own best-fit family (the default; equivalent to the leading variant).

Switching the reading does not re-run matching; it just rewrites `boss_cut_typology_match.csv` and the summary counters from the cached per-axis evidence (`boss_axis_candidates.json`). Use it to inspect the same scan under alternative typologies without having to re-match.

If no template produces a believable match, try the following before moving on:

- Widen the **ratio tolerance** slightly if the boss positions are noisy.
- Return to sub-stage 4B to remove any spurious reference points that may be pulling the match off.
- Return to sub-stage 4A to check the bay proportion, and a significantly wrong proportion will misplace all template ratios.

## Why it matters

The matching result directly informs reconstruction. A good match can stabilise the bay plan; a bad match can push the reconstruction toward the wrong geometry.

## Before moving on

You should have:

- a completed matching result with a believable leading template
- the majority of bosses matched to that template (as a rough guide, aim for ≥ 80 % of bosses matched)
- boss placements that broadly agree with the template overlay on the canvas

Click **Bay-Plan Reconstruction** on the workflow stepper bar at the top to continue to sub-stage 4D.
