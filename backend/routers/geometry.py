"""Geometry analysis router for vault classification and measurements."""

from typing import List, Optional, Literal
from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel
import numpy as np

from services.geometry_analyzer import GeometryAnalyzer
from services.measurement_service import MeasurementService

router = APIRouter()


class BoundingBoxInput(BaseModel):
    x: float
    y: float
    width: float
    height: float


class GeometryRequest(BaseModel):
    projectionId: str
    boundingBox: BoundingBoxInput


class BossStone(BaseModel):
    x: float
    y: float
    label: str


class GeometryResult(BaseModel):
    classification: Literal["starcut", "circlecut", "starcirclecut"]
    bossStones: List[BossStone]
    px: int
    py: int
    confidence: float


class GeometryResponse(BaseModel):
    success: bool
    data: Optional[GeometryResult] = None
    error: Optional[str] = None


@router.post("/analyze", response_model=GeometryResponse)
async def analyze_geometry(request: GeometryRequest):
    """Analyze 2D geometry to classify vault type."""
    try:
        analyzer = GeometryAnalyzer()
        
        result = await analyzer.analyze(
            projection_id=request.projectionId,
            bounding_box=(
                request.boundingBox.x,
                request.boundingBox.y,
                request.boundingBox.width,
                request.boundingBox.height,
            ),
        )
        
        return GeometryResponse(
            success=True,
            data=GeometryResult(
                classification=result["classification"],
                bossStones=[
                    BossStone(x=bs["x"], y=bs["y"], label=bs["label"])
                    for bs in result["boss_stones"]
                ],
                px=result["px"],
                py=result["py"],
                confidence=result["confidence"],
            ),
        )
    except Exception as e:
        return GeometryResponse(success=False, error=str(e))


class MeasurementRequest(BaseModel):
    traceId: str
    segmentStart: float
    segmentEnd: float
    tracePoints: List[List[float]]  # [[x, y, z], ...]


class Point3D(BaseModel):
    x: float
    y: float
    z: float


class MeasurementResult(BaseModel):
    arcRadius: float
    ribLength: float
    apexPoint: Point3D
    springingPoints: List[Point3D]
    fitError: float
    pointDistances: List[float]
    segmentPoints: List[Point3D]
    arcCenter: Point3D
    arcBasisU: Point3D
    arcBasisV: Point3D
    arcStartAngle: float
    arcEndAngle: float


class MeasurementResponse(BaseModel):
    success: bool
    data: Optional[MeasurementResult] = None
    error: Optional[str] = None


@router.post("/measurements/calculate", response_model=MeasurementResponse)
async def calculate_measurements(request: MeasurementRequest):
    """Calculate geometric measurements for a trace segment."""
    try:
        service = MeasurementService()
        
        # Load the trace points into the service
        trace_points = np.array(request.tracePoints)
        service.traces[request.traceId] = trace_points
        
        result = await service.calculate(
            trace_id=request.traceId,
            segment_start=request.segmentStart,
            segment_end=request.segmentEnd,
        )
        
        return MeasurementResponse(
            success=True,
            data=MeasurementResult(
                arcRadius=result["arc_radius"],
                ribLength=result["rib_length"],
                apexPoint=Point3D(**result["apex_point"]),
                springingPoints=[Point3D(**p) for p in result["springing_points"]],
                fitError=result["fit_error"],
                pointDistances=result["point_distances"],
                segmentPoints=[Point3D(x=p[0], y=p[1], z=p[2]) for p in result["segment_points"]],
                arcCenter=Point3D(**result["arc_center"]),
                arcBasisU=Point3D(**result["arc_basis_u"]),
                arcBasisV=Point3D(**result["arc_basis_v"]),
                arcStartAngle=result["arc_start_angle"],
                arcEndAngle=result["arc_end_angle"],
            ),
        )
    except Exception as e:
        return MeasurementResponse(success=False, error=str(e))


class ChordAnalysisRequest(BaseModel):
    hypothesis_id: str


class ThreeCircleResult(BaseModel):
    r1: float
    r2: float
    r3: float
    centers: List[Point3D]


