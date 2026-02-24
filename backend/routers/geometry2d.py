"""Geometry 2D router for Step 4 preparation endpoints."""

from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from services.geometry2d import Geometry2DPipelineService

router = APIRouter()


class XYPoint(BaseModel):
    x: float
    y: float


class PrepareGeometry2DRequest(BaseModel):
    projectId: str
    projectionId: str
    manualBosses: Optional[List[XYPoint]] = None
    minBossArea: int = 10
    autoCorrectRoi: bool = True


class PrepareGeometry2DResult(BaseModel):
    projectDir: str
    outputDir: str
    roiPath: str
    bossReportPath: str
    bossCount: int
    vaultRatio: Optional[float] = None
    vaultRatioSuggestions: List[dict] = []
    correctionApplied: bool = False
    correctionRequested: bool = True
    originalRoiParams: Optional[dict] = None
    correctedRoiParams: Optional[dict] = None
    appliedRoiParams: Optional[dict] = None


class PrepareGeometry2DResponse(BaseModel):
    success: bool
    data: Optional[PrepareGeometry2DResult] = None
    error: Optional[str] = None


@router.post("/prepare-inputs", response_model=PrepareGeometry2DResponse)
async def prepare_geometry2d_inputs(request: PrepareGeometry2DRequest):
    """Prepare ROI and boss report files for Geometry2D pipeline steps."""
    try:
        service = Geometry2DPipelineService()
        payload = await service.prepare_inputs(
            project_id=request.projectId,
            projection_id=request.projectionId,
            manual_bosses=[p.dict() for p in request.manualBosses] if request.manualBosses else None,
            min_boss_area=request.minBossArea,
            auto_correct_roi=request.autoCorrectRoi,
        )
        boss_report = payload.get("bossReport", {})
        boss_count = int(boss_report.get("boss_count", 0)) if isinstance(boss_report, dict) else 0
        roi_payload = payload.get("roi", {})
        vault_ratio = None
        vault_ratio_suggestions: List[dict] = []
        if isinstance(roi_payload, dict):
            raw_ratio = roi_payload.get("vault_ratio")
            if isinstance(raw_ratio, (int, float)):
                vault_ratio = float(raw_ratio)
            raw_suggestions = roi_payload.get("vault_ratio_suggestions")
            if isinstance(raw_suggestions, list):
                for item in raw_suggestions:
                    if isinstance(item, dict):
                        label = item.get("label")
                        err = item.get("err")
                        if isinstance(label, str) and isinstance(err, (int, float)):
                            vault_ratio_suggestions.append({"label": label, "err": float(err)})
        correction_applied = bool(roi_payload.get("correction_applied")) if isinstance(roi_payload, dict) else False
        correction_requested = bool(roi_payload.get("correction_requested")) if isinstance(roi_payload, dict) else bool(request.autoCorrectRoi)
        original_roi_params = roi_payload.get("original_params") if isinstance(roi_payload, dict) else None
        corrected_roi_params = roi_payload.get("corrected_params") if isinstance(roi_payload, dict) else None
        applied_roi_params = roi_payload.get("params") if isinstance(roi_payload, dict) else None

        return PrepareGeometry2DResponse(
            success=True,
            data=PrepareGeometry2DResult(
                projectDir=str(payload["projectDir"]),
                outputDir=str(payload["outputDir"]),
                roiPath=str(payload["roiPath"]),
                bossReportPath=str(payload["bossReportPath"]),
                bossCount=boss_count,
                vaultRatio=vault_ratio,
                vaultRatioSuggestions=vault_ratio_suggestions,
                correctionApplied=correction_applied,
                correctionRequested=correction_requested,
                originalRoiParams=original_roi_params if isinstance(original_roi_params, dict) else None,
                correctedRoiParams=corrected_roi_params if isinstance(corrected_roi_params, dict) else None,
                appliedRoiParams=applied_roi_params if isinstance(applied_roi_params, dict) else None,
            ),
        )
    except Exception as e:
        return PrepareGeometry2DResponse(success=False, error=str(e))
