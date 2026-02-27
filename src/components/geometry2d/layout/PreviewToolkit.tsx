"use client";

import { Button } from "@/components/ui/button";
import { Camera, Hand, MousePointer2, Redo2, RefreshCw, Undo2, ZoomIn, ZoomOut } from "lucide-react";

type InteractionMode = "select" | "pan";

interface PreviewToolkitProps {
  showSelectMode?: boolean;
  interactionMode: InteractionMode;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  isCapturing: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onInteractionModeChange: (mode: InteractionMode) => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
  onCapture: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function PreviewToolkit({
  showSelectMode = false,
  interactionMode,
  zoom,
  minZoom,
  maxZoom,
  isCapturing,
  canUndo = false,
  canRedo = false,
  onInteractionModeChange,
  onZoomOut,
  onZoomReset,
  onZoomIn,
  onCapture,
  onUndo,
  onRedo,
}: PreviewToolkitProps) {
  return (
    <div className="mt-2 flex items-center justify-center">
      <div className="flex items-center gap-1 rounded-md border border-border bg-background/90 px-2 py-1">
        {showSelectMode && (
          <Button
            variant={interactionMode === "select" ? "default" : "outline"}
            size="sm"
            onClick={() => onInteractionModeChange("select")}
            className="h-7 px-2 text-xs gap-1.5"
            title="Select and drag points"
          >
            <MousePointer2 className="w-3.5 h-3.5" />
            Select
          </Button>
        )}

        <Button
          variant={interactionMode === "pan" ? "default" : "outline"}
          size="sm"
          onClick={() => onInteractionModeChange("pan")}
          className="h-7 px-2 text-xs gap-1.5"
          title="Pan view"
        >
          <Hand className="w-3.5 h-3.5" />
          Pan
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onZoomOut}
          disabled={zoom <= minZoom}
          className="h-7 w-7 p-0"
          title="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onZoomReset}
          className="h-7 min-w-[3.25rem] px-2 text-xs font-mono"
          title="Reset zoom and pan"
        >
          {Math.round(zoom * 100)}%
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onZoomIn}
          disabled={zoom >= maxZoom}
          className="h-7 w-7 p-0"
          title="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onZoomReset}
          className="h-7 px-2 text-xs"
          title="Reset view"
        >
          Reset
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onCapture}
          disabled={isCapturing}
          className="h-7 px-2 text-xs gap-1.5"
          title="Save preview as PNG"
        >
          {isCapturing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          Shot
        </Button>

        {showSelectMode && (
          <>
            <div className="mx-1 h-5 w-px bg-border" />
            <Button
              variant="outline"
              size="sm"
              onClick={onUndo}
              disabled={!canUndo}
              className="h-7 w-7 p-0"
              title="Undo point edit"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRedo}
              disabled={!canRedo}
              className="h-7 w-7 p-0"
              title="Redo point edit"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
