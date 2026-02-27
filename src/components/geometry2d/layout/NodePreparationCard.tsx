"use client";

import { useState } from "react";

import { Geometry2DNodePoint } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";

export type NodePointFilter = "all" | "inside" | "outside";

interface NodePreparationCardProps {
  titlePrefix?: string;
  points: Geometry2DNodePoint[];
  projectionResolution: number;
  totalPointsCount: number;
  selectedPointId?: number;
  filter: NodePointFilter;
  hasUnsavedChanges: boolean;
  isLoadingState: boolean;
  isSavingPoints: boolean;
  onFilterChange: (filter: TemplatePointFilter) => void;
  onSelectPoint: (pointId: number) => void;
  onPointChange: (pointId: number, patch: { x?: number; y?: number }) => void;
  onAddPoint: () => void;
  onRemovePoint: (pointId: number) => void;
  onSavePoints: () => void;
  onResetToDetected: () => void;
}

export function NodePreparationCard({
  titlePrefix,
  points,
  projectionResolution,
  totalPointsCount,
  selectedPointId,
  filter,
  hasUnsavedChanges,
  isLoadingState,
  isSavingPoints,
  onFilterChange,
  onSelectPoint,
  onPointChange,
  onAddPoint,
  onRemovePoint,
  onSavePoints,
  onResetToDetected,
}: NodePreparationCardProps) {
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});

  const formatCoord = (point: Geometry2DNodePoint, axis: "x" | "y") => {
    const pixelValue = axis === "x" ? point.x : point.y;
    if (Number.isFinite(pixelValue)) return String(Math.round(pixelValue));
    const uvValue = axis === "x" ? point.u : point.v;
    if (Number.isFinite(uvValue)) return String(Math.round(uvValue * projectionResolution));
    return "";
  };
  const draftKey = (pointId: number, axis: "x" | "y") => `${pointId}:${axis}`;
  const getInputValue = (point: Geometry2DNodePoint, axis: "x" | "y") =>
    draftInputs[draftKey(point.id, axis)] ?? formatCoord(point, axis);
  const commitDraft = (point: Geometry2DNodePoint, axis: "x" | "y") => {
    const key = draftKey(point.id, axis);
    const raw = draftInputs[key];
    if (raw === undefined) return;
    const next = Number(raw.trim());
    if (Number.isFinite(next)) {
      onPointChange(point.id, axis === "x" ? { x: next } : { y: next });
    }
    setDraftInputs((prev) => {
      const out = { ...prev };
      delete out[key];
      return out;
    });
  };

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-medium">{titlePrefix ? `${titlePrefix} Nodes` : "Nodes"}</CardTitle>
          {hasUnsavedChanges ? <Badge variant="secondary">Unsaved</Badge> : <Badge variant="outline">Saved</Badge>}
        </div>
        <CardDescription className="text-xs">
          Edit indexed nodes used for cut-typology matching and bay plan reconstruction
        </CardDescription>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-0 space-y-2">
        <p className="text-[10px] text-muted-foreground">Drag on preview or type pixel coordinates.</p>

        <div className="grid grid-cols-3 gap-1">
          <Button
            size="sm"
            variant={filter === "all" ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => onFilterChange("all")}
          >
            All
          </Button>
          <Button
            size="sm"
            variant={filter === "inside" ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => onFilterChange("inside")}
          >
            In ROI
          </Button>
          <Button
            size="sm"
            variant={filter === "outside" ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => onFilterChange("outside")}
          >
            Outside
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2.5" onClick={onAddPoint}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2.5" onClick={onResetToDetected}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>

        <ScrollArea className="h-[22.5rem] rounded-md border border-border">
          <div className="p-1.5 space-y-1.5">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur grid grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1fr)_4.25rem_1.75rem] gap-1.5 px-1.5 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <div>ID</div>
              <div className="whitespace-nowrap">X px</div>
              <div className="whitespace-nowrap">Y px</div>
              <div className="text-center whitespace-nowrap">Src / ROI</div>
              <div />
            </div>
            {points.map((point) => (
              <div
                key={point.id}
                className={`grid grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1fr)_4.25rem_1.75rem] gap-1.5 items-center rounded border px-1.5 py-1.5 cursor-pointer ${
                  selectedPointId === point.id
                    ? "border-primary/70 bg-primary/10"
                    : "border-border/70"
                }`}
                onClick={() => onSelectPoint(point.id)}
              >
                <div className="text-xs font-medium">#{point.id}</div>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="h-7 text-[12px] text-foreground font-mono px-2"
                  value={getInputValue(point, "x")}
                  onChange={(event) =>
                    setDraftInputs((prev) => ({
                      ...prev,
                      [draftKey(point.id, "x")]: event.target.value,
                    }))
                  }
                  onFocus={() => onSelectPoint(point.id)}
                  onBlur={() => commitDraft(point, "x")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur();
                    if (event.key === "Escape") {
                      setDraftInputs((prev) => {
                        const out = { ...prev };
                        delete out[draftKey(point.id, "x")];
                        return out;
                      });
                      (event.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                />
                <Input
                  type="text"
                  inputMode="decimal"
                  className="h-7 text-[12px] text-foreground font-mono px-2"
                  value={getInputValue(point, "y")}
                  onChange={(event) =>
                    setDraftInputs((prev) => ({
                      ...prev,
                      [draftKey(point.id, "y")]: event.target.value,
                    }))
                  }
                  onFocus={() => onSelectPoint(point.id)}
                  onBlur={() => commitDraft(point, "y")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur();
                    if (event.key === "Escape") {
                      setDraftInputs((prev) => {
                        const out = { ...prev };
                        delete out[draftKey(point.id, "y")];
                        return out;
                      });
                      (event.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                />
                <div className="flex items-center justify-center gap-1">
                  <span className="rounded border border-border px-1 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {point.source === "manual" ? "M" : "A"}
                  </span>
                  <span
                    className={`rounded border px-1 py-0.5 text-[10px] uppercase ${
                      point.outOfBounds
                        ? "border-red-500/60 text-red-300"
                        : "border-emerald-500/60 text-emerald-300"
                    }`}
                  >
                    {point.outOfBounds ? "Out" : "In"}
                  </span>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemovePoint(point.id);
                    }}
                    disabled={totalPointsCount <= 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {points.length === 0 && <p className="p-2 text-xs text-muted-foreground">No points in this filter.</p>}
          </div>
        </ScrollArea>

        <Button
          onClick={onSavePoints}
          disabled={isLoadingState || isSavingPoints || !hasUnsavedChanges}
          className="w-full gap-2"
        >
          {isSavingPoints ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Nodes
        </Button>
      </CardContent>
    </Card>
  );
}
