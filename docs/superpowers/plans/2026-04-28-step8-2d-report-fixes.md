# Step 8 — 2D Report Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three correctness bugs and four clarity issues in the Step 8 Geometry2D report (variants count, boss count, image scaling, table density, boss labels, project-inputs section, near-equivalent ratios).

**Architecture:** Changes are confined to the renderer. Touch `src/lib/report/geometry2dReport.ts` (data shaping), the four section components under `src/components/analysis/sections/`, and `src/components/analysis/BayPlanSvg.tsx`. No backend or CSV-schema changes. Spec: `docs/superpowers/specs/2026-04-28-step8-2d-report-fixes-design.md`.

**Tech Stack:** Next.js + React 18, TypeScript, TailwindCSS, Zustand, JSZip. No test runner — verification is `npm run lint` plus manual UI walkthrough against project `a3c869e2-c1f5-4d2f-8826-214063802cec`.

**Verification model:** This repo has no jest/pytest config (`CLAUDE.md` confirms). Each task ends with `npm run lint`, manual visual confirmation in `npm run dev`, and a commit.

---

## File Structure

| File | Responsibility | Status |
| --- | --- | --- |
| `src/lib/report/geometry2dReport.ts` | Data shaping + bundle export. Owns `ReportData`, `selectReportData`, `buildBundleZip`. | Modify |
| `src/components/analysis/Geometry2DReport.tsx` | Composes the report. | Modify (insert §1) |
| `src/components/analysis/BayPlanSvg.tsx` | SVG rendering with viewBox + image. | Modify (natural-size detection) |
| `src/components/analysis/sections/ProjectHeader.tsx` | Title + identification fields. | No change |
| `src/components/analysis/sections/BayProportionSection.tsx` | §2. | Modify (near-equivalent note) |
| `src/components/analysis/sections/CutTypologySection.tsx` | §3. | Modify (slim columns + re-letter) |
| `src/components/analysis/sections/BayPlanSection.tsx` | §4. Wraps BayPlanSvg. | No change |
| `src/components/analysis/sections/ProjectInputsSection.tsx` | New §1 inputs section. | Create |

---

## Task 1: Fix §3 typology-variants count

**Files:**
- Modify: `src/lib/report/geometry2dReport.ts:212-218`

- [ ] **Step 1: Replace the variants computation**

In `selectReportData`, find the `variantsMatched` block and replace with:

```ts
const variantsMatched = new Set(
  matchRows
    .map((r) => r["variant_label"] ?? r["matchedVariantLabel"] ?? r["matched_variant_label"] ?? "")
    .filter((v) => v && v !== "None" && v !== "roi_corner")
).size;
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Manual check**

Run `npm run dev`, open Step 8 against project `a3c869e2-c1f5-4d2f-8826-214063802cec`, confirm §3 reads "… across 2 typology variants" (starcut_n=2, starcut_n=4).

- [ ] **Step 4: Commit**

```bash
git add src/lib/report/geometry2dReport.ts
git commit -m "Fix §3 variants count to read variant_label column"
```

---

## Task 2: Fix §3 boss count

**Files:**
- Modify: `src/lib/report/geometry2dReport.ts:212-242`

- [ ] **Step 1: Compute bosses-only count**

Add immediately above the `variantsMatched` block:

```ts
const bossRows = matchRows.filter((r) => (r["point_type"] ?? "") === "boss");
```

Change `bossesMatched: matchRows.length` to `bossesMatched: bossRows.length` in the returned `cutTypology` object.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Manual check**

Step 8 against the same project should show "9 bosses matched across 2 typology variants" (Z, H, G, H, J, K, L, M, N).

- [ ] **Step 4: Commit**

```bash
git add src/lib/report/geometry2dReport.ts
git commit -m "Exclude ROI corners from §3 boss count"
```

---

## Task 3: Detect projection image natural size in BayPlanSvg

**Files:**
- Modify: `src/components/analysis/BayPlanSvg.tsx`

- [ ] **Step 1: Add async natural-size detection**

Replace the component body with:

```tsx
import { forwardRef, useEffect, useState } from "react";
import type { ImageSize, ReferencePoint, RoiBox } from "@/lib/report/geometry2dReport";

interface BayPlanSvgProps {
  imageDataUrl: string | null;
  roi: RoiBox | null;
  referencePoints: ReferencePoint[];
  imageSize: ImageSize;
}

