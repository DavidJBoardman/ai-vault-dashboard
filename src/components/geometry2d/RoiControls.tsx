"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { RefreshCw, RotateCw, Save, Square } from "lucide-react";

interface ROIState {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface RoiControlsProps {
  showROI: boolean;
  onShowROIChange: (checked: boolean) => void;
  roi: ROIState;
  onRotationChange: (rotation: number) => void;
  onSaveROI: () => void;
  isSavingROI: boolean;
  hasSegmentations: boolean;
  roiSaveResult: { inside: number; outside: number } | null;
}

export function RoiControls({
  showROI,
  onShowROIChange,
  roi,
  onRotationChange,
  onSaveROI,
  isSavingROI,
  hasSegmentations,
  roiSaveResult,
}: RoiControlsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Square className="w-4 h-4" />
          Region of Interest
        </CardTitle>
        <CardDescription className="text-xs">
          Drag to move, corners to resize, top handle to rotate
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Show ROI</Label>
          <Checkbox checked={showROI} onCheckedChange={(checked) => onShowROIChange(!!checked)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm flex items-center gap-2">
            <RotateCw className="w-3 h-3" />
            Rotation: {Math.round(roi.rotation)}°
          </Label>
          <Slider
            value={[roi.rotation]}
            onValueChange={([v]) => onRotationChange(v)}
            min={-180}
            max={180}
            step={1}
            className="w-full"
          />
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>Size: {Math.round(roi.width * 100)}% × {Math.round(roi.height * 100)}%</p>
          <p>Center: ({Math.round(roi.x * 100)}%, {Math.round(roi.y * 100)}%)</p>
        </div>

        <Button
          onClick={onSaveROI}
          disabled={isSavingROI || !hasSegmentations}
          className="w-full gap-2"
          size="sm"
        >
          {isSavingROI ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save ROI
        </Button>

        {roiSaveResult && (
          <div className="p-2 rounded-md bg-primary/10 border border-primary/20">
            <p className="text-xs font-medium text-primary">ROI Saved</p>
            <div className="flex gap-3 mt-1 text-xs">
              <span className="text-green-600">✓ {roiSaveResult.inside} inside</span>
              <span className="text-muted-foreground">{roiSaveResult.outside} outside</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

