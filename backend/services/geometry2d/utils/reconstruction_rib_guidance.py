"""Rib-mask guidance for Geometry2D reconstruction constraint gating."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np


ConstraintFamily = str


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


def _load_segmentation_index(project_dir: Path) -> Dict:
    index_path = project_dir / "segmentations" / "index.json"
    if not index_path.exists():
        return {}
    with index_path.open("r", encoding="utf-8") as f:
        raw = json.load(f)
    return raw if isinstance(raw, dict) else {}


def _is_rib_segmentation(seg: Dict) -> bool:
    group_id = str(seg.get("groupId", "")).lower()
    label = str(seg.get("label", "")).lower()
    return group_id == "rib" or "rib" in label


def load_rib_union_mask(project_dir: Path) -> Optional[np.ndarray]:
    seg_dir = project_dir / "segmentations"
    index_payload = _load_segmentation_index(project_dir)
    seg_rows = index_payload.get("segmentations")
    if not isinstance(seg_rows, list):
        return None

    rib_masks: List[np.ndarray] = []
    for seg in seg_rows:
        if not isinstance(seg, dict):
            continue
        if not _is_rib_segmentation(seg):
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
        rib_masks.append(_normalise_mask(raw))

    if not rib_masks:
        return None

    h = max(m.shape[0] for m in rib_masks)
    w = max(m.shape[1] for m in rib_masks)
    union = np.zeros((h, w), dtype=np.uint8)
    for mask in rib_masks:
        resized = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST) if mask.shape[:2] != (h, w) else mask
        union = cv2.bitwise_or(union, resized)
    return union


def _draw_segment_corridor(
    canvas_shape: Tuple[int, int],
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    width_px: int,
) -> np.ndarray:
    h, w = canvas_shape
    corridor = np.zeros((h, w), dtype=np.uint8)
    x1 = int(round(float(p1[0]) * (w - 1)))
    y1 = int(round(float(p1[1]) * (h - 1)))
    x2 = int(round(float(p2[0]) * (w - 1)))
    y2 = int(round(float(p2[1]) * (h - 1)))
    cv2.line(corridor, (x1, y1), (x2, y2), 255, max(1, int(width_px)), lineType=cv2.LINE_AA)
    return corridor


def classify_segment_family(
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    *,
    angle_tol_deg: float = 22.0,
) -> Optional[ConstraintFamily]:
    """Classify a segment orientation into one of the template families."""
    dx = float(p2[0]) - float(p1[0])
    dy = float(p2[1]) - float(p1[1])
    if abs(dx) <= 1e-9 and abs(dy) <= 1e-9:
        return None
    if abs(dx) <= 1e-9:
        return "vertical"
    if abs(dy) <= 1e-9:
        return "horizontal"

    angle = abs(math.degrees(math.atan2(abs(dy), abs(dx))))  # [0, 90]
    if angle <= angle_tol_deg:
        return "horizontal"
    if angle >= 90.0 - angle_tol_deg:
        return "vertical"
    return "diagonal_backslash" if dx * dy >= 0 else "diagonal_slash"


def _uv_to_xy(uv: Tuple[float, float], shape: Tuple[int, int]) -> Tuple[int, int]:
    h, w = shape
    u = float(max(0.0, min(1.0, uv[0])))
    v = float(max(0.0, min(1.0, uv[1])))
    x = int(round(u * (w - 1)))
    y = int(round(v * (h - 1)))
    return x, y


def _distance_transform_to_ribs(rib_union_mask: np.ndarray) -> np.ndarray:
    rib_bool = rib_union_mask > 0
    # Distance to the nearest rib pixel.
    inv = np.where(rib_bool, 0, 255).astype(np.uint8)
    return cv2.distanceTransform(inv, cv2.DIST_L2, 3)


def score_edge_support(
    rib_union_mask: np.ndarray,
    *,
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    corridor_width_px: int,
    distance_transform: Optional[np.ndarray] = None,
) -> Dict[str, float]:
    """Score a UV segment against rib evidence in the segmentation mask."""
    if rib_union_mask.size == 0:
        return {
            "overlap": 0.0,
            "coverage": 0.0,
            "endpoint": 0.0,
            "evidence": 0.0,
        }

    h, w = rib_union_mask.shape[:2]
    rib_bool = rib_union_mask > 0
    dt = distance_transform if distance_transform is not None else _distance_transform_to_ribs(rib_union_mask)
    width_px = max(1, int(corridor_width_px))

    corridor = _draw_segment_corridor((h, w), p1, p2, width_px)
    corridor_bool = corridor > 0
    total = int(corridor_bool.sum())
    overlap = 0.0
    if total > 0:
        overlap = float(np.logical_and(corridor_bool, rib_bool).sum() / total)

    x1, y1 = _uv_to_xy(p1, (h, w))
    x2, y2 = _uv_to_xy(p2, (h, w))
    seg_len_px = float(math.hypot(x2 - x1, y2 - y1))
    sample_count = max(8, int(seg_len_px // 4))
    xs = np.linspace(x1, x2, num=sample_count)
    ys = np.linspace(y1, y2, num=sample_count)
    xi = np.clip(np.rint(xs).astype(np.int32), 0, w - 1)
    yi = np.clip(np.rint(ys).astype(np.int32), 0, h - 1)

    near_thr = max(1.0, float(width_px) * 0.55)
    dist_samples = dt[yi, xi]
    coverage = float(np.mean(dist_samples <= near_thr)) if sample_count > 0 else 0.0

    d_ep = float((dt[y1, x1] + dt[y2, x2]) * 0.5)
    endpoint = float(max(0.0, 1.0 - min(1.0, d_ep / max(1.0, near_thr))))

    evidence = 0.55 * coverage + 0.35 * overlap + 0.10 * endpoint
    return {
        "overlap": overlap,
        "coverage": coverage,
        "endpoint": endpoint,
        "evidence": float(max(0.0, min(1.0, evidence))),
    }


def score_candidate_edges(
    rib_union_mask: np.ndarray,
    *,
    nodes: Sequence[Any],
    candidate_edges: Sequence[Tuple[int, int]],
    corridor_width_px: int,
    family_scores: Optional[Dict[ConstraintFamily, float]] = None,
    family_prior_weight: float = 0.2,
) -> Dict[Tuple[int, int], Dict[str, Any]]:
    """Score candidate edges with rib evidence and optional family priors."""
    if rib_union_mask.size == 0:
        return {}

    dt = _distance_transform_to_ribs(rib_union_mask)
    prior_weight = float(max(0.0, min(1.0, family_prior_weight)))
    scores: Dict[Tuple[int, int], Dict[str, Any]] = {}

    for raw_edge in candidate_edges:
        edge = tuple(sorted((int(raw_edge[0]), int(raw_edge[1]))))
        i, j = edge
        if i == j or i < 0 or j < 0 or i >= len(nodes) or j >= len(nodes):
            continue
        p1 = (float(nodes[i].uv[0]), float(nodes[i].uv[1]))
        p2 = (float(nodes[j].uv[0]), float(nodes[j].uv[1]))
        support = score_edge_support(
            rib_union_mask,
            p1=p1,
            p2=p2,
            corridor_width_px=corridor_width_px,
            distance_transform=dt,
        )
        family = classify_segment_family(p1, p2)
        family_prior = float((family_scores or {}).get(family, 0.0) if family is not None else 0.0)
        blended = (1.0 - prior_weight) * support["evidence"] + prior_weight * family_prior
        scores[edge] = {
            "score": float(max(0.0, min(1.0, blended))),
            "family": family,
            "familyPrior": family_prior,
            **support,
        }
    return scores


def _orientation(a: Tuple[float, float], b: Tuple[float, float], c: Tuple[float, float]) -> int:
    val = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])
    if abs(val) <= 1e-9:
        return 0
    return 1 if val > 0 else -1


def _on_segment(a: Tuple[float, float], b: Tuple[float, float], c: Tuple[float, float]) -> bool:
    return (
        min(a[0], c[0]) <= b[0] <= max(a[0], c[0])
        and min(a[1], c[1]) <= b[1] <= max(a[1], c[1])
    )


def _segments_intersect(
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    p3: Tuple[float, float],
    p4: Tuple[float, float],
) -> bool:
    # Shared vertices are allowed.
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
    nodes: Sequence[Any],
    edge: Tuple[int, int],
    selected_edges: Sequence[Tuple[int, int]],
) -> bool:
    i, j = edge
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


def select_constraint_edges(
    nodes: Sequence[Any],
    edge_scores: Dict[Tuple[int, int], Dict[str, Any]],
    *,
    min_score: float = 0.34,
    protected_edges: Optional[Sequence[Tuple[int, int]]] = None,
    per_boss_min_score: float = 0.20,
    fallback_top_n: int = 8,
    enforce_planarity: bool = True,
) -> List[Tuple[int, int]]:
    """Select a robust, mostly planar subset of candidate edges as constraints."""
    protected_set = {tuple(sorted((int(a), int(b)))) for a, b in (protected_edges or []) if int(a) != int(b)}
    selected: List[Tuple[int, int]] = sorted(protected_set)
    selected_set = set(selected)

    ordered = sorted(
        ((edge, meta) for edge, meta in edge_scores.items() if edge not in protected_set),
        key=lambda pair: float(pair[1].get("score", 0.0)),
        reverse=True,
    )

    def try_add(edge: Tuple[int, int]) -> bool:
        if edge in selected_set:
            return True
        if enforce_planarity and _edge_crosses_selected(nodes, edge, selected):
            return False
        selected.append(edge)
        selected_set.add(edge)
        return True

    for edge, meta in ordered:
        if float(meta.get("score", 0.0)) >= float(min_score):
            try_add(edge)

    added_count = len(selected_set - protected_set)
    if added_count == 0 and ordered:
        for edge, _ in ordered[: max(1, int(fallback_top_n))]:
            try_add(edge)

    # Ensure each boss has at least one supported incident edge.
    for idx, node in enumerate(nodes):
        if str(getattr(node, "source", "")) != "boss":
            continue
        if any(idx in edge for edge in selected_set):
            continue
        incident = [
            (edge, float(meta.get("score", 0.0)))
            for edge, meta in ordered
            if idx in edge
        ]
        if not incident:
            continue
        incident.sort(key=lambda pair: pair[1], reverse=True)
        best_edge, best_score = incident[0]
        if best_score >= float(per_boss_min_score):
            try_add(best_edge)

    return sorted(selected_set)


def filter_reconstructed_edges(
    rib_union_mask: Optional[np.ndarray],
    *,
    nodes: Sequence[Any],
    edges: Sequence[Tuple[int, int]],
    constraint_edges: Sequence[Tuple[int, int]],
    corridor_width_px: int,
    min_non_constraint_score: float = 0.18,
) -> Tuple[List[Tuple[int, int]], float]:
    """Prune weak non-constraint edges after triangulation."""
    if rib_union_mask is None or rib_union_mask.size == 0:
        return sorted({tuple(sorted((int(a), int(b)))) for a, b in edges if int(a) != int(b)}), 0.0

    scored = score_candidate_edges(
        rib_union_mask,
        nodes=nodes,
        candidate_edges=edges,
        corridor_width_px=corridor_width_px,
        family_scores=None,
        family_prior_weight=0.0,
    )

    constraint_set = {tuple(sorted((int(a), int(b)))) for a, b in constraint_edges if int(a) != int(b)}
    non_constraint_scores = [
        float(meta.get("score", 0.0))
        for edge, meta in scored.items()
        if edge not in constraint_set
    ]
    adaptive_threshold = float(min_non_constraint_score)
    if non_constraint_scores:
        adaptive_threshold = max(adaptive_threshold, float(np.quantile(non_constraint_scores, 0.35)))

    kept: set = set()
    for raw_edge in edges:
        edge = tuple(sorted((int(raw_edge[0]), int(raw_edge[1]))))
        if edge in constraint_set:
            kept.add(edge)
            continue
        if float(scored.get(edge, {}).get("score", 0.0)) >= adaptive_threshold:
            kept.add(edge)

    # Keep at least one edge incident to every boss node.
    for idx, node in enumerate(nodes):
        if str(getattr(node, "source", "")) != "boss":
            continue
        if any(idx in edge for edge in kept):
            continue
        incident = [
            (edge, float(meta.get("score", 0.0)))
            for edge, meta in scored.items()
            if idx in edge
        ]
        if not incident:
            continue
        incident.sort(key=lambda pair: pair[1], reverse=True)
        kept.add(incident[0][0])

    return sorted(kept), adaptive_threshold


def score_constraint_families(
    rib_union_mask: np.ndarray,
    *,
    corridor_width_px: int = 36,
) -> Dict[ConstraintFamily, float]:
    if rib_union_mask.size == 0:
        return {
            "vertical": 0.0,
            "horizontal": 0.0,
            "diagonal_backslash": 0.0,
            "diagonal_slash": 0.0,
        }

    h, w = rib_union_mask.shape[:2]
    families: Dict[ConstraintFamily, Tuple[Tuple[float, float], Tuple[float, float]]] = {
        "vertical": ((0.5, 0.0), (0.5, 1.0)),
        "horizontal": ((0.0, 0.5), (1.0, 0.5)),
        "diagonal_backslash": ((0.0, 0.0), (1.0, 1.0)),
        "diagonal_slash": ((1.0, 0.0), (0.0, 1.0)),
    }

    rib_bool = rib_union_mask > 0
    scores: Dict[ConstraintFamily, float] = {}
    for family, (p1, p2) in families.items():
        corridor = _draw_segment_corridor((h, w), p1, p2, corridor_width_px)
        corridor_bool = corridor > 0
        total = int(corridor_bool.sum())
        if total == 0:
            scores[family] = 0.0
            continue
        overlap = int(np.logical_and(corridor_bool, rib_bool).sum())
        scores[family] = float(overlap / total)
    return scores


def gate_constraint_families(
    family_scores: Dict[ConstraintFamily, float],
    *,
    include_threshold: float = 0.25,
    optional_threshold: float = 0.15,
) -> List[ConstraintFamily]:
    enabled: List[ConstraintFamily] = []
    optional: List[ConstraintFamily] = []

    for family, score in family_scores.items():
        if score >= include_threshold:
            enabled.append(family)
        elif score >= optional_threshold:
            optional.append(family)

    if enabled:
        return enabled

    if optional:
        return optional

    return []
