"""Directional weighting in `_segment_overlap_score`.

A segment whose corridor is filled by a rib running *along* the segment must
score high; a corridor filled by a rib *crossing* the segment must score near
zero, even when the raw overlap fraction is sizeable.
"""

from unittest import TestCase

import cv2
import numpy as np

from services.geometry2d.utils.bay_candidate_cv import _segment_overlap_score


def _blank(shape=(80, 80)):
    return np.zeros(shape, dtype=np.uint8)


class SegmentOverlapDirectionalWeightTests(TestCase):
    SEG_P1 = (10, 40)
    SEG_P2 = (70, 40)  # horizontal segment, length 60 px
    CORRIDOR_PX = 12

    def test_empty_mask_scores_zero(self):
        score = _segment_overlap_score(
            _blank(), p1=self.SEG_P1, p2=self.SEG_P2, corridor_width_px=self.CORRIDOR_PX
        )
        self.assertEqual(score, 0.0)

    def test_aligned_rib_scores_high(self):
        mask = _blank()
        # Horizontal rib at the same y as the segment, narrower than the corridor.
        cv2.line(mask, (0, 40), (79, 40), color=255, thickness=6)
        score = _segment_overlap_score(
            mask, p1=self.SEG_P1, p2=self.SEG_P2, corridor_width_px=self.CORRIDOR_PX
        )
        self.assertGreater(score, 0.4)

    def test_perpendicular_crossing_scores_low(self):
        mask = _blank()
        # Vertical rib crossing the segment in the middle.
        cv2.line(mask, (40, 0), (40, 79), color=255, thickness=6)
        score = _segment_overlap_score(
            mask, p1=self.SEG_P1, p2=self.SEG_P2, corridor_width_px=self.CORRIDOR_PX
        )
        # A perpendicular rib produces a raw overlap of roughly
        # rib_width * corridor_width / corridor_area, which without
        # directional weighting can clear the 0.28 short-edge gate.
        # The directional weight must drive the final score well below it.
        self.assertLess(score, 0.05)

    def test_diagonal_crossing_is_attenuated(self):
        mask = _blank()
        # 45 degree rib crossing the corridor — the case that produced the
        # spurious M-P edge in step 4D.
        cv2.line(mask, (0, 0), (79, 79), color=255, thickness=8)
        score = _segment_overlap_score(
            mask, p1=self.SEG_P1, p2=self.SEG_P2, corridor_width_px=self.CORRIDOR_PX
        )
        self.assertLess(score, 0.2)

    def test_aligned_dominates_perpendicular(self):
        aligned = _blank()
        cv2.line(aligned, (0, 40), (79, 40), color=255, thickness=6)
        perp = _blank()
        cv2.line(perp, (40, 0), (40, 79), color=255, thickness=6)
        aligned_score = _segment_overlap_score(
            aligned, p1=self.SEG_P1, p2=self.SEG_P2, corridor_width_px=self.CORRIDOR_PX
        )
        perp_score = _segment_overlap_score(
            perp, p1=self.SEG_P1, p2=self.SEG_P2, corridor_width_px=self.CORRIDOR_PX
        )
        self.assertGreater(aligned_score, perp_score * 8)
