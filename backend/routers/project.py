"""Project router for saving and loading project data."""

import json
import base64
import shutil
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.app_paths import get_data_root
from services.projection import get_projection_service

router = APIRouter()

# Project data directory
PROJECT_DATA_DIR = get_data_root()
PROJECTIONS_DIR = PROJECT_DATA_DIR / "projections"
PROJECT_LOG_PATH = get_data_root() / "logs" / "project.log"
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


def append_project_log(message: str) -> None:
    """Write project list/load/save diagnostics to the runtime log folder."""
    try:
        PROJECT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        rotate_log_if_needed(PROJECT_LOG_PATH)
        with PROJECT_LOG_PATH.open("a", encoding="utf-8") as handle:
            handle.write(f"[{datetime.utcnow().isoformat()}Z] {message}\n")
    except Exception:
        pass


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


class MeasurementCustomGroup(BaseModel):
    """User-defined rib group for measurements."""
    id: str
    name: str
    ribIds: List[str]


class RibPairing(BaseModel):
    """User-defined symmetric pairing between ribs or rib groups."""
    id: str
    name: str
    sides: List[str]


class MeasurementConfig(BaseModel):
    """Persistent measurement configuration for Step 7."""
    ribNameById: Dict[str, str] = {}
    customGroups: List[MeasurementCustomGroup] = []
    disabledAutoGroupIds: List[str] = []
    groupNameById: Dict[str, str] = {}
    bossStoneNameById: Dict[str, str] = {}
    ribPairings: List[RibPairing] = []
    semicircularIds: List[str] = []


class MeasurementConfigResponse(BaseModel):
    """Response for measurement configuration endpoints."""
    success: bool
    data: Optional[MeasurementConfig] = None
    error: Optional[str] = None


def get_project_dir(project_id: str) -> Path:
    """Get or create project directory."""
    project_dir = PROJECT_DATA_DIR / "projects" / project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    append_project_log(f"ensure project_dir project_id={project_id} path={project_dir}")
    return project_dir


def _load_intrados_rib_ids(project_dir: Path) -> set:
    """Load valid rib ids from saved intrados lines."""
    intrados_path = project_dir / "segmentations" / "intrados_lines.json"
    if not intrados_path.exists():
        return set()
    try:
        with open(intrados_path, "r") as f:
            payload = json.load(f)
        lines = payload.get("lines", []) if isinstance(payload, dict) else []
        return {str(line.get("id")) for line in lines if line.get("id")}
    except Exception:
        return set()


