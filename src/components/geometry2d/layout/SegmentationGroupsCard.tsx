"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Layers } from "lucide-react";
import { GroupVisibilityInfo } from "@/components/geometry2d/types";

interface SegmentationGroupsCardProps {
  totalMasks: number;
  hasSegmentations: boolean;
  groupVisibility: Record<string, GroupVisibilityInfo>;
  onToggleAll: (visible: boolean) => void;
  onToggleGroup: (groupLabel: string) => void;
  onGoToSegmentation: () => void;
}

export function SegmentationGroupsCard({
  totalMasks,
  hasSegmentations,
  groupVisibility,
  onToggleAll,
  onToggleGroup,
  onGoToSegmentation,
}: SegmentationGroupsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Segmentation Groups
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {totalMasks} masks
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Toggle groups to show/hide on preview
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {hasSegmentations ? (
          <>
            <div className="flex gap-2 mb-3">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={() => onToggleAll(true)}
              >
                <Eye className="w-3 h-3 mr-1" />
                Show All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={() => onToggleAll(false)}
              >
                <EyeOff className="w-3 h-3 mr-1" />
                Hide All
              </Button>
            </div>

            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {Object.entries(groupVisibility).map(([label, info]) => (
                <div
                  key={label}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                    info.visible === info.total
                      ? "bg-primary/10 border border-primary/20"
                      : info.visible > 0
                        ? "bg-muted/50 border border-border"
                        : "bg-muted/30 border border-transparent opacity-60"
                  )}
                  onClick={() => onToggleGroup(label)}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: info.color }}
                  />
                  <span className="flex-1 text-sm truncate capitalize">{label}</span>
                  <Badge
                    variant={info.visible === info.total ? "default" : "secondary"}
                    className="text-xs px-1.5"
                  >
                    {info.visible}/{info.total}
                  </Badge>
                  {info.visible === info.total ? (
                    <Eye className="w-3.5 h-3.5 text-primary" />
                  ) : info.visible > 0 ? (
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No segmentations yet</p>
            <Button
              variant="link"
              size="sm"
              onClick={onGoToSegmentation}
            >
              Go to Segmentation
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
