"""Project router for saving and loading project data."""

import json
import base64
import shutil
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# Project data directory
PROJECT_DATA_DIR = Path(__file__).parent.parent / "data"
PROJECTIONS_DIR = PROJECT_DATA_DIR / "projections"


class SegmentationData(BaseModel):
    """Segmentation mask data."""
    id: str
    label: str
    color: str
    maskBase64: str
    bbox: Optional[List[int]] = None
    area: Optional[int] = None
    visible: bool = True
    source: str = "auto"


class ProjectionData(BaseModel):
    """Projection data reference."""
    id: str
    perspective: str
    resolution: int
    sigma: float
    kernelSize: int
    bottomUp: bool
    scale: float = 1.0


class ProjectSaveRequest(BaseModel):
    """Request to save project data."""
    projectId: str
    projectName: str
    e57Path: Optional[str] = None
    projections: List[ProjectionData] = []
    segmentations: List[SegmentationData] = []
    selectedProjectionId: Optional[str] = None


class ProjectLoadResponse(BaseModel):
    """Response with loaded project data."""
    success: bool
    project: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class StepState(BaseModel):
    """State for a workflow step."""
    completed: bool
    data: Optional[Dict[str, Any]] = None


class SaveProgressRequest(BaseModel):
    """Request to save project progress."""
    projectId: str
    currentStep: int
    steps: Dict[str, StepState] = {}


def get_project_dir(project_id: str) -> Path:
    """Get or create project directory."""
    project_dir = PROJECT_DATA_DIR / "projects" / project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    return project_dir


def copy_projection_to_project(projection_id: str, project_dir: Path) -> Dict[str, Any]:
    """
    Copy projection files from global projections folder to project folder.
    
    Returns projection metadata with updated paths.
    """
    proj_dir = project_dir / "projections"
    proj_dir.mkdir(exist_ok=True)
    
    # Files to copy
    file_patterns = [
        f"{projection_id}_colour.png",
        f"{projection_id}_depth_gray.png",
        f"{projection_id}_depth_plasma.png",
        f"{projection_id}_depth.npy",
        f"{projection_id}_coordinates.npy",
        f"{projection_id}_metadata.json",
    ]
    
    copied_files = {}
    
    for filename in file_patterns:
        src_path = PROJECTIONS_DIR / filename
        if src_path.exists():
            dst_path = proj_dir / filename
            shutil.copy2(src_path, dst_path)
            
            # Track copied file type
            if "_colour" in filename:
                copied_files["colour"] = filename
            elif "_depth_gray" in filename:
                copied_files["depthGrayscale"] = filename
            elif "_depth_plasma" in filename:
                copied_files["depthPlasma"] = filename
            elif "_depth.npy" in filename:
                copied_files["depthRaw"] = filename
            elif "_coordinates.npy" in filename:
                copied_files["coordinates"] = filename
            elif "_metadata" in filename:
                copied_files["metadata"] = filename
    
    # Load metadata if exists
    metadata_path = proj_dir / f"{projection_id}_metadata.json"
    metadata = {}
    if metadata_path.exists():
        with open(metadata_path, "r") as f:
            metadata = json.load(f)
    
    return {
        "id": projection_id,
        "files": copied_files,
        "metadata": metadata,
    }


def extract_group_id(label: str) -> str:
    """Extract group ID from label (e.g., 'rib #1' -> 'rib')."""
    import re
    # Remove trailing numbers and hash symbols
    base_label = re.sub(r'\s*#?\d+$', '', label).strip()
    # Convert to lowercase and replace spaces with underscores for ID
    group_id = base_label.lower().replace(' ', '_')
    return group_id if group_id else 'unknown'


def decode_mask_image(mask_base64: str):
    """Decode base64 mask to PIL Image."""
    try:
        from PIL import Image
        import io
        
        # Remove data URL prefix if present
        mask_data = mask_base64
        if "," in mask_data:
            mask_data = mask_data.split(",")[1]
        
        mask_bytes = base64.b64decode(mask_data)
        return Image.open(io.BytesIO(mask_bytes)).convert("RGBA")
    except Exception as e:
        print(f"Error decoding mask: {e}")
        return None


def create_combined_mask(masks: list, output_path: Path, color: str = None):
    """
    Create a combined mask image from multiple mask images.
    
    Args:
        masks: List of PIL Image objects (RGBA)
        output_path: Path to save the combined mask
        color: Optional hex color to override mask colors
    """
    try:
        from PIL import Image
        
        if not masks:
            return False
        
        # Use first mask to get dimensions
        width, height = masks[0].size
        
        # Create empty RGBA image
        combined = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        
        # Composite all masks
        for mask in masks:
            if mask.size == (width, height):
                # Alpha composite to combine masks
                combined = Image.alpha_composite(combined, mask)
        
        # Save combined mask
        combined.save(output_path, "PNG")
        return True
    except Exception as e:
        print(f"Error creating combined mask: {e}")
        return False


