"""I/O helpers for Geometry2D Step 4.4 bay-plan candidate generation."""

from __future__ import annotations

import ast
import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from services.geometry2d.utils.roi_math import RoiParams, image_to_unit


def load_json_object(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, dict):
        raise ValueError(f"Expected JSON object at {path}")
    return raw


def bay_plan_dir(project_dir: Path) -> Path:
    old_dir = project_dir / "2d_geometry" / "reconstruction"
    out = project_dir / "2d_geometry" / "bay_plan_reconstruction"
    if old_dir.exists() and not out.exists():
        old_dir.rename(out)
    out.mkdir(parents=True, exist_ok=True)
    return out


def state_path(project_dir: Path) -> Path:
    return bay_plan_dir(project_dir) / "state.json"


def result_path(project_dir: Path) -> Path:
    return bay_plan_dir(project_dir) / "result.json"


def debug_image_path(project_dir: Path) -> Path:
    return bay_plan_dir(project_dir) / "spoke_candidates_debug.png"


def load_roi_params(project_dir: Path) -> RoiParams:
    roi_path = project_dir / "2d_geometry" / "roi.json"
    if not roi_path.exists():
        raise FileNotFoundError(f"ROI not found: {roi_path}. Run Step 4.1 first.")
    payload = load_json_object(roi_path)
    params = payload.get("params")
    if not isinstance(params, dict):
        raise ValueError("roi.json missing params")
    return {
        "cx": float(params["cx"]),
        "cy": float(params["cy"]),
        "w": float(params["w"]),
        "h": float(params["h"]),
        "rotation_deg": float(params.get("rotation_deg", 0.0) or 0.0),
        "scale": float(params.get("scale", 1.0) or 1.0),
    }


def load_base_image(project_dir: Path) -> Optional[np.ndarray]:
    roi_path = project_dir / "2d_geometry" / "roi.json"
    if not roi_path.exists():
        return None
    payload = load_json_object(roi_path)
    image_path = payload.get("image_path")
    if not isinstance(image_path, str) or not image_path:
        return None
    path = Path(image_path)
    if not path.exists():
        return None
    return cv2.imread(str(path), cv2.IMREAD_COLOR)


def _sort_boss_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def key(row: Dict[str, Any]) -> Tuple[int, str]:
        boss_id = str(row.get("id", ""))
        try:
            return (0, f"{int(boss_id):08d}")
        except ValueError:
            return (1, boss_id)

    return sorted(rows, key=key)


def _parse_uv_pair(raw: str) -> Optional[Tuple[float, float]]:
    cleaned = str(raw or "").strip()
    if not cleaned or cleaned.lower() == "none":
        return None
    try:
        parsed = ast.literal_eval(cleaned)
    except (ValueError, SyntaxError):
        return None
    if not isinstance(parsed, (list, tuple)) or len(parsed) < 2:
        return None
    return float(parsed[0]), float(parsed[1])


def _load_raw_boss_rows(project_dir: Path) -> List[Dict[str, Any]]:
    boss_path = project_dir / "2d_geometry" / "boss_report.json"
    if not boss_path.exists():
        raise FileNotFoundError(f"Boss report not found: {boss_path}. Run Step 4.1 first.")
    payload = load_json_object(boss_path)
    bosses = payload.get("bosses")
    if not isinstance(bosses, list):
        raise ValueError("boss_report.json missing bosses")
    rows: List[Dict[str, Any]] = []
    for idx, row in enumerate(bosses, start=1):
        if not isinstance(row, dict):
            continue
        boss_id = str(row.get("id", idx))
        centroid_uv = row.get("centroid_uv")
        if not isinstance(centroid_uv, dict):
            continue
        if "u" not in centroid_uv or "v" not in centroid_uv:
            continue
        rows.append(
            {
                "id": boss_id,
                "uv": (float(centroid_uv["u"]), float(centroid_uv["v"])),
                "source": "raw",
            }
        )
    return _sort_boss_rows(rows)


