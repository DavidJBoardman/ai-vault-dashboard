# Cut-Typology Match Table — Column Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a column-visibility picker to the Step 4C Cut-Typology Match table so users can hide noisy columns (`boss_xy`, `template_xy`, `xy_error`) by default while keeping the underlying data, and have the CSV download respect the currently-visible columns.

**Architecture:** All changes are renderer-only and confined to `src/components/geometry2d/stages/template/CutTypologyMatchTable.tsx` (the `variant="diagnostic"` path used by the Match-table modal). We introduce a `visibleColumns: Set<string>` state seeded from a `DEFAULT_HIDDEN_DIAGNOSTIC_COLUMNS` constant, render only that subset in the `<thead>`/`<tbody>`, drive the download CSV from the same subset, and expose a small "Columns" popover button beside the filter chips. The `report` variant retains its fixed column list and is untouched.

**Tech Stack:** Next.js (App Router) + React 18, TypeScript, TailwindCSS, shadcn/ui (Button, Badge, Checkbox already available — no new shadcn primitives needed; popover is a lightweight absolutely-positioned div with a click-outside `useEffect`).

---

## Existing context (read once before starting)

- The Match-table modal lives in `src/components/geometry2d/stages/template/CutTypologyMatchingPanel.tsx` (`isMatchCsvOpen` Dialog). It mounts `<CutTypologyMatchTable variant="diagnostic" ... />` and supplies `matchCsvColumns: string[]` + `matchCsvRows: Array<Record<string,string>>` from the API.
- `CutTypologyMatchTable.tsx` (397 lines) owns: filter chips (`FILTER_OPTIONS`), sort (`sortConfig`), pagination (optional), CSV download (`handleDownloadMatchCsv`), and column derivation (`displayMatchCsvColumns` useMemo, lines 100–119).
- Two columns are sticky-positioned: `boss_id` (`left-0`, 64px wide via `w-[56px]` + px-2) and `x_cut` (`left-[64px]`). Helper: `getStickyColumnClass(column, isHeader)` at lines 198–206.
- Sort default is `{ column: "xy_error", direction: "desc" }`. The "Reset sort" button resets to the same.
- CLAUDE.md says: no JS test runner is configured. **Verification is `npm run lint` + manual browser smoke test, not jest.** Do not add a new test framework for this work.
- British English in UI strings (e.g. "Customise columns", not "Customize").

---

## File Structure

**Modify only:**
- `src/components/geometry2d/stages/template/CutTypologyMatchTable.tsx`
  - Add `DEFAULT_HIDDEN_DIAGNOSTIC_COLUMNS` constant near the top (alongside `REPORT_COLUMNS`).
  - Add `visibleColumns` state + derived `renderedColumns` array.
  - Add `isColumnPickerOpen` state and a popover JSX block.
  - Replace direct uses of `displayMatchCsvColumns` in the `<thead>`/`<tbody>`/print rows and in `handleDownloadMatchCsv` with `renderedColumns`.
  - Patch `getStickyColumnClass` so `x_cut` only gets `left-[64px]` when `boss_id` is visible; otherwise its `left-0`. If `x_cut` is also hidden, `boss_id` keeps `left-0` (no change needed there).
  - Add sort-column fallback: when the active `sortConfig.column` is hidden, the table still sorts by it internally (sort works on row data, not the rendered column) — so no behavioural change is needed, but the "Sorted by …" badge must remain visible. Leave sort logic alone; just keep the badge.

**Do not modify:**
- `CutTypologyMatchingPanel.tsx` (props unchanged).
- `cutTypologyMatchingUtils.ts` (helpers unchanged).
- `report` variant code paths and `REPORT_COLUMNS`.

---

## Task 1: Add `DEFAULT_HIDDEN_DIAGNOSTIC_COLUMNS` constant and visibility state

**Files:**
- Modify: `src/components/geometry2d/stages/template/CutTypologyMatchTable.tsx` (around lines 35–46 for the constant; around lines 93–99 for state).

