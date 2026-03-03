"""Optional constrained-Delaunay comparison overlay for Geometry2D Step 4.4."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from services.geometry2d.utils.roi_math import RoiParams, unit_to_image


@dataclass
class DelaunayNode:
    node_id: str
    uv: Tuple[float, float]
    xy: Tuple[int, int]
    source: str
    boss_id: Optional[str] = None


@dataclass(frozen=True)
class ConstraintSegment:
    start: Tuple[float, float]
    end: Tuple[float, float]
    family: str


def _rounded_key(uv: Tuple[float, float], digits: int = 4) -> Tuple[float, float]:
    return (round(float(uv[0]), digits), round(float(uv[1]), digits))


def _build_nodes(
    base_nodes: Sequence[Dict[str, Any]],
    *,
    roi: RoiParams,
    include_corner_anchors: bool = True,
    extra_anchors: Sequence[Tuple[str, Tuple[float, float], str]] = (),
) -> List[DelaunayNode]:
    nodes: List[DelaunayNode] = []
    seen: set[Tuple[float, float]] = set()

    def add_node(
        node_id: str,
        uv: Tuple[float, float],
        source: str,
        boss_id: Optional[str] = None,
    ) -> None:
        key = _rounded_key(uv)
        if key in seen:
            return
        seen.add(key)
        xy = unit_to_image(uv, roi)
        nodes.append(
            DelaunayNode(
                node_id=node_id,
                uv=(float(uv[0]), float(uv[1])),
                xy=(int(round(xy[0])), int(round(xy[1]))),
                source=source,
                boss_id=boss_id,
            )
        )

    for node in base_nodes:
        try:
            u = float(node["u"])
            v = float(node["v"])
            x = int(node["x"])
            y = int(node["y"])
        except (KeyError, TypeError, ValueError):
            continue
        node_id = str(node.get("id", len(nodes)))
        boss_id = node.get("bossId")
        key = _rounded_key((u, v))
        if key in seen:
            continue
        seen.add(key)
        nodes.append(
            DelaunayNode(
                node_id=node_id,
                uv=(u, v),
                xy=(x, y),
                source=str(node.get("source", "boss")),
                boss_id=str(boss_id) if boss_id not in (None, "") else node_id,
            )
        )

    if include_corner_anchors:
        for name, uv in {
            "roi_corner_00": (0.0, 0.0),
            "roi_corner_10": (1.0, 0.0),
            "roi_corner_11": (1.0, 1.0),
            "roi_corner_01": (0.0, 1.0),
        }.items():
            add_node(name, uv, source="anchor")

    for node_id, uv, source in extra_anchors:
        add_node(node_id, uv, source=source)

    return nodes


def _segment_key(
    start: Tuple[float, float],
    end: Tuple[float, float],
    digits: int = 6,
) -> Tuple[Tuple[float, float], Tuple[float, float]]:
    p1 = (round(float(start[0]), digits), round(float(start[1]), digits))
    p2 = (round(float(end[0]), digits), round(float(end[1]), digits))
    return (p1, p2) if p1 <= p2 else (p2, p1)


def _build_constraint_segments(
    base_nodes: Sequence[Dict[str, Any]],
    *,
    use_roi_boundary: bool,
    use_cross_axes: bool,
    use_half_lines: bool,
) -> List[ConstraintSegment]:
    segments: List[ConstraintSegment] = []
    seen: set[Tuple[Tuple[float, float], Tuple[float, float], str]] = set()

    def add_segment(start: Tuple[float, float], end: Tuple[float, float], family: str) -> None:
        if math.hypot(float(end[0]) - float(start[0]), float(end[1]) - float(start[1])) <= 1e-8:
            return
        p1, p2 = _segment_key(start, end)
        key = (p1, p2, family)
        if key in seen:
            return
        seen.add(key)
        segments.append(ConstraintSegment(start=p1, end=p2, family=family))

    if use_roi_boundary:
        for start, end in (
            ((0.0, 0.0), (1.0, 0.0)),
            ((1.0, 0.0), (1.0, 1.0)),
            ((1.0, 1.0), (0.0, 1.0)),
            ((0.0, 1.0), (0.0, 0.0)),
        ):
            add_segment(start, end, "roi")

    if use_cross_axes:
        for start, end in (
            ((0.0, 0.5), (1.0, 0.5)),
            ((0.5, 0.0), (0.5, 1.0)),
        ):
            add_segment(start, end, "cross")

    if use_half_lines:
        add_segment((0.0, 0.0), (1.0, 1.0), "half_line")
        add_segment((0.0, 1.0), (1.0, 0.0), "half_line")

    return segments


def _build_edge(
    nodes: Sequence[DelaunayNode],
    *,
    tol: float,
    p1: Tuple[float, float],
    p2: Tuple[float, float],
) -> List[Tuple[int, int]]:
    edges: List[Tuple[int, int]] = []
    ux1, uy1 = float(p1[0]), float(p1[1])
    ux2, uy2 = float(p2[0]), float(p2[1])
    dx, dy = ux2 - ux1, uy2 - uy1
    len_sq = dx * dx + dy * dy
    if len_sq <= 1e-12:
        return edges

    on_line: List[Tuple[float, int]] = []
    for idx, node in enumerate(nodes):
        ux, uy = float(node.uv[0]), float(node.uv[1])
        vx, vy = ux - ux1, uy - uy1
        t = (vx * dx + vy * dy) / len_sq
        if t < -1e-6 or t > 1.0 + 1e-6:
            continue
        proj_x = ux1 * (1.0 - t) + ux2 * t
        proj_y = uy1 * (1.0 - t) + uy2 * t
        if math.hypot(ux - proj_x, uy - proj_y) <= tol:
            on_line.append((t, idx))

    if len(on_line) < 2:
        return edges
    on_line.sort(key=lambda item: item[0])
    ordered = [idx for _, idx in on_line]
    for a, b in zip(ordered[:-1], ordered[1:]):
        if a != b:
            edges.append(tuple(sorted((a, b))))
    return edges


def _build_constraint_edges(
    nodes: Sequence[DelaunayNode],
    segments: Sequence[ConstraintSegment],
    tol: float = 0.02,
) -> List[Dict[str, Any]]:
    edge_families: Dict[Tuple[int, int], set[str]] = {}
    for segment in segments:
        for edge in _build_edge(nodes, tol=tol, p1=segment.start, p2=segment.end):
            edge_families.setdefault(edge, set()).add(segment.family)

    return [
        {
            "a": int(a),
            "b": int(b),
            "constraintFamily": "+".join(sorted(families)),
        }
        for (a, b), families in sorted(edge_families.items())
    ]


def _build_extra_anchors(segments: Iterable[ConstraintSegment]) -> List[Tuple[str, Tuple[float, float], str]]:
    anchors: List[Tuple[str, Tuple[float, float], str]] = []
    seen: set[Tuple[float, float]] = set()
    for segment in segments:
        for uv in (segment.start, segment.end):
            key = _rounded_key(uv, digits=6)
            if key in seen:
                continue
            seen.add(key)
            anchors.append((f"constraint_anchor_{len(anchors)}", uv, "anchor"))
    return anchors


def build_delaunay_comparison(
    *,
    roi: RoiParams,
    base_nodes: Sequence[Dict[str, Any]],
    use_roi_boundary: bool = True,
    use_cross_axes: bool = False,
    use_half_lines: bool = False,
) -> Dict[str, Any]:
    """Build an optional constrained-Delaunay comparison overlay using the current boss nodes."""
    try:
        import numpy as np
        import triangle
    except Exception as exc:
        return {
            "mode": "delaunay",
            "available": False,
            "error": f"Delaunay comparison unavailable: {exc}",
            "nodeCount": 0,
            "edgeCount": 0,
            "constraintFamilies": [],
            "nodes": [],
            "edges": [],
        }

    constraint_segments = _build_constraint_segments(
        base_nodes,
        use_roi_boundary=use_roi_boundary,
        use_cross_axes=use_cross_axes,
        use_half_lines=use_half_lines,
    )
    nodes = _build_nodes(
        base_nodes,
        roi=roi,
        include_corner_anchors=False,
        extra_anchors=_build_extra_anchors(constraint_segments),
    )
    if len(nodes) < 2:
        return {
            "mode": "delaunay",
            "available": False,
            "error": "Not enough nodes for Delaunay comparison.",
            "nodeCount": len(nodes),
            "edgeCount": 0,
            "constraintFamilies": [],
            "nodes": [],
            "edges": [],
        }

    constraint_edges = _build_constraint_edges(nodes, constraint_segments)
    constraint_edge_map = {
        (int(edge["a"]), int(edge["b"])): str(edge.get("constraintFamily", ""))
        for edge in constraint_edges
    }
    pslg: Dict[str, Any] = {
        "vertices": np.array([node.uv for node in nodes], dtype=float),
    }
    if constraint_edges:
        pslg["segments"] = np.array([[edge["a"], edge["b"]] for edge in constraint_edges], dtype=np.int32)

    tri_result = triangle.triangulate(pslg, "p")
    tri_vertices = tri_result.get("vertices")
    if tri_vertices is not None:
        tri_vertices = np.asarray(tri_vertices, dtype=float).reshape(-1, 2)
        if tri_vertices.shape[0] > len(nodes):
            for idx in range(len(nodes), int(tri_vertices.shape[0])):
                u, v = float(tri_vertices[idx, 0]), float(tri_vertices[idx, 1])
                xy = unit_to_image((u, v), roi)
                nodes.append(
                    DelaunayNode(
                        node_id=f"steiner_{idx - len(pslg['vertices'])}",
                        uv=(u, v),
                        xy=(int(round(xy[0])), int(round(xy[1]))),
                        source="steiner",
                        boss_id=None,
                    )
                )

    edge_set = set(constraint_edge_map.keys())
    tri_indices = tri_result.get("triangles")
    if tri_indices is not None:
        for tri in tri_indices:
            i, j, k = int(tri[0]), int(tri[1]), int(tri[2])
            for a, b in ((i, j), (j, k), (k, i)):
                if a != b:
                    edge_set.add(tuple(sorted((a, b))))

        return {
            "mode": "delaunay",
            "available": True,
            "nodeCount": len(nodes),
            "edgeCount": len(edge_set),
            "constraintFamilies": sorted({segment.family for segment in constraint_segments}),
            "nodes": [
                {
                    "id": node.node_id,
                "bossId": node.boss_id,
                "source": node.source,
                "u": float(node.uv[0]),
                "v": float(node.uv[1]),
                "x": int(node.xy[0]),
                "y": int(node.xy[1]),
            }
            for node in nodes
        ],
            "edges": [
                {
                    "a": int(a),
                    "b": int(b),
                    "isConstraint": (a, b) in constraint_edge_map,
                    "constraintFamily": constraint_edge_map.get((a, b)) or None,
                    "isManual": False,
                }
                for a, b in sorted(edge_set)
            ],
        }
