"""
Step 06 — Reconstruct ideal rib pattern using constrained Delaunay triangulation.

Reads bosses from the geometry2d pipeline (Step 02–04) and optionally an extra
list of ideal boss stone UV coordinates. Builds CDT over all nodes with
optional constraint segments (boundary, cross lines, diagonals) and saves
the reconstruction image.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional, Tuple

from src.vault_geometry2d.utils.reconstruction_utils import (
    load_inputs_geometry2d,
    collect_nodes,
    build_edges,
    build_cdt_edges,
    render_reconstruction,
    render_nodes_overlay,
)


def load_extra_ideal_uv(path: str | Path) -> List[Tuple[float, float]]:
    """Load extra ideal boss UV from a JSON file.

    Accepts:
    - List of [u, v] lists: [[0.25, 0.5], [0.75, 0.5], ...]
    - List of objects with u/v: [{"u": 0.25, "v": 0.5}, ...]
    """
    path = Path(path)
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        return []
    out: List[Tuple[float, float]] = []
    for item in data:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            out.append((float(item[0]), float(item[1])))
        elif isinstance(item, dict) and "u" in item and "v" in item:
            out.append((float(item["u"]), float(item["v"])))
    return out


def reconstruct_delaunay(
    project_dir: str | Path,
    *,
    extra_ideal_uv_path: Optional[str | Path] = None,
    extra_ideal_uv: Optional[List[Tuple[float, float]]] = None,
    background_path: Optional[str | Path] = None,
    out_path: Optional[str | Path] = None,
    include_corner_anchors: bool = True,
    include_half_anchors: bool = False,
    include_cross: bool = False,
    cross_tolerance: float = 0.02,
    show: bool = False,
) -> Path:
    """Reconstruct rib pattern using constrained Delaunay triangulation.

    1. Load nodes: bosses from analysis/bosses_combined.json + optional ideal UV.
    2. Optionally add constraint segments (boundary, cross lines, diagonals).
    3. Build constrained Delaunay triangulation.
    4. Render and save.

    Args:
        project_dir: Project directory (contains boss_report.json, analysis/).
        extra_ideal_uv_path: Path to JSON file with list of ideal (u,v) points.
        extra_ideal_uv: In-code list of (u, v) ideal points (overrides file if both set).
        background_path: Override background image path.
        out_path: Output image path (default: project_dir/analysis/reconstruction_delaunay.png).
        include_corner_anchors: Add ROI corner nodes (0,0), (1,0), (1,1), (0,1).
        include_half_anchors: Add mid-edge and centre anchors.
        include_cross: Add vertical/horizontal cross and diagonals as constraints.
        cross_tolerance: Tolerance for nodes on constraint segments.
        show: If True, display the reconstruction window.

    Returns:
        Path to the saved reconstruction image.
    """
    project_dir = Path(project_dir)
    inputs = load_inputs_geometry2d(project_dir, background_path=background_path)

    ideal_uv: List[Tuple[float, float]] = list(extra_ideal_uv) if extra_ideal_uv else []
    if extra_ideal_uv_path and not ideal_uv:
        ideal_uv = load_extra_ideal_uv(extra_ideal_uv_path)
    if ideal_uv:
        print(f"[Step06] Loaded {len(ideal_uv)} extra ideal boss UV points.")

    nodes = collect_nodes(
        inputs,
        extra_ideal_uv=ideal_uv if ideal_uv else None,
        include_corner_anchors=include_corner_anchors,
        include_half_anchors=include_half_anchors,
    )
    print(f"[Step06] Nodes: {len(nodes)} (boss + ideal + anchors)")

    render_nodes_overlay(inputs, nodes, out_path=None, show=False)

    cross_edges: List[Tuple[int, int]] = []
    if include_cross:
        boundary_segments = [
            ((0.0, 0.0), (1.0, 0.0)),
            ((1.0, 0.0), (1.0, 1.0)),
            ((1.0, 1.0), (0.0, 1.0)),
            ((0.0, 1.0), (0.0, 0.0)),
        ]
        cross_segments = [
            ((0.5, 0.0), (0.5, 1.0)),
            ((0.0, 0.5), (1.0, 0.5)),
        ]
        diag_segments = [
            ((0.0, 0.0), (1.0, 1.0)),
            ((1.0, 0.0), (0.0, 1.0)),
        ]
        cross_edges = build_edges(
            nodes,
            boundary_segments + cross_segments + diag_segments,
            tol=cross_tolerance,
        )
        print(f"[Step06] Constraint edges: {len(cross_edges)}")

    edges = build_cdt_edges(
        nodes,
        constraint_edges=cross_edges if cross_edges else None,
        roi=inputs.roi,
    )

    target = Path(out_path) if out_path else (project_dir / "analysis" / "reconstruction_delaunay.png")
    render_reconstruction(inputs, nodes, edges, target, show=show)

    print(f"[Step06] Delaunay: nodes={len(nodes)} edges={len(edges)} saved={target}")
    return target


def run_step06(
    project_dir: str | Path,
    *,
    extra_ideal_uv_path: Optional[str | Path] = None,
    background_path: Optional[str | Path] = None,
    out_path: Optional[str | Path] = None,
    include_corner_anchors: bool = True,
    include_half_anchors: bool = False,
    include_cross: bool = False,
    cross_tolerance: float = 0.02,
    show: bool = False,
) -> Path:
    """Reconstruct rib pattern with constrained Delaunay. Returns path to saved image."""
    return reconstruct_delaunay(
        project_dir,
        extra_ideal_uv_path=extra_ideal_uv_path,
        background_path=background_path,
        out_path=out_path,
        include_corner_anchors=include_corner_anchors,
        include_half_anchors=include_half_anchors,
        include_cross=include_cross,
        cross_tolerance=cross_tolerance,
        show=show,
    )


def _parse_argv(argv: list[str]) -> tuple[Path, dict]:
    project_dir = Path(argv[0]) if argv else Path(".")
    opts: dict = {}
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--extra-ideal-uv" and i + 1 < len(argv):
            opts["extra_ideal_uv_path"] = Path(argv[i + 1]); i += 2
        elif a == "--background" and i + 1 < len(argv):
            opts["background_path"] = argv[i + 1]; i += 2
        elif a == "--out" and i + 1 < len(argv):
            opts["out_path"] = argv[i + 1]; i += 2
        elif a == "--no-corner-anchors":
            opts["include_corner_anchors"] = False; i += 1
        elif a == "--half-anchors":
            opts["include_half_anchors"] = True; i += 1
        elif a == "--cross":
            opts["include_cross"] = True; i += 1
        elif a == "--tol" and i + 1 < len(argv):
            opts["cross_tolerance"] = float(argv[i + 1]); i += 2
        elif a == "--show":
            opts["show"] = True; i += 1
        else:
            i += 1
    return project_dir, opts


if __name__ == "__main__":
    import sys
    argv = sys.argv[1:]
    if not argv:
        print("Usage: step06_delaunay_ribs.py <project_dir> [--cross] [--half-anchors] ...")
        sys.exit(1)
    project_dir, opts = _parse_argv(argv)
    run_step06(project_dir, **opts)
    print("[Step06] Done.")
