"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  saveROI,
  ROIData,
  getIntradosLines,
  IntradosLine,
  prepareRoiBayProportion,
  getNodeState,
  getCutTypologyCsv,
  getBayPlanState,
  saveBayPlanManualEdges,
  saveNodes,
  runBayPlanReconstruction,
  runCutTypologyMatching,
  type Geometry2DAutoCorrectConfig,
  type Geometry2DBayPlanRunParams,
  type Geometry2DBayPlanEdge as Geometry2DReconstructEdge,
  type Geometry2DRoiParams,
  type Geometry2DNodePoint as Geometry2DTemplateBossPoint,
  type Geometry2DCutTypologyBossMatch as Geometry2DTemplateBossMatch,
  type Geometry2DCutTypologyBossResult as Geometry2DTemplateBossResult,
  type Geometry2DCutTypologyOverlayVariant as Geometry2DTemplateOverlayVariant,
  type Geometry2DBayPlanBossPoint as Geometry2DReconstructBossPoint,
  type Geometry2DBayPlanRunResult as Geometry2DReconstructRunResult,
  type Geometry2DCutTypologyParams as Geometry2DTemplateStateParams,
  type Geometry2DCutTypologyVariantResult as Geometry2DTemplateVariantResult,
} from "@/lib/api";
import { useProjectStore, Segmentation } from "@/lib/store";
import { ROIState, useRoiInteraction } from "@/hooks/useRoiInteraction";
import {
  DEFAULT_RECONSTRUCT_LAYERS,
  GeometryResult,
  Geometry2DReconstructLayers,
  Geometry2DReconstructOverlayKey,
  Geometry2DSegmentationLayerOption,
  Geometry2DWorkflowSection,
  GroupVisibilityInfo,
} from "@/components/geometry2d/types";
import { toast } from "@/components/ui/use-toast";
import {
  buildPerBossTypologySummary,
  collectPrimaryReadingOverlayLabelsFromPerBoss,
  normaliseMatchCsvRows,
  type MatchCsvRow,
} from "@/components/geometry2d/stages/template/cutTypologyMatchingUtils";

export type ImageViewType = "colour" | "depthGrayscale" | "depthPlasma";

interface Step4NodesState {
  points?: Geometry2DTemplateBossPoint[];
  detectedPoints?: Geometry2DTemplateBossPoint[];
  lastStateLoadedAt?: string;
}

interface Step4MatchingState {
  params?: Geometry2DTemplateStateParams;
  overlayVariants?: Geometry2DTemplateOverlayVariant[];
  selectedOverlayLabels?: string[];
  variantResults?: Geometry2DTemplateVariantResult[];
  bestVariantLabel?: string;
  outputDir?: string;
  matchCsvPath?: string;
  lastRunAt?: string;
}

interface Step4Geometry2DState {
  roi?: ROIState;
  ui?: {
    activeSection?: Geometry2DWorkflowSection;
    showAdvancedLayers?: boolean;
    showReconstructLayers?: boolean;
    showBaseImage?: boolean;
    showRoiCornerGuides?: boolean;
    includeRoiCornerPoints?: boolean;
  };
  prep?: {
    bossCount?: number;
    roiPath?: string;
    bossReportPath?: string;
    outputDir?: string;
    vaultRatio?: number;
    vaultRatioSuggestions?: Array<{ label: string; err: number }>;
    autoCorrectRoi?: boolean;
    correctionApplied?: boolean;
    autoCorrection?: Record<string, unknown>;
    autoCorrectConfig?: Geometry2DAutoCorrectConfig;
    originalRoi?: ROIState;
    correctedRoi?: ROIState;
    appliedRoi?: ROIState;
    showOriginalOverlay?: boolean;
    showUpdatedOverlay?: boolean;
    analysedAt?: string;
  };
  nodes?: Step4NodesState;
  matching?: Step4MatchingState;
  template?: Step4MatchingState & Step4NodesState;
  reconstruct?: {
    result?: Geometry2DReconstructRunResult;
    previewBosses?: Geometry2DReconstructBossPoint[];
    showOverlay?: boolean;
    lastRunAt?: string;
    statePath?: string;
    resultPath?: string;
    params?: Record<string, unknown>;
    defaults?: Record<string, unknown>;
    layers?: Geometry2DReconstructLayers;
  };
  analysis?: GeometryResult | null;
  roiStats?: { insideCount: number; outsideCount: number };
}

type TemplatePointFilter = "all" | "inside" | "outside";

const DEFAULT_ROI: ROIState = {
  x: 0.5,
  y: 0.5,
  width: 0.6,
  height: 0.6,
  rotation: 0,
};

const DEFAULT_TEMPLATE_PARAMS: Geometry2DTemplateStateParams = {
  starcutMin: 2,
  starcutMax: 6,
  includeStarcut: true,
  includeInner: true,
  includeOuter: true,
  allowCrossTemplate: true,
  tolerance: 0.02,
};

const ROI_INSIDE_MARGIN_UV = 0.02;

const DEFAULT_AUTO_CORRECT_CONFIG: Geometry2DAutoCorrectConfig = {
  preset: "balanced",
};

function normalizeAutoCorrectConfig(
  config: Geometry2DAutoCorrectConfig | undefined
): Geometry2DAutoCorrectConfig {
  return {
    preset: config?.preset || DEFAULT_AUTO_CORRECT_CONFIG.preset,
  };
}

function isSameRoi(a: ROIState | undefined, b: ROIState | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.rotation === b.rotation
  );
}

function roiParamsToState(params: Geometry2DRoiParams | undefined, resolution: number): ROIState | undefined {
  if (!params) return undefined;
  if (resolution <= 0) return undefined;
  return {
    x: params.cx / resolution,
    y: params.cy / resolution,
    width: params.w / resolution,
    height: params.h / resolution,
    rotation: params.rotation_deg || 0,
  };
}

function sanitizeTemplateParams(params: Partial<Geometry2DTemplateStateParams> | undefined): Geometry2DTemplateStateParams {
  const merged = {
    ...DEFAULT_TEMPLATE_PARAMS,
    ...(params || {}),
  };
  const min = Math.max(2, Math.round(merged.starcutMin));
  const max = Math.max(min, Math.round(merged.starcutMax));
  return {
    starcutMin: min,
    starcutMax: max,
    includeStarcut: !!merged.includeStarcut,
    includeInner: !!merged.includeInner,
    includeOuter: !!merged.includeOuter,
    allowCrossTemplate: !!merged.allowCrossTemplate,
    tolerance: Math.max(0.001, Math.min(0.1, Number(merged.tolerance))),
  };
}

function pointSignature(points: Geometry2DTemplateBossPoint[]): string {
  return JSON.stringify(
    [...points]
      .map((point) => ({
        id: point.id,
        label: point.label,
        x: Number(point.x.toFixed(3)),
        y: Number(point.y.toFixed(3)),
        source: point.source,
        pointType: point.pointType || "boss",
      }))
      .sort((a, b) => a.id - b.id)
  );
}

function cloneTemplatePoints(points: Geometry2DTemplateBossPoint[]): Geometry2DTemplateBossPoint[] {
  return points.map((point) => ({ ...point }));
}

function coercePointsToPixelCoordinates(
  points: Geometry2DTemplateBossPoint[],
  resolution: number
): Geometry2DTemplateBossPoint[] {
  if (resolution <= 1) return points;
  return points.map((point) => {
    const x = Number(point.x);
    const y = Number(point.y);
    const looksUnit = x >= 0 && x <= 1.01 && y >= 0 && y <= 1.01;
    if (!looksUnit) return point;
    return {
      ...point,
      x: x * resolution,
      y: y * resolution,
    };
  });
}

function getPointType(point: Pick<Geometry2DTemplateBossPoint, "pointType">): "boss" | "corner" {
  return point.pointType === "corner" ? "corner" : "boss";
}

function cloneAndSortTemplatePoints(points: Geometry2DTemplateBossPoint[]): Geometry2DTemplateBossPoint[] {
  return points.map((point) => ({ ...point, pointType: getPointType(point) })).sort((a, b) => a.id - b.id);
}

function allocateNextPointId(usedIds: Set<number>): number {
  let nextId = Math.max(0, ...usedIds) + 1;
  while (usedIds.has(nextId)) {
    nextId += 1;
  }
  usedIds.add(nextId);
  return nextId;
}

