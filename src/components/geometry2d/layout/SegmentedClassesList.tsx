"use client";

import { useEffect, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { GroupVisibilityInfo } from "@/components/geometry2d/types";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Segmentation } from "@/lib/store";

interface SegmentedClassesListProps {
  groupVisibility: Record<string, GroupVisibilityInfo>;
  groupedSegmentations?: Record<string, Segmentation[]>;
  onToggleGroup: (groupLabel: string) => void;
  onToggleSegmentation?: (segmentationId: string) => void;
}

export function SegmentedClassesList({
  groupVisibility,
  groupedSegmentations,
  onToggleGroup,
  onToggleSegmentation,
}: SegmentedClassesListProps) {
  const classLabels = Object.keys(groupVisibility);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      classLabels.forEach((label) => {
        if (!(label in next)) next[label] = false;
      });
      Object.keys(next).forEach((key) => {
        if (!classLabels.includes(key)) delete next[key];
      });
      return next;
    });
  }, [classLabels]);

  const toggleExpanded = (label: string) =>
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));

  return (
    <div className="space-y-1.5">
      {classLabels.map((label) => {
        const info = groupVisibility[label];
        const members = groupedSegmentations?.[label] ?? [];
        const isExpanded = expanded[label] ?? false;
        const canExpand = members.length > 0 && !!onToggleSegmentation;

        return (
          <div
            key={label}
            className="rounded-md border border-border/70 bg-background/40"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => canExpand && toggleExpanded(label)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                disabled={!canExpand}
              >
                {canExpand ? (
                  isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0" />
                )}
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: info.color }}
                />
                <span className="truncate text-sm capitalize">{label}</span>
              </button>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {info.visible}/{info.total}
                </span>
                <Checkbox
                  checked={info.visible > 0}
                  onCheckedChange={() => onToggleGroup(label)}
                />
              </div>
            </div>

            {canExpand && isExpanded && (
              <div className="space-y-1 border-t border-border/70 px-3 py-2">
                {members.map((seg) => (
                  <Label
                    key={seg.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="truncate text-xs capitalize">{seg.label}</span>
                    </div>
                    <Checkbox
                      checked={seg.visible}
                      onCheckedChange={() => onToggleSegmentation?.(seg.id)}
                    />
                  </Label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
