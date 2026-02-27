"use client";

import { RefObject, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Image as ImageIcon, RefreshCw } from "lucide-react";
import { PreviewToolkit } from "@/components/geometry2d/layout";

import { Segmentation } from "@/lib/store";
import {
  Geometry2DReconstructBossPoint,
  Geometry2DReconstructRunResult,
  IntradosLine,
  Geometry2DTemplateBossPoint,
  Geometry2DTemplateOverlayVariant,
} from "@/lib/api";
import { toImageSrc } from "@/lib/utils";

type ImageViewType = "colour" | "depthGrayscale" | "depthPlasma";
type BossHoverInfoMode = "none" | "nodes" | "matching";

interface ROIState {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface ProjectionCanvasProps {
  containerClassName?: string;
  selectedProjection: { settings?: { perspective?: string; resolution?: number } } | null;
  selectedImageType: ImageViewType;
  onImageTypeChange: (type: ImageViewType) => void;
  currentImage: string | undefined | null;
  canvasRef: RefObject<HTMLDivElement>;
  onMouseDown: React.MouseEventHandler<HTMLDivElement>;
  onMouseMove: React.MouseEventHandler<HTMLDivElement>;
  onMouseUp: React.MouseEventHandler<HTMLDivElement>;
  roiInteractive?: boolean;
  bossPointInteractive?: boolean;
  onBossPointSelect?: (pointId: number) => void;
  onBossPointMove?: (pointId: number, x: number, y: number) => void;
  onBossPointMoveEnd?: () => void;
  canUndoBossPoints?: boolean;
  canRedoBossPoints?: boolean;
  onUndoBossPoints?: () => void;
  onRedoBossPoints?: () => void;
  showMaskOverlay: boolean;
  visibleMasks: Segmentation[];
  overlayOpacity: number;
  showROI: boolean;
  roi: ROIState;
  originalRoi?: ROIState | null;
  correctedRoi?: ROIState | null;
  showOriginalOverlay?: boolean;
  showUpdatedOverlay?: boolean;
  showIntrados: boolean;
  intradosLines: IntradosLine[];
  isAnalysing: boolean;
  templateBossPoints?: Geometry2DTemplateBossPoint[];
  selectedBossPointId?: number;
  selectedTemplateOverlays?: Geometry2DTemplateOverlayVariant[];
  showReconstructionOverlay?: boolean;
  reconstructionResult?: Geometry2DReconstructRunResult | null;
  reconstructionPreviewBosses?: Geometry2DReconstructBossPoint[];
  enableViewportTools?: boolean;
  bossHoverInfoMode?: BossHoverInfoMode;
}

export function ProjectionCanvas({
  containerClassName,
  selectedProjection,
  selectedImageType,
  onImageTypeChange,
  currentImage,
  canvasRef,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  roiInteractive = true,
  bossPointInteractive = false,
  onBossPointSelect,
  onBossPointMove,
  onBossPointMoveEnd,
  canUndoBossPoints = false,
  canRedoBossPoints = false,
  onUndoBossPoints,
  onRedoBossPoints,
  showMaskOverlay,
  visibleMasks,
  overlayOpacity,
  showROI,
  roi,
  originalRoi,
  correctedRoi,
  showOriginalOverlay,
  showUpdatedOverlay,
  showIntrados,
  intradosLines,
  isAnalysing,
  templateBossPoints = [],
  selectedBossPointId,
  selectedTemplateOverlays = [],
  showReconstructionOverlay = false,
  reconstructionResult = null,
  reconstructionPreviewBosses = [],
  enableViewportTools = false,
  bossHoverInfoMode = "none",
}: ProjectionCanvasProps) {
  const ROI_AQUA = "#00ffd5";
  const ROI_AMBER = "#ffcf33";
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 3;
  const ZOOM_STEP = 0.25;
  const [draggingBossId, setDraggingBossId] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [interactionMode, setInteractionMode] = useState<"select" | "pan">("select");
  const [isPanningView, setIsPanningView] = useState(false);
  const [isCapturingPreview, setIsCapturingPreview] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [hoveredBoss, setHoveredBoss] = useState<{
    id: number;
    x: number;
    y: number;
    hostWidth: number;
    hostHeight: number;
    px: number;
    py: number;
    u: number;
    v: number;
    xTemplateLabel?: string | null;
    yTemplateLabel?: string | null;
    matched: boolean;
    outOfBounds: boolean;
  } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const showOriginalComparison = !!(showOriginalOverlay && originalRoi);
  const showUpdatedComparison = !!(showUpdatedOverlay && correctedRoi);
  const showComparisonLegend = showOriginalComparison || showUpdatedComparison;
  const showAnyRoiLayer = showROI || showOriginalComparison || showUpdatedComparison;
  const projectionResolution = selectedProjection?.settings?.resolution || 2048;
  const reconstructionNodes = reconstructionResult?.nodes || [];
  const reconstructionEdges = reconstructionResult?.edges || [];
  const runUsedBosses = reconstructionResult?.usedBosses || [];
  const idealBosses = reconstructionResult?.idealBosses || [];
  const usedBosses =
    runUsedBosses.length > 0
      ? runUsedBosses
      : idealBosses.length > 0
        ? idealBosses
        : reconstructionPreviewBosses.length > 0
          ? reconstructionPreviewBosses
          : reconstructionNodes
              .filter((node) => node.source === "boss")
              .map((node) => ({ id: node.id, x: node.x, y: node.y, source: "raw" }));
  const showReconstruction = showReconstructionOverlay && reconstructionEdges.length > 0;
  const showUsedBosses = showReconstructionOverlay && usedBosses.length > 0;
  const panActive = interactionMode === "pan" || isSpacePressed;

  useEffect(() => {
    if (!enableViewportTools) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setHoveredBoss(null);
      setInteractionMode("select");
    }
  }, [enableViewportTools]);

