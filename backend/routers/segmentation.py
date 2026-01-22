"""Segmentation router for SAM3 integration."""

from typing import List, Optional, Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.sam_service import SAMService
from services.intrados_detector import IntradosDetector

router = APIRouter()


class PointPrompt(BaseModel):
    x: float
    y: float
    label: int  # 1 for foreground, 0 for background


class BoxPrompt(BaseModel):
    x: float
    y: float
    width: float
    height: float


class SegmentationRequest(BaseModel):
    projectionId: str
    mode: Literal["auto", "point_prompt", "box_prompt"]
    points: Optional[List[PointPrompt]] = None
    box: Optional[BoxPrompt] = None


class MaskResult(BaseModel):
    id: str
    label: str
    maskBase64: str
    confidence: float


class SegmentationResult(BaseModel):
    masks: List[MaskResult]


class SegmentationResponse(BaseModel):
    success: bool
    data: Optional[SegmentationResult] = None
    error: Optional[str] = None


@router.post("/run", response_model=SegmentationResponse)
async def run_segmentation(request: SegmentationRequest):
    """Run SAM3 segmentation on a projection image."""
    try:
        service = SAMService()
        
        if request.mode == "auto":
            masks = await service.auto_segment(request.projectionId)
        elif request.mode == "point_prompt" and request.points:
            masks = await service.segment_with_points(
                request.projectionId,
                [(p.x, p.y, p.label) for p in request.points],
            )
        elif request.mode == "box_prompt" and request.box:
            masks = await service.segment_with_box(
                request.projectionId,
                (request.box.x, request.box.y, request.box.width, request.box.height),
            )
        else:
            raise ValueError("Invalid segmentation mode or missing prompts")
        
        return SegmentationResponse(
            success=True,
            data=SegmentationResult(
                masks=[
                    MaskResult(
                        id=str(uuid4()),
                        label=m["label"],
                        maskBase64=m["mask_base64"],
                        confidence=m["confidence"],
                    )
                    for m in masks
                ]
            ),
        )
    except Exception as e:
        return SegmentationResponse(success=False, error=str(e))


class IntradosRequest(BaseModel):
    projection_id: str


class IntradosPoint(BaseModel):
    x: float
    y: float


class IntradosLine(BaseModel):
    id: str
    points: List[IntradosPoint]


class IntradosResponse(BaseModel):
    success: bool
    lines: Optional[List[IntradosLine]] = None
    error: Optional[str] = None


@router.post("/intrados", response_model=IntradosResponse)
async def detect_intrados(request: IntradosRequest):
    """Detect intrados lines (rib skeletons) in the projection."""
    try:
        detector = IntradosDetector()
        lines = await detector.detect(request.projection_id)
        
        return IntradosResponse(
            success=True,
            lines=[
                IntradosLine(
                    id=str(uuid4()),
                    points=[IntradosPoint(x=p[0], y=p[1]) for p in line["points"]],
                )
                for line in lines
            ],
        )
    except Exception as e:
        return IntradosResponse(success=False, error=str(e))


@router.post("/refine")
async def refine_segmentation(mask_id: str, points: List[PointPrompt]):
    """Refine a segmentation mask with additional prompts."""
    try:
        service = SAMService()
        refined = await service.refine_mask(
            mask_id,
            [(p.x, p.y, p.label) for p in points],
        )
        return {"success": True, "mask": refined}
    except Exception as e:
        return {"success": False, "error": str(e)}

