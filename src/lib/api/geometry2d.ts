import { apiRequest, type ApiResponse } from "@/lib/api/base";

export interface Geometry2DPrepareParams {
  projectId: string;
  projectionId: string;
  manualBosses?: Array<{ x: number; y: number }>;
  minBossArea?: number;
  autoCorrectRoi?: boolean;
}

export interface Geometry2DRoiParams {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation_deg: number;
  scale: number;
}

export interface Geometry2DPrepareResult {
  projectDir: string;
  outputDir: string;
  roiPath: string;
  bossReportPath: string;
  bossCount: number;
  vaultRatio?: number;
  vaultRatioSuggestions?: Array<{ label: string; err: number }>;
  correctionApplied: boolean;
  correctionRequested: boolean;
  originalRoiParams?: Geometry2DRoiParams;
  correctedRoiParams?: Geometry2DRoiParams;
  appliedRoiParams?: Geometry2DRoiParams;
}

export async function prepareGeometry2DInputs(
  params: Geometry2DPrepareParams
): Promise<ApiResponse<Geometry2DPrepareResult>> {
  return apiRequest<Geometry2DPrepareResult>("/api/geometry2d/prepare-inputs", {
    method: "POST",
    body: JSON.stringify(params),
  });
}
