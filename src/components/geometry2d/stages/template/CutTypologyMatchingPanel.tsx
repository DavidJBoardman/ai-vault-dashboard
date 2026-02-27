"use client";

import { useMemo, useState } from "react";

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
import { Download, EyeOff, FileText, Play, RefreshCw, Sparkles } from "lucide-react";

interface CutTypologyMatchingPanelProps {
  headingPrefix?: string;
  params: Geometry2DCutTypologyParams;
  overlayVariants: Geometry2DCutTypologyOverlayVariant[];
  selectedOverlayLabels: string[];
  variantResults: Geometry2DCutTypologyVariantResult[];
  bestVariantLabel?: string;
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
  onShowBestOverlay: () => void;
  onLoadMatchCsv: () => void;
}

function variantLabelToTitle(variant: Geometry2DCutTypologyOverlayVariant): string {
  const fromLabel = (label?: string): string => {
    if (!label) return "unknown";
    if (label.startsWith("starcut_n=")) {
      const n = Number(label.split("=", 2)[1]);
      return Number.isFinite(n) ? `standardcut n=${n}` : "standardcut";
    }
    if (label === "circlecut_inner") return "circlecut inner";
    if (label === "circlecut_outer") return "circlecut outer";
    return label;
  };

  if (variant.templateType === "cross" || variant.isCrossTemplate) {
    return `cross (x: ${fromLabel(variant.xTemplate)}, y: ${fromLabel(variant.yTemplate)})`;
  }

  if (variant.templateType === "starcut" && typeof variant.n === "number") {
    return `standardcut n=${variant.n}`;
  }
  return fromLabel(variant.variantLabel);
}

function variantComplexityRank(variant: {
  templateType: string;
  variant: string;
  isCrossTemplate: boolean;
}) {
  if (variant.templateType === "starcut") return 0;
  if (variant.templateType === "circlecut") {
    return variant.variant === "inner" ? 1 : 2;
  }
  if (variant.templateType === "cross" || variant.isCrossTemplate) return 3;
  return 4;
}

function rankVariantResults(a: Geometry2DCutTypologyVariantResult, b: Geometry2DCutTypologyVariantResult) {
  if (a.matchedCount !== b.matchedCount) return b.matchedCount - a.matchedCount;

  const complexityDiff = variantComplexityRank(a) - variantComplexityRank(b);
  if (complexityDiff !== 0) return complexityDiff;

  const nA = typeof a.n === "number" ? a.n : Number.MAX_SAFE_INTEGER;
  const nB = typeof b.n === "number" ? b.n : Number.MAX_SAFE_INTEGER;
  if (nA !== nB) return nA - nB;

  return a.variantLabel.localeCompare(b.variantLabel);
}

function rankOverlayVariants(a: Geometry2DCutTypologyOverlayVariant, b: Geometry2DCutTypologyOverlayVariant) {
  const overlayGroupRank = (variant: {
    templateType: string;
    variant: string;
    isCrossTemplate: boolean;
  }) => {
    if (variant.templateType === "circlecut") return variant.variant === "inner" ? 0 : 1;
    if (variant.templateType === "starcut") return 2;
    if (variant.templateType === "cross" || variant.isCrossTemplate) return 3;
    return 4;
  };

  const groupDiff = overlayGroupRank(a) - overlayGroupRank(b);
  if (groupDiff !== 0) return groupDiff;

  const nA = typeof a.n === "number" ? a.n : Number.MAX_SAFE_INTEGER;
  const nB = typeof b.n === "number" ? b.n : Number.MAX_SAFE_INTEGER;
  if (nA !== nB) return nA - nB;

  return a.variantLabel.localeCompare(b.variantLabel);
}

function estimateBossTotal(variant: Geometry2DCutTypologyVariantResult): number {
  if (variant.coverage > 0) {
    return Math.max(variant.matchedCount, Math.round(variant.matchedCount / variant.coverage));
  }
  return variant.matchedCount;
}

function formatDecimalSix(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const raw = String(value).trim();
  if (!raw || raw.toLowerCase() === "none") return raw;
  const num = Number(raw);
  if (!Number.isFinite(num)) return raw;
  return num.toFixed(6);
}

function formatUvPair(value: string | undefined): string {
  if (!value) return "";
  const raw = value.trim();
  if (!raw || raw.toLowerCase() === "none") return raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length >= 2) {
      return `[${formatDecimalSix(parsed[0])}, ${formatDecimalSix(parsed[1])}]`;
    }
    return raw;
  } catch {
    return raw;
  }
}

function getMatchColumnClass(column: string): string {
  switch (column) {
    case "boss_id":
      return "w-[64px]";
    case "x_cut":
    case "y_cut":
      return "w-[132px]";
    case "boss_uv":
      return "w-[190px]";
    case "template_uv":
      return "w-[120px]";
    case "boss_xy":
    case "template_xy":
      return "w-[118px]";
    case "xy_error":
      return "w-[180px]";
    case "matched":
      return "w-[80px]";
    default:
      return "w-[120px]";
  }
}

