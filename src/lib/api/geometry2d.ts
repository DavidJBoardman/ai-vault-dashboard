import { apiRequest, type ApiResponse } from "@/lib/api/base";

export interface Geometry2DRoiBayProportionParams {
  projectId: string;
  projectionId: string;
  manualBosses?: Array<{ x: number; y: number }>;
  minBossArea?: number;
  autoCorrectRoi?: boolean;
  autoCorrectConfig?: Geometry2DAutoCorrectConfig;
}

export interface Geometry2DAutoCorrectConfig {
  preset?: "fast" | "balanced" | "precise";
  tolerance?: number;
  xy_step?: number;
  xy_range?: number;
  n_range?: [number, number];
  include_scale?: boolean;
  scale_step?: number;
  scale_range?: number;
  include_rotation?: boolean;
  rotation_step?: number;
  rotation_range?: number;
  regularisation_weight?: number;
  improvement_margin?: number;
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
  points: Array<{ id: number; x: number; y: number; source?: string }>;
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
  points?: Array<{ id: number; x: number; y: number; source?: string }>;
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
}

export interface Geometry2DBayPlanRunResult {
  projectDir: string;
  outputDir: string;
  outputImagePath?: string;
  ranAt: string;
  nodeCount: number;
  edgeCount: number;
  constraintEdgeCount: number;
  idealBossUsedCount: number;
  bossCount: number;
  enabledConstraintFamilies: string[];
  familySupportScores: Record<string, number>;
  fallbackApplied: boolean;
  fallbackReason: string;
  params: Record<string, unknown>;
  nodes: Geometry2DBayPlanNode[];
  edges: Geometry2DBayPlanEdge[];
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
  projectId: string
): Promise<ApiResponse<Geometry2DBayPlanRunResult>> {
  return apiRequest<Geometry2DBayPlanRunResult>("/api/geometry2d/bay-plan/run", {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
}

export interface Geometry2DEvidenceReportStateResult {
  projectDir: string;
  outputDir: string;
  statePath: string;
  reportJsonPath?: string;
  reportHtmlPath?: string;
  lastGeneratedAt?: string;
  summary?: Record<string, unknown>;
}

export interface Geometry2DEvidenceReportGenerateResult extends Geometry2DEvidenceReportStateResult {
  reportHtml: string;
  ranAt?: string;
}

export async function getEvidenceReportState(
  projectId: string
): Promise<ApiResponse<Geometry2DEvidenceReportStateResult>> {
  return apiRequest<Geometry2DEvidenceReportStateResult>("/api/geometry2d/evidence-report/state", {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
}

export async function generateEvidenceReport(
  projectId: string
): Promise<ApiResponse<Geometry2DEvidenceReportGenerateResult>> {
  return apiRequest<Geometry2DEvidenceReportGenerateResult>("/api/geometry2d/evidence-report/generate", {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
}
