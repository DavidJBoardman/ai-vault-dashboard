"""Projection router for 3D to 2D conversion using Gaussian splatting."""

from pathlib import Path
from typing import Optional, Literal, Dict, Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from services.projection import get_projection_service

router = APIRouter()


class ProjectionRequest(BaseModel):
    """Request model for creating a projection."""
    perspective: Literal["top", "bottom", "north", "south", "east", "west"]
    resolution: int = 2048
    sigma: float = 1.0
    kernelSize: int = 5
    bottomUp: bool = True
    scale: float = 1.0


class ProjectionImages(BaseModel):
    """Images included in projection result."""
    colour: Optional[str] = None
    depthGrayscale: Optional[str] = None
    depthPlasma: Optional[str] = None


class ProjectionResult(BaseModel):
    """Result of a projection creation."""
    id: str
    perspective: str
    resolution: int
    sigma: float
    kernelSize: int
    images: ProjectionImages
    metadata: Dict[str, Any]


class ProjectionResponse(BaseModel):
    """Response wrapper for projection endpoints."""
    success: bool
    data: Optional[ProjectionResult] = None
    error: Optional[str] = None


@router.post("/create", response_model=ProjectionResponse)
async def create_projection(request: ProjectionRequest):
    """
    Create a 2D projection from the loaded point cloud using Gaussian splatting.
    
    Returns colour image, depth grayscale, and depth plasma visualization.
    """
    try:
        service = get_projection_service()
        
        projection_id = f"proj-{uuid4().hex[:8]}"
        
        result = await service.create_projection(
            projection_id=projection_id,
            perspective=request.perspective,
            resolution=request.resolution,
            sigma=request.sigma,
            kernel_size=request.kernelSize,
            bottom_up=request.bottomUp,
            scale=request.scale,
        )
        
        # Get all images as base64 for frontend display
        images = service.get_projection_images_base64(projection_id)
        
        return ProjectionResponse(
            success=True,
            data=ProjectionResult(
                id=projection_id,
                perspective=request.perspective,
                resolution=request.resolution,
                sigma=request.sigma,
                kernelSize=request.kernelSize,
                images=ProjectionImages(
                    colour=images.get("colour") if images else None,
                    depthGrayscale=images.get("depth_grayscale") if images else None,
                    depthPlasma=images.get("depth_plasma") if images else None,
                ),
                metadata=result.get("metadata", {}),
            ),
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return ProjectionResponse(success=False, error=str(e))


@router.get("/list")
async def list_projections():
    """List all created projections with their settings."""
    service = get_projection_service()
    projections = await service.list_projections()
    return {"success": True, "projections": projections}


@router.get("/{projection_id}")
async def get_projection(projection_id: str):
    """Get projection info and metadata."""
    service = get_projection_service()
    projection = await service.get_projection(projection_id)
    
    if not projection:
        raise HTTPException(status_code=404, detail="Projection not found")
    
    return {"success": True, "projection": projection}


@router.get("/{projection_id}/images")
async def get_projection_images(projection_id: str):
    """Get all projection images as base64."""
    service = get_projection_service()
    
    images = service.get_projection_images_base64(projection_id)
    
    if not images:
        raise HTTPException(status_code=404, detail="Projection not found")
    
    return {
        "success": True,
        "images": {
            "colour": images.get("colour"),
            "depthGrayscale": images.get("depth_grayscale"),
            "depthPlasma": images.get("depth_plasma"),
        }
    }


@router.get("/{projection_id}/image/{image_type}")
async def get_projection_image(
    projection_id: str,
    image_type: Literal["colour", "depth_grayscale", "depth_plasma"] = "colour"
):
    """Get a specific projection image as base64."""
    service = get_projection_service()
    
    image_base64 = service.get_projection_image_base64(projection_id, image_type)
    
    if not image_base64:
        raise HTTPException(status_code=404, detail=f"Image '{image_type}' not found")
    
    return {"success": True, "image": image_base64, "type": image_type}


@router.get("/{projection_id}/file/{image_type}")
async def get_projection_file(
    projection_id: str,
    image_type: Literal["colour", "depth_grayscale", "depth_plasma"] = "colour"
):
    """Download a specific projection image file."""
    service = get_projection_service()
    projection = await service.get_projection(projection_id)
    
    if not projection:
        raise HTTPException(status_code=404, detail="Projection not found")
    
    paths = projection.get("paths", {})
    path_key = image_type if image_type == "colour" else image_type.replace("_", "_")
    image_path = Path(paths.get(path_key, ""))
    
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")
    
    return FileResponse(
        path=image_path,
        media_type="image/png",
        filename=f"{projection_id}_{image_type}.png"
    )


@router.get("/{projection_id}/export")
async def export_projection(projection_id: str):
    """Export projection data for project save/load."""
    service = get_projection_service()
    
    export_data = service.get_projection_for_export(projection_id)
    
    if not export_data:
        raise HTTPException(status_code=404, detail="Projection not found")
    
    return {"success": True, "data": export_data}


@router.delete("/{projection_id}")
async def delete_projection(projection_id: str):
    """Delete a projection and its files."""
    service = get_projection_service()
    await service.delete_projection(projection_id)
    return {"success": True}
