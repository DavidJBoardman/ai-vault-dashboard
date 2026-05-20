"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Columns3, Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCutTypologyValue, getCompactNodeLabel } from "@/components/geometry2d/projectionCanvasUtils";
import {
  getMatchColumnClass,
  getUvErrorSeverity,
  normaliseMatchCsvRows,
  parseUvErrorScore,
  type MatchCsvRow,
} from "./cutTypologyMatchingUtils";

interface CutTypologyMatchTableProps {
  matchCsvColumns: string[];
  matchCsvRows: Array<Record<string, string>>;
  isLoadingMatchCsv?: boolean;
  className?: string;
  tableViewportClassName?: string;
  variant?: "diagnostic" | "report";
  pageSize?: number;
  showDownload?: boolean;
}

const FILTER_OPTIONS: Array<{ mode: "all" | "matched" | "unmatched" | "highError"; label: string; countKey: "total" | "matched" | "unmatched" | "highError" }> = [
  { mode: "all", label: "All", countKey: "total" },
  { mode: "matched", label: "Matched", countKey: "matched" },
  { mode: "unmatched", label: "Unmatched", countKey: "unmatched" },
  { mode: "highError", label: "High error", countKey: "highError" },
];

export type MatchState = "matched" | "partial" | "unmatched" | "reference";

export function rowMatchState(row: Record<string, string>): MatchState {
  // Corners define the bay frame; they aren't matched against typology
  // variants at all. Treat them as a separate "reference" state so the UI
  // doesn't flag them as failures.
  const pointType = String(row["point_type"] ?? "boss").trim().toLowerCase();
  if (pointType === "corner") return "reference";

  const explicit = String(row["match_state"] ?? "").trim().toLowerCase();
  if (explicit === "matched" || explicit === "partial" || explicit === "unmatched") {
    return explicit;
  }
  // Older CSVs without match_state: derive from x_cut/y_cut/matched.
  const matched = String(row["matched"] ?? "").trim().toLowerCase() === "true";
  if (matched) return "matched";
  const hasX = String(row["x_cut"] ?? "").trim().toLowerCase() !== "none" && row["x_cut"] !== "";
  const hasY = String(row["y_cut"] ?? "").trim().toLowerCase() !== "none" && row["y_cut"] !== "";
  return hasX || hasY ? "partial" : "unmatched";
}

function formatTemplateUv(row: Record<string, string>): string {
  // Honest rendering of the matched target ratio. For full matches the
  // backend already emits "[0.5, 0.5]"; for partial rows it emits "None" and
  // hides the axis that did hit. Reconstruct the partial form here so the
  // single column carries the full truth (no need to also show x_ratio /
  // y_ratio).
  const state = rowMatchState(row);
  const raw = String(row["template_uv"] ?? "");
  if (state !== "partial") {
    return formatCutTypologyValue(raw);
  }
  const xRatio = String(row["x_ratio"] ?? "").trim();
  const yRatio = String(row["y_ratio"] ?? "").trim();
  const xToken = xRatio && xRatio.toLowerCase() !== "none"
    ? formatCutTypologyValue(xRatio)
    : "-";
  const yToken = yRatio && yRatio.toLowerCase() !== "none"
    ? formatCutTypologyValue(yRatio)
    : "-";
  return `[${xToken}, ${yToken}]`;
}

import { REPORT_COLUMNS, filterReportColumns } from "./reportColumns";

// Diagnostic variant: these columns are part of the dataset but hidden in the
// default view to reduce visual noise. Users can re-enable them via the
// Columns picker; doing so also includes them in the CSV download.
const DEFAULT_HIDDEN_DIAGNOSTIC_COLUMNS: ReadonlySet<string> = new Set([
  "boss_id",
  "boss_xy",
  "template_xy",
  "matched",
  "x_ratio",
  "y_ratio",
]);

function getInitialSortDirection(column: string): "asc" | "desc" {
  return column === "uv_error" ? "desc" : "asc";
}

function getSortValue(row: MatchCsvRow, column: string): number | string {
  if (column === "boss_id") return Number(row[column] || 0);
  if (column === "matched" || column === "match_state") {
    // Sort order: matched > partial > reference (corners) > unmatched.
    // Corners aren't failures, so they group above true unmatched rows.
    const state = rowMatchState(row);
    if (state === "matched") return 3;
    if (state === "partial") return 2;
    if (state === "reference") return 1;
    return 0;
  }
  if (column === "uv_error") return parseUvErrorScore(row.uv_error);
  if (column === "point_label") return getCompactNodeLabel(row.point_label || row.boss_id).toLowerCase();
  return String(row[column] || "").toLowerCase();
}

