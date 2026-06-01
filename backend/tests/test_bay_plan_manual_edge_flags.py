"""Tests for manual rib save preserving auto vs manual classification."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from services.geometry2d.bay_plan_candidate_service import (
    BayPlanCandidateService,
    resolve_saved_edge_is_manual,
)


class ResolveSavedEdgeIsManualTests(unittest.TestCase):
    def test_deleted_auto_rib_restored_from_client_flag(self):
        key = (2, 4)
        existing_map: dict = {}
        raw = {"a": 2, "b": 4, "isManual": False}
        candidates = {key}
        self.assertFalse(
            resolve_saved_edge_is_manual(key, raw, existing_map, candidates)
        )

    def test_new_user_edge_defaults_to_manual(self):
        key = (1, 3)
        self.assertTrue(resolve_saved_edge_is_manual(key, {"a": 1, "b": 3}, {}, set()))

    def test_known_candidate_without_client_flag_stays_auto(self):
        key = (0, 1)
        self.assertFalse(
            resolve_saved_edge_is_manual(key, {"a": 0, "b": 1}, {}, {key})
        )


class SaveManualEdgesRestoresAutoRibTests(unittest.TestCase):
    def test_re_added_deleted_edge_not_marked_manual(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp) / "proj"
            bay_dir = project_dir / "2d_geometry" / "bay_plan_reconstruction"
            bay_dir.mkdir(parents=True)

            nodes = [{"id": i, "bossId": str(i), "x": 0, "y": 0} for i in range(5)]
            payload = {
                "ranAt": "2026-01-01T00:00:00",
                "nodes": nodes,
                "edges": [
                    {"a": 0, "b": 1, "isConstraint": False, "isManual": False},
                ],
                "candidateEdges": [
                    {"a": 0, "b": 1, "selected": True},
                    {"a": 2, "b": 4, "selected": True},
                ],
                "params": {"reconstructionMode": "delaunay"},
            }
            result_file = bay_dir / "result.json"
            result_file.write_text(json.dumps(payload), encoding="utf-8")

            service = BayPlanCandidateService()
            with patch(
                "services.geometry2d.bay_plan_candidate_service.get_project_dir",
                return_value=project_dir,
            ):
                saved = service._save_manual_edges_sync(
                    "proj",
                    [
                        {"a": 0, "b": 1, "isConstraint": False, "isManual": False},
                        {"a": 2, "b": 4, "isConstraint": False, "isManual": False},
                    ],
                )

            restored = next(
                edge for edge in saved["edges"] if edge["a"] == 2 and edge["b"] == 4
            )
            self.assertFalse(restored["isManual"])


if __name__ == "__main__":
    unittest.main()
