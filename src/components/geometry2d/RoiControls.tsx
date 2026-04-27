"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Info, RefreshCw, RotateCcw, RotateCw, Save, Square } from "lucide-react";

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
  onResetROI: () => void;
  onSaveROI: () => void;
  isSavingROI: boolean;
  hasSegmentations: boolean;
  roiSaveResult: { inside: number; outside: number } | null;
  isRoiImportedFromStep3?: boolean;
}

export function RoiControls({
  showROI,
  onShowROIChange,
  roi,
  onRotationChange,
  onResetROI,
  onSaveROI,
  isSavingROI,
  hasSegmentations,
  roiSaveResult,
  isRoiImportedFromStep3,
}: RoiControlsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Square className="h-4 w-4" />
          A • ROI (Bay Frame)
        </CardTitle>
        <CardDescription className="text-xs">
          Edit and save the working ROI before running the analysis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isRoiImportedFromStep3 && (
          <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-2">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-400" />
            <p className="text-xs text-blue-300 leading-snug">
              Starting point imported from Step 3. Adjust as needed, then save.
            </p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <Label className="text-sm">Edit ROI</Label>
          <Checkbox checked={showROI} onCheckedChange={(checked) => onShowROIChange(!!checked)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm flex items-center gap-2">
            <RotateCw className="w-3 h-3" />
            ROI rotation: {Math.round(roi.rotation)}°
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
          <p>Turn this off after analysis to review the saved and suggested ROI overlays.</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onResetROI}
            disabled={isSavingROI}
            className="gap-2"
            size="sm"
          >
            <RotateCcw className="w-4 h-4" />
            Reset ROI
          </Button>
          <Button
            onClick={onSaveROI}
            disabled={isSavingROI || !hasSegmentations}
            className="gap-2"
            size="sm"
          >
            {isSavingROI ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save ROI
          </Button>
        </div>

        {roiSaveResult && (
          <div className="p-2 rounded-md bg-primary/10 border border-primary/20">
            <p className="text-xs font-medium text-primary">ROI Saved</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
