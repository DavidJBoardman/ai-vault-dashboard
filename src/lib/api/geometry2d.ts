import { apiRequest, type ApiResponse } from "@/lib/api/base";

export interface Geometry2DRoiBayProportionParams {
  projectId: string;
  projectionId: string;
  manualBosses?: Array<{ x: number; y: number }>;
  minBossArea?: number;
  autoCorrectRoi?: boolean;
  autoCorrectConfig?: Geometry2DAutoCorrectConfig;
}

export type Geometry2DAutoCorrectPreset = "fast" | "balanced" | "precise";

export interface Geometry2DAutoCorrectConfig {
  preset?: Geometry2DAutoCorrectPreset;
}

export interface Geometry2DRoiParams {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation_deg: number;
  scale: number;
}

export interface Geometry2DRoiBayProportionResult {
  projectDir: string;
  outputDir: string;
  roiPath: string;
  bossReportPath: string;
  bossCount: number;
  vaultRatio?: number;
  vaultRatioSuggestions?: Array<{ label: string; err: number }>;
  correctionApplied: boolean;
  correctionRequested: boolean;
  autoCorrection?: Record<string, unknown>;
  originalRoiParams?: Geometry2DRoiParams;
  correctedRoiParams?: Geometry2DRoiParams;
  appliedRoiParams?: Geometry2DRoiParams;
}