@router.post("/save")
async def save_project(request: ProjectSaveRequest):
    """
    Save project data to disk.
    
    Saves:
    - project.json: Main project metadata
    - segmentations/index.json: Segmentation metadata with group IDs
    - segmentations/{id}_mask.png: Individual mask images
    - segmentations/combined_all.png: All masks combined
    - segmentations/group_{group_id}.png: Combined masks per group
    """
    try:
        from PIL import Image
        
        project_dir = get_project_dir(request.projectId)
        
        # Create segmentations directory
        seg_dir = project_dir / "segmentations"
        seg_dir.mkdir(exist_ok=True)
        
        # Track groups for combined images
        groups: Dict[str, Any] = {}  # group_id -> { color, masks, segmentations }
        all_masks = []
        
        # Save individual mask images and collect references
        segmentation_refs = []
        
        for seg in request.segmentations:
            # Extract group ID from label
            group_id = extract_group_id(seg.label)
            
            seg_data = {
                "id": seg.id,
                "label": seg.label,
                "groupId": group_id,
                "color": seg.color,
                "visible": seg.visible,
                "source": seg.source,
            }
            
            if seg.bbox:
                seg_data["bbox"] = seg.bbox
            if seg.area:
                seg_data["area"] = seg.area
            
            # Initialize group if needed
            if group_id not in groups:
                groups[group_id] = {
                    "color": seg.color,
                    "masks": [],
                    "count": 0,
                    "label": seg.label.replace(f" #{seg.label.split('#')[-1]}", "").strip() if '#' in seg.label else seg.label,
                }
            
            # Save mask image separately (base64 PNG)
            if seg.maskBase64:
                mask_filename = f"{seg.id}_mask.png"
                mask_path = seg_dir / mask_filename
                
                # Decode base64 and save
                try:
                    # Remove data URL prefix if present
                    mask_data = seg.maskBase64
                    if "," in mask_data:
                        mask_data = mask_data.split(",")[1]
                    
                    mask_bytes = base64.b64decode(mask_data)
                    with open(mask_path, "wb") as f:
                        f.write(mask_bytes)
                    
                    seg_data["maskFile"] = mask_filename
                    
                    # Decode for combining later
                    mask_img = decode_mask_image(seg.maskBase64)
                    if mask_img:
                        all_masks.append(mask_img)
                        groups[group_id]["masks"].append(mask_img)
                        groups[group_id]["count"] += 1
                        
                except Exception as e:
                    print(f"Warning: Could not save mask for {seg.id}: {e}")
                    # Still save the base64 inline as fallback
                    seg_data["maskBase64"] = seg.maskBase64
            
            segmentation_refs.append(seg_data)
        
        # Create combined mask for ALL segmentations
        if all_masks:
            combined_all_path = seg_dir / "combined_all.png"
            if create_combined_mask(all_masks, combined_all_path):
                print(f"  ✓ Created combined_all.png ({len(all_masks)} masks)")
        
        # Create combined masks for each group
        group_summary = []
        for group_id, group_data in groups.items():
            if group_data["masks"]:
                group_filename = f"group_{group_id}.png"
                group_path = seg_dir / group_filename
                
                if create_combined_mask(group_data["masks"], group_path):
                    print(f"  ✓ Created {group_filename} ({group_data['count']} masks)")
                
                group_summary.append({
                    "groupId": group_id,
                    "label": group_data["label"],
                    "color": group_data["color"],
                    "count": group_data["count"],
                    "combinedMaskFile": group_filename,
                })
        
        # Save segmentations index
        seg_index_path = seg_dir / "index.json"
        with open(seg_index_path, "w") as f:
            json.dump({
                "segmentations": segmentation_refs,
                "groups": group_summary,
                "totalCount": len(segmentation_refs),
                "combinedMaskFile": "combined_all.png" if all_masks else None,
            }, f, indent=2)
        
        # Copy projections to project folder
        print(f"Copying {len(request.projections)} projections to project folder...")
        print(f"  Source dir: {PROJECTIONS_DIR}")
        print(f"  Dest dir: {project_dir / 'projections'}")
        
        projection_refs = []
        for proj in request.projections:
            try:
                # Check if source files exist
                src_colour = PROJECTIONS_DIR / f"{proj.id}_colour.png"
                print(f"  Checking {src_colour}: exists={src_colour.exists()}")
                
                proj_info = copy_projection_to_project(proj.id, project_dir)
                projection_refs.append({
                    "id": proj.id,
                    "perspective": proj.perspective,
                    "resolution": proj.resolution,
                    "sigma": proj.sigma,
                    "kernelSize": proj.kernelSize,
                    "bottomUp": proj.bottomUp,
                    "scale": proj.scale,
                    "files": proj_info.get("files", {}),
                    "metadata": proj_info.get("metadata", {}),
                })
                print(f"  ✓ Copied projection {proj.id}: {len(proj_info.get('files', {}))} files")
            except Exception as e:
                print(f"  ✗ Error copying projection {proj.id}: {e}")
                import traceback
                traceback.print_exc()
                # Still include the projection reference without local files
                projection_refs.append({
                    "id": proj.id,
                    "perspective": proj.perspective,
                    "resolution": proj.resolution,
                    "sigma": proj.sigma,
                    "kernelSize": proj.kernelSize,
                    "bottomUp": proj.bottomUp,
                    "scale": proj.scale,
                })
        
        # Save projections index
        proj_dir = project_dir / "projections"
        proj_dir.mkdir(exist_ok=True)
        proj_index_path = proj_dir / "index.json"
        with open(proj_index_path, "w") as f:
            json.dump({
                "projections": projection_refs,
                "totalCount": len(projection_refs),
            }, f, indent=2)
        
        # Preserve existing progress fields when saving project assets.
        project_path = project_dir / "project.json"
        existing_project_data: Dict[str, Any] = {}
        if project_path.exists():
            try:
                with open(project_path, "r") as f:
                    loaded = json.load(f)
                if isinstance(loaded, dict):
                    existing_project_data = loaded
            except Exception as e:
                print(f"Warning: failed to read existing project metadata before save: {e}")

        # Build project metadata and merge over existing fields
        project_data = {
            **existing_project_data,
            "id": request.projectId,
            "name": request.projectName,
            "e57Path": request.e57Path,
            "selectedProjectionId": request.selectedProjectionId,
            "projectionCount": len(projection_refs),
            "segmentationCount": len(segmentation_refs),
            "groupCount": len(groups),
            "groups": [g["groupId"] for g in group_summary],
            "updatedAt": datetime.now().isoformat(),
        }
        
        # Save project.json
        with open(project_path, "w") as f:
            json.dump(project_data, f, indent=2)
        
        print(f"✓ Project saved: {request.projectId}")
        print(f"  - {len(projection_refs)} projections")
        print(f"  - {len(segmentation_refs)} segmentations in {len(groups)} groups")
        
        return {
            "success": True,
            "projectDir": str(project_dir),
            "savedProjections": len(projection_refs),
            "savedSegmentations": len(segmentation_refs),
            "groups": len(groups),
        }
        
    except Exception as e:
        print(f"Error saving project: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save-progress")
