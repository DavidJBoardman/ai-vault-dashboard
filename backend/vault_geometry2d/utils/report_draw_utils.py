"""Drawing helpers for final overlay (boss + candidate points)."""

from __future__ import annotations

import random
from pathlib import Path
from typing import Dict

import cv2

from src.vault_geometry2d.utils.cut_utils import RoiParams


def save_final_overlay(
    base_img,
    roi: RoiParams,
    per_boss: Dict[object, Dict[str, object]],
    out_path: Path,
) -> None:
    """Render final overlay with all bosses and templates."""
    overlay = base_img.copy()

    # draw roi
    cv2.rectangle(
        overlay,
        (int(roi["cx"] - roi["w"] / 2), int(roi["cy"] - roi["h"] / 2)),
        (int(roi["cx"] + roi["w"] / 2), int(roi["cy"] + roi["h"] / 2)),
        (0, 255, 0),
        2,
    )

    boss_fill = (255, 255, 255)  # white = bosses
    candidate_fill = (0, 255, 0)  # green = candidate

    for boss_id, boss_data in per_boss.items():
        bxy = boss_data["boss_xy"]
        cv2.circle(overlay, (int(bxy[0]), int(bxy[1])), 30, boss_fill, -1)

        # Support both formats: candidate_xy + variant_label, or matches[0] (Step04 per-boss all-match)
        candidate_xy = boss_data.get("candidate_xy")
        variant_label = boss_data.get("variant_label", "?")
        if candidate_xy is None and boss_data.get("matches"):
            m = boss_data["matches"][0]
            candidate_xy = m.get("template_xy")
            variant_label = m.get("variant_label", "?")
        if candidate_xy is None:
            candidate_xy = bxy
        cv2.circle(overlay, (int(candidate_xy[0]), int(candidate_xy[1])), 16, candidate_fill, -1)

        label_x = int(bxy[0]) - 150
        label_y = int(bxy[1]) - 40 - random.randint(0, 40)
        label_text = f"{boss_id}:{variant_label}"
        cv2.putText(overlay, label_text, (label_x, label_y), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 2, cv2.LINE_AA)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_path), overlay)

    cv2.imshow(f"overlay: {out_path.name}", overlay)
    cv2.waitKey(0)
