"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, Info, Layers } from "lucide-react";
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
  const layerCount = segmentationLayers.length + RECONSTRUCTION_OVERLAY_OPTIONS.length;
  const layerLabel = `${layerCount} ${layerCount === 1 ? "layer" : "layers"}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Layers className="h-4 w-4" />
            Layers
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {layerLabel}
            </Badge>
            {showToggle && onToggleExpanded ? (
              <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={onToggleExpanded}>
                {expanded ? "Hide" : "Show"}
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <CardDescription className="text-xs">
            Toggle the segmented classes and reconstruction overlays drawn on the bay preview.
          </CardDescription>

          {segmentationLayers.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Step 3 Segmented Classes
              </p>
              <div className="space-y-1.5">
                {segmentationLayers.map((layer) => (
                  <Label
                    key={layer.groupId}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border/70 bg-background/40 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: layer.color }} />
                      <span className="truncate text-sm">{layer.label}</span>
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

          <div className="space-y-2.5 border-t border-border/70 pt-3">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Reconstruction Overlays
            </p>
            <div className="space-y-1.5">
              {RECONSTRUCTION_OVERLAY_OPTIONS.map((layer) => (
                <Label
                  key={layer.key}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border/70 bg-background/40 px-3 py-2"
                >
                  <span className="text-sm font-medium">{layer.label}</span>
                  <Checkbox
                    checked={layers[layer.key]}
                    onCheckedChange={(checked) => onOverlayLayerChange(layer.key, checked === true)}
                  />
                </Label>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 border-t border-border/70 pt-3">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Edge Metrics
            </p>
            <div className="rounded-md border border-border/70 bg-background/40 px-3 py-2.5 text-[11px] leading-snug text-muted-foreground">
              <div className="flex items-center gap-1.5 text-foreground">
                <Info className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">Hover an edge to see these values</span>
              </div>
              <ul className="mt-1.5 space-y-1">
                <li>
                  <span className="font-medium text-foreground">Overlap</span> — fraction of a thin
                  corridor along the edge that intersects the rib mask. Higher = more visual support
                  from segmentation.
                </li>
                <li>
                  <span className="font-medium text-foreground">3rd boss pen.</span> — penalty 0–1
                  when another reference point lies close to this edge&apos;s line. High values flag
                  edges that probably misjoin across an intermediate node.
                </li>
                <li>
                  <span className="font-medium text-foreground">Edge score</span> — combined
                  candidate score driving selection. <em>n/a</em> for boundary edges (mandatory).
                </li>
                <li>
                  <span className="font-medium text-foreground">Mutual</span> — both endpoints
                  proposed each other as nearest neighbours in the angular search.
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