  useEffect(() => {
    const isTextInputTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTextInputTarget(event.target)) return;
      setIsSpacePressed(true);
      event.preventDefault();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      setIsSpacePressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const uvToNormalised = (u: number, v: number, roiState: ROIState) => {
    const angle = (roiState.rotation * Math.PI) / 180;
    const xLocal = (u - 0.5) * roiState.width;
    const yLocal = (v - 0.5) * roiState.height;
    const x = roiState.x + (Math.cos(angle) * xLocal) - (Math.sin(angle) * yLocal);
    const y = roiState.y + (Math.sin(angle) * xLocal) + (Math.cos(angle) * yLocal);
    return { x, y };
  };

  const variantStrokes = ["#22d3ee", "#f97316", "#22c55e", "#ef4444", "#eab308", "#0ea5e9"];

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const getViewportRect = (event: React.MouseEvent<HTMLDivElement>) =>
    viewportRef.current?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect();

  const findNearestBossAtPointer = (
    event: React.MouseEvent<HTMLDivElement>,
    requireInteractive = false
  ) => {
    if (templateBossPoints.length === 0) return null;
    if (requireInteractive && !bossPointInteractive) return null;
    const rect = getViewportRect(event);
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    let nearest: { id: number; distance: number } | null = null;
    for (const point of templateBossPoints) {
      const x = (point.x / projectionResolution) * rect.width;
      const y = (point.y / projectionResolution) * rect.height;
      const distance = Math.hypot(pointerX - x, pointerY - y);
      if (!nearest || distance < nearest.distance) {
        nearest = { id: point.id, distance };
      }
    }

    return nearest;
  };

  const toProjectionCoordinates = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = getViewportRect(event);
    const nx = clamp01((event.clientX - rect.left) / rect.width);
    const ny = clamp01((event.clientY - rect.top) / rect.height);
    return {
      x: nx * projectionResolution,
      y: ny * projectionResolution,
    };
  };

