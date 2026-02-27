"""Rendering helpers for Geometry2D Step 4.3 reconstruction."""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Sequence, Tuple

import cv2
import numpy as np

from services.geometry2d.utils.reconstruction_graph import Node
from services.geometry2d.utils.roi_math import RoiParams


def render_reconstruction(
    *,
    roi: RoiParams,
    base_image: Optional[np.ndarray],
    nodes: Sequence[Node],
    edges: Sequence[Tuple[int, int]],
    output_path: Path,
) -> None:
    if base_image is not None:
        canvas = base_image.copy()
    else:
        h = max(10, int(round(float(roi.get("h", 400.0)))))
        w = max(10, int(round(float(roi.get("w", 400.0)))))
        canvas = np.zeros((h, w, 3), dtype=np.uint8)
        canvas[:] = (40, 40, 40)

    n_nodes = len(nodes)
    for i, j in edges:
        if not (0 <= int(i) < n_nodes and 0 <= int(j) < n_nodes):
            continue
        cv2.line(canvas, nodes[int(i)].xy, nodes[int(j)].xy, (0, 255, 0), 2, cv2.LINE_AA)

    for node in nodes:
        if node.source == "boss":
            colour = (40, 255, 255)
            radius = 6
        elif node.source == "anchor":
            colour = (255, 120, 0)
            radius = 5
        else:
            colour = (200, 200, 200)
            radius = 3
        cv2.circle(canvas, node.xy, radius, colour, -1)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), canvas)
