"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface RoiAccessCardProps {
  onGoToRoi: () => void;
}

export function RoiAccessCard({ onGoToRoi }: RoiAccessCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">ROI Controls</CardTitle>
        <CardDescription className="text-xs">
          ROI editing is available in the ROI & Geometric Analysis section
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onGoToRoi}
        >
          Go to ROI & Geometric Analysis
        </Button>
      </CardContent>
    </Card>
  );
}