def _sanitize_measurement_config(raw: Dict[str, Any], valid_rib_ids: set) -> Dict[str, Any]:
    """Normalize and validate persisted measurement config."""
    rib_name_by_id = raw.get("ribNameById", {}) if isinstance(raw.get("ribNameById", {}), dict) else {}
    custom_groups_raw = raw.get("customGroups", []) if isinstance(raw.get("customGroups", []), list) else []
    disabled_auto_group_ids = raw.get("disabledAutoGroupIds", []) if isinstance(raw.get("disabledAutoGroupIds", []), list) else []
    group_name_by_id = raw.get("groupNameById", {}) if isinstance(raw.get("groupNameById", {}), dict) else {}
    rib_pairings_raw = raw.get("ribPairings", []) if isinstance(raw.get("ribPairings", []), list) else []

    # Keep only valid rib ids and non-empty names
    clean_rib_names: Dict[str, str] = {}
    for rib_id, name in rib_name_by_id.items():
        rib = str(rib_id)
        nm = str(name).strip()
        if (not valid_rib_ids or rib in valid_rib_ids) and nm:
            clean_rib_names[rib] = nm[:100]

    # Enforce unique rib ownership across custom groups
    used_ribs = set()
    clean_groups: List[Dict[str, Any]] = []
    for g in custom_groups_raw:
        if not isinstance(g, dict):
            continue
        gid = str(g.get("id", "")).strip()
        gname = str(g.get("name", "")).strip()[:100]
        rib_ids = g.get("ribIds", [])
        if not gid:
            continue
        if not isinstance(rib_ids, list):
            rib_ids = []
        normalized_ribs: List[str] = []
        for rib_id in rib_ids:
            rid = str(rib_id)
            if valid_rib_ids and rid not in valid_rib_ids:
                continue
            if rid in used_ribs:
                continue
            used_ribs.add(rid)
            normalized_ribs.append(rid)

        if normalized_ribs:
            clean_groups.append({
                "id": gid,
                "name": gname if gname else gid,
                "ribIds": normalized_ribs,
            })

    clean_disabled_ids = [str(v) for v in disabled_auto_group_ids if str(v).strip()]
    clean_group_names = {
        str(k): str(v).strip()[:100]
        for k, v in group_name_by_id.items()
        if str(k).strip() and str(v).strip()
    }

    boss_stone_name_by_id_raw = raw.get("bossStoneNameById", {})
    if not isinstance(boss_stone_name_by_id_raw, dict):
        boss_stone_name_by_id_raw = {}
    clean_boss_stone_names = {
        str(k): str(v).strip()[:100]
        for k, v in boss_stone_name_by_id_raw.items()
        if str(k).strip() and str(v).strip()
    }

    clean_pairings: List[Dict[str, Any]] = []
    for pairing in rib_pairings_raw:
        if not isinstance(pairing, dict):
            continue
        pairing_id = str(pairing.get("id", "")).strip()
        pairing_name = str(pairing.get("name", "")).strip()[:100]
        sides_raw = pairing.get("sides", [])
        if not pairing_id or not pairing_name or not isinstance(sides_raw, list):
            continue

        normalized_sides = [str(side).strip() for side in sides_raw if str(side).strip()]
        if len(normalized_sides) != 2 or normalized_sides[0] == normalized_sides[1]:
            continue

        clean_pairings.append({
            "id": pairing_id,
            "name": pairing_name,
            "sides": normalized_sides,
        })

    semicircular_ids_raw = raw.get("semicircularIds", [])
    if not isinstance(semicircular_ids_raw, list):
        semicircular_ids_raw = []
    clean_semicircular_ids = [
        str(v) for v in semicircular_ids_raw
        if str(v).strip() and (not valid_rib_ids or str(v) in valid_rib_ids)
    ]

    return {
        "ribNameById": clean_rib_names,
        "customGroups": clean_groups,
        "disabledAutoGroupIds": clean_disabled_ids,
        "groupNameById": clean_group_names,
        "bossStoneNameById": clean_boss_stone_names,
        "ribPairings": clean_pairings,
        "semicircularIds": clean_semicircular_ids,
    }


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
    """Extract group ID from label.

    Handles both numeric suffixes (e.g. 'rib #1' -> 'rib') and the
    alphabetical suffixes used for corners/boss stones (e.g. 'boss stone E'
    -> 'boss_stone', 'corner A' -> 'corner').
    """
    import re
    # Remove trailing numeric suffix (" #1", " 1", etc.)
    base_label = re.sub(r'\s*#?\d+$', '', label).strip()
    # Remove trailing single-letter or two-letter alphabetical suffix
    # added by our labelling scheme: " A", " B", " Aa", " Ab", …
    base_label = re.sub(r'\s+[A-Z][a-z]?$', '', base_label).strip()
    # Convert to lowercase snake_case
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
        append_project_log(
            f"save start project_id={request.projectId} name={request.projectName!r} "
            f"projection_count={len(request.projections)} segmentation_count={len(request.segmentations)} "
            f"data_root={PROJECT_DATA_DIR}"
        )
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
                print(f"  [OK] Created combined_all.png ({len(all_masks)} masks)")
        
        # Create combined masks for each group
        group_summary = []
        for group_id, group_data in groups.items():
            if group_data["masks"]:
                group_filename = f"group_{group_id}.png"
                group_path = seg_dir / group_filename
                
                if create_combined_mask(group_data["masks"], group_path):
                    print(f"  [OK] Created {group_filename} ({group_data['count']} masks)")
                
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
                print(f"  [OK] Copied projection {proj.id}: {len(proj_info.get('files', {}))} files")
            except Exception as e:
                print(f"  [ERROR] Error copying projection {proj.id}: {e}")
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
        
        print(f"[OK] Project saved: {request.projectId}")
        print(f"  - {len(projection_refs)} projections")
        print(f"  - {len(segmentation_refs)} segmentations in {len(groups)} groups")
        append_project_log(
            f"save complete project_id={request.projectId} path={project_path} "
            f"projection_index={proj_index_path.exists()} segmentation_index={seg_index_path.exists()}"
        )
        
        return {
            "success": True,
            "projectDir": str(project_dir),
            "savedProjections": len(projection_refs),
            "savedSegmentations": len(segmentation_refs),
            "groups": len(groups),
        }
        
    except Exception as e:
        print(f"Error saving project: {e}")
        append_project_log(f"save exception project_id={request.projectId} error={type(e).__name__}: {e}")
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
        project_dir = PROJECT_DATA_DIR / "projects" / request.projectId
        project_path = project_dir / "project.json"
        append_project_log(
            f"save-progress start project_id={request.projectId} current_step={request.currentStep} "
            f"project_dir_exists={project_dir.exists()} project_json_exists={project_path.exists()}"
        )
        
        if not project_path.exists():
            append_project_log(
                f"save-progress skipped project_id={request.projectId} reason=project.json missing path={project_path}"
            )
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
        
        print(f"[OK] Progress saved: step {request.currentStep}, {len(request.steps)} completed steps")
        append_project_log(
            f"save-progress complete project_id={request.projectId} current_step={request.currentStep}"
        )
        
        return {
            "success": True,
            "currentStep": request.currentStep,
            "stepsCompleted": len([s for s in request.steps.values() if s.completed])
        }
        
    except Exception as e:
        print(f"Error saving progress: {e}")
        append_project_log(f"save-progress exception project_id={request.projectId} error={type(e).__name__}: {e}")
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
        append_project_log(
            f"load start project_id={project_id} project_dir={project_dir} project_json_exists={project_path.exists()}"
        )
        
        if not project_path.exists():
            append_project_log(f"load missing project_id={project_id} path={project_path}")
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
        projection_service = get_projection_service()
        if proj_index_path.exists():
            with open(proj_index_path, "r") as f:
                proj_index = json.load(f)
            
            proj_refs = proj_index.get("projections", [])
            
            for proj_ref in proj_refs:
                proj_data = proj_ref.copy()

                # Load images as base64 if files exist
                files = proj_ref.get("files", {})
                images = {}
                projection_paths: Dict[str, str] = {}

                for img_type, filename in files.items():
                    img_path = proj_dir / filename
                    if not img_path.exists():
                        continue

                    if img_type in ["colour", "depthGrayscale", "depthPlasma"]:
                        with open(img_path, "rb") as f:
                            img_bytes = f.read()
                        images[img_type] = f"data:image/png;base64,{base64.b64encode(img_bytes).decode()}"

                    projection_paths[img_type] = str(img_path)

                projection_service.register_projection(
                    proj_ref["id"],
                    perspective=proj_ref.get("perspective", "top"),
                    resolution=proj_ref.get("resolution", 2048),
                    sigma=proj_ref.get("sigma", 1.0),
                    kernel_size=proj_ref.get("kernelSize", 5),
                    bottom_up=proj_ref.get("bottomUp", True),
                    metadata=proj_ref.get("metadata", {}),
                    paths={
                        "colour": projection_paths.get("colour", ""),
                        "depth_grayscale": projection_paths.get("depthGrayscale", ""),
                        "depth_plasma": projection_paths.get("depthPlasma", ""),
                        "depth_raw": projection_paths.get("depthRaw", ""),
                        "coordinates": projection_paths.get("coordinates", ""),
                        "metadata": projection_paths.get("metadata", ""),
                    },
                )

                proj_data["images"] = images
                projections.append(proj_data)
                append_project_log(
                    f"load projection project_id={project_id} projection_id={proj_ref['id']} "
                    f"file_keys={sorted(files.keys())} image_keys={sorted(images.keys())}"
                )
        
        project_data["projections"] = projections
        append_project_log(
            f"load complete project_id={project_id} projections={len(projections)} "
            f"segmentations={len(segmentations)} selected_projection_id={project_data.get('selectedProjectionId')}"
        )
        
        return ProjectLoadResponse(
            success=True,
            project=project_data
        )
        
    except Exception as e:
        print(f"Error loading project: {e}")
        append_project_log(f"load exception project_id={project_id} error={type(e).__name__}: {e}")
        return ProjectLoadResponse(
            success=False,
            error=str(e)
        )


