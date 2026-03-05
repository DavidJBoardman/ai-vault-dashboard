"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Image as ImageIcon, RefreshCw } from "lucide-react";
import { PreviewToolkit } from "@/components/geometry2d/layout";

import { Segmentation } from "@/lib/store";
import {
  Geometry2DBayPlanBossPoint,
  Geometry2DBayPlanCandidateEdge,
  Geometry2DBayPlanRunResult,
  IntradosLine,
  Geometry2DNodePoint,
  Geometry2DCutTypologyOverlayVariant,
} from "@/lib/api";
import { toImageSrc } from "@/lib/utils";
import {
  getDelaunayConstraintStyle,
  getReconstructionBossStyle,
} from "@/components/geometry2d/projectionCanvasUtils";

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
  showBaseImage?: boolean;
  showROI: boolean;
  roi: ROIState;
  originalRoi?: ROIState | null;
  correctedRoi?: ROIState | null;
  showOriginalOverlay?: boolean;
  showUpdatedOverlay?: boolean;
  showIntrados: boolean;
  intradosLines: IntradosLine[];
  isAnalysing: boolean;
  templateBossPoints?: Geometry2DNodePoint[];
  selectedBossPointId?: number;
  selectedTemplateOverlays?: Geometry2DCutTypologyOverlayVariant[];
  matchingEvidenceLoaded?: boolean;
  matchingUnmatchedNodeIds?: number[];
  showRoiCornerGuides?: boolean;
  showReconstructionOverlay?: boolean;
  showReconstructionNodes?: boolean;
  reconstructionResult?: Geometry2DBayPlanRunResult | null;
  reconstructionPreviewBosses?: Geometry2DBayPlanBossPoint[];
  selectedReconstructionEdgeKey?: string | null;
  onReconstructionEdgeSelect?: (edgeKey: string | null) => void;
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
  showBaseImage = true,
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
  matchingEvidenceLoaded = false,
  matchingUnmatchedNodeIds = [],
  showRoiCornerGuides = false,
  showReconstructionOverlay = false,
  showReconstructionNodes = false,
  reconstructionResult = null,
  reconstructionPreviewBosses = [],
  selectedReconstructionEdgeKey = null,
  onReconstructionEdgeSelect,
  enableViewportTools = false,
  bossHoverInfoMode = "none",
}: ProjectionCanvasProps) {
  const ROI_AQUA = "#00ffd5";
  const ROI_AMBER = "#ffcf33";
  const ROI_EDIT = "#00e5ff";
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
  const [hoveredReconstructionEdge, setHoveredReconstructionEdge] = useState<{
    a: number;
    b: number;
    aLabel: string;
    bLabel: string;
    x: number;
    y: number;
    hostWidth: number;
    hostHeight: number;
    score: number | null;
    overlapScore: number | null;
    thirdBossPenalty: number | null;
    mutual: boolean | null;
    isConstraint: boolean;
    isManual: boolean;
    kind: "selected" | "candidate";
  } | null>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const showOriginalComparison = !!(showOriginalOverlay && originalRoi);
  const showUpdatedComparison = !!(showUpdatedOverlay && correctedRoi);
  const showComparisonLegend = showOriginalComparison || showUpdatedComparison;
  const showNodeLegend = bossHoverInfoMode === "nodes";
  const matchingUnmatchedNodeIdSet = new Set(matchingUnmatchedNodeIds);
  const hasStableMatchingEvidence = matchingEvidenceLoaded || matchingUnmatchedNodeIdSet.size > 0;
  const isTemplatePointUnmatched = (point: Geometry2DNodePoint) => {
    if (bossHoverInfoMode !== "matching") return false;
    if (hasStableMatchingEvidence) return matchingUnmatchedNodeIdSet.has(point.id);
    return false;
  };
  const hasUnmatchedTemplateBosses =
    bossHoverInfoMode === "matching" &&
    hasStableMatchingEvidence &&
    templateBossPoints.some((point) => isTemplatePointUnmatched(point));
  const showTemplateOverlayLegend = selectedTemplateOverlays.length > 0;
  const showCornerGuideLegend = showRoiCornerGuides && showROI && bossHoverInfoMode === "nodes";
  const showAnyRoiLayer = showROI || showOriginalComparison || showUpdatedComparison;
  const projectionResolution = selectedProjection?.settings?.resolution || 2048;
  const reconstructionNodes = reconstructionResult?.nodes || [];
  const reconstructionEdges = reconstructionResult?.edges || [];
  const reconstructionCandidateEdges = reconstructionResult?.candidateEdges || [];
  const reconstructionMode = reconstructionResult?.params?.reconstructionMode === "delaunay" ? "delaunay" : "current";
  const delaunayConstraintFamilies = reconstructionMode === "delaunay"
    ? Array.from(
        new Set(
          reconstructionEdges
            .filter((edge) => edge.isConstraint && edge.constraintFamily)
            .map((edge) => String(edge.constraintFamily))
        )
      )
    : [];
  const reconstructionCandidateEdgeMap = new Map<string, Geometry2DBayPlanCandidateEdge>(
    reconstructionCandidateEdges.map((edge) => [`${Math.min(edge.a, edge.b)}-${Math.max(edge.a, edge.b)}`, edge])
  );
  const showReconstruction = showReconstructionOverlay && reconstructionEdges.length > 0;
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
  const showUsedBosses = showReconstructionNodes && usedBosses.length > 0;
  const showInspectMode =
    showReconstruction &&
    !roiInteractive &&
    !bossPointInteractive &&
    bossHoverInfoMode === "none";
  const showMatchingInspectMode = bossHoverInfoMode === "matching";
  const selectModeLabel = showInspectMode || showMatchingInspectMode ? "Inspect" : "Select";
  const selectModeTitle = showInspectMode
    ? "Inspect node and rib diagnostics"
    : showMatchingInspectMode
      ? "Inspect node match diagnostics"
      : "Select and drag points";
  const reconstructionBossLegendItems = Array.from(
    new Map(usedBosses.map((boss) => [getReconstructionBossStyle(boss.source).label, getReconstructionBossStyle(boss.source)])).values()
  );
  const panActive = interactionMode === "pan" || isSpacePressed;
  const edgeHoverThresholdPx = 10;

  useEffect(() => {
    if (!enableViewportTools) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setHoveredBoss(null);
      setHoveredReconstructionEdge(null);
      setInteractionMode("select");
    }
  }, [enableViewportTools]);

  useEffect(() => {
    if (roiInteractive || bossPointInteractive || bossHoverInfoMode === "matching") {
      setInteractionMode("select");
      return;
    }
    if (enableViewportTools) {
      setInteractionMode("pan");
    }
  }, [bossHoverInfoMode, bossPointInteractive, enableViewportTools, roiInteractive]);

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

  const roiCornerGuides = [
    { dx: -roi.width / 2, dy: -roi.height / 2, label: "NW" },
    { dx: roi.width / 2, dy: -roi.height / 2, label: "NE" },
    { dx: roi.width / 2, dy: roi.height / 2, label: "SE" },
    { dx: -roi.width / 2, dy: roi.height / 2, label: "SW" },
  ].map((corner) => {
    const angle = (roi.rotation * Math.PI) / 180;
    const x = roi.x + (Math.cos(angle) * corner.dx) - (Math.sin(angle) * corner.dy);
    const y = roi.y + (Math.sin(angle) * corner.dx) + (Math.cos(angle) * corner.dy);
    return { x, y, label: corner.label };
  });

  const reconstructionEdgePalette = ["#ff7a18", "#22c55e", "#38bdf8", "#f43f5e", "#facc15", "#a78bfa", "#14b8a6", "#fb7185"];
  const getTemplateOverlayStyle = (variant: Geometry2DCutTypologyOverlayVariant) => {
    const label = variant.variantLabel || "";
    if (variant.templateType === "cross" || variant.isCrossTemplate) {
      return {
        color: "#f8fafc",
        label: "Cross",
        canvasDash: [5, 3],
        svgDash: "1.2 0.8",
        width: 1.2,
      };
    }
    if (variant.templateType === "circlecut") {
      return {
        color: label === "circlecut_outer" ? "#38bdf8" : "#22d3ee",
        label: label === "circlecut_outer" ? "Circlecut outer" : "Circlecut inner",
        canvasDash: [],
        svgDash: "none",
        width: 1.35,
      };
    }
    if (variant.templateType === "starcut") {
      const n = typeof variant.n === "number" ? variant.n : null;
      const dash = n !== null && n >= 4 ? (n >= 6 ? [2.5, 2.5] : [6, 3]) : [];
      const svgDash = n !== null && n >= 4 ? (n >= 6 ? "0.55 0.5" : "1.2 0.8") : "none";
      return {
        color: "#f97316",
        label: n !== null ? `Standardcut n=${n}` : "Standardcut",
        canvasDash: dash,
        svgDash,
        width: 1.35,
      };
    }
    return {
      color: "#e2e8f0",
      label: variant.variantLabel || "Unknown",
      canvasDash: [],
      svgDash: "none",
      width: 1.2,
    };
  };

  const overlayLegendItems = (() => {
    const seen = new Set<string>();
    return selectedTemplateOverlays.flatMap((variant) => {
      const fromLabel = (label?: string) => {
        if (!label) return "Unknown";
        if (label.startsWith("starcut_n=")) {
          const n = Number(label.split("=", 2)[1]);
          return Number.isFinite(n) ? `Standardcut n=${n}` : "Standardcut";
        }
        if (label === "circlecut_inner") return "Circlecut inner";
        if (label === "circlecut_outer") return "Circlecut outer";
        return label;
      };

      let label = fromLabel(variant.variantLabel);
      if (variant.templateType === "cross" || variant.isCrossTemplate) {
        label = "Cross";
      }
      const style = getTemplateOverlayStyle(variant);
      const item = {
        color: style.color,
        dash: style.canvasDash.length > 0,
        label: style.label || label,
      };
      const key = `${item.label}-${item.color}-${item.dash ? "dash" : "solid"}`;
      if (seen.has(key)) {
        return [];
      }
      seen.add(key);
      return [item];
    });
  })();

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

  const findNearestEdgeAtPointer = (
    event: React.MouseEvent<HTMLDivElement>,
    edges: Array<{ a: number; b: number; isConstraint?: boolean; isManual?: boolean; isBoundaryForced?: boolean }>
  ) => {
    if (edges.length === 0) return null;
    const rect = getViewportRect(event);
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    let nearest:
      | {
          edge: { a: number; b: number };
          distance: number;
        }
      | null = null;

    const pointToSegmentDistance = (
      px: number,
      py: number,
      ax: number,
      ay: number,
      bx: number,
      by: number
    ) => {
      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      if (lenSq <= 1e-6) return Math.hypot(px - ax, py - ay);
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
      const qx = ax + t * dx;
      const qy = ay + t * dy;
      return Math.hypot(px - qx, py - qy);
    };

    for (const edge of edges) {
      const start = reconstructionNodes[edge.a];
      const end = reconstructionNodes[edge.b];
      if (!start || !end) continue;
      const ax = (start.x / projectionResolution) * rect.width;
      const ay = (start.y / projectionResolution) * rect.height;
      const bx = (end.x / projectionResolution) * rect.width;
      const by = (end.y / projectionResolution) * rect.height;
      const distance = pointToSegmentDistance(pointerX, pointerY, ax, ay, bx, by);
      if (!nearest || distance < nearest.distance) {
        nearest = { edge, distance };
      }
    }

    return nearest;
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
    if (showReconstruction && !roiInteractive && !bossPointInteractive) {
      const nearestEdge = findNearestEdgeAtPointer(event, reconstructionEdges);
      if (nearestEdge && nearestEdge.distance <= edgeHoverThresholdPx) {
        const clickedKey = `${Math.min(nearestEdge.edge.a, nearestEdge.edge.b)}-${Math.max(nearestEdge.edge.a, nearestEdge.edge.b)}`;
        onReconstructionEdgeSelect?.(selectedReconstructionEdgeKey === clickedKey ? null : clickedKey);
        event.preventDefault();
        return;
      }
      onReconstructionEdgeSelect?.(null);
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
      setHoveredReconstructionEdge(null);
      event.preventDefault();
      return;
    }
    if (bossHoverInfoMode !== "none" && !isPanningView && !panActive) {
      const nearestBoss = findNearestBossAtPointer(event);
      if (nearestBoss && nearestBoss.distance <= 11) {
        const point = templateBossPoints.find((candidate) => candidate.id === nearestBoss.id);
        const hostRect = event.currentTarget.getBoundingClientRect();
        if (point) {
          const isUnmatched = isTemplatePointUnmatched(point);
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
            matched: bossHoverInfoMode === "matching" && hasStableMatchingEvidence ? !isUnmatched : !!(point.matchedXTemplateLabel && point.matchedYTemplateLabel),
            outOfBounds: point.outOfBounds,
          });
        }
      } else {
        setHoveredBoss(null);
      }
      setHoveredReconstructionEdge(null);
    } else if (showReconstruction && !isPanningView && !panActive) {
      const nearestEdge = findNearestEdgeAtPointer(event, reconstructionEdges);
      if (nearestEdge && nearestEdge.distance <= edgeHoverThresholdPx) {
        const hostRect = event.currentTarget.getBoundingClientRect();
        const edge = nearestEdge.edge;
        const key = `${Math.min(edge.a, edge.b)}-${Math.max(edge.a, edge.b)}`;
        const candidate = reconstructionCandidateEdgeMap.get(key);
        setHoveredReconstructionEdge({
          a: edge.a,
          b: edge.b,
          aLabel: String(reconstructionNodes[edge.a]?.bossId || reconstructionNodes[edge.a]?.id || edge.a),
          bLabel: String(reconstructionNodes[edge.b]?.bossId || reconstructionNodes[edge.b]?.id || edge.b),
          x: event.clientX - hostRect.left,
          y: event.clientY - hostRect.top,
          hostWidth: hostRect.width,
          hostHeight: hostRect.height,
          score: candidate?.score ?? null,
          overlapScore: candidate?.overlapScore ?? null,
          thirdBossPenalty: candidate?.thirdBossPenalty ?? null,
          mutual: typeof candidate?.mutual === "boolean" ? candidate.mutual : null,
          isConstraint: edge.isConstraint === true || edge.isBoundaryForced === true || candidate?.isBoundaryForced === true,
          isManual: edge.isManual === true,
          kind: "selected",
        });
      } else {
        setHoveredReconstructionEdge(null);
      }
      setHoveredBoss(null);
    } else {
      setHoveredReconstructionEdge(null);
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
    setHoveredReconstructionEdge(null);
    handleCanvasMouseUp(event);
  };

  const handleWheelZoom = useCallback((clientX: number, clientY: number, deltaY: number, container: HTMLDivElement) => {
    const containerRect = container.getBoundingClientRect();
    const centerX = containerRect.left + containerRect.width / 2;
    const centerY = containerRect.top + containerRect.height / 2;
    const factor = deltaY < 0 ? 1.1 : 1 / 1.1;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number((zoom * factor).toFixed(3))));
    if (nextZoom === zoom) return;
    const ratio = nextZoom / zoom;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    setPan((prev) => ({
      x: prev.x * ratio + dx * (1 - ratio),
      y: prev.y * ratio + dy * (1 - ratio),
    }));
    setZoom(nextZoom);
  }, [zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enableViewportTools) return;

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      handleWheelZoom(event.clientX, event.clientY, event.deltaY, canvas);
    };

    canvas.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleNativeWheel);
    };
  }, [canvasRef, enableViewportTools, handleWheelZoom]);

  const handleZoomIn = () => setZoom((prev) => Math.min(MAX_ZOOM, Number((prev + ZOOM_STEP).toFixed(2))));
  const handleZoomOut = () => setZoom((prev) => Math.max(MIN_ZOOM, Number((prev - ZOOM_STEP).toFixed(2))));
  const handleZoomReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const isSaveDialogCancelled = (error: unknown) =>
    error instanceof DOMException && error.name === "AbortError";

  const renderPreviewCanvas = async () => {
    if (!viewportRef.current) {
      throw new Error("Preview viewport unavailable.");
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

    if (showBaseImage && currentImage) {
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
        drawRoiRect(roi, ROI_EDIT, 1.5, [5, 3]);
      } else {
        drawRoiRect(roi, ROI_AQUA, 2.2, [6, 3]);
        drawRoiRect(roi, "#00151a", 3, [], undefined, 0.45);
      }
    }

    if (selectedTemplateOverlays.length > 0) {
      selectedTemplateOverlays.forEach((variant) => {
        const style = getTemplateOverlayStyle(variant);
        context.save();
        context.strokeStyle = style.color;
        context.fillStyle = style.color;
        context.globalAlpha = 0.78;
        context.lineWidth = style.width;
        context.setLineDash(style.canvasDash);

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
        const isCorner = point.pointType === "corner";
        const isOutside = point.outOfBounds;
        const isSelected = selectedBossPointId === point.id;
        const isUnmatched = isTemplatePointUnmatched(point);
        const fill = isOutside
          ? "#ef4444"
          : isUnmatched
            ? "#ef4444"
            : isCorner
              ? "#67e8f9"
              : isManual
                ? "#facc15"
                : "#ffffff";
        const stroke = isOutside
          ? "#7f1d1d"
          : isUnmatched
            ? "#ffffff"
            : isCorner
              ? "#155e75"
              : isManual
                ? "#78350f"
                : "#0ea5e9";
        const radius = isSelected ? 6 : isCorner ? 5.4 : isManual ? 5.2 : 4.4;
        const pointLabel = isCorner ? point.label : String(point.id);

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
        if (isUnmatched) {
          context.fillStyle = "rgba(255, 59, 48, 0.22)";
          context.strokeStyle = "rgba(255, 255, 255, 0.98)";
          context.lineWidth = 1.45;
          context.beginPath();
          context.arc(x, y, radius + 5.8, 0, Math.PI * 2);
          context.fill();
          context.stroke();
        }
        context.fillStyle = fill;
        context.strokeStyle = stroke;
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();

        if (isUnmatched) {
          context.beginPath();
          context.moveTo(x - 7, y - 7);
          context.lineTo(x + 7, y + 7);
          context.moveTo(x + 7, y - 7);
          context.lineTo(x - 7, y + 7);
          context.strokeStyle = "#ffffff";
          context.lineWidth = 1.4;
          context.stroke();
        }

        context.font = isCorner ? "bold 11px sans-serif" : "bold 12px sans-serif";
        context.fillStyle = "#000000";
        context.globalAlpha = 0.9;
        context.fillText(pointLabel, x + 7, y - 8);
        context.fillStyle = "#ffffff";
        context.globalAlpha = 1;
        context.fillText(pointLabel, x + 6, y - 9);
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
      reconstructionEdges.forEach((edge, edgeIndex) => {
        const start = reconstructionNodes[edge.a];
        const end = reconstructionNodes[edge.b];
        if (!start || !end) return;
        const isManual = edge.isManual === true;
        const delaunayStyle = edge.isConstraint
          ? getDelaunayConstraintStyle(edge.constraintFamily)
          : { stroke: "#67e8f9", opacity: 0.68, dash: "6 6" };
        const stroke =
          reconstructionMode === "delaunay"
            ? isManual
              ? "#ef4444"
              : delaunayStyle.stroke
            : isManual
              ? "#ef4444"
              : reconstructionEdgePalette[edgeIndex % reconstructionEdgePalette.length];
        context.save();
        context.strokeStyle = stroke;
        context.lineWidth =
          reconstructionMode === "delaunay"
            ? isManual
              ? 5.6
              : edge.isConstraint
                ? 5.6
                : 5.0
            : isManual
              ? 5.6
              : edge.isConstraint
                ? 4.6
                : 3.4;
        context.globalAlpha =
          reconstructionMode === "delaunay"
            ? isManual
              ? 0.98
              : delaunayStyle.opacity
            : isManual
              ? 0.98
              : edge.isConstraint
                ? 0.98
                : 0.88;
        context.setLineDash(
          reconstructionMode === "delaunay" && !isManual && delaunayStyle.dash !== "none"
            ? delaunayStyle.dash.split(" ").map((value) => Number(value))
            : []
        );
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
        const style = getReconstructionBossStyle(boss.source);
        const isAnchor = boss.source === "anchor";
        context.save();
        context.fillStyle = style.fill;
        context.strokeStyle = style.stroke;
        context.lineWidth = 1.5;
        if (isAnchor) {
          context.translate(x, y);
          context.rotate(Math.PI / 4);
          context.beginPath();
          context.rect(-4.2, -4.2, 8.4, 8.4);
          context.fill();
          context.stroke();
          context.rotate(-Math.PI / 4);
          context.translate(-x, -y);
        } else {
          context.beginPath();
          context.arc(x, y, 4.4, 0, Math.PI * 2);
          context.fill();
          context.stroke();
        }

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

    return canvas;
  };

  const handleCapturePreview = async () => {
    if (!viewportRef.current || isCapturingPreview) return;
    setIsCapturingPreview(true);
    try {
      const captureTarget = previewFrameRef.current || viewportRef.current;
      const viewportRect = captureTarget.getBoundingClientRect();
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
            } catch (saveError) {
              if (isSaveDialogCancelled(saveError)) {
                return;
              }
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

      const canvas = await renderPreviewCanvas();

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
        } catch (saveError) {
          if (isSaveDialogCancelled(saveError)) {
            return;
          }
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
              <CardTitle className="font-display">Bay Preview</CardTitle>
              <CardDescription>
                {selectedProjection?.settings?.perspective || "bottom"} projection • {selectedProjection?.settings?.resolution || 2048}px
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
          <div ref={previewFrameRef} className="overflow-hidden rounded-lg border border-white/10 bg-black">
            <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-white/10 bg-black px-3 py-2">
              {showComparisonLegend && (
                <>
                  {showOriginalComparison && (
                    <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80">
                      <span
                        className="h-0 w-4 border-t-2"
                        style={{ borderColor: ROI_AMBER, borderStyle: "dashed" }}
                      />
                      Saved ROI
                    </span>
                  )}
                  {showUpdatedComparison && (
                    <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80">
                      <span className="h-0 w-4 border-t-2" style={{ borderColor: ROI_AQUA }} />
                      Suggested ROI
                    </span>
                  )}
                </>
              )}
              {showCornerGuideLegend && (
                <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80">
                  <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] border border-white" style={{ backgroundColor: "#ff4fd8" }} />
                  ROI corner guides
                </span>
              )}
              {showNodeLegend && (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80">
                    <span className="h-2.5 w-2.5 rounded-full border border-sky-300 bg-transparent" />
                    Selected
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                    Manual
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                    Outside ROI
                  </span>
                </>
              )}
              {showTemplateOverlayLegend && (
                <>
                  {overlayLegendItems.map((item) => (
                    <span
                      key={`${item.label}-${item.color}`}
                      className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80"
                    >
                      <span className="h-0 w-4 border-t-2" style={{ borderColor: item.color, borderTopStyle: item.dash ? "dashed" : "solid" }} />
                      {item.label}
                    </span>
                  ))}
                </>
              )}
              {hasUnmatchedTemplateBosses && (
                <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80">
                  <span className="h-2.5 w-2.5 rounded-full border border-white bg-red-500" />
                  Unmatched node
                </span>
              )}
              {showReconstruction && (
                reconstructionMode === "delaunay" ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80">
                      <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: "#67e8f9" }} />
                      Delaunay ribs
                    </span>
                    {delaunayConstraintFamilies.map((family) => {
                      const style = getDelaunayConstraintStyle(family);
                      return (
                        <span
                          key={`delaunay-family-${family}`}
                          className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80"
                        >
                          <span
                            className="h-0 w-4 border-t-2"
                            style={{
                              borderColor: style.stroke,
                              borderTopStyle: style.dash === "none" ? "solid" : "dashed",
                            }}
                          />
                          {style.label}
                        </span>
                      );
                    })}
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80">
                    <span className="h-0 w-4 border-t-2" style={{ borderColor: reconstructionEdgePalette[0] }} />
                    Reconstructed ribs
                  </span>
                )
              )}
              {showUsedBosses && (
                <>
                  {reconstructionBossLegendItems.map((item) => (
                    <span
                      key={`${item.label}-${item.fill}-${item.stroke}`}
                      className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full border"
                        style={{ backgroundColor: item.fill, borderColor: item.stroke }}
                      />
                      {item.label}
                    </span>
                  ))}
                </>
              )}
            </div>

            <div
              ref={canvasRef}
              className={`relative aspect-square overflow-hidden bg-black ${
                isPanningView
                  ? "cursor-grabbing"
                  : panActive
                    ? "cursor-grab"
                    : (roiInteractive || bossPointInteractive)
                      ? "cursor-crosshair"
                      : "cursor-default"
              } overscroll-contain touch-none`}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
              onWheel={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleWheelZoom(event.clientX, event.clientY, event.deltaY, event.currentTarget);
              }}
            >
              <div
                ref={viewportRef}
                data-roi-viewport="true"
                className="absolute left-1/2 top-1/2"
                style={{
                  width: `${zoom * 100}%`,
                  height: `${zoom * 100}%`,
                  transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
                }}
              >
              {showBaseImage && currentImage ? (
                <img
                  src={toImageSrc(currentImage)}
                  alt="Projection"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
              ) : !currentImage ? (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center text-muted-foreground">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No projection image available</p>
                  </div>
                </div>
              ) : null}

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
                {showROI && (
                  roiInteractive ? (
                    <g transform={`rotate(${roi.rotation} ${roi.x * 100} ${roi.y * 100})`}>
                      <rect
                        x={(roi.x - roi.width / 2) * 100}
                        y={(roi.y - roi.height / 2) * 100}
                        width={roi.width * 100}
                        height={roi.height * 100}
                        fill="rgba(0,0,0,0.001)"
                        stroke={ROI_EDIT}
                        strokeWidth="0.36"
                        strokeDasharray="1 0.5"
                        className="pointer-events-auto cursor-move"
                        pointerEvents="all"
                      />
                      <line
                        x1={roi.x * 100}
                        y1={(roi.y - roi.height / 2) * 100}
                        x2={roi.x * 100}
                        y2={(roi.y + roi.height / 2) * 100}
                        stroke={ROI_EDIT}
                        strokeWidth="0.24"
                        strokeDasharray="0.8 0.8"
                        opacity="0.55"
                        pointerEvents="none"
                      />
                      <line
                        x1={(roi.x - roi.width / 2) * 100}
                        y1={roi.y * 100}
                        x2={(roi.x + roi.width / 2) * 100}
                        y2={roi.y * 100}
                        stroke={ROI_EDIT}
                        strokeWidth="0.24"
                        strokeDasharray="0.8 0.8"
                        opacity="0.55"
                        pointerEvents="none"
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
                          fill={ROI_EDIT}
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
                        stroke={ROI_EDIT}
                        strokeWidth="0.2"
                      />
                      <circle
                        cx={roi.x * 100}
                        cy={(roi.y - roi.height / 2 - 0.05) * 100}
                        r="1"
                        fill={ROI_EDIT}
                        stroke="white"
                        strokeWidth="0.3"
                        className="pointer-events-auto cursor-grab"
                      />

                      <circle
                        cx={roi.x * 100}
                        cy={roi.y * 100}
                        r="0.95"
                        fill="rgba(0,0,0,0.001)"
                        stroke={ROI_EDIT}
                        strokeWidth="0.34"
                        className="pointer-events-auto cursor-move"
                        pointerEvents="all"
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
                {selectedTemplateOverlays.map((variant) => {
                  const style = getTemplateOverlayStyle(variant);
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
                            stroke={style.color}
                            strokeWidth={variant.templateType === "cross" ? 0.22 : 0.28}
                            strokeDasharray={style.svgDash}
                            opacity={0.78}
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
                            fill={style.color}
                            opacity={0.78}
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
                      const isUnmatched = isTemplatePointUnmatched(point);
                      const fill = isOutside ? "#ef4444" : isUnmatched ? "#ef4444" : isManual ? "#facc15" : "#ffffff";
                      const stroke = isOutside ? "#7f1d1d" : isUnmatched ? "#ffffff" : isManual ? "#78350f" : "#0ea5e9";
                      const radius = isSelected ? 1.15 : isManual ? 0.95 : 0.8;
                      return (
                        <>
                          {isUnmatched && (
                            <circle
                              cx={(point.x / projectionResolution) * 100}
                              cy={(point.y / projectionResolution) * 100}
                              r="2.05"
                              fill="rgba(255, 59, 48, 0.18)"
                                stroke="#ffffff"
                                strokeWidth="0.28"
                                opacity="0.95"
                            >
                            </circle>
                          )}
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
                          {isUnmatched && (
                            <>
                              <line
                                x1={(point.x / projectionResolution) * 100 - 0.9}
                                y1={(point.y / projectionResolution) * 100 - 0.9}
                                x2={(point.x / projectionResolution) * 100 + 0.9}
                                y2={(point.y / projectionResolution) * 100 + 0.9}
                                stroke="#ffffff"
                                strokeWidth="0.28"
                              />
                              <line
                                x1={(point.x / projectionResolution) * 100 + 0.9}
                                y1={(point.y / projectionResolution) * 100 - 0.9}
                                x2={(point.x / projectionResolution) * 100 - 0.9}
                                y2={(point.y / projectionResolution) * 100 + 0.9}
                                stroke="#ffffff"
                                strokeWidth="0.28"
                              />
                            </>
                          )}
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

                {showRoiCornerGuides && showROI && bossHoverInfoMode === "nodes" && (
                  <g>
                    {roiCornerGuides.map((corner) => {
                      const cx = corner.x * 100;
                      const cy = corner.y * 100;
                      return (
                        <g key={`roi-corner-guide-${corner.label}`}>
                          <rect
                            x={cx - 0.62}
                            y={cy - 0.62}
                            width="1.24"
                            height="1.24"
                            rx="0.08"
                            fill="#ff4fd8"
                            stroke="#ffffff"
                            strokeWidth="0.24"
                            transform={`rotate(45 ${cx} ${cy})`}
                            opacity="0.95"
                          />
                          <text
                            x={cx + 1.2}
                            y={cy - 1}
                            fill="#120016"
                            opacity="0.88"
                            fontSize="1.55"
                            fontWeight="700"
                          >
                            {corner.label}
                          </text>
                          <text
                            x={cx + 1.12}
                            y={cy - 1.08}
                            fill="#ffd7f7"
                            fontSize="1.48"
                            fontWeight="700"
                          >
                            {corner.label}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                )}
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
                    const isManual = edge.isManual === true;
                    const isSelectedEdge =
                      selectedReconstructionEdgeKey === `${Math.min(edge.a, edge.b)}-${Math.max(edge.a, edge.b)}`;
                    const delaunayStyle = edge.isConstraint
                      ? getDelaunayConstraintStyle(edge.constraintFamily)
                      : { stroke: "#67e8f9", opacity: 0.52, dash: "6 6" };
                    const stroke =
                      reconstructionMode === "delaunay"
                        ? isManual
                          ? "#ef4444"
                          : delaunayStyle.stroke
                        : isManual
                          ? "#ef4444"
                          : reconstructionEdgePalette[idx % reconstructionEdgePalette.length];
                    return (
                      <g key={`re-edge-${idx}`}>
                        {isSelectedEdge && (
                          <>
                            <line
                              x1={start.x}
                              y1={start.y}
                              x2={end.x}
                              y2={end.y}
                              stroke="#fff7ae"
                              strokeWidth="20"
                              opacity="0.3"
                            />
                            <line
                              x1={start.x}
                              y1={start.y}
                              x2={end.x}
                              y2={end.y}
                              stroke="#facc15"
                              strokeWidth="14"
                              opacity="0.92"
                            />
                          </>
                        )}
                        <line
                          x1={start.x}
                          y1={start.y}
                          x2={end.x}
                          y2={end.y}
                          stroke="#00151a"
                          strokeWidth={
                            reconstructionMode === "delaunay"
                              ? isManual
                                ? 12
                                : edge.isConstraint
                                  ? 13
                                  : 11.5
                              : isManual
                                ? 12
                                : edge.isConstraint
                                  ? 10
                                  : 8
                          }
                          opacity={0.42}
                        />
                        <line
                          x1={start.x}
                          y1={start.y}
                          x2={end.x}
                          y2={end.y}
                          stroke={stroke}
                          strokeWidth={
                            isSelectedEdge
                              ? reconstructionMode === "delaunay"
                                ? 12
                                : 8.5
                              : reconstructionMode === "delaunay"
                                ? isManual
                                  ? 10
                                  : edge.isConstraint
                                    ? 9.8
                                    : 8.6
                                : isManual
                                  ? 10
                                  : edge.isConstraint
                                    ? 8
                                    : 6
                          }
                          opacity={
                            isSelectedEdge
                              ? 1
                              : reconstructionMode === "delaunay"
                                ? isManual
                                  ? 0.98
                                  : delaunayStyle.opacity
                                : isManual
                                  ? 0.98
                                  : edge.isConstraint
                                    ? 0.98
                                    : 0.9
                          }
                          strokeDasharray={
                            reconstructionMode === "delaunay" && !isManual && delaunayStyle.dash !== "none"
                              ? delaunayStyle.dash
                              : undefined
                          }
                        />
                        {isSelectedEdge && (
                          <>
                            <circle
                              cx={start.x}
                              cy={start.y}
                              r="10"
                              fill="#facc15"
                              opacity="0.24"
                            />
                            <circle
                              cx={end.x}
                              cy={end.y}
                              r="10"
                              fill="#facc15"
                              opacity="0.24"
                            />
                            <circle
                              cx={start.x}
                              cy={start.y}
                              r="6.6"
                              fill="#fff7ae"
                              stroke="#f59e0b"
                              strokeWidth="2.2"
                            />
                            <circle
                              cx={end.x}
                              cy={end.y}
                              r="6.6"
                              fill="#fff7ae"
                              stroke="#f59e0b"
                              strokeWidth="2.2"
                            />
                          </>
                        )}
                      </g>
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
                      {(() => {
                        const style = getReconstructionBossStyle(boss.source);
                        return (
                          <>
                      <circle
                        cx={(boss.x / projectionResolution) * 100}
                        cy={(boss.y / projectionResolution) * 100}
                        r="0.8"
                        fill={style.fill}
                        stroke={style.stroke}
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
                          </>
                        );
                      })()}
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
                      <p className={hoveredBoss.matched ? "text-emerald-300" : "text-red-300"}>
                        {hoveredBoss.matched ? "Yes" : "No"}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {hoveredReconstructionEdge && !hoveredBoss && (
                <div
                  className="absolute z-20 min-w-[220px] rounded-md border border-primary/35 bg-background/95 px-2.5 py-2 text-[11px] leading-tight pointer-events-none shadow-lg"
                  style={{
                    left: Math.max(
                      8,
                      Math.min(
                        hoveredReconstructionEdge.x + 12,
                        hoveredReconstructionEdge.hostWidth - 220 - 8
                      )
                    ),
                    top: Math.max(
                      8,
                      Math.min(
                        hoveredReconstructionEdge.y + 12,
                        hoveredReconstructionEdge.hostHeight - 124 - 8
                      )
                    ),
                  }}
                >
                  <p className="mb-1 font-semibold">
                    {hoveredReconstructionEdge.kind === "candidate" ? "Candidate" : "Selected"} edge {hoveredReconstructionEdge.aLabel}-{hoveredReconstructionEdge.bLabel}
                  </p>
                  <div className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1">
                    <p className="text-muted-foreground">Overlap</p>
                    <p className="font-mono text-foreground">
                      {hoveredReconstructionEdge.overlapScore !== null ? hoveredReconstructionEdge.overlapScore.toFixed(4) : "-"}
                    </p>
                    <p className="text-muted-foreground">3rd boss pen.</p>
                    <p className="font-mono text-foreground">
                      {hoveredReconstructionEdge.thirdBossPenalty !== null ? hoveredReconstructionEdge.thirdBossPenalty.toFixed(4) : "-"}
                    </p>
                    <p className="text-muted-foreground">Edge score</p>
                    <p className="font-mono text-foreground">
                      {hoveredReconstructionEdge.score !== null ? hoveredReconstructionEdge.score.toFixed(4) : "-"}
                    </p>
                    <p className="text-muted-foreground">Mutual</p>
                    <p className={hoveredReconstructionEdge.mutual ? "text-emerald-300" : "text-muted-foreground"}>
                      {hoveredReconstructionEdge.mutual === null ? "-" : hoveredReconstructionEdge.mutual ? "Yes" : "No"}
                    </p>
                    <p className="text-muted-foreground">Type</p>
                    <p className="text-foreground">
                      {hoveredReconstructionEdge.isManual
                        ? "Manual"
                        : hoveredReconstructionEdge.isConstraint
                          ? reconstructionMode === "delaunay"
                            ? getDelaunayConstraintStyle(
                                reconstructionEdges.find(
                                  (edge) =>
                                    Math.min(edge.a, edge.b) === Math.min(hoveredReconstructionEdge.a, hoveredReconstructionEdge.b) &&
                                    Math.max(edge.a, edge.b) === Math.max(hoveredReconstructionEdge.a, hoveredReconstructionEdge.b)
                                )?.constraintFamily
                              ).label
                            : "Boundary"
                          : "Candidate"}
                    </p>
                  </div>
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
            <div className="min-h-12 border-t border-white/10 bg-black" />
          </div>
          {enableViewportTools && (
            <PreviewToolkit
              showSelectMode={roiInteractive || bossPointInteractive || bossHoverInfoMode === "matching" || showInspectMode}
              showHistoryControls={bossPointInteractive}
              selectLabel={selectModeLabel}
              selectTitle={selectModeTitle}
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
