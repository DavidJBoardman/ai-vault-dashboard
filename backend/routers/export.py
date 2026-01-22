"""Export router for reprojection and file export."""

from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from services.reprojection import ReprojectionService
from services.e57_exporter import E57Exporter

router = APIRouter()


class ReprojectionRequest(BaseModel):
    segmentationIds: List[str]
    outputPath: str


class ReprojectionResponse(BaseModel):
    success: bool
    outputPath: Optional[str] = None
    error: Optional[str] = None


@router.post("/reprojection/create", response_model=ReprojectionResponse)
async def create_reprojection(request: ReprojectionRequest):
    """Reproject 2D segmentations back to 3D point cloud."""
    try:
        service = ReprojectionService()
        
        output_path = await service.reproject(
            segmentation_ids=request.segmentationIds,
            output_path=request.outputPath,
        )
        
        return ReprojectionResponse(success=True, outputPath=output_path)
    except Exception as e:
        return ReprojectionResponse(success=False, error=str(e))


class TraceUploadRequest(BaseModel):
    file_path: str


class TraceUploadResponse(BaseModel):
    success: bool
    id: Optional[str] = None
    pointCount: Optional[int] = None
    error: Optional[str] = None


@router.post("/traces/upload", response_model=TraceUploadResponse)
async def upload_trace(request: TraceUploadRequest):
    """Upload a manual trace file (DXF/OBJ)."""
    try:
        service = ReprojectionService()
        result = await service.load_trace(request.file_path)
        
        return TraceUploadResponse(
            success=True,
            id=result["id"],
            pointCount=result["point_count"],
        )
    except Exception as e:
        return TraceUploadResponse(success=False, error=str(e))


class AlignmentTransform(BaseModel):
    scale: float
    rotation: List[float]  # Euler angles or quaternion
    translation: List[float]  # x, y, z


class TraceAlignRequest(BaseModel):
    trace_id: str
    transform: AlignmentTransform


@router.post("/traces/align")
async def align_trace(request: TraceAlignRequest):
    """Align a trace with the point cloud."""
    try:
        service = ReprojectionService()
        await service.align_trace(
            trace_id=request.trace_id,
            scale=request.transform.scale,
            rotation=request.transform.rotation,
            translation=request.transform.translation,
        )
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


class ExportRequest(BaseModel):
    outputPath: str
    includeAnnotations: bool = True
    annotationTypes: List[str] = []


class ExportResponse(BaseModel):
    success: bool
    outputPath: Optional[str] = None
    error: Optional[str] = None


@router.post("/e57", response_model=ExportResponse)
async def export_e57(request: ExportRequest):
    """Export the point cloud with annotations to E57."""
    try:
        exporter = E57Exporter()
        
        output_path = await exporter.export(
            output_path=request.outputPath,
            include_annotations=request.includeAnnotations,
            annotation_types=request.annotationTypes,
        )
        
        return ExportResponse(success=True, outputPath=output_path)
    except Exception as e:
        return ExportResponse(success=False, error=str(e))


@router.post("/csv")
async def export_csv(data_type: str, output_path: str):
    """Export analysis data to CSV."""
    try:
        # Implementation would export geometry results, measurements, etc.
        return {"success": True, "outputPath": output_path}
    except Exception as e:
        return {"success": False, "error": str(e)}

