"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Download, Circle, Hexagon, Star } from "lucide-react";

import { GeometryResult } from "@/components/geometry2d/types";

interface ExportPanelProps {
  result: GeometryResult | null;
  onExportCSV: () => void;
}

function getClassificationIcon(type: string) {
  switch (type) {
    case "starcut":
      return <Star className="w-5 h-5" />;
    case "circlecut":
      return <Circle className="w-5 h-5" />;
    case "starcirclecut":
      return <Hexagon className="w-5 h-5" />;
    default:
      return null;
  }
}

export function ExportPanel({ result, onExportCSV }: ExportPanelProps) {
  return (
    <>
      <Card className={cn(!result && "opacity-50")}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Classification</CardTitle>
        </CardHeader>
        <CardContent>
          {result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10">
                {getClassificationIcon(result.classification)}
                <div>
                  <p className="font-semibold capitalize">{result.classification}</p>
                  <p className="text-xs text-muted-foreground">Vault construction method</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                  <p className="text-xl font-bold text-primary">{result.px}</p>
                  <p className="text-xs text-muted-foreground">Px (X bays)</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                  <p className="text-xl font-bold text-primary">{result.py}</p>
                  <p className="text-xs text-muted-foreground">Py (Y bays)</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Run ROI setup first to prepare export data</p>
          )}
        </CardContent>
      </Card>

      <Card className={cn(!result && "opacity-50")}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Boss Stones</CardTitle>
          <CardDescription className="text-xs">{result ? `${result.bossStones.length} detected` : "Pending analysis"}</CardDescription>
        </CardHeader>
        <CardContent>
          {result ? (
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {result.bossStones.map((boss, i) => (
                <div key={i} className="flex items-center justify-between p-1.5 rounded bg-muted/50 text-sm">
                  <span>{boss.label}</span>
                  <span className="text-xs text-muted-foreground">
                    ({boss.x.toFixed(0)}, {boss.y.toFixed(0)})
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No boss stones detected</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <Button variant="outline" className="w-full gap-2" disabled={!result} onClick={onExportCSV}>
            <Download className="w-4 h-4" />
            Export Results (CSV)
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
