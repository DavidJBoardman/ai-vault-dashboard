"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Activity, Play, RefreshCw } from "lucide-react";

interface RoiBayProportionPanelProps {
  isAnalysing: boolean;
  hasSegmentations: boolean;
  onAnalyse: () => void;
  vaultRatio?: number;
  vaultRatioSuggestions?: Array<{ label: string; err: number }>;
  bossCount?: number;
  analysedAt?: string;
  autoCorrectRoi: boolean;
  onAutoCorrectRoiChange: (checked: boolean) => void;
  correctionApplied?: boolean;
}

function prettifyRatioLabel(label: string): string {
  return label
    .replace(/sqrt\(([^)]+)\)/g, "√$1")
    .replace(/\s+/g, "")
    .replace("*", "×");
}

function ratioQuality(err: number): { label: string; className: string } {
  if (err < 0.005) {
    return { label: "Close fit", className: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" };
  }
  if (err < 0.015) {
    return { label: "Plausible fit", className: "border-amber-400/40 bg-amber-500/10 text-amber-200" };
  }
  return { label: "Weak", className: "border-slate-500/40 bg-slate-500/10 text-slate-300" };
}

function interpretBestRatio(bestSuggestion: { label: string; err: number } | undefined): string | null {
  if (!bestSuggestion) return null;
  const ratio = prettifyRatioLabel(bestSuggestion.label);
  if (bestSuggestion.err < 0.005) {
    return `Saved ROI closely fits ${ratio}.`;
  }
  if (bestSuggestion.err < 0.015) {
    return `Saved ROI is plausibly close to ${ratio}; check against ribs and bosses.`;
  }
  return `No strong canonical ratio fit. Recheck the ROI before continuing.`;
}

export function RoiBayProportionPanel({
  isAnalysing,
  hasSegmentations,
  onAnalyse,
  vaultRatio,
  vaultRatioSuggestions = [],
  bossCount,
  analysedAt,
  autoCorrectRoi,
  onAutoCorrectRoiChange,
  correctionApplied,
}: RoiBayProportionPanelProps) {
  const sortedSuggestions = [...vaultRatioSuggestions].sort((a, b) => a.err - b.err);
  const bestSuggestion = sortedSuggestions[0];
  const quality = bestSuggestion ? ratioQuality(bestSuggestion.err) : null;
  const interpretation = interpretBestRatio(bestSuggestion);
  const correctionStatus =
    correctionApplied === undefined ? "Not run yet" : correctionApplied ? "Suggested ROI ready" : autoCorrectRoi ? "No better ROI found" : "Off";
  const correctionStatusClass =
    correctionApplied === undefined
      ? "border-slate-500/40 bg-slate-500/10 text-slate-300"
      : correctionApplied
        ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
        : autoCorrectRoi
          ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
          : "border-slate-500/40 bg-slate-500/10 text-slate-300";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Activity className="h-4 w-4" />
          A • Bay Proportion
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-1 px-5 pb-5">
        <div className="rounded-md border border-border p-3.5 space-y-3">
          {/* <p className="text-xs leading-5 text-muted-foreground">
            Analyse the saved ROI (bay frame), then compare the measured bay proportion with canonical planning ratios.
          </p> */}

          <div className="rounded-md border border-border px-3 py-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-medium">Use Suggested ROI <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Beta</span></p>
                <p className="text-[11px] text-muted-foreground">Optional. Runs a backend suggestion and enables ROI comparison after analysis.</p>
              </div>
              <Checkbox checked={autoCorrectRoi} onCheckedChange={(checked) => onAutoCorrectRoiChange(checked === true)} />
            </div>
            <span className={`inline-flex w-fit rounded border px-2 py-0.5 text-[10px] font-medium ${correctionStatusClass}`}>
              {correctionStatus}
            </span>
          </div>

          <Button onClick={onAnalyse} disabled={isAnalysing || !hasSegmentations} className="w-full gap-2">
            {isAnalysing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run Proportion Analysis
          </Button>

          {!hasSegmentations && (
            <p className="text-xs text-muted-foreground text-center">Run segmentation first to enable analysis.</p>
          )}
        </div>

        {vaultRatio !== undefined && (
          <div className="rounded-md border border-border p-3.5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Measured bay proportion (W/H)</p>
                <p className="text-2xl font-semibold leading-none mt-1">{vaultRatio.toFixed(4)}</p>
              </div>
              {bossCount !== undefined && (
                <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                  {bossCount} bosses used
                </span>
              )}
            </div>

            {bestSuggestion && (
              <div className="space-y-3 border-t border-border/80 pt-3">
                <div>
                  <p className="text-xs text-muted-foreground">Closest planning ratio</p>
                  <p className="mt-1 text-xl font-semibold text-amber-100">{prettifyRatioLabel(bestSuggestion.label)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    Deviation {bestSuggestion.err.toFixed(4)}
                  </span>
                  {quality && (
                    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${quality.className}`}>
                      {quality.label}
                    </span>
                  )}
                </div>
                {interpretation && (
                  <p className="rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {interpretation}
                  </p>
                )}
              </div>
            )}

            {sortedSuggestions.length > 1 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Other planning ratios</summary>
                <div className="mt-2 space-y-1.5 max-h-28 overflow-y-auto pr-1">
                  {sortedSuggestions.slice(0, 6).map((s, i) => (
                    <div key={`${s.label}-${i}`} className="flex items-center justify-between">
                      <span>{prettifyRatioLabel(s.label)}</span>
                      <span className="text-muted-foreground">{s.err.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {analysedAt && (
              <p className="text-xs text-muted-foreground border-t border-border/80 pt-3">
                Last analysed {new Date(analysedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
