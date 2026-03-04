"""Geometry 2D router for Step 4 staged workflow endpoints."""

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services.geometry2d import (
    BayPlanCandidateService,
    CutTypologyMatchingService,
    NodePreparationService,
    RoiBayProportionService,
)

router = APIRouter()


class XYPoint(BaseModel):
    x: float
    y: float


class AutoCorrectConfig(BaseModel):
    preset: Optional[Literal["fast", "balanced", "precise"]] = None


class RoiBayProportionPrepareRequest(BaseModel):
    projectId: str
    projectionId: str
    manualBosses: Optional[List[XYPoint]] = None
    minBossArea: int = 10
    autoCorrectRoi: bool = True
    autoCorrectConfig: Optional[AutoCorrectConfig] = None


class RoiBayProportionPrepareResult(BaseModel):
    projectDir: str
    outputDir: str
    roiPath: str
    bossReportPath: str
    bossCount: int
    vaultRatio: Optional[float] = None
    vaultRatioSuggestions: List[dict] = []
    correctionApplied: bool = False
    correctionRequested: bool = True
    autoCorrection: Optional[Dict[str, Any]] = None
    originalRoiParams: Optional[dict] = None
    correctedRoiParams: Optional[dict] = None
    appliedRoiParams: Optional[dict] = None


class RoiBayProportionPrepareResponse(BaseModel):
    success: bool
    data: Optional[RoiBayProportionPrepareResult] = None
    error: Optional[str] = None


