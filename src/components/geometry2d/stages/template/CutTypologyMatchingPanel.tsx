"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  Geometry2DCutTypologyBossResult,
  Geometry2DCutTypologyOverlayVariant,
  Geometry2DCutTypologyParams,
  Geometry2DCutTypologyReading,
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
import { ChevronDown, ChevronUp, EyeOff, FileText, Play, RefreshCw, Sparkles } from "lucide-react";
import {
  buildPerBossTypologySummary,
  buildReadingSummary,
  normaliseMatchCsvRows,
  parseUvErrorScore,
  rankOverlayVariants,
  type MatchCsvRow,
  variantLabelToTitle,
} from "./cutTypologyMatchingUtils";
import { CutTypologyMatchTable } from "./CutTypologyMatchTable";

const RESET_TEMPLATE_PARAMS: Geometry2DCutTypologyParams = {
  starcutMin: 2,
  starcutMax: 6,
  includeStarcut: true,
  includeInner: true,
  includeOuter: true,
  allowCrossTemplate: false,
  tolerance: 0.03,
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
  advancedParamsFocusSignal?: number;
  selectedReading?: Geometry2DCutTypologyReading;
  perBoss?: Geometry2DCutTypologyBossResult[];
  onSelectReading: (reading: Geometry2DCutTypologyReading) => void;
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
  advancedParamsFocusSignal = 0,
  selectedReading,
  perBoss,
  onSelectReading,
}: CutTypologyMatchingPanelProps) {
  const [isMatchCsvOpen, setIsMatchCsvOpen] = useState(false);
  const [isTemplateOverlayOpen, setIsTemplateOverlayOpen] = useState(false);
  const [isAdvancedParamsOpen, setIsAdvancedParamsOpen] = useState(false);
  const advancedParamsRef = useRef<HTMLDetailsElement>(null);
  const variantResultsByLabel = new Map(variantResults.map((variant) => [variant.variantLabel, variant]));
  const rankedOverlayVariants = useMemo(
    () => [...overlayVariants].sort(rankOverlayVariants),
    [overlayVariants]
  );
  const matchingStatusLabel = isRunningMatching ? "Running" : lastRunAt ? "Match ready" : "Awaiting run";
  const formattedLastRunAt = lastRunAt ? new Date(lastRunAt).toLocaleString("en-GB") : null;
  const displayMatchCsvRows = useMemo<MatchCsvRow[]>(() => normaliseMatchCsvRows(matchCsvRows), [matchCsvRows]);
  const shouldAutoLoadCsv = !!lastRunAt && matchCsvRows.length === 0 && !isLoadingMatchCsv;
  useEffect(() => {
    if (shouldAutoLoadCsv) {
      onLoadMatchCsv();
    }
  }, [onLoadMatchCsv, shouldAutoLoadCsv]);
  useEffect(() => {
    if (advancedParamsFocusSignal <= 0) return;
    setIsAdvancedParamsOpen(true);
    window.requestAnimationFrame(() => {
      advancedParamsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [advancedParamsFocusSignal]);
  const matchSummary = useMemo(() => {
    const total = displayMatchCsvRows.length;
    const isCornerRow = (row: MatchCsvRow) =>
      String(row.point_type || "boss").toLowerCase() === "corner";
    // Corners overlay the template by construction, so we exclude them from
    // the matched-rate denominator and report them separately. The counters
    // for the All/Matched/Unmatched/High-error filter buttons keep counting
    // every row so the row totals still add up across the table.
    const bossRows = displayMatchCsvRows.filter((row) => !isCornerRow(row));
    const cornerRows = displayMatchCsvRows.filter(isCornerRow);
    const matched = displayMatchCsvRows.filter((row) => String(row.matched || "").toLowerCase() === "true").length;
    const unmatched = total - matched;
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
  const perBossSummary = useMemo(() => buildPerBossTypologySummary(displayMatchCsvRows), [displayMatchCsvRows]);
  const readingSummary = useMemo(
    () => (perBoss && perBoss.length > 0 ? buildReadingSummary(perBoss, selectedReading) : null),
    [perBoss, selectedReading],
  );
  const maxReadingDetailCount = useMemo(
    () => Math.max(...((readingSummary?.details.map(([, count]) => count)) || [1])),
    [readingSummary],
  );
  const maxSummaryDetailCount = useMemo(
    () => Math.max(...(perBossSummary?.details.map(([, count]) => count) || [1])),
    [perBossSummary]
  );
  const readingLabel = (reading: Geometry2DCutTypologyReading): string => {
    if (reading === "starcut") return "starcut";
    if (reading === "circlecut_inner") return "circlecut inner";
    if (reading === "circlecut_outer") return "circlecut outer";
    return "mixed (per-boss)";
  };
  const tolerancePercent = (params.tolerance * 100).toFixed(1);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Sparkles className="h-4 w-4" />
            {headingPrefix ? `${headingPrefix} Cut-Typology Match` : "Cut-Typology Match"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant={lastRunAt ? "secondary" : "outline"}>{matchingStatusLabel}</Badge>
            {formattedLastRunAt ? <span>Last run: {formattedLastRunAt}</span> : <span>Run matching to produce a recommendation.</span>}
          </div>

          {(perBossSummary || readingSummary) ? (
            <div className="rounded-md border border-border bg-card/40 p-4 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Node typology summary</p>
                    <p className="text-2xl font-semibold leading-none truncate">
                      {readingSummary ? readingLabel(readingSummary.reading) : perBossSummary?.dominantFamily}
                    </p>
                    <p className="text-sm text-muted-foreground">Largest matching group among the saved nodes</p>
                  </div>
                  <div className="shrink-0 rounded-md border border-border/80 bg-background/40 px-2.5 py-1.5 text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Coverage</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {readingSummary?.matchedRows ?? perBossSummary?.matchedRows ?? 0}/{readingSummary?.totalRows ?? perBossSummary?.totalRows ?? 0}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {readingSummary?.matchedRows ?? perBossSummary?.matchedRows ?? 0}/{readingSummary?.totalRows ?? perBossSummary?.totalRows ?? 0} nodes matched
                </Badge>
                {perBossSummary && perBossSummary.unmatchedRows > 0 ? (
                  <Badge variant="outline">{perBossSummary.unmatchedRows} unmatched</Badge>
                ) : null}
              </div>
              {readingSummary ? (
                <div className="space-y-2 border-t border-border/70 pt-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Reading</p>
                  <div className="space-y-1">
                    {readingSummary.options.map((opt) => {
                      const checked = opt.reading === readingSummary.reading;
                      return (
                        <label
                          key={opt.reading}
                          className="flex items-center justify-between gap-3 cursor-pointer rounded-md px-2 py-1.5 hover:bg-background/40"
                        >
                          <span className="flex items-center gap-2 text-xs">
                            <input
                              type="radio"
                              name="cut-typology-reading"
                              checked={checked}
                              onChange={() => onSelectReading(opt.reading)}
                              className="accent-amber-400"
                            />
                            <span className={checked ? "font-medium text-foreground" : "text-foreground/80"}>
                              {readingLabel(opt.reading)}
                            </span>
                            {opt.reading === readingSummary.recommended ? (
                              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">recommended</Badge>
                            ) : null}
                          </span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {opt.matched}/{opt.total}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {readingSummary && readingSummary.details.length > 0 ? (
                <div className="space-y-2 border-t border-border/70 pt-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Matched Node Cuts</p>
                  <div className="space-y-2">
                    {readingSummary.details.map(([detail, count]) => (
                      <div key={`${detail}-${count}`} className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="truncate font-medium text-foreground">{detail}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-background/70 ring-1 ring-border/60">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#f7a600_0%,#ffd166_100%)]"
                              style={{ width: `${Math.max((count / maxReadingDetailCount) * 100, 10)}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right text-sm font-semibold tabular-nums text-foreground">{count}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : perBossSummary && perBossSummary.details.length > 0 ? (
                <div className="space-y-2 border-t border-border/70 pt-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Matched Node Cuts</p>
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
            ref={advancedParamsRef}
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

              <div className="rounded-md border border-border px-2.5 py-2 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">Point-to-cut tolerance</span>
                  <span className="font-semibold tabular-nums text-foreground">±{tolerancePercent}%</span>
                </div>
                <Slider
                  min={0.001}
                  max={0.1}
                  step={0.001}
                  value={[params.tolerance]}
                  onValueChange={(value) => onParamChange({ tolerance: value[0] ?? params.tolerance })}
                />
                <div className="flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span>Stricter</span>
                  <span>Looser</span>
                </div>
                <div className="rounded-sm border border-border/60 bg-muted/40 px-2 py-1.5 text-xs leading-relaxed text-foreground/90">
                  <p>
                    <span className="font-semibold tabular-nums">{params.tolerance.toFixed(3)}</span>
                    {" = within "}
                    <span className="font-semibold">±{tolerancePercent}%</span>
                    {" of bay width/height."}
                  </p>
                  <p className="text-muted-foreground">
                    Lower is stricter; higher accepts rougher point placement.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
                  <p className="text-xs font-medium">Include starcut grids</p>
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
              </div>
            </div>
          </details>

          <div className="space-y-3">
            <Button
              onClick={onRunMatching}
              disabled={isLoadingState || isRunningMatching}
              className="w-full gap-2"
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
                {matchSummary.bossMatched}/{matchSummary.bossTotal}
                {matchSummary.cornerCount > 0 ? ` +${matchSummary.cornerCount}c` : ""}
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
          <CutTypologyMatchTable
            matchCsvColumns={matchCsvColumns}
            matchCsvRows={matchCsvRows}
            isLoadingMatchCsv={isLoadingMatchCsv}
            className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 px-5 pb-5"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
