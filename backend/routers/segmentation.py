"""Segmentation router for SAM 3 integration."""

import asyncio
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Literal

from fastapi import APIRouter
from pydantic import BaseModel

from services.app_paths import get_data_root
from services.sam_service import get_sam_service
from services.projection import get_projection_service

router = APIRouter()
SEGMENTATION_LOG_PATH = get_data_root() / "logs" / "segmentation.log"
MAX_LOG_BYTES = 5 * 1024 * 1024
RETAINED_LOG_BYTES = 1 * 1024 * 1024


def rotate_log_if_needed(log_path: Path) -> None:
    """Trim oversized logs so packaged diagnostics stay bounded."""
    try:
        if not log_path.exists() or log_path.stat().st_size <= MAX_LOG_BYTES:
            return
        with log_path.open("rb") as handle:
            handle.seek(max(0, log_path.stat().st_size - RETAINED_LOG_BYTES))
            trimmed = handle.read()
        with log_path.open("wb") as handle:
            handle.write(trimmed)
    except Exception:
        pass


def append_segmentation_log(message: str) -> None:
    """Write segmentation diagnostics to the packaged runtime data root."""
    try:
        SEGMENTATION_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        rotate_log_if_needed(SEGMENTATION_LOG_PATH)
        with SEGMENTATION_LOG_PATH.open("a", encoding="utf-8") as handle:
            handle.write(f"[{datetime.utcnow().isoformat()}Z] {message}\n")
    except Exception:
        # Never fail the request because debug logging could not be written.
        pass


class BoxPrompt(BaseModel):
    """A bounding box prompt for segmentation."""
    coords: List[int]  # [x1, y1, x2, y2] in xyxy pixel format
    label: int = 1  # 1 = positive (include), 0 = negative (exclude)


class SegmentationRequest(BaseModel):
    projectionId: str
    mode: Literal["auto", "text", "box", "combined"]
    textPrompts: Optional[List[str]] = None
    boxes: Optional[List[BoxPrompt]] = None


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
            "error": sam.last_error or "SAM 3 not available in the packaged backend.",
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
    """
    Run SAM 3 segmentation on a projection image.
    
    Modes:
    - auto: Automatic detection with generic prompts
    - text: Text-guided segmentation with custom prompts
    - box: Box-guided segmentation (find similar objects)
    - combined: Text + box prompts together
    """
    sam = get_sam_service()
    projection_service = get_projection_service()
    append_segmentation_log(
        "run start "
        f"data_root={get_data_root()} projection_id={request.projectionId} "
        f"mode={request.mode} text_prompts={request.textPrompts or []} "
        f"box_count={len(request.boxes or [])}"
    )
    
    # Check if SAM 3 is available
    if not sam.is_available():
        append_segmentation_log(
            f"run unavailable projection_id={request.projectionId} error={sam.last_error or 'SAM unavailable'}"
        )
        return SegmentationResponse(
            success=False,
            error=sam.last_error or "SAM 3 not available in the packaged backend.",
            samAvailable=False,
        )
    
    # Get projection image
    image_base64 = projection_service.get_projection_image_base64(
        request.projectionId, 
        "colour"
    )
    projection = await projection_service.get_projection(request.projectionId)
    colour_path = projection.get("paths", {}).get("colour") if projection else None
    append_segmentation_log(
        f"projection lookup projection_id={request.projectionId} "
        f"found={bool(projection)} colour_path={colour_path or '(missing)'} "
        f"image_loaded={bool(image_base64)}"
    )
    
    if not image_base64:
        append_segmentation_log(f"run failed projection_id={request.projectionId} reason=projection image not found")
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
            append_segmentation_log(
                f"run failed projection_id={request.projectionId} reason=image/model load error={sam.last_error or 'unknown'}"
            )
            return SegmentationResponse(
                success=False,
                error=sam.last_error or "Failed to load image or SAM 3 model",
            )
        
        masks = []
        
        # Run segmentation based on mode
        if request.mode == "text" and request.textPrompts:
            # Text-guided segmentation with prompts
            print(f"Running SAM 3 text segmentation with prompts: {request.textPrompts}")
            masks = await loop.run_in_executor(
                None,
                sam.segment_with_text_prompts,
                request.textPrompts,
            )
        
        elif request.mode == "box" and request.boxes:
            # Box-guided segmentation
            print(f"Running SAM 3 box segmentation with {len(request.boxes)} boxes")
            box_dicts = [{"coords": b.coords, "label": b.label} for b in request.boxes]
            masks = await loop.run_in_executor(
                None,
                sam.segment_with_boxes,
                box_dicts,
                None,  # No text prompt
            )
        
        elif request.mode == "combined" and request.boxes:
            # Combined text + box segmentation
            text = request.textPrompts[0] if request.textPrompts else None
            print(f"Running SAM 3 combined segmentation: text='{text}', boxes={len(request.boxes)}")
            box_dicts = [{"coords": b.coords, "label": b.label} for b in request.boxes]
            masks = await loop.run_in_executor(
                None,
                sam.segment_with_boxes,
                box_dicts,
                text,
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
                error="Invalid mode or missing prompts/boxes",
            )
        
        print(f"[OK] SAM 3 segmentation complete: {len(masks)} masks")
        if not masks and sam.last_error:
            append_segmentation_log(
                f"run failed projection_id={request.projectionId} mode={request.mode} error={sam.last_error}"
            )
            return SegmentationResponse(
                success=False,
                error=sam.last_error,
            )

        append_segmentation_log(
            f"run complete projection_id={request.projectionId} mode={request.mode} mask_count={len(masks)}"
        )
        
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
        append_segmentation_log(
            f"run exception projection_id={request.projectionId} error={type(e).__name__}: {e}"
        )
        return SegmentationResponse(
            success=False,
            error=str(e),
        )
