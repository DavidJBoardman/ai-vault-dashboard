"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Geometry2DCutTypologyOverlayVariant,
  Geometry2DCutTypologyParams,
  Geometry2DCutTypologyVariantResult,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { ChevronDown, ChevronUp, Download, EyeOff, FileText, Play, RefreshCw, Sparkles } from "lucide-react";
import {
  buildPerBossTypologySummary,
  getMatchColumnClass,
  getXyErrorSeverity,
  normaliseMatchCsvRows,
  parseXyErrorScore,
  rankOverlayVariants,
  type MatchCsvRow,
  variantLabelToTitle,
} from "./cutTypologyMatchingUtils";

const RESET_TEMPLATE_PARAMS: Geometry2DCutTypologyParams = {
  starcutMin: 2,
  starcutMax: 6,
  includeStarcut: true,
  includeInner: true,
  includeOuter: true,
  allowCrossTemplate: true,
  tolerance: 0.01,
};

interface CutTypologyMatchingPanelProps {
  headingPrefix?: string;
  params: Geometry2DCutTypologyParams;
  overlayVariants: Geometry2DCutTypologyOverlayVariant[];
  selectedOverlayLabels: string[];
  variantResults: Geometry2DCutTypologyVariantResult[];
  matchCsvColumns: string[];
  matchCsvRows: Array<Record<string, string>>;
  lastRunAt?: string;
  isLoadingState: boolean;
  isRunningMatching: boolean;
  isLoadingMatchCsv: boolean;
  onParamChange: (patch: Partial<Geometry2DCutTypologyParams>) => void;
  onOverlayToggle: (variantLabel: string, enabled: boolean) => void;
  onRunMatching: () => void;
  onHideAllOverlays: () => void;
  onShowPrimaryOverlays: () => void;
  onLoadMatchCsv: () => void;
  onGoToNodes: () => void;
}

