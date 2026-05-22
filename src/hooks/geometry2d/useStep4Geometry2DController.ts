"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  saveROI,
  ROIData,
  getIntradosLines,
  IntradosLine,
  prepareRoiBayProportion,
  getNodeState,
  resetNodes,
  getCutTypologyCsv,
  getBayPlanState,
  resetBayPlanState,
  saveBayPlanManualEdges,
  saveNodes,
  runBayPlanReconstruction,
  runCutTypologyMatching,
  setCutTypologyReading,
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
  type Geometry2DCutTypologyReading,
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
import { buildBayPlanDxf, downloadBayPlanDxf } from "@/lib/geometry2d/bayPlanDxf";
import {
  buildGeometry2DProjectionSnapshot,
  resolveGeometry2DProjection,
} from "@/lib/geometry2d/projectionSelection";
import { filterSegmentationsByGroupIds, getSegmentationGroupId } from "@/lib/geometry2d/segmentationGrouping";
import {
  buildPerBossTypologySummary,
  buildReadingSummary,
  collectPrimaryReadingOverlayLabelsFromPerBoss,
  normaliseMatchCsvRows,
  recommendCutTypologyReading,
  type MatchCsvRow,
} from "@/components/geometry2d/stages/template/cutTypologyMatchingUtils";
import {
  applyCornerPointPreference,
  cloneAndSortTemplatePoints,
  cloneTemplatePoints,
  coercePointsToPixelCoordinates,
  getPointType,
  normaliseReferencePointsForDisplay,
  pickNextBossLetter,
  pointSignature,
} from "./step4ReferencePointUtils";
import {
  decoratePointsWithMatchCsvRows,
  formatTemplateLabel,
} from "./step4MatchDecorations";


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
  selectedReading?: Geometry2DCutTypologyReading;
  perBoss?: Geometry2DTemplateBossResult[];
}

