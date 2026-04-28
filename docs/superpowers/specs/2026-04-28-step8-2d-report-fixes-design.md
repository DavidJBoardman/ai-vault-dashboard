# Step 8 — 2D Report: corrections and improvements

## Context

The Geometry2DReport in Step 8 (`src/components/analysis/Geometry2DReport.tsx`) renders four sections: project header, §2 Bay proportion, §3 Cut typology, §4 Bay plan preview. Manual review against project `a3c869e2-c1f5-4d2f-8826-214063802cec` surfaced correctness bugs in §3 and §4, plus structural issues across the document. This spec defines the fixes.

## Goals

- Correct miscounts and mis-renders (§3 variants count, §3 boss count, §4 image scaling).
- Tighten the §3 table for readability without losing fidelity in the bundled CSV.
- Restore consistent section numbering and add a project-context section.
- Surface near-equivalent ratio matches in §2.

## Non-goals

- Re-running template matching, changing matching algorithms, or altering CSV schemas produced by the backend.
- Rewriting the bundle/PDF export pipeline. Only the rendered report and `selectReportData` change.
- Changing upstream `point_label` assignments (we re-letter for display only).

## Changes

### 1. Fix §3 typology-variants count (correctness)

**File:** `src/lib/report/geometry2dReport.ts`

In `selectReportData`, the variant-set is built from `matchedVariantLabel` / `matched_variant_label`, neither of which exists in the backend CSV. Replace with `variant_label` (primary) and keep the camelCase as a fallback. Exclude `roi_corner` and empty/`None` values:

```ts
const variantsMatched = new Set(
  matchRows
    .map((r) => r["variant_label"] ?? r["matchedVariantLabel"] ?? "")
    .filter((v) => v && v !== "None" && v !== "roi_corner")
).size;
```

### 2. Fix §3 boss count (correctness)

**File:** `src/lib/report/geometry2dReport.ts`

`bossesMatched` currently equals `matchRows.length`, which includes corner rows. Compute it from `point_type === "boss"` rows only:

```ts
const bossRows = matchRows.filter((r) => (r["point_type"] ?? "") === "boss");
const bossesMatched = bossRows.length;
```

The full `matchRows` continues to feed the table and the bundled CSV (so corners are still inspectable).

### 3. Fix §4 bay plan image scaling (correctness)

**File:** `src/lib/report/geometry2dReport.ts`, `src/components/analysis/BayPlanSvg.tsx`

`imageSize` is hardcoded to `{ width: resolution, height: resolution }` and `BayPlanSvg` draws the bitmap with `preserveAspectRatio="none"` at that square size. When the source projection PNG isn't square, the image is stretched and no longer aligns with pixel-space ROI/points.

Plan:
- Decode the projection image once on the client (using an `Image` element / `naturalWidth` / `naturalHeight`) inside `BayPlanSvg` and store dimensions in component state. Until known, fall back to the passed `imageSize`.
- Render `<image>` at `(0, 0, naturalWidth, naturalHeight)` with `preserveAspectRatio="none"` (the image fills its own native rect; the SVG viewBox handles cropping).
- Keep the `viewBox` set to the ROI rectangle (or full natural size when no ROI).
- Drop the `imageSize` field from `ReportData` (no longer authoritative); pass only the data URL and let the SVG component discover dimensions. Bundled CSV/PDF code that referenced `imageSize` is checked and adjusted.

### 4. Slim §3 cut-typology table (clarity)

**File:** `src/components/analysis/sections/CutTypologySection.tsx`

The on-screen table currently shows every column from the CSV. Restrict the displayed columns to the report-useful set, in this order:

1. `boss_id`
2. `point_label`
3. `variant_label`
4. `x_error` (formatted to 4 dp)
5. `y_error` (formatted to 4 dp)
6. `matched` (rendered as Yes/No)

