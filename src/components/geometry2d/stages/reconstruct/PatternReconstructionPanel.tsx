"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { IntradosLine } from "@/lib/api";
import { RefreshCw, Spline } from "lucide-react";

interface PatternReconstructionPanelProps {
  intradosLines: IntradosLine[];
  showIntrados: boolean;
  onShowIntradosChange: (checked: boolean) => void;
}

export function PatternReconstructionPanel({
  intradosLines,
  showIntrados,
  onShowIntradosChange,
}: PatternReconstructionPanelProps) {
  const [includeCornerAnchors, setIncludeCornerAnchors] = useState(true);
  const [includeHalfAnchors, setIncludeHalfAnchors] = useState(false);
  const [includeCrossConstraints, setIncludeCrossConstraints] = useState(false);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Pattern Reconstruction</CardTitle>
          <CardDescription className="text-xs">Set constraints for Step06 Delaunay reconstruction</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
            <p className="text-xs font-medium">Include corner anchors</p>
            <Checkbox checked={includeCornerAnchors} onCheckedChange={(checked) => setIncludeCornerAnchors(checked === true)} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
            <p className="text-xs font-medium">Include half-edge anchors</p>
            <Checkbox checked={includeHalfAnchors} onCheckedChange={(checked) => setIncludeHalfAnchors(checked === true)} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
            <p className="text-xs font-medium">Include cross + diagonals constraints</p>
            <Checkbox checked={includeCrossConstraints} onCheckedChange={(checked) => setIncludeCrossConstraints(checked === true)} />
          </div>
          <Button className="w-full gap-2" disabled>
            <RefreshCw className="w-4 h-4" />
            Reconstruct Pattern (API pending)
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Frontend controls are staged. Backend route for Step06 execution is not exposed yet.
          </p>
        </CardContent>
      </Card>

      {intradosLines.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Spline className="w-4 h-4" />
                Intrados Lines
              </CardTitle>
              <div className="flex items-center gap-2">
                <Checkbox id="show-intrados" checked={showIntrados} onCheckedChange={(checked) => onShowIntradosChange(checked === true)} />
                <Label htmlFor="show-intrados" className="text-xs">
                  Show
                </Label>
              </div>
            </div>
            <CardDescription className="text-xs">Traced in Step 5 (Reprojection)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{intradosLines.length} intrados lines traced</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {intradosLines.map((line) => (
                  <div key={line.id} className="flex items-center justify-between p-1.5 rounded bg-muted/50 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: line.color }} />
                      <span>{line.label}</span>
                    </div>
                    <span className="text-muted-foreground">{line.lineLength} pts</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
