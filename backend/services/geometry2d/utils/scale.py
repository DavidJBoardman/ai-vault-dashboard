"""Real-world scale helpers for the Geometry2D bay-plan pipeline.

The projection (Step 2) renders the centred point cloud into a square pixel
image using an isotropic scale: every pixel covers the same real-world span on
both axes. That span is what lets us export the bay plan to a metrically
correct DXF instead of raw pixel coordinates.

The mapping mirrors ``project_to_2d_gaussian_fast`` in
``services.projection_gaussian_utils``::

    max_range     = max(bounds.range_x, bounds.range_y)   # metres
    effective_res = resolution * (1 - 2 * MARGIN)          # usable pixels
    metres/pixel  = max_range / effective_res

E57 native units are metres, so no unit conversion is applied beyond the
optional user ``scale`` multiplier stored on the ROI.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

# Must stay in sync with the projection renderer's margin (5% each side).
PROJECTION_MARGIN = 0.05


def _load_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def metres_per_pixel_from_metadata(
    metadata: Dict[str, Any],
    scale: float = 1.0,
) -> Optional[float]:
    """Compute metres-per-pixel from a projection metadata dict.

    Returns ``None`` when the metadata lacks the bounds/resolution needed to
    derive a real-world scale, so callers can fall back to pixel coordinates.
    """
    bounds = metadata.get("bounds")
    resolution = metadata.get("resolution")
    if not isinstance(bounds, dict) or not isinstance(resolution, (int, float)):
        return None
    try:
        range_x = float(bounds["max_x"]) - float(bounds["min_x"])
        range_y = float(bounds["max_y"]) - float(bounds["min_y"])
    except (KeyError, TypeError, ValueError):
        return None

    max_range = max(range_x, range_y)
    if not max_range > 0:
        return None

    effective_res = float(resolution) * (1.0 - 2.0 * PROJECTION_MARGIN)
    if not effective_res > 0:
        return None

    metres_per_pixel = (max_range / effective_res) * (float(scale) if scale else 1.0)
    return metres_per_pixel if metres_per_pixel > 0 else None


def _resolve_metadata_path(project_dir: Path, projection_id: str) -> Optional[Path]:
    direct = project_dir / "projections" / f"{projection_id}_metadata.json"
    if direct.exists():
        return direct

    index_path = project_dir / "projections" / "index.json"
    index = _load_json(index_path) if index_path.exists() else None
    projections = index.get("projections") if isinstance(index, dict) else None
    if isinstance(projections, list):
        for proj in projections:
            if isinstance(proj, dict) and proj.get("id") == projection_id:
                files = proj.get("files") or {}
                meta_file = files.get("metadata")
                if meta_file:
                    candidate = project_dir / "projections" / str(meta_file)
                    if candidate.exists():
                        return candidate
    return None


def compute_metres_per_pixel(project_dir: Path) -> Optional[float]:
    """Derive the bay-plan metres-per-pixel scale for a project.

    Reads the ROI to find the source projection, then reads that projection's
    metadata. Returns ``None`` when scale can't be determined (e.g. ROI or
    projection metadata missing), so the DXF export degrades to pixel units.
    """
    roi = _load_json(project_dir / "2d_geometry" / "roi.json")
    if not roi:
        return None

    projection_id = roi.get("projection_id")
    if not isinstance(projection_id, str) or not projection_id:
        return None

    metadata_path = _resolve_metadata_path(project_dir, projection_id)
    if metadata_path is None:
        return None
    metadata = _load_json(metadata_path)
    if not metadata:
        return None

    params = roi.get("params")
    scale = 1.0
    if isinstance(params, dict):
        try:
            scale = float(params.get("scale", 1.0) or 1.0)
        except (TypeError, ValueError):
            scale = 1.0

    return metres_per_pixel_from_metadata(metadata, scale=scale)