The full row set with all columns continues to be written to `cut-typology.csv` in the bundle (no change to `buildBundleZip`). Pagination logic is preserved; with fewer columns the horizontal scroll should disappear.

### 5. Re-letter boss labels for display (clarity)

**File:** `src/components/analysis/sections/CutTypologySection.tsx` (or a small helper in `geometry2dReport.ts`)

Upstream `point_label` is non-monotonic ("Z, H, G, H, …") and contains duplicates. For the §3 table only, replace `point_label` with a sequential letter assignment over `point_type === "boss"` rows in `boss_id` order: Boss A, Boss B, …. Corner rows keep their existing label. The original label is preserved in the bundled CSV.

The re-lettering uses the same `LETTERS` constant already defined in `geometry2dReport.ts`.

### 6. Section numbering and §1 Project / inputs (structure)

**File:** new `src/components/analysis/sections/ProjectInputsSection.tsx`; existing section components.

Add §1 "Project & inputs" between the project header and §2. Content:

- Project name, location, projection name (already in header — keep there, do not duplicate).
- Source projection PNG dimensions (px), projection resolution setting.
- ROI dimensions in px (W × H, rotation°).
- Number of reference points; number of bosses; matching threshold (read from `geom.template?.settings` if present, else "default").

Section headings are renumbered §1 …§4 (current §2 → §2 stays as Bay proportion, §3 stays, §4 stays — i.e. only add §1, no shift). The headings already say "§2/§3/§4" in component code; verify they remain consistent after §1 is added.

### 7. §2 near-equivalent matches (clarity)

**File:** `src/components/analysis/sections/BayProportionSection.tsx`

Define `NEAR_EQUIVALENT_TOL = 0.005` (configurable constant in the section file). After the best-match card, if any non-rank-1 candidate has `c.err - bestErr <= NEAR_EQUIVALENT_TOL`, render a one-line note:

> "Near-equivalent within Δ ≤ 0.005: 5/7 (Δ 0.0005)."

In the candidates table, add a small "near-equivalent" tag in the Δ column for rows that satisfy the tolerance.

### 8. Header enrichment (clarity)

**File:** `src/components/analysis/sections/ProjectHeader.tsx`

The bulk of new context lives in §1 (item 6). Header keeps its existing four fields. No change required beyond verifying existing layout reads cleanly above the new §1.

## Data flow

`useProjectStore` → `selectReportData(project, cutTypology)` → `ReportData` → section components.

Updated `ReportData`:

- `cutTypology.bossesMatched`: now bosses-only count.
- `cutTypology.variantsMatched`: now reads `variant_label`.
- New `inputs` block (for §1): `{ projectionPxWidth: number | null; projectionPxHeight: number | null; resolution: number; roi: RoiBox | null; bossCount: number; pointCount: number; matchingThreshold: string | number | null }`.
- Removed `imageSize` (item 3).

## Testing

No automated test suite exists. Verification is manual and visual:

1. Open Step 8 against project `a3c869e2-c1f5-4d2f-8826-214063802cec` and confirm §3 reads "9 bosses matched across 2 typology variants" (starcut_n=2, starcut_n=4). Open the projects in `backend/data/projects/` with no boss data and confirm graceful "Template matching has not been run." behaviour.
2. Confirm §4 renders the projection image filling the ROI without black margins, with all reference points sitting on the correct pixel coordinates.
3. Confirm Download Bundle (.zip) still contains the full CSV (with all columns and the original `point_label`).
4. Confirm Download PDF renders all three improvements (table is narrower, §1 present, §2 near-equivalent note visible).
5. Run `npm run lint`.

## Risks

- Image-size detection in `BayPlanSvg` requires the data URL to load before measuring. We fall back to the existing behaviour if the image fails. This adds an async render but keeps the bundle/PDF export path working because rasterisation reads the SVG after layout settles.
- Re-lettering bosses (item 5) intentionally diverges from upstream labels; the bundled CSV remains the source of truth. Documented in the §3 table caption.
