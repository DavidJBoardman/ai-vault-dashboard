# Step 8 / 2D Geometry Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the empty `2D` tab on the Step 8 Analysis page with a professional, paginated, exportable report (HTML bundle + vector PDF) summarising Step 4 outputs.

**Architecture:** Pure renderer-side feature. A `<Geometry2DReport>` component reads existing Step 4 data from the Zustand store, renders four sections + footer using shadcn primitives, and exposes two exports: a JSZip-built bundle and a PDF rendered through a new Electron `printToPDF` IPC.

**Tech Stack:** Next.js 14 / React 18, Zustand store, shadcn/ui (Radix + Tailwind), Electron `webContents.printToPDF`, JSZip, `react-dom/server`. No backend changes.

**Spec:** `docs/superpowers/specs/2026-04-27-step8-2d-geometry-report-design.md`

**Project conventions:** No test framework exists (per CLAUDE.md). Verification is via `npm run lint` plus a visual smoke check in `npm run dev`. British English in UI text (analyse, colour). Files ≤ 200 lines (hard max 300). British-English variable names where natural.

---

## File map

**Create:**
- `src/components/analysis/Geometry2DReport.tsx` — top-level component, layout, export buttons.
- `src/components/analysis/BayPlanSvg.tsx` — inline SVG with labelled reference points.
- `src/components/analysis/sections/ProjectHeader.tsx`
- `src/components/analysis/sections/BayProportionSection.tsx`
- `src/components/analysis/sections/CutTypologySection.tsx` — paginated table.
- `src/components/analysis/sections/BayPlanSection.tsx`
- `src/components/analysis/sections/ReportFooter.tsx`
- `src/components/analysis/report.module.css` — print stylesheet + tabular-figure utility.
- `src/lib/report/geometry2dReport.ts` — `selectReportData`, `toCsv`, `buildBundleZip`.
- `src/lib/report/rasteriseBayPlan.ts` — SVG → PNG via offscreen canvas.
- `src/lib/report/exportPdf.ts` — wraps `printToPdf` IPC.

**Modify:**
- `src/lib/store.ts` — add `Project.location?: string`, `setProjectLocation` action.
- `src/app/workflow/step-8-analysis/page.tsx:129` — replace `<TabsContent value="2d" />` with `<Geometry2DReport />`.
- `electron/main.ts` — add `report:print-to-pdf` IPC handler.
- `electron/preload.ts` — expose `report.printToPdf`.
- `src/types/electron.d.ts` — add `report.printToPdf` typing.
- `package.json` — add `jszip` dep.

---

## Task 1: Add `location` to Project model

**Files:**
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Add the optional field on `Project`**

In `src/lib/store.ts` find the `Project` interface (around line 80) and add immediately under `name`:

```ts
  location?: string;
```

- [ ] **Step 2: Add `setProjectLocation` to the store interface**

In the `ProjectStore` interface (around line 146) add:

```ts
  setProjectLocation: (location: string) => void;
```

- [ ] **Step 3: Implement the action**

Add inside the store body next to other simple setters (after `saveProject` definition or near other field setters):

```ts
      setProjectLocation: (location) => {
        set((state) =>
          state.currentProject
            ? { currentProject: { ...state.currentProject, location } }
            : state
        );
      },
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: clean exit (0).

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.ts
git commit -m "Add optional location field to Project model"
```

---

## Task 2: Install JSZip

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

Run: `npm install jszip`
Expected: adds `jszip` to `dependencies`.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add jszip dependency for report bundle export"
```

---

## Task 3: Add `report:print-to-pdf` IPC

**Files:**
- Modify: `electron/main.ts`, `electron/preload.ts`, `src/types/electron.d.ts`

- [ ] **Step 1: Add main-process handler**

In `electron/main.ts`, after the existing `capture:region` handler (line ~224) add:

```ts
ipcMain.handle('report:print-to-pdf', async (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow) {
    throw new Error('Sender window not found');
  }
  const buffer = await senderWindow.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { marginType: 'custom', top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
  });
  return buffer;
});
```

If `BrowserWindow` is not yet imported in this file, ensure `import { app, BrowserWindow, ipcMain, ... } from 'electron'` includes it.

- [ ] **Step 2: Expose on preload**

In `electron/preload.ts`, add inside the existing `electronAPI` object:

```ts
  report: {
    printToPdf: (): Promise<Uint8Array> =>
      ipcRenderer.invoke('report:print-to-pdf'),
  },