def _load_prepared_reference_rows(project_dir: Path) -> Optional[List[Dict[str, Any]]]:
    cut_dir = project_dir / "2d_geometry" / "cut_typology_matching"
    legacy_dir = project_dir / "2d_geometry" / "template_matching"
    if legacy_dir.exists() and not cut_dir.exists():
        legacy_dir.rename(cut_dir)

    node_points_path = cut_dir / "node_points.json"
    if not node_points_path.exists():
        legacy_points_path = cut_dir / "boss_points.json"
        if legacy_points_path.exists():
            legacy_points_path.rename(node_points_path)
    if not node_points_path.exists():
        return None

    payload = load_json_object(node_points_path)
    raw_points = payload.get("points")
    if not isinstance(raw_points, list):
        return None

    roi = load_roi_params(project_dir)
    rows: List[Dict[str, Any]] = []
    for row in raw_points:
        if not isinstance(row, dict):
            continue
        if "id" not in row or "x" not in row or "y" not in row:
            continue
        point_type = "corner" if str(row.get("pointType", "boss")) == "corner" else "boss"
        reference_id = str(row["id"])
        label = str(row.get("label") or reference_id)
        x = float(row["x"])
        y = float(row["y"])
        rows.append(
            {
                "id": reference_id,
                "label": label,
                "uv": image_to_unit((x, y), roi),
                "source": "anchor" if point_type == "corner" else str(row.get("source", "manual")),
                "pointType": point_type,
            }
        )

    return _sort_boss_rows(rows) if rows else None


def load_reference_rows(project_dir: Path) -> List[Dict[str, Any]]:
    base_rows = _load_prepared_reference_rows(project_dir) or _load_raw_boss_rows(project_dir)
    base_by_id = {str(row["id"]): row for row in base_rows}

    old_dir = project_dir / "2d_geometry" / "template_matching"
    new_dir = project_dir / "2d_geometry" / "cut_typology_matching"
    if old_dir.exists() and not new_dir.exists():
        old_dir.rename(new_dir)
    csv_path = new_dir / "boss_cut_typology_match.csv"
    if not csv_path.exists():
        legacy_csv_path = new_dir / "boss_template_match.csv"
        if legacy_csv_path.exists():
            legacy_csv_path.rename(csv_path)
    if not csv_path.exists():
        return base_rows

    resolved: Dict[str, Dict[str, Any]] = {}
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            boss_id = str(row.get("boss_id", "")).strip()
            if not boss_id:
                continue
            point_type = "corner" if str(row.get("point_type", "boss")).strip().lower() == "corner" else "boss"
            matched = str(row.get("matched", "")).strip().lower() in ("true", "1", "yes")
            ideal_uv = _parse_uv_pair(str(row.get("template_uv", "")))
            raw_uv = _parse_uv_pair(str(row.get("boss_uv", "")))
            base_row = base_by_id.get(boss_id)

            if point_type == "corner":
                label = str((base_row or {}).get("label", boss_id))
                if matched and ideal_uv is not None:
                    resolved[boss_id] = {"id": boss_id, "label": label, "uv": ideal_uv, "source": "anchor", "pointType": "corner"}
                    continue
                if raw_uv is not None:
                    resolved[boss_id] = {"id": boss_id, "label": label, "uv": raw_uv, "source": "anchor", "pointType": "corner"}
                    continue
                fallback = base_by_id.get(boss_id)
                if fallback:
                    resolved[boss_id] = fallback
                continue

            if matched and ideal_uv is not None:
                resolved[boss_id] = {
                    "id": boss_id,
                    "label": str((base_row or {}).get("label", boss_id)),
                    "uv": ideal_uv,
                    "source": "ideal",
                    "pointType": "boss",
                }
                continue
            if raw_uv is not None:
                resolved[boss_id] = {
                    "id": boss_id,
                    "label": str((base_row or {}).get("label", boss_id)),
                    "uv": raw_uv,
                    "source": str((base_row or {}).get("source", "raw")),
                    "pointType": "boss",
                }
                continue
            fallback = base_by_id.get(boss_id)
            if fallback:
                resolved[boss_id] = fallback

    for boss_id, row in base_by_id.items():
        if boss_id not in resolved:
            resolved[boss_id] = row
    return _sort_boss_rows(list(resolved.values()))


def load_boss_rows(project_dir: Path) -> List[Dict[str, Any]]:
    return [row for row in load_reference_rows(project_dir) if str(row.get("pointType", "boss")) == "boss"]