class ChordAnalysisResult(BaseModel):
    predictedMethod: str
    threeCircleResult: ThreeCircleResult
    calculations: dict
    confidence: float


class ChordAnalysisResponse(BaseModel):
    success: bool
    data: Optional[ChordAnalysisResult] = None
    error: Optional[str] = None


@router.post("/analysis/chord-method", response_model=ChordAnalysisResponse)
async def analyze_chord_method(request: ChordAnalysisRequest):
    """Analyze using the three-circle chord method."""
    try:
        service = MeasurementService()
        
        result = await service.chord_method_analysis(request.hypothesis_id)
        
        return ChordAnalysisResponse(
            success=True,
            data=ChordAnalysisResult(
                predictedMethod=result["predicted_method"],
                threeCircleResult=ThreeCircleResult(
                    r1=result["three_circle"]["r1"],
                    r2=result["three_circle"]["r2"],
                    r3=result["three_circle"]["r3"],
                    centers=[Point3D(**c) for c in result["three_circle"]["centers"]],
                ),
                calculations=result["calculations"],
                confidence=result["confidence"],
            ),
        )
    except Exception as e:
        return ChordAnalysisResponse(success=False, error=str(e))


class RibImpostData(BaseModel):
    springing_z: float
    springing_point: Point3D
    impost_distance: float


class ImpostLineResult(BaseModel):
    impost_height: float
    num_ribs_used: int
    ribs: dict  # Dictionary of {rib_id: RibImpostData}


class ImpostLineResponse(BaseModel):
    success: bool
    data: Optional[ImpostLineResult] = None
    error: Optional[str] = None


class ImpostLineRequest(BaseModel):
    """Request for impost line calculation with multiple rib traces."""
    ribs: List[dict]  # [{id: str, points: [[x, y, z], ...]}, ...]
    impostHeight: Optional[float] = None  # User-defined impost height (e.g., floor plane Z)


@router.post("/measurements/impost-line", response_model=ImpostLineResponse)
async def calculate_impost_line_endpoint(request: ImpostLineRequest):
    """Calculate impost line height and per-rib impost distances.
    
    This analyzes ribs that originate from walls/piers to determine the
    horizontal impost line height and calculates the distance from the
    impost line to each rib's springing point.
    """
    try:
        service = MeasurementService()
        
        # Load all rib traces into the service
        for rib in request.ribs:
            rib_id = rib.get("id", f"rib-{len(service.traces)}")
            points = np.array(rib.get("points", []))
            if len(points) > 0:
                service.traces[rib_id] = points
        
        if not service.traces:
            return ImpostLineResponse(success=False, error="No valid rib traces provided")
        
        result = await service._async_calculate_impost_line(
            impost_height=request.impostHeight
        )
        
        return ImpostLineResponse(
            success=True,
            data=ImpostLineResult(
                impost_height=result["impost_height"],
                num_ribs_used=result["num_ribs_used"],
                ribs=result["ribs"],
            ),
        )
    except Exception as e:
        return ImpostLineResponse(success=False, error=str(e))


# ---------------------------------------------------------------------------
# Rib Group Detection
# ---------------------------------------------------------------------------

class RibForGrouping(BaseModel):
    id: str
    points: List[List[float]]  # [[x, y, z], ...]


class RibGroupCombinedMeasurements(BaseModel):
    arc_radius: float
    rib_length: float
    apex_point: Point3D
    arc_center: Point3D
    arc_center_z: float
    fit_error: float


class RibGroupResult(BaseModel):
    groupId: str
    groupName: Optional[str] = None
    ribIds: List[str]
    isGrouped: bool
    combinedMeasurements: RibGroupCombinedMeasurements


class DetectRibGroupsRequest(BaseModel):
    ribs: List[RibForGrouping]
    maxGap: float = 2.0
    radiusTolerance: float = 0.15


class DetectRibGroupsResponse(BaseModel):
    success: bool
    data: Optional[List[RibGroupResult]] = None
    error: Optional[str] = None