function distanceBetweenPoints(a: Pick<Geometry2DTemplateBossPoint, "x" | "y">, b: Pick<Geometry2DTemplateBossPoint, "x" | "y">) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function reconcileLegacyCornerReferencePoints(
  points: Geometry2DTemplateBossPoint[],
  detectedPoints: Geometry2DTemplateBossPoint[]
): Geometry2DTemplateBossPoint[] {
  const detectedCorners = detectedPoints.filter((point) => getPointType(point) === "corner");
  if (detectedCorners.length === 0) return cloneAndSortTemplatePoints(points);

  const nextPoints = cloneAndSortTemplatePoints(points);
  const usedPointIds = new Set<number>();
  const CORNER_MATCH_TOLERANCE_PX = 18;

  detectedCorners.forEach((cornerPoint) => {
    let matchIndex = nextPoints.findIndex(
      (point) => getPointType(point) === "corner" && point.label === cornerPoint.label
    );

    if (matchIndex < 0) {
      matchIndex = nextPoints.findIndex((point) => point.id === cornerPoint.id);
    }

    if (matchIndex < 0) {
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      nextPoints.forEach((point, index) => {
        if (usedPointIds.has(point.id)) return;
        const distance = distanceBetweenPoints(point, cornerPoint);
        if (distance <= CORNER_MATCH_TOLERANCE_PX && distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      matchIndex = bestIndex;
    }

    if (matchIndex >= 0) {
      usedPointIds.add(nextPoints[matchIndex].id);
      nextPoints[matchIndex] = {
        ...nextPoints[matchIndex],
        label: cornerPoint.label,
        pointType: "corner",
      };
    }
  });

  return cloneAndSortTemplatePoints(nextPoints);
}

function mergeCornerReferencePoints(
  points: Geometry2DTemplateBossPoint[],
  detectedPoints: Geometry2DTemplateBossPoint[]
): Geometry2DTemplateBossPoint[] {
  const cornersByLabel = new Map(
    detectedPoints
      .filter((point) => getPointType(point) === "corner")
      .map((point) => [point.label, { ...point, pointType: "corner" as const }])
  );
  const merged = cloneAndSortTemplatePoints(points);
  const usedIds = new Set(merged.map((point) => point.id));
  const existingCornerLabels = new Set(
    merged.filter((point) => getPointType(point) === "corner").map((point) => point.label)
  );
  cornersByLabel.forEach((point, label) => {
    if (!existingCornerLabels.has(label)) {
      const nextPoint = usedIds.has(point.id)
        ? { ...point, id: allocateNextPointId(usedIds) }
        : point;
      usedIds.add(nextPoint.id);
      merged.push(nextPoint);
    }
  });
  return cloneAndSortTemplatePoints(merged);
}

function applyCornerPointPreference(
  points: Geometry2DTemplateBossPoint[],
  detectedPoints: Geometry2DTemplateBossPoint[],
  includeCorners: boolean
): Geometry2DTemplateBossPoint[] {
  if (includeCorners) {
    return mergeCornerReferencePoints(reconcileLegacyCornerReferencePoints(points, detectedPoints), detectedPoints);
  }
  return cloneAndSortTemplatePoints(points.filter((point) => getPointType(point) !== "corner"));
}

function normaliseReferencePointsForDisplay(
  points: Geometry2DTemplateBossPoint[],
  detectedPoints: Geometry2DTemplateBossPoint[],
  includeCorners: boolean
): Geometry2DTemplateBossPoint[] {
  return applyCornerPointPreference(cloneAndSortTemplatePoints(points), detectedPoints, includeCorners);
}

function variantPriority(variantLabel: string): [number, number] {
  if (variantLabel.startsWith("starcut_n=")) {
    const n = Number(variantLabel.split("=", 2)[1]);
    return [0, Number.isFinite(n) ? n : 9999];
  }
  if (variantLabel === "circlecut_inner") return [1, 0];
  if (variantLabel === "circlecut_outer") return [2, 0];
  return [3, 9999];
}

function selectSimplestMatch(matches: Geometry2DTemplateBossMatch[]): Geometry2DTemplateBossMatch | undefined {
  if (!Array.isArray(matches) || matches.length === 0) return undefined;
  return [...matches].sort((a, b) => {
    const [pa, na] = variantPriority(a.variantLabel || "");
    const [pb, nb] = variantPriority(b.variantLabel || "");
    if (pa !== pb) return pa - pb;
    if (na !== nb) return na - nb;
    const errA = Number(a.xError || 9999) + Number(a.yError || 9999);
    const errB = Number(b.xError || 9999) + Number(b.yError || 9999);
    return errA - errB;
  })[0];
}

function roiUvToPixel(u: number, v: number, roi: Geometry2DRoiParams): { x: number; y: number } {
  const angle = ((roi.rotation_deg || 0) * Math.PI) / 180;
  const xLocal = (u - 0.5) * roi.w;
  const yLocal = (v - 0.5) * roi.h;
  const x = roi.cx + (Math.cos(angle) * xLocal) - (Math.sin(angle) * yLocal);
  const y = roi.cy + (Math.sin(angle) * xLocal) + (Math.cos(angle) * yLocal);
  return { x, y };
}

function formatTemplateLabel(raw?: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("starcut_n=")) {
    const n = Number(raw.split("=", 2)[1]);
    return Number.isFinite(n) ? `starcut n=${n}` : "starcut";
  }
  if (raw === "circlecut_inner") return "circlecut inner";
  if (raw === "circlecut_outer") return "circlecut outer";
  return raw;
}

function parseOptionalMatchCsvValue(raw?: string | null): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value || value.toLowerCase() === "none") return null;
  return value;
}

function parseMatchCsvPixelPair(raw?: string | null): [number, number] | null {
  const value = parseOptionalMatchCsvValue(raw);
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length < 2) return null;
    const x = Number(parsed[0]);
    const y = Number(parsed[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return [x, y];
  } catch {
    return null;
  }
}

function withMatchedTemplateCoordinates(
  points: Geometry2DTemplateBossPoint[],
  perBoss: Geometry2DTemplateBossResult[],
  roi: Geometry2DRoiParams
): Geometry2DTemplateBossPoint[] {
  const byId = new Map<number, Geometry2DTemplateBossResult>();
  for (const row of perBoss || []) {
    byId.set(Number(row.id), row);
  }

  return points.map((point) => {
    const row = byId.get(point.id);
    const simplest = row ? selectSimplestMatch(row.matches || []) : undefined;
    if (!simplest || typeof simplest.xRatio !== "number" || typeof simplest.yRatio !== "number") {
      return {
        ...point,
        matchedTemplateX: null,
        matchedTemplateY: null,
        matchedVariantLabel: null,
        matchedXTemplateLabel: null,
        matchedYTemplateLabel: null,
      };
    }
    const xTemplateLabel = formatTemplateLabel(simplest.xTemplate || simplest.variantLabel);
    const yTemplateLabel = formatTemplateLabel(simplest.yTemplate || simplest.variantLabel);
    const templatePixel = roiUvToPixel(simplest.xRatio, simplest.yRatio, roi);
    return {
      ...point,
      matchedTemplateX: Math.round(templatePixel.x),
      matchedTemplateY: Math.round(templatePixel.y),
      matchedVariantLabel: simplest.variantLabel || null,
      matchedXTemplateLabel: xTemplateLabel,
      matchedYTemplateLabel: yTemplateLabel,
    };
  });
}

function withMatchedTemplateCoordinatesFromCsv(
  points: Geometry2DTemplateBossPoint[],
  rows: MatchCsvRow[]
): Geometry2DTemplateBossPoint[] {
  const rowsByBossId = new Map<number, MatchCsvRow>();
  for (const row of rows) {
    const bossId = Number(row.boss_id);
    if (Number.isFinite(bossId) && !rowsByBossId.has(bossId)) {
      rowsByBossId.set(bossId, row);
    }
  }

  return points.map((point) => {
    const row = rowsByBossId.get(point.id);
    const matched = String(row?.matched || "").toLowerCase() === "true";
    const templatePixel = matched ? parseMatchCsvPixelPair(row?.template_xy) : null;
    return {
      ...point,
      matchedTemplateX: templatePixel ? Math.round(templatePixel[0]) : null,
      matchedTemplateY: templatePixel ? Math.round(templatePixel[1]) : null,
      matchedVariantLabel: matched ? parseOptionalMatchCsvValue(row?.variant_label) : null,
      matchedXTemplateLabel: matched ? formatTemplateLabel(parseOptionalMatchCsvValue(row?.x_cut)) : null,
      matchedYTemplateLabel: matched ? formatTemplateLabel(parseOptionalMatchCsvValue(row?.y_cut)) : null,
    };
  });
}

function templatePointMatchDecorationSignature(points: Geometry2DTemplateBossPoint[]): string {
  return JSON.stringify(
    points
      .map((point) => ({
        id: point.id,
        matchedTemplateX: point.matchedTemplateX ?? null,
        matchedTemplateY: point.matchedTemplateY ?? null,
        matchedVariantLabel: point.matchedVariantLabel ?? null,
        matchedXTemplateLabel: point.matchedXTemplateLabel ?? null,
        matchedYTemplateLabel: point.matchedYTemplateLabel ?? null,
      }))
      .sort((a, b) => a.id - b.id)
  );
}