interface Step4Geometry2DState {
  projectionId?: string;
  projectionName?: string;
  projectionResolution?: number;
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
  allowCrossTemplate: false,
  tolerance: 0.03,
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
    allowCrossTemplate: false,
    tolerance: Math.max(0.001, Math.min(0.1, Number(merged.tolerance))),
  };
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
    const axisMatch = row?.axisCutMatch;
    const xRatio = typeof axisMatch?.xRatio === "number" ? axisMatch.xRatio : simplest?.xRatio;
    const yRatio = typeof axisMatch?.yRatio === "number" ? axisMatch.yRatio : simplest?.yRatio;
    const xTemplateLabel = formatTemplateLabel(axisMatch?.xCut || simplest?.xTemplate || simplest?.variantLabel);
    const yTemplateLabel = formatTemplateLabel(axisMatch?.yCut || simplest?.yTemplate || simplest?.variantLabel);
    const templatePixel =
      typeof xRatio === "number" && typeof yRatio === "number"
        ? roiUvToPixel(xRatio, yRatio, roi)
        : null;
    return {
      ...point,
      matchedTemplateX: templatePixel ? Math.round(templatePixel.x) : null,
      matchedTemplateY: templatePixel ? Math.round(templatePixel.y) : null,
      matchedVariantLabel: simplest?.variantLabel || null,
      matchedXTemplateLabel: xTemplateLabel,
      matchedYTemplateLabel: yTemplateLabel,
      matchedXError: typeof axisMatch?.xError === "number" ? axisMatch.xError : simplest?.xError ?? null,
      matchedYError: typeof axisMatch?.yError === "number" ? axisMatch.yError : simplest?.yError ?? null,
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
        matchedXError: point.matchedXError ?? null,
        matchedYError: point.matchedYError ?? null,
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
  const [selectedReading, setSelectedReading] = useState<Geometry2DCutTypologyReading | undefined>(undefined);
  const [templatePerBoss, setTemplatePerBoss] = useState<Geometry2DTemplateBossResult[]>([]);
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
  const [reconstructionView, setReconstructionView] = useState<"measured" | "ideal">("measured");
  const [showIdealisedOverlay, setShowIdealisedOverlay] = useState<boolean>(false);
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
  const [isExportingBayPlanDxf, setIsExportingBayPlanDxf] = useState(false);

  const [roi, setRoi] = useState<ROIState>(() => {
    const project = useProjectStore.getState().currentProject;
    const step3Roi = project?.steps?.[3]?.data?.roi as ROIState | undefined;
    if (step3Roi && step3Roi.x !== undefined) {
      return { x: step3Roi.x, y: step3Roi.y, width: step3Roi.width, height: step3Roi.height, rotation: step3Roi.rotation || 0 };
    }
    return DEFAULT_ROI;
  });
  const [showROI, setShowROI] = useState(true);
  const [showBaseImage, setShowBaseImage] = useState(true);
  const [showRoiCornerGuides, setShowRoiCornerGuides] = useState(true);
  const [includeRoiCornerPoints, setIncludeRoiCornerPoints] = useState(true);
  const [isSavingROI, setIsSavingROI] = useState(false);
  const [roiSaveResult, setRoiSaveResult] = useState<{ inside: number; outside: number } | null>(null);

  const [intradosLines, setIntradosLines] = useState<IntradosLine[]>([]);
  const [showIntrados, setShowIntrados] = useState(false);
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
    return resolveGeometry2DProjection({
      project: currentProject,
      preferStep4Projection: true,
    });
  }, [currentProject]);

  const projectionSnapshot = useMemo(
    () => buildGeometry2DProjectionSnapshot(selectedProjection),
    [selectedProjection]
  );

  const currentImage = useMemo(() => {
    if (!selectedProjection?.images) return null;
    return selectedProjection.images.colour || null;
  }, [selectedProjection]);

  const segmentations = useMemo(() => currentProject?.segmentations || [], [currentProject?.segmentations]);

  const groupedSegmentations = useMemo(() => {
    // Mirror the step-3 base-label logic so classes here match the categories
    // step-3 uses (e.g. "corner A" / "corner B" → "corner", "rib #1" → "rib").
    const getClassLabel = (label: string): string =>
      label
        .replace(/\s+[A-Za-z][a-z]?$/, "")
        .replace(/\s*#?\d+$/, "")
        .trim() || label;
    const groups: Record<string, Segmentation[]> = {};
    segmentations.forEach(seg => {
      const baseLabel = getClassLabel(seg.label);
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
      groupId: segs[0] ? getSegmentationGroupId(segs[0]) : label.toLowerCase().replace(/\s+/g, "_"),
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
    const nextPoints = decoratePointsWithMatchCsvRows(templatePoints, normalisedTemplateMatchCsvRows);
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

  const toggleSegmentationVisibility = (segmentationId: string) => {
    const seg = segmentations.find(s => s.id === segmentationId);
    if (!seg) return;
    updateSegmentation(seg.id, { visible: !seg.visible });
  };

  const visibleMasks = segmentations.filter(s => s.visible);
  const reconstructionVisibleMasks = useMemo(() => {
    if (reconstructLayers.visibleSegmentationGroups.length === 0) return [];
    return filterSegmentationsByGroupIds(segmentations, reconstructLayers.visibleSegmentationGroups);
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

  const handleResetROI = useCallback(() => {
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

    setRoi(nextRoi);
    setShowROI(true);
    setRoiSaveResult(null);
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

    updateStep4Geometry2D({
      ...projectionSnapshot,
      roi: nextRoi,
      prep: undefined,
      analysis: null,
      roiStats: undefined,
    });

    toast({
      title: "ROI reset",
      description: step3Roi && step3Roi.x !== undefined
        ? "ROI restored from Step 3 segmentation."
        : "ROI restored to the default bay frame.",
    });
  }, [currentProject?.steps, projectionSnapshot, setGeometryResult, updateStep4Geometry2D]);

  const handleResetStep4 = useCallback(async () => {
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
    const resolution = selectedProjection?.settings?.resolution || 2048;
    let resetPoints: Geometry2DTemplateBossPoint[] = [];
    let resetDetectedPoints: Geometry2DTemplateBossPoint[] = [];
    let resetParams = DEFAULT_TEMPLATE_PARAMS;
    let resetOverlayVariants: Geometry2DTemplateOverlayVariant[] = [];

    if (currentProject?.id) {
      try {
        const response = await resetNodes(currentProject.id);
        if (!response.success || !response.data) {
          throw new Error(response.error || "Failed to reset reference points.");
        }

        const bayPlanResponse = await resetBayPlanState(currentProject.id);
        if (!bayPlanResponse.success) {
          throw new Error(bayPlanResponse.error || "Failed to clear saved bay-plan results.");
        }

        resetParams = sanitizeTemplateParams(response.data.params);
        resetOverlayVariants = response.data.overlayVariants || [];
        resetDetectedPoints = cloneAndSortTemplatePoints(
          coercePointsToPixelCoordinates(response.data.detectedPoints || [], resolution)
        );
        resetPoints = normaliseReferencePointsForDisplay(
          coercePointsToPixelCoordinates(response.data.points || [], resolution),
          resetDetectedPoints,
          true
        );
      } catch (error) {
        console.error("Failed to reset node state:", error);
        toast({ title: "Reset failed", description: error instanceof Error ? error.message : "Failed to reset Step 4 reference points.", variant: "destructive" });
        return;
      }
    }

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

    setTemplatePoints(resetPoints);
    setTemplateDetectedPoints(resetDetectedPoints);
    setTemplateParams(resetParams);
    setTemplateOverlayVariants(resetOverlayVariants);
    setSelectedTemplateOverlayLabels([]);
    setTemplateVariantResults([]);
    setTemplateBestVariantLabel(undefined);
    setTemplateOutputDir(undefined);
    setTemplateMatchCsvPath(undefined);
    setTemplateMatchCsvColumns([]);
    setTemplateMatchCsvRows([]);
    setTemplateLastRunAt(undefined);
    setTemplatePointFilter("all");
    setSelectedTemplatePointId(resetPoints[0]?.id);
    setTemplateSavedPointsSignature(pointSignature(resetPoints));
    resetTemplatePointHistory(resetPoints);

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
    setShowIntrados(false);
    setActiveSection("roi");
    setShowAdvancedLayers(true);
    setShowReconstructLayers(false);
    setOverlayOpacity(0.6);
    setShowMaskOverlay(false);

    completeStep(4, {
      geometry2d: {
        ...projectionSnapshot,
        roi: nextRoi,
        nodes: {
          points: resetPoints,
          detectedPoints: resetDetectedPoints,
          lastStateLoadedAt: new Date().toISOString(),
        },
        matching: {
          params: resetParams,
          overlayVariants: resetOverlayVariants,
          selectedOverlayLabels: [],
        },
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
      description: "Nodes restored to detected bosses and ROI corners.",
    });
  }, [
    completeStep,
    currentProject?.id,
    currentProject?.steps,
    projectionSnapshot,
    resetTemplatePointHistory,
    selectedProjection?.settings?.resolution,
    setGeometryResult,
  ]);

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
    const nextLetter = pickNextBossLetter(templatePoints);
    const point: Geometry2DTemplateBossPoint = {
      id: nextId,
      label: `boss stone ${nextLetter}`,
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

  const handleSelectReading = useCallback(
    async (reading: Geometry2DCutTypologyReading) => {
      setSelectedReading(reading);
      persistMatchingPatch({ selectedReading: reading });
      const summary = buildReadingSummary(templatePerBoss, reading);
      setSelectedTemplateOverlayLabels(summary.overlayLabels);
      persistMatchingPatch({ selectedOverlayLabels: summary.overlayLabels });

      if (!currentProject?.id) return;
      try {
        const result = await setCutTypologyReading(currentProject.id, reading);
        if (!result.success) {
          throw new Error(result.error || "Could not update reading.");
        }
        // Reload the CSV so the match table reflects the new reading.
        const csvResponse = await getCutTypologyCsv(currentProject.id);
        if (csvResponse.success && csvResponse.data) {
          setTemplateMatchCsvColumns(csvResponse.data.columns || []);
          setTemplateMatchCsvRows(csvResponse.data.rows || []);
          setTemplateMatchCsvPath(csvResponse.data.csvPath);
          persistMatchingPatch({ matchCsvPath: csvResponse.data.csvPath });
        }
      } catch (error) {
        console.error("set reading failed:", error);
        toast({
          title: "Reading update failed",
          description: error instanceof Error ? error.message : "Could not update reading.",
          variant: "destructive",
        });
      }
    },
    [templatePerBoss, persistMatchingPatch, currentProject?.id],
  );

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
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "Failed to save template points.", variant: "destructive" });
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
      toast({ title: "Reset failed", description: error instanceof Error ? error.message : "Failed to reset template points.", variant: "destructive" });
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
      toast({ title: "Reconstruction failed", description: error instanceof Error ? error.message : "Pattern reconstruction failed.", variant: "destructive" });
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
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "Failed to save reconstructed ribs.", variant: "destructive" });
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

  const handleExportBayPlanDxf = useCallback(async () => {
    if (!currentProject?.id || !reconstructResult) return;
    setIsExportingBayPlanDxf(true);
    try {
      const { text, ribCount, nodeCount } = buildBayPlanDxf({
        nodes: reconstructResult.nodes,
        nodesIdeal: reconstructResult.nodesIdeal,
        edges: reconstructResult.edges,
      });
      const saved = await downloadBayPlanDxf(text, `bay_plan_${new Date().toISOString().slice(0, 10)}.dxf`);
      if (!saved) return;
      toast({
        title: "Bay plan DXF downloaded",
        description: `${ribCount} ribs and ${nodeCount} nodes written to DXF.`,
      });
    } catch (error) {
      console.error("Bay plan DXF export error:", error);
      toast({
        title: "DXF export failed",
        description: error instanceof Error ? error.message : "Failed to export bay plan DXF.",
        variant: "destructive",
      });
    } finally {
      setIsExportingBayPlanDxf(false);
    }
  }, [currentProject?.id, reconstructResult]);

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

      const nextPerBoss = payload.perBoss || [];
      setTemplatePerBoss(nextPerBoss);
      // Reading: keep user's override if it still covers; otherwise reset to recommendation.
      const { recommended, options } = recommendCutTypologyReading(nextPerBoss);
      const stillValid = options.find((o) => o.reading === selectedReading)?.covers;
      const nextReading: Geometry2DCutTypologyReading = stillValid ? (selectedReading as Geometry2DCutTypologyReading) : recommended;
      setSelectedReading(nextReading);

      const allowed = new Set(variantsForOverlay.map((variant) => variant.variantLabel));
      const readingSummaryAfterRun = buildReadingSummary(nextPerBoss, nextReading);
      const nextLabels = readingSummaryAfterRun.overlayLabels.filter((label) => allowed.has(label));
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
        perBoss: nextPerBoss,
        selectedReading: nextReading,
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
      toast({ title: "Template matching failed", description: error instanceof Error ? error.message : "Cut-typology matching could not complete.", variant: "destructive" });
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
      toast({ title: "Failed to load match results", description: error instanceof Error ? error.message : "Could not load boss_template_match.csv.", variant: "destructive" });
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
          ...projectionSnapshot,
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
        toast({ title: "ROI save failed", description: saveResult.error || "Could not save ROI.", variant: "destructive" });
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
      const rawSection = geometry2dData.ui.activeSection as Geometry2DWorkflowSection | "report" | undefined;
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
      if (matchingData?.perBoss) {
        setTemplatePerBoss(matchingData.perBoss);
      }
      if (matchingData?.selectedReading) {
        setSelectedReading(matchingData.selectedReading);
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

    const step4Roi = geometry2dData?.roi || legacyRoi;
    const step3Roi = currentProject?.steps?.[3]?.data?.roi as ROIState | undefined;
    const sourceRoi = step4Roi && step4Roi.x !== undefined ? step4Roi : step3Roi;
    if (sourceRoi && sourceRoi.x !== undefined) {
      const nextRoi = {
        x: sourceRoi.x,
        y: sourceRoi.y,
        width: sourceRoi.width,
        height: sourceRoi.height,
        rotation: sourceRoi.rotation || 0,
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
    if (!currentProject?.id) return;
    if (activeSection !== "matching" && activeSection !== "nodes") return;
    loadTemplateState();
  }, [activeSection, currentProject?.id, loadTemplateState]);

  useEffect(() => {
    const prev = prevActiveSectionRef.current;
    prevActiveSectionRef.current = activeSection;

    if (activeSection !== "nodes" && activeSection !== "matching") return;
    setShowMaskOverlay(false);
    setShowROI(true);

  }, [activeSection, persistMatchingPatch]);

  const handleAnalyse = async () => {
    if (!currentProject?.id) {
      toast({ title: "No project open", description: "Open a project before running analysis.", variant: "destructive" });
      return;
    }
    if (!selectedProjection?.id) {
      toast({ title: "No projection selected", description: "Select a projection before running analysis.", variant: "destructive" });
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
        ...projectionSnapshot,
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

      toast({
        title: "Bay Proportion Analysis is ready",
        description: `${
          prepResponse.data.correctionApplied ? " ROI auto-corrected." : "ROI auto-correction disabled."
        }`,
      });
    } catch (error) {
      console.error("Failed to prepare Geometry2D inputs:", error);
      toast({ title: "Analysis failed", description: error instanceof Error ? error.message : "Failed to prepare Geometry2D inputs.", variant: "destructive" });
    } finally {
      setIsAnalysing(false);
    }
  };

  const hasSavedRoi = useMemo(() => {
    const step4Data = currentProject?.steps?.[4]?.data as { geometry2d?: Step4Geometry2DState } | undefined;
    const savedRoiStats = step4Data?.geometry2d?.roiStats;
    return !!roiSaveResult || !!savedRoiStats;
  }, [currentProject?.steps, roiSaveResult]);

  const step3Roi = useMemo(() => {
    const raw = currentProject?.steps?.[3]?.data?.roi as ROIState | undefined;
    return raw?.x !== undefined ? raw : null;
  }, [currentProject?.steps]);

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
      ...projectionSnapshot,
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
    step3Roi,

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
    reconstructionView,
    setReconstructionView,
    showIdealisedOverlay,
    setShowIdealisedOverlay,
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
    isExportingBayPlanDxf,

    intradosLines,
    showIntrados,
    setShowIntrados,
    activeSection,
    showAdvancedLayers,
    showReconstructLayers,

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
    handleResetROI,
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
    selectedReading,
    handleSelectReading,
    templatePerBoss,
    handleSaveTemplatePoints,
    handleResetTemplatePoints,
    handleRunTemplateMatching,
    handleLoadTemplateMatchCsv,
    loadTemplateState,
    handleRunReconstruction,
    handleSaveManualReconstructionEdges,
    handleExportBayPlanDxf,
    loadReconstructionState,
    handleReconstructOverlayLayerChange,
    handleReconstructSegmentationLayerChange,

    toggleGroupVisibility,
    toggleAllVisibility,
    toggleSegmentationVisibility,
    groupedSegmentations,
    persistAnalysisForContinue,

    hasProjection: !!selectedProjection,
    hasSegmentations: segmentations.length > 0,
  };
}