@router.post("/measurements/rib-groups", response_model=DetectRibGroupsResponse)
async def detect_rib_groups_endpoint(request: DetectRibGroupsRequest):
    """Detect rib groups split by keystones and return combined arc measurements."""
    try:
        service = MeasurementService()
        for rib in request.ribs:
            points = np.array(rib.points)
            if len(points) >= 3:
                service.traces[rib.id] = points

        if not service.traces:
            return DetectRibGroupsResponse(success=False, error="No valid rib traces provided")

        import asyncio as _asyncio
        loop = _asyncio.get_event_loop()
        groups = await loop.run_in_executor(
            None,
            service.detect_rib_groups,
            request.maxGap,
            25.0,  # angle_threshold_deg - internal constant
            request.radiusTolerance,
        )

        results = []
        for i, group_ids in enumerate(groups):
            combined = service.calculate_group_measurements(group_ids)
            results.append(RibGroupResult(
                groupId=f"group-{i}",
                groupName=None,
                ribIds=group_ids,
                isGrouped=len(group_ids) > 1,
                combinedMeasurements=RibGroupCombinedMeasurements(
                    arc_radius=combined["arc_radius"],
                    rib_length=combined["rib_length"],
                    apex_point=Point3D(**combined["apex_point"]),
                    arc_center=Point3D(**combined["arc_center"]),
                    arc_center_z=combined["arc_center_z"],
                    fit_error=combined["fit_error"],
                ),
            ))

        return DetectRibGroupsResponse(success=True, data=results)
    except Exception as e:
        return DetectRibGroupsResponse(success=False, error=str(e))


class CustomRibGroupInput(BaseModel):
    groupId: str
    ribIds: List[str]
    groupName: Optional[str] = None


class CalculateCustomRibGroupsRequest(BaseModel):
    ribs: List[RibForGrouping]
    groups: List[CustomRibGroupInput]


@router.post("/measurements/custom-rib-groups", response_model=DetectRibGroupsResponse)
async def calculate_custom_rib_groups_endpoint(request: CalculateCustomRibGroupsRequest):
    """Calculate combined measurements for explicit user-defined rib groups."""
    try:
        service = MeasurementService()
        for rib in request.ribs:
            points = np.array(rib.points)
            if len(points) >= 3:
                service.traces[rib.id] = points

        if not service.traces:
            return DetectRibGroupsResponse(success=False, error="No valid rib traces provided")

        results: List[RibGroupResult] = []
        for group in request.groups:
            rib_ids = [rid for rid in group.ribIds if rid in service.traces]
            if not rib_ids:
                continue

            combined = service.calculate_group_measurements(rib_ids)
            results.append(RibGroupResult(
                groupId=group.groupId,
                groupName=group.groupName,
                ribIds=rib_ids,
                isGrouped=len(rib_ids) > 1,
                combinedMeasurements=RibGroupCombinedMeasurements(
                    arc_radius=combined["arc_radius"],
                    rib_length=combined["rib_length"],
                    apex_point=Point3D(**combined["apex_point"]),
                    arc_center=Point3D(**combined["arc_center"]),
                    arc_center_z=combined["arc_center_z"],
                    fit_error=combined["fit_error"],
                ),
            ))

        return DetectRibGroupsResponse(success=True, data=results)
    except Exception as e:
        return DetectRibGroupsResponse(success=False, error=str(e))


# ---------------------------------------------------------------------------
# Apex & Span Calculation
# ---------------------------------------------------------------------------

class BossPosition(BaseModel):
    id: str
    x: float
    y: float
    z: float
    label: str = ""


class PairingApexSideInput(BaseModel):
    sideId: str
    sideLabel: str = ""
    ribIds: List[str] = []


class PairingApexInput(BaseModel):
    pairingId: str
    pairingName: str
    sides: List[PairingApexSideInput]


class ApexSpanRequest(BaseModel):
    ribs: List[RibForGrouping]
    bosses: List[BossPosition]
    maxBossDistance: float = 2.0
    symmetryAngleTolerance: float = 30.0
    impostHeight: Optional[float] = None
    pairings: Optional[List[PairingApexInput]] = None


