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


class DeriveVariantSummariesTests(TestCase):
    def _variants(self):
        return [
            _FakeVariant("starcut_n=2", "starcut", "starcut", 2),
            _FakeVariant("starcut_n=3", "starcut", "starcut", 3),
            _FakeVariant("circlecut_inner", "circlecut", "inner", 0),
        ]

    def _overlay_for(self, label):
        return {"linesUv": [], "pointsUv": []}

    def test_counts_bosses_per_variant(self):
        variants = self._variants()
        boss_axis = {
            1: _axis_match(
                x_cands=[("starcut_n=2", 0.5, 0.001)],
                y_cands=[("starcut_n=2", 0.5, 0.001)],
            ),
            2: _axis_match(
                x_cands=[("starcut_n=2", 0.5, 0.001), ("starcut_n=3", 0.333, 0.002)],
                y_cands=[("starcut_n=2", 0.5, 0.001), ("starcut_n=3", 0.667, 0.002)],
            ),
        }
        boss_ids_in_order = [1, 2]

        summaries = CutTypologyMatchingService._derive_variant_summaries(
            variants=variants,
            boss_ids_in_order=boss_ids_in_order,
            axis_matches_by_id=boss_axis,
            overlay_lookup=self._overlay_for,
        )

        by_label = {s["variantLabel"]: s for s in summaries}
        self.assertEqual(by_label["starcut_n=2"]["matchedCount"], 2)
        self.assertEqual(sorted(by_label["starcut_n=2"]["matchedBossIds"]), [1, 2])
        self.assertEqual(by_label["starcut_n=3"]["matchedCount"], 1)
        self.assertEqual(by_label["starcut_n=3"]["matchedBossIds"], [2])
        self.assertEqual(by_label["circlecut_inner"]["matchedCount"], 0)
        self.assertEqual(by_label["circlecut_inner"]["matchedBossIds"], [])

    def test_coverage_is_relative_to_boss_count(self):
        variants = [_FakeVariant("starcut_n=2", "starcut", "starcut", 2)]
        boss_axis = {
            1: _axis_match([("starcut_n=2", 0.5, 0.0)], [("starcut_n=2", 0.5, 0.0)]),
            2: _axis_match([], []),
            3: _axis_match([], []),
            4: _axis_match([], []),
        }

        summaries = CutTypologyMatchingService._derive_variant_summaries(
            variants=variants,
            boss_ids_in_order=[1, 2, 3, 4],
            axis_matches_by_id=boss_axis,
            overlay_lookup=self._overlay_for,
        )

        self.assertAlmostEqual(summaries[0]["coverage"], 0.25)

    def test_zero_bosses_yields_zero_coverage(self):
        variants = [_FakeVariant("starcut_n=2", "starcut", "starcut", 2)]
        summaries = CutTypologyMatchingService._derive_variant_summaries(
            variants=variants,
            boss_ids_in_order=[],
            axis_matches_by_id={},
            overlay_lookup=self._overlay_for,
        )
        self.assertEqual(summaries[0]["matchedCount"], 0)
        self.assertEqual(summaries[0]["coverage"], 0.0)


class CircleFamilyTieTests(TestCase):
    """Inner-circle and outer-circle are peers; neither should win on rank alone."""

    def test_variant_priority_ties_inner_and_outer(self):
        inner = CutTypologyMatchingService._variant_priority("circlecut_inner")
        outer = CutTypologyMatchingService._variant_priority("circlecut_outer")
        self.assertEqual(inner, outer)

    def test_axis_cut_priority_lets_error_break_inner_outer_tie(self):
        # With family rank tied, the candidate with the smaller error must win.
        candidates = [
            {"cut": "circlecut_inner", "ratio": 0.5, "error": 0.005},
            {"cut": "circlecut_outer", "ratio": 0.5, "error": 0.001},
        ]
        sorted_cands = sorted(
            candidates,
            key=lambda item: (
                CutTypologyMatchingService._axis_cut_priority(str(item["cut"])),
                float(item["error"]),
                float(item["ratio"]),
            ),
        )
        self.assertEqual(sorted_cands[0]["cut"], "circlecut_outer")

    def test_axis_cut_priority_ties_inner_outer_at_same_error(self):
        # If error is also equal, ordering is deterministic but not biased
        # towards inner — the key tuples up to error must be identical.
        inner_key = (
            CutTypologyMatchingService._axis_cut_priority("circlecut_inner"),
            0.001,
        )
        outer_key = (
            CutTypologyMatchingService._axis_cut_priority("circlecut_outer"),
            0.001,
        )
        self.assertEqual(inner_key, outer_key)

    def test_variant_summary_rank_key_ties_inner_outer_complexity(self):
        inner_key = CutTypologyMatchingService._variant_summary_rank_key(
            {"matchedCount": 3, "templateType": "circlecut", "variantLabel": "circlecut_inner", "n": 0}
        )
        outer_key = CutTypologyMatchingService._variant_summary_rank_key(
            {"matchedCount": 3, "templateType": "circlecut", "variantLabel": "circlecut_outer", "n": 0}
        )
        # First three slots (-matched, complexity, n) must match; only the
        # final string label may differ.
        self.assertEqual(inner_key[:3], outer_key[:3])
