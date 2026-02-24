"""ROI adapter for Geometry2D pipeline inputs."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import cv2

from services.geometry2d.utils.anisotropy import compute_anisotropy_factors
from services.geometry2d.utils.ratio_patterns import suggest_ratio_patterns


PROJECT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def get_project_dir(project_id: str) -> Path:
    project_dir = PROJECT_DATA_DIR / "projects" / project_id
    if not project_dir.exists():
        raise FileNotFoundError(f"Project not found: {project_id}")
    return project_dir


def _load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object at {path}")
    return data


def _resolve_projection_image(project_dir: Path, projection_id: str) -> Path:
    candidate = project_dir / "projections" / f"{projection_id}_colour.png"
    if candidate.exists():
        return candidate

    index_path = project_dir / "projections" / "index.json"
    if index_path.exists():
        index_data = _load_json(index_path)
        projections = index_data.get("projections", [])
        if isinstance(projections, list):
            for proj in projections:
                if isinstance(proj, dict) and proj.get("id") == projection_id:
                    files = proj.get("files") or {}
                    colour_file = files.get("colour")
                    if colour_file:
                        resolved = project_dir / "projections" / str(colour_file)
                        if resolved.exists():
                            return resolved

    raise FileNotFoundError(f"Projection colour image not found for projectionId={projection_id}")


def _load_saved_roi(project_dir: Path) -> Dict[str, Any]:
    seg_index_path = project_dir / "segmentations" / "index.json"
    if not seg_index_path.exists():
        raise FileNotFoundError(f"Segmentation index missing: {seg_index_path}")

    seg_index = _load_json(seg_index_path)
    roi = seg_index.get("roi")
    if not isinstance(roi, dict):
        raise ValueError("No ROI found in segmentations/index.json. Save ROI in Step 4 first.")

    required = ("x", "y", "width", "height")
    missing = [k for k in required if k not in roi]
    if missing:
        raise ValueError(f"ROI is missing fields: {', '.join(missing)}")

    return roi


def _build_roi_params(saved_roi: Dict[str, Any]) -> Dict[str, float]:
    return {
        "cx": float(saved_roi["x"]),
        "cy": float(saved_roi["y"]),
        "w": float(saved_roi["width"]),
        "h": float(saved_roi["height"]),
        "rotation_deg": float(saved_roi.get("rotation", 0.0) or 0.0),
        "scale": 1.0,
    }


def prepare_roi_for_geometry2d(project_id: str, projection_id: str) -> Dict[str, Any]:
    """Normalise Step 4 ROI and persist `2d_geometry/roi.json`."""
    project_dir = get_project_dir(project_id)
    projection_image = _resolve_projection_image(project_dir, projection_id)
    saved_roi = _load_saved_roi(project_dir)
    params = _build_roi_params(saved_roi)

    img = cv2.imread(str(projection_image), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Failed to load projection image: {projection_image}")
    height, width = img.shape[:2]
    image_ratio = float(width) / float(height) if height else None

    vault_ratio: Optional[float] = image_ratio
    ratio_source = "image"
    factors = compute_anisotropy_factors(str(projection_image))
    if factors and image_ratio is not None:
        _, _, anisotropy_val = factors
        vault_ratio = float(image_ratio * float(anisotropy_val))
        ratio_source = "world"

    vault_ratio_suggestions = suggest_ratio_patterns(vault_ratio) if vault_ratio is not None else []

    out_dir = project_dir / "2d_geometry"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "roi.json"

    payload: Dict[str, Any] = {
        "image_path": str(projection_image.resolve()),
        "vault_ratio": vault_ratio,
        "vault_ratio_suggestions": vault_ratio_suggestions,
        "ratio_source": ratio_source,
        "output_path": str(out_path.resolve()),
        "params": params,
        "source": "services.geometry2d.roi_adapter",
        "created_at": datetime.now().isoformat(),
        "project_id": project_id,
        "projection_id": projection_id,
    }

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    return payload