async def save_progress(request: SaveProgressRequest):
    """
    Save project progress (current step and step completion status).
    
    This updates project.json with currentStep and steps state.
    """
    try:
        project_dir = get_project_dir(request.projectId)
        project_path = project_dir / "project.json"
        
        if not project_path.exists():
            return {"success": False, "error": f"Project not found: {request.projectId}"}
        
        # Load existing project data
        with open(project_path, "r") as f:
            project_data = json.load(f)
        
        # Update progress fields
        project_data["currentStep"] = request.currentStep
        project_data["steps"] = {k: v.dict() for k, v in request.steps.items()}
        project_data["updatedAt"] = datetime.now().isoformat()
        
        # Save updated project.json
        with open(project_path, "w") as f:
            json.dump(project_data, f, indent=2)
        
        print(f"✓ Progress saved: step {request.currentStep}, {len(request.steps)} completed steps")
        
        return {
            "success": True,
            "currentStep": request.currentStep,
            "stepsCompleted": len([s for s in request.steps.values() if s.completed])
        }
        
    except Exception as e:
        print(f"Error saving progress: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


@router.get("/load/{project_id}")
async def load_project(project_id: str):
    """
    Load project data from disk.
    
    Returns project metadata and segmentation data.
    """
    try:
        project_dir = get_project_dir(project_id)
        project_path = project_dir / "project.json"
        
        if not project_path.exists():
            return ProjectLoadResponse(
                success=False,
                error=f"Project not found: {project_id}"
            )
        
        # Load project metadata
        with open(project_path, "r") as f:
            project_data = json.load(f)
        
        # Load segmentations
        seg_dir = project_dir / "segmentations"
        seg_index_path = seg_dir / "index.json"
        
        segmentations = []
        groups = []
        
        if seg_index_path.exists():
            with open(seg_index_path, "r") as f:
                index_data = json.load(f)
            
            # Handle both old format (list) and new format (dict with 'segmentations' key)
            if isinstance(index_data, list):
                seg_refs = index_data
            else:
                seg_refs = index_data.get("segmentations", [])
                groups = index_data.get("groups", [])
            
            for seg_ref in seg_refs:
                seg_data = seg_ref.copy()
                
                # Load mask from file if available
                if "maskFile" in seg_ref:
                    mask_path = seg_dir / seg_ref["maskFile"]
                    if mask_path.exists():
                        with open(mask_path, "rb") as f:
                            mask_bytes = f.read()
                        seg_data["maskBase64"] = f"data:image/png;base64,{base64.b64encode(mask_bytes).decode()}"
                
                segmentations.append(seg_data)
        
        project_data["segmentations"] = segmentations
        project_data["segmentationGroups"] = groups
        
        # Include ROI if it exists in the segmentation index
        if seg_index_path.exists():
            with open(seg_index_path, "r") as f:
                seg_index_data = json.load(f)
            if isinstance(seg_index_data, dict) and "roi" in seg_index_data:
                project_data["roi"] = seg_index_data["roi"]
        
        # Load projections from project folder
        proj_dir = project_dir / "projections"
        proj_index_path = proj_dir / "index.json"
        
        projections = []
        if proj_index_path.exists():
            with open(proj_index_path, "r") as f:
                proj_index = json.load(f)
            
            proj_refs = proj_index.get("projections", [])
            
            for proj_ref in proj_refs:
                proj_data = proj_ref.copy()
                
                # Load images as base64 if files exist
                files = proj_ref.get("files", {})
                images = {}
                
                for img_type, filename in files.items():
                    if img_type in ["colour", "depthGrayscale", "depthPlasma"]:
                        img_path = proj_dir / filename
                        if img_path.exists():
                            with open(img_path, "rb") as f:
                                img_bytes = f.read()
                            images[img_type] = f"data:image/png;base64,{base64.b64encode(img_bytes).decode()}"
                
                proj_data["images"] = images
                projections.append(proj_data)
        
        project_data["projections"] = projections
        
        return ProjectLoadResponse(
            success=True,
            project=project_data
        )
        
    except Exception as e:
        print(f"Error loading project: {e}")
        return ProjectLoadResponse(
            success=False,
            error=str(e)
        )


@router.get("/list")
async def list_projects():
    """List all saved projects."""
    try:
        projects_dir = PROJECT_DATA_DIR / "projects"
        
        if not projects_dir.exists():
            return {"projects": []}
        
        projects = []
        for project_dir in projects_dir.iterdir():
            if project_dir.is_dir():
                project_path = project_dir / "project.json"
                if project_path.exists():
                    with open(project_path, "r") as f:
                        project_data = json.load(f)
                    projects.append({
                        "id": project_data.get("id"),
                        "name": project_data.get("name"),
                        "updatedAt": project_data.get("updatedAt"),
                        "segmentationCount": project_data.get("segmentationCount", 0),
                    })
        
        # Sort by updated time
        projects.sort(key=lambda p: p.get("updatedAt", ""), reverse=True)
        
        return {"projects": projects}
        
    except Exception as e:
        print(f"Error listing projects: {e}")
        return {"projects": [], "error": str(e)}


@router.delete("/delete/{project_id}")
async def delete_project(project_id: str):
    """
    Delete a project and all its associated files.
    
    This removes the entire project directory including:
    - project.json
    - projections/
    - segmentations/
    """
    import shutil
    
    try:
        project_dir = get_project_dir(project_id)
        
        if not project_dir.exists():
            return {"success": False, "error": "Project not found"}
        
        # Get project name for logging before deletion
        project_path = project_dir / "project.json"
        project_name = project_id
        if project_path.exists():
            with open(project_path, "r") as f:
                project_data = json.load(f)
                project_name = project_data.get("name", project_id)
        
        # Remove the entire project directory
        shutil.rmtree(project_dir)
        
        print(f"✓ Deleted project '{project_name}' ({project_id})")
        
        return {"success": True, "projectId": project_id, "name": project_name}
        
    except Exception as e:
        print(f"Error deleting project {project_id}: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


@router.get("/segmentations/{project_id}")
async def get_segmentations(project_id: str):
    """
    Get segmentation data for a project.
    
    Returns all segmentations with their mask data and group information.
    """
    try:
        project_dir = get_project_dir(project_id)
        seg_dir = project_dir / "segmentations"
        seg_index_path = seg_dir / "index.json"
        
        if not seg_index_path.exists():
            return {"success": True, "segmentations": [], "groups": []}
        
        with open(seg_index_path, "r") as f:
            index_data = json.load(f)
        
        # Handle both old format (list) and new format (dict with 'segmentations' key)
        if isinstance(index_data, list):
            seg_refs = index_data
            groups = []
        else:
            seg_refs = index_data.get("segmentations", [])
            groups = index_data.get("groups", [])
        
        segmentations = []
        for seg_ref in seg_refs:
            seg_data = seg_ref.copy()
            
            # Load mask from file if available
            if "maskFile" in seg_ref:
                mask_path = seg_dir / seg_ref["maskFile"]
                if mask_path.exists():
                    with open(mask_path, "rb") as f:
                        mask_bytes = f.read()
                    seg_data["maskBase64"] = f"data:image/png;base64,{base64.b64encode(mask_bytes).decode()}"
            
            segmentations.append(seg_data)
        
        return {
            "success": True, 
            "segmentations": segmentations,
            "groups": groups,
            "combinedMaskFile": index_data.get("combinedMaskFile") if isinstance(index_data, dict) else None,
        }
        
    except Exception as e:
        print(f"Error getting segmentations: {e}")
        return {"success": False, "error": str(e), "segmentations": [], "groups": []}


class ROIData(BaseModel):
    """Region of Interest data with rotation support."""
    x: float  # Center X (in pixels)
    y: float  # Center Y (in pixels)
    width: float
    height: float
    rotation: float = 0.0  # Rotation angle in degrees
    corners: Optional[List[List[float]]] = None  # 4 corners [[x,y], ...]


class SaveROIRequest(BaseModel):
    """Request to save ROI for a project."""
    projectId: str
    roi: ROIData


def point_in_rotated_rect(px: float, py: float, roi: dict) -> bool:
    """
    Check if a point is inside a rotated rectangle.
    
    Args:
        px, py: Point coordinates
        roi: ROI dict with x, y (center), width, height, rotation
    
    Returns:
        True if point is inside the ROI
    """
    import math
    
    cx, cy = roi["x"], roi["y"]
    w, h = roi["width"], roi["height"]
    angle = math.radians(-roi.get("rotation", 0))  # Negative for inverse rotation
    
    # Translate point to ROI center
    dx = px - cx
    dy = py - cy
    
    # Rotate point by negative angle (inverse rotation)
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)
    local_x = dx * cos_a - dy * sin_a
    local_y = dx * sin_a + dy * cos_a
    
    # Check if in axis-aligned rectangle
    return abs(local_x) <= w / 2 and abs(local_y) <= h / 2


def _roi_corners_from_params(roi: dict) -> List[List[float]]:
    """Compute 4 ROI corners from centre/size/rotation when explicit corners are absent."""
    import math

    cx = float(roi.get("x", 0.0))
    cy = float(roi.get("y", 0.0))
    w = float(roi.get("width", 0.0))
    h = float(roi.get("height", 0.0))
    angle = math.radians(float(roi.get("rotation", 0.0)))
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)
    hw = w / 2.0
    hh = h / 2.0
    local = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
    return [[cx + dx * cos_a - dy * sin_a, cy + dx * sin_a + dy * cos_a] for dx, dy in local]


