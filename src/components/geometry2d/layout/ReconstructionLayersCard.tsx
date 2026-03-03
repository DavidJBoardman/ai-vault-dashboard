"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";
import {
  Geometry2DReconstructLayers,
  Geometry2DReconstructOverlayKey,
  Geometry2DSegmentationLayerOption,
  RECONSTRUCTION_OVERLAY_OPTIONS,
} from "@/components/geometry2d/types";

interface ReconstructionLayersCardProps {
  expanded: boolean;
  layers: Geometry2DReconstructLayers;
  segmentationLayers: Geometry2DSegmentationLayerOption[];
  onToggleExpanded?: () => void;
  onOverlayLayerChange: (key: Geometry2DReconstructOverlayKey, checked: boolean) => void;
  onSegmentationLayerChange: (groupId: string, checked: boolean) => void;
  showToggle?: boolean;
}

export function ReconstructionLayersCard({
  expanded,
  layers,
  segmentationLayers,
  onToggleExpanded,
  onOverlayLayerChange,
  onSegmentationLayerChange,
  showToggle = true,
}: ReconstructionLayersCardProps) {
  return (
    <Card>
      <CardContent className="space-y-3 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Layers className="h-4 w-4" />
            Layers
          </div>
          {showToggle && onToggleExpanded ? (
            <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={onToggleExpanded}>
              {expanded ? "Hide" : "Show"}
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          ) : null}
        </div>

        {expanded && (
          <div className="space-y-3">
            {segmentationLayers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Step 3 Segmented Classes
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {segmentationLayers.map((layer) => (
                    <Label
                      key={layer.groupId}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/15 px-3 py-2 text-xs font-medium"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: layer.color }} />
                        <span className="truncate">{layer.label}</span>
                      </div>
                      <Checkbox
                        checked={layers.visibleSegmentationGroups.includes(layer.groupId)}
                        onCheckedChange={(checked) => onSegmentationLayerChange(layer.groupId, checked === true)}
                      />
                    </Label>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Reconstruction Overlays
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {RECONSTRUCTION_OVERLAY_OPTIONS.map((layer) => (
                  <Label
                    key={layer.key}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/15 px-3 py-2 text-xs font-medium"
                  >
                    <span>{layer.label}</span>
                    <Checkbox
                      checked={layers[layer.key]}
                      onCheckedChange={(checked) => onOverlayLayerChange(layer.key, checked === true)}
                    />
                  </Label>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
