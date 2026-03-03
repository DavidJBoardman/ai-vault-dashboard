"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { GroupVisibilityInfo } from "@/components/geometry2d/types";
import { ChevronDown, ChevronUp, EyeOff, Layers } from "lucide-react";

interface RoiEvidenceLayersCardProps {
  hasSegmentations: boolean;
  groupVisibility: Record<string, GroupVisibilityInfo>;
  showBaseImage: boolean;
  onShowBaseImageChange: (checked: boolean) => void;
  showOriginalRoi: boolean;
  onShowOriginalRoiChange: (checked: boolean) => void;
  canShowOriginalRoi: boolean;
  showUpdatedRoi: boolean;
  onShowUpdatedRoiChange: (checked: boolean) => void;
  canShowUpdatedRoi: boolean;
  onToggleGroup: (groupLabel: string) => void;
  onHideAllGroups: () => void;
  onGoToSegmentation: () => void;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  showToggle?: boolean;
}

export function RoiEvidenceLayersCard({
  hasSegmentations,
  groupVisibility,
  showBaseImage,
  onShowBaseImageChange,
  showOriginalRoi,
  onShowOriginalRoiChange,
  canShowOriginalRoi,
  showUpdatedRoi,
  onShowUpdatedRoiChange,
  canShowUpdatedRoi,
  onToggleGroup,
  onHideAllGroups,
  onGoToSegmentation,
  expanded: expandedProp,
  onToggleExpanded,
  showToggle = true,
}: RoiEvidenceLayersCardProps) {
  const visibleGroupCount = Object.values(groupVisibility).filter((info) => info.visible > 0).length;
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = expandedProp ?? internalExpanded;
  const handleToggleExpanded = onToggleExpanded ?? (() => setInternalExpanded((prev) => !prev));
  const layerCount =
    1 +
    Object.keys(groupVisibility).length +
    (canShowOriginalRoi ? 1 : 0) +
    (canShowUpdatedRoi ? 1 : 0);
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
            {showToggle ? (
              <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={handleToggleExpanded}>
                {expanded ? "Hide" : "Show"}
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            ) : null}
          </div>
        </div>
        {/* {!expanded && (
          <CardDescription className="text-xs">
            Optional overlays for checking the ROI.
          </CardDescription>
        )} */}
      </CardHeader>
      {expanded && (
      <CardContent className="space-y-4">
        <CardDescription className="text-xs">
          Use only the overlays needed to judge the bay frame. 
        </CardDescription>
        <div className="space-y-2.5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Preview</p>
          <Label className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/40 px-3 py-2">
            <span className="text-sm font-medium">Projection</span>
            <Checkbox checked={showBaseImage} onCheckedChange={(checked) => onShowBaseImageChange(checked === true)} />
          </Label>
        </div>

        <div className="space-y-2.5 border-t border-border/70 pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Step 3 Segmented Classes</p>
            {visibleGroupCount > 0 && (
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onHideAllGroups}>
                <EyeOff className="h-3.5 w-3.5" />
                Hide All
              </Button>
            )}
          </div>

          {hasSegmentations ? (
            <div className="space-y-1.5">
              {Object.entries(groupVisibility).map(([label, info]) => (
                <Label
                  key={label}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border/70 bg-background/40 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: info.color }} />
                    <span className="truncate text-sm">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{info.total}</span>
                    <Checkbox checked={info.visible > 0} onCheckedChange={() => onToggleGroup(label)} />
                  </div>
                </Label>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
              No segmented classes available.
              <div>
                <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs" onClick={onGoToSegmentation}>
                  Go to Segmentation
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2.5 border-t border-border/70 pt-3">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">ROI Comparisons</p>

          <Label className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/40 px-3 py-2">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">Original ROI</span>
              <p className="text-[11px] text-muted-foreground">
                {canShowOriginalRoi ? "Compare the saved ROI." : "Available after analysis."}
              </p>
            </div>
            <Checkbox
              checked={canShowOriginalRoi && showOriginalRoi}
              onCheckedChange={(checked) => onShowOriginalRoiChange(checked === true)}
              disabled={!canShowOriginalRoi}
            />
          </Label>

          <Label className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/40 px-3 py-2">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">Updated ROI</span>
              <p className="text-[11px] text-muted-foreground">
                {canShowUpdatedRoi ? "Show the suggested comparison ROI." : "Available after analysis."}
              </p>
            </div>
            <Checkbox
              checked={canShowUpdatedRoi && showUpdatedRoi}
              onCheckedChange={(checked) => onShowUpdatedRoiChange(checked === true)}
              disabled={!canShowUpdatedRoi}
            />
          </Label>
        </div>
      </CardContent>
      )}
    </Card>
  );
}
