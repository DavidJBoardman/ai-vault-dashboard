# Step 4C: Cut-Typology Matching

## Purpose

This sub-stage identifies which **geometric template** best explains the boss positions inside the bay. The result helps the app regularise the plan before reconstruction.

## Background: starcuts and circlecuts

Medieval vault designers set out rib plans by drawing construction lines through a starting figure inscribed within the rectangular bay. The intersections of these lines defined the positions of bosses and the start/end points of ribs.[^1]

Vault Analyser tests several template families derived from this tradition:

**Starcut (standard grid)**
:   An *n*-by-*n* regular grid that divides the bay into equal fractions along both axes. A starcut with *n* = 3 divides each side into thirds; *n* = 6 divides into sixths. The grid intersections correspond to the fractional positions at which medieval designers placed tiercerons and lierne junctions. The application tests a configurable range of divisors (default *n* = 2 to *n* = 6).

**Inner circlecut**
:   An extension of the starcut in which a circle with radius equal to the bay's longest side is drawn centred on the bay. The intersections between this circle, the bay's perpendicular bisectors, and lines connecting these intersections to the bay corners produce a set of keypoints that no longer correspond to neat fractional divisions. This variant captures the geometry of vaults designed with the *inner circle starcut* method.

**Outer circlecut**
:   Similar to the inner circlecut, but the circle passes through all four corners of the bay (i.e. has a radius of half the bay diagonal). This produces a different set of construction-line intersections and fractional relationships, corresponding to the *outer circle starcut* method.

**Cross templates**
:   Hybrid variants that combine the *x*-axis ratios from one family with the *y*-axis ratios from another (e.g. starcut *x* + circlecut inner *y*). These capture asymmetric designs where the longitudinal and transverse rib geometry follow different proportional systems.

[^1]: For a detailed account of starcut geometry and its application in medieval vaulting see [Plans — Tracing the Past](https://www.tracingthepast.org.uk/2021/04/07/designing_plans/).

## What the application does

When you run matching, the backend performs the following:

1. **Build template variants** — for each enabled family, generate keypoints in (u, v) unit space. Standard grids use `n`-by-`n` intersections; circle variants compute ray–circle intersections and construction-line crossings.
2. **Extract ratio sets** — from each variant's keypoints, extract the unique *x*-ratios and *y*-ratios (the fractional positions along each axis).
3. **Match bosses to ratios** — for every boss, find the nearest *x*-ratio and *y*-ratio. If both distances fall within the configured tolerance, the boss is counted as matched to that variant.
4. **Rank variants** — variants are sorted by the number of matched bosses, with ties usually broken in favour of simpler templates.
5. **Persist results** — the full matching payload is saved to `cut_typology_result.json` and a per-boss CSV to `boss_cut_typology_match.csv`.

For each matched boss the result includes an idealised template position. These ideal positions can then be preferred over raw centroids during reconstruction.

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| Starcut Min *n* | 2 | Lower bound for standard-grid divisors |
| Starcut Max *n* | 6 | Upper bound for standard-grid divisors |
| Include starcut | On | Enable standard *n*-by-*n* grid variants |
| Include circlecut inner | On | Enable the inner circle variant |
| Include circlecut outer | On | Enable the outer circle variant |
| Allow cross templates | On | Allow *x*/*y* ratios from different families |
| Ratio tolerance | 0.01 | Maximum absolute ratio distance for a coordinate to count as matched |

## What you do here

- Review the matching settings if you need to narrow or widen the search.
- Run the matching and inspect the ranked result.
- Compare the template overlays against the boss positions on the canvas.
- Continue only when the leading result looks plausible against the visible geometry.

## Why it matters

The matching result directly informs reconstruction. A good match can stabilise the bay plan; a bad match can push the reconstruction toward the wrong geometry.

## Expected result

Before continuing to sub-stage 4D you should have:

- a completed matching result with a believable leading template
- boss placements that broadly agree with the chosen overlay
- enough confidence to proceed to reconstruction