def _roi_polygon(roi: dict) -> List[List[float]]:
    """Return ROI polygon, preferring explicit corners if present."""
    corners = roi.get("corners")
    if isinstance(corners, list) and len(corners) == 4:
        try:
            parsed = [[float(p[0]), float(p[1])] for p in corners]
            return parsed
        except Exception:
            pass
    return _roi_corners_from_params(roi)


def _roi_polygon_variants_for_image(roi: dict, img_w: int, img_h: int) -> List[List[List[float]]]:
    """Generate plausible ROI polygons for the mask image coordinate space."""
    poly = _roi_polygon(roi)
    variants: List[List[List[float]]] = [poly]

    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    max_abs = max([1.0] + [abs(v) for v in xs + ys])

    # Variant 1: ROI stored in unit space [0..1] -> image pixels.
    if max_abs <= 2.0:
        variants.append([[x * img_w, y * img_h] for x, y in poly])

    # Variant 2: ROI stored in a larger pixel frame (e.g. 2048) than current mask.
    # Downscale uniformly to fit mask extent.
    limit = float(max(img_w, img_h))
    if max_abs > limit * 1.2:
        scale = limit / max_abs
        variants.append([[x * scale, y * scale] for x, y in poly])

    # Deduplicate near-identical variants
    unique: List[List[List[float]]] = []
    seen = set()
    for v in variants:
        key = tuple((round(p[0], 2), round(p[1], 2)) for p in v)
        if key in seen:
            continue
        seen.add(key)
        unique.append(v)
    return unique


def _bbox_to_xywh_candidates(bbox: List[float]) -> List[List[float]]:
    """
    Build plausible bbox interpretations.
    Input may be [x,y,w,h] or [x1,y1,x2,y2].
    """
    if not bbox or len(bbox) < 4:
        return []
    x1, y1, a, b = [float(v) for v in bbox[:4]]
    candidates: List[List[float]] = []

    # As [x,y,w,h]
    if a > 0 and b > 0:
        candidates.append([x1, y1, a, b])

    # As [x1,y1,x2,y2]
    w2 = a - x1
    h2 = b - y1
    if w2 > 0 and h2 > 0:
        candidates.append([x1, y1, w2, h2])

    return candidates


def bbox_overlaps_roi(bbox: List[int], roi: dict) -> bool:
    """Fallback inside test using bbox points against rotated ROI."""
    if not bbox or len(bbox) < 4:
        return False

    for bx, by, bw, bh in _bbox_to_xywh_candidates([float(v) for v in bbox]):
        points = [
            (bx + bw / 2.0, by + bh / 2.0),  # centre
            (bx, by),                        # corners
            (bx + bw, by),
            (bx + bw, by + bh),
            (bx, by + bh),
        ]
        if any(point_in_rotated_rect(px, py, roi) for px, py in points):
            return True
    return False


def _mask_inside_roi(seg: dict, roi: dict, seg_dir: Path, overlap_threshold: float = 0.05) -> Optional[bool]:
    """
    Determine insideRoi by pixel overlap between saved mask image and ROI polygon.
    Returns None when mask image is unavailable.
    """
    mask_file = seg.get("maskFile")
    if not isinstance(mask_file, str):
        return None
    mask_path = seg_dir / mask_file
    if not mask_path.exists():
        return None

    try:
        from PIL import Image, ImageDraw
        import numpy as np

        with Image.open(mask_path).convert("RGBA") as img:
            w, h = img.size
            arr = np.array(img)

        # Use alpha as primary signal; fallback to RGB non-black.
        alpha = arr[:, :, 3]
        rgb_sum = arr[:, :, 0] + arr[:, :, 1] + arr[:, :, 2]
        mask_pixels = (alpha > 0) | (rgb_sum > 0)
        mask_count = int(mask_pixels.sum())
        if mask_count == 0:
            return False

        best_overlap_ratio = 0.0
        for roi_poly in _roi_polygon_variants_for_image(roi, w, h):
            roi_img = Image.new("L", (w, h), 0)
            draw = ImageDraw.Draw(roi_img)
            draw.polygon([(float(x), float(y)) for x, y in roi_poly], fill=255)
            roi_pixels = np.array(roi_img) > 0
            overlap = int((mask_pixels & roi_pixels).sum())
            overlap_ratio = overlap / mask_count
            if overlap_ratio > best_overlap_ratio:
                best_overlap_ratio = overlap_ratio

        return best_overlap_ratio >= overlap_threshold
    except Exception as e:
        print(f"Warning: failed ROI overlap check from maskFile '{mask_file}': {e}")
        return None