export function useStep4Geometry2DController() {
  const { currentProject, setGeometryResult, completeStep, updateSegmentation } = useProjectStore();

  const [isAnalysing, setIsAnalysing] = useState(false);
  const [result, setResult] = useState<GeometryResult | null>(null);
  const [vaultRatio, setVaultRatio] = useState<number | undefined>(undefined);
  const [vaultRatioSuggestions, setVaultRatioSuggestions] = useState<Array<{ label: string; err: number }>>([]);
  const [bossCount, setBossCount] = useState<number | undefined>(undefined);
  const [analysedAt, setAnalysedAt] = useState<string | undefined>(undefined);
  const [autoCorrectRoi, setAutoCorrectRoi] = useState(false);
  const [correctionApplied, setCorrectionApplied] = useState<boolean | undefined>(undefined);
  const [originalRoiPreview, setOriginalRoiPreview] = useState<ROIState | undefined>(undefined);
  const [correctedRoiPreview, setCorrectedRoiPreview] = useState<ROIState | undefined>(undefined);
  const [showOriginalOverlay, setShowOriginalOverlay] = useState(true);
  const [showUpdatedOverlay, setShowUpdatedOverlay] = useState(true);
  const [autoCorrectConfig, setAutoCorrectConfig] = useState<Geometry2DAutoCorrectConfig>(DEFAULT_AUTO_CORRECT_CONFIG);

  const [templatePoints, setTemplatePoints] = useState<Geometry2DTemplateBossPoint[]>([]);
  const [templateDetectedPoints, setTemplateDetectedPoints] = useState<Geometry2DTemplateBossPoint[]>([]);
  const [templateParams, setTemplateParams] = useState<Geometry2DTemplateStateParams>(DEFAULT_TEMPLATE_PARAMS);
  const [templateOverlayVariants, setTemplateOverlayVariants] = useState<Geometry2DTemplateOverlayVariant[]>([]);
  const [selectedTemplateOverlayLabels, setSelectedTemplateOverlayLabels] = useState<string[]>([]);
  const [templateVariantResults, setTemplateVariantResults] = useState<Geometry2DTemplateVariantResult[]>([]);
  const [templateBestVariantLabel, setTemplateBestVariantLabel] = useState<string | undefined>(undefined);
  const [templateOutputDir, setTemplateOutputDir] = useState<string | undefined>(undefined);
  const [templateMatchCsvPath, setTemplateMatchCsvPath] = useState<string | undefined>(undefined);
  const [templateMatchCsvColumns, setTemplateMatchCsvColumns] = useState<string[]>([]);
  const [templateMatchCsvRows, setTemplateMatchCsvRows] = useState<Array<Record<string, string>>>([]);
  const [templateLastRunAt, setTemplateLastRunAt] = useState<string | undefined>(undefined);
  const [templatePointFilter, setTemplatePointFilter] = useState<TemplatePointFilter>("all");
  const [selectedTemplatePointId, setSelectedTemplatePointId] = useState<number | undefined>(undefined);
  const [templateSavedPointsSignature, setTemplateSavedPointsSignature] = useState<string>(pointSignature([]));
  const [templatePointHistoryState, setTemplatePointHistoryState] = useState<{
    stack: Geometry2DTemplateBossPoint[][];
    index: number;
  }>({
    stack: [],
    index: -1,
  });
  const [isLoadingTemplateState, setIsLoadingTemplateState] = useState(false);
  const [isSavingTemplatePoints, setIsSavingTemplatePoints] = useState(false);
  const [isRunningTemplateMatching, setIsRunningTemplateMatching] = useState(false);
  const [isLoadingTemplateMatchCsv, setIsLoadingTemplateMatchCsv] = useState(false);
  const [reconstructResult, setReconstructResult] = useState<Geometry2DReconstructRunResult | null>(null);
  const [reconstructPreviewBosses, setReconstructPreviewBosses] = useState<Geometry2DReconstructBossPoint[]>([]);
  const [reconstructLastRunAt, setReconstructLastRunAt] = useState<string | undefined>(undefined);
  const [reconstructStatePath, setReconstructStatePath] = useState<string | undefined>(undefined);
  const [reconstructResultPath, setReconstructResultPath] = useState<string | undefined>(undefined);
  const [reconstructParams, setReconstructParams] = useState<Geometry2DBayPlanRunParams>({});
  const [reconstructDefaults, setReconstructDefaults] = useState<Record<string, unknown>>({});
  const [reconstructLayers, setReconstructLayers] = useState<Geometry2DReconstructLayers>(DEFAULT_RECONSTRUCT_LAYERS);
  const [isLoadingReconstructionState, setIsLoadingReconstructionState] = useState(false);
  const [isRunningReconstruction, setIsRunningReconstruction] = useState(false);
  const [isSavingReconstructionManualEdges, setIsSavingReconstructionManualEdges] = useState(false);

  const [roi, setRoi] = useState<ROIState>(DEFAULT_ROI);
  const [showROI, setShowROI] = useState(true);
  const [showBaseImage, setShowBaseImage] = useState(true);
  const [showRoiCornerGuides, setShowRoiCornerGuides] = useState(true);
  const [includeRoiCornerPoints, setIncludeRoiCornerPoints] = useState(true);
  const [isSavingROI, setIsSavingROI] = useState(false);
  const [roiSaveResult, setRoiSaveResult] = useState<{ inside: number; outside: number } | null>(null);

  const [intradosLines, setIntradosLines] = useState<IntradosLine[]>([]);
  const [showIntrados, setShowIntrados] = useState(true);
  const [activeSection, setActiveSection] = useState<Geometry2DWorkflowSection>("roi");
  const [showAdvancedLayers, setShowAdvancedLayers] = useState(true);
  const [showReconstructLayers, setShowReconstructLayers] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const templatePointsRef = useRef<Geometry2DTemplateBossPoint[]>([]);
  const templateDetectedPointsRef = useRef<Geometry2DTemplateBossPoint[]>([]);
  const selectedTemplateOverlayLabelsRef = useRef<string[]>([]);
  const prevActiveSectionRef = useRef<Geometry2DWorkflowSection | null>(null);
  const autoLoadProjectIdRef = useRef<string | null>(null);
  const templateStateRequestIdRef = useRef(0);
  const reconstructionStateRequestIdRef = useRef(0);

  const [selectedImageType, setSelectedImageType] = useState<ImageViewType>("colour");
  const [overlayOpacity, setOverlayOpacity] = useState(0.6);
  const [showMaskOverlay, setShowMaskOverlay] = useState(false);

  const handleReconstructParamChange = useCallback((patch: Partial<Geometry2DBayPlanRunParams>) => {
    setReconstructParams((prev) => ({
      ...prev,
      ...patch,
    }));
  }, []);

  const getLatestStep4Geometry2D = useCallback((): {
    step4Data: Record<string, unknown>;
    geometry2d: Step4Geometry2DState;
  } => {
    const latestProject = useProjectStore.getState().currentProject;
    const step4Data = (latestProject?.steps?.[4]?.data || {}) as Record<string, unknown>;
    const geometry2d = (step4Data as { geometry2d?: Step4Geometry2DState }).geometry2d || {};
    return { step4Data, geometry2d };
  }, []);

  const updateStep4Geometry2D = useCallback((patch: Partial<Step4Geometry2DState>) => {
    const { step4Data, geometry2d } = getLatestStep4Geometry2D();
    completeStep(4, {
      ...step4Data,
      geometry2d: {
        ...geometry2d,
        ...patch,
      },
    });
  }, [completeStep, getLatestStep4Geometry2D]);

  const persistNodesPatch = useCallback((patch: Partial<Step4NodesState>) => {
    const geometry2d = getLatestStep4Geometry2D().geometry2d;
    const existingNodes = geometry2d.nodes || {};
    updateStep4Geometry2D({
      nodes: {
        ...existingNodes,
        ...patch,
      },
    });
  }, [getLatestStep4Geometry2D, updateStep4Geometry2D]);

  const persistMatchingPatch = useCallback((patch: Partial<Step4MatchingState>) => {
    const geometry2d = getLatestStep4Geometry2D().geometry2d;
    const existingMatching = geometry2d.matching || geometry2d.template || {};
    updateStep4Geometry2D({
      matching: {
        ...existingMatching,
        ...patch,
      },
    });
  }, [getLatestStep4Geometry2D, updateStep4Geometry2D]);

  const selectedProjection = useMemo(() => {
    if (!currentProject?.projections?.length) return null;
    return currentProject.projections[0];
  }, [currentProject?.projections]);

  const currentImage = useMemo(() => {
    if (!selectedProjection?.images) return null;
    return selectedProjection.images[selectedImageType] || selectedProjection.images.colour;
  }, [selectedProjection, selectedImageType]);

  const segmentations = useMemo(() => currentProject?.segmentations || [], [currentProject?.segmentations]);

  const groupedSegmentations = useMemo(() => {
    const groups: Record<string, Segmentation[]> = {};
    segmentations.forEach(seg => {
      const baseLabel = seg.label.replace(/\s*#?\d+$/, "").trim() || seg.label;
      if (!groups[baseLabel]) {
        groups[baseLabel] = [];
      }
      groups[baseLabel].push(seg);
    });
    return groups;
  }, [segmentations]);

  const groupVisibility = useMemo(() => {
    const visibility: Record<string, GroupVisibilityInfo> = {};
    Object.entries(groupedSegmentations).forEach(([label, segs]) => {
      visibility[label] = {
        visible: segs.filter(s => s.visible).length,
        total: segs.length,
        color: segs[0]?.color || "#888888",
      };
    });
    return visibility;
  }, [groupedSegmentations]);

  const reconstructionSegmentationLayers = useMemo<Geometry2DSegmentationLayerOption[]>(() => {
    if (currentProject?.segmentationGroups && currentProject.segmentationGroups.length > 0) {
      return currentProject.segmentationGroups.map((group) => ({
        groupId: group.groupId,
        label: group.label,
        color: group.color || "#888888",
      }));
    }

    return Object.entries(groupedSegmentations).map(([label, segs]) => ({
      groupId: segs[0]?.groupId || label.toLowerCase().replace(/\s+/g, "_"),
      label,
      color: segs[0]?.color || "#888888",
    }));
  }, [currentProject?.segmentationGroups, groupedSegmentations]);

  const selectedTemplateOverlays = useMemo(() => {
    const byLabel = new Map(templateOverlayVariants.map((variant) => [variant.variantLabel, variant]));
    return selectedTemplateOverlayLabels
      .map((label) => byLabel.get(label))
      .filter((value): value is Geometry2DTemplateOverlayVariant => !!value);
  }, [templateOverlayVariants, selectedTemplateOverlayLabels]);
  const matchingEvidenceLoaded = templateMatchCsvRows.length > 0;
  const normalisedTemplateMatchCsvRows = useMemo(
    () => normaliseMatchCsvRows(templateMatchCsvRows),
    [templateMatchCsvRows]
  );
  const matchingUnmatchedNodeIds = useMemo(
    () =>
      templateMatchCsvRows
        .filter((row) => String(row.point_type || "boss").toLowerCase() === "boss")
        .filter((row) => String(row.matched || "").toLowerCase() !== "true")
        .map((row) => Number(row.boss_id))
        .filter((value) => Number.isFinite(value)),
    [templateMatchCsvRows]
  );

  const filteredTemplatePoints = useMemo(() => {
    if (templatePointFilter === "inside") {
      return templatePoints.filter((point) => !point.outOfBounds);
    }
    if (templatePointFilter === "outside") {
      return templatePoints.filter((point) => point.outOfBounds);
    }
    return templatePoints;
  }, [templatePointFilter, templatePoints]);

  const hasTemplatePointChanges = useMemo(
    () => pointSignature(templatePoints) !== templateSavedPointsSignature,
    [templatePoints, templateSavedPointsSignature]
  );
  const canUndoTemplatePoints = templatePointHistoryState.index > 0;
  const canRedoTemplatePoints =
    templatePointHistoryState.index >= 0 &&
    templatePointHistoryState.index < templatePointHistoryState.stack.length - 1;

  useEffect(() => {
    templatePointsRef.current = templatePoints;
  }, [templatePoints]);

  useEffect(() => {
    templateDetectedPointsRef.current = templateDetectedPoints;
  }, [templateDetectedPoints]);

  useEffect(() => {
    selectedTemplateOverlayLabelsRef.current = selectedTemplateOverlayLabels;
  }, [selectedTemplateOverlayLabels]);

  useEffect(() => {
    if (!templateLastRunAt || normalisedTemplateMatchCsvRows.length === 0 || templatePoints.length === 0) return;

    const currentSignature = templatePointMatchDecorationSignature(templatePoints);
    const nextPoints = withMatchedTemplateCoordinatesFromCsv(templatePoints, normalisedTemplateMatchCsvRows);
    const nextSignature = templatePointMatchDecorationSignature(nextPoints);
    if (currentSignature !== nextSignature) {
      setTemplatePoints(nextPoints);
    }
  }, [normalisedTemplateMatchCsvRows, templateLastRunAt, templatePoints]);

  const resetTemplatePointHistory = useCallback((points: Geometry2DTemplateBossPoint[]) => {
    setTemplatePointHistoryState({
      stack: [cloneTemplatePoints(points)],
      index: 0,
    });
  }, []);

  const pushTemplatePointHistory = useCallback((points: Geometry2DTemplateBossPoint[]) => {
    const snapshot = cloneTemplatePoints(points);
    const nextSignature = pointSignature(snapshot);
    setTemplatePointHistoryState((prev) => {
      const current = prev.index >= 0 ? prev.stack[prev.index] : undefined;
      if (current && pointSignature(current) === nextSignature) {
        return prev;
      }
      const trimmed = prev.stack.slice(0, prev.index + 1);
      const nextStack = [...trimmed, snapshot];
      return {
        stack: nextStack,
        index: nextStack.length - 1,
      };
    });
  }, []);

  const handleUndoTemplatePoints = useCallback(() => {
    if (templatePointHistoryState.index <= 0) return;
    const nextIndex = templatePointHistoryState.index - 1;
    const snapshot = cloneTemplatePoints(templatePointHistoryState.stack[nextIndex] || []);
    setTemplatePointHistoryState((prev) => ({ ...prev, index: nextIndex }));
    setTemplatePoints(snapshot);
    persistNodesPatch({ points: snapshot });
    setSelectedTemplatePointId((current) =>
      current && snapshot.some((point) => point.id === current) ? current : snapshot[0]?.id
    );
  }, [persistNodesPatch, templatePointHistoryState.index, templatePointHistoryState.stack]);

  const handleRedoTemplatePoints = useCallback(() => {
    if (templatePointHistoryState.index < 0 || templatePointHistoryState.index >= templatePointHistoryState.stack.length - 1) return;
    const nextIndex = templatePointHistoryState.index + 1;
    const snapshot = cloneTemplatePoints(templatePointHistoryState.stack[nextIndex] || []);
    setTemplatePointHistoryState((prev) => ({ ...prev, index: nextIndex }));
    setTemplatePoints(snapshot);
    persistNodesPatch({ points: snapshot });
    setSelectedTemplatePointId((current) =>
      current && snapshot.some((point) => point.id === current) ? current : snapshot[0]?.id
    );
  }, [persistNodesPatch, templatePointHistoryState.index, templatePointHistoryState.stack]);

  const toggleGroupVisibility = (groupLabel: string) => {
    const group = groupedSegmentations[groupLabel];
    if (!group) return;
    const anyVisible = group.some(s => s.visible);
    group.forEach(seg => {
      updateSegmentation(seg.id, { visible: !anyVisible });
    });
  };

  const toggleAllVisibility = (visible: boolean) => {
    segmentations.forEach(seg => {
      updateSegmentation(seg.id, { visible });
    });
  };

  const visibleMasks = segmentations.filter(s => s.visible);
  const reconstructionVisibleMasks = useMemo(() => {
    if (reconstructLayers.visibleSegmentationGroups.length === 0) return [];
    const visibleGroupIds = new Set(reconstructLayers.visibleSegmentationGroups);
    return segmentations.filter((seg) => !!seg.groupId && visibleGroupIds.has(seg.groupId));
  }, [reconstructLayers.visibleSegmentationGroups, segmentations]);

  const decorateTemplatePoint = useCallback((point: Geometry2DTemplateBossPoint): Geometry2DTemplateBossPoint => {
    const resolution = selectedProjection?.settings?.resolution || 2048;
    const px = point.x / resolution;
    const py = point.y / resolution;
    const angle = (roi.rotation * Math.PI) / 180;
    const dx = px - roi.x;
    const dy = py - roi.y;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const xLocal = c * dx + s * dy;
    const yLocal = -s * dx + c * dy;
    const width = roi.width === 0 ? 1e-6 : roi.width;
    const height = roi.height === 0 ? 1e-6 : roi.height;
    const u = (xLocal / width) + 0.5;
    const v = (yLocal / height) + 0.5;

    return {
      ...point,
      u,
      v,
      outOfBounds: !(
        u >= -ROI_INSIDE_MARGIN_UV &&
        u <= 1 + ROI_INSIDE_MARGIN_UV &&
        v >= -ROI_INSIDE_MARGIN_UV &&
        v <= 1 + ROI_INSIDE_MARGIN_UV
      ),
    };
  }, [roi, selectedProjection?.settings?.resolution]);

  const { handleMouseDown, handleMouseMove, handleMouseUp, getROICorners } = useRoiInteraction({
    canvasRef,
    showROI,
    roi,
    setRoi,
  });

  const handleAutoCorrectToggle = (checked: boolean) => {
    setAutoCorrectRoi(checked);
    if (checked && correctedRoiPreview) {
      setRoi(correctedRoiPreview);
    } else if (!checked && originalRoiPreview) {
      setRoi(originalRoiPreview);
    }
    const prep = getLatestStep4Geometry2D().geometry2d.prep || {};

    updateStep4Geometry2D({
      prep: {
        ...prep,
        autoCorrectRoi: checked,
      },
    });
  };

  const handleAutoCorrectPresetChange = (preset: NonNullable<Geometry2DAutoCorrectConfig["preset"]>) => {
    const nextConfig = normalizeAutoCorrectConfig({ preset });
    setAutoCorrectConfig(nextConfig);

    const prep = getLatestStep4Geometry2D().geometry2d.prep || {};
    updateStep4Geometry2D({
      prep: {
        ...prep,
        autoCorrectConfig: nextConfig,
      },
    });
  };

  const handleWorkflowSectionChange = (section: Geometry2DWorkflowSection) => {
    if (section === activeSection) return;
    setActiveSection(section);
    if (section === "nodes" || section === "matching") {
      // Node/matching stages default to a clean preview: image + active ROI + nodes.
      setShowMaskOverlay(false);
      setShowROI(true);
      if (section === "nodes") {
        setSelectedTemplateOverlayLabels([]);
        persistMatchingPatch({ selectedOverlayLabels: [] });
      }
    }
    const ui = getLatestStep4Geometry2D().geometry2d.ui || {};
    updateStep4Geometry2D({
      ui: {
        ...ui,
        activeSection: section,
      },
    });
  };

  const handleAdvancedLayersChange = (checked: boolean) => {
    setShowAdvancedLayers(checked);
    const ui = getLatestStep4Geometry2D().geometry2d.ui || {};
    updateStep4Geometry2D({
      ui: {
        ...ui,
        showAdvancedLayers: checked,
      },
    });
  };

  const handleShowBaseImageChange = (checked: boolean) => {
    setShowBaseImage(checked);
    const ui = getLatestStep4Geometry2D().geometry2d.ui || {};
    updateStep4Geometry2D({
      ui: {
        ...ui,
        showBaseImage: checked,
      },
    });
  };

  const handleShowRoiCornerGuidesChange = (checked: boolean) => {
    setShowRoiCornerGuides(checked);
    const ui = getLatestStep4Geometry2D().geometry2d.ui || {};
    updateStep4Geometry2D({
      ui: {
        ...ui,
        showRoiCornerGuides: checked,
      },
    });
  };

  const handleIncludeRoiCornerPointsChange = (checked: boolean) => {
    setIncludeRoiCornerPoints(checked);
    const nextPoints = normaliseReferencePointsForDisplay(templatePointsRef.current, templateDetectedPoints, checked);
    setTemplatePoints(nextPoints);
    persistNodesPatch({ points: nextPoints });
    pushTemplatePointHistory(nextPoints);
    setSelectedTemplatePointId((current) =>
      current && nextPoints.some((point) => point.id === current) ? current : nextPoints[0]?.id
    );

    const ui = getLatestStep4Geometry2D().geometry2d.ui || {};
    updateStep4Geometry2D({
      ui: {
        ...ui,
        includeRoiCornerPoints: checked,
      },
    });
  };

  const handleReconstructLayersExpandedChange = (checked: boolean) => {
    setShowReconstructLayers(checked);
    const ui = getLatestStep4Geometry2D().geometry2d.ui || {};
    updateStep4Geometry2D({
      ui: {
        ...ui,
        showReconstructLayers: checked,
      },
    });
  };

  const handleShowOriginalOverlayChange = (checked: boolean) => {
    setShowOriginalOverlay(checked);
    const prep = getLatestStep4Geometry2D().geometry2d.prep || {};
    updateStep4Geometry2D({
      prep: {
        ...prep,
        showOriginalOverlay: checked,
      },
    });
  };

  const handleShowUpdatedOverlayChange = (checked: boolean) => {
    setShowUpdatedOverlay(checked);
    const prep = getLatestStep4Geometry2D().geometry2d.prep || {};
    updateStep4Geometry2D({
      prep: {
        ...prep,
        showUpdatedOverlay: checked,
      },
    });
  };

  const handleShowROIChange = (checked: boolean) => {
    setShowROI(checked);
    if (checked) {
      setShowOriginalOverlay(false);
      setShowUpdatedOverlay(false);
    }

    const prep = getLatestStep4Geometry2D().geometry2d.prep || {};
    updateStep4Geometry2D({
      prep: {
        ...prep,
        showOriginalOverlay: checked ? false : showOriginalOverlay,
        showUpdatedOverlay: checked ? false : showUpdatedOverlay,
      },
    });
  };

  const handleResetStep4 = useCallback(() => {
    templateStateRequestIdRef.current += 1;
    reconstructionStateRequestIdRef.current += 1;

    const step3Roi = currentProject?.steps?.[3]?.data?.roi as ROIState | undefined;
    const nextRoi = step3Roi && step3Roi.x !== undefined
      ? {
          x: step3Roi.x,
          y: step3Roi.y,
          width: step3Roi.width,
          height: step3Roi.height,
          rotation: step3Roi.rotation || 0,
        }
      : DEFAULT_ROI;

    setGeometryResult(null);
    setResult(null);
    setVaultRatio(undefined);
    setVaultRatioSuggestions([]);
    setBossCount(undefined);
    setAnalysedAt(undefined);
    setAutoCorrectRoi(false);
    setCorrectionApplied(undefined);
    setOriginalRoiPreview(undefined);
    setCorrectedRoiPreview(undefined);
    setShowOriginalOverlay(false);
    setShowUpdatedOverlay(false);
    setAutoCorrectConfig(DEFAULT_AUTO_CORRECT_CONFIG);

    setTemplatePoints([]);
    setTemplateDetectedPoints([]);
    setTemplateParams(DEFAULT_TEMPLATE_PARAMS);
    setTemplateOverlayVariants([]);
    setSelectedTemplateOverlayLabels([]);
    setTemplateVariantResults([]);
    setTemplateBestVariantLabel(undefined);
    setTemplateOutputDir(undefined);
    setTemplateMatchCsvPath(undefined);
    setTemplateMatchCsvColumns([]);
    setTemplateMatchCsvRows([]);
    setTemplateLastRunAt(undefined);
    setTemplatePointFilter("all");
    setSelectedTemplatePointId(undefined);
    setTemplateSavedPointsSignature(pointSignature([]));
    setTemplatePointHistoryState({ stack: [], index: -1 });

    setReconstructResult(null);
    setReconstructPreviewBosses([]);
    setReconstructLastRunAt(undefined);
    setReconstructStatePath(undefined);
    setReconstructResultPath(undefined);
    setReconstructParams({});
    setReconstructDefaults({});
    setReconstructLayers(DEFAULT_RECONSTRUCT_LAYERS);

    setRoi(nextRoi);
    setShowROI(true);
    setShowBaseImage(true);
    setShowRoiCornerGuides(true);
    setIncludeRoiCornerPoints(true);
    setRoiSaveResult(null);
    setShowIntrados(true);
    setActiveSection("roi");
    setShowAdvancedLayers(true);
    setShowReconstructLayers(false);
    setSelectedImageType("colour");
    setOverlayOpacity(0.6);
    setShowMaskOverlay(false);

    completeStep(4, {
      geometry2d: {
        roi: nextRoi,
        ui: {
          activeSection: "roi",
          showAdvancedLayers: true,
          showReconstructLayers: false,
          showBaseImage: true,
          showRoiCornerGuides: true,
          includeRoiCornerPoints: true,
        },
      },
    });

    toast({
      title: "Step 4 reset",
      description: "Step 4 results and status were cleared. You can start this step again from a clean state.",
    });
  }, [completeStep, currentProject?.steps, setGeometryResult]);

  const handleTemplatePointChange = (pointId: number, patch: Partial<Pick<Geometry2DTemplateBossPoint, "x" | "y">>) => {
    setSelectedTemplatePointId(pointId);
    const prev = templatePointsRef.current;
    const next = prev.map((point) => {
      if (point.id !== pointId) return point;
      const updated = {
        ...point,
        ...patch,
        source: point.source || "manual",
      };
      return decorateTemplatePoint(updated);
    });
    setTemplatePoints(next);
    persistNodesPatch({ points: next });
    pushTemplatePointHistory(next);
  };

  const handleTemplatePointMove = (pointId: number, x: number, y: number) => {
    setTemplatePoints((prev) =>
      prev.map((point) =>
        point.id === pointId ? decorateTemplatePoint({ ...point, x, y, source: point.source || "manual" }) : point
      )
    );
  };

  const handleTemplatePointMoveEnd = () => {
    const latest = templatePointsRef.current;
    persistNodesPatch({ points: latest });
    pushTemplatePointHistory(latest);
  };

  const handleAddTemplatePoint = () => {
    const resolution = selectedProjection?.settings?.resolution || 2048;
    const nextId =
      Math.max(
        0,
        ...templatePoints.map((point) => point.id),
        ...templateDetectedPoints.map((point) => point.id)
      ) + 1;
    const offsets: Array<[number, number]> = [
      [-0.22, -0.22],
      [0.22, -0.22],
      [0.22, 0.22],
      [-0.22, 0.22],
      [0.0, -0.28],
      [0.28, 0.0],
      [0.0, 0.28],
      [-0.28, 0.0],
    ];
    const [ox, oy] = offsets[(nextId - 1) % offsets.length];
    const nextX = Math.min(
      resolution,
      Math.max(0, (roi.x + ox * roi.width) * resolution)
    );
    const nextY = Math.min(
      resolution,
      Math.max(0, (roi.y + oy * roi.height) * resolution)
    );
    const point: Geometry2DTemplateBossPoint = {
      id: nextId,
      label: String(nextId),
      x: nextX,
      y: nextY,
      source: "manual",
      pointType: "boss",
      u: 0.5,
      v: 0.5,
      outOfBounds: false,
    };
    const next = [...templatePoints, decorateTemplatePoint(point)];
    setTemplatePointFilter("all");
    setSelectedTemplatePointId(nextId);
    setTemplatePoints(next);
    persistNodesPatch({ points: next });
    pushTemplatePointHistory(next);
  };

  const handleRemoveTemplatePoint = (pointId: number) => {
    const target = templatePoints.find((point) => point.id === pointId);
    if (!target || templatePoints.length <= 1) {
      return;
    }
    const next = templatePoints.filter((point) => point.id !== pointId);
    if (selectedTemplatePointId === pointId) {
      setSelectedTemplatePointId(next[0]?.id);
    }
    setTemplatePoints(next);
    persistNodesPatch({ points: next });
    pushTemplatePointHistory(next);
  };

  const handleTemplateParamChange = (patch: Partial<Geometry2DTemplateStateParams>) => {
    const nextParams = sanitizeTemplateParams({
      ...templateParams,
      ...patch,
    });
    setTemplateParams(nextParams);
    persistMatchingPatch({ params: nextParams });
  };

  const handleTemplateOverlayToggle = (variantLabel: string, enabled: boolean) => {
    const next = enabled
      ? Array.from(new Set([...selectedTemplateOverlayLabels, variantLabel]))
      : selectedTemplateOverlayLabels.filter((label) => label !== variantLabel);
    setSelectedTemplateOverlayLabels(next);
    persistMatchingPatch({ selectedOverlayLabels: next });
  };

  const handleTemplateHideAllOverlays = () => {
    setSelectedTemplateOverlayLabels([]);
    persistMatchingPatch({ selectedOverlayLabels: [] });
  };

  const handleTemplateShowPrimaryOverlays = () => {
    const next = buildPerBossTypologySummary(normaliseMatchCsvRows(templateMatchCsvRows))?.overlayLabels || [];
    if (next.length === 0) return;
    setSelectedTemplateOverlayLabels(next);
    persistMatchingPatch({ selectedOverlayLabels: next });
  };

  const handleReconstructOverlayLayerChange = useCallback(
    (key: Geometry2DReconstructOverlayKey, checked: boolean) => {
      const nextLayers = {
        ...reconstructLayers,
        [key]: checked,
      };
      setReconstructLayers(nextLayers);
      updateStep4Geometry2D({
        reconstruct: {
          ...(getLatestStep4Geometry2D().geometry2d.reconstruct || {}),
          result: reconstructResult || undefined,
          previewBosses: reconstructPreviewBosses,
          showOverlay: nextLayers.showReconstructedRibs,
          lastRunAt: reconstructLastRunAt,
          statePath: reconstructStatePath,
          resultPath: reconstructResultPath,
          params: reconstructParams as Record<string, unknown>,
          defaults: reconstructDefaults,
          layers: nextLayers,
        },
      });
    },
    [
      getLatestStep4Geometry2D,
      reconstructDefaults,
      reconstructLastRunAt,
      reconstructLayers,
      reconstructParams,
      reconstructPreviewBosses,
      reconstructResult,
      reconstructResultPath,
      reconstructStatePath,
      updateStep4Geometry2D,
    ]
  );

  const handleReconstructSegmentationLayerChange = useCallback(
    (groupId: string, checked: boolean) => {
      const nextLayers = {
        ...reconstructLayers,
        visibleSegmentationGroups: checked
          ? Array.from(new Set([...reconstructLayers.visibleSegmentationGroups, groupId]))
          : reconstructLayers.visibleSegmentationGroups.filter((value) => value !== groupId),
      };
      setReconstructLayers(nextLayers);
      updateStep4Geometry2D({
        reconstruct: {
          ...(getLatestStep4Geometry2D().geometry2d.reconstruct || {}),
          result: reconstructResult || undefined,
          previewBosses: reconstructPreviewBosses,
          showOverlay: nextLayers.showReconstructedRibs,
          lastRunAt: reconstructLastRunAt,
          statePath: reconstructStatePath,
          resultPath: reconstructResultPath,
          params: reconstructParams as Record<string, unknown>,
          defaults: reconstructDefaults,
          layers: nextLayers,
        },
      });
    },
    [
      getLatestStep4Geometry2D,
      reconstructDefaults,
      reconstructLastRunAt,
      reconstructLayers,
      reconstructParams,
      reconstructPreviewBosses,
      reconstructResult,
      reconstructResultPath,
      reconstructStatePath,
      updateStep4Geometry2D,
    ]
  );

  const handleSaveTemplatePoints = async () => {
    if (!currentProject?.id) return false;

    setIsSavingTemplatePoints(true);
    try {
      const response = await saveNodes({
        projectId: currentProject.id,
        points: templatePoints.map((point) => ({
          id: point.id,
          label: point.label,
          x: point.x,
          y: point.y,
          source: point.source,
          pointType: point.pointType,
        })),
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || "Failed to save template points.");
      }

      const resolution = selectedProjection?.settings?.resolution || 2048;
      const nextPoints = normaliseReferencePointsForDisplay(
        coercePointsToPixelCoordinates(response.data.points || [], resolution),
        templateDetectedPointsRef.current,
        includeRoiCornerPoints
      );
      setTemplatePoints(nextPoints);
      setTemplateSavedPointsSignature(pointSignature(nextPoints));
      resetTemplatePointHistory(nextPoints);
      persistNodesPatch({ points: nextPoints });
      toast({
        title: "Ready nodes updated",
        description: `${nextPoints.length} nodes saved and ready for cut-typology and bay plan reconstruction.`,
      });
      return true;
    } catch (error) {
      console.error("Error saving template points:", error);
      alert(error instanceof Error ? error.message : "Failed to save template points.");
      return false;
    } finally {
      setIsSavingTemplatePoints(false);
    }
  };

  const handleResetTemplatePoints = async () => {
    if (!currentProject?.id) return;
    if (templateDetectedPoints.length === 0) return;

    const resetPoints = applyCornerPointPreference(templateDetectedPoints, templateDetectedPoints, includeRoiCornerPoints).map((point) => ({
      ...point,
      source: "auto",
    }));

    setTemplatePoints(resetPoints);
    persistNodesPatch({ points: resetPoints });
    pushTemplatePointHistory(resetPoints);

    setIsSavingTemplatePoints(true);
    try {
      const response = await saveNodes({
        projectId: currentProject.id,
        points: resetPoints.map((point) => ({
          id: point.id,
          label: point.label,
          x: point.x,
          y: point.y,
          source: point.source,
          pointType: point.pointType,
        })),
      });
      if (!response.success || !response.data) {
        throw new Error(response.error || "Failed to reset template points.");
      }
      const resolution = selectedProjection?.settings?.resolution || 2048;
      const nextPoints = normaliseReferencePointsForDisplay(
        coercePointsToPixelCoordinates(response.data.points || [], resolution),
        templateDetectedPoints,
        includeRoiCornerPoints
      );
      setTemplatePoints(nextPoints);
      setTemplateSavedPointsSignature(pointSignature(nextPoints));
      resetTemplatePointHistory(nextPoints);
      persistNodesPatch({ points: nextPoints });
    } catch (error) {
      console.error("Error resetting template points:", error);
      alert(error instanceof Error ? error.message : "Failed to reset template points.");
    } finally {
      setIsSavingTemplatePoints(false);
    }
  };

  const loadTemplateState = useCallback(async (includeCornerPoints = includeRoiCornerPoints) => {
    if (!currentProject?.id) return;

    const requestId = templateStateRequestIdRef.current + 1;
    templateStateRequestIdRef.current = requestId;
    setIsLoadingTemplateState(true);
    try {
      const response = await getNodeState(currentProject.id);
      if (templateStateRequestIdRef.current !== requestId) return;
      if (!response.success || !response.data) {
        throw new Error(response.error || "Failed to load template matching state.");
      }

      const nextParams = sanitizeTemplateParams(response.data.params);
      const resolution = selectedProjection?.settings?.resolution || 2048;
      const nextDetectedPoints = cloneAndSortTemplatePoints(
        coercePointsToPixelCoordinates(response.data.detectedPoints || [], resolution)
      );
      const nextPoints = normaliseReferencePointsForDisplay(
        coercePointsToPixelCoordinates(response.data.points || [], resolution),
        nextDetectedPoints,
        includeCornerPoints
      );
      const nextVariants = response.data.overlayVariants || [];

      setTemplatePoints(nextPoints);
      setTemplateDetectedPoints(nextDetectedPoints);
      setSelectedTemplatePointId((prev) => {
        if (prev && nextPoints.some((point) => point.id === prev)) return prev;
        return nextPoints[0]?.id;
      });
      setTemplateSavedPointsSignature(pointSignature(nextPoints));
      resetTemplatePointHistory(nextPoints);
      setTemplateParams(nextParams);
      setTemplateOverlayVariants(nextVariants);

      const allowed = new Set(nextVariants.map((variant) => variant.variantLabel));
      const persisted = selectedTemplateOverlayLabelsRef.current.filter((label) => allowed.has(label));
      const nextLabels = persisted.length > 0 ? persisted : [];
      setSelectedTemplateOverlayLabels(nextLabels);
      persistNodesPatch({
        points: nextPoints,
        detectedPoints: nextDetectedPoints,
        lastStateLoadedAt: new Date().toISOString(),
      });
      persistMatchingPatch({
        params: nextParams,
        overlayVariants: nextVariants,
        selectedOverlayLabels: nextLabels,
      });
    } catch (error) {
      if (templateStateRequestIdRef.current !== requestId) return;
      console.error("Failed to load template state:", error);
    } finally {
      if (templateStateRequestIdRef.current === requestId) {
        setIsLoadingTemplateState(false);
      }
    }
  }, [
    currentProject?.id,
    includeRoiCornerPoints,
    persistMatchingPatch,
    persistNodesPatch,
    resetTemplatePointHistory,
    selectedProjection?.settings?.resolution,
  ]);

  const loadReconstructionState = useCallback(async () => {
    if (!currentProject?.id) return;

    const requestId = reconstructionStateRequestIdRef.current + 1;
    reconstructionStateRequestIdRef.current = requestId;
    setIsLoadingReconstructionState(true);
    try {
      const response = await getBayPlanState(currentProject.id);
      if (reconstructionStateRequestIdRef.current !== requestId) return;
      if (!response.success || !response.data) {
        throw new Error(response.error || "Failed to load reconstruction state.");
      }
      setReconstructStatePath(response.data.statePath);
      setReconstructResultPath(response.data.resultPath);
      setReconstructLastRunAt(response.data.lastRunSummary?.ranAt);
      setReconstructResult(response.data.latestResult || null);
      setReconstructParams((response.data.params || {}) as Geometry2DBayPlanRunParams);
      setReconstructDefaults(response.data.defaults || {});
      const nextPreviewBosses = response.data.previewBosses || [];
      setReconstructPreviewBosses(nextPreviewBosses);
      const existingLayers = getLatestStep4Geometry2D().geometry2d.reconstruct?.layers;
      const nextLayers = {
        ...DEFAULT_RECONSTRUCT_LAYERS,
        ...(existingLayers || {}),
      };
      if (!existingLayers && response.data.lastRunSummary?.ranAt) {
        nextLayers.showROI = false;
        nextLayers.showReconstructedRibs = true;
      }
      setReconstructLayers(nextLayers);
      updateStep4Geometry2D({
        reconstruct: {
          ...(getLatestStep4Geometry2D().geometry2d.reconstruct || {}),
          result: response.data.latestResult || getLatestStep4Geometry2D().geometry2d.reconstruct?.result,
          previewBosses: nextPreviewBosses,
          lastRunAt: response.data.lastRunSummary?.ranAt,
          statePath: response.data.statePath,
          resultPath: response.data.resultPath,
          params: response.data.params || {},
          defaults: response.data.defaults || {},
          layers: nextLayers,
        },
      });
    } catch (error) {
      if (reconstructionStateRequestIdRef.current !== requestId) return;
      console.error("Failed to load reconstruction state:", error);
    } finally {
      if (reconstructionStateRequestIdRef.current === requestId) {
        setIsLoadingReconstructionState(false);
      }
    }
  }, [currentProject?.id, getLatestStep4Geometry2D, updateStep4Geometry2D]);

  const handleRunReconstruction = useCallback(async () => {
    if (!currentProject?.id) return;
    setIsRunningReconstruction(true);
    try {
      const response = await runBayPlanReconstruction(currentProject.id, reconstructParams);
      if (!response.success || !response.data) {
        throw new Error(response.error || "Pattern reconstruction failed.");
      }
      setReconstructResult(response.data);
      const nextPreviewBosses = response.data.usedBosses || [];
      setReconstructPreviewBosses(nextPreviewBosses);
      setReconstructLastRunAt(response.data.ranAt);
      setReconstructResultPath(response.data.outputImagePath);
      setReconstructParams((response.data.params || {}) as Geometry2DBayPlanRunParams);
      const nextLayers = {
        ...DEFAULT_RECONSTRUCT_LAYERS,
      };
      setReconstructLayers(nextLayers);
      updateStep4Geometry2D({
        reconstruct: {
          result: response.data,
          previewBosses: nextPreviewBosses,
          showOverlay: nextLayers.showReconstructedRibs,
          lastRunAt: response.data.ranAt,
          statePath: reconstructStatePath,
          resultPath: response.data.outputImagePath,
          params: response.data.params || {},
          defaults: reconstructDefaults,
          layers: nextLayers,
        },
      });
    } catch (error) {
      console.error("Pattern reconstruction error:", error);
      alert(error instanceof Error ? error.message : "Pattern reconstruction failed.");
    } finally {
      setIsRunningReconstruction(false);
    }
  }, [currentProject?.id, reconstructDefaults, reconstructParams, reconstructStatePath, updateStep4Geometry2D]);

  const handleSaveManualReconstructionEdges = useCallback(async (edges: Geometry2DReconstructEdge[]) => {
    if (!currentProject?.id) return;
    setIsSavingReconstructionManualEdges(true);
    try {
      const response = await saveBayPlanManualEdges(currentProject.id, edges);
      if (!response.success || !response.data) {
        throw new Error(response.error || "Failed to save reconstructed ribs.");
      }

      setReconstructResult(response.data);
      const nextPreviewBosses = response.data.usedBosses || [];
      setReconstructPreviewBosses(nextPreviewBosses);
      setReconstructParams((response.data.params || {}) as Geometry2DBayPlanRunParams);

      updateStep4Geometry2D({
        reconstruct: {
          ...(getLatestStep4Geometry2D().geometry2d.reconstruct || {}),
          result: response.data,
          previewBosses: nextPreviewBosses,
          showOverlay: reconstructLayers.showReconstructedRibs,
          lastRunAt: reconstructLastRunAt,
          statePath: reconstructStatePath,
          resultPath: reconstructResultPath,
          params: response.data.params || {},
          defaults: reconstructDefaults,
          layers: reconstructLayers,
        },
      });

      toast({
        title: "Reconstructed ribs saved",
        description: `${response.data.edgeCount} ribs persisted to the current bay plan.`,
      });
    } catch (error) {
      console.error("Manual rib save error:", error);
      alert(error instanceof Error ? error.message : "Failed to save reconstructed ribs.");
    } finally {
      setIsSavingReconstructionManualEdges(false);
    }
  }, [
    currentProject?.id,
    getLatestStep4Geometry2D,
    reconstructDefaults,
    reconstructLastRunAt,
    reconstructLayers,
    reconstructResultPath,
    reconstructStatePath,
    updateStep4Geometry2D,
  ]);

  const handleRunTemplateMatching = async () => {
    if (!currentProject?.id) return;

    setIsRunningTemplateMatching(true);
    try {
      const response = await runCutTypologyMatching({
        projectId: currentProject.id,
        params: templateParams,
        points: templatePoints.map((point) => ({
          id: point.id,
          label: point.label,
          x: point.x,
          y: point.y,
          source: point.source,
          pointType: point.pointType,
        })),
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || "Template matching failed.");
      }
      const payload = response.data;
      const resolution = selectedProjection?.settings?.resolution || 2048;
      const nextPoints = normaliseReferencePointsForDisplay(
        coercePointsToPixelCoordinates(payload.points || [], resolution),
        templateDetectedPointsRef.current,
        includeRoiCornerPoints
      );
      const nextPointsWithMatches = withMatchedTemplateCoordinates(
        nextPoints,
        payload.perBoss || [],
        payload.roi
      );

      const variantsForOverlay: Geometry2DTemplateOverlayVariant[] = payload.variants.map((variant) => ({
        variantLabel: variant.variantLabel,
        templateType: variant.templateType,
        variant: variant.variant,
        n: variant.n,
        isCrossTemplate: variant.isCrossTemplate,
        xTemplate: variant.xTemplate,
        yTemplate: variant.yTemplate,
        overlay: variant.overlay,
      }));

      setTemplatePoints(nextPointsWithMatches);
      setSelectedTemplatePointId((prev) => {
        if (prev && nextPointsWithMatches.some((point) => point.id === prev)) return prev;
        return nextPointsWithMatches[0]?.id;
      });
      setTemplateSavedPointsSignature(pointSignature(nextPointsWithMatches));
      resetTemplatePointHistory(nextPointsWithMatches);
      setTemplateOverlayVariants(variantsForOverlay);
      const nextBestVariantLabel = payload.bestVariantLabel || payload.variants?.[0]?.variantLabel;
      setTemplateVariantResults(payload.variants || []);
      setTemplateBestVariantLabel(nextBestVariantLabel);
      setTemplateOutputDir(payload.outputDir);
      setTemplateMatchCsvPath(payload.matchCsvPath);
      setTemplateLastRunAt(payload.ranAt);

      const allowed = new Set(variantsForOverlay.map((variant) => variant.variantLabel));
      const nextLabels = collectPrimaryReadingOverlayLabelsFromPerBoss(payload.perBoss || []).filter((label) => allowed.has(label));
      setSelectedTemplateOverlayLabels(nextLabels);
      persistNodesPatch({
        points: nextPointsWithMatches,
      });
      persistMatchingPatch({
        params: payload.params,
        overlayVariants: variantsForOverlay,
        selectedOverlayLabels: nextLabels,
        variantResults: payload.variants || [],
        bestVariantLabel: nextBestVariantLabel,
        outputDir: payload.outputDir,
        matchCsvPath: payload.matchCsvPath,
        lastRunAt: payload.ranAt,
      });

      const csvResponse = await getCutTypologyCsv(currentProject.id);
      if (csvResponse.success && csvResponse.data) {
        setTemplateMatchCsvColumns(csvResponse.data.columns || []);
        setTemplateMatchCsvRows(csvResponse.data.rows || []);
        setTemplateMatchCsvPath(csvResponse.data.csvPath);
        persistMatchingPatch({ matchCsvPath: csvResponse.data.csvPath });
      } else {
        setTemplateMatchCsvColumns([]);
        setTemplateMatchCsvRows([]);
      }
    } catch (error) {
      console.error("Template matching error:", error);
      alert(error instanceof Error ? error.message : "Template matching failed.");
    } finally {
      setIsRunningTemplateMatching(false);
    }
  };

  const handleLoadTemplateMatchCsv = async () => {
    if (!currentProject?.id) return;

    setIsLoadingTemplateMatchCsv(true);
    try {
      const response = await getCutTypologyCsv(currentProject.id);
      if (!response.success || !response.data) {
        throw new Error(response.error || "Failed to load boss_template_match.csv.");
      }
      setTemplateMatchCsvColumns(response.data.columns || []);
      setTemplateMatchCsvRows(response.data.rows || []);
      setTemplateMatchCsvPath(response.data.csvPath);
      persistMatchingPatch({ matchCsvPath: response.data.csvPath });
    } catch (error) {
      console.error("Failed to load template match csv:", error);
      alert(error instanceof Error ? error.message : "Failed to load boss_template_match.csv.");
    } finally {
      setIsLoadingTemplateMatchCsv(false);
    }
  };

  const handleSelectTemplatePoint = (pointId: number) => {
    setSelectedTemplatePointId(pointId);
  };

  const handleSaveROI = async () => {
    if (!currentProject) return;

    setIsSavingROI(true);
    setRoiSaveResult(null);

    try {
      const resolution = selectedProjection?.settings?.resolution || 2048;
      const corners = getROICorners(roi);

      const roiData: ROIData = {
        x: roi.x * resolution,
        y: roi.y * resolution,
        width: roi.width * resolution,
        height: roi.height * resolution,
        rotation: roi.rotation,
        corners: corners.map(([cx, cy]) => [cx * resolution, cy * resolution]),
      };

      const saveResult = await saveROI(currentProject.id, roiData);

      if (saveResult.success && saveResult.data) {
        setRoiSaveResult({
          inside: saveResult.data.insideCount,
          outside: saveResult.data.outsideCount,
        });

        updateStep4Geometry2D({
          roi: {
            x: roi.x,
            y: roi.y,
            width: roi.width,
            height: roi.height,
            rotation: roi.rotation,
          },
          roiStats: {
            insideCount: saveResult.data.insideCount,
            outsideCount: saveResult.data.outsideCount,
          },
        });
      } else {
        alert(`Failed to save ROI: ${saveResult.error}`);
      }
    } catch (error) {
      console.error("Error saving ROI:", error);
    } finally {
      setIsSavingROI(false);
    }
  };

  useEffect(() => {
    const loadIntradosLines = async () => {
      if (!currentProject?.id) return;
      try {
        const response = await getIntradosLines(currentProject.id);
        if (response.success && response.data) {
          setIntradosLines(response.data.lines || []);
        }
      } catch (error) {
        console.error("Error loading intrados lines:", error);
      }
    };

    loadIntradosLines();
  }, [currentProject?.id]);

  useEffect(() => {
    const step4Data = currentProject?.steps?.[4]?.data as
      | {
          geometry2d?: Step4Geometry2DState;
          geometry2dPrep?: { vaultRatio?: number; vaultRatioSuggestions?: Array<{ label: string; err: number }> };
          geometryResult?: GeometryResult | null;
          roi?: ROIState;
        }
      | undefined;
    const geometry2dData = step4Data?.geometry2d;
    const legacyPrep = step4Data?.geometry2dPrep;
    const legacyAnalysis = step4Data?.geometryResult;
    const legacyRoi = step4Data?.roi;

    if (!geometry2dData && (legacyPrep || legacyAnalysis !== undefined || legacyRoi)) {
      updateStep4Geometry2D({
        prep: legacyPrep,
        analysis: legacyAnalysis,
        roi: legacyRoi,
      });
    }

    const prepData = geometry2dData?.prep;
    if (prepData) {
      setVaultRatio(prepData.vaultRatio);
      setVaultRatioSuggestions(prepData.vaultRatioSuggestions || []);
      setBossCount(prepData.bossCount);
      setAnalysedAt(prepData.analysedAt);
      setAutoCorrectRoi(prepData.autoCorrectRoi ?? false);
      setCorrectionApplied(prepData.correctionApplied);
      setOriginalRoiPreview(prepData.originalRoi);
      setCorrectedRoiPreview(prepData.correctedRoi);
      setShowOriginalOverlay(prepData.showOriginalOverlay ?? true);
      setShowUpdatedOverlay(prepData.showUpdatedOverlay ?? true);
      setAutoCorrectConfig(normalizeAutoCorrectConfig(prepData.autoCorrectConfig));
    }
    if (geometry2dData?.ui) {
      const rawSection = geometry2dData.ui.activeSection;
      const nextSection: Geometry2DWorkflowSection =
        rawSection === "report" ? "reconstruct" : rawSection || "roi";
      const nextAdvancedLayers = geometry2dData.ui.showAdvancedLayers ?? true;
      const nextReconstructLayers = geometry2dData.ui.showReconstructLayers ?? false;
      const nextShowBaseImage = geometry2dData.ui.showBaseImage ?? true;
      const nextShowRoiCornerGuides = geometry2dData.ui.showRoiCornerGuides ?? true;
      const nextIncludeRoiCornerPoints = geometry2dData.ui.includeRoiCornerPoints ?? true;
      setActiveSection((prev) => (prev === nextSection ? prev : nextSection));
      setShowAdvancedLayers((prev) => (prev === nextAdvancedLayers ? prev : nextAdvancedLayers));
      setShowReconstructLayers((prev) => (prev === nextReconstructLayers ? prev : nextReconstructLayers));
      setShowBaseImage((prev) => (prev === nextShowBaseImage ? prev : nextShowBaseImage));
      setShowRoiCornerGuides((prev) => (prev === nextShowRoiCornerGuides ? prev : nextShowRoiCornerGuides));
      setIncludeRoiCornerPoints((prev) => (prev === nextIncludeRoiCornerPoints ? prev : nextIncludeRoiCornerPoints));
    }
    if (geometry2dData?.analysis) {
      setResult(geometry2dData.analysis);
    }

    const nodeData = geometry2dData?.nodes || geometry2dData?.template;
    const matchingData = geometry2dData?.matching || geometry2dData?.template;
    if (nodeData || matchingData) {
      const resolution = selectedProjection?.settings?.resolution || 2048;
      const persistedIncludeRoiCornerPoints = geometry2dData?.ui?.includeRoiCornerPoints ?? true;
      const nextDetectedPoints = nodeData?.detectedPoints
        ? cloneAndSortTemplatePoints(coercePointsToPixelCoordinates(nodeData.detectedPoints, resolution))
        : templateDetectedPointsRef.current;
      if (nodeData?.points) {
        const nextPoints = normaliseReferencePointsForDisplay(
          coercePointsToPixelCoordinates(nodeData.points, resolution),
          nextDetectedPoints,
          persistedIncludeRoiCornerPoints
        );
        const nextSignature = pointSignature(nextPoints);
        const currentSignature = pointSignature(templatePointsRef.current);
        setTemplatePoints(nextPoints);
        setTemplateSavedPointsSignature((prev) => (currentSignature === nextSignature ? prev : nextSignature));
        if (currentSignature !== nextSignature) {
          resetTemplatePointHistory(nextPoints);
        }
      }
      if (nodeData?.detectedPoints) {
        setTemplateDetectedPoints((prev) =>
          pointSignature(prev) === pointSignature(nextDetectedPoints) ? prev : nextDetectedPoints
        );
      }
      if (matchingData?.params) {
        setTemplateParams(sanitizeTemplateParams(matchingData.params));
      }
      if (matchingData?.overlayVariants) {
        setTemplateOverlayVariants(matchingData.overlayVariants);
      }
      if (matchingData?.selectedOverlayLabels) {
        setSelectedTemplateOverlayLabels(matchingData.selectedOverlayLabels);
      }
      if (matchingData?.variantResults) {
        setTemplateVariantResults(matchingData.variantResults);
      }
      setTemplateBestVariantLabel(matchingData?.bestVariantLabel);
      setTemplateOutputDir(matchingData?.outputDir);
      setTemplateMatchCsvPath(matchingData?.matchCsvPath);
      setTemplateLastRunAt(matchingData?.lastRunAt);
    }

    const reconstructData = geometry2dData?.reconstruct;
    if (reconstructData) {
      setReconstructResult(reconstructData.result || null);
      setReconstructPreviewBosses(reconstructData.previewBosses || []);
      setReconstructLastRunAt(reconstructData.lastRunAt);
      setReconstructStatePath(reconstructData.statePath);
      setReconstructResultPath(reconstructData.resultPath);
      setReconstructParams((reconstructData.params || {}) as Geometry2DBayPlanRunParams);
      setReconstructDefaults(reconstructData.defaults || {});
      const savedLayers = (reconstructData.layers || {}) as Partial<Geometry2DReconstructLayers>;
      setReconstructLayers({
        ...DEFAULT_RECONSTRUCT_LAYERS,
        showReconstructedRibs: reconstructData.showOverlay ?? true,
        ...savedLayers,
        visibleSegmentationGroups: Array.isArray(savedLayers.visibleSegmentationGroups)
          ? savedLayers.visibleSegmentationGroups
          : [],
      });
    }

    const step4Roi = geometry2dData?.roi;
    if (step4Roi && step4Roi.x !== undefined) {
      const nextRoi = {
        x: step4Roi.x,
        y: step4Roi.y,
        width: step4Roi.width,
        height: step4Roi.height,
        rotation: step4Roi.rotation || 0,
      };
      setRoi((prev) => (isSameRoi(prev, nextRoi) ? prev : nextRoi));
      return;
    }

    const step3Roi = currentProject?.steps?.[3]?.data?.roi as ROIState | undefined;
    if (step3Roi && step3Roi.x !== undefined) {
      updateStep4Geometry2D({ roi: step3Roi });
      const nextRoi = {
        x: step3Roi.x,
        y: step3Roi.y,
        width: step3Roi.width,
        height: step3Roi.height,
        rotation: step3Roi.rotation || 0,
      };
      setRoi((prev) => (isSameRoi(prev, nextRoi) ? prev : nextRoi));
    }
  }, [
    currentProject?.steps,
    resetTemplatePointHistory,
    selectedProjection?.settings?.resolution,
    updateStep4Geometry2D,
  ]);

  useEffect(() => {
    if (!currentProject?.id) return;
    if (autoLoadProjectIdRef.current === currentProject.id) return;
    autoLoadProjectIdRef.current = currentProject.id;

    const step4Data = currentProject.steps?.[4]?.data as
      | {
          geometry2d?: Step4Geometry2DState;
        }
      | undefined;
    const geometry2dData = step4Data?.geometry2d;
    const hasPersistedTemplateState = !!(geometry2dData?.nodes || geometry2dData?.template || geometry2dData?.matching);
    const hasPersistedReconstructionState = !!geometry2dData?.reconstruct;
    const persistedIncludeRoiCornerPoints = geometry2dData?.ui?.includeRoiCornerPoints ?? true;

    if (hasPersistedTemplateState) {
      loadTemplateState(persistedIncludeRoiCornerPoints);
    }
    if (hasPersistedReconstructionState) {
      loadReconstructionState();
    }
  }, [currentProject, loadReconstructionState, loadTemplateState]);

  useEffect(() => {
    if (!currentProject?.id) return;
    if (activeSection !== "reconstruct") return;
    loadReconstructionState();
  }, [activeSection, currentProject?.id, loadReconstructionState]);

  useEffect(() => {
    const prev = prevActiveSectionRef.current;
    prevActiveSectionRef.current = activeSection;

    if (activeSection !== "nodes" && activeSection !== "matching") return;
    setShowMaskOverlay(false);
    setShowROI(true);

  }, [activeSection, persistMatchingPatch]);

  const handleAnalyse = async () => {
    if (!currentProject?.id) {
      alert("No active project selected.");
      return;
    }
    if (!selectedProjection?.id) {
      alert("No projection selected.");
      return;
    }

    setIsAnalysing(true);

    try {
      const prepResponse = await prepareRoiBayProportion({
        projectId: currentProject.id,
        projectionId: selectedProjection.id,
        autoCorrectRoi,
        autoCorrectConfig: normalizeAutoCorrectConfig(autoCorrectConfig),
      });

      if (!prepResponse.success || !prepResponse.data) {
        throw new Error(prepResponse.error || "Failed to prepare Geometry2D inputs.");
      }

      const resolution = selectedProjection?.settings?.resolution || 2048;
      const originalFromBackend = roiParamsToState(prepResponse.data.originalRoiParams, resolution);
      const correctedFromBackend = roiParamsToState(prepResponse.data.correctedRoiParams, resolution);
      const appliedFromBackend = roiParamsToState(prepResponse.data.appliedRoiParams, resolution);
      const nextRoi = appliedFromBackend || roi;

      setOriginalRoiPreview(originalFromBackend);
      setCorrectedRoiPreview(correctedFromBackend);
      setCorrectionApplied(prepResponse.data.correctionApplied);
      setShowOriginalOverlay(true);
      setShowUpdatedOverlay(!!correctedFromBackend);
      setRoi(nextRoi);

      updateStep4Geometry2D({
        roi: nextRoi,
        prep: {
          bossCount: prepResponse.data.bossCount,
          roiPath: prepResponse.data.roiPath,
          bossReportPath: prepResponse.data.bossReportPath,
          outputDir: prepResponse.data.outputDir,
          vaultRatio: prepResponse.data.vaultRatio,
          vaultRatioSuggestions: prepResponse.data.vaultRatioSuggestions || [],
          autoCorrectRoi,
          autoCorrectConfig: normalizeAutoCorrectConfig(autoCorrectConfig),
          correctionApplied: prepResponse.data.correctionApplied,
          autoCorrection: prepResponse.data.autoCorrection,
          originalRoi: originalFromBackend,
          correctedRoi: correctedFromBackend,
          appliedRoi: appliedFromBackend,
          showOriginalOverlay: true,
          showUpdatedOverlay: !!correctedFromBackend,
          analysedAt: new Date().toISOString(),
        },
      });

      setVaultRatio(prepResponse.data.vaultRatio);
      setVaultRatioSuggestions(prepResponse.data.vaultRatioSuggestions || []);
      setBossCount(prepResponse.data.bossCount);
      setAnalysedAt(new Date().toISOString());
      setShowROI(false);

      setGeometryResult({
        classification: null,
        bossStones: [],
        px: 0,
        py: 0,
        boundingBox: {
          x: nextRoi.x,
          y: nextRoi.y,
          width: nextRoi.width,
          height: nextRoi.height,
        },
      });

      await loadTemplateState();

      alert(
        `Geometry2D inputs prepared. Detected ${prepResponse.data.bossCount} boss centres. ROI correction ${
          prepResponse.data.correctionApplied ? "applied" : autoCorrectRoi ? "skipped" : "disabled"
        }.`
      );
    } catch (error) {
      console.error("Failed to prepare Geometry2D inputs:", error);
      alert(error instanceof Error ? error.message : "Failed to prepare Geometry2D inputs.");
    } finally {
      setIsAnalysing(false);
    }
  };

  const hasSavedRoi = useMemo(() => {
    const step4Data = currentProject?.steps?.[4]?.data as { geometry2d?: Step4Geometry2DState } | undefined;
    const savedRoiStats = step4Data?.geometry2d?.roiStats;
    return !!roiSaveResult || !!savedRoiStats;
  }, [currentProject?.steps, roiSaveResult]);

  const handleExportCSV = () => {
    if (!result) return;

    const csv = [
      "Property,Value",
      `Classification,${result.classification}`,
      `Boss Stone Count,${result.bossStones.length}`,
      `Px,${result.px}`,
      `Py,${result.py}`,
      "",
      "Boss Stones",
      "Label,X,Y",
      ...result.bossStones.map(b => `${b.label},${b.x},${b.y}`),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "geometry-analysis.csv";
    a.click();
  };

  const persistAnalysisForContinue = () => {
    updateStep4Geometry2D({
      analysis: result,
      nodes: {
        points: templatePoints,
        detectedPoints: templateDetectedPoints,
      },
      matching: {
        params: templateParams,
        overlayVariants: templateOverlayVariants,
        selectedOverlayLabels: selectedTemplateOverlayLabels,
        variantResults: templateVariantResults,
        bestVariantLabel: templateBestVariantLabel,
        outputDir: templateOutputDir,
        matchCsvPath: templateMatchCsvPath,
        lastRunAt: templateLastRunAt,
      },
      reconstruct: {
        result: reconstructResult || undefined,
        previewBosses: reconstructPreviewBosses,
        showOverlay: reconstructLayers.showReconstructedRibs,
        lastRunAt: reconstructLastRunAt,
        statePath: reconstructStatePath,
        resultPath: reconstructResultPath,
        params: reconstructParams as Record<string, unknown>,
        defaults: reconstructDefaults,
        layers: reconstructLayers,
      },
    });
  };

  return {
    currentProject,
    selectedProjection,
    currentImage,
    segmentations,
    groupVisibility,
    visibleMasks,
    canvasRef,

    isAnalysing,
    result,
    vaultRatio,
    vaultRatioSuggestions,
    bossCount,
    analysedAt,
    autoCorrectRoi,
    autoCorrectConfig,
    correctionApplied,
    originalRoiPreview,
    correctedRoiPreview,
    showOriginalOverlay,
    showUpdatedOverlay,

    roi,
    setRoi,
    showROI,
    setShowROI,
    handleShowROIChange,
    showBaseImage,
    showRoiCornerGuides,
    includeRoiCornerPoints,
    setShowBaseImage,
    isSavingROI,
    roiSaveResult,
    hasSavedRoi,

    templatePoints,
    templateDetectedPoints,
    filteredTemplatePoints,
    templatePointFilter,
    selectedTemplatePointId,
    hasTemplatePointChanges,
    canUndoTemplatePoints,
    canRedoTemplatePoints,
    templateParams,
    templateOverlayVariants,
    selectedTemplateOverlayLabels,
    selectedTemplateOverlays,
    matchingEvidenceLoaded,
    matchingUnmatchedNodeIds,
    templateVariantResults,
    templateBestVariantLabel,
    templateOutputDir,
    templateMatchCsvPath,
    templateMatchCsvColumns,
    templateMatchCsvRows,
    templateLastRunAt,
    isLoadingTemplateState,
    isSavingTemplatePoints,
    isRunningTemplateMatching,
    isLoadingTemplateMatchCsv,
    reconstructResult,
    reconstructPreviewBosses,
    reconstructLastRunAt,
    reconstructStatePath,
    reconstructResultPath,
    reconstructParams,
    reconstructDefaults,
    reconstructLayers,
    reconstructionSegmentationLayers,
    reconstructionVisibleMasks,
    handleReconstructParamChange,
    isLoadingReconstructionState,
    isRunningReconstruction,
    isSavingReconstructionManualEdges,

    intradosLines,
    showIntrados,
    setShowIntrados,
    activeSection,
    showAdvancedLayers,
    showReconstructLayers,

    selectedImageType,
    setSelectedImageType,
    overlayOpacity,
    setOverlayOpacity,
    showMaskOverlay,
    setShowMaskOverlay,

    handleMouseDown,
    handleMouseMove,
    handleMouseUp,

    handleAutoCorrectToggle,
    handleAutoCorrectPresetChange,
    handleWorkflowSectionChange,
    handleAdvancedLayersChange,
    handleShowBaseImageChange,
    handleShowRoiCornerGuidesChange,
    handleIncludeRoiCornerPointsChange,
    handleReconstructLayersExpandedChange,
    handleShowOriginalOverlayChange,
    handleShowUpdatedOverlayChange,
    handleResetStep4,
    handleSaveROI,
    handleAnalyse,
    handleExportCSV,

    handleTemplatePointChange,
    handleTemplatePointMove,
    handleTemplatePointMoveEnd,
    handleSelectTemplatePoint,
    handleUndoTemplatePoints,
    handleRedoTemplatePoints,
    handleAddTemplatePoint,
    handleRemoveTemplatePoint,
    setTemplatePointFilter,
    handleTemplateParamChange,
    handleTemplateOverlayToggle,
    handleTemplateHideAllOverlays,
    handleTemplateShowPrimaryOverlays,
    handleSaveTemplatePoints,
    handleResetTemplatePoints,
    handleRunTemplateMatching,
    handleLoadTemplateMatchCsv,
    loadTemplateState,
    handleRunReconstruction,
    handleSaveManualReconstructionEdges,
    loadReconstructionState,
    handleReconstructOverlayLayerChange,
    handleReconstructSegmentationLayerChange,

    toggleGroupVisibility,
    toggleAllVisibility,
    persistAnalysisForContinue,

    hasProjection: !!selectedProjection,
    hasSegmentations: segmentations.length > 0,
  };
}
