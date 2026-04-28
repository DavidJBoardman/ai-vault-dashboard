"use client";

import { RefObject, useState } from "react";

export interface ROIState {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

type InteractionMode = "none" | "moving" | "resizing" | "rotating";
type ResizeHandle = "n" | "e" | "s" | "w" | "nw" | "ne" | "se" | "sw";

interface UseRoiInteractionParams {
  canvasRef: RefObject<HTMLDivElement>;
  showROI: boolean;
  roi: ROIState;
  setRoi: React.Dispatch<React.SetStateAction<ROIState>>;
}

function getROICorners(r: ROIState): number[][] {
  const cos = Math.cos((r.rotation * Math.PI) / 180);
  const sin = Math.sin((r.rotation * Math.PI) / 180);
  const hw = r.width / 2;
  const hh = r.height / 2;
  const corners = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  return corners.map(([cx, cy]) => [r.x + cx * cos - cy * sin, r.y + cx * sin + cy * cos]);
}

function isInsideROI(pos: { x: number; y: number }, r: ROIState): boolean {
  const cos = Math.cos((-r.rotation * Math.PI) / 180);
  const sin = Math.sin((-r.rotation * Math.PI) / 180);
  const dx = pos.x - r.x;
  const dy = pos.y - r.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return Math.abs(localX) < r.width / 2 && Math.abs(localY) < r.height / 2;
}

function getResizeHandle(pos: { x: number; y: number }, r: ROIState): string | null {
  const corners = getROICorners(r);
  const threshold = 0.04;
  const handleNames = ["nw", "ne", "se", "sw"];
  for (let i = 0; i < corners.length; i++) {
    const dist = Math.hypot(pos.x - corners[i][0], pos.y - corners[i][1]);
    if (dist < threshold) return handleNames[i];
  }
  const topCenter = [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2];
  const rotateHandleOffset = 0.05;
  const cos = Math.cos((r.rotation * Math.PI) / 180);
  const sin = Math.sin((r.rotation * Math.PI) / 180);
  const rotateHandle = [topCenter[0] - rotateHandleOffset * sin, topCenter[1] - rotateHandleOffset * cos];
  const rotDist = Math.hypot(pos.x - rotateHandle[0], pos.y - rotateHandle[1]);
  if (rotDist < threshold) return "rotate";

  const edgeHandles: Array<[string, number[]]> = [
    ["n", topCenter],
    ["e", [(corners[1][0] + corners[2][0]) / 2, (corners[1][1] + corners[2][1]) / 2]],
    ["s", [(corners[2][0] + corners[3][0]) / 2, (corners[2][1] + corners[3][1]) / 2]],
    ["w", [(corners[3][0] + corners[0][0]) / 2, (corners[3][1] + corners[0][1]) / 2]],
  ];
  for (const [name, point] of edgeHandles) {
    const dist = Math.hypot(pos.x - point[0], pos.y - point[1]);
    if (dist < threshold) return name;
  }
  return null;
}

export function resizeRoiFromHandle(
  roi: ROIState,
  handle: ResizeHandle,
  localDx: number,
  localDy: number,
  minSize = 0.1
): ROIState {
  let halfWidth = roi.width / 2;
  let halfHeight = roi.height / 2;

  if (handle.includes("e")) halfWidth += localDx;
  if (handle.includes("w")) halfWidth -= localDx;
  if (handle.includes("s")) halfHeight += localDy;
  if (handle.includes("n")) halfHeight -= localDy;

  halfWidth = Math.max(minSize / 2, halfWidth);
  halfHeight = Math.max(minSize / 2, halfHeight);

  return {
    ...roi,
    width: halfWidth * 2,
    height: halfHeight * 2,
  };
}

export function useRoiInteraction({ canvasRef, showROI, roi, setRoi }: UseRoiInteractionParams) {
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("none");
  const [dragStart, setDragStart] = useState<{ x: number; y: number; roi: ROIState } | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);

  const getMousePosition = (e: React.MouseEvent<HTMLDivElement>): { x: number; y: number } | null => {
    if (!canvasRef.current) return null;
    const viewport = canvasRef.current.querySelector<HTMLElement>("[data-roi-viewport='true']");
    const rect = viewport?.getBoundingClientRect() || canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!showROI) return;
    const pos = getMousePosition(e);
    if (!pos) return;

    const handle = getResizeHandle(pos, roi);
    if (handle) {
      if (handle === "rotate") {
        setInteractionMode("rotating");
      } else {
        setInteractionMode("resizing");
        setResizeHandle(handle);
      }
      setDragStart({ x: pos.x, y: pos.y, roi: { ...roi } });
    } else if (isInsideROI(pos, roi)) {
      setInteractionMode("moving");
      setDragStart({ x: pos.x, y: pos.y, roi: { ...roi } });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStart || interactionMode === "none") return;
    const pos = getMousePosition(e);
    if (!pos) return;

    const dx = pos.x - dragStart.x;
    const dy = pos.y - dragStart.y;

    if (interactionMode === "moving") {
      setRoi({
        ...dragStart.roi,
        x: Math.max(0.1, Math.min(0.9, dragStart.roi.x + dx)),
        y: Math.max(0.1, Math.min(0.9, dragStart.roi.y + dy)),
      });
    } else if (interactionMode === "rotating") {
      const angle = Math.atan2(pos.y - roi.y, pos.x - roi.x);
      const startAngle = Math.atan2(dragStart.y - dragStart.roi.y, dragStart.x - dragStart.roi.x);
      const deltaAngle = ((angle - startAngle) * 180) / Math.PI;
      setRoi({
        ...dragStart.roi,
        rotation: dragStart.roi.rotation + deltaAngle,
      });
    } else if (interactionMode === "resizing" && resizeHandle) {
      const cos = Math.cos((-dragStart.roi.rotation * Math.PI) / 180);
      const sin = Math.sin((-dragStart.roi.rotation * Math.PI) / 180);
      const localDx = dx * cos - dy * sin;
      const localDy = dx * sin + dy * cos;

      setRoi(resizeRoiFromHandle(dragStart.roi, resizeHandle as ResizeHandle, localDx, localDy));
    }
  };

  const handleMouseUp = () => {
    setInteractionMode("none");
    setDragStart(null);
    setResizeHandle(null);
  };

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    getROICorners,
  };
}
