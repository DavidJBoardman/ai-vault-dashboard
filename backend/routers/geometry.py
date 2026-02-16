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

