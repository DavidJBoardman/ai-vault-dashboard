"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Geometry2DBayPlanRunResult } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Spline } from "lucide-react";

interface BayPlanReconstructionPanelProps {
  result: Geometry2DBayPlanRunResult | null;
  lastRunAt?: string;
  showOverlay: boolean;
  onShowOverlayChange: (checked: boolean) => void;
  isLoadingState: boolean;
  isRunning: boolean;
  onRun: () => void;
}

export function BayPlanReconstructionPanel({
  result,
  lastRunAt,
  showOverlay,
  onShowOverlayChange,
  isLoadingState,
  isRunning,
  onRun,
}: BayPlanReconstructionPanelProps) {
  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Bay Plan Reconstruction</CardTitle>
          <CardDescription className="text-xs">Run rib-aware reconstruction using prepared ideal node locations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
            <p className="text-xs font-medium">Show reconstruction overlay</p>
            <div className="flex items-center gap-2">
              <Checkbox id="show-reconstruction-overlay" checked={showOverlay} onCheckedChange={(checked) => onShowOverlayChange(checked === true)} />
              <Label htmlFor="show-reconstruction-overlay" className="text-xs">
                Show
              </Label>
            </div>
          </div>
          <Button className="w-full gap-2" onClick={onRun} disabled={isLoadingState || isRunning}>
            <RefreshCw className={`w-4 h-4 ${isRunning ? "animate-spin" : ""}`} />
            {isRunning ? "Running Reconstruction..." : "Run Reconstruction"}
          </Button>
          <p className="text-[11px] text-muted-foreground">Constraint families are gated from Step 3 rib masks; no manual constraint editing in this stage.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Spline className="w-4 h-4" />
            Run Summary
          </CardTitle>
          <CardDescription className="text-xs">{lastRunAt ? `Last run: ${new Date(lastRunAt).toLocaleString()}` : "No reconstruction run yet"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {result ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-border px-2 py-1.5">
                  <p className="text-muted-foreground">Nodes</p>
                  <p className="font-medium">{result.nodeCount}</p>
                </div>
                <div className="rounded border border-border px-2 py-1.5">
                  <p className="text-muted-foreground">Edges</p>
                  <p className="font-medium">{result.edgeCount}</p>
                </div>
                <div className="rounded border border-border px-2 py-1.5">
                  <p className="text-muted-foreground">Ideal Bosses Used</p>
                  <p className="font-medium">
                    {result.idealBossUsedCount}/{result.bossCount}
                  </p>
                </div>
                <div className="rounded border border-border px-2 py-1.5">
                  <p className="text-muted-foreground">Constraint Edges</p>
                  <p className="font-medium">{result.constraintEdgeCount}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {result.enabledConstraintFamilies.length > 0 ? (
                  result.enabledConstraintFamilies.map((family) => (
                    <Badge key={family} variant="secondary" className="text-[10px]">
                      {family}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    No gated families enabled
                  </Badge>
                )}
              </div>
              {result.fallbackApplied && (
                <p className="text-[11px] text-amber-300">
                  Fallback applied: {result.fallbackReason || "Rib support is weak."}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground break-all">
                Output: {result.outputImagePath || "Not saved (overlay-only run)"}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Run reconstruction to view node/edge statistics and gated families.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