def _normalise_mask(mask_img: np.ndarray) -> np.ndarray:
    if mask_img.ndim == 3:
        if mask_img.shape[2] == 4:
            gray = mask_img[:, :, 3]
        else:
            gray = cv2.cvtColor(mask_img, cv2.COLOR_BGR2GRAY)
    else:
        gray = mask_img
    _, bw = cv2.threshold(gray, 1, 255, cv2.THRESH_BINARY)
    return bw


def _load_segmentation_index(project_dir: Path) -> Dict[str, Any]:
    index_path = project_dir / "segmentations" / "index.json"
    if not index_path.exists():
        return {}
    return load_json_object(index_path)


def load_grouped_rib_mask(project_dir: Path) -> Optional[np.ndarray]:
    grouped_path = project_dir / "segmentations" / "group_rib.png"
    if not grouped_path.exists():
        return None

    raw = cv2.imread(str(grouped_path), cv2.IMREAD_UNCHANGED)
    if raw is None:
        return None

    if raw.ndim == 2:
        mask = np.where(raw > 0, 255, 0).astype(np.uint8)
    elif raw.shape[2] == 4:
        alpha = raw[:, :, 3]
        colour = raw[:, :, :3]
        mask = np.where((alpha > 0) & np.any(colour > 0, axis=2), 255, 0).astype(np.uint8)
    else:
        colour = raw[:, :, :3]
        mask = np.where(np.any(colour > 0, axis=2), 255, 0).astype(np.uint8)

    kernel = np.ones((3, 3), dtype=np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    return mask if int(cv2.countNonZero(mask)) > 0 else None


def _load_grouped_rib_fragments(project_dir: Path) -> List[Dict[str, Any]]:
    grouped_path = project_dir / "segmentations" / "grouped_rib.png"
    if not grouped_path.exists():
        grouped_path = project_dir / "segmentations" / "group_rib.png"
    if not grouped_path.exists():
        return []

    raw = cv2.imread(str(grouped_path), cv2.IMREAD_UNCHANGED)
    if raw is None:
        return []

    if raw.ndim == 2:
        colour_img = cv2.cvtColor(raw, cv2.COLOR_GRAY2BGR)
        alpha = np.where(raw > 0, 255, 0).astype(np.uint8)
    elif raw.shape[2] == 4:
        colour_img = raw[:, :, :3]
        alpha = raw[:, :, 3]
    else:
        colour_img = raw[:, :, :3]
        alpha = np.where(np.any(colour_img > 0, axis=2), 255, 0).astype(np.uint8)

    valid = alpha > 0
    if int(np.count_nonzero(valid)) == 0:
        return []

    colours = colour_img[valid].reshape(-1, 3)
    unique_colours = np.unique(colours, axis=0)
    fragments: List[Dict[str, Any]] = []
    kernel = np.ones((3, 3), dtype=np.uint8)
    for colour in unique_colours:
        colour_mask = np.all(colour_img == colour.reshape(1, 1, 3), axis=2) & valid
        if int(np.count_nonzero(colour_mask)) == 0:
            continue
        mask = np.where(colour_mask, 255, 0).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
        n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        for label_id in range(1, n_labels):
            area = int(stats[label_id, cv2.CC_STAT_AREA])
            if area < 12:
                continue
            component_mask = np.where(labels == label_id, 255, 0).astype(np.uint8)
            hex_bgr = "".join(f"{int(channel):02x}" for channel in colour.tolist())
            fragments.append(
                {
                    "id": f"grouped_{hex_bgr}_{label_id}",
                    "label": f"grouped colour {hex_bgr} #{label_id}",
                    "mask": component_mask,
                }
            )
    return fragments


def _load_index_rib_masks(project_dir: Path) -> List[Dict[str, Any]]:
    seg_dir = project_dir / "segmentations"
    index_payload = _load_segmentation_index(project_dir)
    seg_rows = index_payload.get("segmentations")
    if not isinstance(seg_rows, list):
        return []

    rib_rows: List[Dict[str, Any]] = []
    for seg in seg_rows:
        if not isinstance(seg, dict):
            continue
        if str(seg.get("groupId", "")).lower() != "rib":
            continue
        mask_file = seg.get("maskFile")
        if not isinstance(mask_file, str) or not mask_file:
            continue
        mask_path = seg_dir / mask_file
        if not mask_path.exists():
            continue
        raw = cv2.imread(str(mask_path), cv2.IMREAD_UNCHANGED)
        if raw is None:
            continue
        mask = _normalise_mask(raw)
        kernel = np.ones((3, 3), dtype=np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
        if int(cv2.countNonZero(mask)) == 0:
            continue
        rib_rows.append(
            {
                "id": str(seg.get("id", "")),
                "label": str(seg.get("label", "")),
                "mask": mask,
            }
        )
    return rib_rows


def load_rib_masks(project_dir: Path) -> List[Dict[str, Any]]:
    grouped_fragments = _load_grouped_rib_fragments(project_dir)
    if grouped_fragments:
        return grouped_fragments
    return _load_index_rib_masks(project_dir)


def resolve_params(project_dir: Path, default_params: Dict[str, Any], params_patch: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    params = dict(default_params)
    s_path = state_path(project_dir)
    if s_path.exists():
        state_payload = load_json_object(s_path)
        stored = state_payload.get("params")
        if isinstance(stored, dict):
            params.update(stored)
    if isinstance(params_patch, dict):
        params.update(params_patch)
    params["angleToleranceDeg"] = float(max(1.0, min(90.0, float(params.get("angleToleranceDeg", 12.0)))))
    params["candidateMinScore"] = float(max(0.0, min(1.0, float(params.get("candidateMinScore", 0.36)))))
    params["candidateMaxDistanceUv"] = float(max(0.1, min(2.0, float(params.get("candidateMaxDistanceUv", 1.6)))))
    params["corridorWidthPx"] = int(max(1, min(256, int(params.get("corridorWidthPx", 22)))))
    params["minDirectionalSupport"] = int(max(1, min(16, int(params.get("minDirectionalSupport", 1)))))
    params["mutualOnly"] = bool(params.get("mutualOnly", False))
    params["minNodeDegree"] = int(max(0, min(8, int(params.get("minNodeDegree", 2)))))
    params["maxNodeDegree"] = int(max(1, min(64, int(params.get("maxNodeDegree", 36)))))
    params["boundaryToleranceUv"] = float(max(0.005, min(0.25, float(params.get("boundaryToleranceUv", 0.08)))))
    params["boundaryEdgeScoreFloor"] = float(max(0.0, min(1.0, float(params.get("boundaryEdgeScoreFloor", 0.12)))))
    params["enforcePlanarity"] = bool(params.get("enforcePlanarity", True))
    reconstruction_mode = str(params.get("reconstructionMode", "current")).strip().lower()
    if reconstruction_mode not in {"current", "delaunay"}:
        reconstruction_mode = "current"
    params["reconstructionMode"] = reconstruction_mode
    params["delaunayUseRoiBoundary"] = bool(params.get("delaunayUseRoiBoundary", True))
    params["delaunayUseCrossAxes"] = bool(params.get("delaunayUseCrossAxes", False))
    params["delaunayUseHalfLines"] = bool(params.get("delaunayUseHalfLines", False))
    params["debugRayLengthPx"] = int(max(10, min(512, int(params.get("debugRayLengthPx", 96)))))
    params.pop("comparisonMode", None)
    params.pop("selectionMode", None)
    params.pop("simpleLocalKeepBoundary", None)
    params.pop("candidateMode", None)
    params.pop("candidateKnn", None)
    return params


def write_state(project_dir: Path, params: Dict[str, Any], result: Optional[Dict[str, Any]] = None) -> None:
    payload: Dict[str, Any] = {
        "params": params,
        "updatedAt": datetime.now().isoformat(),
    }
    if result:
        payload["lastRun"] = {
            "ranAt": result.get("ranAt"),
            "nodeCount": result.get("nodeCount"),
            "edgeCount": result.get("edgeCount"),
            "candidateEdgeCount": result.get("candidateEdgeCount"),
        }
    with state_path(project_dir).open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def write_result(project_dir: Path, payload: Dict[str, Any]) -> None:
    with result_path(project_dir).open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
