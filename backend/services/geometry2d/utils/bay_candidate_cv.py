"""Node-centric angular candidate generation for Geometry2D Step 4.4."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

from services.geometry2d.utils.roi_math import RoiParams, unit_to_image

SHORT_INTERNAL_EDGE_DISTANCE_UV = 0.20
SHORT_INTERNAL_EDGE_SCORE_RELIEF = 0.08


@dataclass
class Node:
    node_id: str
    uv: Tuple[float, float]
    xy: Tuple[int, int]
    source: str
    boss_id: Optional[str] = None


def collect_boss_nodes(
    *,
    roi: RoiParams,
    boss_rows: Sequence[Dict[str, object]],
) -> List[Node]:
    nodes: List[Node] = []
    for row in boss_rows:
        uv = (float(row["uv"][0]), float(row["uv"][1]))  # type: ignore[index]
        px, py = unit_to_image(uv, roi)
        nodes.append(
            Node(
                node_id=str(row["id"]),
                uv=uv,
                xy=(int(round(px)), int(round(py))),
                source=str(row.get("source", "raw")),
                boss_id=str(row["id"]),
            )
        )
    return nodes


def _wrap_angle_deg(angle_deg: float) -> float:
    wrapped = float(angle_deg) % 360.0
    return wrapped + 360.0 if wrapped < 0.0 else wrapped


def _angle_delta_deg(a_deg: float, b_deg: float) -> float:
    delta = abs(_wrap_angle_deg(a_deg) - _wrap_angle_deg(b_deg))
    return float(min(delta, 360.0 - delta))


def _draw_segment_corridor(
    canvas_shape: Tuple[int, int],
    p1: Tuple[int, int],
    p2: Tuple[int, int],
    width_px: int,
) -> np.ndarray:
    h, w = canvas_shape
    corridor = np.zeros((h, w), dtype=np.uint8)
    cv2.line(
        corridor,
        (int(p1[0]), int(p1[1])),
        (int(p2[0]), int(p2[1])),
        255,
        max(1, int(width_px)),
        lineType=cv2.LINE_AA,
    )
    return corridor


def _boundary_sides(node: Node, tol_uv: float) -> List[str]:
    u = float(node.uv[0])
    v = float(node.uv[1])
    sides: List[str] = []
    if u <= float(tol_uv):
        sides.append("left")
    if u >= 1.0 - float(tol_uv):
        sides.append("right")
    if v <= float(tol_uv):
        sides.append("top")
    if v >= 1.0 - float(tol_uv):
        sides.append("bottom")
    return sides


def _candidate_min_score_for_edge(
    nodes: Sequence[Node],
    *,
    i: int,
    j: int,
    candidate_min_score: float,
    boundary_tolerance_uv: float,
) -> float:
    du = float(nodes[j].uv[0] - nodes[i].uv[0])
    dv = float(nodes[j].uv[1] - nodes[i].uv[1])
    distance_uv = float(math.sqrt(du * du + dv * dv))
    if distance_uv > float(SHORT_INTERNAL_EDGE_DISTANCE_UV):
        return float(candidate_min_score)

    if _boundary_sides(nodes[i], boundary_tolerance_uv) or _boundary_sides(nodes[j], boundary_tolerance_uv):
        return float(candidate_min_score)

    return float(max(0.0, candidate_min_score - float(SHORT_INTERNAL_EDGE_SCORE_RELIEF)))


def _segment_overlap_score(
    mask: np.ndarray,
    *,
    p1: Tuple[int, int],
    p2: Tuple[int, int],
    corridor_width_px: int,
) -> float:
    if mask.size == 0:
        return 0.0
    corridor = _draw_segment_corridor(mask.shape[:2], p1, p2, corridor_width_px)
    corridor_bool = corridor > 0
    total = int(np.count_nonzero(corridor_bool))
    if total <= 0:
        return 0.0
    overlap = np.logical_and(corridor_bool, mask > 0)
    return float(np.count_nonzero(overlap) / total)


def _third_boss_penalty(
    *,
    nodes: Sequence[Node],
    i: int,
    j: int,
    segment_pad_px: float,
) -> float:
    if segment_pad_px <= 0.0:
        return 0.0
    ax, ay = float(nodes[i].xy[0]), float(nodes[i].xy[1])
    bx, by = float(nodes[j].xy[0]), float(nodes[j].xy[1])
    dx = bx - ax
    dy = by - ay
    len_sq = dx * dx + dy * dy
    if len_sq <= 1e-9:
        return 0.0

    best_penalty = 0.0
    for k, node in enumerate(nodes):
        if k in (i, j):
            continue
        px, py = float(node.xy[0]), float(node.xy[1])
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len_sq))
        qx = ax + t * dx
        qy = ay + t * dy
        dist = math.hypot(px - qx, py - qy)
        if dist < float(segment_pad_px):
            best_penalty = max(best_penalty, 1.0 - (dist / max(float(segment_pad_px), 1e-6)))
    return float(best_penalty)


def _finalise_directed_candidates(
    directed_successes: Dict[Tuple[int, int], Dict[str, object]],
    *,
    nodes: Sequence[Node],
    min_directional_support: int,
    mutual_only: bool,
) -> Tuple[Dict[int, List[Dict[str, object]]], List[Dict[str, object]], List[Dict[str, object]]]:
    boss_spokes: Dict[int, List[Dict[str, object]]] = {idx: [] for idx in range(len(nodes))}
    diagnostics: List[Dict[str, object]] = []

    accepted_count_by_node: Dict[int, int] = {idx: 0 for idx in range(len(nodes))}
    for (i, j), item in directed_successes.items():
        accepted_count_by_node[int(i)] = accepted_count_by_node.get(int(i), 0) + 1
        boss_spokes[int(i)].append(
            {
                "bossIndex": int(i),
                "bossId": str(nodes[int(i)].boss_id or nodes[int(i)].node_id),
                "angleDeg": float(item["angleDeg"]),
                "strength": float(item["score"]),
                "supportCount": int(min_directional_support),
                "ribIds": [],
                "labels": [str(nodes[int(j)].boss_id or nodes[int(j)].node_id)],
            }
        )

    for idx, node in enumerate(nodes):
        diagnostics.append(
            {
                "bossIndex": int(idx),
                "bossId": str(node.boss_id or node.node_id),
                "acceptedDirectionCount": int(accepted_count_by_node.get(idx, 0)),
            }
        )

    undirected: List[Dict[str, object]] = []
    used_pairs = set()
    for (i, j), forward in directed_successes.items():
        edge = tuple(sorted((int(i), int(j))))
        if edge in used_pairs:
            continue
        reverse = directed_successes.get((j, i))
        if mutual_only and reverse is None:
            continue

        scores = [float(forward["score"])]
        overlap_scores = [float(forward["rawOverlap"])]
        sources = {str(forward.get("candidateSource", "angular_nearest"))}
        if reverse is not None:
            scores.append(float(reverse["score"]))
            overlap_scores.append(float(reverse["rawOverlap"]))
            sources.add(str(reverse.get("candidateSource", "angular_nearest")))

        angle_ab = float(forward["angleDeg"]) if int(edge[0]) == i else float(reverse["angleDeg"]) if reverse is not None else float(forward["angleDeg"])
        undirected.append(
            {
                "a": int(edge[0]),
                "b": int(edge[1]),
                "score": float(sum(scores) / len(scores)),
                "distanceUv": float(forward["distanceUv"]),
                "angleAB": angle_ab,
                "angleBA": _wrap_angle_deg(angle_ab + 180.0),
                "angleErrorA": 0.0,
                "angleErrorB": 0.0,
                "spokeStrengthA": float(scores[0]),
                "spokeStrengthB": float(scores[-1]),
                "spokeSupportCountA": 1,
                "spokeSupportCountB": 1 if reverse is not None else 0,
                "thirdBossPenalty": float(max(float(forward["thirdBossPenalty"]), float(reverse["thirdBossPenalty"]) if reverse is not None else 0.0)),
                "mutual": bool(reverse is not None),
                "overlapScore": float(sum(overlap_scores) / len(overlap_scores)),
                "candidateSource": "+".join(sorted(sources)),
            }
        )
        used_pairs.add(edge)

    undirected.sort(key=lambda row: (float(row["score"]), float(row["overlapScore"])), reverse=True)
    return boss_spokes, undirected, diagnostics


def build_angular_nearest_candidates(
    nodes: Sequence[Node],
    *,
    rib_mask: np.ndarray,
    angle_tolerance_deg: float,
    candidate_min_score: float,
    candidate_max_distance_uv: float,
    corridor_width_px: int,
    min_directional_support: int,
    mutual_only: bool,
    boundary_tolerance_uv: float = 0.08,
) -> Tuple[Dict[int, List[Dict[str, object]]], List[Dict[str, object]], List[Dict[str, object]]]:
    """Generate candidates by nearest-per-direction, then confirm with rib overlap."""
    if rib_mask.size == 0 or len(nodes) < 2:
        return {}, [], []

    angle_tol = float(max(1.0, angle_tolerance_deg))
    max_dist_sq = float(candidate_max_distance_uv) * float(candidate_max_distance_uv)
    corridor_px = max(1, int(corridor_width_px))
    directed_successes: Dict[Tuple[int, int], Dict[str, object]] = {}
    diagnostics: List[Dict[str, object]] = []

    for i, node_i in enumerate(nodes):
        neighbours: List[Dict[str, float | int]] = []
        for j, node_j in enumerate(nodes):
            if i == j:
                continue
            du = float(node_j.uv[0] - node_i.uv[0])
            dv = float(node_j.uv[1] - node_i.uv[1])
            dist_sq = du * du + dv * dv
            if dist_sq > max_dist_sq:
                continue
            angle_deg = _wrap_angle_deg(
                math.degrees(
                    math.atan2(float(node_j.xy[1] - node_i.xy[1]), float(node_j.xy[0] - node_i.xy[0]))
                )
            )
            neighbours.append(
                {
                    "j": int(j),
                    "angleDeg": float(angle_deg),
                    "distanceUv": float(math.sqrt(dist_sq)),
                }
            )

        neighbours.sort(key=lambda row: float(row["distanceUv"]))
        kept: List[Dict[str, float | int]] = []
        for row in neighbours:
            angle_deg = float(row["angleDeg"])
            if any(_angle_delta_deg(angle_deg, float(item["angleDeg"])) <= angle_tol for item in kept):
                continue
            kept.append(row)

        accepted_local = 0
        for row in kept:
            j = int(row["j"])
            min_score = _candidate_min_score_for_edge(
                nodes,
                i=i,
                j=j,
                candidate_min_score=float(candidate_min_score),
                boundary_tolerance_uv=float(boundary_tolerance_uv),
            )
            overlap_score = _segment_overlap_score(
                rib_mask,
                p1=node_i.xy,
                p2=nodes[j].xy,
                corridor_width_px=corridor_px,
            )

            penalty = _third_boss_penalty(
                nodes=nodes,
                i=i,
                j=j,
                segment_pad_px=float(corridor_px) * 1.2,
            )
            final_score = float(
                max(
                    0.0,
                    min(
                        1.0,
                        overlap_score
                        # + 0.35 * endpoint_score
                        - 0.20 * penalty,
                    ),
                )
            )
            if final_score < float(min_score):
                continue

            directed_successes[(i, j)] = {
                "a": int(i),
                "b": int(j),
                "score": final_score,
                "rawOverlap": float(overlap_score),
                "distanceUv": float(row["distanceUv"]),
                "angleDeg": float(row["angleDeg"]),
                "thirdBossPenalty": float(penalty),
                "candidateSource": "angular_nearest",
            }
            accepted_local += 1

        diagnostics.append(
            {
                "bossIndex": int(i),
                "bossId": str(node_i.boss_id or node_i.node_id),
                "candidateDirectionCount": int(len(kept)),
                "acceptedDirectionCount": int(accepted_local),
            }
        )

    boss_spokes, undirected, finalise_diagnostics = _finalise_directed_candidates(
        directed_successes,
        nodes=nodes,
        min_directional_support=min_directional_support,
        mutual_only=mutual_only,
    )
    return boss_spokes, undirected, diagnostics + finalise_diagnostics


def build_knn_candidates(
    nodes: Sequence[Node],
    *,
    rib_mask: np.ndarray,
    candidate_knn: int,
    candidate_min_score: float,
    candidate_max_distance_uv: float,
    corridor_width_px: int,
    min_directional_support: int,
    mutual_only: bool,
    boundary_tolerance_uv: float = 0.08,
) -> Tuple[Dict[int, List[Dict[str, object]]], List[Dict[str, object]], List[Dict[str, object]]]:
    """Generate candidates from k-nearest neighbours, then confirm with rib overlap."""
    if rib_mask.size == 0 or len(nodes) < 2:
        return {}, [], []

    max_dist_sq = float(candidate_max_distance_uv) * float(candidate_max_distance_uv)
    corridor_px = max(1, int(corridor_width_px))
    directed_successes: Dict[Tuple[int, int], Dict[str, object]] = {}
    diagnostics: List[Dict[str, object]] = []
    k_eff = max(1, int(candidate_knn))

    for i, node_i in enumerate(nodes):
        neighbours: List[Dict[str, float | int]] = []
        for j, node_j in enumerate(nodes):
            if i == j:
                continue
            du = float(node_j.uv[0] - node_i.uv[0])
            dv = float(node_j.uv[1] - node_i.uv[1])
            dist_sq = du * du + dv * dv
            if dist_sq > max_dist_sq:
                continue
            angle_deg = _wrap_angle_deg(
                math.degrees(
                    math.atan2(float(node_j.xy[1] - node_i.xy[1]), float(node_j.xy[0] - node_i.xy[0]))
                )
            )
            neighbours.append(
                {
                    "j": int(j),
                    "angleDeg": float(angle_deg),
                    "distanceUv": float(math.sqrt(dist_sq)),
                }
            )
        neighbours.sort(key=lambda row: float(row["distanceUv"]))
        shortlisted = neighbours[:k_eff]
        accepted_local = 0
        for row in shortlisted:
            j = int(row["j"])
            min_score = _candidate_min_score_for_edge(
                nodes,
                i=i,
                j=j,
                candidate_min_score=float(candidate_min_score),
                boundary_tolerance_uv=float(boundary_tolerance_uv),
            )
            overlap_score = _segment_overlap_score(
                rib_mask,
                p1=node_i.xy,
                p2=nodes[j].xy,
                corridor_width_px=corridor_px,
            )
            penalty = _third_boss_penalty(
                nodes=nodes,
                i=i,
                j=j,
                segment_pad_px=float(corridor_px) * 1.2,
            )
            final_score = float(max(0.0, min(1.0, overlap_score - 0.20 * penalty)))
            if final_score < float(min_score):
                continue
            directed_successes[(i, j)] = {
                "a": int(i),
                "b": int(j),
                "score": final_score,
                "rawOverlap": float(overlap_score),
                "distanceUv": float(row["distanceUv"]),
                "angleDeg": float(row["angleDeg"]),
                "thirdBossPenalty": float(penalty),
                "candidateSource": "knn",
            }
            accepted_local += 1
        diagnostics.append(
            {
                "bossIndex": int(i),
                "bossId": str(node_i.boss_id or node_i.node_id),
                "candidateDirectionCount": int(len(shortlisted)),
                "acceptedDirectionCount": int(accepted_local),
                "candidateSource": "knn",
            }
        )

    boss_spokes, undirected, finalise_diagnostics = _finalise_directed_candidates(
        directed_successes,
        nodes=nodes,
        min_directional_support=min_directional_support,
        mutual_only=mutual_only,
    )
    return boss_spokes, undirected, diagnostics + finalise_diagnostics


def merge_candidate_sets(
    *candidate_sets: Sequence[Dict[str, object]],
) -> List[Dict[str, object]]:
    merged: Dict[Tuple[int, int], Dict[str, object]] = {}
    for candidate_set in candidate_sets:
        for raw in candidate_set:
            edge = tuple(sorted((int(raw["a"]), int(raw["b"]))))
            if edge not in merged or float(raw.get("score", 0.0)) > float(merged[edge].get("score", 0.0)):
                merged[edge] = dict(raw)
            else:
                existing_source = str(merged[edge].get("candidateSource", ""))
                new_source = str(raw.get("candidateSource", ""))
                if new_source and new_source not in existing_source.split("+"):
                    merged[edge]["candidateSource"] = "+".join(sorted(filter(None, set(existing_source.split("+") + [new_source]))))
    ordered = sorted(
        merged.values(),
        key=lambda row: (float(row.get("score", 0.0)), float(row.get("overlapScore", row.get("score", 0.0)))),
        reverse=True,
    )
    return ordered


def augment_with_boundary_edges(
    nodes: Sequence[Node],
    candidate_edges: Sequence[Dict[str, object]],
    *,
    rib_mask: np.ndarray,
    corridor_width_px: int,
    boundary_tolerance_uv: float,
    boundary_edge_score_floor: float,
) -> List[Dict[str, object]]:
    """Inject adjacent ROI-boundary edges into a local candidate set when missing."""
    merged: Dict[Tuple[int, int], Dict[str, object]] = {
        tuple(sorted((int(edge["a"]), int(edge["b"])))): dict(edge)
        for edge in candidate_edges
    }
    forced_boundary_edges = _mandatory_boundary_edges(nodes, tol_uv=boundary_tolerance_uv)
    for edge in forced_boundary_edges:
        existing = merged.get(edge)
        if existing is not None:
            existing["isBoundaryForced"] = True
            continue
        metric = _edge_metric(
            nodes,
            rib_mask,
            edge=edge,
            corridor_width_px=corridor_width_px,
        )
        score = float(max(float(metric["score"]), float(boundary_edge_score_floor)))
        merged[edge] = {
            "a": int(edge[0]),
            "b": int(edge[1]),
            "score": score,
            "distanceUv": float(metric["distanceUv"]),
            "angleAB": float(metric["angleAB"]),
            "angleBA": float(metric["angleBA"]),
            "angleErrorA": 0.0,
            "angleErrorB": 0.0,
            "spokeStrengthA": score,
            "spokeStrengthB": score,
            "spokeSupportCountA": 0,
            "spokeSupportCountB": 0,
            "thirdBossPenalty": float(metric["thirdBossPenalty"]),
            "overlapScore": float(metric["overlapScore"]),
            "mutual": False,
            "candidateSource": "boundary",
            "isBoundaryForced": True,
        }
    return sorted(
        merged.values(),
        key=lambda row: (
            1 if bool(row.get("isBoundaryForced", False)) else 0,
            float(row.get("score", 0.0)),
            float(row.get("overlapScore", row.get("score", 0.0))),
        ),
        reverse=True,
    )


def _orientation(a: Tuple[float, float], b: Tuple[float, float], c: Tuple[float, float]) -> int:
    val = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])
    if abs(val) <= 1e-9:
        return 0
    return 1 if val > 0 else -1


def _on_segment(a: Tuple[float, float], b: Tuple[float, float], c: Tuple[float, float]) -> bool:
    return min(a[0], c[0]) <= b[0] <= max(a[0], c[0]) and min(a[1], c[1]) <= b[1] <= max(a[1], c[1])


def _segments_intersect(
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    p3: Tuple[float, float],
    p4: Tuple[float, float],
) -> bool:
    if p1 == p3 or p1 == p4 or p2 == p3 or p2 == p4:
        return False
    o1 = _orientation(p1, p2, p3)
    o2 = _orientation(p1, p2, p4)
    o3 = _orientation(p3, p4, p1)
    o4 = _orientation(p3, p4, p2)
    if o1 != o2 and o3 != o4:
        return True
    if o1 == 0 and _on_segment(p1, p3, p2):
        return True
    if o2 == 0 and _on_segment(p1, p4, p2):
        return True
    if o3 == 0 and _on_segment(p3, p1, p4):
        return True
    if o4 == 0 and _on_segment(p3, p2, p4):
        return True
    return False


def _edge_crosses_selected(
    nodes: Sequence[Node],
    edge: Tuple[int, int],
    selected_edges: Sequence[Tuple[int, int]],
) -> bool:
    i, j = int(edge[0]), int(edge[1])
    p1 = (float(nodes[i].uv[0]), float(nodes[i].uv[1]))
    p2 = (float(nodes[j].uv[0]), float(nodes[j].uv[1]))
    for k, l in selected_edges:
        if i in (k, l) or j in (k, l):
            continue
        p3 = (float(nodes[k].uv[0]), float(nodes[k].uv[1]))
        p4 = (float(nodes[l].uv[0]), float(nodes[l].uv[1]))
        if _segments_intersect(p1, p2, p3, p4):
            return True
    return False


def _boundary_key(node: Node, side: str) -> float:
    if side in {"left", "right"}:
        return float(node.uv[1])
    return float(node.uv[0])


def _mandatory_boundary_edges(
    nodes: Sequence[Node],
    *,
    tol_uv: float,
) -> List[Tuple[int, int]]:
    grouped: Dict[str, List[Tuple[int, Node]]] = {
        "left": [],
        "right": [],
        "top": [],
        "bottom": [],
    }
    for idx, node in enumerate(nodes):
        for side in _boundary_sides(node, tol_uv):
            grouped[side].append((idx, node))

    edges: set[Tuple[int, int]] = set()
    for side, rows in grouped.items():
        rows.sort(key=lambda item: _boundary_key(item[1], side))
        for (a, _), (b, _) in zip(rows[:-1], rows[1:]):
            if a != b:
                edges.add(tuple(sorted((int(a), int(b)))))
    return sorted(edges)


def _edge_metric(
    nodes: Sequence[Node],
    rib_mask: np.ndarray,
    *,
    edge: Tuple[int, int],
    corridor_width_px: int,
) -> Dict[str, float]:
    i, j = int(edge[0]), int(edge[1])
    overlap = _segment_overlap_score(
        rib_mask,
        p1=nodes[i].xy,
        p2=nodes[j].xy,
        corridor_width_px=corridor_width_px,
    )
    penalty = _third_boss_penalty(
        nodes=nodes,
        i=i,
        j=j,
        segment_pad_px=float(corridor_width_px) * 1.2,
    )
    du = float(nodes[j].uv[0] - nodes[i].uv[0])
    dv = float(nodes[j].uv[1] - nodes[i].uv[1])
    distance_uv = float(math.sqrt(du * du + dv * dv))
    score = float(max(0.0, min(1.0, overlap - 0.20 * penalty)))
    angle_ab = _wrap_angle_deg(
        math.degrees(math.atan2(float(nodes[j].xy[1] - nodes[i].xy[1]), float(nodes[j].xy[0] - nodes[i].xy[0])))
    )
    return {
        "score": score,
        "overlapScore": overlap,
        "thirdBossPenalty": penalty,
        "distanceUv": distance_uv,
        "angleAB": angle_ab,
        "angleBA": _wrap_angle_deg(angle_ab + 180.0),
    }


def select_candidate_graph(
    nodes: Sequence[Node],
    candidate_edges: Sequence[Dict[str, object]],
    *,
    rib_mask: np.ndarray,
    corridor_width_px: int,
    min_node_degree: int,
    max_node_degree: int,
    boundary_tolerance_uv: float,
    boundary_edge_score_floor: float,
    enforce_planarity: bool,
) -> Tuple[List[Dict[str, object]], List[Dict[str, object]]]:
    """Greedy global selection with mandatory boundary edges and degree repair."""
    edge_map: Dict[Tuple[int, int], Dict[str, object]] = {}
    for raw in candidate_edges:
        edge = tuple(sorted((int(raw["a"]), int(raw["b"]))))
        edge_map[edge] = dict(raw)

    forced_boundary_edges = _mandatory_boundary_edges(nodes, tol_uv=boundary_tolerance_uv)
    for edge in forced_boundary_edges:
        if edge not in edge_map:
            metric = _edge_metric(
                nodes,
                rib_mask,
                edge=edge,
                corridor_width_px=corridor_width_px,
            )
            if float(metric["score"]) < float(boundary_edge_score_floor):
                metric["score"] = float(boundary_edge_score_floor)
            edge_map[edge] = {
                "a": int(edge[0]),
                "b": int(edge[1]),
                "score": float(metric["score"]),
                "distanceUv": float(metric["distanceUv"]),
                "angleAB": float(metric["angleAB"]),
                "angleBA": float(metric["angleBA"]),
                "angleErrorA": 0.0,
                "angleErrorB": 0.0,
                "spokeStrengthA": float(metric["score"]),
                "spokeStrengthB": float(metric["score"]),
                "spokeSupportCountA": 0,
                "spokeSupportCountB": 0,
                "thirdBossPenalty": float(metric["thirdBossPenalty"]),
                "overlapScore": float(metric["overlapScore"]),
                "mutual": False,
                "isBoundaryForced": True,
            }
        else:
            edge_map[edge]["isBoundaryForced"] = True

    selected: List[Tuple[int, int]] = []
    degree: Dict[int, int] = {idx: 0 for idx in range(len(nodes))}
    diagnostics: List[Dict[str, object]] = []

    def can_add(edge: Tuple[int, int], *, ignore_degree_limit: bool = False) -> bool:
        i, j = int(edge[0]), int(edge[1])
        if edge in selected:
            return False
        if not ignore_degree_limit:
            if degree.get(i, 0) >= int(max_node_degree) or degree.get(j, 0) >= int(max_node_degree):
                return False
        if enforce_planarity and _edge_crosses_selected(nodes, edge, selected):
            return False
        return True

    def add_edge(edge: Tuple[int, int]) -> bool:
        if not can_add(edge):
            return False
        selected.append(edge)
        degree[int(edge[0])] = degree.get(int(edge[0]), 0) + 1
        degree[int(edge[1])] = degree.get(int(edge[1]), 0) + 1
        return True

    for edge in forced_boundary_edges:
        if add_edge(edge):
            diagnostics.append({"stage": "boundary", "edge": [int(edge[0]), int(edge[1])], "status": "selected"})
        else:
            diagnostics.append({"stage": "boundary", "edge": [int(edge[0]), int(edge[1])], "status": "blocked"})

    ordered_edges = sorted(
        edge_map.items(),
        key=lambda pair: (
            1 if bool(pair[1].get("isBoundaryForced", False)) else 0,
            float(pair[1].get("score", 0.0)),
            float(pair[1].get("overlapScore", pair[1].get("score", 0.0))),
        ),
        reverse=True,
    )

    for edge, meta in ordered_edges:
        if bool(meta.get("isBoundaryForced", False)):
            continue
        if add_edge(edge):
            diagnostics.append({"stage": "greedy", "edge": [int(edge[0]), int(edge[1])], "status": "selected"})

    improved = True
    while improved:
        improved = False
        for idx in range(len(nodes)):
            while degree.get(idx, 0) < int(min_node_degree):
                incident = [
                    (edge, meta)
                    for edge, meta in ordered_edges
                    if idx in edge and edge not in selected
                ]
                chosen: Optional[Tuple[int, int]] = None
                for edge, _meta in incident:
                    if can_add(edge):
                        chosen = edge
                        break
                if chosen is None:
                    diagnostics.append(
                        {
                            "stage": "repair",
                            "node": int(idx),
                            "status": "unsatisfied",
                            "degree": int(degree.get(idx, 0)),
                        }
                    )
                    break
                if add_edge(chosen):
                    diagnostics.append(
                        {
                            "stage": "repair",
                            "node": int(idx),
                            "edge": [int(chosen[0]), int(chosen[1])],
                            "status": "selected",
                        }
                    )
                    improved = True
                else:
                    break

    selected_edges = []
    selected_set = set(selected)
    for edge, meta in ordered_edges:
        if edge not in selected_set:
            continue
        row = dict(meta)
        row["a"] = int(edge[0])
        row["b"] = int(edge[1])
        row["selected"] = True
        selected_edges.append(row)

    return selected_edges, diagnostics


def score_selected_graph(
    nodes: Sequence[Node],
    selected_edges: Sequence[Dict[str, object]],
    candidate_edges: Sequence[Dict[str, object]],
    *,
    rib_mask: np.ndarray,
    corridor_width_px: int,
    min_node_degree: int,
    max_node_degree: int,
    boundary_tolerance_uv: float,
) -> Dict[str, object]:
    """Summarise the final bay graph as a single 0..1 score plus components."""
    if not nodes:
        return {
            "overallScore": 0.0,
            "overallScoreBreakdown": {
                "edgeEvidence": 0.0,
                "boundaryCoverage": 0.0,
                "degreeSatisfaction": 0.0,
                "mutualSupport": 0.0,
                "selectedNonBoundaryEdgeCount": 0.0,
                "selectedBoundaryEdgeCount": 0.0,
                "mandatoryBoundaryEdgeCount": 0.0,
            },
        }

    candidate_map: Dict[Tuple[int, int], Dict[str, object]] = {
        tuple(sorted((int(edge["a"]), int(edge["b"])))): dict(edge)
        for edge in candidate_edges
        if isinstance(edge, dict)
    }
    selected_keys = {
        tuple(sorted((int(edge["a"]), int(edge["b"]))))
        for edge in selected_edges
        if isinstance(edge, dict)
    }
    mandatory_boundary_edges = _mandatory_boundary_edges(nodes, tol_uv=boundary_tolerance_uv)
    mandatory_boundary_set = set(mandatory_boundary_edges)

    degree: Dict[int, int] = {idx: 0 for idx in range(len(nodes))}
    for i, j in selected_keys:
        degree[i] = degree.get(i, 0) + 1
        degree[j] = degree.get(j, 0) + 1

    non_boundary_scores: List[float] = []
    non_boundary_mutual: List[float] = []
    selected_boundary_count = 0

    for edge in selected_keys:
        is_boundary = edge in mandatory_boundary_set
        candidate = candidate_map.get(edge)
        if candidate is not None:
            edge_score = float(candidate.get("score", 0.0))
            mutual = 1.0 if bool(candidate.get("mutual", False)) else 0.0
            if bool(candidate.get("isBoundaryForced", False)):
                is_boundary = True
        else:
            metric = _edge_metric(
                nodes,
                rib_mask,
                edge=edge,
                corridor_width_px=corridor_width_px,
            )
            edge_score = float(metric["score"])
            mutual = 0.0

        if is_boundary:
            selected_boundary_count += 1
            continue

        non_boundary_scores.append(edge_score)
        non_boundary_mutual.append(mutual)

    edge_evidence = float(sum(non_boundary_scores) / len(non_boundary_scores)) if non_boundary_scores else 0.0
    boundary_coverage = (
        float(sum(1 for edge in mandatory_boundary_edges if edge in selected_keys) / len(mandatory_boundary_edges))
        if mandatory_boundary_edges
        else 1.0
    )
    degree_satisfaction = float(
        sum(1 for value in degree.values() if int(min_node_degree) <= value <= int(max_node_degree)) / len(nodes)
    )
    mutual_support = float(sum(non_boundary_mutual) / len(non_boundary_mutual)) if non_boundary_mutual else 0.0

    overall_score = float(
        max(
            0.0,
            min(
                1.0,
                0.55 * edge_evidence
                + 0.20 * boundary_coverage
                + 0.15 * degree_satisfaction
                + 0.10 * mutual_support,
            ),
        )
    )

    return {
        "overallScore": overall_score,
        "overallScoreBreakdown": {
            "edgeEvidence": edge_evidence,
            "boundaryCoverage": boundary_coverage,
            "degreeSatisfaction": degree_satisfaction,
            "mutualSupport": mutual_support,
            "selectedNonBoundaryEdgeCount": float(len(non_boundary_scores)),
            "selectedBoundaryEdgeCount": float(selected_boundary_count),
            "mandatoryBoundaryEdgeCount": float(len(mandatory_boundary_edges)),
        },
    }