@router.post("/roi-bay-proportion/prepare", response_model=RoiBayProportionPrepareResponse)
async def prepare_roi_bay_proportion(request: RoiBayProportionPrepareRequest):
    """Prepare ROI and bay proportion inputs for Step 4.1."""
    try:
        service = RoiBayProportionService()
        payload = await service.prepare(
            project_id=request.projectId,
            projection_id=request.projectionId,
            manual_bosses=[p.dict() for p in request.manualBosses] if request.manualBosses else None,
            min_boss_area=request.minBossArea,
            auto_correct_roi=request.autoCorrectRoi,
            auto_correct_config=request.autoCorrectConfig.dict(exclude_none=True) if request.autoCorrectConfig else None,
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
        auto_correction = roi_payload.get("auto_correction") if isinstance(roi_payload, dict) else None

        return RoiBayProportionPrepareResponse(
            success=True,
            data=RoiBayProportionPrepareResult(
                projectDir=str(payload["projectDir"]),
                outputDir=str(payload["outputDir"]),
                roiPath=str(payload["roiPath"]),
                bossReportPath=str(payload["bossReportPath"]),
                bossCount=boss_count,
                vaultRatio=vault_ratio,
                vaultRatioSuggestions=vault_ratio_suggestions,
                correctionApplied=correction_applied,
                correctionRequested=correction_requested,
                autoCorrection=auto_correction if isinstance(auto_correction, dict) else None,
                originalRoiParams=original_roi_params if isinstance(original_roi_params, dict) else None,
                correctedRoiParams=corrected_roi_params if isinstance(corrected_roi_params, dict) else None,
                appliedRoiParams=applied_roi_params if isinstance(applied_roi_params, dict) else None,
            ),
        )
    except Exception as e:
        return RoiBayProportionPrepareResponse(success=False, error=str(e))


class NodePoint(BaseModel):
    id: int
    label: str
    x: float
    y: float
    source: str
    pointType: str = "boss"
    u: float
    v: float
    outOfBounds: bool


class CutTypologyOverlay(BaseModel):
    linesUv: List[List[List[float]]] = Field(default_factory=list)
    pointsUv: List[List[float]] = Field(default_factory=list)


class CutTypologyOverlayVariant(BaseModel):
    variantLabel: str
    templateType: str
    variant: str
    n: Optional[int] = None
    isCrossTemplate: bool
    xTemplate: Optional[str] = None
    yTemplate: Optional[str] = None
    overlay: CutTypologyOverlay


class CutTypologyStateSummary(BaseModel):
    variantCount: int
    bestVariantLabel: Optional[str] = None
    ranAt: Optional[str] = None


class NodesStateRequest(BaseModel):
    projectId: str


class NodesStateResult(BaseModel):
    projectDir: str
    points: List[NodePoint]
    detectedPoints: List[NodePoint]
    roi: Dict[str, float]
    defaults: Dict[str, Any]
    params: Dict[str, Any]
    parameterSchema: List[Dict[str, Any]]
    overlayVariants: List[CutTypologyOverlayVariant]
    lastResultSummary: Optional[CutTypologyStateSummary] = None
    statePath: str


class NodesStateResponse(BaseModel):
    success: bool
    data: Optional[NodesStateResult] = None
    error: Optional[str] = None


class SaveNodePoint(BaseModel):
    id: int
    label: Optional[str] = None
    x: float
    y: float
    source: str = "manual"
    pointType: str = "boss"


class SaveNodesRequest(BaseModel):
    projectId: str
    points: List[SaveNodePoint]


class SaveNodesResult(BaseModel):
    projectDir: str
    savedCount: int
    points: List[NodePoint]
    statePath: str


class SaveNodesResponse(BaseModel):
    success: bool
    data: Optional[SaveNodesResult] = None
    error: Optional[str] = None


@router.post("/nodes/state", response_model=NodesStateResponse)
async def load_nodes_state(request: NodesStateRequest):
    """Load editable node points for Step 4.2."""
    try:
        service = NodePreparationService()
        payload = await service.get_state(request.projectId)
        return NodesStateResponse(success=True, data=NodesStateResult(**payload))
    except Exception as e:
        return NodesStateResponse(success=False, error=str(e))


@router.post("/nodes/save", response_model=SaveNodesResponse)
async def save_nodes_state(request: SaveNodesRequest):
    """Persist edited node points for Step 4.2."""
    try:
        service = NodePreparationService()
        payload = await service.save_nodes(
            request.projectId,
            points=[p.dict() for p in request.points],
        )
        return SaveNodesResponse(success=True, data=SaveNodesResult(**payload))
    except Exception as e:
        return SaveNodesResponse(success=False, error=str(e))


class CutTypologyStateRequest(BaseModel):
    projectId: str


class CutTypologyStateResult(BaseModel):
    projectDir: str
    points: List[NodePoint]
    detectedPoints: List[NodePoint]
    roi: Dict[str, float]
    defaults: Dict[str, Any]
    params: Dict[str, Any]
    parameterSchema: List[Dict[str, Any]]
    overlayVariants: List[CutTypologyOverlayVariant]
    lastResultSummary: Optional[CutTypologyStateSummary] = None
    statePath: str


class CutTypologyStateResponse(BaseModel):
    success: bool
    data: Optional[CutTypologyStateResult] = None
    error: Optional[str] = None


class CutTypologyRunRequest(BaseModel):
    projectId: str
    params: Optional[Dict[str, Any]] = None
    points: Optional[List[SaveNodePoint]] = None


class CutTypologyBossMatch(BaseModel):
    variantLabel: str
    templateType: Optional[str] = None
    isCrossTemplate: bool = False
    xTemplate: Optional[str] = None
    yTemplate: Optional[str] = None
    xRatio: Optional[float] = None
    yRatio: Optional[float] = None
    xError: Optional[float] = None
    yError: Optional[float] = None
    xRatioIndex: Optional[int] = None
    yRatioIndex: Optional[int] = None


class CutTypologyBossResult(NodePoint):
    matchedAny: bool
    matchedCount: int
    matches: List[CutTypologyBossMatch] = Field(default_factory=list)


class CutTypologyVariantResult(CutTypologyOverlayVariant):
    matchedCount: int
    coverage: float
    matchedBossIds: List[int] = Field(default_factory=list)


class CutTypologyRunResult(BaseModel):
    projectDir: str
    outputDir: str
    matchCsvPath: Optional[str] = None
    roi: Dict[str, float]
    params: Dict[str, Any]
    points: List[NodePoint]
    variants: List[CutTypologyVariantResult]
    perBoss: List[CutTypologyBossResult]
    bestVariantLabel: Optional[str] = None
    ranAt: str


class CutTypologyRunResponse(BaseModel):
    success: bool
    data: Optional[CutTypologyRunResult] = None
    error: Optional[str] = None


class CutTypologyCsvRequest(BaseModel):
    projectId: str


class CutTypologyCsvResult(BaseModel):
    projectDir: str
    csvPath: str
    columns: List[str]
    rows: List[Dict[str, str]]


class CutTypologyCsvResponse(BaseModel):
    success: bool
    data: Optional[CutTypologyCsvResult] = None
    error: Optional[str] = None


@router.post("/cut-typology/state", response_model=CutTypologyStateResponse)
async def load_cut_typology_state(request: CutTypologyStateRequest):
    """Load matching state for Step 4.3."""
    try:
        service = CutTypologyMatchingService()
        payload = await service.get_state(request.projectId)
        return CutTypologyStateResponse(success=True, data=CutTypologyStateResult(**payload))
    except Exception as e:
        return CutTypologyStateResponse(success=False, error=str(e))


@router.post("/cut-typology/run", response_model=CutTypologyRunResponse)
async def run_cut_typology_matching(request: CutTypologyRunRequest):
    """Run cut-typology matching for Step 4.3."""
    try:
        service = CutTypologyMatchingService()
        payload = await service.run_matching(
            request.projectId,
            params=request.params or {},
            points=[p.dict() for p in request.points] if request.points is not None else None,
        )
        return CutTypologyRunResponse(success=True, data=CutTypologyRunResult(**payload))
    except Exception as e:
        return CutTypologyRunResponse(success=False, error=str(e))


@router.post("/cut-typology/results/csv", response_model=CutTypologyCsvResponse)
async def load_cut_typology_csv(request: CutTypologyCsvRequest):
    """Load cut-typology CSV results for Step 4.3."""
    try:
        service = CutTypologyMatchingService()
        payload = await service.get_match_csv(request.projectId)
        return CutTypologyCsvResponse(success=True, data=CutTypologyCsvResult(**payload))
    except Exception as e:
        return CutTypologyCsvResponse(success=False, error=str(e))


class BayPlanStateRequest(BaseModel):
    projectId: str


class BayPlanRunRequest(BaseModel):
    projectId: str
    params: Optional[Dict[str, Any]] = None


class BayPlanNode(BaseModel):
    id: str
    bossId: Optional[str] = None
    source: str
    u: float
    v: float
    x: int
    y: int


class BayPlanEdge(BaseModel):
    a: int
    b: int
    isConstraint: bool = False
    isManual: bool = False
    constraintFamily: Optional[str] = None


class BayPlanManualSaveRequest(BaseModel):
    projectId: str
    edges: List[BayPlanEdge]


class BayPlanBossPoint(BaseModel):
    id: str
    x: int
    y: int
    source: str = "raw"


class BayPlanStateSummary(BaseModel):
    ranAt: Optional[str] = None
    nodeCount: Optional[int] = None
    edgeCount: Optional[int] = None
    candidateEdgeCount: Optional[int] = None
    enabledConstraintFamilies: List[str] = Field(default_factory=list)
    fallbackApplied: bool = False


class BayPlanSpoke(BaseModel):
    bossIndex: int
    bossId: str
    angleDeg: float
    strength: float
    supportCount: int = 0
    ribIds: List[str] = Field(default_factory=list)
    labels: List[str] = Field(default_factory=list)


class BayPlanCandidateEdge(BaseModel):
    a: int
    b: int
    score: float
    distanceUv: float
    angleAB: float
    angleBA: float
    angleErrorA: float
    angleErrorB: float
    spokeStrengthA: float
    spokeStrengthB: float
    spokeSupportCountA: int = 0
    spokeSupportCountB: int = 0
    thirdBossPenalty: float = 0.0
    overlapScore: float = 0.0
    mutual: bool = False
    isBoundaryForced: bool = False
    selected: bool = False


class BayPlanComparisonResult(BaseModel):
    mode: Literal["delaunay"]
    available: bool
    error: Optional[str] = None
    nodeCount: int = 0
    edgeCount: int = 0
    constraintFamilies: List[str] = Field(default_factory=list)
    nodes: List[BayPlanNode] = Field(default_factory=list)
    edges: List[BayPlanEdge] = Field(default_factory=list)


class BayPlanStateResult(BaseModel):
    projectDir: str
    params: Dict[str, Any]
    defaults: Dict[str, Any]
    lastRunSummary: Optional[BayPlanStateSummary] = None
    previewBosses: List[BayPlanBossPoint] = Field(default_factory=list)
    statePath: str
    resultPath: Optional[str] = None
    latestResult: Optional[Dict[str, Any]] = None


class BayPlanRunResult(BaseModel):
    projectDir: str
    outputDir: str
    outputImagePath: Optional[str] = None
    debugImagePath: Optional[str] = None
    ranAt: str
    nodeCount: int
    edgeCount: int
    candidateEdgeCount: int = 0
    constraintEdgeCount: int
    idealBossUsedCount: int
    bossCount: int
    cornerAnchorCount: int = 0
    acceptedRibCount: int = 0
    rejectedRibCount: int = 0
    enabledConstraintFamilies: List[str] = Field(default_factory=list)
    familySupportScores: Dict[str, float] = Field(default_factory=dict)
    fallbackApplied: bool = False
    fallbackReason: str = ""
    overallScore: float = 0.0
    overallScoreBreakdown: Dict[str, float] = Field(default_factory=dict)
    params: Dict[str, Any]
    nodes: List[BayPlanNode] = Field(default_factory=list)
    edges: List[BayPlanEdge] = Field(default_factory=list)
    comparison: Optional[BayPlanComparisonResult] = None
    bossSpokes: List[BayPlanSpoke] = Field(default_factory=list)
    candidateEdges: List[BayPlanCandidateEdge] = Field(default_factory=list)
    optimisationDiagnostics: List[Dict[str, Any]] = Field(default_factory=list)
    usedBosses: List[BayPlanBossPoint] = Field(default_factory=list)
    idealBosses: List[BayPlanBossPoint] = Field(default_factory=list)
    extractedBosses: List[BayPlanBossPoint] = Field(default_factory=list)


class BayPlanStateResponse(BaseModel):
    success: bool
    data: Optional[BayPlanStateResult] = None
    error: Optional[str] = None


class BayPlanRunResponse(BaseModel):
    success: bool
    data: Optional[BayPlanRunResult] = None
    error: Optional[str] = None


@router.post("/bay-plan/state", response_model=BayPlanStateResponse)
async def load_bay_plan_state(request: BayPlanStateRequest):
    """Load Step 4.4 bay-plan candidate generation state."""
    try:
        service = BayPlanCandidateService()
        payload = await service.get_state(request.projectId)
        return BayPlanStateResponse(success=True, data=BayPlanStateResult(**payload))
    except Exception as e:
        return BayPlanStateResponse(success=False, error=str(e))


@router.post("/bay-plan/run", response_model=BayPlanRunResponse)
async def run_bay_plan(request: BayPlanRunRequest):
    """Run Step 4.4 bay-plan candidate generation."""
    try:
        service = BayPlanCandidateService()
        payload = await service.run_reconstruction(request.projectId, request.params)
        return BayPlanRunResponse(success=True, data=BayPlanRunResult(**payload))
    except Exception as e:
        return BayPlanRunResponse(success=False, error=str(e))


@router.post("/bay-plan/save-manual", response_model=BayPlanRunResponse)
async def save_bay_plan_manual(request: BayPlanManualSaveRequest):
    """Persist manual reconstructed-rib edits for Step 4.4."""
    try:
        service = BayPlanCandidateService()
        payload = await service.save_manual_edges(
            request.projectId,
            edges=[edge.dict() for edge in request.edges],
        )
        return BayPlanRunResponse(success=True, data=BayPlanRunResult(**payload))
    except Exception as e:
        return BayPlanRunResponse(success=False, error=str(e))