- [ ] **Step 1: Add the default-hidden constant**

  Add this block immediately after `REPORT_COLUMNS` (after line 45):

  ```ts
  // Diagnostic variant: these columns are part of the dataset but hidden in the
  // default view to reduce visual noise. Users can re-enable them via the
  // Columns picker; doing so also includes them in the CSV download.
  const DEFAULT_HIDDEN_DIAGNOSTIC_COLUMNS: ReadonlySet<string> = new Set([
    "boss_xy",
    "template_xy",
    "xy_error",
  ]);
  ```

- [ ] **Step 2: Add `visibleColumns` state**

  Inside `CutTypologyMatchTable`, after the existing `useState` calls (after `setPage` declaration at line 98), add:

  ```ts
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set<string>());
  const [hasInitialisedVisibility, setHasInitialisedVisibility] = useState(false);
  ```

  Then, after the `displayMatchCsvColumns` useMemo (after line 119), add an effect that seeds visibility from the resolved column list the first time it becomes non-empty:

  ```ts
  useEffect(() => {
    if (hasInitialisedVisibility) return;
    if (displayMatchCsvColumns.length === 0) return;
    const initial = new Set<string>();
    for (const column of displayMatchCsvColumns) {
      if (variant === "diagnostic" && DEFAULT_HIDDEN_DIAGNOSTIC_COLUMNS.has(column)) continue;
      initial.add(column);
    }
    setVisibleColumns(initial);
    setHasInitialisedVisibility(true);
  }, [displayMatchCsvColumns, hasInitialisedVisibility, variant]);
  ```

- [ ] **Step 3: Derive `renderedColumns` (in display order)**

  Immediately below the seeding effect, add:

  ```ts
  const renderedColumns = useMemo(
    () => displayMatchCsvColumns.filter((column) => visibleColumns.has(column)),
    [displayMatchCsvColumns, visibleColumns]
  );
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  Run: `npm run lint`
  Expected: No new errors. (Existing warnings unrelated to this file are acceptable.)

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/geometry2d/stages/template/CutTypologyMatchTable.tsx
  git commit -m "feat(geometry2d): seed cut-typology column visibility state"
  ```

---

## Task 2: Render only `renderedColumns` and fix sticky offsets

**Files:**
- Modify: `src/components/geometry2d/stages/template/CutTypologyMatchTable.tsx` lines 198–206 (`getStickyColumnClass`), and lines 294–365 (table `<thead>`, screen `<tbody>`, print `<tbody>`).

- [ ] **Step 1: Make sticky offset depend on `boss_id` visibility**

  Replace the `getStickyColumnClass` helper (lines 198–206) with:

  ```ts
  const getStickyColumnClass = (column: string, isHeader = false): string => {
    const bossVisible = visibleColumns.has("boss_id");
    if (column === "boss_id") {
      return `sticky left-0 ${isHeader ? "z-30 bg-background/55" : "z-20 bg-background/35"}`;
    }
    if (column === "x_cut") {
      const offsetClass = bossVisible ? "left-[64px]" : "left-0";
      return `sticky ${offsetClass} ${isHeader ? "z-30 bg-background/55" : "z-20 bg-background/35"}`;
    }
    return "";
  };
  ```

- [ ] **Step 2: Replace `displayMatchCsvColumns` with `renderedColumns` in the table body and headers**

  In the `<thead>` (around line 295), change:

  ```tsx
  {displayMatchCsvColumns.map((column) => (
  ```
  to:
  ```tsx
  {renderedColumns.map((column) => (
  ```

  In the screen `<tbody>` row mapping (around line 312):

  ```tsx
  {displayMatchCsvColumns.map((column) => (
  ```
  to:
  ```tsx
  {renderedColumns.map((column) => (
  ```

  In the print `<tbody>` row mapping (around line 351):

  ```tsx
  {displayMatchCsvColumns.map((column) => (
  ```
  to:
  ```tsx
  {renderedColumns.map((column) => (
  ```

  Leave `displayMatchCsvColumns` defined — it remains the **source of truth for the picker** in Task 3.

