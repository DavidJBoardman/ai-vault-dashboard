"use client";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, RefreshCw } from "lucide-react";

interface CutTypologyTuningRowProps {
  tolerance: number;
  isLoadingState: boolean;
  isRunningMatching: boolean;
  hasRun: boolean;
  onToleranceChange: (tolerance: number) => void;
  onRunMatching: () => void;
}

export function CutTypologyTuningRow({
  tolerance,
  isLoadingState,
  isRunningMatching,
  hasRun,
  onToleranceChange,
  onRunMatching,
}: CutTypologyTuningRowProps) {
  const tolerancePercent = (tolerance * 100).toFixed(1);
  return (
    <div className="rounded-md border border-border bg-card/40 px-3 py-3 space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">Point-to-cut tolerance</span>
          <span className="font-semibold tabular-nums text-foreground">±{tolerancePercent}%</span>
        </div>
        <Slider
          min={0.001}
          max={0.1}
          step={0.001}
          value={[tolerance]}
          onValueChange={(value) => onToleranceChange(value[0] ?? tolerance)}
        />
        <div className="flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>Stricter</span>
          <span>Looser</span>
        </div>
      </div>
      <Button
        onClick={onRunMatching}
        disabled={isLoadingState || isRunningMatching}
        className="w-full gap-2"
      >
        {isRunningMatching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {hasRun ? "Run matching again" : "Run matching"}
      </Button>
    </div>
  );
}