class RibPairIntersection(BaseModel):
    ribA: str
    ribB: str
    intersection: Point3D


class BossApexResult(BaseModel):
    bossId: str
    bossLabel: str
    bossPosition: Point3D
    apex: Point3D
    ribPairs: List[RibPairIntersection]
    assignedRibs: List[str]


class RibSpanResult(BaseModel):
    ribId: str
    bossId: str
    span: float
    springingPoint: Point3D
    projectedApex: Point3D


class PairingApexResult(BaseModel):
    pairingId: str
    pairingName: str
    sideLabels: List[str]
    apex: Optional[Point3D] = None
    apexHeight: Optional[float] = None
    status: Literal["ok", "no-intersection", "insufficient-data"] = "insufficient-data"
    warning: Optional[str] = None


class ApexSpanResult(BaseModel):
    bosses: List[BossApexResult]
    ribs: dict  # {rib_id: RibSpanResult}
    pairingApex: List[PairingApexResult] = []


class ApexSpanResponse(BaseModel):
    success: bool
    data: Optional[ApexSpanResult] = None
    error: Optional[str] = None


@router.post("/measurements/apex-span", response_model=ApexSpanResponse)
async def calculate_apex_span_endpoint(request: ApexSpanRequest):
    """Compute architectural apex per boss and span per rib.

    The apex for each boss is the intersection point of extended arcs from
    opposite symmetrical ribs converging at that boss.  Span is the
    horizontal distance from each rib's springing point to the apex
    projected down onto the springing plane.
    """
    try:
        service = MeasurementService()

        for rib in request.ribs:
            points = np.array(rib.points)
            if len(points) >= 3:
                service.traces[rib.id] = points

        if not service.traces:
            return ApexSpanResponse(success=False, error="No valid rib traces provided")

        bosses_raw = [
            {"id": b.id, "x": b.x, "y": b.y, "z": b.z, "label": b.label}
            for b in request.bosses
        ]
        pairings_raw = None
        if request.pairings:
            pairings_raw = [
                {
                    "pairingId": pairing.pairingId,
                    "pairingName": pairing.pairingName,
                    "sides": [
                        {
                            "sideId": side.sideId,
                            "sideLabel": side.sideLabel,
                            "ribIds": side.ribIds,
                        }
                        for side in pairing.sides
                    ],
                }
                for pairing in request.pairings
            ]

        import asyncio as _asyncio
        loop = _asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: service.calculate_apex_span(
                bosses=bosses_raw,
                max_boss_distance=request.maxBossDistance,
                symmetry_angle_tol_deg=request.symmetryAngleTolerance,
                impost_height=request.impostHeight,
                pairings=pairings_raw,
            ),
        )

        return ApexSpanResponse(
            success=True,
            data=ApexSpanResult(
                bosses=[
                    BossApexResult(
                        bossId=b["bossId"],
                        bossLabel=b["bossLabel"],
                        bossPosition=Point3D(**b["bossPosition"]),
                        apex=Point3D(**b["apex"]),
                        ribPairs=[
                            RibPairIntersection(
                                ribA=p["ribA"],
                                ribB=p["ribB"],
                                intersection=Point3D(**p["intersection"]),
                            )
                            for p in b["ribPairs"]
                        ],
                        assignedRibs=b["assignedRibs"],
                    )
                    for b in result["bosses"]
                ],
                ribs=result["ribs"],
                pairingApex=[
                    PairingApexResult(
                        pairingId=p["pairingId"],
                        pairingName=p["pairingName"],
                        sideLabels=p.get("sideLabels", []),
                        apex=Point3D(**p["apex"]) if p.get("apex") else None,
                        apexHeight=p.get("apexHeight"),
                        status=p.get("status", "insufficient-data"),
                        warning=p.get("warning"),
                    )
                    for p in result.get("pairingApex", [])
                ],
            ),
        )
    except Exception as e:
        return ApexSpanResponse(success=False, error=str(e))
