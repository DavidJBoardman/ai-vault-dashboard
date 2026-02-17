"""
Reconstruction utilities for vault_geometry2d Step 06.

Loads bosses and optional ideal points from the geometry2d pipeline, builds
constrained Delaunay triangulation (CDT) for rib pattern reconstruction.

Uses matched candidate UV (template positions from Step 04) for boss nodes when
available, so the rib pattern aligns with the ideal grid rather than raw detection.
"""

from __future__ import annotations

import ast
import csv
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import triangle

from src.vault_geometry2d.utils.cut_utils import RoiParams, unit_to_image


@dataclass
class ReconstructionInputs:
    """Container for artefacts needed by the reconstruction step."""

    project_dir: Path
    roi: RoiParams
    background_image: Optional[np.ndarray]
    image_path: Optional[Path]
    boss_ids: List[str]
    bosses_uv: np.ndarray  # (N, 2) unit coordinates


@dataclass
class Node:
    """Single node (boss, ideal point, or anchor) for triangulation."""

    node_id: str
    template_uv: Tuple[float, float]
    xy: Tuple[int, int]
    source: str  # "boss", "ideal", "anchor"
    boss_id: Optional[str] = None

    @property
    def uv(self) -> Tuple[float, float]:
        return self.template_uv


def _rounded_key(uv: Tuple[float, float], digits: int = 4) -> Tuple[float, float]:
    return (round(float(uv[0]), digits), round(float(uv[1]), digits))