@router.get("/list")
async def list_projects():
    """List all saved projects."""
    try:
        projects_dir = PROJECT_DATA_DIR / "projects"
        append_project_log(f"list start projects_dir={projects_dir} exists={projects_dir.exists()}")
        
        if not projects_dir.exists():
            append_project_log("list complete count=0 reason=projects dir missing")
            return {"projects": []}
        
        projects = []
        for project_dir in projects_dir.iterdir():
            if project_dir.is_dir():
                project_path = project_dir / "project.json"
                append_project_log(
                    f"list inspect project_dir={project_dir} project_json_exists={project_path.exists()}"
                )
                if project_path.exists():
                    try:
                        with open(project_path, "r") as f:
                            project_data = json.load(f)
                        projects.append({
                            "id": project_data.get("id"),
                            "name": project_data.get("name"),
                            "updatedAt": project_data.get("updatedAt"),
                            "segmentationCount": project_data.get("segmentationCount", 0),
                        })
                    except Exception as file_err:
                        print(f"Skipping corrupt project file {project_path}: {file_err}")
        
        # Sort by updated time
        projects.sort(key=lambda p: p.get("updatedAt", ""), reverse=True)
        append_project_log(f"list complete count={len(projects)}")
        
        return {"projects": projects}
        
    except Exception as e:
        print(f"Error listing projects: {e}")
        append_project_log(f"list exception error={type(e).__name__}: {e}")
        return {"projects": [], "error": str(e)}


@router.get("/{project_id}/measurement-config", response_model=MeasurementConfigResponse)
async def get_measurement_config(project_id: str):
    """Load persisted Step 7 measurement configuration for a project."""
    try:
        project_dir = get_project_dir(project_id)
        project_path = project_dir / "project.json"
        if not project_path.exists():
            return MeasurementConfigResponse(success=False, error=f"Project not found: {project_id}")

        with open(project_path, "r") as f:
            project_data = json.load(f)

        raw_config = project_data.get("measurementConfig", {})
        valid_rib_ids = _load_intrados_rib_ids(project_dir)
        clean_config = _sanitize_measurement_config(raw_config if isinstance(raw_config, dict) else {}, valid_rib_ids)

        return MeasurementConfigResponse(success=True, data=MeasurementConfig(**clean_config))
    except Exception as e:
        return MeasurementConfigResponse(success=False, error=str(e))