  const handleCanvasMouseDown: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (panActive) {
      setIsPanningView(true);
      setPanStart({
        x: event.clientX,
        y: event.clientY,
        panX: pan.x,
        panY: pan.y,
      });
      event.preventDefault();
      return;
    }
    if (bossPointInteractive) {
      const nearestBoss = findNearestBossAtPointer(event, true);
      if (nearestBoss && nearestBoss.distance <= 14) {
        onBossPointSelect?.(nearestBoss.id);
        setDraggingBossId(nearestBoss.id);
        event.preventDefault();
        return;
      }
    }
    if (roiInteractive) {
      onMouseDown(event);
    }
  };

  const handleCanvasMouseMove: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (isPanningView && panStart) {
      setPan({
        x: panStart.panX + (event.clientX - panStart.x),
        y: panStart.panY + (event.clientY - panStart.y),
      });
      event.preventDefault();
      return;
    }
    if (draggingBossId !== null && bossPointInteractive) {
      const next = toProjectionCoordinates(event);
      onBossPointMove?.(draggingBossId, next.x, next.y);
      setHoveredBoss(null);
      event.preventDefault();
      return;
    }
    if (bossHoverInfoMode !== "none" && !isPanningView && !panActive) {
      const nearestBoss = findNearestBossAtPointer(event);
      if (nearestBoss && nearestBoss.distance <= 11) {
        const point = templateBossPoints.find((candidate) => candidate.id === nearestBoss.id);
        const hostRect = event.currentTarget.getBoundingClientRect();
        if (point) {
          const hasXCut = !!point.matchedXTemplateLabel;
          const hasYCut = !!point.matchedYTemplateLabel;
          setHoveredBoss({
            id: point.id,
            x: event.clientX - hostRect.left,
            y: event.clientY - hostRect.top,
            hostWidth: hostRect.width,
            hostHeight: hostRect.height,
            px: point.x,
            py: point.y,
            u: point.u,
            v: point.v,
            xTemplateLabel: point.matchedXTemplateLabel,
            yTemplateLabel: point.matchedYTemplateLabel,
            matched: hasXCut && hasYCut,
            outOfBounds: point.outOfBounds,
          });
        }
      } else {
        setHoveredBoss(null);
      }
    }
    if (roiInteractive) {
      onMouseMove(event);
    }
  };

  const handleCanvasMouseUp: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (isPanningView) {
      setIsPanningView(false);
      setPanStart(null);
      event.preventDefault();
      return;
    }
    if (draggingBossId !== null) {
      setDraggingBossId(null);
      onBossPointMoveEnd?.();
      event.preventDefault();
      return;
    }
    if (roiInteractive) {
      onMouseUp(event);
    }
  };

  const handleCanvasMouseLeave: React.MouseEventHandler<HTMLDivElement> = (event) => {
    setHoveredBoss(null);
    handleCanvasMouseUp(event);
  };

  const handleWheelZoom: React.WheelEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    const containerRect = event.currentTarget.getBoundingClientRect();
    const centerX = containerRect.left + containerRect.width / 2;
    const centerY = containerRect.top + containerRect.height / 2;
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number((zoom * factor).toFixed(3))));
    if (nextZoom === zoom) return;
    const ratio = nextZoom / zoom;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    setPan((prev) => ({
      x: prev.x * ratio + dx * (1 - ratio),
      y: prev.y * ratio + dy * (1 - ratio),
    }));
    setZoom(nextZoom);
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(MAX_ZOOM, Number((prev + ZOOM_STEP).toFixed(2))));
  const handleZoomOut = () => setZoom((prev) => Math.max(MIN_ZOOM, Number((prev - ZOOM_STEP).toFixed(2))));
  const handleZoomReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleCapturePreview = async () => {
    if (!viewportRef.current || isCapturingPreview) return;
    setIsCapturingPreview(true);
    try {
      const viewportRect = viewportRef.current.getBoundingClientRect();
      if (window.electronAPI?.captureRegion) {
        try {
          const base64Png = await window.electronAPI.captureRegion({
            x: viewportRect.left,
            y: viewportRect.top,
            width: viewportRect.width,
            height: viewportRect.height,
          });
          const bytes = Uint8Array.from(atob(base64Png), (char) => char.charCodeAt(0));
          const blob = new Blob([bytes], { type: "image/png" });

          const savePicker = (window as Window & { showSaveFilePicker?: (options: unknown) => Promise<any> }).showSaveFilePicker;
          if (typeof savePicker === "function") {
            try {
              const handle = await savePicker({
                suggestedName: `projection-preview-${Date.now()}.png`,
                types: [
                  {
                    description: "PNG image",
                    accept: { "image/png": [".png"] },
                  },
                ],
              });
              const writable = await handle.createWritable();
              await writable.write(blob);
              await writable.close();
              return;
            } catch {
              // Continue to fallback anchor download.
            }
          }

          const pngUrl = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = pngUrl;
          anchor.download = `projection-preview-${Date.now()}.png`;
          anchor.click();
          URL.revokeObjectURL(pngUrl);
          return;
        } catch (ipcError) {
          const message = ipcError instanceof Error ? ipcError.message : String(ipcError || "");
          if (message.includes("No handler registered for 'capture:region'")) {
            alert("Screenshot tool was updated. Please restart the Electron app, then try Shot again.");
            return;
          }
          console.warn("Electron capture failed, falling back to browser capture:", ipcError);
        }
      }

      const sourceNode = viewportRef.current;
      const width = Math.max(1, Math.round(sourceNode.clientWidth));
      const height = Math.max(1, Math.round(sourceNode.clientHeight));
      const scale = Math.max(1, window.devicePixelRatio || 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas context unavailable.");
      context.scale(scale, scale);

      const loadImage = async (src: string) => {
        const image = new Image();
        image.decoding = "async";
        if (!src.startsWith("data:")) {
          image.crossOrigin = "anonymous";
        }
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("Failed to load projection image."));
          image.src = src;
        });
        return image;
      };

      const drawContainImage = (image: HTMLImageElement, opacity = 1) => {
        if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
        const imageAspect = image.naturalWidth / image.naturalHeight;
        const hostAspect = width / height;
        let drawWidth = width;
        let drawHeight = height;
        let drawX = 0;
        let drawY = 0;
        if (imageAspect > hostAspect) {
          drawHeight = width / imageAspect;
          drawY = (height - drawHeight) / 2;
        } else if (imageAspect < hostAspect) {
          drawWidth = height * imageAspect;
          drawX = (width - drawWidth) / 2;
        }
        context.save();
        context.globalAlpha = opacity;
        context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
        context.restore();
      };

      const projectToCanvasX = (x: number) => (x / projectionResolution) * width;
      const projectToCanvasY = (y: number) => (y / projectionResolution) * height;

      if (currentImage) {
        const baseImage = await loadImage(toImageSrc(currentImage));
        drawContainImage(baseImage, 1);
      }

      if (showMaskOverlay) {
        for (const mask of visibleMasks) {
          try {
            const maskImage = await loadImage(toImageSrc(mask.mask));
            drawContainImage(maskImage, overlayOpacity);
          } catch (maskError) {
            console.warn(`Skipping mask ${mask.id} during capture:`, maskError);
          }
        }
      }

      const drawRoiRect = (
        roiValue: ROIState,
        stroke: string,
        strokeWidth: number,
        dash: number[] = [],
        fill?: string,
        alpha = 1
      ) => {
        const rectWidth = roiValue.width * width;
        const rectHeight = roiValue.height * height;
        const cx = roiValue.x * width;
        const cy = roiValue.y * height;
        context.save();
        context.translate(cx, cy);
        context.rotate((roiValue.rotation * Math.PI) / 180);
        context.globalAlpha = alpha;
        if (fill) {
          context.fillStyle = fill;
          context.fillRect(-rectWidth / 2, -rectHeight / 2, rectWidth, rectHeight);
        }
        context.strokeStyle = stroke;
        context.lineWidth = strokeWidth;
        context.setLineDash(dash);
        context.strokeRect(-rectWidth / 2, -rectHeight / 2, rectWidth, rectHeight);
        context.restore();
      };

      if (showOriginalComparison && originalRoi) {
        drawRoiRect(originalRoi, ROI_AMBER, 1.4, [5, 3], undefined, 0.95);
      }
      if (showUpdatedComparison && correctedRoi) {
        drawRoiRect(correctedRoi, ROI_AQUA, 2.1, [], undefined, 0.95);
      }
      if (showROI) {
        if (roiInteractive) {
          drawRoiRect(roi, "#22c55e", 1.25, [5, 3]);
        } else {
          drawRoiRect(roi, ROI_AQUA, 2.2, [6, 3]);
          drawRoiRect(roi, "#00151a", 3, [], undefined, 0.45);
        }
      }

      if (selectedTemplateOverlays.length > 0) {
        selectedTemplateOverlays.forEach((variant, variantIndex) => {
          const stroke = variantStrokes[variantIndex % variantStrokes.length];
          context.save();
          context.strokeStyle = stroke;
          context.fillStyle = stroke;
          context.globalAlpha = 0.9;
          context.lineWidth = variant.templateType === "cross" ? 1.2 : 1.6;
          context.setLineDash(variant.templateType === "cross" ? [5, 3] : []);

          variant.overlay.linesUv.forEach((line) => {
            if (line.length < 2) return;
            const start = uvToNormalised(line[0][0], line[0][1], roi);
            const end = uvToNormalised(line[1][0], line[1][1], roi);
            context.beginPath();
            context.moveTo(start.x * width, start.y * height);
            context.lineTo(end.x * width, end.y * height);
            context.stroke();
          });

          context.setLineDash([]);
          variant.overlay.pointsUv.forEach((point) => {
            const pos = uvToNormalised(point[0], point[1], roi);
            context.beginPath();
            context.arc(pos.x * width, pos.y * height, 2.2, 0, Math.PI * 2);
            context.fill();
          });
          context.restore();
        });
      }

      if (templateBossPoints.length > 0) {
        templateBossPoints.forEach((point) => {
          const x = projectToCanvasX(point.x);
          const y = projectToCanvasY(point.y);
          const isManual = point.source === "manual";
          const isOutside = point.outOfBounds;
          const isSelected = selectedBossPointId === point.id;
          const fill = isOutside ? "#ef4444" : isManual ? "#facc15" : "#ffffff";
          const stroke = isOutside ? "#7f1d1d" : isManual ? "#78350f" : "#0ea5e9";
          const radius = isSelected ? 6 : isManual ? 5.2 : 4.4;

          if (isSelected) {
            context.save();
            context.strokeStyle = "#ffffff";
            context.lineWidth = 1.7;
            context.globalAlpha = 0.85;
            context.beginPath();
            context.arc(x, y, 9, 0, Math.PI * 2);
            context.stroke();
            context.restore();
          }

          context.save();
          context.fillStyle = fill;
          context.strokeStyle = stroke;
          context.lineWidth = 1.5;
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
          context.stroke();

          context.font = "bold 12px sans-serif";
          context.fillStyle = "#000000";
          context.globalAlpha = 0.9;
          context.fillText(String(point.id), x + 7, y - 8);
          context.fillStyle = "#ffffff";
          context.globalAlpha = 1;
          context.fillText(String(point.id), x + 6, y - 9);
          context.restore();
        });
      }

      if (showIntrados && intradosLines.length > 0) {
        intradosLines.forEach((line) => {
          if (line.points2d.length < 2) return;
          context.save();
          context.lineCap = "round";
          context.lineJoin = "round";
          context.beginPath();
          line.points2d.forEach((point, index) => {
            const x = projectToCanvasX(point[0]);
            const y = projectToCanvasY(point[1]);
            if (index === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          });
          context.strokeStyle = "black";
          context.lineWidth = 6;
          context.globalAlpha = 0.3;
          context.stroke();
          context.strokeStyle = line.color;
          context.lineWidth = 3;
          context.globalAlpha = 1;
          context.stroke();
          context.restore();

          [line.points2d[0], line.points2d[line.points2d.length - 1]].forEach((point) => {
            const x = projectToCanvasX(point[0]);
            const y = projectToCanvasY(point[1]);
            context.save();
            context.fillStyle = line.color;
            context.strokeStyle = "white";
            context.lineWidth = 2;
            context.beginPath();
            context.arc(x, y, 5, 0, Math.PI * 2);
            context.fill();
            context.stroke();
            context.restore();
          });
        });
      }

      if (showReconstruction) {
        reconstructionEdges.forEach((edge) => {
          const nodes = reconstructionNodes;
          const start = nodes[edge.a];
          const end = nodes[edge.b];
          if (!start || !end) return;
          context.save();
          context.strokeStyle = edge.isConstraint ? "#f97316" : "#22c55e";
          context.lineWidth = edge.isConstraint ? 4.2 : 3.2;
          context.globalAlpha = edge.isConstraint ? 0.95 : 0.8;
          context.beginPath();
          context.moveTo(projectToCanvasX(start.x), projectToCanvasY(start.y));
          context.lineTo(projectToCanvasX(end.x), projectToCanvasY(end.y));
          context.stroke();
          context.restore();
        });
      }

      if (showUsedBosses) {
        usedBosses.forEach((boss) => {
          const x = projectToCanvasX(boss.x);
          const y = projectToCanvasY(boss.y);
          context.save();
          context.fillStyle = "#ffffff";
          context.strokeStyle = "#0ea5e9";
          context.lineWidth = 1.5;
          context.beginPath();
          context.arc(x, y, 4.4, 0, Math.PI * 2);
          context.fill();
          context.stroke();

          context.font = "bold 12px sans-serif";
          context.fillStyle = "#000000";
          context.globalAlpha = 0.9;
          context.fillText(String(boss.id), x + 7, y - 8);
          context.fillStyle = "#ffffff";
          context.globalAlpha = 1;
          context.fillText(String(boss.id), x + 6, y - 9);
          context.restore();
        });
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Failed to generate PNG.");

      const savePicker = (window as Window & { showSaveFilePicker?: (options: unknown) => Promise<any> }).showSaveFilePicker;
      if (typeof savePicker === "function") {
        try {
          const handle = await savePicker({
            suggestedName: `projection-preview-${Date.now()}.png`,
            types: [
              {
                description: "PNG image",
                accept: { "image/png": [".png"] },
              },
            ],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return;
        } catch {
          // Continue to fallback anchor download.
        }
      }

      const pngUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = pngUrl;
      anchor.download = `projection-preview-${Date.now()}.png`;
      anchor.click();
      URL.revokeObjectURL(pngUrl);
    } catch (error) {
      console.error("Preview capture failed:", error);
      alert(error instanceof Error ? error.message : "Failed to save projection preview.");
    } finally {
      setIsCapturingPreview(false);
    }
  };

  const renderRoiOutline = (
    value: ROIState,
    stroke: string,
    strokeDasharray = "1 0.5",
    strokeWidth = "0.3",
    withGlow = false,
    fill = "none",
    markerColor?: string
  ) => (
    <g transform={`rotate(${value.rotation} ${value.x * 100} ${value.y * 100})`}>
      {withGlow && (
        <rect
          x={(value.x - value.width / 2) * 100}
          y={(value.y - value.height / 2) * 100}
          width={value.width * 100}
          height={value.height * 100}
          fill="none"
          stroke={stroke}
          strokeWidth="0.9"
          opacity="0.3"
        />
      )}
      <rect
        x={(value.x - value.width / 2) * 100}
        y={(value.y - value.height / 2) * 100}
        width={value.width * 100}
        height={value.height * 100}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
      />
      {markerColor && (
        <>
          <rect
            x={(value.x - value.width / 2) * 100 - 0.55}
            y={(value.y - value.height / 2) * 100 - 0.55}
            width="1.1"
            height="1.1"
            fill={markerColor}
            stroke="white"
            strokeWidth="0.25"
          />
          <rect
            x={(value.x + value.width / 2) * 100 - 0.55}
            y={(value.y - value.height / 2) * 100 - 0.55}
            width="1.1"
            height="1.1"
            fill={markerColor}
            stroke="white"
            strokeWidth="0.25"
          />
          <rect
            x={(value.x + value.width / 2) * 100 - 0.55}
            y={(value.y + value.height / 2) * 100 - 0.55}
            width="1.1"
            height="1.1"
            fill={markerColor}
            stroke="white"
            strokeWidth="0.25"
          />
          <rect
            x={(value.x - value.width / 2) * 100 - 0.55}
            y={(value.y + value.height / 2) * 100 - 0.55}
            width="1.1"
            height="1.1"
            fill={markerColor}
            stroke="white"
            strokeWidth="0.25"
          />
        </>
      )}
    </g>
  );

  return (
    <div className={containerClassName || "lg:col-span-6"}>
      <Card className="h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-display">Projection Preview</CardTitle>
              <CardDescription>
                {selectedProjection?.settings?.perspective || "bottom"} view • {selectedProjection?.settings?.resolution || 2048}px
              </CardDescription>
            </div>

            <div className="flex gap-1">
              {(["colour", "depthGrayscale", "depthPlasma"] as ImageViewType[]).map((type) => (
                <Button
                  key={type}
                  variant={selectedImageType === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => onImageTypeChange(type)}
                  className="h-7 text-xs"
                >
                  {type === "colour" ? "RGB" : type === "depthGrayscale" ? "Depth" : "Plasma"}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            ref={canvasRef}
            className={`relative aspect-square bg-muted/30 rounded-lg overflow-hidden ${
              isPanningView
                ? "cursor-grabbing"
                : panActive
                  ? "cursor-grab"
                  : (roiInteractive || bossPointInteractive)
                    ? "cursor-crosshair"
                    : "cursor-default"
            }`}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseLeave}
            onWheel={handleWheelZoom}
          >
            <div
              ref={viewportRef}
              className="absolute left-1/2 top-1/2"
              style={{
                width: `${zoom * 100}%`,
                height: `${zoom * 100}%`,
                transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
              }}
            >
              {currentImage ? (
                <img
                  src={toImageSrc(currentImage)}
                  alt="Projection"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center text-muted-foreground">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No projection image available</p>
                  </div>
                </div>
              )}

              {showMaskOverlay &&
                visibleMasks.map((mask) => (
                  <img
                    key={mask.id}
                    src={toImageSrc(mask.mask)}
                    alt={mask.label}
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    style={{ opacity: overlayOpacity }}
                  />
                ))}

              {showAnyRoiLayer && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                {showOriginalComparison && originalRoi && renderRoiOutline(originalRoi, ROI_AMBER, "0.9 0.7", "0.28", true)}
                {showUpdatedComparison && correctedRoi && (
                  renderRoiOutline(correctedRoi, ROI_AQUA, "none", "0.52", true, "none", ROI_AQUA)
                )}
                {showComparisonLegend && (
                  <>
                    <g transform="translate(3,3)">
                      <rect x="0" y="0" width="22" height={showOriginalComparison && showUpdatedComparison ? "7.6" : "4.6"} rx="1.2" fill="rgba(0,0,0,0.55)" />
                      {showOriginalComparison && (
                        <>
                          <line x1="1.2" y1="2.4" x2="4.3" y2="2.4" stroke={ROI_AMBER} strokeWidth="0.45" strokeDasharray="0.9 0.7" />
                          <text x="5.1" y="2.8" fill="#f3f4f6" fontSize="1.65">
                            Original
                          </text>
                        </>
                      )}
                      {showUpdatedComparison && (
                        <>
                          <line
                            x1="1.2"
                            y1={showOriginalComparison ? "5.4" : "2.4"}
                            x2="4.3"
                            y2={showOriginalComparison ? "5.4" : "2.4"}
                            stroke={ROI_AQUA}
                            strokeWidth="0.65"
                          />
                          <text x="5.1" y={showOriginalComparison ? "5.8" : "2.8"} fill="#f3f4f6" fontSize="1.65">
                            Updated
                          </text>
                        </>
                      )}
                    </g>
                  </>
                )}
                {showROI && (
                  roiInteractive ? (
                    <g transform={`rotate(${roi.rotation} ${roi.x * 100} ${roi.y * 100})`}>
                      <rect
                        x={(roi.x - roi.width / 2) * 100}
                        y={(roi.y - roi.height / 2) * 100}
                        width={roi.width * 100}
                        height={roi.height * 100}
                        fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth="0.3"
                        strokeDasharray="1 0.5"
                        className="pointer-events-auto cursor-move"
                      />

                      {[
                        [roi.x - roi.width / 2, roi.y - roi.height / 2, "nw"],
                        [roi.x + roi.width / 2, roi.y - roi.height / 2, "ne"],
                        [roi.x + roi.width / 2, roi.y + roi.height / 2, "se"],
                        [roi.x - roi.width / 2, roi.y + roi.height / 2, "sw"],
                      ].map(([x, y, handle]) => (
                        <circle
                          key={handle as string}
                          cx={(x as number) * 100}
                          cy={(y as number) * 100}
                          r="1.2"
                          fill="hsl(var(--primary))"
                          stroke="white"
                          strokeWidth="0.3"
                          className="pointer-events-auto cursor-nwse-resize"
                        />
                      ))}

                      <line
                        x1={roi.x * 100}
                        y1={(roi.y - roi.height / 2) * 100}
                        x2={roi.x * 100}
                        y2={(roi.y - roi.height / 2 - 0.05) * 100}
                        stroke="hsl(var(--primary))"
                        strokeWidth="0.2"
                      />
                      <circle
                        cx={roi.x * 100}
                        cy={(roi.y - roi.height / 2 - 0.05) * 100}
                        r="1"
                        fill="hsl(var(--accent))"
                        stroke="white"
                        strokeWidth="0.3"
                        className="pointer-events-auto cursor-grab"
                      />

                      <circle
                        cx={roi.x * 100}
                        cy={roi.y * 100}
                        r="0.8"
                        fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth="0.2"
                      />
                    </g>
                  ) : (
                    <g transform={`rotate(${roi.rotation} ${roi.x * 100} ${roi.y * 100})`}>
                      <rect
                        x={(roi.x - roi.width / 2) * 100}
                        y={(roi.y - roi.height / 2) * 100}
                        width={roi.width * 100}
                        height={roi.height * 100}
                        fill="none"
                        stroke={ROI_AQUA}
                        strokeWidth="0.55"
                        strokeDasharray="1.3 0.8"
                      />
                      <rect
                        x={(roi.x - roi.width / 2) * 100}
                        y={(roi.y - roi.height / 2) * 100}
                        width={roi.width * 100}
                        height={roi.height * 100}
                        fill="none"
                        stroke="#00151a"
                        strokeWidth="0.9"
                        opacity="0.45"
                      />
                    </g>
                  )
                )}
                </svg>
              )}

              {(selectedTemplateOverlays.length > 0 || templateBossPoints.length > 0) && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                {selectedTemplateOverlays.map((variant, variantIndex) => {
                  const stroke = variantStrokes[variantIndex % variantStrokes.length];
                  const strokeDasharray = variant.templateType === "cross" ? "1.2 0.8" : "none";
                  return (
                    <g key={variant.variantLabel}>
                      {variant.overlay.linesUv.map((line, lineIndex) => {
                        if (line.length < 2) return null;
                        const start = uvToNormalised(line[0][0], line[0][1], roi);
                        const end = uvToNormalised(line[1][0], line[1][1], roi);
                        return (
                          <line
                            key={`${variant.variantLabel}-line-${lineIndex}`}
                            x1={start.x * 100}
                            y1={start.y * 100}
                            x2={end.x * 100}
                            y2={end.y * 100}
                            stroke={stroke}
                            strokeWidth={variant.templateType === "cross" ? 0.24 : 0.32}
                            strokeDasharray={strokeDasharray}
                            opacity={0.9}
                          />
                        );
                      })}
                      {variant.overlay.pointsUv.map((point, pointIndex) => {
                        const pos = uvToNormalised(point[0], point[1], roi);
                        return (
                          <circle
                            key={`${variant.variantLabel}-point-${pointIndex}`}
                            cx={pos.x * 100}
                            cy={pos.y * 100}
                            r="0.28"
                            fill={stroke}
                            opacity={0.9}
                          />
                        );
                      })}
                    </g>
                  );
                })}

                {templateBossPoints.map((point) => (
                  <g key={`boss-point-${point.id}`}>
                    {(() => {
                      const isManual = point.source === "manual";
                      const isOutside = point.outOfBounds;
                      const isSelected = selectedBossPointId === point.id;
                      const fill = isOutside ? "#ef4444" : isManual ? "#facc15" : "#ffffff";
                      const stroke = isOutside ? "#7f1d1d" : isManual ? "#78350f" : "#0ea5e9";
                      const radius = isSelected ? 1.15 : isManual ? 0.95 : 0.8;
                      return (
                        <>
                          {isSelected && (
                            <circle
                              cx={(point.x / projectionResolution) * 100}
                              cy={(point.y / projectionResolution) * 100}
                              r="1.75"
                              fill="none"
                              stroke="#ffffff"
                              strokeWidth="0.35"
                              opacity="0.85"
                            />
                          )}
                          <circle
                            cx={(point.x / projectionResolution) * 100}
                            cy={(point.y / projectionResolution) * 100}
                            r={radius}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth="0.3"
                          />
                          <text
                            x={(point.x / projectionResolution) * 100 + 1.06}
                            y={(point.y / projectionResolution) * 100 - 0.92}
                            fill="#000000"
                            opacity="0.9"
                            fontSize="2.05"
                            fontWeight="700"
                          >
                            {point.id}
                          </text>
                          <text
                            x={(point.x / projectionResolution) * 100 + 1}
                            y={(point.y / projectionResolution) * 100 - 1}
                            fill="#ffffff"
                            fontSize="2"
                            fontWeight="700"
                          >
                            {point.id}
                          </text>
                        </>
                      );
                    })()}
                  </g>
                ))}
                </svg>
              )}

              {showIntrados && intradosLines.length > 0 && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox={`0 0 ${selectedProjection?.settings?.resolution || 2048} ${selectedProjection?.settings?.resolution || 2048}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                {intradosLines.map((line) => {
                  if (line.points2d.length < 2) return null;

                  const pathData = line.points2d.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt[0]} ${pt[1]}`).join(" ");

                  return (
                    <g key={line.id}>
                      <path
                        d={pathData}
                        fill="none"
                        stroke="black"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.3"
                      />
                      <path
                        d={pathData}
                        fill="none"
                        stroke={line.color}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx={line.points2d[0][0]} cy={line.points2d[0][1]} r="5" fill={line.color} stroke="white" strokeWidth="2" />
                      <circle
                        cx={line.points2d[line.points2d.length - 1][0]}
                        cy={line.points2d[line.points2d.length - 1][1]}
                        r="5"
                        fill={line.color}
                        stroke="white"
                        strokeWidth="2"
                      />
                    </g>
                  );
                })}
                </svg>
              )}

              {showReconstruction && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox={`0 0 ${selectedProjection?.settings?.resolution || 2048} ${selectedProjection?.settings?.resolution || 2048}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  {reconstructionEdges.map((edge, idx) => {
                    const start = reconstructionNodes[edge.a];
                    const end = reconstructionNodes[edge.b];
                    if (!start || !end) return null;
                    return (
                      <line
                        key={`re-edge-${idx}`}
                        x1={start.x}
                        y1={start.y}
                        x2={end.x}
                        y2={end.y}
                        stroke={edge.isConstraint ? "#f97316" : "#22c55e"}
                        strokeWidth={edge.isConstraint ? 8 : 6}
                        opacity={edge.isConstraint ? 0.95 : 0.8}
                      />
                    );
                  })}
                </svg>
              )}

              {showUsedBosses && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  {usedBosses.map((boss) => (
                    <g key={`used-boss-${boss.id}`}>
                      <circle
                        cx={(boss.x / projectionResolution) * 100}
                        cy={(boss.y / projectionResolution) * 100}
                        r="0.8"
                        fill="#ffffff"
                        stroke="#0ea5e9"
                        strokeWidth="0.3"
                      />
                      <text
                        x={(boss.x / projectionResolution) * 100 + 1.06}
                        y={(boss.y / projectionResolution) * 100 - 0.92}
                        fill="#000000"
                        opacity="0.9"
                        fontSize="2.05"
                        fontWeight="700"
                      >
                        {boss.id}
                      </text>
                      <text
                        x={(boss.x / projectionResolution) * 100 + 1}
                        y={(boss.y / projectionResolution) * 100 - 1}
                        fill="#ffffff"
                        fontSize="2"
                        fontWeight="700"
                      >
                        {boss.id}
                      </text>
                    </g>
                  ))}
                </svg>
              )}
            </div>

            {hoveredBoss && (
              <div
                className="absolute z-20 min-w-[220px] rounded-md border border-primary/35 bg-background/95 px-2.5 py-2 text-[11px] leading-tight pointer-events-none shadow-lg"
                style={{
                  left: Math.max(
                    8,
                    Math.min(
                      hoveredBoss.x + 12,
                      hoveredBoss.hostWidth - 220 - 8
                    )
                  ),
                  top: Math.max(
                    8,
                    Math.min(
                      hoveredBoss.y + 12,
                      hoveredBoss.hostHeight - 104 - 8
                    )
                  ),
                }}
              >
                <p className="mb-1 font-semibold">#{hoveredBoss.id}</p>
                {bossHoverInfoMode === "nodes" ? (
                  <>
                    <div className="grid grid-cols-[62px_1fr] gap-x-2 gap-y-1">
                      <p className="text-muted-foreground">Boss xy</p>
                      <p className="font-mono text-foreground">
                        {Math.round(hoveredBoss.px)}, {Math.round(hoveredBoss.py)}
                      </p>
                    </div>
                    <p className={`mt-1 ${hoveredBoss.outOfBounds ? "text-red-300" : "text-emerald-300"}`}>
                      {hoveredBoss.outOfBounds ? "Outside ROI" : "Inside ROI"}
                    </p>
                  </>
                ) : (
                  <div className="grid grid-cols-[62px_1fr] gap-x-2 gap-y-1">
                    <p className="text-muted-foreground">Boss uv</p>
                    <p className="font-mono text-foreground">
                      {hoveredBoss.u.toFixed(4)}, {hoveredBoss.v.toFixed(4)}
                    </p>
                    <p className="text-muted-foreground">X cut</p>
                    <p className="text-cyan-300">{hoveredBoss.xTemplateLabel ?? "-"}</p>
                    <p className="text-muted-foreground">Y cut</p>
                    <p className="text-cyan-300">{hoveredBoss.yTemplateLabel ?? "-"}</p>
                    <p className="text-muted-foreground">Matched</p>
                    <p className={hoveredBoss.matched ? "text-emerald-300" : "text-amber-300"}>
                      {hoveredBoss.matched ? "Yes" : "No"}
                    </p>
                  </div>
                )}
              </div>
            )}

            {isAnalysing && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
                  <p className="text-sm text-muted-foreground">Analysing geometry...</p>
                </div>
              </div>
            )}
          </div>
          {enableViewportTools && (
            <PreviewToolkit
              showSelectMode={bossPointInteractive || bossHoverInfoMode === "matching"}
              interactionMode={interactionMode}
              zoom={zoom}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              isCapturing={isCapturingPreview}
              canUndo={canUndoBossPoints}
              canRedo={canRedoBossPoints}
              onInteractionModeChange={setInteractionMode}
              onZoomOut={handleZoomOut}
              onZoomReset={handleZoomReset}
              onZoomIn={handleZoomIn}
              onCapture={handleCapturePreview}
              onUndo={onUndoBossPoints}
              onRedo={onRedoBossPoints}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
