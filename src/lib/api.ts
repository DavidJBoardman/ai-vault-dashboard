// API client for Python backend communication
import { apiRequest, getBaseUrl, type ApiResponse } from "@/lib/api/base";

export * from "@/lib/api/geometry2d";

// Health check
export async function checkBackendHealth(): Promise<boolean> {
  const response = await apiRequest<{ status: string }>("/health");
  return response.success && response.data?.status === "ok";
}

// E57 Processing
export interface E57Info {
  pointCount: number;
  boundingBox: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  hasColor: boolean;
  hasIntensity: boolean;
}

export async function uploadE57(file: string | File): Promise<ApiResponse<E57Info>> {
  if (typeof file === "string") {
    return apiRequest<E57Info>("/api/upload/e57", {
      method: "POST",
      body: JSON.stringify({ file_path: file }),
    });
  }

  const formData = new FormData();
  formData.append("file", file);

  return apiRequest<E57Info>("/api/upload/e57", {
    method: "POST",
    body: formData,
  });
}

export interface PointData {
  x: number;
  y: number;
  z: number;
  r?: number;
  g?: number;
  b?: number;
  intensity?: number;
}

export async function getPointCloudChunk(
  startIndex: number,
  count: number
): Promise<ApiResponse<{ points: PointData[]; start: number; count: number; total: number }>> {
  return apiRequest(`/api/pointcloud/chunk?start=${startIndex}&count=${count}`);
}

export async function getPointCloudPreview(
  maxPoints: number = 50000
): Promise<ApiResponse<{ 
  points: PointData[]; 
  total: number; 
  bounding_box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null 
}>> {
  return apiRequest(`/api/pointcloud/preview?max_points=${maxPoints}`);
}

export async function getPointCloudStatus(): Promise<ApiResponse<{
  loaded: boolean;
  file: string | null;
  point_count: number;
  has_color: boolean;
  has_intensity: boolean;
  bounding_box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null;
}>> {
  return apiRequest("/api/pointcloud/status");
}

export async function loadDemoData(): Promise<ApiResponse<E57Info>> {
  return apiRequest<E57Info>("/api/upload/demo", { method: "POST" });
}

// Projection (Gaussian Splatting)
export interface ProjectionParams {
  perspective: "top" | "bottom" | "north" | "south" | "east" | "west";
  resolution: number;
  sigma: number;       // Gaussian spread (1.0 default)
  kernelSize: number;  // Kernel size (5 default)
  bottomUp: boolean;   // Looking up at vault
  scale: number;
}

export interface ProjectionImages {
  colour?: string;         // Base64 colour image
  depthGrayscale?: string; // Base64 depth grayscale
  depthPlasma?: string;    // Base64 depth with plasma colormap
}

export interface ProjectionResult {
  id: string;
  perspective: string;
  resolution: number;
  sigma: number;
  kernelSize: number;
  images: ProjectionImages;
  metadata: Record<string, any>;
}

