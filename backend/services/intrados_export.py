"""
Export intrados polylines to 3DM, OBJ, and DXF.

Data is read at runtime from each project's folder:
  {backend/data}/projects/{project_id}/segmentations/intrados_lines.json

No sample or bundled project files are required for this module to work.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

# Same root as routers/project.py PROJECT_DATA_DIR
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def get_project_dir(project_id: str) -> Path:
    d = DATA_DIR / "projects" / project_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def load_intrados_lines(project_id: str) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """
    Load intrados line records from the project's segmentations folder.
    Returns (lines, error_message). error_message is None on success.
    """
    intrados_path = get_project_dir(project_id) / "segmentations" / "intrados_lines.json"
    if not intrados_path.exists():
        return [], "No intrados lines found. Generate them first on the Reprojection page."
    try:
        with open(intrados_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        return [], f"Could not read intrados file: {e}"
    lines = data.get("lines", [])
    if not lines:
        return [], "No intrados lines to export."
    return lines, None


def extract_polyline_points(line_data: Dict[str, Any]) -> List[Tuple[float, float, float]]:
    """Normalize points from intrados JSON (same rules as rhino_exporter)."""
    points = line_data.get("points3d") or line_data.get("points", [])
    out: List[Tuple[float, float, float]] = []
    for pt in points:
        if isinstance(pt, dict):
            x = float(pt.get("x", 0))
            y = float(pt.get("y", 0))
            z = float(pt.get("z", 0))
        else:
            x, y = float(pt[0]), float(pt[1])
            z = float(pt[2]) if len(pt) > 2 else 0.0
        out.append((x, y, z))
    return out


def _safe_obj_name(name: str, idx: int) -> str:
    s = re.sub(r"[^\w\-]+", "_", (name or "").strip())
    s = s.strip("_") or f"intrados_{idx}"
    return s[:64]


def _safe_dxf_layer(name: str) -> str:
    s = re.sub(r"[^\w\-]+", "_", (name or "INTRADOS").strip()) or "INTRADOS"
    return s[:31]


def export_intrados_to_obj(
    intrados_lines: List[Dict[str, Any]],
    output_path: str,
) -> Dict[str, Any]:
    """Wavefront OBJ: one object per line, polyline via sequential `l` indices."""
    try:
        lines_out: List[str] = [
            "# Intrados traces — Vault Analyser",
            "# Units: meters (same coordinate space as source scan)",
            "",
        ]
        vertex_index = 1
        curves = 0
        for idx, line_data in enumerate(intrados_lines):
            pts = extract_polyline_points(line_data)
            if len(pts) < 2:
                continue
            label = line_data.get("label") or line_data.get("maskLabel", f"intrados_{idx}")
            lines_out.append(f"o {_safe_obj_name(str(label), idx)}")
            for x, y, z in pts:
                lines_out.append(f"v {x:.9g} {y:.9g} {z:.9g}")
            # Polyline: l v1 v2 v3 ... (1-based)
            seg = " ".join(str(vertex_index + i) for i in range(len(pts)))
            lines_out.append(f"l {seg}")
            lines_out.append("")
            vertex_index += len(pts)
            curves += 1

        if curves == 0:
            return {"success": False, "error": "No valid polylines (need at least 2 points each)."}

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines_out))

        return {
            "success": True,
            "path": output_path,
            "curvesExported": curves,
            "message": f"Exported {curves} polylines to OBJ",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def export_intrados_to_dxf(
    intrados_lines: List[Dict[str, Any]],
    output_path: str,
    default_layer: str = "INTRADOS",
) -> Dict[str, Any]:
    """
    Minimal ASCII DXF R12: 3D LINE entity per polyline segment.
    Single named layer for all geometry (widely compatible).
    """
    try:
        layer = _safe_dxf_layer(default_layer)
        ent_lines: List[str] = []
        handle = 0x50
        polylines_exported = 0

        for idx, line_data in enumerate(intrados_lines):
            pts = extract_polyline_points(line_data)
            if len(pts) < 2:
                continue

            polylines_exported += 1
            for i in range(len(pts) - 1):
                x1, y1, z1 = pts[i]
                x2, y2, z2 = pts[i + 1]
                ent_lines.extend(
                    [
                        "0",
                        "LINE",
                        "5",
                        f"{handle:X}",
                        "8",
                        layer,
                        "10",
                        f"{x1:.9g}",
                        "20",
                        f"{y1:.9g}",
                        "30",
                        f"{z1:.9g}",
                        "11",
                        f"{x2:.9g}",
                        "21",
                        f"{y2:.9g}",
                        "31",
                        f"{z2:.9g}",
                    ]
                )
                handle += 1

        if not ent_lines:
            return {"success": False, "error": "No valid polylines (need at least 2 points each)."}

        entities_block = "\n".join(ent_lines)
        # One LAYER table entry so group code 8 resolves correctly
        full = "\n".join(
            [
                "0",
                "SECTION",
                "2",
                "HEADER",
                "9",
                "$ACADVER",
                "1",
                "AC1012",
                "9",
                "$INSUNITS",
                "70",
                "6",
                "0",
                "ENDSEC",
                "0",
                "SECTION",
                "2",
                "TABLES",
                "0",
                "TABLE",
                "2",
                "LAYER",
                "5",
                "2",
                "100",
                "AcDbSymbolTable",
                "70",
                "1",
                "0",
                "LAYER",
                "5",
                "A",
                "100",
                "AcDbLayerTableRecord",
                "2",
                layer,
                "70",
                "0",
                "62",
                "5",
                "6",
                "CONTINUOUS",
                "0",
                "ENDTAB",
                "0",
                "ENDSEC",
                "0",
                "SECTION",
                "2",
                "ENTITIES",
                entities_block,
                "0",
                "ENDSEC",
                "0",
                "EOF",
            ]
        )

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(full)

        return {
            "success": True,
            "path": output_path,
            "curvesExported": polylines_exported,
            "message": f"Exported {polylines_exported} polylines as 3D line segments to DXF",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


ExportFormat = Literal["3dm", "obj", "dxf"]


def export_intrados_for_project(
    project_id: str,
    fmt: ExportFormat,
    layer_name: str = "Intrados Lines",
    output_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Load intrados from project disk and export to exports/ under that project.

    Returns dict with success, and on success: filePath, fileName, curvesExported, message.
    """
    lines, err = load_intrados_lines(project_id)
    if err:
        return {"success": False, "error": err}

    project_dir = get_project_dir(project_id)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    def resolve_output_path(ext: str) -> Tuple[str, str]:
        # If user picked a path via Save dialog, honor it.
        if output_path:
            p = Path(output_path)
            # Ensure extension matches requested format.
            if p.suffix.lower() != f".{ext}":
                p = p.with_suffix(f".{ext}")
            p.parent.mkdir(parents=True, exist_ok=True)
            return str(p), p.name

        exports_dir = project_dir / "exports"
        exports_dir.mkdir(parents=True, exist_ok=True)
        filename = f"intrados_traces_{timestamp}.{ext}"
        return str(exports_dir / filename), filename

    if fmt == "3dm":
        from services.rhino_exporter import export_intrados_to_3dm, RHINO3DM_AVAILABLE

        if not RHINO3DM_AVAILABLE:
            return {
                "success": False,
                "error": "rhino3dm library not installed. Run: pip install rhino3dm",
            }
        resolved_path, output_filename = resolve_output_path("3dm")
        result = export_intrados_to_3dm(
            intrados_lines=lines,
            output_path=resolved_path,
            layer_name=layer_name,
        )
        if not result.get("success"):
            return result
        return {
            "success": True,
            "filePath": resolved_path,
            "fileName": output_filename,
            "curvesExported": result.get("curvesExported", 0),
            "message": result.get("message", "Exported"),
            "format": "3dm",
        }

    if fmt == "obj":
        resolved_path, output_filename = resolve_output_path("obj")
        result = export_intrados_to_obj(lines, resolved_path)
        if not result.get("success"):
            return result
        return {
            "success": True,
            "filePath": result["path"],
            "fileName": output_filename,
            "curvesExported": result.get("curvesExported", 0),
            "message": result.get("message", "Exported"),
            "format": "obj",
        }

    if fmt == "dxf":
        resolved_path, output_filename = resolve_output_path("dxf")
        result = export_intrados_to_dxf(lines, resolved_path, default_layer=_safe_dxf_layer(layer_name))
        if not result.get("success"):
            return result
        return {
            "success": True,
            "filePath": result["path"],
            "fileName": output_filename,
            "curvesExported": result.get("curvesExported", 0),
            "message": result.get("message", "Exported"),
            "format": "dxf",
        }

    return {"success": False, "error": f"Unsupported format: {fmt}"}
