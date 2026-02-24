"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Play, RefreshCw } from "lucide-react";

interface RoiGeometricAnalysisPanelProps {
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
  if (label === "1/sqrt(2)") return "1/sqrt(2) (square diagonal)";
  return label;
}

export function RoiGeometricAnalysisPanel({
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
}: RoiGeometricAnalysisPanelProps) {
  const sortedSuggestions = [...vaultRatioSuggestions].sort((a, b) => a.err - b.err);
  const bestSuggestion = sortedSuggestions[0];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">ROI & Geometric Analysis</CardTitle>
        <CardDescription className="text-xs">Prepare ROI, ratio and boss detection inputs</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={onAnalyse} disabled={isAnalysing || !hasSegmentations} className="w-full gap-2">
          {isAnalysing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run ROI Analysis
        </Button>

        {!hasSegmentations && (
          <p className="text-xs text-muted-foreground text-center">Run segmentation first to enable analysis</p>
        )}

        <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
          <div>
            <p className="text-xs font-medium">Auto-correct ROI</p>
            <p className="text-[11px] text-muted-foreground">Use detected bosses to refine ROI bounds</p>
          </div>
          <Checkbox checked={autoCorrectRoi} onCheckedChange={(checked) => onAutoCorrectRoiChange(checked === true)} />
        </div>

        <div className="rounded-md border border-border px-2.5 py-2 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Show Original ROI</p>
              <p className="text-[11px] text-muted-foreground">Comparison overlay only</p>
            </div>
            <Checkbox checked={showOriginalRoi} onCheckedChange={(checked) => onShowOriginalRoiChange(checked === true)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Show Updated ROI</p>
              <p className="text-[11px] text-muted-foreground">Comparison overlay only</p>
            </div>
            <Checkbox
              checked={showUpdatedRoi}
              onCheckedChange={(checked) => onShowUpdatedRoiChange(checked === true)}
              disabled={!canShowUpdatedRoi}
            />
          </div>
        </div>

        {correctionApplied !== undefined && (
          <p className="text-[11px] text-muted-foreground">
            ROI correction status: {correctionApplied ? "applied" : autoCorrectRoi ? "requested but not applied" : "disabled"}
          </p>
        )}

        {vaultRatio !== undefined && (
          <div className="rounded-md border border-border p-3 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Vault Proportion</p>
                <p className="text-lg font-semibold leading-none mt-1">{vaultRatio.toFixed(4)}</p>
              </div>
              {bossCount !== undefined && (
                <span className="text-[11px] px-2 py-1 rounded bg-muted text-muted-foreground">
                  {bossCount} bosses
                </span>
              )}
            </div>

            {bestSuggestion && (
              <div className="rounded bg-muted/50 px-2 py-1.5 text-xs">
                <span className="text-muted-foreground">Closest canonical ratio: </span>
                <span className="font-medium">{prettifyRatioLabel(bestSuggestion.label)}</span>
                <span className="text-muted-foreground"> (error {bestSuggestion.err.toFixed(4)})</span>
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
              <p className="text-[11px] text-muted-foreground">
                Updated {new Date(analysedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