export async function getProjectionImages(projectionId: string): Promise<ProjectionImages | null> {
  const baseUrl = await getBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/projection/${projectionId}/images`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.success && data.images) {
      return {
        colour: data.images.colour,
        depthGrayscale: data.images.depthGrayscale,
        depthPlasma: data.images.depthPlasma,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getProjectionImage(
  projectionId: string, 
  imageType: "colour" | "depth_grayscale" | "depth_plasma" = "colour"
): Promise<string | null> {
  const baseUrl = await getBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/projection/${projectionId}/image/${imageType}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.success ? data.image : null;
  } catch {
    return null;
  }
}

export async function getProjectionImageUrl(
  projectionId: string,
  imageType: "colour" | "depth_grayscale" | "depth_plasma" = "colour"
): Promise<string> {
  const baseUrl = await getBaseUrl();
  return `${baseUrl}/api/projection/${projectionId}/file/${imageType}`;
}

export async function createProjection(
  params: ProjectionParams
): Promise<ApiResponse<ProjectionResult>> {
  return apiRequest<ProjectionResult>("/api/projection/create", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function listProjections(): Promise<ApiResponse<{ projections: Array<{
  id: string;
  perspective: string;
  resolution: number;
  sigma: number;
  kernel_size: number;
  has_images: boolean;
}> }>> {
  return apiRequest("/api/projection/list");
}

export async function deleteProjection(projectionId: string): Promise<ApiResponse<{ success: boolean }>> {
  return apiRequest(`/api/projection/${projectionId}`, { method: "DELETE" });
}

export async function exportProjection(projectionId: string): Promise<ApiResponse<{
  id: string;
  perspective: string;
  resolution: number;
  sigma: number;
  kernelSize: number;
  bottomUp: boolean;
  metadata: Record<string, any>;
  images: ProjectionImages;
}>> {
  return apiRequest(`/api/projection/${projectionId}/export`);
}

// Segmentation (SAM 3)
export interface BoxPrompt {
  coords: [number, number, number, number]; // [x1, y1, x2, y2] xyxy format
  label: 0 | 1; // 1 = positive (include), 0 = negative (exclude)
}

export interface SegmentationParams {
  projectionId: string;
  mode: "auto" | "text" | "box" | "combined";
  textPrompts?: string[];
  boxes?: BoxPrompt[];
}

export interface SegmentationMask {
  id: string;
  label: string;
  color: string;
  maskBase64: string;
  bbox: [number, number, number, number]; // [x, y, w, h]
  area: number;
  predictedIou: number;
  stabilityScore: number;
  visible: boolean;
  source: "auto" | "manual";
}

export interface SegmentationResult {
  masks: SegmentationMask[];
  samAvailable: boolean;
}

export async function checkSamStatus(): Promise<ApiResponse<{
  available: boolean;
  loaded: boolean;
}>> {
  return apiRequest("/api/segmentation/status");
}

export async function loadSamModel(): Promise<ApiResponse<{
  success: boolean;
  loaded: boolean;
}>> {
  return apiRequest("/api/segmentation/load-model", { method: "POST" });
}

export async function runSegmentation(
  params: SegmentationParams
): Promise<ApiResponse<SegmentationResult>> {
  return apiRequest<SegmentationResult>("/api/segmentation/run", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function detectIntradosLines(
  projectionId: string
): Promise<ApiResponse<{ lines: Array<{ id: string; points: Array<{ x: number; y: number }> }> }>> {
  return apiRequest("/api/segmentation/intrados", {
    method: "POST",
    body: JSON.stringify({ projection_id: projectionId }),
  });
}

// 2D Geometry
export interface GeometryParams {
  projectionId: string;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface GeometryAnalysisResult {
  classification: "starcut" | "circlecut" | "starcirclecut";
  bossStones: Array<{ x: number; y: number; label: string }>;
  px: number;
  py: number;
  confidence: number;
}

export async function analyzeGeometry(
  params: GeometryParams
): Promise<ApiResponse<GeometryAnalysisResult>> {
  return apiRequest<GeometryAnalysisResult>("/api/geometry/analyze", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Reprojection
export interface ReprojectionParams {
  segmentationIds: string[];
  outputPath: string;
}

export async function reprojectTo3D(
  params: ReprojectionParams
): Promise<ApiResponse<{ outputPath: string }>> {
  return apiRequest("/api/reprojection/create", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// 3D Traces
export async function uploadTrace(
  filePath: string
): Promise<ApiResponse<{ id: string; pointCount: number }>> {
  return apiRequest("/api/traces/upload", {
    method: "POST",
    body: JSON.stringify({ file_path: filePath }),
  });
}

export async function alignTrace(
  traceId: string,
  transform: { scale: number; rotation: number[]; translation: number[] }
): Promise<ApiResponse<{ success: boolean }>> {
  return apiRequest("/api/traces/align", {
    method: "POST",
    body: JSON.stringify({ trace_id: traceId, transform }),
  });
}

// Measurements
export interface MeasurementParams {
  traceId: string;
  segmentStart: number;
  segmentEnd: number;
  tracePoints: Array<number[]>; // [[x, y, z], ...]
}

export interface MeasurementResult {
  arcRadius: number;
  ribLength: number;
  apexPoint: { x: number; y: number; z: number };
  springingPoints: Array<{ x: number; y: number; z: number }>;
  fitError: number;
  pointDistances: number[];
  segmentPoints: Array<{ x: number; y: number; z: number }>;
  arcCenter: { x: number; y: number; z: number };
  arcBasisU: { x: number; y: number; z: number };
  arcBasisV: { x: number; y: number; z: number };
  arcStartAngle: number;
  arcEndAngle: number;
}

export async function calculateMeasurements(
  params: MeasurementParams
): Promise<ApiResponse<MeasurementResult>> {
  return apiRequest<MeasurementResult>("/api/geometry/measurements/calculate", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Impost Line Calculation
export interface RibImpostData {
  springing_z: number;
  springing_point: { x: number; y: number; z: number };
  impost_distance: number;
  arc_center_z: number;
  arc_center: { x: number; y: number; z: number };
}

export interface ImpostLineResult {
  impost_height: number;
  num_ribs_used: number;
  ribs: Record<string, RibImpostData>;
}

export interface ImpostLineRequest {
  ribs: Array<{
    id: string;
    points: Array<[number, number, number]>;
  }>;
  impostHeight?: number;
}

export async function calculateImpostLine(
  params: ImpostLineRequest,
): Promise<ApiResponse<ImpostLineResult>> {
  return apiRequest<ImpostLineResult>("/api/geometry/measurements/impost-line", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Rib Group Detection
export interface RibGroupCombinedMeasurements {
  arc_radius: number;
  rib_length: number;
  apex_point: { x: number; y: number; z: number };
  arc_center: { x: number; y: number; z: number };
  arc_center_z: number;
  fit_error: number;
}

export interface RibGroup {
  groupId: string;
  groupName?: string;
  ribIds: string[];
  isGrouped: boolean;
  combinedMeasurements: RibGroupCombinedMeasurements;
}

export interface RibGroupPairDiagnostic {
  passLabel?: string;
  ribA: string;
  ribB: string;
  aEndpoint?: "start" | "end";
  bEndpoint?: "start" | "end";
  gapDistance?: number;
  effectiveGap?: number;
  radiusRelativeDiff?: number;
  radiusTolerance?: number;
  planeAlignment?: number;
  planeThreshold?: number;
  mergedFitError?: number;
  mergedErrorAllowed?: number;
  directionOpposition?: number;
  directionThreshold?: number;
  arcQuality?: number;
  score?: number;
  directionalPenalty?: number;
  decision?: "rejected" | "candidate" | "accepted";
  reason?: string | null;
}

export interface RibGroupPassDiagnostics {
  passLabel?: string;
  consideredPairs?: number;
  candidatePairs?: number;
  acceptedPairs?: number;
  rejectedPairs?: number;
  topRejections?: Array<{ reason: string; count: number }>;
  pairDiagnostics?: RibGroupPairDiagnostic[];
  acceptedPairDiagnostics?: RibGroupPairDiagnostic[];
  perRibRejectionCounts?: Record<string, Record<string, number>>;
}

export interface RibGroupingDiagnostics {
  mode?: "single-pass" | "two-pass";
  passes?: RibGroupPassDiagnostics[];
  lockedRibs?: string[];
  pass2Pool?: string[];
  pass2AddedGroups?: number;
  finalGroupCount?: number;
}

export interface DetectRibGroupsApiResponse extends ApiResponse<RibGroup[]> {
  diagnostics?: RibGroupingDiagnostics;
}

export interface DetectRibGroupsRequest {
  ribs: Array<{
    id: string;
    points: Array<[number, number, number]>;
  }>;
  maxGap?: number;
  angleThresholdDeg?: number;
  radiusTolerance?: number;
  bossGapFactor?: number;
  planeNormalThresholdDeg?: number;
  bosses?: Array<{ x: number; y: number; z: number }>;
  diagnostics?: boolean;
  diagnosticsRibId?: string;
}

export async function detectRibGroups(
  params: DetectRibGroupsRequest,
): Promise<DetectRibGroupsApiResponse> {
  return apiRequest<RibGroup[]>("/api/geometry/measurements/rib-groups", {
    method: "POST",
    body: JSON.stringify(params),
  }) as Promise<DetectRibGroupsApiResponse>;
}

export interface CustomRibGroupRequest {
  groupId: string;
  groupName?: string;
  ribIds: string[];
}

export interface CalculateCustomRibGroupsRequest {
  ribs: Array<{
    id: string;
    points: Array<[number, number, number]>;
  }>;
  groups: CustomRibGroupRequest[];
}

export async function calculateCustomRibGroups(
  params: CalculateCustomRibGroupsRequest,
): Promise<ApiResponse<RibGroup[]>> {
  return apiRequest<RibGroup[]>("/api/geometry/measurements/custom-rib-groups", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Apex & Span Calculation
export interface BossPositionInput {
  id: string;
  x: number;
  y: number;
  z: number;
  label: string;
}

export interface ApexSpanRequest {
  ribs: Array<{ id: string; points: Array<[number, number, number]> }>;
  bosses: BossPositionInput[];
  maxBossDistance?: number;
  symmetryAngleTolerance?: number;
  impostHeight?: number;
  pairings?: PairingApexInput[];
  semicircularGroups?: SemicircularGroupInput[];
}

export interface SemicircularGroupInput {
  groupId: string;
  groupName: string;
  ribIds: string[];
}

export interface PairingApexSideInput {
  sideId: string;
  sideLabel: string;
  ribIds: string[];
}

export interface PairingApexInput {
  pairingId: string;
  pairingName: string;
  sides: PairingApexSideInput[];
}

export interface RibPairIntersection {
  ribA: string;
  ribB: string;
  intersection: { x: number; y: number; z: number };
}

export interface BossApexResult {
  bossId: string;
  bossLabel: string;
  bossPosition: { x: number; y: number; z: number };
  apex: { x: number; y: number; z: number };
  ribPairs: RibPairIntersection[];
  assignedRibs: string[];
}

export interface RibSpanResult {
  ribId: string;
  bossId: string;
  span: number;
  springingPoint: { x: number; y: number; z: number };
  projectedApex: { x: number; y: number; z: number };
}

export interface ApexSpanResult {
  bosses: BossApexResult[];
  ribs: Record<string, RibSpanResult>;
  pairingApex: PairingApexResult[];
  semicircularApex: SemicircularApexResult[];
}

export interface SemicircularApexResult {
  groupId: string;
  groupName: string;
  apex?: { x: number; y: number; z: number };
  apexHeight?: number;
  span?: number;
  springingPoints: Array<{ x: number; y: number; z: number }>;
  status: "ok" | "no-intersection" | "insufficient-data";
}

export interface PairingApexResult {
  pairingId: string;
  pairingName: string;
  sideLabels: string[];
  apex?: { x: number; y: number; z: number };
  apexHeight?: number;
  status: "ok" | "no-intersection" | "insufficient-data";
  warning?: string;
}

export async function calculateApexSpan(
  params: ApexSpanRequest,
): Promise<ApiResponse<ApexSpanResult>> {
  return apiRequest<ApexSpanResult>("/api/geometry/measurements/apex-span", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface MeasurementCustomGroup {
  id: string;
  name: string;
  ribIds: string[];
}

export interface RibPairing {
  id: string;
  name: string;
  /** Two entries — each is either a rib ID or a group ID */
  sides: [string, string];
}

export interface MeasurementConfig {
  ribNameById: Record<string, string>;
  customGroups: MeasurementCustomGroup[];
  disabledAutoGroupIds: string[];
  groupNameById: Record<string, string>;
  bossStoneNameById: Record<string, string>;
  ribPairings: RibPairing[];
  semicircularIds: string[];
}

export async function getMeasurementConfig(
  projectId: string,
): Promise<ApiResponse<MeasurementConfig>> {
  return apiRequest<MeasurementConfig>(`/api/project/${projectId}/measurement-config`, {
    method: "GET",
  });
}

export async function saveMeasurementConfig(
  projectId: string,
  config: MeasurementConfig,
): Promise<ApiResponse<MeasurementConfig>> {
  return apiRequest<MeasurementConfig>(`/api/project/${projectId}/measurement-config`, {
    method: "POST",
    body: JSON.stringify(config),
  });
}

// Chord Method Analysis
export interface ChordAnalysisResult {
  predictedMethod: string;
  threeCircleResult: {
    r1: number;
    r2: number;
    r3: number;
    centers: Array<{ x: number; y: number; z: number }>;
  };
  calculations: Record<string, number>;
  confidence: number;
}

export async function analyzeChordMethod(
  hypothesisId: string
): Promise<ApiResponse<ChordAnalysisResult>> {
  return apiRequest<ChordAnalysisResult>("/api/analysis/chord-method", {
    method: "POST",
    body: JSON.stringify({ hypothesis_id: hypothesisId }),
  });
}

// WebSocket for progress updates
export function createProgressSocket(
  onProgress: (progress: { step: string; percent: number; message: string }) => void
): WebSocket | null {
  if (typeof window === "undefined") return null;
  
  const ws = new WebSocket("ws://127.0.0.1:8765/ws/progress");
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onProgress(data);
    } catch (e) {
      console.error("Failed to parse progress message:", e);
    }
  };
  
  return ws;
}

// Project Management
export interface ProjectSaveData {
  projectId: string;
  projectName: string;
  e57Path?: string;
  projections: Array<{
    id: string;
    perspective: string;
    resolution: number;
    sigma: number;
    kernelSize: number;
    bottomUp: boolean;
    scale: number;
  }>;
  segmentations: Array<{
    id: string;
    label: string;
    color: string;
    maskBase64: string;
    bbox?: number[];
    area?: number;
    visible: boolean;
    source: string;
  }>;
  selectedProjectionId?: string;
}

export interface SavedSegmentation {
  id: string;
  label: string;
  color: string;
  maskBase64?: string;
  maskFile?: string;
  bbox?: number[];
  area?: number;
  visible: boolean;
  source: string;
}

export interface ProjectData {
  id: string;
  name: string;
  e57Path?: string;
  selectedProjectionId?: string;
  currentStep?: number;
  steps?: Record<string, StepState>;
  roi?: { x: number; y: number; width: number; height: number; rotation?: number; corners?: number[][] };
  projections: Array<{
    id: string;
    perspective: string;
    resolution: number;
    sigma: number;
    kernelSize: number;
    bottomUp: boolean;
    scale: number;
    images?: {
      colour?: string;
      depthGrayscale?: string;
      depthPlasma?: string;
    };
    metadata?: Record<string, unknown>;
  }>;
  segmentations: SavedSegmentation[];
  segmentationGroups?: Array<{
    groupId: string;
    label: string;
    color?: string;
    count?: number;
    insideRoiCount?: number;
    outsideRoiCount?: number;
  }>;
  segmentationCount: number;
  updatedAt: string;
}

export async function saveProject(data: ProjectSaveData): Promise<ApiResponse<{ projectDir: string; savedSegmentations: number }>> {
  return apiRequest("/api/project/save", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function loadProject(projectId: string): Promise<ApiResponse<{ project: ProjectData }>> {
  return apiRequest(`/api/project/load/${projectId}`);
}

export async function listProjects(): Promise<ApiResponse<{ projects: Array<{ id: string; name: string; updatedAt: string; segmentationCount: number }> }>> {
  return apiRequest("/api/project/list");
}

export async function deleteProject(projectId: string): Promise<ApiResponse<{ projectId: string; name: string }>> {
  return apiRequest(`/api/project/delete/${projectId}`, {
    method: "DELETE",
  });
}

export interface StepState {
  completed: boolean;
  data?: Record<string, unknown>;
}

export async function saveProgress(
  projectId: string, 
  currentStep: number, 
  steps: Record<string, StepState>
): Promise<ApiResponse<{ currentStep: number; stepsCompleted: number }>> {
  return apiRequest("/api/project/save-progress", {
    method: "POST",
    body: JSON.stringify({ projectId, currentStep, steps }),
  });
}

export async function getProjectSegmentations(projectId: string): Promise<ApiResponse<{ segmentations: SavedSegmentation[] }>> {
  return apiRequest(`/api/project/segmentations/${projectId}`);
}

// Region of Interest (ROI)
export interface ROIData {
  x: number;      // Center X (in pixels)
  y: number;      // Center Y (in pixels)
  width: number;
  height: number;
  rotation: number;  // Rotation angle in degrees
  corners?: number[][];  // 4 corners [[x,y], ...]
  cornerLabels?: string[];  // Labels for the 4 corners, e.g. ["A","B","C","D"]
}

export async function saveROI(
  projectId: string,
  roi: ROIData
): Promise<ApiResponse<{ insideCount: number; outsideCount: number }>> {
  return apiRequest("/api/project/save-roi", {
    method: "POST",
    body: JSON.stringify({ projectId, roi }),
  });
}

// Reprojection Preview
export interface ReprojectionPoint {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  label?: string;
}

export interface ReprojectionPreviewResponse {
  points: ReprojectionPoint[];
  total: number;
  originalTotal: number;
  maskedCount: number;
  unmaskedCount: number;
  groupCounts: Record<string, number>;
  availableGroups: string[];
  selectedGroups: string[];
}

export async function getReprojectionPreview(
  projectId: string,
  groupIds?: string[],
  maxPoints: number = 500000,
  showUnmaskedPoints: boolean = true
): Promise<ApiResponse<ReprojectionPreviewResponse>> {
  return apiRequest("/api/project/reproject-preview", {
    method: "POST",
    body: JSON.stringify({ projectId, groupIds, maxPoints, showUnmaskedPoints }),
  });
}

// Intrados Line Tracing
export interface IntradosLine {
  id: string;
  label: string;
  color: string;
  points3d: number[][];  // [[x, y, z], ...]
  points2d: number[][];  // [[px, py], ...]
  pointCount: number;
  lineLength: number;
}

export interface IntradosTraceResponse {
  lines: IntradosLine[];
  totalLines: number;
  totalRibs: number;
}

export interface ExclusionBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  enabled: boolean;
}

export interface IntradosTraceOptions {
  ribMaskIds?: string[];
  numSlices?: number;
  depthPercentile?: number;
  outlierThreshold?: number;
  continuityThreshold?: number;
  maxStepMeters?: number;
  floorPlaneZ?: number;
  exclusionBox?: ExclusionBox;
}

export async function traceIntradosLines(
  projectId: string,
  options: IntradosTraceOptions = {}
): Promise<ApiResponse<IntradosTraceResponse>> {
  return apiRequest("/api/project/trace-intrados", {
    method: "POST",
    body: JSON.stringify({ 
      projectId, 
      ribMaskIds: options.ribMaskIds,
      numSlices: options.numSlices ?? 50,
      depthPercentile: options.depthPercentile ?? 25.0,
      outlierThreshold: options.outlierThreshold ?? 1.5,
      continuityThreshold: options.continuityThreshold ?? 0.15,
      maxStepMeters: options.maxStepMeters ?? 0.5,
      floorPlaneZ: options.floorPlaneZ,
      exclusionBox: options.exclusionBox,
    }),
  });
}

export async function getIntradosLines(
  projectId: string
): Promise<ApiResponse<IntradosTraceResponse>> {
  return apiRequest(`/api/project/${projectId}/intrados-lines`, {
    method: "GET",
  });
}

// =====================================================
// Boss Stone / Keystone Marker Functions
// =====================================================

export interface BossStoneMarker {
  id: string;
  label: string;
  groupId: string;
  color: string;
  x: number;
  y: number;
  z: number;
}

export async function getBossStoneMarkers(
  projectId: string
): Promise<ApiResponse<{ markers: BossStoneMarker[] }>> {
  return apiRequest(`/api/project/${projectId}/boss-stone-markers`, {
    method: "GET",
  });
}

// =====================================================
// 3DM Export/Import Functions
// =====================================================

export interface Export3dmResponse {
  filePath: string;
  fileName: string;
  curvesExported: number;
  message: string;
}

export interface ImportedCurve {
  id: string;
  name: string;
  layer: string;
  points: number[][];
  pointCount: number;
  source: string;
}

export interface Import3dmResponse {
  curves: ImportedCurve[];
  curveCount: number;
  layers: string[];
  message: string;
  source?: string;
  importedAt?: string;
}

export interface File3dmInfo {
  layers: string[];
  objectCounts: {
    curves: number;
    points: number;
    meshes: number;
    other: number;
    total: number;
  };
  settings: {
    units: string;
  };
}

export type IntradosExportFormat = "3dm" | "obj" | "dxf";

export interface IntradosVectorExportResponse {
  filePath: string;
  fileName: string;
  curvesExported: number;
  message: string;
  format?: IntradosExportFormat;
}

/** Export intrados polylines to 3DM, OBJ, or DXF (writes under project exports/). */
export async function exportIntradosVectors(
  projectId: string,
  format: IntradosExportFormat = "3dm",
  layerName: string = "Intrados Lines",
  outputPath?: string
): Promise<ApiResponse<IntradosVectorExportResponse>> {
  return apiRequest<IntradosVectorExportResponse>("/api/export/intrados", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      format,
      layerName,
      outputPath,
    }),
  });
}

export async function exportIntrados3dm(
  projectId: string,
  layerName: string = "Intrados Lines"
): Promise<ApiResponse<Export3dmResponse>> {
  return exportIntradosVectors(projectId, "3dm", layerName) as Promise<
    ApiResponse<Export3dmResponse>
  >;
}

export async function import3dmTraces(
  projectId: string,
  filePath: string
): Promise<ApiResponse<Import3dmResponse>> {
  return apiRequest(`/api/project/${projectId}/import-3dm`, {
    method: "POST",
    body: JSON.stringify({ 
      filePath
    }),
  });
}

export async function getImportedTraces(
  projectId: string
): Promise<ApiResponse<{ curves: ImportedCurve[]; curveCount: number; source?: string; importedAt?: string }>> {
  return apiRequest(`/api/project/${projectId}/imported-traces`, {
    method: "GET",
  });
}

export async function get3dmFileInfo(
  projectId: string,
  filePath: string
): Promise<ApiResponse<File3dmInfo>> {
  return apiRequest(`/api/project/${projectId}/3dm-info?file_path=${encodeURIComponent(filePath)}`, {
    method: "GET",
  });
}