export async function prepareRoiBayProportion(
  params: Geometry2DRoiBayProportionParams
): Promise<ApiResponse<Geometry2DRoiBayProportionResult>> {
  return apiRequest<Geometry2DRoiBayProportionResult>("/api/geometry2d/roi-bay-proportion/prepare", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface Geometry2DNodePoint {
  id: number;
  label: string;
  x: number;
  y: number;
  source: string;
  pointType: "boss" | "corner";
  u: number;
  v: number;
  outOfBounds: boolean;
  matchedTemplateX?: number | null;
  matchedTemplateY?: number | null;
  matchedVariantLabel?: string | null;
  matchedXTemplateLabel?: string | null;
  matchedYTemplateLabel?: string | null;
}

export interface Geometry2DCutTypologyOverlay {
  linesUv: number[][][];
  pointsUv: number[][];
}

export interface Geometry2DCutTypologyOverlayVariant {
  variantLabel: string;
  templateType: "starcut" | "circlecut" | "cross";
  variant: string;
  n?: number;
  isCrossTemplate: boolean;
  xTemplate?: string;
  yTemplate?: string;
  overlay: Geometry2DCutTypologyOverlay;
}

export interface Geometry2DCutTypologyParams {
  starcutMin: number;
  starcutMax: number;
  includeStarcut: boolean;
  includeInner: boolean;
  includeOuter: boolean;
  allowCrossTemplate: boolean;
  tolerance: number;
}

export interface Geometry2DNodesStateResult {
  projectDir: string;
  points: Geometry2DNodePoint[];
  detectedPoints: Geometry2DNodePoint[];
  roi: Geometry2DRoiParams;
  defaults: Geometry2DCutTypologyParams;
  params: Geometry2DCutTypologyParams;
  parameterSchema: Array<Record<string, string | number | boolean>>;
  overlayVariants: Geometry2DCutTypologyOverlayVariant[];
  lastResultSummary?: {
    variantCount: number;
    bestVariantLabel?: string;
    ranAt?: string;
  };
  statePath: string;
}

export interface Geometry2DCutTypologyStateResult extends Geometry2DNodesStateResult {}

export interface Geometry2DCutTypologyBossMatch {
  variantLabel: string;
  templateType?: string;
  isCrossTemplate: boolean;
  xTemplate?: string;
  yTemplate?: string;
  xRatio?: number;
  yRatio?: number;
  xError?: number;
  yError?: number;
  xRatioIndex?: number;
  yRatioIndex?: number;
}

export interface Geometry2DCutTypologyBossResult extends Geometry2DNodePoint {
  matchedAny: boolean;
  matchedCount: number;
  matches: Geometry2DCutTypologyBossMatch[];
}

export interface Geometry2DCutTypologyVariantResult extends Geometry2DCutTypologyOverlayVariant {
  matchedCount: number;
  coverage: number;
  matchedBossIds: number[];
}

export interface Geometry2DCutTypologyRunResult {
  projectDir: string;
  outputDir: string;
  matchCsvPath?: string;
  roi: Geometry2DRoiParams;
  params: Geometry2DCutTypologyParams;
  points: Geometry2DNodePoint[];
  variants: Geometry2DCutTypologyVariantResult[];
  perBoss: Geometry2DCutTypologyBossResult[];
  bestVariantLabel?: string;
  ranAt: string;
}

export interface Geometry2DCutTypologyCsvResult {
  projectDir: string;
  csvPath: string;
  columns: string[];
  rows: Array<Record<string, string>>;
}

export async function getNodeState(
  projectId: string
): Promise<ApiResponse<Geometry2DNodesStateResult>> {
  return apiRequest<Geometry2DNodesStateResult>("/api/geometry2d/nodes/state", {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
}

export async function saveNodes(params: {
  projectId: string;
  points: Array<{ id: number; label?: string; x: number; y: number; source?: string; pointType?: "boss" | "corner" }>;
}): Promise<ApiResponse<{
  projectDir: string;
  savedCount: number;
  points: Geometry2DNodePoint[];
  statePath: string;
}>> {
  return apiRequest("/api/geometry2d/nodes/save", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getCutTypologyState(
  projectId: string
): Promise<ApiResponse<Geometry2DCutTypologyStateResult>> {
  return apiRequest<Geometry2DCutTypologyStateResult>("/api/geometry2d/cut-typology/state", {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
}

export async function runCutTypologyMatching(params: {
  projectId: string;
  params?: Partial<Geometry2DCutTypologyParams>;
  points?: Array<{ id: number; label?: string; x: number; y: number; source?: string; pointType?: "boss" | "corner" }>;
}): Promise<ApiResponse<Geometry2DCutTypologyRunResult>> {
  return apiRequest<Geometry2DCutTypologyRunResult>("/api/geometry2d/cut-typology/run", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getCutTypologyCsv(
  projectId: string
): Promise<ApiResponse<Geometry2DCutTypologyCsvResult>> {
  return apiRequest<Geometry2DCutTypologyCsvResult>("/api/geometry2d/cut-typology/results/csv", {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
}

export interface Geometry2DBayPlanStateSummary {
  ranAt?: string;
  nodeCount?: number;
  edgeCount?: number;
  candidateEdgeCount?: number;
  enabledConstraintFamilies: string[];
  fallbackApplied: boolean;
}

export interface Geometry2DBayPlanBossPoint {
  id: string;
  x: number;
  y: number;
  source: string;
}

export interface Geometry2DBayPlanStateResult {
  projectDir: string;
  params: Record<string, unknown>;
  defaults: Record<string, unknown>;
  lastRunSummary?: Geometry2DBayPlanStateSummary;
  previewBosses: Geometry2DBayPlanBossPoint[];
  statePath: string;
  resultPath?: string;
  latestResult?: Geometry2DBayPlanRunResult;
}

export interface Geometry2DBayPlanRunParams {
  reconstructionMode?: "current" | "delaunay";
  angleToleranceDeg?: number;
  candidateMinScore?: number;
  candidateMaxDistanceUv?: number;
  corridorWidthPx?: number;
  mutualOnly?: boolean;
  minNodeDegree?: number;
  maxNodeDegree?: number;
  enforcePlanarity?: boolean;
  delaunayUseRoiBoundary?: boolean;
  delaunayUseCrossAxes?: boolean;
  delaunayUseHalfLines?: boolean;
}

export interface Geometry2DBayPlanNode {
  id: string;
  bossId?: string | null;
  source: string;
  u: number;
  v: number;
  x: number;
  y: number;
}

export interface Geometry2DBayPlanEdge {
  a: number;
  b: number;
  isConstraint: boolean;
  isManual?: boolean;
  constraintFamily?: string | null;
}

export interface Geometry2DBayPlanComparisonResult {
  mode: "delaunay";
  available: boolean;
  error?: string;
  nodeCount: number;
  edgeCount: number;
  constraintFamilies: string[];
  nodes: Geometry2DBayPlanNode[];
  edges: Geometry2DBayPlanEdge[];
}

export interface Geometry2DBayPlanSpoke {
  bossIndex: number;
  bossId: string;
  angleDeg: number;
  strength: number;
  supportCount: number;
  ribIds: string[];
  labels: string[];
}

export interface Geometry2DBayPlanCandidateEdge {
  a: number;
  b: number;
  score: number;
  distanceUv: number;
  angleAB: number;
  angleBA: number;
  angleErrorA: number;
  angleErrorB: number;
  spokeStrengthA: number;
  spokeStrengthB: number;
  spokeSupportCountA: number;
  spokeSupportCountB: number;
  thirdBossPenalty: number;
  overlapScore: number;
  mutual: boolean;
  isBoundaryForced: boolean;
  selected: boolean;
}

export interface Geometry2DBayPlanRunResult {
  projectDir: string;
  outputDir: string;
  outputImagePath?: string;
  debugImagePath?: string;
  ranAt: string;
  nodeCount: number;
  edgeCount: number;
  candidateEdgeCount: number;
  constraintEdgeCount: number;
  idealBossUsedCount: number;
  bossCount: number;
  cornerAnchorCount: number;
  acceptedRibCount: number;
  rejectedRibCount: number;
  enabledConstraintFamilies: string[];
  familySupportScores: Record<string, number>;
  fallbackApplied: boolean;
  fallbackReason: string;
  overallScore: number;
  overallScoreBreakdown: Record<string, number>;
  params: Record<string, unknown>;
  nodes: Geometry2DBayPlanNode[];
  edges: Geometry2DBayPlanEdge[];
  comparison?: Geometry2DBayPlanComparisonResult | null;
  bossSpokes: Geometry2DBayPlanSpoke[];
  candidateEdges: Geometry2DBayPlanCandidateEdge[];
  optimisationDiagnostics: Array<Record<string, unknown>>;
  usedBosses: Geometry2DBayPlanBossPoint[];
  idealBosses: Geometry2DBayPlanBossPoint[];
  extractedBosses: Geometry2DBayPlanBossPoint[];
}

export async function getBayPlanState(
  projectId: string
): Promise<ApiResponse<Geometry2DBayPlanStateResult>> {
  return apiRequest<Geometry2DBayPlanStateResult>("/api/geometry2d/bay-plan/state", {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
}

export async function runBayPlanReconstruction(
  projectId: string,
  params?: Geometry2DBayPlanRunParams
): Promise<ApiResponse<Geometry2DBayPlanRunResult>> {
  return apiRequest<Geometry2DBayPlanRunResult>("/api/geometry2d/bay-plan/run", {
    method: "POST",
    body: JSON.stringify({ projectId, params }),
  });
}

export async function saveBayPlanManualEdges(
  projectId: string,
  edges: Geometry2DBayPlanEdge[]
): Promise<ApiResponse<Geometry2DBayPlanRunResult>> {
  return apiRequest<Geometry2DBayPlanRunResult>("/api/geometry2d/bay-plan/save-manual", {
    method: "POST",
    body: JSON.stringify({ projectId, edges }),
  });
}