@router.post("/{project_id}/measurement-config", response_model=MeasurementConfigResponse)
async def save_measurement_config(project_id: str, config: MeasurementConfig):
    """Persist Step 7 measurement configuration for a project."""
    try:
        project_dir = get_project_dir(project_id)
        project_path = project_dir / "project.json"
        if not project_path.exists():
            return MeasurementConfigResponse(success=False, error=f"Project not found: {project_id}")

        with open(project_path, "r") as f:
            project_data = json.load(f)

        valid_rib_ids = _load_intrados_rib_ids(project_dir)
        normalized = _sanitize_measurement_config(config.dict(), valid_rib_ids)
        project_data["measurementConfig"] = normalized
        project_data["updatedAt"] = datetime.now().isoformat()

        with open(project_path, "w") as f:
            json.dump(project_data, f, indent=2)

        return MeasurementConfigResponse(success=True, data=MeasurementConfig(**normalized))
    except Exception as e:
        return MeasurementConfigResponse(success=False, error=str(e))


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
        
        print(f"[OK] Deleted project '{project_name}' ({project_id})")
        
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
        
        for seg in segmentations:
            # Prefer robust pixel-overlap classification using mask image.
            overlap_inside = _mask_inside_roi(seg, roi_dict, seg_dir)
            if overlap_inside is None:
                bbox = seg.get("bbox")
                overlap_inside = bbox_overlaps_roi(bbox, roi_dict) if bbox else False

            seg["insideRoi"] = bool(overlap_inside)

        # Permanently delete rib segmentations outside the ROI (mask files + index entries)
        ribs_deleted = 0
        kept_segmentations = []
        for seg in segmentations:
            if seg.get("groupId") == "rib" and not seg.get("insideRoi", True):
                mask_file = seg.get("maskFile")
                if mask_file:
                    mask_path = seg_dir / mask_file
                    if mask_path.exists():
                        try:
                            mask_path.unlink()
                        except Exception as del_err:
                            print(f"  Warning: could not delete rib mask file {mask_file}: {del_err}")
                ribs_deleted += 1
            else:
                kept_segmentations.append(seg)

        if ribs_deleted:
            print(f"  → Permanently deleted {ribs_deleted} rib segmentation(s) outside ROI")
            segmentations = kept_segmentations

        inside_count = sum(1 for s in segmentations if s.get("insideRoi", False))
        outside_count = sum(1 for s in segmentations if not s.get("insideRoi", True))

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
        print(f"  → {inside_count} masks inside ROI, {outside_count} outside, {ribs_deleted} rib(s) permanently removed")
        
        return {
            "success": True,
            "insideCount": inside_count,
            "outsideCount": outside_count,
            "ribsDeleted": ribs_deleted,
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
        
        print("[OK] Applied masks to E57 point cloud:")
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
        
        print(f"[OK] Traced {len(lines)} intrados lines from {len(rib_segmentations)} ribs")
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
# Boss Stone / Keystone Marker Endpoints
# =====================================================

def _is_boss_stone(text: str) -> bool:
    """Return True if the text corresponds to a boss stone / keystone label.

    Normalises the input by lowercasing and stripping all spaces and underscores
    before substring-matching against known slugs.  This accepts any casing and
    space/underscore spacing variant, e.g.:
      "boss stone", "boss_stone", "Boss Stone #2", "keystone", "crown stone"
    """
    slug = text.lower().replace(" ", "").replace("_", "")
    known = ["bossstone", "keystone", "boss", "crown", "crownstone", "key"]
    return any(k in slug for k in known)


def _strip_boss_stone_prefix(label: str) -> str:
    """Strip leading 'boss stone' variants for cleaner display labels."""
    if not label:
        return label

    text = str(label).strip()
    lowered = text.lower()

    prefixes = (
        "boss stone",
        "boss_stone",
        "boss-stone",
    )

    for prefix in prefixes:
        if lowered.startswith(prefix):
            stripped = text[len(prefix):].lstrip(" _-:#")
            return stripped or text

    return text


def _strip_corner_prefix(label: str) -> str:
    """Strip leading 'corner' variants for cleaner display labels."""
    if not label:
        return label

    import re

    text = str(label).strip()
    stripped = re.sub(r"^(?:roi[\s_-]*)?corner\b[\s_:-]*", "", text, flags=re.IGNORECASE).strip()
    return stripped or text


def _denormalize_xyz(norm_xyz, min_vals: list, range_vals: list, centroid: list):
    """Denormalise a normalised centred coordinate to real-world E57 space."""
    x = float(norm_xyz[0] * range_vals[0] + min_vals[0] + centroid[0])
    y = float(norm_xyz[1] * range_vals[1] + min_vals[1] + centroid[1])
    z = float(norm_xyz[2] * range_vals[2] + min_vals[2] + centroid[2])
    return x, y, z


def _boss_markers_from_reference_points(
    project_dir,
    coords,
    min_vals: list,
    range_vals: list,
    centroid: list,
    impost_z: Optional[float],
) -> list:
    """Return boss stone markers derived from step 4B reference points (node_points.json).

    Only points with ``pointType == "boss"`` are used — ROI corner reference points
    are excluded.  Each point's pixel coordinates (x, y) directly index the
    projection's ``_coordinates.npy`` array, which uses the same pixel space.

    Returns an empty list if the file does not exist or contains no boss points,
    allowing the caller to fall back to segmentation-mask-based extraction.
    """
    import numpy as np

    # Canonical location written by CutTypologyMatchingService
    cut_dir = Path(project_dir) / "2d_geometry" / "cut_typology_matching"
    old_path = cut_dir / "boss_points.json"
    node_points_path = cut_dir / "node_points.json"
    # Handle legacy rename (matches CutTypologyMatchingService._node_points_path)
    if old_path.exists() and not node_points_path.exists():
        old_path.rename(node_points_path)
    if not node_points_path.exists():
        return []

    try:
        with open(node_points_path, "r") as f:
            node_data = json.load(f)
    except Exception as e:
        print(f"  Warning: could not load node_points.json: {e}")
        return []

    points = node_data.get("points", [])
    boss_points = [p for p in points if p.get("pointType", "boss") == "boss"]

    if not boss_points:
        return []

    coord_valid = np.any(coords != 0, axis=2)
    markers = []

    for point in boss_points:
        try:
            px = int(round(float(point["x"])))
            py = int(round(float(point["y"])))
            py = max(0, min(py, coords.shape[0] - 1))
            px = max(0, min(px, coords.shape[1] - 1))

            norm_xyz = coords[py, px]

            if norm_xyz[0] == 0.0 and norm_xyz[1] == 0.0 and norm_xyz[2] == 0.0:
                # Reference point pixel is in unscanned space — find the nearest
                # valid pixel for XY and use impost Z as the vertical position.
                all_valid_ys, all_valid_xs = np.where(coord_valid)
                if len(all_valid_ys) == 0:
                    print(f"  Warning: no valid coordinate data for ref point {point.get('id')}")
                    continue
                dists = (all_valid_ys - py) ** 2 + (all_valid_xs - px) ** 2
                best_idx = int(np.argmin(dists))
                norm_xyz = coords[all_valid_ys[best_idx], all_valid_xs[best_idx]]
                x, y, _z = _denormalize_xyz(norm_xyz, min_vals, range_vals, centroid)
                z = impost_z if impost_z is not None else _z
            else:
                x, y, z = _denormalize_xyz(norm_xyz, min_vals, range_vals, centroid)

            point_id = point.get("id")
            label = _strip_boss_stone_prefix(f"Boss Stone {point_id}")

            markers.append({
                "id": f"boss-ref-{point_id}",
                "label": label,
                "groupId": "boss_stone",
                "color": "#FFD700",
                "x": x,
                "y": y,
                "z": z,
            })
        except Exception as e:
            print(f"  Warning: could not process reference point {point.get('id')}: {e}")

    return markers


def _boss_markers_from_segmentations(
    boss_segs: list,
    seg_dir,
    coords,
    min_vals: list,
    range_vals: list,
    centroid: list,
    impost_z: Optional[float],
    group_lookup: dict,
) -> list:
    """Extract boss stone markers from segmentation masks (legacy / fallback path).

    For each boss segmentation, the centroid pixel of its alpha mask is looked up
    in the projection's ``_coordinates.npy`` and denormalised to real-world XYZ.
    """
    import numpy as np
    from PIL import Image

    seg_dir = Path(seg_dir)
    coord_valid = np.any(coords != 0, axis=2)
    markers = []

    for seg in boss_segs:
        mask_file = seg.get("maskFile")
        if not mask_file:
            continue

        mask_path = seg_dir / mask_file
        if not mask_path.exists():
            continue

        # Load mask and extract alpha channel
        mask_img = Image.open(mask_path)
        if mask_img.mode == "RGBA":
            alpha = np.array(mask_img)[:, :, 3]
        elif mask_img.mode == "LA":
            alpha = np.array(mask_img)[:, :, 1]
        else:
            alpha = np.array(mask_img.convert("L"))

        ys, xs = np.where(alpha > 127)
        if len(ys) == 0:
            continue

        cy = int(np.mean(ys))
        cx = int(np.mean(xs))
        cy = min(cy, coords.shape[0] - 1)
        cx = min(cx, coords.shape[1] - 1)

        norm_xyz = coords[cy, cx]

        if norm_xyz[0] == 0.0 and norm_xyz[1] == 0.0 and norm_xyz[2] == 0.0:
            valid_mask = (alpha > 127) & coord_valid
            valid_ys, valid_xs = np.where(valid_mask)
            if len(valid_ys) == 0:
                # No scan data inside the mask at all — fall back to nearest valid
                # pixel in the whole image and use impost Z for the vertical.
                if impost_z is None:
                    continue
                all_valid_ys, all_valid_xs = np.where(coord_valid)
                if len(all_valid_ys) == 0:
                    continue
                dists = (all_valid_ys - cy) ** 2 + (all_valid_xs - cx) ** 2
                best_idx = int(np.argmin(dists))
                norm_xyz = coords[all_valid_ys[best_idx], all_valid_xs[best_idx]]
                x, y, _ = _denormalize_xyz(norm_xyz, min_vals, range_vals, centroid)
                z = impost_z
                group_id = seg.get("groupId") or extract_group_id(seg.get("label", ""))
                group_info = group_lookup.get(group_id, {})
                color = seg.get("color") or group_info.get("color") or "#FFD700"
                markers.append({
                    "id": seg.get("id", ""),
                    "label": _strip_boss_stone_prefix(seg.get("label", group_id)),
                    "groupId": group_id,
                    "color": color,
                    "x": x,
                    "y": y,
                    "z": z,
                })
                continue
            cy = int(np.mean(valid_ys))
            cx = int(np.mean(valid_xs))
            cy = min(cy, coords.shape[0] - 1)
            cx = min(cx, coords.shape[1] - 1)
            norm_xyz = coords[cy, cx]

        x, y, z = _denormalize_xyz(norm_xyz, min_vals, range_vals, centroid)
        group_id = seg.get("groupId") or extract_group_id(seg.get("label", ""))
        group_info = group_lookup.get(group_id, {})
        color = seg.get("color") or group_info.get("color") or "#FFD700"

        markers.append({
            "id": seg.get("id", ""),
            "label": _strip_boss_stone_prefix(seg.get("label", group_id)),
            "groupId": group_id,
            "color": color,
            "x": x,
            "y": y,
            "z": z,
        })

    return markers


def _apply_reference_positions_to_segmentation_markers(
    segmentation_markers: list,
    reference_markers: list,
    max_match_distance: float = 2.0,
) -> list:
    """Refine segmentation markers and retain unmatched reference markers.

    Segmentation markers remain the canonical source for IDs and labels.
    If a reference marker is spatially close, only XYZ is copied over.
    Any unmatched reference markers are appended so additional step 4 points
    are still available in step 7 preview and downstream tools.
    """
    if not segmentation_markers or not reference_markers:
        return segmentation_markers

    merged = [dict(marker) for marker in segmentation_markers]
    unmatched_ref_indices = set(range(len(reference_markers)))

    for marker in merged:
        best_ref_idx = None
        best_dist = float("inf")

        for ref_idx in unmatched_ref_indices:
            ref = reference_markers[ref_idx]
            dx = float(marker.get("x", 0.0)) - float(ref.get("x", 0.0))
            dy = float(marker.get("y", 0.0)) - float(ref.get("y", 0.0))
            dz = float(marker.get("z", 0.0)) - float(ref.get("z", 0.0))
            dist = (dx * dx + dy * dy + dz * dz) ** 0.5
            if dist < best_dist:
                best_dist = dist
                best_ref_idx = ref_idx

        if best_ref_idx is None or best_dist > max_match_distance:
            continue

        ref = reference_markers[best_ref_idx]
        marker["x"] = float(ref.get("x", marker.get("x", 0.0)))
        marker["y"] = float(ref.get("y", marker.get("y", 0.0)))
        marker["z"] = float(ref.get("z", marker.get("z", 0.0)))
        unmatched_ref_indices.remove(best_ref_idx)

    for ref_idx in sorted(unmatched_ref_indices):
        merged.append(dict(reference_markers[ref_idx]))

    return merged


@router.get("/{project_id}/boss-stone-markers")
async def get_boss_stone_markers(project_id: str):
    """Get 3D centroid positions for boss stone / keystone markers.

    Preferred source: segmentation boss masks from step 3.  Their labels are used
    as canonical marker labels in downstream steps.

    If step 4B reference points exist, they are used to refine nearby
    segmentation markers and are also included as additional markers when
    they do not match an existing segmentation boss.

    Fallback: if no segmentation boss markers exist, uses step 4B reference
    points directly.

    Returns a list of markers::
        [{ id, label, groupId, color, x, y, z }, ...]
    """
    import numpy as np

    try:
        project_dir = get_project_dir(project_id)
        seg_dir = project_dir / "segmentations"

        # ------------------------------------------------------------------
        # Load projection coordinates & metadata (shared by both paths)
        # ------------------------------------------------------------------
        proj_dir = project_dir / "projections"
        proj_index_path = proj_dir / "index.json"

        if not proj_index_path.exists():
            return {"success": True, "data": {"markers": []}}

        with open(proj_index_path, "r") as f:
            proj_index = json.load(f)

        projections = proj_index.get("projections", [])
        if not projections:
            return {"success": True, "data": {"markers": []}}

        proj = projections[0]
        files = proj.get("files", {})

        coord_file = files.get("coordinates")
        if not coord_file:
            return {"success": True, "data": {"markers": []}}

        coord_path = proj_dir / coord_file
        if not coord_path.exists():
            print(f"  Coordinates file not found: {coord_path}")
            return {"success": True, "data": {"markers": []}}

        meta_file = files.get("metadata")
        meta_path = proj_dir / meta_file if meta_file else None

        if meta_path and meta_path.exists():
            with open(meta_path, "r") as f:
                metadata = json.load(f)
        else:
            metadata = proj.get("metadata", {})

        min_vals = metadata.get("min_vals", [0.0, 0.0, 0.0])
        range_vals = metadata.get("range_vals", [1.0, 1.0, 1.0])
        centroid = metadata.get("centroid", [0.0, 0.0, 0.0])

        coords = np.load(str(coord_path))

        # Derive impost Z from intrados lines (used as fallback vertical for
        # points that fall in unscanned space).
        impost_z: Optional[float] = None
        intrados_path = seg_dir / "intrados_lines.json"
        if intrados_path.exists():
            try:
                with open(intrados_path, "r") as _f:
                    _intrados = json.load(_f)
                _min_zs = []
                for _line in _intrados.get("lines", []):
                    _pts = _line.get("points3d", [])
                    _zs = [
                        _p["value"][2]
                        for _p in _pts
                        if isinstance(_p, dict)
                        and isinstance(_p.get("value"), list)
                        and len(_p["value"]) >= 3
                    ]
                    if _zs:
                        _min_zs.append(min(_zs))
                if _min_zs:
                    impost_z = float(np.median(_min_zs))
                    print(f"  Impost Z derived from intrados lines: {impost_z:.4f}")
            except Exception as _e:
                print(f"  Warning: could not derive impost Z from intrados lines: {_e}")

        # ------------------------------------------------------------------
        # Build segmentation markers first (canonical labels for Step 7)
        # ------------------------------------------------------------------
        seg_index_path = seg_dir / "index.json"
        seg_markers = []

        if seg_index_path.exists():
            with open(seg_index_path, "r") as f:
                seg_index = json.load(f)

            if isinstance(seg_index, list):
                seg_refs = seg_index
                groups = []
            else:
                seg_refs = seg_index.get("segmentations", [])
                groups = seg_index.get("groups", [])

            group_lookup = {g["groupId"]: g for g in groups}

            boss_segs = [
                s for s in seg_refs
                if _is_boss_stone(s.get("groupId", "")) or _is_boss_stone(s.get("label", ""))
            ]

            seg_markers = _boss_markers_from_segmentations(
                boss_segs, seg_dir, coords, min_vals, range_vals, centroid, impost_z, group_lookup
            )

        # ------------------------------------------------------------------
        # Optional geometric refinement from step 4B reference points
        # ------------------------------------------------------------------
        ref_markers = _boss_markers_from_reference_points(
            project_dir, coords, min_vals, range_vals, centroid, impost_z
        )

        if seg_markers:
            markers = _apply_reference_positions_to_segmentation_markers(seg_markers, ref_markers)
            print(
                f"Boss stone markers for {project_id}: {len(markers)} segmentation labels"
                f" ({len(ref_markers)} reference-point candidates)"
            )
        elif ref_markers:
            markers = ref_markers
            print(f"Boss stone markers for {project_id}: {len(markers)} from step 4B reference points (fallback)")
        else:
            markers = []

        # ------------------------------------------------------------------
        # Always append ROI corner markers (both primary & fallback paths)
        # ------------------------------------------------------------------
        roi_corners = []
        roi_corner_meta_by_index: Dict[int, Dict[str, str]] = {}
        roi_corner_pixels_by_index: Dict[int, List[float]] = {}
        if seg_index_path.exists():
            try:
                with open(seg_index_path, "r") as f:
                    _seg_idx = json.load(f)
                if isinstance(_seg_idx, dict):
                    stored_roi = _seg_idx.get("roi")
                    if stored_roi:
                        roi_corners = stored_roi.get("corners", [])
                    seg_entries = _seg_idx.get("segmentations", [])
                else:
                    seg_entries = _seg_idx if isinstance(_seg_idx, list) else []

                # Prefer corner IDs/labels saved in step 3 segmentation
                # (e.g. roi-corner-0-... with labels like "corner A").
                import re

                for seg in seg_entries:
                    if not isinstance(seg, dict):
                        continue
                    seg_id = str(seg.get("id", ""))
                    match = re.search(r"roi-corner-(\d+)", seg_id)
                    if not match:
                        continue
                    idx = int(match.group(1))
                    if idx < 0 or idx > 3:
                        continue
                    roi_corner_meta_by_index[idx] = {
                        "id": seg_id,
                        "label": str(seg.get("label") or ""),
                        "color": str(seg.get("color") or "#FFFFFF"),
                    }

                    bbox = seg.get("bbox")
                    if isinstance(bbox, list) and len(bbox) >= 4:
                        try:
                            x = float(bbox[0])
                            y = float(bbox[1])
                            w = float(bbox[2])
                            h = float(bbox[3])
                            roi_corner_pixels_by_index[idx] = [x + w / 2.0, y + h / 2.0]
                        except Exception:
                            pass

                # Fallback for older projects where ROI wasn't persisted at top level:
                # derive corner pixels from roi-corner segmentation bbox centres.
                if not roi_corners and roi_corner_pixels_by_index:
                    roi_corners = [
                        roi_corner_pixels_by_index[idx]
                        for idx in sorted(roi_corner_pixels_by_index.keys())
                        if idx in roi_corner_pixels_by_index
                    ]
            except Exception:
                pass

        _corner_labels = ["Corner TL", "Corner TR", "Corner BR", "Corner BL"]
        _corner_search_radius = 20
        for i, corner in enumerate(roi_corners[:4]):
            try:
                cx_px = int(corner[0])
                cy_px = int(corner[1])
                corner_meta = roi_corner_meta_by_index.get(i, {})
                corner_id = corner_meta.get("id") or f"roi-corner-{i}"
                corner_label_raw = corner_meta.get("label") or (
                    _corner_labels[i] if i < len(_corner_labels) else f"Corner {i}"
                )
                corner_label = _strip_corner_prefix(corner_label_raw)
                corner_color = corner_meta.get("color") or "#FFFFFF"
                cy_clamped = max(0, min(cy_px, coords.shape[0] - 1))
                cx_clamped = max(0, min(cx_px, coords.shape[1] - 1))
                norm_xyz = coords[cy_clamped, cx_clamped]
                _corner_fallback = False
                if norm_xyz[0] == 0.0 and norm_xyz[1] == 0.0 and norm_xyz[2] == 0.0:
                    _corner_fallback = True
                    r = _corner_search_radius
                    cy_start = max(0, cy_clamped - r)
                    cy_end = min(coords.shape[0], cy_clamped + r + 1)
                    cx_start = max(0, cx_clamped - r)
                    cx_end = min(coords.shape[1], cx_clamped + r + 1)
                    patch = coords[cy_start:cy_end, cx_start:cx_end]
                    valid_patch = np.any(patch != 0, axis=2)
                    valid_ys, valid_xs = np.where(valid_patch)
                    if len(valid_ys) == 0:
                        coord_valid_full = np.any(coords != 0, axis=2)
                        all_valid_ys, all_valid_xs = np.where(coord_valid_full)
                        if len(all_valid_ys) == 0:
                            continue
                        dists = (all_valid_ys - cy_clamped) ** 2 + (all_valid_xs - cx_clamped) ** 2
                        best_idx_full = int(np.argmin(dists))
                        norm_xyz = coords[all_valid_ys[best_idx_full], all_valid_xs[best_idx_full]]
                        x, y, _z = _denormalize_xyz(norm_xyz, min_vals, range_vals, centroid)
                        z = impost_z if impost_z is not None else _z
                        markers.append({
                            "id": corner_id,
                            "label": corner_label,
                            "groupId": "roi_corner",
                            "color": corner_color,
                            "x": x,
                            "y": y,
                            "z": z,
                        })
                        continue
                    origin_y = cy_clamped - cy_start
                    origin_x = cx_clamped - cx_start
                    dists = (valid_ys - origin_y) ** 2 + (valid_xs - origin_x) ** 2
                    best = int(np.argmin(dists))
                    norm_xyz = patch[valid_ys[best], valid_xs[best]]
                x, y, _z = _denormalize_xyz(norm_xyz, min_vals, range_vals, centroid)
                z = impost_z if impost_z is not None else _z
                markers.append({
                    "id": corner_id,
                    "label": corner_label,
                    "groupId": "roi_corner",
                    "color": corner_color,
                    "x": x,
                    "y": y,
                    "z": z,
                })
            except Exception as corner_err:
                print(f"  Warning: could not resolve 3D position for ROI corner {i}: {corner_err}")

        if roi_corners:
            print(f"  + {len([m for m in markers if m['groupId'] == 'roi_corner'])} ROI corner markers")

        return {"success": True, "data": {"markers": markers}}

    except Exception as e:
        print(f"Error getting boss stone markers: {e}")
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
    Export intrados lines to a Rhino 3DM file (legacy path; same as POST /api/export/intrados format=3dm).
    """
    from services.intrados_export import export_intrados_for_project

    try:
        result = export_intrados_for_project(
            project_id=project_id,
            fmt="3dm",
            layer_name=request.layerName,
        )
        if result.get("success"):
            return {
                "success": True,
                "filePath": result["filePath"],
                "fileName": result["fileName"],
                "curvesExported": result.get("curvesExported", 0),
                "message": result.get("message", "Exported"),
            }
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
    Import curves from the Rhino Trace layer as manual traces.
    """
    from services.rhino_exporter import import_3dm_curves, RHINO3DM_AVAILABLE, TRACE_IMPORT_LAYER_NAME
    
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
            layer_filter=TRACE_IMPORT_LAYER_NAME
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
                "data": {
                    "curves": result["curves"],
                    "curveCount": result.get("curveCount", 0),
                    "layers": result.get("layers", []),
                    "message": f"Imported {result.get('curveCount', 0)} curves from the {TRACE_IMPORT_LAYER_NAME} layer",
                    "source": request.filePath,
                    "importedAt": datetime.now().isoformat(),
                }
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
