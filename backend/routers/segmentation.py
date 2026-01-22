"""Segmentation router for SAM 3 integration."""

import asyncio
from typing import List, Optional, Literal

from fastapi import APIRouter
from pydantic import BaseModel

from services.sam_service import get_sam_service
from services.projection import get_projection_service

router = APIRouter()


class SegmentationRequest(BaseModel):
    projectionId: str
    mode: Literal["auto", "text"]
    textPrompts: Optional[List[str]] = None


class MaskData(BaseModel):
    id: str
    label: str
    color: str
    maskBase64: str
    bbox: List[int]  # [x, y, w, h]
    area: int
    predictedIou: float
    stabilityScore: float
    visible: bool
    source: str


class SegmentationResponse(BaseModel):
    success: bool
    masks: Optional[List[MaskData]] = None
    error: Optional[str] = None
    samAvailable: bool = True


@router.get("/status")
async def get_status():
    """Check SAM 3 service status."""
    sam = get_sam_service()
    return {
        "available": sam.is_available(),
        "loaded": sam.is_loaded(),
    }


@router.post("/load-model")
async def load_model():
    """Pre-load the SAM 3 model."""
    sam = get_sam_service()
    
    if not sam.is_available():
        return {
            "success": False,
            "error": "sam3 package not installed. Run: pip install sam3",
        }
    
    # Run in thread pool to avoid blocking
    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(None, sam.load_model)
    
    return {
        "success": success,
        "loaded": sam.is_loaded(),
    }


@router.post("/run", response_model=SegmentationResponse)
async def run_segmentation(request: SegmentationRequest):
    """Run SAM 3 segmentation on a projection image with text prompts."""
    sam = get_sam_service()
    projection_service = get_projection_service()
    
    # Check if SAM 3 is available
    if not sam.is_available():
        return SegmentationResponse(
            success=False,
            error="SAM 3 not available. Install with: pip install sam3",
            samAvailable=False,
        )
    
    # Get projection image
    image_base64 = projection_service.get_projection_image_base64(
        request.projectionId, 
        "colour"
    )
    
    if not image_base64:
        return SegmentationResponse(
            success=False,
            error=f"Projection {request.projectionId} not found",
        )
    
    try:
        loop = asyncio.get_event_loop()
        
        # Set image (this also loads model if needed)
        image_set = await loop.run_in_executor(
            None,
            sam.set_image_from_base64,
            image_base64,
            request.projectionId,
        )
        
        if not image_set:
            return SegmentationResponse(
                success=False,
                error="Failed to load image or SAM 3 model",
            )
        
        # Run segmentation based on mode
        if request.mode == "text" and request.textPrompts:
            # Text-guided segmentation with prompts
            print(f"Running SAM 3 text segmentation with prompts: {request.textPrompts}")
            masks = await loop.run_in_executor(
                None,
                sam.segment_with_text_prompts,
                request.textPrompts,
            )
        
        elif request.mode == "auto":
            # Automatic detection with generic prompts
            print(f"Running SAM 3 automatic segmentation on {request.projectionId}...")
            masks = await loop.run_in_executor(
                None,
                sam.generate_automatic_masks,
            )
        
        else:
            return SegmentationResponse(
                success=False,
                error="Invalid mode or missing text prompts",
            )
        
        print(f"✓ SAM 3 segmentation complete: {len(masks)} masks")
        
        # Convert to response format
        mask_data = [
            MaskData(
                id=m["id"],
                label=m["label"],
                color=m["color"],
                maskBase64=m["maskBase64"],
                bbox=m["bbox"],
                area=m["area"],
                predictedIou=m["predictedIou"],
                stabilityScore=m["stabilityScore"],
                visible=m["visible"],
                source=m["source"],
            )
            for m in masks
        ]
        
        return SegmentationResponse(
            success=True,
            masks=mask_data,
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return SegmentationResponse(
            success=False,
            error=str(e),
        )