def load_matched_candidate_uv(analysis_dir: Path) -> Dict[str, Tuple[float, float]]:
    """Load boss_id -> (u, v) for matched candidate (template) positions from Step 04.

    Prefers boss_template_match.csv (one row per boss, template_uv). Falls back to
    explanations.json (first match's template_uv per boss). Returns only bosses
    that have a matched template; missing bosses are not in the dict.
    """
    out: Dict[str, Tuple[float, float]] = {}

    csv_path = analysis_dir / "boss_template_match.csv"
    if csv_path.exists():
        with csv_path.open("r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get("matched", "False").lower() not in ("true", "1", "yes"):
                    continue
                raw = row.get("template_uv", "")
                if not raw or raw == "None":
                    continue
                try:
                    uv = ast.literal_eval(raw)
                    if isinstance(uv, (list, tuple)) and len(uv) >= 2:
                        out[str(row["boss_id"])] = (float(uv[0]), float(uv[1]))
                except (ValueError, TypeError):
                    continue
        return out

    expl_path = analysis_dir / "explanations.json"
    if expl_path.exists():
        with expl_path.open("r", encoding="utf-8") as f:
            explanations = json.load(f)
        for boss_id, info in explanations.items():
            if not isinstance(info, dict):
                continue
            matches = info.get("matches") or []
            if not matches:
                continue
            m = matches[0]
            uv = m.get("template_uv")
            if isinstance(uv, (list, tuple)) and len(uv) >= 2:
                out[str(boss_id)] = (float(uv[0]), float(uv[1]))
    return out


def load_inputs_geometry2d(
    project_dir: str | Path,
    *,
    background_path: Optional[str | Path] = None,
) -> ReconstructionInputs:
    """Load ROI, bosses, and background image from the geometry2d pipeline.

    Uses boss_report.json and analysis/bosses_combined.json (or roi_effective.json
    for ROI). Image from boss_report images.image_path_unstretched.

    Returns:
        ReconstructionInputs with roi, bosses_uv, boss_ids, background_image.
    """
    project_dir = Path(project_dir)
    analysis_dir = project_dir / "analysis"
    boss_report_path = project_dir / "boss_report.json"

    if not boss_report_path.exists():
        raise FileNotFoundError(f"boss_report.json not found: {boss_report_path}")

    with boss_report_path.open("r", encoding="utf-8") as f:
        boss_report = json.load(f)

    roi: RoiParams = dict(boss_report.get("roi") or {})
    roi.setdefault("rotation_deg", 0.0)

    if analysis_dir.exists():
        roi_effective_path = analysis_dir / "roi_effective.json"
        if roi_effective_path.exists():
            with roi_effective_path.open("r", encoding="utf-8") as f:
                roi_effective = json.load(f)
            if isinstance(roi_effective, dict):
                roi = roi_effective

    combined_path = analysis_dir / "bosses_combined.json"
    if not combined_path.exists():
        raise FileNotFoundError(f"analysis/bosses_combined.json not found; run Step 04 first.")

    with combined_path.open("r", encoding="utf-8") as f:
        combined = json.load(f)
    if not isinstance(combined, list) or len(combined) == 0:
        raise ValueError("bosses_combined.json is empty or invalid.")

    boss_ids = [str(item.get("boss_id", "")) for item in combined]
    raw_uv = np.array([item.get("boss_uv", [0.0, 0.0]) for item in combined], dtype=float)
    if raw_uv.ndim == 1:
        raw_uv = raw_uv.reshape(-1, 2)

    # Use matched candidate (template) UV from Step 04 when available so the rib
    # pattern aligns with the ideal grid; fall back to raw boss_uv for unmatched.
    matched_uv = load_matched_candidate_uv(analysis_dir) if analysis_dir.exists() else {}
    bosses_uv = np.zeros_like(raw_uv)
    used_matched = 0
    for i, bid in enumerate(boss_ids):
        if bid in matched_uv:
            bosses_uv[i] = matched_uv[bid]
            used_matched += 1
        else:
            bosses_uv[i] = raw_uv[i]
    if used_matched:
        print(f"[Step06] Using matched candidate UV for {used_matched}/{len(boss_ids)} bosses (template positions from Step 04).")

    img_path = background_path
    if img_path is None:
        images = boss_report.get("images") or {}
        raw = images.get("image_path_unstretched") or boss_report.get("image_path_unstretched")
        img_path = Path(raw) if raw else None
    else:
        img_path = Path(img_path)

    background_image = None
    if img_path and img_path.exists():
        background_image = cv2.imread(str(img_path), cv2.IMREAD_COLOR)

    return ReconstructionInputs(
        project_dir=project_dir,
        roi=roi,
        background_image=background_image,
        image_path=img_path,
        boss_ids=boss_ids,
        bosses_uv=bosses_uv,
    )


def collect_nodes(
    inputs: ReconstructionInputs,
    *,
    extra_ideal_uv: Optional[List[Tuple[float, float]]] = None,
    include_corner_anchors: bool = True,
    include_half_anchors: bool = False,
) -> List[Node]:
    """Build node list: detected bosses + optional ideal UV points + ROI anchors.

    Args:
        inputs: Loaded project inputs.
        extra_ideal_uv: Optional list of (u, v) unit coordinates to add as
            ideal boss positions (e.g. from a template or manual list).
        include_corner_anchors: Add corners (0,0), (1,0), (1,1), (0,1).
        include_half_anchors: Add mid-edges and centre (0.5,0), (1,0.5), etc.

    Returns:
        List of Node (boss, ideal, anchor) with no duplicate UVs.
    """
    nodes: List[Node] = []
    seen: Dict[Tuple[float, float], int] = {}

    def add_node(
        node_id: str,
        uv: Tuple[float, float],
        source: str,
        boss_id: Optional[str] = None,
    ) -> None:
        key = _rounded_key(uv)
        if key in seen:
            return
        xy = unit_to_image(uv, inputs.roi)
        seen[key] = len(nodes)
        nodes.append(
            Node(
                node_id=node_id,
                template_uv=(float(uv[0]), float(uv[1])),
                xy=(int(xy[0]), int(xy[1])),
                source=source,
                boss_id=boss_id,
            )
        )

    for i, (boss_id, uv) in enumerate(zip(inputs.boss_ids, inputs.bosses_uv)):
        u, v = float(uv[0]), float(uv[1])
        add_node(str(boss_id), (u, v), source="boss", boss_id=str(boss_id))

    if extra_ideal_uv:
        for j, pt in enumerate(extra_ideal_uv):
            if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                u, v = float(pt[0]), float(pt[1])
            elif isinstance(pt, dict) and "u" in pt and "v" in pt:
                u, v = float(pt["u"]), float(pt["v"])
            else:
                continue
            add_node(f"ideal_{j}", (u, v), source="ideal", boss_id=None)

    anchor_uvs: Dict[str, Tuple[float, float]] = {}
    if include_corner_anchors:
        anchor_uvs.update({
            "roi_corner_00": (0.0, 0.0),
            "roi_corner_10": (1.0, 0.0),
            "roi_corner_11": (1.0, 1.0),
            "roi_corner_01": (0.0, 1.0),
        })
    if include_half_anchors:
        anchor_uvs.update({
            "roi_mid_top": (0.5, 0.0),
            "roi_mid_right": (1.0, 0.5),
            "roi_mid_bottom": (0.5, 1.0),
            "roi_mid_left": (0.0, 0.5),
            "roi_centre": (0.5, 0.5),
        })

    existing_uvs = {node.template_uv for node in nodes}
    for name, uv in anchor_uvs.items():
        if _rounded_key(uv) in {_rounded_key(u) for u in existing_uvs}:
            continue
        add_node(name, uv, source="anchor")

    return nodes


def build_edge(
    nodes: List[Node],
    *,
    tol: float = 0.02,
    p1: Tuple[float, float],
    p2: Tuple[float, float],
) -> List[Tuple[int, int]]:
    """Build edges along the segment between p1 and p2 in UV space.

    Nodes whose UV lies within tol of the segment are ordered and connected
    consecutively.
    """
    edges: List[Tuple[int, int]] = []
    ux1, uy1 = float(p1[0]), float(p1[1])
    ux2, uy2 = float(p2[0]), float(p2[1])
    dx, dy = ux2 - ux1, uy2 - uy1
    len2 = dx * dx + dy * dy
    if len2 <= 1e-12:
        return edges

    allowed_sources = {"boss", "ideal", "anchor"}
    on_line: List[Tuple[float, int]] = []

    for idx, node in enumerate(nodes):
        if node.source not in allowed_sources:
            continue
        ux, uy = float(node.uv[0]), float(node.uv[1])
        vx, vy = ux - ux1, uy - uy1
        t = (vx * dx + vy * dy) / len2
        if t < -1e-6 or t > 1.0 + 1e-6:
            continue
        proj_x = ux1 * (1.0 - t) + ux2 * t
        proj_y = uy1 * (1.0 - t) + uy2 * t
        dist = math.hypot(ux - proj_x, uy - proj_y)
        if dist <= tol:
            on_line.append((t, idx))

    if len(on_line) < 2:
        return edges
    on_line.sort(key=lambda pair: pair[0])
    ordered = [idx for _, idx in on_line]
    for a, b in zip(ordered[:-1], ordered[1:]):
        if a != b:
            edges.append(tuple(sorted((a, b))))
    return edges


def build_edges(
    nodes: List[Node],
    segments: List[Tuple[Tuple[float, float], Tuple[float, float]]],
    *,
    tol: float = 0.02,
) -> List[Tuple[int, int]]:
    """Build edges for multiple UV segments; returns unique sorted edge list."""
    edge_set: set = set()
    for p1, p2 in segments:
        for e in build_edge(nodes, tol=tol, p1=p1, p2=p2):
            edge_set.add(e)
    return sorted(edge_set)


def segments_intersect(
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    p3: Tuple[float, float],
    p4: Tuple[float, float],
) -> bool:
    """True if segments (p1-p2) and (p3-p4) intersect at an interior point."""
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3
    x4, y4 = p4

    def orientation(o: Tuple[float, float], p: Tuple[float, float], q: Tuple[float, float]) -> int:
        ox, oy = o
        px, py = p
        qx, qy = q
        val = (py - oy) * (qx - px) - (px - ox) * (qy - py)
        if abs(val) < 1e-9:
            return 0
        return 1 if val > 0 else -1

    if (x1, y1) == (x3, y3) or (x1, y1) == (x4, y4) or (x2, y2) == (x3, y3) or (x2, y2) == (x4, y4):
        return False
    o1 = orientation(p1, p2, p3)
    o2 = orientation(p1, p2, p4)
    o3 = orientation(p3, p4, p1)
    o4 = orientation(p3, p4, p2)
    if o1 != o2 and o3 != o4:
        return True
    if o1 == 0 and o2 == 0:
        def on_segment(p: Tuple[float, float], q: Tuple[float, float], r: Tuple[float, float]) -> bool:
            return (
                min(p[0], r[0]) <= q[0] <= max(p[0], r[0])
                and min(p[1], r[1]) <= q[1] <= max(p[1], r[1])
            )
        if on_segment(p1, p3, p2) or on_segment(p1, p4, p2):
            return True
    return False


def filter_crossing_edges(
    candidate_edges: List[Tuple[int, int]],
    protected_edges: List[Tuple[int, int]],
    nodes: List[Node],
) -> List[Tuple[int, int]]:
    """Drop candidate edges that cross any protected edge (in image space)."""
    if not protected_edges:
        return candidate_edges
    filtered: List[Tuple[int, int]] = []
    for edge in candidate_edges:
        if edge in protected_edges:
            filtered.append(edge)
            continue
        i, j = edge
        p1 = nodes[i].xy
        p2 = nodes[j].xy
        crosses = False
        for (k, l) in protected_edges:
            p3, p4 = nodes[k].xy, nodes[l].xy
            if segments_intersect(p1, p2, p3, p4):
                crosses = True
                break
        if not crosses:
            filtered.append(edge)
    return filtered


def build_cdt_edges(
    nodes: List[Node],
    *,
    constraint_edges: Optional[List[Tuple[int, int]]] = None,
    roi: Optional[RoiParams] = None,
) -> List[Tuple[int, int]]:
    """Constrained Delaunay triangulation in UV space; constraint edges are enforced."""
    if len(nodes) < 2:
        return sorted(constraint_edges or [])

    verts = np.array([node.uv for node in nodes], dtype=float)
    pslg: Dict[str, Any] = {"vertices": verts}
    if constraint_edges:
        pslg["segments"] = np.array(constraint_edges, dtype=np.int32)

    tri_result = triangle.triangulate(pslg, "p")
    tri_vertices = tri_result.get("vertices")
    if tri_vertices is not None:
        tri_vertices = np.asarray(tri_vertices, dtype=float).reshape(-1, 2)
        if tri_vertices.shape[0] > len(nodes):
            if roi is None:
                # We can still build edges safely, but we cannot render new vertices in image space.
                # The renderer will skip any out-of-range edges, so do not crash here.
                pass
            else:
                # triangle may insert Steiner vertices; extend nodes so triangle indices remain valid.
                for idx in range(len(nodes), int(tri_vertices.shape[0])):
                    u, v = float(tri_vertices[idx, 0]), float(tri_vertices[idx, 1])
                    xy = unit_to_image((u, v), roi)
                    nodes.append(
                        Node(
                            node_id=f"steiner_{idx - len(verts)}",
                            template_uv=(u, v),
                            xy=(int(xy[0]), int(xy[1])),
                            source="steiner",
                            boss_id=None,
                        )
                    )
    tri_indices = tri_result.get("triangles")
    edge_set: set = set(constraint_edges or [])

    if tri_indices is not None:
        for tri in tri_indices:
            i, j, k = int(tri[0]), int(tri[1]), int(tri[2])
            for a, b in ((i, j), (j, k), (k, i)):
                if a != b:
                    edge_set.add(tuple(sorted((a, b))))

    return sorted(edge_set)


def render_nodes_overlay(
    inputs: ReconstructionInputs,
    nodes: List[Node],
    out_path: Optional[Path] = None,
    show: bool = False,
) -> Path:
    """Draw nodes on background; save to analysis/nodes_overlay.png unless out_path given."""
    if inputs.background_image is not None:
        canvas = inputs.background_image.copy()
    else:
        h = max(10, int(round(inputs.roi.get("h", 400))))
        w = max(10, int(round(inputs.roi.get("w", 400))))
        canvas = np.zeros((h, w, 3), dtype=np.uint8)
        canvas[:] = (40, 40, 40)

    for idx, node in enumerate(nodes):
        colour = (40, 255, 255) if node.source == "boss" else (255, 120, 0) if node.source == "anchor" else (255, 255, 0)
        x, y = node.xy
        r = 8 if node.source == "boss" else 6
        cv2.circle(canvas, (x, y), r, colour, -1)
        label = f"{idx}:{node.node_id}"
        cv2.putText(canvas, label, (x + 6, y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

    path = out_path or inputs.project_dir / "analysis" / "nodes_overlay.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(path), canvas)
    if show:
        cv2.imshow("nodes_overlay", canvas)
        cv2.waitKey(0)
        cv2.destroyAllWindows()
    return path


def render_reconstruction(
    inputs: ReconstructionInputs,
    nodes: List[Node],
    edges: List[Tuple[int, int]],
    out_path: Path,
    show: bool = False,
) -> None:
    """Draw rib edges and nodes on background; save image."""
    if inputs.background_image is not None:
        canvas = inputs.background_image.copy()
    else:
        h = max(10, int(round(inputs.roi.get("h", 400))))
        w = max(10, int(round(inputs.roi.get("w", 400))))
        canvas = np.zeros((h, w, 3), dtype=np.uint8)
        canvas[:] = (40, 40, 40)

    n_nodes = len(nodes)
    skipped = 0
    for i, j in edges:
        if not (0 <= int(i) < n_nodes and 0 <= int(j) < n_nodes):
            skipped += 1
            continue
        cv2.line(canvas, nodes[int(i)].xy, nodes[int(j)].xy, (0, 255, 0), 3, cv2.LINE_AA)
    if skipped:
        print(f"[Step06] Warning: skipped {skipped} invalid edge(s) (index out of range).")

    for node in nodes:
        colour = (40, 255, 255) if node.source == "boss" else (255, 120, 0) if node.source == "anchor" else (255, 255, 0)
        r = 20 if node.source == "boss" else 16
        cv2.circle(canvas, node.xy, r, colour, -1)
        label = node.boss_id or node.node_id
        cv2.putText(canvas, str(label), (node.xy[0], node.xy[1] + 10), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 3, cv2.LINE_AA)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_path), canvas)
    if show:
        cv2.imshow("reconstruction", canvas)
        cv2.waitKey(0)
        cv2.destroyAllWindows()
