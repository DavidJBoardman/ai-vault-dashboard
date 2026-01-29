// API client for Python backend communication

const getBaseUrl = async (): Promise<string> => {
  if (typeof window !== "undefined" && window.electronAPI) {
    const port = await window.electronAPI.getPythonPort();
    return `http://127.0.0.1:${port}`;
  }
  return "http://127.0.0.1:8765";
};

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const baseUrl = await getBaseUrl();
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      return { success: false, error: error.detail || `HTTP ${response.status}` };
    }

    const data = await response.json();
    
    // Handle backend responses that already have success/data structure
    if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
      return {
        success: data.success,
        data: data.data as T,
        error: data.error,
      };
    }
    
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

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

export async function uploadE57(filePath: string): Promise<ApiResponse<E57Info>> {
  return apiRequest<E57Info>("/api/upload/e57", {
    method: "POST",
    body: JSON.stringify({ file_path: filePath }),
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
}

export interface MeasurementResult {
  arcRadius: number;
  ribLength: number;
  apexPoint: { x: number; y: number; z: number };
  springingPoints: Array<{ x: number; y: number; z: number }>;
  fitError: number;
}

export async function calculateMeasurements(
  params: MeasurementParams
): Promise<ApiResponse<MeasurementResult>> {
  return apiRequest<MeasurementResult>("/api/measurements/calculate", {
    method: "POST",
    body: JSON.stringify(params),
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
  projections: Array<{
    id: string;
    perspective: string;
    resolution: number;
    sigma: number;
    kernelSize: number;
    bottomUp: boolean;
    scale: number;
  }>;
  segmentations: SavedSegmentation[];
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

export async function exportIntrados3dm(
  projectId: string,
  layerName: string = "Intrados Lines"
): Promise<ApiResponse<Export3dmResponse>> {
  return apiRequest(`/api/project/${projectId}/export-3dm`, {
    method: "POST",
    body: JSON.stringify({ 
      projectId,
      layerName
    }),
  });
}

export async function import3dmTraces(
  projectId: string,
  filePath: string,
  layerFilter?: string
): Promise<ApiResponse<Import3dmResponse>> {
  return apiRequest(`/api/project/${projectId}/import-3dm`, {
    method: "POST",
    body: JSON.stringify({ 
      filePath,
      layerFilter
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