@router.post("/save-roi")
async def save_roi(request: SaveROIRequest):
    """
    Save Region of Interest (ROI) for a project and update all segmentations
    with insideRoi flag.
    
    The ROI is stored in segmentations/index.json. Each segmentation receives
    insideRoi=true/false using pixel overlap against the saved mask image
    when available, with bbox-based fallback.
    """
    try:
        project_dir = get_project_dir(request.projectId)
        seg_dir = project_dir / "segmentations"
        seg_index_path = seg_dir / "index.json"
        
        if not seg_index_path.exists():
            return {"success": False, "error": "Segmentation index not found"}
        
        # Load current index
        with open(seg_index_path, "r") as f:
            index_data = json.load(f)
        
        # Build ROI dict
        roi_dict = {
            "x": request.roi.x,
            "y": request.roi.y,
            "width": request.roi.width,
            "height": request.roi.height,
            "rotation": request.roi.rotation,
            "corners": request.roi.corners,
        }
        
        # Save ROI at top level
        index_data["roi"] = roi_dict
        
        # Update each segmentation with insideRoi flag
        segmentations = index_data.get("segmentations", [])
        inside_count = 0
        outside_count = 0
        
        for seg in segmentations:
            # Prefer robust pixel-overlap classification using mask image.
            overlap_inside = _mask_inside_roi(seg, roi_dict, seg_dir)
            if overlap_inside is None:
                bbox = seg.get("bbox")
                overlap_inside = bbox_overlaps_roi(bbox, roi_dict) if bbox else False

            seg["insideRoi"] = bool(overlap_inside)
            if seg["insideRoi"]:
                inside_count += 1
            else:
                outside_count += 1
        
        index_data["segmentations"] = segmentations
        
        # Also update group summaries with counts
        groups = index_data.get("groups", [])
        for group in groups:
            group_id = group.get("groupId")
            group_segs = [s for s in segmentations if s.get("groupId") == group_id]
            group["insideRoiCount"] = sum(1 for s in group_segs if s.get("insideRoi"))
            group["outsideRoiCount"] = sum(1 for s in group_segs if not s.get("insideRoi"))
        
        index_data["groups"] = groups
        
        # Save updated index
        with open(seg_index_path, "w") as f:
            json.dump(index_data, f, indent=2)
        
        print(f"✓ Saved ROI: ({request.roi.x:.1f}, {request.roi.y:.1f}) {request.roi.width:.1f}x{request.roi.height:.1f} @ {request.roi.rotation:.1f}°")
        print(f"  → {inside_count} masks inside ROI, {outside_count} outside")
        
        return {
            "success": True,
            "insideCount": inside_count,
            "outsideCount": outside_count,
        }
        
    except Exception as e:
        print(f"Error saving ROI: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


class ReprojectionPreviewRequest(BaseModel):
    """Request to generate reprojection preview."""
    projectId: str
    groupIds: Optional[List[str]] = None  # Which mask groups to show (e.g., ["rib", "boss_stone"])
    maxPoints: int = 500000  # Limit for preview (subsample if needed)
    showUnmaskedPoints: bool = True  # Whether to show points not in any mask


@router.post("/reproject-preview")
async def reproject_preview(request: ReprojectionPreviewRequest):
    """
    Apply segmentation masks to the original E57 point cloud.
    
    This projects each original 3D point to 2D, checks which mask group it falls into,
    and colors it accordingly. This preserves the original point density.
    """
    import numpy as np
    from PIL import Image
    import io
    from services.e57_processor import get_processor
    
    try:
        project_dir = get_project_dir(request.projectId)
        
        # Load project metadata
        project_path = project_dir / "project.json"
        if not project_path.exists():
            return {"success": False, "error": "Project not found"}
        
        with open(project_path, "r") as f:
            project_data = json.load(f)
        
        # Get the original E57 path
        e57_path = project_data.get("e57Path")
        if not e57_path or not Path(e57_path).exists():
            return {"success": False, "error": f"E57 file not found: {e57_path}"}
        
        print(f"Loading original E57: {e57_path}")
        
        # Load projection metadata
        proj_dir = project_dir / "projections"
        proj_index_path = proj_dir / "index.json"
        
        if not proj_index_path.exists():
            return {"success": False, "error": "No projections found"}
        
        with open(proj_index_path, "r") as f:
            proj_index = json.load(f)
        
        projections = proj_index.get("projections", [])
        if not projections:
            return {"success": False, "error": "No projections found"}
        
        # Use first projection
        proj = projections[0]
        
        # Load projection metadata
        metadata_file = proj.get("files", {}).get("metadata")
        if metadata_file:
            metadata_path = proj_dir / metadata_file
            if metadata_path.exists():
                with open(metadata_path, "r") as f:
                    proj_metadata = json.load(f)
            else:
                proj_metadata = proj.get("metadata", {})
        else:
            proj_metadata = proj.get("metadata", {})
        
        resolution = proj_metadata.get("resolution", 2048)
        bounds = proj_metadata.get("bounds", {})
        centroid = np.array(proj_metadata.get("centroid", [0, 0, 0]))
        perspective = proj_metadata.get("perspective", "bottom")
        bottom_up = proj_metadata.get("bottom_up", True)
        
        # Get bounds (these are the projected bounds after perspective transform)
        min_x = bounds.get("min_x", -5)
        max_x = bounds.get("max_x", 5)
        min_y = bounds.get("min_y", -5)
        max_y = bounds.get("max_y", 5)
        
        print(f"  Projection: resolution={resolution}, perspective={perspective}, bottom_up={bottom_up}")
        print(f"  Centroid: {centroid}")
        print(f"  Bounds: X=[{min_x:.3f}, {max_x:.3f}], Y=[{min_y:.3f}, {max_y:.3f}]")
        
        # Load segmentation index
        seg_dir = project_dir / "segmentations"
        seg_index_path = seg_dir / "index.json"
        
        if not seg_index_path.exists():
            return {"success": False, "error": "No segmentations found"}
        
        with open(seg_index_path, "r") as f:
            seg_index = json.load(f)
        
        # Get available groups
        groups = seg_index.get("groups", [])
        available_groups = {g["groupId"]: g for g in groups}
        print(f"  Available mask groups: {list(available_groups.keys())}")
        
        # Filter groups based on request
        # Note: groupIds=None means "all groups", groupIds=[] means "no groups"
        if request.groupIds is None:
            selected_groups = groups  # All groups
        elif len(request.groupIds) == 0:
            selected_groups = []  # No groups - user wants to show only unmasked points
        else:
            selected_groups = [g for g in groups if g["groupId"] in request.groupIds]
        
        print(f"  Selected groups: {[g['groupId'] for g in selected_groups]}")
        
        # Load the combined mask for each selected group
        # Each group has a pre-combined mask file
        group_masks = {}
        for group in selected_groups:
            group_id = group["groupId"]
            mask_file = group.get("combinedMaskFile")
            if not mask_file:
                continue
            
            mask_path = seg_dir / mask_file
            if not mask_path.exists():
                print(f"  Warning: Mask file not found: {mask_path}")
                continue
            
            # Load mask - use alpha channel for RGBA images
            mask_img = Image.open(mask_path)
            if mask_img.mode == 'RGBA':
                mask_array = np.array(mask_img)[:, :, 3]  # Alpha channel
            elif mask_img.mode == 'LA':
                mask_array = np.array(mask_img)[:, :, 1]
            else:
                mask_array = np.array(mask_img.convert("L"))
            
            # Parse color
            color_hex = group.get("color", "#FF0000")
            r = int(color_hex[1:3], 16)
            g = int(color_hex[3:5], 16)
            b = int(color_hex[5:7], 16)
            
            group_masks[group_id] = {
                "mask": mask_array,
                "color": (r, g, b),
                "label": group.get("label", group_id),
            }
            print(f"  Loaded group mask: {group_id} ({mask_array.shape}, color={color_hex})")
        
        # If no groups selected and no unmasked points requested, we still need to show something
        if not group_masks and not request.showUnmaskedPoints:
            return {"success": False, "error": "No mask groups selected and unmasked points disabled"}
        
        # Load the original E57 point cloud
        processor = get_processor()
        
        # Check if already loaded, otherwise load it
        if processor.current_file != e57_path or processor.points is None:
            print(f"  Loading E57 file...")
            await processor.load_file(e57_path)
        else:
            print(f"  Using cached E57 data")
        
        if processor.points is None or len(processor.points) == 0:
            return {"success": False, "error": "Failed to load E57 file - no points found"}
        
        original_points = processor.points
        original_colors = processor.colors
        total_points = len(original_points)
        
        print(f"  Loaded E57: {total_points:,} points")
        
        # Subsample if needed for preview
        if total_points > request.maxPoints:
            indices = np.random.choice(total_points, request.maxPoints, replace=False)
            indices = np.sort(indices)  # Keep order for consistency
            points_subset = original_points[indices]
            colors_subset = original_colors[indices] if original_colors is not None else None
            print(f"  Subsampled to {len(points_subset):,} points")
        else:
            points_subset = original_points
            colors_subset = original_colors
            indices = np.arange(total_points)
        
        # Center points (same as projection did)
        centred_points = points_subset - centroid
        
        # Project each 3D point to 2D pixel coordinates
        # Apply perspective transformation (same as in projection_gaussian_utils.py)
        if perspective == "top":
            proj_x = centred_points[:, 0]
            proj_y = centred_points[:, 1]
        elif perspective == "bottom":
            proj_x = centred_points[:, 0]
            proj_y = -centred_points[:, 1]
        elif perspective == "north":
            proj_x = centred_points[:, 0]
            proj_y = centred_points[:, 2]
        elif perspective == "south":
            proj_x = -centred_points[:, 0]
            proj_y = centred_points[:, 2]
        elif perspective == "east":
            proj_x = -centred_points[:, 1]
            proj_y = centred_points[:, 2]
        elif perspective == "west":
            proj_x = centred_points[:, 1]
            proj_y = centred_points[:, 2]
        else:
            proj_x = centred_points[:, 0]
            proj_y = centred_points[:, 1]
        
        if bottom_up:
            proj_y = -proj_y
        
        # Map to pixel coordinates (same logic as in projection)
        range_x = max_x - min_x
        range_y = max_y - min_y
        max_range = max(range_x, range_y) if max(range_x, range_y) > 0 else 1.0
        
        margin = 0.05
        effective_res = int(resolution * (1 - 2 * margin))
        offset = int(resolution * margin)
        
        center_x = (min_x + max_x) / 2
        center_y = (min_y + max_y) / 2
        
        px = ((proj_x - center_x) / max_range + 0.5) * effective_res + offset
        py = ((proj_y - center_y) / max_range + 0.5) * effective_res + offset
        
        # Clip to valid pixel range
        px_int = np.clip(px.astype(np.int32), 0, resolution - 1)
        py_int = np.clip(py.astype(np.int32), 0, resolution - 1)
        
        # Check each point against masks and assign colors
        result_points = []
        masked_count = 0
        unmasked_count = 0
        group_counts = {gid: 0 for gid in group_masks.keys()}
        
        for i in range(len(points_subset)):
            px_i = px_int[i]
            py_i = py_int[i]
            
            # Check which group mask this point falls into
            point_group = None
            point_color = None
            
            for group_id, group_data in group_masks.items():
                mask = group_data["mask"]
                if py_i < mask.shape[0] and px_i < mask.shape[1]:
                    if mask[py_i, px_i] > 127:
                        point_group = group_id
                        point_color = group_data["color"]
                        group_counts[group_id] += 1
                        break
            
            if point_group:
                # Point is in a mask - use mask color
                masked_count += 1
                result_points.append({
                    "x": float(points_subset[i, 0]),
                    "y": float(points_subset[i, 1]),
                    "z": float(points_subset[i, 2]),
                    "r": point_color[0],
                    "g": point_color[1],
                    "b": point_color[2],
                    "label": point_group,
                })
            elif request.showUnmaskedPoints:
                # Point is not in any mask - use original color
                unmasked_count += 1
                if colors_subset is not None:
                    c = colors_subset[i]
                    # Handle both 0-1 and 0-255 color ranges
                    if c.max() <= 1.0:
                        r, g, b = int(c[0] * 255), int(c[1] * 255), int(c[2] * 255)
                    else:
                        r, g, b = int(c[0]), int(c[1]), int(c[2])
                else:
                    r, g, b = 180, 170, 150  # Stone color fallback
                
                result_points.append({
                    "x": float(points_subset[i, 0]),
                    "y": float(points_subset[i, 1]),
                    "z": float(points_subset[i, 2]),
                    "r": r,
                    "g": g,
                    "b": b,
                    "label": "",
                })
        
        print(f"✓ Applied masks to E57 point cloud:")
        print(f"  - Total points processed: {len(points_subset):,}")
        print(f"  - Masked points: {masked_count:,}")
        print(f"  - Unmasked points: {unmasked_count:,}")
        for gid, count in group_counts.items():
            print(f"  - {gid}: {count:,} points")
        
        return {
            "success": True,
            "points": result_points,
            "total": len(result_points),
            "originalTotal": total_points,
            "maskedCount": masked_count,
            "unmaskedCount": unmasked_count,
            "groupCounts": group_counts,
            "availableGroups": list(available_groups.keys()),
            "selectedGroups": [g["groupId"] for g in selected_groups],
        }
        
    except Exception as e:
        print(f"Error generating reprojection preview: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


class ExclusionBox(BaseModel):
    """3D box to exclude points from intrados tracing."""
    minX: float
    maxX: float
    minY: float
    maxY: float
    minZ: float
    maxZ: float
    enabled: bool = True


class IntradosTraceRequest(BaseModel):
    """Request to trace intrados lines for rib masks."""
    projectId: str
    ribMaskIds: Optional[List[str]] = None  # Specific rib mask IDs, or None for all ribs
    numSlices: int = 50  # Number of slices per rib for tracing
    depthPercentile: float = 25.0  # Percentile of Z values to use (25 = lower quartile, robust)
    outlierThreshold: float = 1.5  # IQR multiplier to filter global outliers
    continuityThreshold: float = 0.15  # Max Z deviation from neighbors (fraction of rib Z range)
    maxStepMeters: float = 0.5  # Maximum allowed step between consecutive points in meters
    # Exclusion parameters
    floorPlaneZ: Optional[float] = None  # Exclude points below this Z value
    exclusionBox: Optional[ExclusionBox] = None  # Exclude points inside this box


@router.post("/trace-intrados")
async def trace_intrados(request: IntradosTraceRequest):
    """
    Trace the intrados (center) lines for rib masks.
    
    The intrados line is the center line running along the lowest/shallowest
    points of each rib's curved profile.
    """
    import numpy as np
    from PIL import Image
    from services.e57_processor import get_processor
    from services.intrados_tracer import trace_all_rib_intrados
    
    try:
        project_dir = get_project_dir(request.projectId)
        
        # Load project metadata
        project_path = project_dir / "project.json"
        if not project_path.exists():
            return {"success": False, "error": "Project not found"}
        
        with open(project_path, "r") as f:
            project_data = json.load(f)
        
        # Get the original E57 path
        e57_path = project_data.get("e57Path")
        if not e57_path or not Path(e57_path).exists():
            return {"success": False, "error": f"E57 file not found: {e57_path}"}
        
        print(f"Tracing intrados lines for project: {request.projectId}")
        print(f"  E57: {e57_path}")
        
        # Load projection metadata
        proj_dir = project_dir / "projections"
        proj_index_path = proj_dir / "index.json"
        
        if not proj_index_path.exists():
            return {"success": False, "error": "No projections found"}
        
        with open(proj_index_path, "r") as f:
            proj_index = json.load(f)
        
        projections = proj_index.get("projections", [])
        if not projections:
            return {"success": False, "error": "No projections found"}
        
        proj = projections[0]
        
        # Load projection metadata
        metadata_file = proj.get("files", {}).get("metadata")
        if metadata_file:
            metadata_path = proj_dir / metadata_file
            if metadata_path.exists():
                with open(metadata_path, "r") as f:
                    proj_metadata = json.load(f)
            else:
                proj_metadata = proj.get("metadata", {})
        else:
            proj_metadata = proj.get("metadata", {})
        
        centroid = np.array(proj_metadata.get("centroid", [0, 0, 0]))
        
        # Load segmentation index
        seg_dir = project_dir / "segmentations"
        seg_index_path = seg_dir / "index.json"
        
        if not seg_index_path.exists():
            return {"success": False, "error": "No segmentations found"}
        
        with open(seg_index_path, "r") as f:
            seg_index = json.load(f)
        
        segmentations = seg_index.get("segmentations", [])
        
        # Filter for rib segmentations only
        rib_segmentations = [
            s for s in segmentations 
            if s.get("groupId", "").lower() == "rib" or "rib" in s.get("label", "").lower()
        ]
        
        # Further filter by specific IDs if provided
        if request.ribMaskIds:
            rib_segmentations = [s for s in rib_segmentations if s.get("id") in request.ribMaskIds]
        
        if not rib_segmentations:
            return {"success": False, "error": "No rib segmentations found"}
        
        print(f"  Found {len(rib_segmentations)} rib segmentations")
        
        # Load the individual rib masks
        rib_masks = {}
        for seg in rib_segmentations:
            mask_file = seg.get("maskFile")
            if not mask_file:
                continue
            
            mask_path = seg_dir / mask_file
            if not mask_path.exists():
                continue
            
            # Load mask - use alpha channel for RGBA images
            mask_img = Image.open(mask_path)
            if mask_img.mode == 'RGBA':
                mask_array = np.array(mask_img)[:, :, 3]
            elif mask_img.mode == 'LA':
                mask_array = np.array(mask_img)[:, :, 1]
            else:
                mask_array = np.array(mask_img.convert("L"))
            
            rib_masks[seg.get("id")] = mask_array
        
        if not rib_masks:
            return {"success": False, "error": "Could not load any rib masks"}
        
        print(f"  Loaded {len(rib_masks)} rib masks")
        
        # Load the E57 point cloud
        processor = get_processor()
        
        if processor.current_file != e57_path or processor.points is None:
            print(f"  Loading E57 file...")
            await processor.load_file(e57_path)
        else:
            print(f"  Using cached E57 data")
        
        if processor.points is None or len(processor.points) == 0:
            return {"success": False, "error": "Failed to load E57 file"}
        
        print(f"  E57 loaded: {len(processor.points)} points")
        
        # Trace intrados lines for all rib masks
        # Prepare exclusion box if provided
        exclusion_box_dict = None
        if request.exclusionBox:
            exclusion_box_dict = {
                "minX": request.exclusionBox.minX,
                "maxX": request.exclusionBox.maxX,
                "minY": request.exclusionBox.minY,
                "maxY": request.exclusionBox.maxY,
                "minZ": request.exclusionBox.minZ,
                "maxZ": request.exclusionBox.maxZ,
                "enabled": request.exclusionBox.enabled,
            }
        
        intrados_results = trace_all_rib_intrados(
            e57_points=processor.points,
            e57_colors=processor.colors,
            rib_masks=rib_masks,
            projection_metadata=proj_metadata,
            centroid=centroid,
            num_slices=request.numSlices,
            depth_percentile=request.depthPercentile,
            outlier_threshold=request.outlierThreshold,
            continuity_threshold=request.continuityThreshold,
            max_step_meters=request.maxStepMeters,
            floor_plane_z=request.floorPlaneZ,
            exclusion_box=exclusion_box_dict
        )
        
        if not intrados_results:
            return {"success": False, "error": "Could not trace any intrados lines"}
        
        # Build result with segmentation metadata
        lines = []
        for seg in rib_segmentations:
            seg_id = seg.get("id")
            if seg_id in intrados_results:
                result = intrados_results[seg_id]
                lines.append({
                    "id": seg_id,
                    "label": seg.get("label", ""),
                    "color": seg.get("color", "#FF0000"),
                    "points3d": result["points_3d"],
                    "points2d": result["points_2d"],
                    "pointCount": result["point_count"],
                    "lineLength": result["line_length"],
                })
        
        # Save intrados data to project
        intrados_path = seg_dir / "intrados_lines.json"
        intrados_data = {
            "lines": lines,
            "numSlices": request.numSlices,
            "totalLines": len(lines),
            "totalRibs": len(rib_segmentations),
        }
        with open(intrados_path, "w") as f:
            json.dump(intrados_data, f, indent=2)
        
        print(f"✓ Traced {len(lines)} intrados lines from {len(rib_segmentations)} ribs")
        print(f"  Saved to: {intrados_path}")
        
        # Verify save
        if intrados_path.exists():
            print(f"  File saved successfully: {intrados_path.stat().st_size} bytes")
        else:
            print(f"  WARNING: File was not saved!")
        
        return {
            "success": True,
            "data": {
                "lines": lines,
                "totalLines": len(lines),
                "totalRibs": len(rib_segmentations),
            }
        }
        
    except Exception as e:
        print(f"Error tracing intrados: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


@router.get("/{project_id}/intrados-lines")
async def get_intrados_lines(project_id: str):
    """Get saved intrados lines for a project."""
    try:
        project_dir = get_project_dir(project_id)
        intrados_path = project_dir / "segmentations" / "intrados_lines.json"
        
        print(f"Getting intrados lines for project: {project_id}")
        print(f"  Looking for: {intrados_path}")
        print(f"  Exists: {intrados_path.exists()}")
        
        if not intrados_path.exists():
            print(f"  No intrados file found")
            return {
                "success": True,
                "data": {
                    "lines": [],
                    "totalLines": 0,
                    "totalRibs": 0,
                }
            }
        
        with open(intrados_path, "r") as f:
            data = json.load(f)
        
        lines = data.get("lines", [])
        print(f"  Found {len(lines)} intrados lines")
        
        return {
            "success": True,
            "data": {
                "lines": lines,
                "totalLines": data.get("totalLines", len(lines)),
                "totalRibs": data.get("totalRibs", 0),
            }
        }
        
    except Exception as e:
        print(f"Error getting intrados lines: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


# =====================================================
# Rhino 3DM Export/Import Endpoints
# =====================================================

class Export3dmRequest(BaseModel):
    """Request to export intrados lines as 3DM."""
    projectId: str
    layerName: str = "Intrados Lines"


@router.post("/{project_id}/export-3dm")
async def export_intrados_3dm(project_id: str, request: Export3dmRequest):
    """
    Export intrados lines to a Rhino 3DM file.
    Returns the file path for download.
    """
    from services.rhino_exporter import export_intrados_to_3dm, RHINO3DM_AVAILABLE
    
    if not RHINO3DM_AVAILABLE:
        return {
            "success": False, 
            "error": "rhino3dm library not installed. Run: pip install rhino3dm"
        }
    
    try:
        # Load intrados lines
        project_dir = get_project_dir(project_id)
        intrados_path = project_dir / "segmentations" / "intrados_lines.json"
        
        if not intrados_path.exists():
            return {
                "success": False,
                "error": "No intrados lines found. Generate them first on the Reprojection page."
            }
        
        with open(intrados_path, "r") as f:
            data = json.load(f)
        
        lines = data.get("lines", [])
        if not lines:
            return {
                "success": False,
                "error": "No intrados lines to export."
            }
        
        # Create exports directory
        exports_dir = project_dir / "exports"
        exports_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"intrados_traces_{timestamp}.3dm"
        output_path = exports_dir / output_filename
        
        # Export to 3DM
        result = export_intrados_to_3dm(
            intrados_lines=lines,
            output_path=str(output_path),
            layer_name=request.layerName
        )
        
        if result["success"]:
            return {
                "success": True,
                "filePath": str(output_path),
                "fileName": output_filename,
                "curvesExported": result.get("curvesExported", 0),
                "message": f"Exported {result.get('curvesExported', 0)} intrados curves"
            }
        else:
            return result
            
    except Exception as e:
        print(f"Error exporting 3DM: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


class Import3dmRequest(BaseModel):
    """Request to import curves from a 3DM file."""
    filePath: str
    layerFilter: Optional[str] = None


@router.post("/{project_id}/import-3dm")
async def import_3dm_traces(project_id: str, request: Import3dmRequest):
    """
    Import curves from a Rhino 3DM file as manual traces.
    """
    from services.rhino_exporter import import_3dm_curves, RHINO3DM_AVAILABLE
    
    if not RHINO3DM_AVAILABLE:
        return {
            "success": False, 
            "error": "rhino3dm library not installed. Run: pip install rhino3dm"
        }
    
    try:
        # Verify file exists
        if not Path(request.filePath).exists():
            return {
                "success": False,
                "error": f"File not found: {request.filePath}"
            }
        
        # Import curves
        result = import_3dm_curves(
            file_path=request.filePath,
            layer_filter=request.layerFilter
        )
        
        if result["success"]:
            # Save imported traces
            project_dir = get_project_dir(project_id)
            traces_dir = project_dir / "traces"
            traces_dir.mkdir(parents=True, exist_ok=True)
            
            imported_traces_path = traces_dir / "imported_traces.json"
            with open(imported_traces_path, "w") as f:
                json.dump({
                    "source": request.filePath,
                    "curves": result["curves"],
                    "importedAt": datetime.now().isoformat()
                }, f, indent=2)
            
            return {
                "success": True,
                "curves": result["curves"],
                "curveCount": result.get("curveCount", 0),
                "layers": result.get("layers", []),
                "message": f"Imported {result.get('curveCount', 0)} curves"
            }
        else:
            return result
            
    except Exception as e:
        print(f"Error importing 3DM: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


@router.get("/{project_id}/imported-traces")
async def get_imported_traces(project_id: str):
    """Get previously imported manual traces for a project."""
    try:
        project_dir = get_project_dir(project_id)
        traces_path = project_dir / "traces" / "imported_traces.json"
        
        if not traces_path.exists():
            return {
                "success": True,
                "data": {
                    "curves": [],
                    "curveCount": 0
                }
            }
        
        with open(traces_path, "r") as f:
            data = json.load(f)
        
        return {
            "success": True,
            "data": {
                "curves": data.get("curves", []),
                "curveCount": len(data.get("curves", [])),
                "source": data.get("source"),
                "importedAt": data.get("importedAt")
            }
        }
        
    except Exception as e:
        print(f"Error getting imported traces: {e}")
        return {"success": False, "error": str(e)}


@router.get("/{project_id}/3dm-info")
async def get_3dm_info_endpoint(project_id: str, file_path: str):
    """Get information about a 3DM file before importing."""
    from services.rhino_exporter import get_3dm_info, RHINO3DM_AVAILABLE
    
    if not RHINO3DM_AVAILABLE:
        return {
            "success": False, 
            "error": "rhino3dm library not installed"
        }
    
    try:
        if not Path(file_path).exists():
            return {
                "success": False,
                "error": f"File not found: {file_path}"
            }
        
        return get_3dm_info(file_path)
        
    except Exception as e:
        return {"success": False, "error": str(e)}