export function CutTypologyMatchingPanel({
  headingPrefix,
  params,
  overlayVariants,
  selectedOverlayLabels,
  variantResults,
  matchCsvColumns,
  matchCsvRows,
  lastRunAt,
  isLoadingState,
  isRunningMatching,
  isLoadingMatchCsv,
  onParamChange,
  onOverlayToggle,
  onRunMatching,
  onHideAllOverlays,
  onShowPrimaryOverlays,
  onLoadMatchCsv,
  onGoToNodes,
}: CutTypologyMatchingPanelProps) {
  const [isMatchCsvOpen, setIsMatchCsvOpen] = useState(false);
  const [isTemplateOverlayOpen, setIsTemplateOverlayOpen] = useState(false);
  const [isAdvancedParamsOpen, setIsAdvancedParamsOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "matched" | "unmatched" | "highError">("all");
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: "asc" | "desc" }>({
    column: "xy_error",
    direction: "desc",
  });
  const variantResultsByLabel = new Map(variantResults.map((variant) => [variant.variantLabel, variant]));
  const rankedOverlayVariants = useMemo(
    () => [...overlayVariants].sort(rankOverlayVariants),
    [overlayVariants]
  );
  const matchingStatusLabel = isRunningMatching ? "Running" : lastRunAt ? "Match ready" : "Awaiting run";
  const formattedLastRunAt = lastRunAt ? new Date(lastRunAt).toLocaleString("en-GB") : null;
  const displayMatchCsvColumns = useMemo(() => {
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
  }, [matchCsvColumns]);
  const displayMatchCsvRows = useMemo<MatchCsvRow[]>(() => normaliseMatchCsvRows(matchCsvRows), [matchCsvRows]);
  const shouldAutoLoadCsv = !!lastRunAt && matchCsvRows.length === 0 && !isLoadingMatchCsv;
  useEffect(() => {
    if (shouldAutoLoadCsv) {
      onLoadMatchCsv();
    }
  }, [onLoadMatchCsv, shouldAutoLoadCsv]);
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
      let aValue: number | string = "";
      let bValue: number | string = "";
      if (column === "boss_id") {
        aValue = Number(a[column] || 0);
        bValue = Number(b[column] || 0);
      } else if (column === "matched") {
        aValue = String(a[column] || "").toLowerCase() === "true" ? 1 : 0;
        bValue = String(b[column] || "").toLowerCase() === "true" ? 1 : 0;
      } else if (column === "xy_error") {
        aValue = parseXyErrorScore(a.xy_error);
        bValue = parseXyErrorScore(b.xy_error);
      } else {
        aValue = String(a[column] || "").toLowerCase();
        bValue = String(b[column] || "").toLowerCase();
      }

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [filteredDisplayMatchCsvRows, sortConfig]);
  const matchSummary = useMemo(() => {
    const total = displayMatchCsvRows.length;
    const matched = displayMatchCsvRows.filter((row) => String(row.matched || "").toLowerCase() === "true").length;
    const unmatched = total - matched;
    const highError = displayMatchCsvRows.filter((row) => parseXyErrorScore(row.xy_error) > 0.005).length;
    return {
      total,
      matched,
      unmatched,
      highError,
      matchedRate: total > 0 ? ((matched / total) * 100).toFixed(1) : "0.0",
    };
  }, [displayMatchCsvRows]);
  const perBossSummary = useMemo(() => buildPerBossTypologySummary(displayMatchCsvRows), [displayMatchCsvRows]);
  const maxSummaryDetailCount = useMemo(
    () => Math.max(...(perBossSummary?.details.map(([, count]) => count) || [1])),
    [perBossSummary]
  );
  const getSortIndicator = (column: string) => {
    if (sortConfig.column !== column) return "↕";
    return sortConfig.direction === "asc" ? "↑" : "↓";
  };
  const toggleSort = (column: string) => {
    setSortConfig((prev) => ({
      column,
      direction: prev.column === column && prev.direction === "desc" ? "asc" : "desc",
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
        displayMatchCsvColumns.map((column) => escapeValue(row[column] || "")).join(",")
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
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {headingPrefix ? `${headingPrefix} Cut-Typology Match` : "Cut-Typology Match"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant={lastRunAt ? "secondary" : "outline"}>{matchingStatusLabel}</Badge>
            {formattedLastRunAt ? <span>Last run: {formattedLastRunAt}</span> : <span>Run matching to produce a recommendation.</span>}
          </div>

          {perBossSummary ? (
            <div className="rounded-md border border-border bg-card/40 p-4 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Node typology summary</p>
                    <p className="text-2xl font-semibold leading-none truncate">{perBossSummary.dominantFamily}</p>
                    <p className="text-sm text-muted-foreground">Largest matching group among the saved nodes</p>
                  </div>
                  <div className="shrink-0 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Coverage</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {perBossSummary.matchedRows}/{perBossSummary.totalRows}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {perBossSummary.matchedRows}/{perBossSummary.totalRows} nodes matched
                </Badge>
                {perBossSummary.unmatchedRows > 0 ? (
                  <Badge variant="outline">{perBossSummary.unmatchedRows} unmatched</Badge>
                ) : null}
              </div>
              {perBossSummary.details.length > 0 ? (
                <div className="space-y-2 border-t border-border/70 pt-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Distribution</p>
                  <div className="space-y-2">
                    {perBossSummary.details.map(([detail, count]) => (
                      <div key={`${detail}-${count}`} className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="truncate font-medium text-foreground">{detail}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-background/70 ring-1 ring-border/60">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#f7a600_0%,#ffd166_100%)]"
                              style={{ width: `${Math.max((count / maxSummaryDetailCount) * 100, 10)}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right text-sm font-semibold tabular-nums text-foreground">{count}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : lastRunAt ? (
            <div className="rounded-md border border-dashed border-border px-2.5 py-2">
              <p className="text-sm font-medium">Per-boss summary loading</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Loading the match CSV to build the typology summary from boss-by-boss evidence.
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border px-2.5 py-2">
              <p className="text-sm font-medium">No typology summary yet</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Run matching to assess the saved reference points against the available cut families.
              </p>
            </div>
          )}

          {perBossSummary && perBossSummary.unmatchedRows > 0 && (
            <div className="rounded-md border border-amber-500/35 bg-amber-500/10 p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-amber-200">
                    {perBossSummary.unmatchedRows} node{perBossSummary.unmatchedRows === 1 ? "" : "s"} did not find a match
                  </p>
                  <p className="text-[11px] text-amber-100/80">
                    These nodes are highlighted in the preview. Return to 4B to adjust their locations, then run matching again.
                  </p>
                </div>
                <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={onGoToNodes}>
                  Back to 4B
                </Button>
              </div>
            </div>
          )}

          <details
            open={isTemplateOverlayOpen}
            onToggle={(event) => setIsTemplateOverlayOpen((event.currentTarget as HTMLDetailsElement).open)}
            className="rounded-md border border-amber-400/30 bg-amber-500/[0.04] px-3 py-2"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
              <span className="inline-flex items-center gap-2">
                <span>Cut-Typology Overlay</span>
                {selectedOverlayLabels.length > 0 ? (
                  <span className="rounded-full border border-amber-300/35 bg-background/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-100/90">
                    {selectedOverlayLabels.length} shown
                  </span>
                ) : null}
              </span>
              {isTemplateOverlayOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </summary>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Compare the cuts associated with the current per-boss typology reading.
            </p>
            <div className="mt-2 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onHideAllOverlays}>
                  <EyeOff className="h-3.5 w-3.5" />
                  Hide grids
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  onClick={onShowPrimaryOverlays}
                  disabled={!perBossSummary || perBossSummary.overlayLabels.length === 0}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Show summary cuts
                </Button>
              </div>

              <ScrollArea className="h-36 rounded-md border border-border">
                <div className="p-2 space-y-1.5">
                  {rankedOverlayVariants.map((variant) => {
                    const checked = selectedOverlayLabels.includes(variant.variantLabel);
                    const result = variantResultsByLabel.get(variant.variantLabel);
                    return (
                      <div key={variant.variantLabel} className="rounded-md border border-border px-2 py-1.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(nextChecked) => onOverlayToggle(variant.variantLabel, nextChecked === true)}
                            />
                            <span className="text-xs font-medium">{variantLabelToTitle(variant)}</span>
                          </div>
                          {perBossSummary?.overlayLabels.includes(variant.variantLabel) && (
                            <Badge variant="secondary">summary</Badge>
                          )}
                        </div>
                        {result && (
                          <p className="text-[11px] text-muted-foreground">
                            coverage {(result.coverage * 100).toFixed(1)}% ({result.matchedCount} matched)
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {rankedOverlayVariants.length === 0 && (
                    <p className="text-xs text-muted-foreground p-2">Run ROI analysis first to load template overlays.</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </details>

          <details
            open={isAdvancedParamsOpen}
            onToggle={(event) => setIsAdvancedParamsOpen((event.currentTarget as HTMLDetailsElement).open)}
            className="rounded-md border border-border bg-card/40 px-3 py-2"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
              <span>Advanced parameters</span>
              {isAdvancedParamsOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </summary>
            <div className="mt-3 space-y-2.5">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => onParamChange(RESET_TEMPLATE_PARAMS)}
                >
                  Reset defaults
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Starcut min n</p>
                  <Input
                    type="number"
                    min={2}
                    max={12}
                    step={1}
                    value={params.starcutMin}
                    onChange={(event) => onParamChange({ starcutMin: Number(event.target.value) })}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Starcut max n</p>
                  <Input
                    type="number"
                    min={2}
                    step={1}
                    value={params.starcutMax}
                    onChange={(event) => onParamChange({ starcutMax: Number(event.target.value) })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="rounded-md border border-border px-2.5 py-2 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">Tolerance</span>
                  <span className="text-muted-foreground">{params.tolerance.toFixed(3)}</span>
                </div>
                <Slider
                  min={0.001}
                  max={0.1}
                  step={0.001}
                  value={[params.tolerance]}
                  onValueChange={(value) => onParamChange({ tolerance: value[0] ?? params.tolerance })}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
                  <p className="text-xs font-medium">Include standardcut grids</p>
                  <Checkbox
                    checked={params.includeStarcut}
                    onCheckedChange={(checked) => onParamChange({ includeStarcut: checked === true })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
                  <p className="text-xs font-medium">Include circlecut inner</p>
                  <Checkbox
                    checked={params.includeInner}
                    onCheckedChange={(checked) => onParamChange({ includeInner: checked === true })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
                  <p className="text-xs font-medium">Include circlecut outer</p>
                  <Checkbox
                    checked={params.includeOuter}
                    onCheckedChange={(checked) => onParamChange({ includeOuter: checked === true })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
                  <p className="text-xs font-medium">Allow cross templates</p>
                  <Checkbox
                    checked={params.allowCrossTemplate}
                    onCheckedChange={(checked) => onParamChange({ allowCrossTemplate: checked === true })}
                  />
                </div>
              </div>
            </div>
          </details>

          <div className="space-y-2">
            <Button
              onClick={onRunMatching}
              disabled={isLoadingState || isRunningMatching}
              className="h-12 w-full gap-2"
            >
              {isRunningMatching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {lastRunAt ? "Run matching again" : "Run matching"}
            </Button>

            <Button
              variant="outline"
              className="h-12 w-full items-center justify-between rounded-md border-border/80 bg-card/50 px-3 text-left hover:bg-card/70"
              onClick={() => {
                setIsMatchCsvOpen(true);
                onLoadMatchCsv();
              }}
              disabled={isRunningMatching || !lastRunAt}
            >
              <span className="flex min-w-0 items-center gap-2 pr-2">
                {isLoadingMatchCsv ? <RefreshCw className="h-4 w-4 shrink-0 animate-spin" /> : <FileText className="h-4 w-4 shrink-0" />}
                <span className="min-w-0 text-left">
                  <span className="block whitespace-normal text-sm font-medium leading-tight">Open match table</span>
                  <span className="block text-[11px] text-muted-foreground">Node-by-node evidence</span>
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-border/70 bg-background/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                {matchSummary.matched}/{matchSummary.total}
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isMatchCsvOpen} onOpenChange={setIsMatchCsvOpen}>
        <DialogContent className="flex w-[82vw] max-w-[1200px] max-h-[88vh] flex-col overflow-hidden border-border/40 bg-background/60 p-0 backdrop-blur-md">
          <DialogHeader className="px-5 pt-5 pb-1">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-base">Match table</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              Review boss-by-boss evidence, sort columns, and download the CSV file.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 px-5 pb-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{matchSummary.total} rows</Badge>
              <Badge variant="outline">{matchSummary.matched}/{matchSummary.total} matched ({matchSummary.matchedRate}%)</Badge>
              <Badge variant="outline" className="ml-auto">
                Sorted by {sortConfig.column} {sortConfig.direction === "desc" ? "↓" : "↑"}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={filterMode === "all" ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => setFilterMode("all")}
              >
                All ({matchSummary.total})
              </Button>
              <Button
                size="sm"
                variant={filterMode === "matched" ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => setFilterMode("matched")}
              >
                Matched ({matchSummary.matched})
              </Button>
              <Button
                size="sm"
                variant={filterMode === "unmatched" ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => setFilterMode("unmatched")}
              >
                Unmatched ({matchSummary.unmatched})
              </Button>
              <Button
                size="sm"
                variant={filterMode === "highError" ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => setFilterMode("highError")}
              >
                High error ({matchSummary.highError})
              </Button>
            </div>
            <div className="min-h-0 overflow-hidden rounded-md border border-border/30 bg-transparent">
              <div className="h-full w-full overflow-x-auto overflow-y-auto scrollbar-thin">
              {sortedDisplayMatchCsvRows.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">
                  {isLoadingMatchCsv ? "Loading CSV rows..." : "No rows for this filter."}
                </div>
              ) : (
                <table className="min-w-full table-fixed text-xs bg-transparent">
                  <thead className="sticky top-0 bg-background/55 backdrop-blur">
                    <tr className="border-b border-border">
                      {displayMatchCsvColumns.map((column) => (
                        <th
                          key={column}
                          className={`text-left font-medium px-2 py-2 whitespace-nowrap leading-[18px] my-0.5 ${getMatchColumnClass(column)} ${getStickyColumnClass(column, true)}`}
                        >
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
                    {sortedDisplayMatchCsvRows.map((row, rowIndex) => (
                      <tr key={`row-${rowIndex}`} className={`border-b border-border/20 ${rowIndex % 2 === 0 ? "bg-background/5" : "bg-transparent"}`}>
                        {displayMatchCsvColumns.map((column) => (
                          <td
                            key={`${rowIndex}-${column}`}
                            className={`px-2 py-1.5 text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap ${getMatchColumnClass(column)} ${getStickyColumnClass(column)}`}
                          >
                            {column === "matched" ? (
                              <Badge variant={String(row[column] || "").toLowerCase() === "true" ? "secondary" : "destructive"}>
                                {String(row[column] || "")}
                              </Badge>
                            ) : column === "xy_error" ? (
                              <div className="inline-flex items-center gap-1.5">
                                <span>{row[column] || ""}</span>
                                {(() => {
                                  const severity = getXyErrorSeverity(parseXyErrorScore(row.xy_error));
                                  return (
                                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${severity.className}`}>
                                      {severity.label}
                                    </span>
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
                  </tbody>
                </table>
              )}
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-between border-t border-border/30 bg-background/80 pt-3 backdrop-blur-sm">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setSortConfig({ column: "xy_error", direction: "desc" })}
              >
                Reset sort
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 min-w-[106px] justify-center gap-1.5"
                onClick={handleDownloadMatchCsv}
                disabled={isLoadingMatchCsv || displayMatchCsvRows.length === 0 || displayMatchCsvColumns.length === 0}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
