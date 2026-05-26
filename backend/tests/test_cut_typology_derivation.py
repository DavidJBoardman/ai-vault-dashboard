"""Unit tests for cut-typology derivation helpers."""

from unittest import TestCase

from services.geometry2d.cut_typology_matching_service import (
    CutTypologyMatchingService,
)


class _FakeVariant:
    """Minimal stand-in for TemplateVariant used by derivation helpers."""

    def __init__(
        self,
        variant_label,
        template_type,
        variant,
        n,
        x_source_label=None,
        y_source_label=None,
    ):
        self.variant_label = variant_label
        self.template_type = template_type
        self.variant = variant
        self.n = n
        self.x_source_label = x_source_label
        self.y_source_label = y_source_label


def _axis_match(x_cands, y_cands):
    """Build an axisCutMatch dict from candidate lists (cut, ratio, error)."""
    def _norm(items):
        return [{"cut": c, "ratio": r, "error": e} for c, r, e in items]

    return {
        "xCut": x_cands[0][0] if x_cands else None,
        "yCut": y_cands[0][0] if y_cands else None,
        "xRatio": x_cands[0][1] if x_cands else None,
        "yRatio": y_cands[0][1] if y_cands else None,
        "xError": x_cands[0][2] if x_cands else None,
        "yError": y_cands[0][2] if y_cands else None,
        "matched": bool(x_cands and y_cands),
        "xCandidates": _norm(x_cands),
        "yCandidates": _norm(y_cands),
    }


class DeriveBossMatchesTests(TestCase):
    def test_plain_variant_in_both_axes_yields_match(self):
        variants = [_FakeVariant("starcut_n=3", "starcut", "starcut", 3)]
        axis_match = _axis_match(
            x_cands=[("starcut_n=3", 0.333, 0.001)],
            y_cands=[("starcut_n=3", 0.667, 0.002)],
        )

        matches = CutTypologyMatchingService._derive_boss_matches(axis_match, variants)

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["variantLabel"], "starcut_n=3")
        self.assertEqual(matches[0]["templateType"], "starcut")
        self.assertAlmostEqual(matches[0]["xRatio"], 0.333)
        self.assertAlmostEqual(matches[0]["yRatio"], 0.667)
        self.assertAlmostEqual(matches[0]["xError"], 0.001)
        self.assertAlmostEqual(matches[0]["yError"], 0.002)
        self.assertFalse(matches[0]["isCrossTemplate"])

    def test_plain_variant_missing_one_axis_yields_no_match(self):
        variants = [_FakeVariant("starcut_n=3", "starcut", "starcut", 3)]
        axis_match = _axis_match(
            x_cands=[("starcut_n=3", 0.333, 0.001)],
            y_cands=[],
        )

        matches = CutTypologyMatchingService._derive_boss_matches(axis_match, variants)

        self.assertEqual(matches, [])

    def test_cross_variant_uses_source_labels(self):
        variants = [
            _FakeVariant("starcut_n=3", "starcut", "starcut", 3),
            _FakeVariant("circlecut_inner", "circlecut", "inner", 0),
            _FakeVariant(
                "cross_x=starcut_n=3_y=circlecut_inner",
                "cross",
                "cross",
                0,
                x_source_label="starcut_n=3",
                y_source_label="circlecut_inner",
            ),
        ]
        axis_match = _axis_match(
            x_cands=[("starcut_n=3", 0.333, 0.001)],
            y_cands=[("circlecut_inner", 0.5, 0.003)],
        )

        matches = CutTypologyMatchingService._derive_boss_matches(axis_match, variants)
        labels = sorted(m["variantLabel"] for m in matches)

        self.assertIn("cross_x=starcut_n=3_y=circlecut_inner", labels)
        cross = next(m for m in matches if m["isCrossTemplate"])
        self.assertEqual(cross["xTemplate"], "starcut_n=3")
        self.assertEqual(cross["yTemplate"], "circlecut_inner")
        self.assertAlmostEqual(cross["xRatio"], 0.333)
        self.assertAlmostEqual(cross["yRatio"], 0.5)

    def test_returns_empty_when_axis_match_is_none(self):
        variants = [_FakeVariant("starcut_n=3", "starcut", "starcut", 3)]

        matches = CutTypologyMatchingService._derive_boss_matches(None, variants)

        self.assertEqual(matches, [])
