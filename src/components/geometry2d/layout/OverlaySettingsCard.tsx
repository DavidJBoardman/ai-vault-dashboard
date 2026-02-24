"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface OverlaySettingsCardProps {
  showMaskOverlay: boolean;
  onShowMaskOverlayChange: (checked: boolean) => void;
  overlayOpacity: number;
  onOverlayOpacityChange: (value: number) => void;
}

export function OverlaySettingsCard({
  showMaskOverlay,
  onShowMaskOverlayChange,
  overlayOpacity,
  onOverlayOpacityChange,
}: OverlaySettingsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Overlay Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Show Masks</Label>
          <Checkbox
            checked={showMaskOverlay}
            onCheckedChange={(checked) => onShowMaskOverlayChange(!!checked)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Opacity: {Math.round(overlayOpacity * 100)}%</Label>
          <input
            type="range"
            min="0"
            max="100"
            value={overlayOpacity * 100}
            onChange={(e) => onOverlayOpacityChange(parseInt(e.target.value, 10) / 100)}
            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </CardContent>
    </Card>
  );
}