export const BayPlanSvg = forwardRef<SVGSVGElement, BayPlanSvgProps>(function BayPlanSvg(
  { imageDataUrl, roi, referencePoints, imageSize },
  ref
) {
  const [natural, setNatural] = useState<ImageSize | null>(null);

  useEffect(() => {
    if (!imageDataUrl) {
      setNatural(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setNatural({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      if (!cancelled) setNatural(null);
    };
    img.src = imageDataUrl;
    return () => {
      cancelled = true;
    };
  }, [imageDataUrl]);

  const imgW = natural?.width ?? imageSize.width;
  const imgH = natural?.height ?? imageSize.height;

  const vbX = roi?.x ?? 0;
  const vbY = roi?.y ?? 0;
  const vbW = roi?.width ?? imgW;
  const vbH = roi?.height ?? imgH;
  const aspect = vbH > 0 ? vbW / vbH : 1;

  const radius = Math.max(vbW, vbH) * 0.012;
  const fontSize = Math.max(vbW, vbH) * 0.026;

  return (
    <svg
      ref={ref}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      className="block w-full"
      style={{ aspectRatio: aspect, maxHeight: "70vh" }}
    >
      {imageDataUrl ? (
        <image
          href={imageDataUrl}
          x={0}
          y={0}
          width={imgW}
          height={imgH}
          preserveAspectRatio="none"
        />
      ) : (
        <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="#f4f4f5" />
      )}

      {referencePoints.map((p) => (
        <g key={p.letter}>
          <circle
            cx={p.x}
            cy={p.y}
            r={radius}
            fill="#ef4444"
            stroke="#ffffff"
            strokeWidth={radius * 0.25}
          />
          <text
            x={p.x + radius * 1.4}
            y={p.y - radius * 0.4}
            fontSize={fontSize}
            fontWeight={700}
            fontFamily="Georgia, serif"
            fill="#111827"
            stroke="#ffffff"
            strokeWidth={fontSize * 0.18}
            paintOrder="stroke"
          >
            {p.letter}
          </text>
        </g>
      ))}
    </svg>
  );
});
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Manual check**

In Step 8 §4, the projection image now fills the ROI rectangle without horizontal black margins, and the reference-point dots sit on the actual boss centres. Then trigger "Download Bundle (.zip)" — confirm `bay-plan.png` still rasterises (check it opens cleanly).

- [ ] **Step 4: Commit**

```bash
git add src/components/analysis/BayPlanSvg.tsx
git commit -m "Use projection image natural size in §4 bay plan SVG"
```

---

## Task 4: Add inputs metadata to ReportData

**Files:**
- Modify: `src/lib/report/geometry2dReport.ts`

- [ ] **Step 1: Extend ReportData interface**

After the `imageSize: ImageSize;` line in the `ReportData` interface, add:

```ts
  inputs: {
    resolution: number;
    roiPx: { width: number; height: number; rotation: number } | null;
    bossCount: number;
    pointCount: number;
    matchingThreshold: string | null;
  };
```

- [ ] **Step 2: Compute inputs in selectReportData**

Inside the existing `selectReportData`, after `bossRows` is computed (Task 2) and before the `return {` statement, add:

```ts
const matchingThreshold =
  typeof (geom.template as { settings?: { matchingThreshold?: number | string } })?.settings
    ?.matchingThreshold === "number" ||
  typeof (geom.template as { settings?: { matchingThreshold?: number | string } })?.settings
    ?.matchingThreshold === "string"
    ? String(
        (geom.template as { settings?: { matchingThreshold?: number | string } }).settings!
          .matchingThreshold
      )
    : null;

const inputs = {
  resolution,
  roiPx: roi
    ? { width: roi.width, height: roi.height, rotation: roi.rotation }
    : null,
  bossCount: bossRows.length,
  pointCount: referencePoints.length,
  matchingThreshold,
};
```

Add `inputs,` to the returned object.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/report/geometry2dReport.ts
git commit -m "Add inputs metadata to ReportData for §1 section"
```

---

## Task 5: Create §1 Project & inputs section

**Files:**
- Create: `src/components/analysis/sections/ProjectInputsSection.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { ReportData } from "@/lib/report/geometry2dReport";

function fmtPx(n: number): string {
  return Number.isFinite(n) ? `${Math.round(n)} px` : "n/a";
}

export function ProjectInputsSection({ data }: { data: ReportData }) {
  const { inputs } = data;

  const rows: Array<{ label: string; value: string }> = [
    { label: "Projection resolution", value: `${inputs.resolution} px` },
    {
      label: "ROI size",
      value: inputs.roiPx
        ? `${fmtPx(inputs.roiPx.width)} × ${fmtPx(inputs.roiPx.height)}`
        : "not set",
    },
    {
      label: "ROI rotation",
      value: inputs.roiPx ? `${inputs.roiPx.rotation.toFixed(1)}°` : "n/a",
    },
    { label: "Reference points", value: String(inputs.pointCount) },
    { label: "Bosses", value: String(inputs.bossCount) },
    {
      label: "Matching threshold",
      value: inputs.matchingThreshold ?? "default",
    },
  ];

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">§1 Project &amp; inputs</h2>
        <p className="text-sm text-muted-foreground">
          Snapshot of the projection and ROI used to generate this report.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <dl className="grid grid-cols-1 sm:grid-cols-2">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`flex items-center justify-between gap-4 px-4 py-2 text-sm ${
                i % 2 === 0 ? "bg-muted/20" : ""
              }`}
            >
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="font-medium tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire into Geometry2DReport**

Modify `src/components/analysis/Geometry2DReport.tsx`. Add the import:

```tsx
import { ProjectInputsSection } from "./sections/ProjectInputsSection";
```

Inside the `<article>` block, insert `<ProjectInputsSection data={data} />` between `<ProjectHeader … />` and `<BayProportionSection … />`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Manual check**

§1 appears under the header, before §2, with six rows (resolution, ROI size, rotation, reference points, bosses, threshold).

- [ ] **Step 5: Commit**

```bash
git add src/components/analysis/sections/ProjectInputsSection.tsx src/components/analysis/Geometry2DReport.tsx
git commit -m "Add §1 Project & inputs section"
```

---

## Task 6: Slim §3 cut-typology table and re-letter bosses

**Files:**
- Modify: `src/components/analysis/sections/CutTypologySection.tsx`

- [ ] **Step 1: Replace the component body**

```tsx
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReportData } from "@/lib/report/geometry2dReport";

const PAGE_SIZE = 10;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const DISPLAY_COLUMNS: Array<{ key: string; label: string; align?: "left" | "right" }> = [
  { key: "boss_id", label: "ID" },
  { key: "display_label", label: "Label" },
  { key: "variant_label", label: "Variant" },
  { key: "x_error", label: "x error", align: "right" },
  { key: "y_error", label: "y error", align: "right" },
  { key: "matched", label: "Matched" },
];

function fmtError(raw: string | undefined): string {
  if (raw == null || raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n.toFixed(4) : raw;
}

function fmtMatched(raw: string | undefined): string {
  if (raw == null) return "";
  const v = raw.toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return "Yes";
  if (v === "false" || v === "0" || v === "no") return "No";
  return raw;
}

export function CutTypologySection({ data }: { data: ReportData }) {
  const { rows, bossesMatched, variantsMatched } = data.cutTypology;
  const [page, setPage] = useState(0);

  const displayRows = useMemo(() => {
    let bossIndex = 0;
    return rows.map((r) => {
      const isBoss = (r["point_type"] ?? "") === "boss";
      const displayLabel = isBoss
        ? `Boss ${LETTERS[bossIndex++] ?? `#${bossIndex}`}`
        : r["point_label"] ?? "";
      return {
        ...r,
        display_label: displayLabel,
        x_error: fmtError(r["x_error"]),
        y_error: fmtError(r["y_error"]),
        matched: fmtMatched(r["matched"]),
      };
    });
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const slice = displayRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">§3 Cut typology</h2>
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "Template matching has not been run."
            : `${bossesMatched} boss${bossesMatched === 1 ? "" : "es"} matched across ${variantsMatched} typology variant${variantsMatched === 1 ? "" : "s"}. Bosses re-lettered for display; the bundled CSV preserves original labels.`}
        </p>
      </div>

      {displayRows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  {DISPLAY_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`px-3 py-2 font-medium ${col.align === "right" ? "text-right" : ""}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((row, i) => (
                  <tr
                    key={`screen-${page}-${i}`}
                    className={`screen-only ${i % 2 === 0 ? "bg-muted/20" : ""}`}
                  >
                    {DISPLAY_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-2 tabular-nums ${col.align === "right" ? "text-right" : ""}`}
                      >
                        {row[col.key] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
                {displayRows.map((row, i) => (
                  <tr
                    key={`print-${i}`}
                    className={`print-only ${i % 2 === 0 ? "bg-muted/20" : ""}`}
                  >
                    {DISPLAY_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-2 tabular-nums ${col.align === "right" ? "text-right" : ""}`}
                      >
                        {row[col.key] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="screen-only flex items-center justify-end gap-2 text-sm print:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Prev
              </Button>
              <span className="tabular-nums text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Manual check**

§3 table now shows six columns, no horizontal scrollbar, bosses are labelled Boss A–Boss I (sequentially in `boss_id` order), corner rows keep their original "Corner A/B/C/D" labels. Open the bundle zip and verify `cut-typology.csv` still has all original columns.

- [ ] **Step 4: Commit**

```bash
git add src/components/analysis/sections/CutTypologySection.tsx
git commit -m "Slim §3 table to display columns and re-letter bosses sequentially"
```

---

## Task 7: §2 near-equivalent matches

**Files:**
- Modify: `src/components/analysis/sections/BayProportionSection.tsx`

- [ ] **Step 1: Replace the component body**

```tsx
import { Card, CardContent } from "@/components/ui/card";
import type { ReportData } from "@/lib/report/geometry2dReport";

const NEAR_EQUIVALENT_TOL = 0.005;

function fmt(n: number, d = 4): string {
  return Number.isFinite(n) ? n.toFixed(d) : "n/a";
}

export function BayProportionSection({ data }: { data: ReportData }) {
  const { measured, best, candidates } = data.bayProportion;
  const nearEquivalent = candidates.filter(
    (c) => c.rank !== 1 && c.deltaFromBest <= NEAR_EQUIVALENT_TOL
  );

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">§2 Bay proportion</h2>
        <p className="text-sm text-muted-foreground">
          Measured ROI ratio (W/H) compared against canonical mediaeval planning ratios.
        </p>
      </div>

      {best ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Best match</p>
            <p className="mt-1 font-display text-2xl font-semibold text-primary">{best.label}</p>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm tabular-nums">
              <div>
                <span className="text-muted-foreground">Measured ratio: </span>
                <span className="font-medium">{measured != null ? fmt(measured) : "n/a"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Error: </span>
                <span className="font-medium">{fmt(best.err)}</span>
              </div>
            </div>
            {nearEquivalent.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Near-equivalent within Δ ≤ {NEAR_EQUIVALENT_TOL.toFixed(3)}:{" "}
                {nearEquivalent
                  .map((c) => `${c.label} (Δ ${fmt(c.deltaFromBest)})`)
                  .join(", ")}
                .
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          ROI bay-proportion analysis has not been run.
        </p>
      )}

      {candidates.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Rank</th>
                <th className="px-3 py-2 font-medium">Canonical ratio</th>
                <th className="px-3 py-2 text-right font-medium">Error</th>
                <th className="px-3 py-2 text-right font-medium">Δ from best</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c, i) => {
                const isNear = c.rank !== 1 && c.deltaFromBest <= NEAR_EQUIVALENT_TOL;
                return (
                  <tr key={c.label} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                    <td className="px-3 py-2 tabular-nums">{c.rank}</td>
                    <td className="px-3 py-2">{c.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(c.err)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.rank === 1 ? (
                        "—"
                      ) : (
                        <>
                          {fmt(c.deltaFromBest)}
                          {isNear && (
                            <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                              near
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Manual check**

§2 best-match card shows a "Near-equivalent within Δ ≤ 0.005: 5/7 (Δ 0.0005)." line. The candidates table tags rank 2 with a "near" pill.

- [ ] **Step 4: Commit**

```bash
git add src/components/analysis/sections/BayProportionSection.tsx
git commit -m "Surface §2 near-equivalent canonical ratios within tolerance"
```

---

## Task 8: End-to-end verification

- [ ] **Step 1: Lint everything**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 2: Walk the report**

Run `npm run dev`, open Step 8 against project `a3c869e2-c1f5-4d2f-8826-214063802cec`, and confirm:

1. Header unchanged.
2. §1 Project & inputs renders six rows.
3. §2 Best-match card shows "near-equivalent" line; candidates table shows "near" pill on rank 2.
4. §3 reads "9 bosses matched across 2 typology variants"; six display columns; bosses labelled Boss A–Boss I; corners keep "Corner A/B/C/D".
5. §4 image fills the ROI rectangle without black margins; reference points sit on bosses.

- [ ] **Step 3: Export checks**

Click "Download Bundle (.zip)" — open `report.html`, `cut-typology.csv` (verify all original columns present), and `bay-plan.png` (verify it renders cleanly).
Click "Download PDF" — verify §1–§4 all appear and the §3 table prints all rows (no pagination in print).

- [ ] **Step 4: Edge case**

Switch to a project with no template matching results (any project under `backend/data/projects/` whose `cut_typology_matching/` directory is empty). Confirm §3 shows "Template matching has not been run." and the rest of the report still loads.

- [ ] **Step 5: Final commit (if any incidental fixes)**

```bash
git status
# only commit if there are residual fixes
```

---

## Self-review notes

- **Spec coverage:** Items 1 (Task 1), 2 (Task 2), 3 (Task 3), 4 (Task 6 — slim table), 5 (Task 6 — re-letter), 6 (Tasks 4+5 — §1 inputs section), 7 (Task 7 — near-equivalent), 8 (no-op per spec — header unchanged, context lives in §1).
- **Type consistency:** `ReportData.inputs` defined in Task 4 is consumed in Task 5; field names match (`resolution`, `roiPx`, `bossCount`, `pointCount`, `matchingThreshold`).
- **No automated tests:** repo has no jest/pytest. Verification steps are explicit lint + manual UI walkthroughs against a known project ID.