```

- [ ] **Step 3: Add type**

In `src/types/electron.d.ts` add the `report` property to the `electronAPI` interface:

```ts
    report: {
      printToPdf: () => Promise<Uint8Array>;
    };
```

(Place it next to the existing top-level keys; don't reorder or remove.)

- [ ] **Step 4: Build Electron + lint**

Run:
```bash
npm run lint
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts electron/preload.ts src/types/electron.d.ts
git commit -m "Add report:print-to-pdf IPC for PDF export"
```

---

## Task 4: `selectReportData` selector

**Files:**
- Create: `src/lib/report/geometry2dReport.ts`

- [ ] **Step 1: Create the selector + types**

Create `src/lib/report/geometry2dReport.ts`:

```ts
import type { Project } from "@/lib/store";

export interface BayProportionCandidate {
  rank: number;
  label: string;
  err: number;
  deltaFromBest: number;
}

export interface ReferencePoint {
  letter: string;
  u: number;
  v: number;
}

export interface RoiBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotationDeg: number;
  scale: number;
}

export interface ReportData {
  generatedAt: string;
  projectId: string;
  projectName: string;
  projectLocation: string;
  projectionName: string;
  projectionImageUrl: string | null;
  bayProportion: {
    measured: number | null;
    best: BayProportionCandidate | null;
    candidates: BayProportionCandidate[];
  };
  cutTypology: {
    columns: string[];
    rows: Array<Record<string, string>>;
    bossesMatched: number;
    variantsMatched: number;
  };
  referencePoints: ReferencePoint[];
  roi: RoiBox | null;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function selectReportData(project: Project | null): ReportData | null {
  if (!project) return null;

  const step4Data = (project.steps?.[4]?.data ?? {}) as {
    geometry2d?: {
      roi?: { appliedRoiParams?: RoiBox; vaultRatio?: number; vaultRatioSuggestions?: Array<{ label: string; err: number }> };
      analysis?: { vaultRatio?: number; vaultRatioSuggestions?: Array<{ label: string; err: number }> };
      templatePoints?: Array<{ u: number; v: number }>;
      templateMatch?: { columns?: string[]; rows?: Array<Record<string, string>> };
    };
  };

  const geom = step4Data.geometry2d ?? {};
  const analysis = geom.analysis ?? geom.roi ?? {};
  const measured = analysis.vaultRatio ?? null;
  const suggestions = (analysis.vaultRatioSuggestions ?? [])
    .slice()
    .sort((a, b) => a.err - b.err);
  const bestErr = suggestions[0]?.err ?? 0;
  const candidates: BayProportionCandidate[] = suggestions.map((s, i) => ({
    rank: i + 1,
    label: s.label,
    err: s.err,
    deltaFromBest: s.err - bestErr,
  }));

  const templatePoints = geom.templatePoints ?? [];
  const referencePoints: ReferencePoint[] = templatePoints.map((p, i) => ({
    letter: LETTERS[i] ?? `P${i + 1}`,
    u: p.u,
    v: p.v,
  }));

  const matchColumns = geom.templateMatch?.columns ?? [];
  const matchRows = geom.templateMatch?.rows ?? [];
  const variantsMatched = new Set(
    matchRows
      .map((r) => r["matchedVariantLabel"] || r["matched_variant_label"] || "")
      .filter(Boolean)
  ).size;

  const selectedProjection =
    project.projections.find((p) => p.id === project.selectedProjectionId) ??
    project.projections[0] ??
    null;

  return {
    generatedAt: new Date().toISOString(),
    projectId: project.id,
    projectName: project.name,
    projectLocation: project.location ?? "",
    projectionName: selectedProjection?.name ?? "",
    projectionImageUrl: selectedProjection?.imageUrl ?? null,
    bayProportion: {
      measured,
      best: candidates[0] ?? null,
      candidates,
    },
    cutTypology: {
      columns: matchColumns,
      rows: matchRows,
      bossesMatched: matchRows.length,
      variantsMatched,
    },
    referencePoints,
    roi: geom.roi?.appliedRoiParams ?? null,
  };
}

export function toCsv(rows: Array<Record<string, string | number>>, columns?: string[]): string {
  if (rows.length === 0) return columns ? columns.join(",") + "\n" : "";
  const cols = columns ?? Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(",");
  const body = rows.map((row) => cols.map((c) => escape(row[c])).join(",")).join("\n");
  return header + "\n" + body + "\n";
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/report/geometry2dReport.ts
git commit -m "Add report data selector and CSV serialiser"
```

> **Note for next tasks:** if the actual key names in `project.steps[4].data.geometry2d` for `templateMatch.rows`, `templateMatch.columns`, or `templatePoints` differ from the assumptions above, adjust `selectReportData` to read the real keys. Confirm by logging `project.steps[4]?.data` in dev tools after running through Step 4 once.

---

## Task 5: Bay-plan rasterisation helper

**Files:**
- Create: `src/lib/report/rasteriseBayPlan.ts`

- [ ] **Step 1: Implement SVG-to-PNG**

Create `src/lib/report/rasteriseBayPlan.ts`:

```ts
const MAX_EDGE = 2048;

export async function rasteriseSvgElement(svgEl: SVGSVGElement): Promise<Blob> {
  const xml = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(url);

    const naturalW = img.naturalWidth || svgEl.clientWidth || 1024;
    const naturalH = img.naturalHeight || svgEl.clientHeight || 1024;
    const scale = Math.min(1, MAX_EDGE / Math.max(naturalW, naturalH));
    const w = Math.round(naturalW * scale);
    const h = Math.round(naturalH * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to acquire 2D context");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob returned null"));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/report/rasteriseBayPlan.ts
git commit -m "Add SVG-to-PNG rasterisation helper for bay-plan export"
```

---

## Task 6: Bundle zip builder

**Files:**
- Modify: `src/lib/report/geometry2dReport.ts`

- [ ] **Step 1: Add `buildBundleZip`**

Append to `src/lib/report/geometry2dReport.ts`:

```ts
import JSZip from "jszip";

export interface BundleInputs {
  reportHtml: string;
  bayPlanPng: Blob | null;
  data: ReportData;
}

export async function buildBundleZip(inputs: BundleInputs): Promise<Blob> {
  const { reportHtml, bayPlanPng, data } = inputs;
  const zip = new JSZip();

  zip.file("report.html", reportHtml);

  zip.file(
    "bay-proportion.csv",
    toCsv(
      data.bayProportion.candidates.map((c) => ({
        rank: c.rank,
        label: c.label,
        error: c.err.toFixed(6),
        deltaFromBest: c.deltaFromBest.toFixed(6),
      })),
      ["rank", "label", "error", "deltaFromBest"]
    )
  );

  zip.file(
    "cut-typology.csv",
    toCsv(data.cutTypology.rows, data.cutTypology.columns.length > 0 ? data.cutTypology.columns : undefined)
  );

  zip.file(
    "bay-plan.csv",
    toCsv(
      data.referencePoints.map((p) => ({ letter: p.letter, u: p.u.toFixed(6), v: p.v.toFixed(6) })),
      ["letter", "u", "v"]
    )
  );

  if (bayPlanPng) {
    zip.file("bay-plan.png", bayPlanPng);
  }

  return zip.generateAsync({ type: "blob" });
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/report/geometry2dReport.ts
git commit -m "Add bundle zip builder for report export"
```

---

## Task 7: PDF export wrapper

**Files:**
- Create: `src/lib/report/exportPdf.ts`

- [ ] **Step 1: Implement**

Create `src/lib/report/exportPdf.ts`:

```ts
export async function exportReportPdf(filenameHint: string): Promise<void> {
  const api = (window as unknown as { electronAPI?: { report?: { printToPdf?: () => Promise<Uint8Array> } } }).electronAPI;
  if (!api?.report?.printToPdf) {
    throw new Error("PDF export is only available in the desktop app.");
  }

  document.body.classList.add("report-print-mode");
  try {
    const buffer = await api.report.printToPdf();
    const blob = new Blob([buffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filenameHint}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    document.body.classList.remove("report-print-mode");
  }
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/report/exportPdf.ts
git commit -m "Add PDF export wrapper using printToPdf IPC"
```

---

## Task 8: `BayPlanSvg` component

**Files:**
- Create: `src/components/analysis/BayPlanSvg.tsx`

- [ ] **Step 1: Implement**

Create `src/components/analysis/BayPlanSvg.tsx`:

```tsx
import { forwardRef } from "react";
import type { ReferencePoint, RoiBox } from "@/lib/report/geometry2dReport";

interface BayPlanSvgProps {
  imageUrl: string | null;
  roi: RoiBox | null;
  referencePoints: ReferencePoint[];
  width?: number;
  height?: number;
}

export const BayPlanSvg = forwardRef<SVGSVGElement, BayPlanSvgProps>(function BayPlanSvg(
  { imageUrl, roi, referencePoints, width, height },
  ref
) {
  // Use ROI dimensions for the viewBox so all coordinates fall inside
  const vbW = roi?.w ?? 1000;
  const vbH = roi?.h ?? 1000;
  const vbX = roi ? roi.cx - roi.w / 2 : 0;
  const vbY = roi ? roi.cy - roi.h / 2 : 0;

  const radius = Math.max(vbW, vbH) * 0.012;
  const fontSize = Math.max(vbW, vbH) * 0.028;

  return (
    <svg
      ref={ref}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      width={width ?? "100%"}
      height={height ?? "auto"}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      className="block w-full h-auto"
    >
      {imageUrl ? (
        <image
          href={imageUrl}
          x={vbX}
          y={vbY}
          width={vbW}
          height={vbH}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="#f4f4f5" />
      )}

      {referencePoints.map((p) => (
        <g key={p.letter}>
          <circle cx={p.u} cy={p.v} r={radius} fill="#ef4444" stroke="#ffffff" strokeWidth={radius * 0.2} />
          <text
            x={p.u + radius * 1.6}
            y={p.v - radius * 0.4}
            fontSize={fontSize}
            fontWeight={700}
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

- [ ] **Step 3: Commit**

```bash
git add src/components/analysis/BayPlanSvg.tsx
git commit -m "Add BayPlanSvg component with labelled reference points"
```

---

## Task 9: Section components — Project header

**Files:**
- Create: `src/components/analysis/sections/ProjectHeader.tsx`

- [ ] **Step 1: Implement (with inline-editable location)**

```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Check, X } from "lucide-react";
import type { ReportData } from "@/lib/report/geometry2dReport";
import { useProjectStore } from "@/lib/store";

interface Props {
  data: ReportData;
}

export function ProjectHeader({ data }: Props) {
  const setProjectLocation = useProjectStore((s) => s.setProjectLocation);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.projectLocation);

  const save = () => {
    setProjectLocation(draft.trim());
    setEditing(false);
  };

  const cancel = () => {
    setDraft(data.projectLocation);
    setEditing(false);
  };

  return (
    <header className="space-y-2 border-b border-border pb-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{data.projectName || "Untitled project"}</h1>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">Location:</span>{" "}
          {editing ? (
            <span className="inline-flex items-center gap-1">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="h-7 w-64 inline"
                placeholder="e.g., Durham Cathedral, UK"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") cancel();
                }}
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save} aria-label="Save location">
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancel} aria-label="Cancel">
                <X className="h-3.5 w-3.5" />
              </Button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              {data.projectLocation || <em className="text-muted-foreground/70">not set</em>}
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 print:hidden"
                onClick={() => setEditing(true)}
                aria-label="Edit location"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </span>
          )}
        </span>
        <span>
          <span className="font-medium text-foreground">Projection:</span> {data.projectionName || "n/a"}
        </span>
        <span>
          <span className="font-medium text-foreground">Generated:</span> {new Date(data.generatedAt).toLocaleString()}
        </span>
        <span className="text-xs">
          <span className="font-medium">ID:</span> {data.projectId}
        </span>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/components/analysis/sections/ProjectHeader.tsx
git commit -m "Add ProjectHeader section with inline-editable location"
```

---

## Task 10: Section component — Bay proportion

**Files:**
- Create: `src/components/analysis/sections/BayProportionSection.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Card, CardContent } from "@/components/ui/card";
import type { ReportData } from "@/lib/report/geometry2dReport";

function fmt(n: number, d = 4): string {
  return Number.isFinite(n) ? n.toFixed(d) : "n/a";
}

export function BayProportionSection({ data }: { data: ReportData }) {
  const { measured, best, candidates } = data.bayProportion;

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">§2 Bay proportion</h2>
        <p className="text-sm text-muted-foreground">
          Measured ROI ratio compared against canonical mediaeval planning ratios.
        </p>
      </div>

      {best ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Best match</p>
            <p className="mt-1 font-display text-2xl font-semibold text-primary">{best.label}</p>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm tabular-nums">
              <div>
                <span className="text-muted-foreground">Measured ratio (W/H): </span>
                <span className="font-medium">{measured != null ? fmt(measured) : "n/a"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Error: </span>
                <span className="font-medium">{fmt(best.err)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">ROI bay-proportion analysis has not been run.</p>
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
              {candidates.map((c, i) => (
                <tr key={c.label} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                  <td className="px-3 py-2 tabular-nums">{c.rank}</td>
                  <td className="px-3 py-2">{c.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(c.err)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.rank === 1 ? "—" : fmt(c.deltaFromBest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/components/analysis/sections/BayProportionSection.tsx
git commit -m "Add BayProportionSection with best-match card and candidates table"
```

---

## Task 11: Section component — Cut typology with pagination

**Files:**
- Create: `src/components/analysis/sections/CutTypologySection.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReportData } from "@/lib/report/geometry2dReport";

const PAGE_SIZE = 10;

export function CutTypologySection({ data }: { data: ReportData }) {
  const { columns, rows, bossesMatched, variantsMatched } = data.cutTypology;
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  // In print mode, the print stylesheet promotes `data-print-all` to show every row
  const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">§3 Cut typology</h2>
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "Template matching has not been run."
            : `${bossesMatched} boss${bossesMatched === 1 ? "" : "es"} matched across ${variantsMatched} typology variant${variantsMatched === 1 ? "" : "s"}.`}
        </p>
      </div>

      {rows.length > 0 && columns.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border" data-print-all="true">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="px-3 py-2 font-medium">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="cut-typology-rows">
                {/* Screen mode: paginated slice */}
                {slice.map((row, i) => (
                  <tr key={`screen-${page}-${i}`} className={`screen-only ${i % 2 === 0 ? "bg-muted/20" : ""}`}>
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-2 tabular-nums">{row[col] ?? ""}</td>
                    ))}
                  </tr>
                ))}
                {/* Print mode: all rows */}
                {rows.map((row, i) => (
                  <tr key={`print-${i}`} className={`print-only ${i % 2 === 0 ? "bg-muted/20" : ""}`}>
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-2 tabular-nums">{row[col] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 text-sm screen-only print:hidden">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
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

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/components/analysis/sections/CutTypologySection.tsx
git commit -m "Add CutTypologySection with screen pagination and full-print mode"
```

---

## Task 12: Section component — Bay plan

**Files:**
- Create: `src/components/analysis/sections/BayPlanSection.tsx`

- [ ] **Step 1: Implement**

```tsx
import { forwardRef } from "react";
import type { ReportData } from "@/lib/report/geometry2dReport";
import { BayPlanSvg } from "@/components/analysis/BayPlanSvg";

interface Props {
  data: ReportData;
}

export const BayPlanSection = forwardRef<SVGSVGElement, Props>(function BayPlanSection({ data }, ref) {
  const { referencePoints, projectionImageUrl, roi } = data;

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">§4 Bay plan preview</h2>
        <p className="text-sm text-muted-foreground">
          Projection clipped to the ROI with reference points labelled in save order.
        </p>
      </div>

      {referencePoints.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reference points saved yet.</p>
      ) : (
        <figure className="space-y-2">
          <div className="rounded-lg border bg-muted/20 p-2">
            <BayPlanSvg
              ref={ref}
              imageUrl={projectionImageUrl}
              roi={roi}
              referencePoints={referencePoints}
            />
          </div>
          <figcaption className="text-center text-xs text-muted-foreground">
            Bay plan preview · {referencePoints.length} reference point{referencePoints.length === 1 ? "" : "s"}
          </figcaption>
        </figure>
      )}
    </section>
  );
});
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/components/analysis/sections/BayPlanSection.tsx
git commit -m "Add BayPlanSection wrapping BayPlanSvg with caption"
```

---

## Task 13: Section component — Footer

**Files:**
- Create: `src/components/analysis/sections/ReportFooter.tsx`

- [ ] **Step 1: Implement**

```tsx
import packageJson from "../../../../package.json";

export function ReportFooter({ generatedAt }: { generatedAt: string }) {
  return (
    <footer className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
      Generated by Vault Analyser v{packageJson.version} · {new Date(generatedAt).toLocaleString()}
    </footer>
  );
}
```

> If TypeScript complains about importing JSON, add `"resolveJsonModule": true` to `tsconfig.json` (it is usually already enabled in Next.js projects). If still problematic, replace with a hard-coded string matching `package.json` version.

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/components/analysis/sections/ReportFooter.tsx
git commit -m "Add ReportFooter with app version and timestamp"
```

---

## Task 14: Print stylesheet

**Files:**
- Create: `src/components/analysis/report.module.css`

- [ ] **Step 1: Implement**

Create `src/components/analysis/report.module.css`:

```css
.report {
  font-feature-settings: "tnum" 1, "lnum" 1;
}

.report :global(.print-only) {
  display: none;
}

@media print {
  .report :global(.screen-only) {
    display: none !important;
  }

  .report :global(.print-only) {
    display: table-row !important;
  }

  .report section {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .report h2 {
    page-break-after: avoid;
  }
}

:global(body.report-print-mode) .report :global(.screen-only) {
  display: none !important;
}

:global(body.report-print-mode) .report :global(.print-only) {
  display: table-row !important;
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/components/analysis/report.module.css
git commit -m "Add print stylesheet for full-table expansion in PDF export"
```

---

## Task 15: Top-level `Geometry2DReport` component

**Files:**
- Create: `src/components/analysis/Geometry2DReport.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProjectStore } from "@/lib/store";
import {
  buildBundleZip,
  selectReportData,
  type ReportData,
} from "@/lib/report/geometry2dReport";
import { rasteriseSvgElement } from "@/lib/report/rasteriseBayPlan";
import { exportReportPdf } from "@/lib/report/exportPdf";
import { ProjectHeader } from "./sections/ProjectHeader";
import { BayProportionSection } from "./sections/BayProportionSection";
import { CutTypologySection } from "./sections/CutTypologySection";
import { BayPlanSection } from "./sections/BayPlanSection";
import { ReportFooter } from "./sections/ReportFooter";
import styles from "./report.module.css";

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildSelfContainedHtml(reportRootHtml: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1.5rem; color: #111; }
  h1, h2 { font-family: Georgia, serif; }
  h1 { font-size: 1.875rem; margin: 0 0 .5rem; }
  h2 { font-size: 1.25rem; margin: 1.5rem 0 .5rem; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th, td { padding: .5rem .75rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
  th { background: #f4f4f5; font-weight: 600; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .tabular-nums, td { font-variant-numeric: tabular-nums; }
  figure { margin: 0; }
  figcaption { text-align: center; font-size: .75rem; color: #6b7280; margin-top: .5rem; }
  footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; font-size: .75rem; color: #6b7280; text-align: center; }
  .muted { color: #6b7280; }
</style>
</head>
<body>${reportRootHtml}</body>
</html>`;
}

export function Geometry2DReport() {
  const project = useProjectStore((s) => s.currentProject);
  const data = useMemo<ReportData | null>(() => selectReportData(project), [project]);
  const reportRef = useRef<HTMLDivElement>(null);
  const bayPlanSvgRef = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState<"none" | "bundle" | "pdf">("none");
  const { toast } = useToast();

  if (!data) {
    return <p className="text-sm text-muted-foreground">No project loaded.</p>;
  }

  const handleBundle = async () => {
    if (!reportRef.current) return;
    setBusy("bundle");
    try {
      const reportRootHtml = reportRef.current.outerHTML;
      const html = buildSelfContainedHtml(reportRootHtml, `${data.projectName} — 2D report`);
      let bayPlanPng: Blob | null = null;
      if (bayPlanSvgRef.current) {
        try {
          bayPlanPng = await rasteriseSvgElement(bayPlanSvgRef.current);
        } catch (err) {
          console.warn("Failed to rasterise bay plan:", err);
        }
      }
      const zip = await buildBundleZip({ reportHtml: html, bayPlanPng, data });
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(zip, `${slugify(data.projectName)}-2d-report-${date}.zip`);
      toast({ title: "Bundle exported", description: "Saved to your default downloads folder." });
    } catch (err) {
      toast({
        title: "Bundle export failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy("none");
    }
  };

  const handlePdf = async () => {
    setBusy("pdf");
    try {
      const date = new Date().toISOString().slice(0, 10);
      await exportReportPdf(`${slugify(data.projectName)}-2d-report-${date}`);
    } catch (err) {
      toast({
        title: "PDF export failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy("none");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2 print:hidden">
        <Button variant="outline" onClick={handleBundle} disabled={busy !== "none"}>
          {busy === "bundle" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Download Bundle (.zip)
        </Button>
        <Button variant="outline" onClick={handlePdf} disabled={busy !== "none"}>
          {busy === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
          Download PDF
        </Button>
      </div>

      <article id="geometry2d-report" ref={reportRef} className={`${styles.report} space-y-10 rounded-lg border bg-background p-8`}>
        <ProjectHeader data={data} />
        <BayProportionSection data={data} />
        <CutTypologySection data={data} />
        <BayPlanSection ref={bayPlanSvgRef} data={data} />
        <ReportFooter generatedAt={data.generatedAt} />
      </article>
    </div>
  );
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/components/analysis/Geometry2DReport.tsx
git commit -m "Add Geometry2DReport with bundle and PDF export buttons"
```

---

## Task 16: Wire into Step 8 page

**Files:**
- Modify: `src/app/workflow/step-8-analysis/page.tsx:129`

- [ ] **Step 1: Replace empty TabsContent**

In `src/app/workflow/step-8-analysis/page.tsx`:

Replace:
```tsx
        <TabsContent value="2d" />
```

With:
```tsx
        <TabsContent value="2d" className="space-y-6">
          <Geometry2DReport />
        </TabsContent>
```

Add the import at the top of the file with other component imports:

```tsx
import { Geometry2DReport } from "@/components/analysis/Geometry2DReport";
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Smoke test**

Run: `npm run dev`

In the app:
1. Open or create a project that has been through Step 4.
2. Navigate to the Analysis page; the 2D tab should be the default.
3. Verify the four sections render with real data. If any section shows the empty state, walk through Step 4 first.
4. Click the location pencil and set a location. Refresh the page; it should persist (Zustand persist middleware).
5. Click **Download Bundle (.zip)**. Open the ZIP and confirm it contains `report.html`, three CSVs, and `bay-plan.png`. Open `report.html` in a browser — it should render standalone.
6. Click **Download PDF**. Open the resulting PDF; the cut-typology table should show all rows (not paginated), the bay-plan SVG should be sharp at any zoom, and the export buttons should NOT appear in the PDF.

- [ ] **Step 4: Commit**

```bash
git add src/app/workflow/step-8-analysis/page.tsx
git commit -m "Render Geometry2DReport in Step 8 2D tab"
```

---

## Task 17: Final polish + acceptance check

- [ ] **Step 1: Re-run lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 2: Verify acceptance criteria from spec**

For a project that has completed Step 4:
- [ ] All 4 sections + footer render with real data.
- [ ] Bundle .zip contains the listed files; `report.html` opens standalone.
- [ ] PDF is multi-page A4, vector bay plan, full cut-typology table.
- [ ] Empty states render for projects with partial Step 4 data without errors.
- [ ] `npm run lint` passes.

- [ ] **Step 3: Final commit (if any tweaks)**

```bash
git add -A
git commit -m "Final polish for Step 8 2D report"
```

---

## Self-review notes

- All spec sections (header with location, bay proportion, cut typology, bay plan SVG, footer) are covered by Tasks 9–13 and aggregated in Task 15.
- Both export modes (bundle, PDF) implemented in Tasks 6/7 and wired in Task 15.
- Print stylesheet (Task 14) handles cut-typology full expansion.
- `Project.location` (Task 1) and IPC (Task 3) cover the model and infra changes.
- No TBDs / "implement later" / hand-waved error handling.
- Type names (`ReportData`, `ReferencePoint`, `RoiBox`, `BayProportionCandidate`) used consistently across Tasks 4 → 15.
