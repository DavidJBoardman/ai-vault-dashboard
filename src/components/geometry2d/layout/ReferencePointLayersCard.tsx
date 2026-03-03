"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { GroupVisibilityInfo } from "@/components/geometry2d/types";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReferencePointLayersCardProps {
  groupVisibility: Record<string, GroupVisibilityInfo>;
  showBaseImage: boolean;
  onShowBaseImageChange: (checked: boolean) => void;
  roiLabel: string;
  showRoi: boolean;
  onShowRoiChange: (checked: boolean) => void;
  onToggleGroup: (groupLabel: string) => void;
  collapsedDescription?: string;
  expandedDescription?: string;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  showToggle?: boolean;
}

export function ReferencePointLayersCard({
  groupVisibility,
  showBaseImage,
  onShowBaseImageChange,
  roiLabel,
  showRoi,
  onShowRoiChange,
  onToggleGroup,
  collapsedDescription = "Optional overlays for placing the reference points.",
  expandedDescription = "Show the ROI and any segmented classes needed to place the reference points.",
  expanded: expandedProp,
  onToggleExpanded,
  showToggle = true,
}: ReferencePointLayersCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = expandedProp ?? internalExpanded;
  const handleToggleExpanded = onToggleExpanded ?? (() => setInternalExpanded((prev) => !prev));
  const layerCount = Object.keys(groupVisibility).length + 2;
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
        {!expanded && (
          <CardDescription className="text-xs">
            {collapsedDescription}
          </CardDescription>
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          <CardDescription className="text-xs">
            {expandedDescription}
          </CardDescription>

          <Label className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/40 px-3 py-2">
            <span className="text-sm font-medium">Projection</span>
            <Checkbox checked={showBaseImage} onCheckedChange={(checked) => onShowBaseImageChange(checked === true)} />
          </Label>

          <Label className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/40 px-3 py-2">
            <span className="text-sm font-medium">{roiLabel}</span>
            <Checkbox checked={showRoi} onCheckedChange={(checked) => onShowRoiChange(checked === true)} />
          </Label>

          <div className="space-y-1.5 border-t border-border/70 pt-3">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Step 3 Segmented Classes</p>
            {Object.entries(groupVisibility).map(([label, info]) => (
              <Label
                key={label}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border/70 bg-background/40 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: info.color }} />
                  <span className="truncate text-sm">{label}</span>
                </div>
                <Checkbox checked={info.visible > 0} onCheckedChange={() => onToggleGroup(label)} />
              </Label>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
