"""Upload router for E57 file handling."""

from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.e57_processor import get_processor

router = APIRouter()


class E57UploadRequest(BaseModel):
    file_path: str


class BoundingBox(BaseModel):
    min: dict  # {x, y, z}
    max: dict  # {x, y, z}


class E57Info(BaseModel):
    pointCount: int
    boundingBox: BoundingBox
    hasColor: bool
    hasIntensity: bool


class E57UploadResponse(BaseModel):
    success: bool
    data: Optional[E57Info] = None
    error: Optional[str] = None


@router.post("/e57", response_model=E57UploadResponse)
async def upload_e57(request: E57UploadRequest):
    """Upload and process an E57 file."""
    try:
        file_path = Path(request.file_path)
        
        # Allow loading demo mode with special path
        if request.file_path == "demo" or request.file_path == "__demo__":
            processor = get_processor()
            info = processor._generate_mock_data()
            
            return E57UploadResponse(
                success=True,
                data=E57Info(
                    pointCount=info["point_count"],
                    boundingBox=BoundingBox(
                        min=info["bounding_box"]["min"],
                        max=info["bounding_box"]["max"],
                    ),
                    hasColor=info["has_color"],
                    hasIntensity=info["has_intensity"],
                ),
            )
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {request.file_path}")
        
        if not file_path.suffix.lower() == ".e57":
            raise HTTPException(status_code=400, detail="Invalid file type. Expected .e57")
        
        processor = get_processor()
        info = await processor.load_file(str(file_path))
        
        return E57UploadResponse(
            success=True,
            data=E57Info(
                pointCount=info["point_count"],
                boundingBox=BoundingBox(
                    min=info["bounding_box"]["min"],
                    max=info["bounding_box"]["max"],
                ),
                hasColor=info["has_color"],
                hasIntensity=info["has_intensity"],
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        return E57UploadResponse(success=False, error=str(e))


class PointData(BaseModel):
    x: float
    y: float
    z: float
    r: Optional[int] = None
    g: Optional[int] = None
    b: Optional[int] = None
    intensity: Optional[float] = None


class PointCloudChunk(BaseModel):
    points: List[Dict[str, Any]]
    start: int
    count: int
    total: int


@router.get("/points", response_model=PointCloudChunk)
async def get_points(
    start: int = Query(0, ge=0),
    count: int = Query(10000, ge=1, le=100000)
):
    """Get a chunk of point cloud data."""
    processor = get_processor()
    
    if not processor.is_loaded():
        return PointCloudChunk(points=[], start=0, count=0, total=0)
    
    chunk = processor.get_points_chunk(start, count)
    return PointCloudChunk(**chunk)


@router.get("/points/preview")
async def get_preview_points(max_points: int = Query(50000, ge=1000, le=200000)):
    """Get a downsampled preview of the point cloud."""
    processor = get_processor()
    
    if not processor.is_loaded():
        return {"points": [], "total": 0}
    
    points = processor.get_downsampled_points(max_points)
    return {
        "points": points,
        "total": processor.point_count,
        "bounding_box": processor.bounding_box,
    }


@router.get("/status")
async def get_upload_status():
    """Get the status of the current upload."""
    processor = get_processor()
    
    return {
        "loaded": processor.is_loaded(),
        "file": processor.current_file,
        "point_count": processor.point_count if processor.is_loaded() else 0,
        "has_color": processor.has_color,
        "has_intensity": processor.has_intensity,
    }


@router.post("/demo")
async def load_demo_data():
    """Load demo point cloud data."""
    processor = get_processor()
    info = processor._generate_mock_data()
    
    return E57UploadResponse(
        success=True,
        data=E57Info(
            pointCount=info["point_count"],
            boundingBox=BoundingBox(
                min=info["bounding_box"]["min"],
                max=info["bounding_box"]["max"],
            ),
            hasColor=info["has_color"],
            hasIntensity=info["has_intensity"],
        ),
    )