export function CutTypologyMatchingPanel({
  headingPrefix,
  params,
  overlayVariants,
  selectedOverlayLabels,
  variantResults,
  bestVariantLabel,
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
  onShowBestOverlay,
  onLoadMatchCsv,
}: CutTypologyMatchingPanelProps) {
  const [isMatchCsvOpen, setIsMatchCsvOpen] = useState(false);
  const [isTemplateOverlayOpen, setIsTemplateOverlayOpen] = useState(false);
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
  const rankedVariants = useMemo(
    () => [...variantResults].sort(rankVariantResults),
    [variantResults]
  );
  const recommendedVariant = useMemo(() => {
    if (rankedVariants.length === 0) return undefined;
    if (!bestVariantLabel) return rankedVariants[0];
    return rankedVariants.find((variant) => variant.variantLabel === bestVariantLabel) || rankedVariants[0];
  }, [bestVariantLabel, rankedVariants]);
  const equivalentFits = useMemo(() => {
    if (!recommendedVariant) return [];
    return rankedVariants.filter(
      (variant) =>
        variant.variantLabel !== recommendedVariant.variantLabel &&
        variant.matchedCount === recommendedVariant.matchedCount
    );
  }, [rankedVariants, recommendedVariant]);
  const recommendedBossTotal = recommendedVariant ? estimateBossTotal(recommendedVariant) : 0;
  const recommendedIsFullMatch = !!recommendedVariant && recommendedVariant.matchedCount >= recommendedBossTotal;
  const recommendationReason = recommendedIsFullMatch
    ? "All bosses are matched. Simplest template was selected as the recommendation."
    : "Highest match count is prioritised, with simpler templates used as tie-breakers.";
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
  const displayMatchCsvRows = useMemo(() => {
    return matchCsvRows.map((row) => {
      const xError = formatDecimalSix(row.x_error);
      const yError = formatDecimalSix(row.y_error);
      return {
        ...row,
        boss_uv: formatUvPair(row.boss_uv),
        xy_error:
          (!xError || xError.toLowerCase() === "none") && (!yError || yError.toLowerCase() === "none")
            ? "None"
            : `[${xError || "None"}, ${yError || "None"}]`,
      };
    });
  }, [matchCsvRows]);
  const parseXyErrorScore = (value: string | undefined): number => {
    if (!value || value.toLowerCase() === "none") return -1;
    const match = value.match(/\[\s*([^,\]]+)\s*,\s*([^\]]+)\s*\]/);
    if (!match) return -1;
    const x = Number(match[1]);
    const y = Number(match[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
    return Math.abs(x) + Math.abs(y);
  };
  const getXyErrorSeverity = (score: number): { label: string; className: string } => {
    if (score < 0) return { label: "N/A", className: "bg-muted/40 text-muted-foreground" };
    if (score > 0.01) return { label: "High", className: "bg-red-500/20 text-red-300" };
    if (score > 0.005) return { label: "Med", className: "bg-amber-500/20 text-amber-300" };
    return { label: "Low", className: "bg-emerald-500/20 text-emerald-300" };
  };
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
            {headingPrefix ? `${headingPrefix} Run & Review` : "Run & Review"}
          </CardTitle>
          <CardDescription className="text-xs">
            Run matching, get a single recommendation, then compare equivalent alternatives if needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-border px-2.5 py-2 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Points status</span>
              <Badge variant="outline">Save points in table</Badge>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Matching status</span>
              <Badge variant={lastRunAt ? "secondary" : "outline"}>
                {lastRunAt ? "Run completed" : "Not run yet"}
              </Badge>
            </div>
          </div>

          <Button
            onClick={onRunMatching}
            disabled={isLoadingState || isRunningMatching}
            className="w-full gap-2"
          >
            {isRunningMatching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run Matching
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 gap-1.5"
            onClick={() => {
              setIsMatchCsvOpen(true);
              onLoadMatchCsv();
            }}
            disabled={isRunningMatching || !lastRunAt}
          >
            {isLoadingMatchCsv ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            View cut_typology_match
          </Button>

          {recommendedVariant && (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-2.5 space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Recommended</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{variantLabelToTitle(recommendedVariant)}</p>
                <Badge variant="secondary">best</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Fit {recommendedVariant.matchedCount}/{recommendedBossTotal} matched ({(recommendedVariant.coverage * 100).toFixed(1)}%)
              </p>
              <p className="text-[11px] text-muted-foreground">{recommendationReason}</p>
            </div>
          )}

          {equivalentFits.length > 0 && (
            <details className="rounded-md border border-border px-2.5 py-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Equivalent fits ({equivalentFits.length})
              </summary>
              <div className="mt-2 space-y-1.5">
                {equivalentFits.slice(0, 8).map((variant) => (
                  <div key={variant.variantLabel} className="flex items-center justify-between text-xs">
                    <span className="truncate">{variantLabelToTitle(variant)}</span>
                    <span className="text-muted-foreground">{variant.matchedCount} matched</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          <details
            open={isTemplateOverlayOpen}
            onToggle={(event) => setIsTemplateOverlayOpen((event.currentTarget as HTMLDetailsElement).open)}
            className="rounded-md border border-primary/45 bg-primary/5 px-2.5 py-2"
          >
            <summary className="cursor-pointer text-sm font-medium text-foreground">Cut-Typology Overlay</summary>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Important: compare template grids here to verify the recommendation visually.
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
                  onClick={onShowBestOverlay}
                  disabled={!bestVariantLabel}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Show best
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
                          {variant.variantLabel === bestVariantLabel && <Badge variant="secondary">best</Badge>}
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

          {lastRunAt && <p className="text-[11px] text-muted-foreground">Last run: {new Date(lastRunAt).toLocaleString()}</p>}
          <details>
            <summary className="text-xs cursor-pointer text-muted-foreground">Advanced parameters</summary>
            <div className="mt-3 space-y-2.5">
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
                    max={12}
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
        </CardContent>
      </Card>

      <Dialog open={isMatchCsvOpen} onOpenChange={setIsMatchCsvOpen}>
        <DialogContent className="flex w-[82vw] max-w-[1200px] max-h-[88vh] flex-col overflow-hidden border-border/40 bg-background/60 p-0 backdrop-blur-md">
          <DialogHeader className="px-5 pt-5 pb-1">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-base">cut_typology_match</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              Review match rows, sort columns, and download the CSV file.
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
