"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Play, RefreshCw } from "lucide-react";

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
  showOriginalRoi: boolean;
  onShowOriginalRoiChange: (checked: boolean) => void;
  showUpdatedRoi: boolean;
  onShowUpdatedRoiChange: (checked: boolean) => void;
  canShowUpdatedRoi: boolean;
}

function prettifyRatioLabel(label: string): string {
  return label
    .replace(/sqrt\(([^)]+)\)/g, "√$1")
    .replace(/\s+/g, "")
    .replace("*", "×");
}

function ratioQuality(err: number): { label: string; className: string } {
  if (err < 0.005) {
    return { label: "Excellent", className: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" };
  }
  if (err < 0.015) {
    return { label: "Good", className: "border-amber-400/40 bg-amber-500/10 text-amber-200" };
  }
  return { label: "Weak", className: "border-slate-500/40 bg-slate-500/10 text-slate-300" };
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
  showOriginalRoi,
  onShowOriginalRoiChange,
  showUpdatedRoi,
  onShowUpdatedRoiChange,
  canShowUpdatedRoi,
}: RoiBayProportionPanelProps) {
  const sortedSuggestions = [...vaultRatioSuggestions].sort((a, b) => a.err - b.err);
  const bestSuggestion = sortedSuggestions[0];
  const quality = bestSuggestion ? ratioQuality(bestSuggestion.err) : null;
  const correctionStatus =
    correctionApplied === undefined ? "Not run yet" : correctionApplied ? "Applied" : autoCorrectRoi ? "Skipped" : "Disabled";
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
        <CardTitle className="text-base font-medium">ROI & Bay Proportion</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-1 px-5 pb-5">
        <div className="rounded-md border border-border p-3.5 space-y-3">
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div className="space-y-1">
              <p className="text-xs font-medium">Auto-correct ROI (beta)</p>
              <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-medium ${correctionStatusClass}`}>
                {correctionStatus}
              </span>
            </div>
            <Checkbox checked={autoCorrectRoi} onCheckedChange={(checked) => onAutoCorrectRoiChange(checked === true)} />
          </div>

          <Button onClick={onAnalyse} disabled={isAnalysing || !hasSegmentations} className="w-full gap-2">
            {isAnalysing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run ROI Analyse
          </Button>

          {!hasSegmentations && (
            <p className="text-xs text-muted-foreground text-center">Run segmentation first to enable analysis</p>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Show Original ROI</p>
            </div>
            <Checkbox checked={showOriginalRoi} onCheckedChange={(checked) => onShowOriginalRoiChange(checked === true)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Show Updated ROI</p>
            </div>
            <Checkbox
              checked={showUpdatedRoi}
              onCheckedChange={(checked) => onShowUpdatedRoiChange(checked === true)}
              disabled={!canShowUpdatedRoi}
            />
          </div>
        </div>

        {vaultRatio !== undefined && (
          <div className="rounded-md border border-border p-3.5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Vault proportion</p>
                <p className="text-2xl font-semibold leading-none mt-1">{vaultRatio.toFixed(4)}</p>
              </div>
              {bossCount !== undefined && (
                <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                  {bossCount} bosses
                </span>
              )}
            </div>

            {bestSuggestion && (
              <div className="space-y-3 border-t border-border/80 pt-3">
                <div>
                  <p className="text-xs text-muted-foreground">Closest canonical ratio</p>
                  <p className="mt-1 text-xl font-semibold text-amber-100">{prettifyRatioLabel(bestSuggestion.label)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    Error {bestSuggestion.err.toFixed(4)}
                  </span>
                  {quality && (
                    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${quality.className}`}>
                      {quality.label}
                    </span>
                  )}
                </div>
              </div>
            )}

            {sortedSuggestions.length > 1 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">More ratio candidates</summary>
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
                Updated {new Date(analysedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
