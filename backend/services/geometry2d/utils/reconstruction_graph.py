"""Graph construction helpers for Geometry2D Step 4.3 reconstruction."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import triangle

from services.geometry2d.utils.roi_math import RoiParams, unit_to_image


@dataclass
class Node:
    node_id: str
    uv: Tuple[float, float]
    xy: Tuple[int, int]
    source: str  # boss | anchor | steiner
    boss_id: Optional[str] = None


def _rounded_key(uv: Tuple[float, float], digits: int = 4) -> Tuple[float, float]:
    return (round(float(uv[0]), digits), round(float(uv[1]), digits))


def segments_for_families(families: Sequence[str]) -> List[Tuple[Tuple[float, float], Tuple[float, float]]]:
    segments: List[Tuple[Tuple[float, float], Tuple[float, float]]] = [
        ((0.0, 0.0), (1.0, 0.0)),
        ((1.0, 0.0), (1.0, 1.0)),
        ((1.0, 1.0), (0.0, 1.0)),
        ((0.0, 1.0), (0.0, 0.0)),
    ]
    mapping: Dict[str, Tuple[Tuple[float, float], Tuple[float, float]]] = {
        "vertical": ((0.5, 0.0), (0.5, 1.0)),
        "horizontal": ((0.0, 0.5), (1.0, 0.5)),
        "diagonal_backslash": ((0.0, 0.0), (1.0, 1.0)),
        "diagonal_slash": ((1.0, 0.0), (0.0, 1.0)),
    }
    for family in families:
        segment = mapping.get(family)
        if segment:
            segments.append(segment)
    return segments


def collect_nodes(
    *,
    roi: RoiParams,
    boss_rows: Sequence[Tuple[str, Tuple[float, float]]],
    include_corner_anchors: bool,
    include_half_anchors: bool,
) -> List[Node]:
    nodes: List[Node] = []
    seen: Dict[Tuple[float, float], int] = {}

    def add_node(node_id: str, uv: Tuple[float, float], source: str, boss_id: Optional[str] = None) -> None:
        key = _rounded_key(uv)
        if key in seen:
            return
        px, py = unit_to_image(uv, roi)
        seen[key] = len(nodes)
        nodes.append(
            Node(
                node_id=node_id,
                uv=(float(uv[0]), float(uv[1])),
                xy=(int(round(px)), int(round(py))),
                source=source,
                boss_id=boss_id,
            )
        )

    for boss_id, uv in boss_rows:
        add_node(str(boss_id), uv, "boss", boss_id=str(boss_id))

    if include_corner_anchors:
        for name, uv in {
            "roi_corner_00": (0.0, 0.0),
            "roi_corner_10": (1.0, 0.0),
            "roi_corner_11": (1.0, 1.0),
            "roi_corner_01": (0.0, 1.0),
        }.items():
            add_node(name, uv, "anchor")

    if include_half_anchors:
        for name, uv in {
            "roi_mid_top": (0.5, 0.0),
            "roi_mid_right": (1.0, 0.5),
            "roi_mid_bottom": (0.5, 1.0),
            "roi_mid_left": (0.0, 0.5),
            "roi_centre": (0.5, 0.5),
        }.items():
            add_node(name, uv, "anchor")

    return nodes


def build_segment_edges(
    nodes: List[Node],
    segments: Sequence[Tuple[Tuple[float, float], Tuple[float, float]]],
    *,
    tol: float,
) -> List[Tuple[int, int]]:
    edge_set: set = set()
    for p1, p2 in segments:
        edge_set.update(_build_segment_edges_single(nodes, p1, p2, tol=tol))
    return sorted(edge_set)


def build_knn_candidate_edges(
    nodes: Sequence[Node],
    *,
    k: int = 6,
    max_distance_uv: float = 0.95,
) -> List[Tuple[int, int]]:
    """Build sparse candidate edges via k-nearest neighbors in UV space."""
    n_nodes = len(nodes)
    if n_nodes < 2:
        return []

    verts = np.array([node.uv for node in nodes], dtype=float).reshape(-1, 2)
    # Pairwise squared distances in UV space.
    diff = verts[:, None, :] - verts[None, :, :]
    d2 = np.sum(diff * diff, axis=2)
    np.fill_diagonal(d2, np.inf)

    k_eff = max(1, min(int(k), n_nodes - 1))
    max_d2 = float(max_distance_uv) * float(max_distance_uv)
    edge_set: set = set()
    for i in range(n_nodes):
        row = d2[i]
        nearest = np.argpartition(row, kth=k_eff - 1)[:k_eff]
        for j in nearest:
            jj = int(j)
            if not np.isfinite(row[jj]):
                continue
            if row[jj] > max_d2:
                continue
            edge_set.add(tuple(sorted((i, jj))))
    return sorted(edge_set)


def _build_segment_edges_single(
    nodes: List[Node],
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    *,
    tol: float,
) -> List[Tuple[int, int]]:
    ux1, uy1 = float(p1[0]), float(p1[1])
    ux2, uy2 = float(p2[0]), float(p2[1])
    dx, dy = ux2 - ux1, uy2 - uy1
    len2 = dx * dx + dy * dy
    if len2 <= 1e-12:
        return []

    on_line: List[Tuple[float, int]] = []
    for idx, node in enumerate(nodes):
        if node.source not in {"boss", "anchor"}:
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
        return []
    on_line.sort(key=lambda pair: pair[0])
    ordered = [idx for _, idx in on_line]
    return [tuple(sorted((a, b))) for a, b in zip(ordered[:-1], ordered[1:]) if a != b]


def build_cdt_edges(
    nodes: List[Node],
    *,
    constraint_edges: Sequence[Tuple[int, int]],
    roi: RoiParams,
) -> List[Tuple[int, int]]:
    if len(nodes) < 2:
        return list(constraint_edges)

    verts = np.array([node.uv for node in nodes], dtype=float)
    pslg: Dict[str, Any] = {"vertices": verts}
    if constraint_edges:
        pslg["segments"] = np.array(list(constraint_edges), dtype=np.int32)

    # Use constrained PSLG mode only when segments exist.
    # For unconstrained runs we request plain Delaunay triangulation.
    tri_result = triangle.triangulate(pslg, "p") if constraint_edges else triangle.triangulate(pslg, "Q")
    tri_vertices = tri_result.get("vertices")
    if tri_vertices is not None:
        tri_vertices = np.asarray(tri_vertices, dtype=float).reshape(-1, 2)
        if tri_vertices.shape[0] > len(nodes):
            for idx in range(len(nodes), int(tri_vertices.shape[0])):
                u, v = float(tri_vertices[idx, 0]), float(tri_vertices[idx, 1])
                px, py = unit_to_image((u, v), roi)
                nodes.append(
                    Node(
                        node_id=f"steiner_{idx - len(verts)}",
                        uv=(u, v),
                        xy=(int(round(px)), int(round(py))),
                        source="steiner",
                    )
                )

    edge_set: set = set(constraint_edges)
    tri_indices = tri_result.get("triangles")
    if tri_indices is not None:
        for tri in tri_indices:
            i, j, k = int(tri[0]), int(tri[1]), int(tri[2])
            for a, b in ((i, j), (j, k), (k, i)):
                if a != b:
                    edge_set.add(tuple(sorted((a, b))))
    return sorted(edge_set)