- [ ] **Step 3: Guard against empty `renderedColumns`**

  In the empty-state branch (around line 287), change the condition so the "No rows" view also covers the all-columns-hidden case. Replace:

  ```tsx
  {sortedDisplayMatchCsvRows.length === 0 ? (
    <div className="p-4 text-xs text-muted-foreground">
      {isLoadingMatchCsv ? "Loading CSV rows..." : "No rows for this filter."}
    </div>
  ) : (
  ```
  with:
  ```tsx
  {sortedDisplayMatchCsvRows.length === 0 || renderedColumns.length === 0 ? (
    <div className="p-4 text-xs text-muted-foreground">
      {isLoadingMatchCsv
        ? "Loading CSV rows..."
        : renderedColumns.length === 0
          ? "All columns hidden — open Columns to show at least one."
          : "No rows for this filter."}
    </div>
  ) : (
  ```

- [ ] **Step 4: Run lint + dev server, sanity-check render**

  Run: `npm run lint`
  Expected: clean.

  Then start the dev server (`npm run dev`), open Step 4C in the app, click "View match table". Expected:
  - Columns `boss_xy`, `template_xy`, `xy_error` are **gone** from the visible header/body.
  - The "Sorted by xy_error ↓" badge in the top-right is still shown (sort still works internally).
  - The leftmost column (`boss_id`) is still sticky on horizontal scroll.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/geometry2d/stages/template/CutTypologyMatchTable.tsx
  git commit -m "feat(geometry2d): hide noisy match-table columns by default"
  ```

---

## Task 3: Add the "Columns" popover picker

**Files:**
- Modify: `src/components/geometry2d/stages/template/CutTypologyMatchTable.tsx` — imports (line 4), state (after Task 1 state), toolbar JSX (lines 272–284).

- [ ] **Step 1: Add icon import + new component imports**

  Update the imports at the top of the file:

  ```ts
  import { useEffect, useMemo, useRef, useState } from "react";
  import { Columns3, Download } from "lucide-react";
  ```
  and:
  ```ts
  import { Checkbox } from "@/components/ui/checkbox";
  ```

  Place the Checkbox import next to the existing shadcn imports (Badge, Button).

- [ ] **Step 2: Add popover state + click-outside ref**

  Below the existing state declarations from Task 1, add:

  ```ts
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isColumnPickerOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!columnPickerRef.current) return;
      if (columnPickerRef.current.contains(event.target as Node)) return;
      setIsColumnPickerOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isColumnPickerOpen]);
  ```

- [ ] **Step 3: Add toggle / reset helpers (closure inside component)**

  Below the click-outside effect, add:

  ```ts
  const toggleColumnVisibility = (column: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(column)) {
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  };

  const resetColumnsToDefault = () => {
    const next = new Set<string>();
    for (const column of displayMatchCsvColumns) {
      if (variant === "diagnostic" && DEFAULT_HIDDEN_DIAGNOSTIC_COLUMNS.has(column)) continue;
      next.add(column);
    }
    setVisibleColumns(next);
  };
  ```

- [ ] **Step 4: Render the Columns button + popover in the filter toolbar**

  Replace the filter-chip block (current lines 272–284):

  ```tsx
  <div className="flex flex-wrap gap-2">
    {FILTER_OPTIONS.map(({ mode, label, countKey }) => (
      <Button
        key={mode}
        size="sm"
        variant={filterMode === mode ? "default" : "outline"}
        className="h-7 px-2 text-xs"
        onClick={() => setFilterMode(mode)}
      >
        {label} ({matchSummary[countKey]})
      </Button>
    ))}
  </div>
  ```

  with:

  ```tsx
  <div className="flex flex-wrap items-center gap-2">
    {FILTER_OPTIONS.map(({ mode, label, countKey }) => (
      <Button
        key={mode}
        size="sm"
        variant={filterMode === mode ? "default" : "outline"}
        className="h-7 px-2 text-xs"
        onClick={() => setFilterMode(mode)}
      >
        {label} ({matchSummary[countKey]})
      </Button>
    ))}
    {variant === "diagnostic" && displayMatchCsvColumns.length > 0 && (
      <div className="relative ml-auto" ref={columnPickerRef}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => setIsColumnPickerOpen((prev) => !prev)}
          aria-expanded={isColumnPickerOpen}
          aria-haspopup="dialog"
        >
          <Columns3 className="h-3.5 w-3.5" />
          Columns ({renderedColumns.length}/{displayMatchCsvColumns.length})
        </Button>
        {isColumnPickerOpen && (
          <div
            role="dialog"
            aria-label="Customise visible columns"
            className="absolute right-0 z-40 mt-1 w-[240px] rounded-md border border-border bg-popover p-3 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Visible columns
              </p>
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground"
                onClick={resetColumnsToDefault}
              >
                Reset
              </button>
            </div>
            <div className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
              {displayMatchCsvColumns.map((column) => {
                const checked = visibleColumns.has(column);
                const id = `column-toggle-${column}`;
                return (
                  <label
                    key={column}
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-accent/40"
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={() => toggleColumnVisibility(column)}
                    />
                    <span className="truncate">{column}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 border-t border-border/60 pt-2 text-[10px] leading-snug text-muted-foreground">
              The CSV download exports only the columns shown here.
            </p>
          </div>
        )}
      </div>
    )}
  </div>
  ```

  Note: this places the Columns button at the right end of the filter row via `ml-auto`. The existing "Sorted by …" badge (in the row above) is unchanged.

- [ ] **Step 5: Lint + manual UI smoke test**

  Run: `npm run lint`
  Expected: clean.

  In the dev server:
  - Open Match table → click **Columns**. The popover lists every column with checkboxes; `boss_xy`, `template_xy`, `xy_error` are unchecked by default.
  - Tick `xy_error` → column appears immediately to the right of `template_uv` (preserving `displayMatchCsvColumns` order).
  - Untick `boss_id` → table re-renders without it; `x_cut` should now be the leftmost sticky column (no gap, no overlap).
  - Click outside the popover → it closes.
  - Click **Reset** inside the popover → returns to the default (three hidden).

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/geometry2d/stages/template/CutTypologyMatchTable.tsx
  git commit -m "feat(geometry2d): add column picker to match table"
  ```

---

## Task 4: Drive CSV download from visible columns + add helper hint

**Files:**
- Modify: `src/components/geometry2d/stages/template/CutTypologyMatchTable.tsx` — `handleDownloadMatchCsv` (lines 211–260) and the Download button block (lines 388–393).

- [ ] **Step 1: Use `renderedColumns` inside the downloader**

  In `handleDownloadMatchCsv` (line 211), replace every occurrence of `displayMatchCsvColumns` with `renderedColumns`. There are four occurrences in this function:

  - The early-return guard (line 212):

    ```ts
    if (displayMatchCsvRows.length === 0 || displayMatchCsvColumns.length === 0) return;
    ```
    becomes:
    ```ts
    if (displayMatchCsvRows.length === 0 || renderedColumns.length === 0) return;
    ```

  - The header row (line 219):

    ```ts
    displayMatchCsvColumns.map((column) => escapeValue(column)).join(","),
    ```
    becomes:
    ```ts
    renderedColumns.map((column) => escapeValue(column)).join(","),
    ```

  - The body-row mapping (lines 221–229):

    ```ts
    ...displayMatchCsvRows.map((row) =>
      displayMatchCsvColumns
        .map((column) => {
          if (column === "point_label") {
            return escapeValue(getCompactNodeLabel(row.point_label || row.boss_id) || row.point_label || "");
          }
          return escapeValue(row[column] || "");
        })
        .join(",")
    ),
    ```
    becomes:
    ```ts
    ...displayMatchCsvRows.map((row) =>
      renderedColumns
        .map((column) => {
          if (column === "point_label") {
            return escapeValue(getCompactNodeLabel(row.point_label || row.boss_id) || row.point_label || "");
          }
          return escapeValue(row[column] || "");
        })
        .join(",")
    ),
    ```

- [ ] **Step 2: Update the Download button disabled-guard and add a hint**

  Replace the existing Download button block (lines 388–393):

  ```tsx
  {showDownload && (
    <Button type="button" size="sm" className="h-8 min-w-[106px] justify-center gap-1.5" onClick={handleDownloadMatchCsv} disabled={isLoadingMatchCsv || displayMatchCsvRows.length === 0 || displayMatchCsvColumns.length === 0}>
      <Download className="h-3.5 w-3.5" />
      Download
    </Button>
  )}
  ```

  with:

  ```tsx
  {showDownload && (
    <div className="flex items-center gap-2">
      {variant === "diagnostic" && (
        <span className="hidden text-[10px] text-muted-foreground sm:inline">
          Exports {renderedColumns.length} of {displayMatchCsvColumns.length} columns
        </span>
      )}
      <Button
        type="button"
        size="sm"
        className="h-8 min-w-[106px] justify-center gap-1.5"
        onClick={handleDownloadMatchCsv}
        disabled={isLoadingMatchCsv || displayMatchCsvRows.length === 0 || renderedColumns.length === 0}
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </Button>
    </div>
  )}
  ```

- [ ] **Step 3: Lint + manual download smoke test**

  Run: `npm run lint`
  Expected: clean.

  In the dev server:
  - Open Match table. Hint should read "Exports 7 of 10 columns" (or matching numbers).
  - Click Download → open the saved CSV. The header line should **not** contain `boss_xy`, `template_xy`, `xy_error`. Body rows should have the matching number of comma-separated fields.
  - Tick `xy_error` in the picker → re-download → header now includes `xy_error` and the field is present in body rows.
  - Untick every column → Download button becomes disabled.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/geometry2d/stages/template/CutTypologyMatchTable.tsx
  git commit -m "feat(geometry2d): export only visible columns from match table"
  ```

---

## Task 5: Final verification

- [ ] **Step 1: Full lint pass**

  Run: `npm run lint`
  Expected: no new errors or warnings introduced by these changes.

- [ ] **Step 2: End-to-end manual check in dev**

  Run: `npm run dev`

  Walk through Step 4C:
  1. Run cut-typology matching for a project that has 8+ rows (so the table is meaningful).
  2. Open the Match table modal.
  3. Confirm default view shows: `boss_id`, `point_label`, `point_type`, `x_cut`, `y_cut`, `boss_uv`, `template_uv`, `matched` (no `boss_xy`, `template_xy`, `xy_error`).
  4. Confirm filter chips still work (All / Matched / Unmatched / High error counts unchanged).
  5. Confirm sort works: click `boss_uv` header → table re-sorts; "Sorted by boss_uv ↑" badge updates.
  6. Open Columns picker → tick `xy_error` → confirm column appears and the "High" badge inline (diagnostic-only render at line 332–341) still renders.
  7. Reset sort works.
  8. Pagination (if applicable) still works.
  9. Download CSV → verify the exported header matches visible columns.
  10. Confirm `variant="report"` consumers (search for `<CutTypologyMatchTable` to find them) are unaffected — no Columns button, fixed column list.

- [ ] **Step 3: Final commit (only if any fix-up needed)**

  If smoke-test surfaces a bug, fix it and commit:

  ```bash
  git add src/components/geometry2d/stages/template/CutTypologyMatchTable.tsx
  git commit -m "fix(geometry2d): <describe fix>"
  ```

  If everything passes, skip this step.

---

## Self-review notes

- **Spec coverage:** Default-hide trio ✅ (Task 1 constant + Task 2 render). Picker UI ✅ (Task 3). Download follows visible ✅ (Task 4). Hint near Download ✅ (Task 4 Step 2). Report variant untouched ✅ (Task 3 Step 4 guard `variant === "diagnostic"`).
- **Type consistency:** `visibleColumns: Set<string>`, `renderedColumns: string[]`, `DEFAULT_HIDDEN_DIAGNOSTIC_COLUMNS: ReadonlySet<string>`, helpers `toggleColumnVisibility(column: string)` and `resetColumnsToDefault()` — names used consistently across Tasks 1–4.
- **Sticky-column edge case:** Handled in Task 2 Step 1 (`x_cut` left-offset depends on `boss_id` visibility).
- **Sort-by-hidden-column edge case:** Intentionally allowed (badge still shows the sort key, internal sort still uses row data). Reset-sort button still resets to `xy_error desc` — works even if the column is hidden, which matches the current "Sorted by xy_error" badge behaviour.
- **No new tests:** Repo has no JS test runner per CLAUDE.md. Verification is `npm run lint` + manual smoke test, called out in every task.
