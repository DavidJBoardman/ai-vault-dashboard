"""I/O helpers for Geometry2D Step 4.4 bay plan reconstruction."""

from __future__ import annotations

import ast
import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from services.geometry2d.utils.roi_math import RoiParams


def load_json_object(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, dict):
        raise ValueError(f"Expected JSON object at {path}")
    return raw


def bay_plan_reconstruction_dir(project_dir: Path) -> Path:
    old_dir = project_dir / "2d_geometry" / "reconstruction"
    out = project_dir / "2d_geometry" / "bay_plan_reconstruction"
    if old_dir.exists() and not out.exists():
        old_dir.rename(out)
    out.mkdir(parents=True, exist_ok=True)
    return out


def state_path(project_dir: Path) -> Path:
    return bay_plan_reconstruction_dir(project_dir) / "state.json"


def result_path(project_dir: Path) -> Path:
    return bay_plan_reconstruction_dir(project_dir) / "result.json"


def output_image_path(project_dir: Path) -> Path:
    return bay_plan_reconstruction_dir(project_dir) / "reconstruction_delaunay.png"


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
    def key(row: Tuple[str, Tuple[float, float]]) -> Tuple[int, str]:
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


def load_boss_rows(project_dir: Path, _roi: RoiParams) -> List[Dict[str, Any]]:
    # Baseline fallback from extracted bosses.
    raw_rows = _load_raw_boss_rows(project_dir)
    raw_by_id = {str(row["id"]): row for row in raw_rows}

    # Preferred source from Step 4.2 matching output:
    # matched -> template_uv (ideal), unmatched -> boss_uv (raw from step 4.2 point state).
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
        return raw_rows

    resolved: Dict[str, Dict[str, Any]] = {}
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            boss_id = str(row.get("boss_id", "")).strip()
            if not boss_id:
                continue
            matched = str(row.get("matched", "")).strip().lower() in ("true", "1", "yes")
            ideal_uv = _parse_uv_pair(str(row.get("template_uv", "")))
            raw_uv = _parse_uv_pair(str(row.get("boss_uv", "")))

            if matched and ideal_uv is not None:
                resolved[boss_id] = {"id": boss_id, "uv": ideal_uv, "source": "ideal"}
                continue
            if raw_uv is not None:
                resolved[boss_id] = {"id": boss_id, "uv": raw_uv, "source": "raw"}
                continue
            fallback = raw_by_id.get(boss_id)
            if fallback:
                resolved[boss_id] = fallback

    # Ensure any raw bosses missing from CSV still appear.
    for boss_id, row in raw_by_id.items():
        if boss_id not in resolved:
            resolved[boss_id] = row

    return _sort_boss_rows(list(resolved.values()))


def resolve_params(project_dir: Path, default_params: Dict[str, Any]) -> Dict[str, Any]:
    params = dict(default_params)
    s_path = state_path(project_dir)
    if s_path.exists():
        state_payload = load_json_object(s_path)
        stored = state_payload.get("params")
        if isinstance(stored, dict):
            params.update(stored)
    params["includeCornerAnchors"] = bool(params.get("includeCornerAnchors", True))
    params["includeHalfAnchors"] = bool(params.get("includeHalfAnchors", False))
    params["crossTolerance"] = max(0.001, min(0.2, float(params.get("crossTolerance", 0.02))))
    params["corridorWidthPx"] = int(max(3, min(256, int(params.get("corridorWidthPx", 36)))))
    params["familyIncludeThreshold"] = float(max(0.0, min(1.0, float(params.get("familyIncludeThreshold", 0.25)))))
    params["familyOptionalThreshold"] = float(max(0.0, min(1.0, float(params.get("familyOptionalThreshold", 0.15)))))
    params["candidateKnn"] = int(max(1, min(32, int(params.get("candidateKnn", 6)))))
    params["candidateMaxDistanceUv"] = float(max(0.1, min(2.0, float(params.get("candidateMaxDistanceUv", 0.95)))))
    params["familyPriorWeight"] = float(max(0.0, min(1.0, float(params.get("familyPriorWeight", 0.2)))))
    params["constraintMinScore"] = float(max(0.0, min(1.0, float(params.get("constraintMinScore", 0.34)))))
    params["constraintPerBossMinScore"] = float(max(0.0, min(1.0, float(params.get("constraintPerBossMinScore", 0.2)))))
    params["edgeKeepScore"] = float(max(0.0, min(1.0, float(params.get("edgeKeepScore", 0.18)))))
    params["enforcePlanarity"] = bool(params.get("enforcePlanarity", True))
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
            "enabledConstraintFamilies": result.get("enabledConstraintFamilies", []),
        }
    with state_path(project_dir).open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def write_result(project_dir: Path, payload: Dict[str, Any]) -> None:
    with result_path(project_dir).open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
