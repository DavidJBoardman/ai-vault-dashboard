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

// Projection
export interface ProjectionParams {
  perspective: string;
  customAngle?: { theta: number; phi: number };
  resolution: number;
  scale: number;
}

export interface ProjectionResult {
  id: string;
  imagePath: string;
  imageBase64?: string;
  width: number;
  height: number;
}

export async function getProjectionImage(projectionId: string): Promise<string | null> {
  const baseUrl = await getBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/projection/image/${projectionId}/base64`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.image || null;
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

// Segmentation
export interface SegmentationParams {
  projectionId: string;
  mode: "auto" | "point_prompt" | "box_prompt";
  points?: Array<{ x: number; y: number; label: number }>;
  box?: { x: number; y: number; width: number; height: number };
}

export interface SegmentationResult {
  masks: Array<{
    id: string;
    label: string;
    maskBase64: string;
    confidence: number;
  }>;
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

