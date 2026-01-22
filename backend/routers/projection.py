"""Projection router for 3D to 2D conversion."""

from pathlib import Path
from typing import Optional, Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from services.projection import ProjectionService

router = APIRouter()


class CustomAngle(BaseModel):
    theta: float
    phi: float


class ProjectionRequest(BaseModel):
    perspective: Literal["top", "bottom", "north", "south", "east", "west", "custom"]
    customAngle: Optional[CustomAngle] = None
    resolution: int = 2048
    scale: float = 1.0


class ProjectionResult(BaseModel):
    id: str
    imagePath: str
    imageBase64: Optional[str] = None
    width: int
    height: int


class ProjectionResponse(BaseModel):
    success: bool
    data: Optional[ProjectionResult] = None
    error: Optional[str] = None


@router.post("/create", response_model=ProjectionResponse)
async def create_projection(request: ProjectionRequest):
    """Create a 2D projection from the loaded point cloud."""
    try:
        service = ProjectionService()
        
        projection_id = str(uuid4())
        
        result = await service.create_projection(
            projection_id=projection_id,
            perspective=request.perspective,
            custom_angle=request.customAngle.model_dump() if request.customAngle else None,
            resolution=request.resolution,
            scale=request.scale,
        )
        
        # Get base64 image for frontend display
        image_base64 = service.get_projection_image_base64(projection_id)
        
        return ProjectionResponse(
            success=True,
            data=ProjectionResult(
                id=projection_id,
                imagePath=result["image_path"],
                imageBase64=image_base64,
                width=result["width"],
                height=result["height"],
            ),
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return ProjectionResponse(success=False, error=str(e))


@router.get("/list")
async def list_projections():
    """List all created projections."""
    service = ProjectionService()
    projections = await service.list_projections()
    return {"projections": projections}


@router.get("/image/{projection_id}")
async def get_projection_image(projection_id: str):
    """Get projection image file."""
    service = ProjectionService()
    projection = await service.get_projection(projection_id)
    
    if not projection:
        raise HTTPException(status_code=404, detail="Projection not found")
    
    image_path = Path(projection["image_path"])
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")
    
    return FileResponse(
        path=image_path,
        media_type="image/png",
        filename=f"projection_{projection_id}.png"
    )


@router.get("/image/{projection_id}/base64")
async def get_projection_image_base64(projection_id: str):
    """Get projection image as base64 string."""
    service = ProjectionService()
    
    image_base64 = service.get_projection_image_base64(projection_id)
    
    if not image_base64:
        raise HTTPException(status_code=404, detail="Projection not found")
    
    return {"image": image_base64}


@router.delete("/{projection_id}")
async def delete_projection(projection_id: str):
    """Delete a projection."""
    service = ProjectionService()
    await service.delete_projection(projection_id)
    return {"success": True}


@router.get("/{projection_id}")
async def get_projection(projection_id: str):
    """Get projection info."""
    service = ProjectionService()
    projection = await service.get_projection(projection_id)
    
    if not projection:
        raise HTTPException(status_code=404, detail="Projection not found")
    
    return projection
