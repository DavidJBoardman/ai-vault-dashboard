"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCompactNodeLabel } from "@/components/geometry2d/projectionCanvasUtils";
import {
  getMatchColumnClass,
  getXyErrorSeverity,
  normaliseMatchCsvRows,
  parseXyErrorScore,
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

const REPORT_COLUMNS = [
  "boss_id",
  "point_label",
  "point_type",
  "x_cut",
  "y_cut",
  "boss_uv",
  "template_uv",
  "xy_error",
  "matched",
];

function getInitialSortDirection(column: string): "asc" | "desc" {
  return column === "xy_error" ? "desc" : "asc";
}

function getSortValue(row: MatchCsvRow, column: string): number | string {
  if (column === "boss_id") return Number(row[column] || 0);
  if (column === "matched") return String(row[column] || "").toLowerCase() === "true" ? 1 : 0;
  if (column === "xy_error") return parseXyErrorScore(row.xy_error);
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
    case "xy_error":
      return "w-[145px]";
    case "matched":
      return "w-[76px]";
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
    column: "xy_error",
    direction: "desc",
  });
  const [page, setPage] = useState(0);

  const displayMatchCsvColumns = useMemo(() => {
    if (variant === "report") {
      const available = new Set(matchCsvColumns);
      return REPORT_COLUMNS.filter((column) => column === "xy_error" || available.has(column));
    }

    const filtered = matchCsvColumns.filter(
      (column) =>
        column !== "x_error" &&
        column !== "y_error" &&
        column !== "variant_label" &&
        column !== "template_type"
    );
    if (!filtered.includes("xy_error")) {
      const templateXyIndex = filtered.indexOf("template_xy");
      const insertAt = templateXyIndex >= 0 ? templateXyIndex + 1 : filtered.length;
      filtered.splice(insertAt, 0, "xy_error");
    }
    return filtered;
  }, [matchCsvColumns, variant]);

  const displayMatchCsvRows = useMemo<MatchCsvRow[]>(() => normaliseMatchCsvRows(matchCsvRows), [matchCsvRows]);
  const filteredDisplayMatchCsvRows = useMemo(() => {
    if (filterMode === "all") return displayMatchCsvRows;
    if (filterMode === "matched") {
      return displayMatchCsvRows.filter((row) => String(row.matched || "").toLowerCase() === "true");
    }
    if (filterMode === "unmatched") {
      return displayMatchCsvRows.filter((row) => String(row.matched || "").toLowerCase() !== "true");
    }
    return displayMatchCsvRows.filter((row) => parseXyErrorScore(row.xy_error) > 0.005);
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
    const unmatched = total - matched;
    const highError = displayMatchCsvRows.filter((row) => parseXyErrorScore(row.xy_error) > 0.005).length;
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
    if (column === "boss_id") {
      return `sticky left-0 ${isHeader ? "z-30 bg-background/55" : "z-20 bg-background/35"}`;
    }
    if (column === "x_cut") {
      return `sticky left-[64px] ${isHeader ? "z-30 bg-background/55" : "z-20 bg-background/35"}`;
    }
    return "";
  };

  const getColumnClass = (column: string): string =>
    variant === "report" ? getReportColumnClass(column) : getMatchColumnClass(column);

  const handleDownloadMatchCsv = async () => {
    if (displayMatchCsvRows.length === 0 || displayMatchCsvColumns.length === 0) return;
    const escapeValue = (raw: string) => {
      const value = String(raw ?? "");
      const escaped = value.replace(/"/g, "\"\"");
      return /[",\n]/.test(value) ? `"${escaped}"` : escaped;
    };
    const lines = [
      displayMatchCsvColumns.map((column) => escapeValue(column)).join(","),
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
      <div className="min-h-0 overflow-hidden rounded-md border border-border/30 bg-transparent">
        <div className={`${tableViewportClassName} w-full overflow-x-auto overflow-y-auto scrollbar-thin`}>
          {sortedDisplayMatchCsvRows.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">
              {isLoadingMatchCsv ? "Loading CSV rows..." : "No rows for this filter."}
            </div>
          ) : (
            <table className="min-w-full table-fixed text-xs bg-transparent">
              <thead className="sticky top-0 bg-background/55 backdrop-blur">
                <tr className="border-b border-border">
                  {displayMatchCsvColumns.map((column) => (
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
                    {displayMatchCsvColumns.map((column) => (
                      <td key={`${rowIndex}-${column}`} className={`px-2 py-1.5 text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap ${getColumnClass(column)} ${getStickyColumnClass(column)}`}>
                        {column === "matched" ? (
                          <Badge variant={String(row[column] || "").toLowerCase() === "true" ? "secondary" : "destructive"}>{String(row[column] || "")}</Badge>
                        ) : column === "boss_id" ? (
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
                        ) : column === "xy_error" && variant === "diagnostic" ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span>{row[column] || ""}</span>
                            {(() => {
                              const severity = getXyErrorSeverity(parseXyErrorScore(row.xy_error));
                              return (
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${severity.className}`}>{severity.label}</span>
                              );
                            })()}
                          </div>
                        ) : (
                          row[column] || ""
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {hasPagination && sortedDisplayMatchCsvRows.map((row, rowIndex) => (
                  <tr key={`print-row-${rowIndex}`} className={`print-only border-b border-border/20 ${rowIndex % 2 === 0 ? "bg-background/5" : "bg-transparent"}`}>
                    {displayMatchCsvColumns.map((column) => (
                      <td key={`print-${rowIndex}-${column}`} className={`px-2 py-1.5 text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap ${getColumnClass(column)} ${getStickyColumnClass(column)}`}>
                        {column === "matched" ? (
                          <Badge variant={String(row[column] || "").toLowerCase() === "true" ? "secondary" : "destructive"}>{String(row[column] || "")}</Badge>
                        ) : column === "boss_id" ? (
                          <span className="text-muted-foreground">#{row.boss_id}</span>
                        ) : column === "point_label" ? (
                          getCompactNodeLabel(row.point_label || row.boss_id) || row.point_label || ""
                        ) : (
                          row[column] || ""
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
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setSortConfig({ column: "xy_error", direction: "desc" })}>
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
          <Button type="button" size="sm" className="h-8 min-w-[106px] justify-center gap-1.5" onClick={handleDownloadMatchCsv} disabled={isLoadingMatchCsv || displayMatchCsvRows.length === 0 || displayMatchCsvColumns.length === 0}>
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        )}
      </div>
    </div>
  );
}
