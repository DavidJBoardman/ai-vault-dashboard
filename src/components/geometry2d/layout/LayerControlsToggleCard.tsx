"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";

interface LayerControlsToggleCardProps {
  expanded: boolean;
  onToggle: () => void;
}

export function LayerControlsToggleCard({ expanded, onToggle }: LayerControlsToggleCardProps) {
  return (
    <Card>
      <CardContent className="py-2 px-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Layers className="w-4 h-4" />
            Layers
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5"
            onClick={onToggle}
          >
            {expanded ? "Hide" : "Show"}
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
