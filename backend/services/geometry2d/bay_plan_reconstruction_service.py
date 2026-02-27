"""Stage 4.4 bay plan reconstruction service."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Dict, List, Tuple

from services.geometry2d.roi_adapter import get_project_dir
from services.geometry2d.utils.reconstruction_graph import (
    build_cdt_edges,
    build_knn_candidate_edges,
    build_segment_edges,
    collect_nodes,
    segments_for_families,
)
from services.geometry2d.utils.reconstruction_io import (
    bay_plan_reconstruction_dir,
    load_base_image,
    load_boss_rows,
    load_json_object,
    load_roi_params,
    output_image_path,
    resolve_params,
    result_path,
    state_path,
    write_result,
    write_state,
)
from services.geometry2d.utils.reconstruction_render import render_reconstruction
from services.geometry2d.utils.reconstruction_rib_guidance import (
    classify_segment_family,
    filter_reconstructed_edges,
    gate_constraint_families,
    load_rib_union_mask,
    score_candidate_edges,
    score_constraint_families,
    select_constraint_edges,
)
from services.geometry2d.utils.roi_math import unit_to_image


DEFAULT_RECONSTRUCT_PARAMS: Dict[str, Any] = {
    "includeCornerAnchors": True,
    "includeHalfAnchors": False,
    "crossTolerance": 0.02,
    "corridorWidthPx": 36,
    "familyIncludeThreshold": 0.25,
    "familyOptionalThreshold": 0.15,
    "candidateKnn": 6,
    "candidateMaxDistanceUv": 0.95,
    "familyPriorWeight": 0.20,
    "constraintMinScore": 0.34,
    "constraintPerBossMinScore": 0.20,
    "edgeKeepScore": 0.18,
    "enforcePlanarity": True,
}

# Overlay-first mode:
# Do not persist a rendered PNG unless explicitly enabled.
SAVE_RENDERED_IMAGE = False


class BayPlanReconstructionService:
    """Execute bay plan reconstruction with rib-guided constraint gating."""

    async def get_state(self, project_id: str) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_state_sync, project_id)

    async def run_reconstruction(self, project_id: str) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._run_reconstruction_sync, project_id)

    def _get_state_sync(self, project_id: str) -> Dict[str, Any]:
        project_dir = get_project_dir(project_id)
        params = resolve_params(project_dir, DEFAULT_RECONSTRUCT_PARAMS)
        r_path = result_path(project_dir)
        preview_bosses: List[Dict[str, Any]] = []
        try:
            roi = load_roi_params(project_dir)
            boss_rows = load_boss_rows(project_dir, roi)
            preview_bosses = [
                {
                    "id": str(row["id"]),
                    "x": int(round(unit_to_image(row["uv"], roi)[0])),
                    "y": int(round(unit_to_image(row["uv"], roi)[1])),
                    "source": str(row.get("source", "raw")),
                }
                for row in boss_rows
            ]
        except Exception:
            preview_bosses = []

        summary = None
        if r_path.exists():
            latest = load_json_object(r_path)
            summary = {
                "ranAt": latest.get("ranAt"),
                "nodeCount": latest.get("nodeCount"),
                "edgeCount": latest.get("edgeCount"),
                "enabledConstraintFamilies": latest.get("enabledConstraintFamilies", []),
                "fallbackApplied": latest.get("fallbackApplied", False),
            }

        write_state(project_dir, params, result=summary or None)
        return {
            "projectDir": str(project_dir),
            "params": params,
            "defaults": dict(DEFAULT_RECONSTRUCT_PARAMS),
            "lastRunSummary": summary,
            "previewBosses": preview_bosses,
            "statePath": str(state_path(project_dir)),
            "resultPath": str(r_path) if r_path.exists() else None,
        }

    def _run_reconstruction_sync(self, project_id: str) -> Dict[str, Any]:
        project_dir = get_project_dir(project_id)
        params = resolve_params(project_dir, DEFAULT_RECONSTRUCT_PARAMS)
        roi = load_roi_params(project_dir)

        boss_rows = load_boss_rows(project_dir, roi)
        if not boss_rows:
            raise ValueError("No bosses available for reconstruction.")

        with_match = 0
        resolved_boss_rows: List[Tuple[str, Tuple[float, float]]] = []
        used_bosses: List[Dict[str, Any]] = []
        for row in boss_rows:
            boss_id = str(row["id"])
            uv = (float(row["uv"][0]), float(row["uv"][1]))
            source = str(row.get("source", "raw"))
            if source == "ideal":
                with_match += 1
            resolved_boss_rows.append((boss_id, uv))
            px, py = unit_to_image(uv, roi)
            used_bosses.append(
                {
                    "id": boss_id,
                    "x": int(round(px)),
                    "y": int(round(py)),
                    "source": source,
                }
            )

        nodes = collect_nodes(
            roi=roi,
            boss_rows=resolved_boss_rows,
            include_corner_anchors=bool(params["includeCornerAnchors"]),
            include_half_anchors=bool(params["includeHalfAnchors"]),
        )

        rib_union_mask = load_rib_union_mask(project_dir)
        family_scores: Dict[str, float] = {
            "vertical": 0.0,
            "horizontal": 0.0,
            "diagonal_backslash": 0.0,
            "diagonal_slash": 0.0,
        }
        enabled_families: List[str] = []
        fallback_applied = False
        fallback_reason = ""
        constraint_edges: List[Tuple[int, int]] = []
        fallback_family_selection: List[str] = []

        boundary_segments = [
            ((0.0, 0.0), (1.0, 0.0)),
            ((1.0, 0.0), (1.0, 1.0)),
            ((1.0, 1.0), (0.0, 1.0)),
            ((0.0, 1.0), (0.0, 0.0)),
        ]
        boundary_edges = build_segment_edges(
            nodes,
            boundary_segments,
            tol=float(params["crossTolerance"]),
        )

        if rib_union_mask is None:
            fallback_applied = True
            fallback_reason = "No rib masks found in Step 3 segmentation outputs. Running baseline triangulation."
            constraint_edges = boundary_edges
        else:
            family_scores = score_constraint_families(
                rib_union_mask,
                corridor_width_px=int(params["corridorWidthPx"]),
            )
            fallback_family_selection = gate_constraint_families(
                family_scores,
                include_threshold=float(params["familyIncludeThreshold"]),
                optional_threshold=float(params["familyOptionalThreshold"]),
            )
            family_segments = segments_for_families(fallback_family_selection)
            family_guide_edges = build_segment_edges(
                nodes,
                family_segments,
                tol=float(params["crossTolerance"]),
            )
            knn_candidate_edges = build_knn_candidate_edges(
                nodes,
                k=int(params["candidateKnn"]),
                max_distance_uv=float(params["candidateMaxDistanceUv"]),
            )
            candidate_edges = sorted(set(family_guide_edges).union(knn_candidate_edges).union(boundary_edges))
            edge_scores = score_candidate_edges(
                rib_union_mask,
                nodes=nodes,
                candidate_edges=candidate_edges,
                corridor_width_px=int(params["corridorWidthPx"]),
                family_scores=family_scores,
                family_prior_weight=float(params["familyPriorWeight"]),
            )
            constraint_edges = select_constraint_edges(
                nodes,
                edge_scores,
                min_score=float(params["constraintMinScore"]),
                protected_edges=boundary_edges,
                per_boss_min_score=float(params["constraintPerBossMinScore"]),
                fallback_top_n=max(4, len(nodes) // 2),
                enforce_planarity=bool(params["enforcePlanarity"]),
            )
            for edge in constraint_edges:
                fam = classify_segment_family(nodes[int(edge[0])].uv, nodes[int(edge[1])].uv)
                if fam is None:
                    continue
                if fam not in enabled_families:
                    enabled_families.append(fam)

            if len(constraint_edges) <= len(boundary_edges):
                fallback_applied = True
                fallback_reason = "Rib support is weak for edge-level constraints; using near-baseline triangulation."
                if not enabled_families:
                    enabled_families = list(fallback_family_selection)

        edges = build_cdt_edges(
            nodes,
            constraint_edges=constraint_edges,
            roi=roi,
        )
        edge_keep_threshold = 0.0
        if rib_union_mask is not None:
            edges, edge_keep_threshold = filter_reconstructed_edges(
                rib_union_mask,
                nodes=nodes,
                edges=edges,
                constraint_edges=constraint_edges,
                corridor_width_px=max(3, int(round(float(params["corridorWidthPx"]) * 0.7))),
                min_non_constraint_score=float(params["edgeKeepScore"]),
            )

        rendered_output_path: str | None = None
        if SAVE_RENDERED_IMAGE:
            target_path = output_image_path(project_dir)
            render_reconstruction(
                roi=roi,
                base_image=load_base_image(project_dir),
                nodes=nodes,
                edges=edges,
                output_path=target_path,
            )
            rendered_output_path = str(target_path)

        payload: Dict[str, Any] = {
            "projectDir": str(project_dir),
            "outputDir": str(bay_plan_reconstruction_dir(project_dir)),
            "outputImagePath": rendered_output_path,
            "ranAt": datetime.now().isoformat(),
            "nodeCount": len(nodes),
            "edgeCount": len(edges),
            "constraintEdgeCount": len(constraint_edges),
            "idealBossUsedCount": with_match,
            "bossCount": len(resolved_boss_rows),
            "enabledConstraintFamilies": enabled_families,
            "familySupportScores": family_scores,
            "fallbackApplied": fallback_applied,
            "fallbackReason": fallback_reason,
            "params": params,
            "edgeKeepThreshold": edge_keep_threshold,
            "nodes": [
                {
                    "id": node.node_id,
                    "bossId": node.boss_id,
                    "source": node.source,
                    "u": float(node.uv[0]),
                    "v": float(node.uv[1]),
                    "x": int(node.xy[0]),
                    "y": int(node.xy[1]),
                }
                for node in nodes
            ],
            "usedBosses": used_bosses,
            "idealBosses": [
                {
                    "id": row["id"],
                    "x": row["x"],
                    "y": row["y"],
                    "source": row["source"],
                }
                for row in used_bosses
                if row["source"] == "ideal"
            ],
            "extractedBosses": [
                {
                    "id": row["id"],
                    "x": row["x"],
                    "y": row["y"],
                    "source": row["source"],
                }
                for row in used_bosses
                if row["source"] == "raw"
            ],
        }
        constraint_edge_set = set(constraint_edges)
        payload["edges"] = [
            {
                "a": int(edge[0]),
                "b": int(edge[1]),
                "isConstraint": tuple(edge) in constraint_edge_set,
            }
            for edge in edges
        ]

        write_result(project_dir, payload)
        write_state(project_dir, params, result=payload)
        return payload
