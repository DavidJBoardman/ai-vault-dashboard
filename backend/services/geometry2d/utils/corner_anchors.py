"""Corner reference points derived from the current ROI.

Corners are not user-editable data — they are the four anchors of the unit
bay frame at UV coordinates (0,0), (1,0), (1,1), (0,1). Storing them as
absolute (x, y) pixels means they go stale the moment the ROI moves. The
helper here refreshes any persisted corner rows from the supplied ROI so
downstream consumers (cut-typology matching, Bay Plan candidates) always see
corners that match the current ROI rectangle.
"""

from __future__ import annotations

from typing import Any, Dict, List, Sequence, Tuple

from services.geometry2d.utils.roi_math import unit_to_image

# Labels mirror the step-3 corner segmentation tags (TL=C, TR=A, BR=B, BL=D)
# so the reference points carry the same letter as the step-3 masks.
CORNER_REFERENCE_SPECS: List[Tuple[str, Tuple[float, float]]] = [
    ("Corner C", (0.0, 0.0)),  # TL / NW
    ("Corner A", (1.0, 0.0)),  # TR / NE
    ("Corner B", (1.0, 1.0)),  # BR / SE
    ("Corner D", (0.0, 1.0)),  # BL / SW
]


def refresh_corner_points(
    points: Sequence[Dict[str, Any]],
    roi: Dict[str, float],
) -> List[Dict[str, Any]]:
    """Return a copy of `points` with corner rows synced to `roi`.

    All existing rows with `pointType == "corner"` are removed; four fresh
    corner rows are appended using `CORNER_REFERENCE_SPECS` and
    `unit_to_image` against the supplied ROI. Boss rows are preserved
    verbatim. Corner ids are assigned after the largest existing boss id so
    they never collide. Output is sorted by id for stable downstream
    consumption.
    """
    bosses = [
        dict(point)
        for point in points
        if str(point.get("pointType", "boss")) != "corner"
    ]
    next_id = max((int(p["id"]) for p in bosses), default=0) + 1

    refreshed = list(bosses)
    for offset, (label, uv) in enumerate(CORNER_REFERENCE_SPECS):
        x, y = unit_to_image(uv, roi)
        refreshed.append(
            {
                "id": int(next_id + offset),
                "label": label,
                "x": float(x),
                "y": float(y),
                "source": "auto",
                "pointType": "corner",
            }
        )

    refreshed.sort(key=lambda p: int(p["id"]))
    return refreshed