function getReportColumnClass(column: string): string {
  switch (column) {
    case "boss_id":
      return "w-[56px]";
    case "point_label":
      return "w-[72px]";
    case "point_type":
      return "w-[76px]";
    case "x_cut":
    case "y_cut":
      return "w-[110px]";
    case "boss_uv":
      return "w-[150px]";
    case "template_uv":
      return "w-[100px]";
    case "uv_error":
      return "w-[145px]";
    case "matched":
    case "match_state":
      return "w-[96px]";
    default:
      return "w-[100px]";
  }
}

export function CutTypologyMatchTable({
  matchCsvColumns,
  matchCsvRows,
  isLoadingMatchCsv = false,
  className = "grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3",
  tableViewportClassName = "h-full",
  variant = "diagnostic",
  pageSize,
  showDownload = true,
}: CutTypologyMatchTableProps) {
  const [filterMode, setFilterMode] = useState<"all" | "matched" | "unmatched" | "highError">("all");
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: "asc" | "desc" }>({
    column: "uv_error",
    direction: "desc",
  });
  const [page, setPage] = useState(0);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set<string>());
  const [hasInitialisedVisibility, setHasInitialisedVisibility] = useState(false);
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

  const displayMatchCsvColumns = useMemo(() => {
    if (variant === "report") {
      return filterReportColumns(matchCsvColumns);
    }

    const filtered = matchCsvColumns.filter(
      (column) =>
        column !== "x_error" &&
        column !== "y_error" &&
        column !== "variant_label" &&
        column !== "template_type"
    );
    if (!filtered.includes("uv_error")) {
      const templateXyIndex = filtered.indexOf("template_xy");
      const insertAt = templateXyIndex >= 0 ? templateXyIndex + 1 : filtered.length;
      filtered.splice(insertAt, 0, "uv_error");
    }
    return filtered;
  }, [matchCsvColumns, variant]);

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

  const renderedColumns = useMemo(
    () => displayMatchCsvColumns.filter((column) => visibleColumns.has(column)),
    [displayMatchCsvColumns, visibleColumns]
  );

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

  const displayMatchCsvRows = useMemo<MatchCsvRow[]>(() => normaliseMatchCsvRows(matchCsvRows), [matchCsvRows]);
  const filteredDisplayMatchCsvRows = useMemo(() => {
    if (filterMode === "all") return displayMatchCsvRows;
    if (filterMode === "matched") {
      return displayMatchCsvRows.filter((row) => String(row.matched || "").toLowerCase() === "true");
    }
    if (filterMode === "unmatched") {
      // Corners are reference anchors, not failed matches — keep them out of
      // the "unmatched" bucket so the chip honestly counts true misses.
      return displayMatchCsvRows.filter((row) => {
        const state = rowMatchState(row);
        return state === "unmatched" || state === "partial";
      });
    }
    return displayMatchCsvRows.filter((row) => parseUvErrorScore(row.uv_error) > 0.005);
  }, [displayMatchCsvRows, filterMode]);

  const sortedDisplayMatchCsvRows = useMemo(() => {
    const rows = [...filteredDisplayMatchCsvRows];
    rows.sort((a, b) => {
      const column = sortConfig.column;
      const aValue = getSortValue(a, column);
      const bValue = getSortValue(b, column);

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return Number(a.boss_id || 0) - Number(b.boss_id || 0);
    });
    return rows;
  }, [filteredDisplayMatchCsvRows, sortConfig]);
  const hasPagination = typeof pageSize === "number" && pageSize > 0 && sortedDisplayMatchCsvRows.length > pageSize;
  const totalPages = hasPagination ? Math.ceil(sortedDisplayMatchCsvRows.length / pageSize) : 1;
  const visibleRows = hasPagination
    ? sortedDisplayMatchCsvRows.slice(page * pageSize, (page + 1) * pageSize)
    : sortedDisplayMatchCsvRows;

  useEffect(() => {
    setPage(0);
  }, [filterMode, sortConfig, pageSize]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages - 1));
  }, [totalPages]);

  const matchSummary = useMemo(() => {
    const total = displayMatchCsvRows.length;
    const isCornerRow = (row: MatchCsvRow) =>
      String(row.point_type || "boss").toLowerCase() === "corner";
    const bossRows = displayMatchCsvRows.filter((row) => !isCornerRow(row));
    const cornerRows = displayMatchCsvRows.filter(isCornerRow);
    const matched = displayMatchCsvRows.filter((row) => String(row.matched || "").toLowerCase() === "true").length;
    // "Unmatched" excludes corners (reference anchors) since they aren't
    // matched against any cut typology variant. Partial bosses are still
    // included here because they share the "didn't fully match" facet.
    const unmatched = displayMatchCsvRows.filter((row) => {
      const state = rowMatchState(row);
      return state === "unmatched" || state === "partial";
    }).length;
    const highError = displayMatchCsvRows.filter((row) => parseUvErrorScore(row.uv_error) > 0.005).length;
    const bossTotal = bossRows.length;
    const bossMatched = bossRows.filter((row) => String(row.matched || "").toLowerCase() === "true").length;
    const cornerCount = cornerRows.length;
    return {
      total,
      matched,
      unmatched,
      highError,
      bossTotal,
      bossMatched,
      cornerCount,
      matchedRate: bossTotal > 0 ? ((bossMatched / bossTotal) * 100).toFixed(1) : "0.0",
    };
  }, [displayMatchCsvRows]);

  const getSortIndicator = (column: string) => {
    if (sortConfig.column !== column) return "↕";
    return sortConfig.direction === "asc" ? "↑" : "↓";
  };

  const toggleSort = (column: string) => {
    setSortConfig((prev) => ({
      column,
      direction: prev.column === column
        ? prev.direction === "desc" ? "asc" : "desc"
        : getInitialSortDirection(column),
    }));
  };

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

  const getColumnClass = (column: string): string =>
    variant === "report" ? getReportColumnClass(column) : getMatchColumnClass(column);

  const handleDownloadMatchCsv = async () => {
    if (displayMatchCsvRows.length === 0 || renderedColumns.length === 0) return;
    const escapeValue = (raw: string) => {
      const value = String(raw ?? "");
      const escaped = value.replace(/"/g, "\"\"");
      return /[",\n]/.test(value) ? `"${escaped}"` : escaped;
    };
    const lines = [
      renderedColumns.map((column) => escapeValue(column)).join(","),
      ...displayMatchCsvRows.map((row) =>
        renderedColumns
          .map((column) => {
            if (column === "point_label") {
              return escapeValue(getCompactNodeLabel(row.point_label || row.boss_id) || row.point_label || "");
            }
            if (column === "template_uv") {
              return escapeValue(formatTemplateUv(row));
            }
            return escapeValue(formatCutTypologyValue(row[column]));
          })
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });

    const savePicker = (window as Window & { showSaveFilePicker?: (options: unknown) => Promise<any> }).showSaveFilePicker;
    if (typeof savePicker === "function") {
      try {
        const handle = await savePicker({
          suggestedName: "cut_typology_match.csv",
          types: [
            {
              description: "CSV file",
              accept: { "text/csv": [".csv"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch {
        // Fall back to browser download flow when picker is cancelled or unavailable.
      }
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cut_typology_match.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{matchSummary.total} rows</Badge>
        <Badge variant="outline">{matchSummary.bossMatched}/{matchSummary.bossTotal} boss matched ({matchSummary.matchedRate}%)</Badge>
        {matchSummary.cornerCount > 0 && (
          <Badge variant="outline" className="text-cyan-300 border-cyan-500/40">+{matchSummary.cornerCount} corner{matchSummary.cornerCount === 1 ? "" : "s"} (reference)</Badge>
        )}
        <Badge variant="outline" className="ml-auto">Sorted by {sortConfig.column} {sortConfig.direction === "desc" ? "↓" : "↑"}</Badge>
      </div>
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
      <div className="min-h-0 overflow-hidden rounded-md border border-border/30 bg-transparent">
        <div className={`${tableViewportClassName} w-full overflow-x-auto overflow-y-auto scrollbar-thin`}>
          {sortedDisplayMatchCsvRows.length === 0 || renderedColumns.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">
              {isLoadingMatchCsv
                ? "Loading CSV rows..."
                : renderedColumns.length === 0
                  ? "All columns hidden — open Columns to show at least one."
                  : "No rows for this filter."}
            </div>
          ) : (
            <table className="min-w-full table-fixed text-xs bg-transparent">
              <thead className="sticky top-0 bg-background/55 backdrop-blur">
                <tr className="border-b border-border">
                  {renderedColumns.map((column) => (
                    <th key={column} className={`text-left font-medium px-2 py-2 whitespace-nowrap leading-[18px] my-0.5 ${getColumnClass(column)} ${getStickyColumnClass(column, true)}`}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleSort(column)}
                      >
                        <span>{column}</span>
                        <span className="text-[10px] text-muted-foreground">{getSortIndicator(column)}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, rowIndex) => (
                  <tr key={`screen-row-${page}-${rowIndex}`} className={`${hasPagination ? "screen-only" : ""} border-b border-border/20 ${rowIndex % 2 === 0 ? "bg-background/5" : "bg-transparent"}`}>
                    {renderedColumns.map((column) => (
                      <td key={`${rowIndex}-${column}`} className={`px-2 py-1.5 text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap ${getColumnClass(column)} ${getStickyColumnClass(column)}`}>
                        {(column === "matched" || column === "match_state") ? (() => {
                          const state = rowMatchState(row);
                          const label = state.charAt(0).toUpperCase() + state.slice(1);
                          if (state === "partial") {
                            return <Badge variant="outline" className="border-amber-400 bg-amber-500/10 text-amber-300 uppercase tracking-wide">{label}</Badge>;
                          }
                          if (state === "reference") {
                            return <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-300 uppercase tracking-wide">{label}</Badge>;
                          }
                          return <Badge variant={state === "matched" ? "secondary" : "destructive"}>{label}</Badge>;
                        })() : column === "boss_id" ? (
                          <span className="text-muted-foreground">#{row.boss_id}</span>
                        ) : column === "point_label" ? (
                          (() => {
                            const isCorner = String(row.point_type || "boss").toLowerCase() === "corner";
                            const tag = getCompactNodeLabel(row.point_label || row.boss_id);
                            const tagIsNumeric = !tag || tag === String(row.boss_id ?? "");
                            if (tagIsNumeric) {
                              return <span className="text-muted-foreground">{row.point_label || ""}</span>;
                            }
                            return (
                              <span className={`text-xs font-semibold uppercase tracking-wide ${isCorner ? "text-cyan-300" : "text-amber-300"}`}>
                                {tag}
                              </span>
                            );
                          })()
                        ) : column === "uv_error" && variant === "diagnostic" ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span>{formatCutTypologyValue(row[column])}</span>
                            {(() => {
                              const severity = getUvErrorSeverity(parseUvErrorScore(row.uv_error));
                              return (
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${severity.className}`}>{severity.label}</span>
                              );
                            })()}
                          </div>
                        ) : (
                          column === "template_uv"
                            ? formatTemplateUv(row)
                            : formatCutTypologyValue(row[column])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {hasPagination && sortedDisplayMatchCsvRows.map((row, rowIndex) => (
                  <tr key={`print-row-${rowIndex}`} className={`print-only border-b border-border/20 ${rowIndex % 2 === 0 ? "bg-background/5" : "bg-transparent"}`}>
                    {renderedColumns.map((column) => (
                      <td key={`print-${rowIndex}-${column}`} className={`px-2 py-1.5 text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap ${getColumnClass(column)} ${getStickyColumnClass(column)}`}>
                        {(column === "matched" || column === "match_state") ? (() => {
                          const state = rowMatchState(row);
                          const label = state.charAt(0).toUpperCase() + state.slice(1);
                          if (state === "partial") {
                            return <Badge variant="outline" className="border-amber-400 bg-amber-500/10 text-amber-300 uppercase tracking-wide">{label}</Badge>;
                          }
                          if (state === "reference") {
                            return <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-300 uppercase tracking-wide">{label}</Badge>;
                          }
                          return <Badge variant={state === "matched" ? "secondary" : "destructive"}>{label}</Badge>;
                        })() : column === "boss_id" ? (
                          <span className="text-muted-foreground">#{row.boss_id}</span>
                        ) : column === "point_label" ? (
                          getCompactNodeLabel(row.point_label || row.boss_id) || row.point_label || ""
                        ) : (
                          column === "template_uv"
                            ? formatTemplateUv(row)
                            : formatCutTypologyValue(row[column])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/30 bg-background/80 pt-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setSortConfig({ column: "uv_error", direction: "desc" })}>
            Reset sort
          </Button>
          {hasPagination && (
            <div className="screen-only flex items-center gap-2 text-xs text-muted-foreground">
              <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => setPage((prev) => Math.max(0, prev - 1))} disabled={page === 0}>
                Prev
              </Button>
              <span className="tabular-nums">Page {page + 1} of {totalPages}</span>
              <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => setPage((prev) => Math.min(totalPages - 1, prev + 1))} disabled={page >= totalPages - 1}>
                Next
              </Button>
            </div>
          )}
        </div>
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
      </div>
    </div>
  );
}
