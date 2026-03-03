"""Rendering helpers for Step 4.4 bay-plan candidate generation."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Dict, Optional, Sequence

import cv2
import numpy as np

from services.geometry2d.utils.bay_candidate_cv import Node
from services.geometry2d.utils.roi_math import RoiParams


def render_candidate_debug(
    *,
    roi: RoiParams,
    base_image: Optional[np.ndarray],
    nodes: Sequence[Node],
    boss_spokes: Dict[int, Sequence[Dict[str, Any]]],
    candidate_edges: Sequence[Dict[str, Any]],
    selected_edges: Optional[Sequence[Dict[str, Any]]] = None,
    ray_length_px: int,
    output_path: Path,
) -> None:
    if base_image is not None:
        canvas = base_image.copy()
    else:
        h = max(10, int(round(float(roi.get("h", 400.0)))))
        w = max(10, int(round(float(roi.get("w", 400.0)))))
        canvas = np.zeros((h, w, 3), dtype=np.uint8)
        canvas[:] = (40, 40, 40)

    for edge in reversed(candidate_edges):
        i = int(edge["a"])
        j = int(edge["b"])
        if not (0 <= i < len(nodes) and 0 <= j < len(nodes)):
            continue
        score = float(edge.get("score", 0.0))
        colour = (
            int(round(40 + 180 * (1.0 - score))),
            int(round(80 + 160 * score)),
            int(round(255 * score)),
        )
        thickness = 1 if score < 0.55 else 2
        cv2.line(canvas, nodes[i].xy, nodes[j].xy, colour, thickness, cv2.LINE_AA)

    for edge in selected_edges or []:
        i = int(edge["a"])
        j = int(edge["b"])
        if not (0 <= i < len(nodes) and 0 <= j < len(nodes)):
            continue
        cv2.line(canvas, nodes[i].xy, nodes[j].xy, (0, 255, 255), 3, cv2.LINE_AA)

    ray_len = max(10, int(ray_length_px))
    for idx, spokes in boss_spokes.items():
        if not (0 <= int(idx) < len(nodes)):
            continue
        x0, y0 = nodes[int(idx)].xy
        for spoke in spokes:
            angle_rad = math.radians(float(spoke.get("angleDeg", 0.0)))
            strength = float(min(1.0, spoke.get("strength", 0.0)))
            colour = (0, int(round(120 + 120 * strength)), 255)
            x1 = int(round(x0 + ray_len * math.cos(angle_rad)))
            y1 = int(round(y0 + ray_len * math.sin(angle_rad)))
            cv2.line(canvas, (x0, y0), (x1, y1), colour, 2, cv2.LINE_AA)

    for node in nodes:
        cv2.circle(canvas, node.xy, 6, (255, 255, 255), -1)
        label = str(node.boss_id or node.node_id)
        cv2.putText(canvas, label, (node.xy[0] + 5, node.xy[1] - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 2, cv2.LINE_AA)
        cv2.putText(canvas, label, (node.xy[0] + 5, node.xy[1] - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1, cv2.LINE_AA)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), canvas)
