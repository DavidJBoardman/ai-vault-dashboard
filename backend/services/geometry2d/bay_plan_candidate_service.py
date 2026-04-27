"""Stage 4.4 bay-plan candidate generation service."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Dict, List

from services.geometry2d.delaunay_compare import build_delaunay_comparison
from services.geometry2d.roi_adapter import get_project_dir
from services.geometry2d.utils.bay_candidate_cv import (
    Node,
    build_angular_nearest_candidates,
    collect_boss_nodes,
    score_selected_graph,
    select_candidate_graph,
)
from services.geometry2d.utils.bay_candidate_io import (
    bay_plan_dir,
    debug_image_path,
    load_base_image,
    load_boss_rows,
    load_reference_rows,
    load_grouped_rib_mask,
    load_json_object,
    load_roi_params,
    resolve_params,
    result_path,
    state_path,
    write_result,
    write_state,
)
from services.geometry2d.utils.bay_candidate_render import render_candidate_debug


DEFAULT_CANDIDATE_PARAMS: Dict[str, Any] = {
    "angleToleranceDeg": 10.0,
    "candidateMinScore": 0.36,
    "candidateMaxDistanceUv": 1.6,
    "corridorWidthPx": 22,
    "minDirectionalSupport": 1,
    "mutualOnly": True,
    "minNodeDegree": 2,
    "maxNodeDegree": 36,
    "boundaryToleranceUv": 0.08,
    "boundaryEdgeScoreFloor": 0.12,
    "enforcePlanarity": True,
    "reconstructionMode": "current",
    "delaunayUseRoiBoundary": True,
    "delaunayUseCrossAxes": False,
    "delaunayUseHalfLines": False,
    "debugRayLengthPx": 96,
}


class BayPlanCandidateService:
    """Generate spoke-compatible boss-edge candidates from segmented rib masks."""

    @staticmethod
    def _build_nodes_from_payload(payload: Dict[str, Any]) -> List[Node]:
        raw_nodes = payload.get("nodes")
        if not isinstance(raw_nodes, list):
            return []
        nodes: List[Node] = []
        for index, raw_node in enumerate(raw_nodes):
            if not isinstance(raw_node, dict):
                continue
            try:
                u = float(raw_node["u"])
                v = float(raw_node["v"])
                x = int(raw_node["x"])
                y = int(raw_node["y"])
            except (KeyError, TypeError, ValueError):
                continue
            node_id = str(raw_node.get("id", index))
            boss_id = raw_node.get("bossId")
            nodes.append(
                Node(
                    node_id=node_id,
                    uv=(u, v),
                    xy=(x, y),
                    source=str(raw_node.get("source", "boss")),
                    boss_id=str(boss_id) if boss_id not in (None, "") else node_id,
                )
            )
        return nodes

    async def get_state(self, project_id: str) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_state_sync, project_id)

    async def reset_state(self, project_id: str) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._reset_state_sync, project_id)

    async def run_reconstruction(self, project_id: str, params_patch: Dict[str, Any] | None = None) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._run_sync, project_id, params_patch)

    async def save_manual_edges(self, project_id: str, edges: List[Dict[str, Any]]) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._save_manual_edges_sync, project_id, edges)

    def _get_state_sync(self, project_id: str) -> Dict[str, Any]:
        project_dir = get_project_dir(project_id)
        params = resolve_params(project_dir, DEFAULT_CANDIDATE_PARAMS)
        roi = load_roi_params(project_dir)
        reference_rows = load_reference_rows(project_dir)
        preview_bosses = []
        for row in reference_rows:
            node = collect_boss_nodes(roi=roi, boss_rows=[row])[0]
            preview_bosses.append(
                {
                    "id": str(row.get("label", row["id"])),
                    "x": int(node.xy[0]),
                    "y": int(node.xy[1]),
                    "source": str(row.get("source", "raw")),
                }
            )

        latest_summary = None
        r_path = result_path(project_dir)
        latest_result = None
        if r_path.exists():
            latest = load_json_object(r_path)
            latest_result = latest
            latest_summary = {
                "ranAt": latest.get("ranAt"),
                "nodeCount": latest.get("nodeCount"),
                "edgeCount": latest.get("edgeCount"),
                "candidateEdgeCount": latest.get("candidateEdgeCount"),
            }

        write_state(project_dir, params, result=latest_summary or None)
        return {
            "projectDir": str(project_dir),
            "params": params,
            "defaults": dict(DEFAULT_CANDIDATE_PARAMS),
            "lastRunSummary": latest_summary,
            "previewBosses": preview_bosses,
            "statePath": str(state_path(project_dir)),
            "resultPath": str(r_path) if r_path.exists() else None,
            "latestResult": latest_result,
        }

    def _run_sync(self, project_id: str, params_patch: Dict[str, Any] | None = None) -> Dict[str, Any]:
        project_dir = get_project_dir(project_id)
        params = resolve_params(project_dir, DEFAULT_CANDIDATE_PARAMS, params_patch=params_patch)
        roi = load_roi_params(project_dir)
        reference_rows = load_reference_rows(project_dir)
        boss_rows = [row for row in reference_rows if str(row.get("pointType", "boss")) == "boss"]
        corner_rows = [row for row in reference_rows if str(row.get("pointType", "boss")) == "corner"]
        nodes = collect_boss_nodes(roi=roi, boss_rows=reference_rows)
        with_match = sum(1 for row in boss_rows if str(row.get("source", "raw")) == "ideal")
        reconstruction_mode = str(params.get("reconstructionMode", "current"))

        used_bosses = [
            {
                "id": str(row.get("label", row["id"])),
                "x": int(node.xy[0]),
                "y": int(node.xy[1]),
                "source": str(row.get("source", "raw")),
            }
            for row, node in zip(reference_rows, nodes)
        ]

        if reconstruction_mode == "delaunay":
            base_nodes = [
                {
                    "id": node.node_id,
                    "bossId": node.boss_id,
                    "source": str(node.source),
                    "u": float(node.uv[0]),
                    "v": float(node.uv[1]),
                    "x": int(node.xy[0]),
                    "y": int(node.xy[1]),
                }
                for node in nodes
            ]
            delaunay = build_delaunay_comparison(
                roi=roi,
                base_nodes=base_nodes,
                use_roi_boundary=bool(params.get("delaunayUseRoiBoundary", True)),
                use_cross_axes=bool(params.get("delaunayUseCrossAxes", False)),
                use_half_lines=bool(params.get("delaunayUseHalfLines", False)),
            )
            if not bool(delaunay.get("available", False)):
                raise RuntimeError(str(delaunay.get("error") or "Delaunay reconstruction is unavailable."))

            payload: Dict[str, Any] = {
                "projectDir": str(project_dir),
                "outputDir": str(bay_plan_dir(project_dir)),
                "outputImagePath": None,
                "debugImagePath": None,
                "ranAt": datetime.now().isoformat(),
                "nodeCount": int(delaunay.get("nodeCount", len(delaunay.get("nodes", [])))),
                "edgeCount": int(delaunay.get("edgeCount", len(delaunay.get("edges", [])))),
                "candidateEdgeCount": 0,
                "constraintEdgeCount": int(
                    sum(1 for edge in delaunay.get("edges", []) if bool(edge.get("isConstraint", False)))
                ),
                "idealBossUsedCount": int(with_match),
                "bossCount": len(boss_rows),
                "cornerAnchorCount": len(corner_rows),
                "acceptedRibCount": 0,
                "rejectedRibCount": 0,
                "enabledConstraintFamilies": list(delaunay.get("constraintFamilies", [])),
                "familySupportScores": {},
                "fallbackApplied": False,
                "fallbackReason": "Topology-only Delaunay reconstruction. Use when rib segmentation is unavailable.",
                "overallScore": 0.0,
                "overallScoreBreakdown": {},
                "params": params,
                "nodes": delaunay.get("nodes", []),
                "edges": delaunay.get("edges", []),
                "candidateEdges": [],
                "comparison": None,
                "bossSpokes": [],
                "spokeDiagnostics": [],
                "optimisationDiagnostics": [
                    {
                        "stage": "selection_mode",
                        "mode": "delaunay",
                        "status": "topology_only",
                        "constraintFamilies": list(delaunay.get("constraintFamilies", [])),
                    }
                ],
                "usedBosses": used_bosses,
                "idealBosses": [row for row in used_bosses if row["source"] == "ideal"],
                "extractedBosses": [row for row in used_bosses if row["source"] not in ("ideal", "anchor")],
            }
            write_state(project_dir, params, result=payload)
            write_result(project_dir, payload)
            return payload

        grouped_rib_mask = load_grouped_rib_mask(project_dir)
        if grouped_rib_mask is None:
            raise FileNotFoundError("Grouped rib mask not found. Expected segmentations/grouped_rib.png or group_rib.png.")

        mode_diagnostics: List[Dict[str, Any]] = []
        boss_spokes, candidate_edges, spoke_diagnostics = build_angular_nearest_candidates(
            nodes=nodes,
            rib_mask=grouped_rib_mask,
            angle_tolerance_deg=float(params["angleToleranceDeg"]),
            candidate_min_score=float(params["candidateMinScore"]),
            candidate_max_distance_uv=float(params["candidateMaxDistanceUv"]),
            corridor_width_px=int(params["corridorWidthPx"]),
            min_directional_support=int(params["minDirectionalSupport"]),
            mutual_only=bool(params["mutualOnly"]),
            boundary_tolerance_uv=float(params["boundaryToleranceUv"]),
        )
        mode_diagnostics.append({"stage": "candidate_mode", "mode": "angular_nearest", "count": len(candidate_edges)})

        selected_edges, optimisation_diagnostics = select_candidate_graph(
            nodes,
            candidate_edges,
            rib_mask=grouped_rib_mask,
            corridor_width_px=int(params["corridorWidthPx"]),
            min_node_degree=int(params["minNodeDegree"]),
            max_node_degree=int(params["maxNodeDegree"]),
            boundary_tolerance_uv=float(params["boundaryToleranceUv"]),
            boundary_edge_score_floor=float(params["boundaryEdgeScoreFloor"]),
            enforce_planarity=bool(params["enforcePlanarity"]),
        )
        optimisation_diagnostics = mode_diagnostics + [
            {"stage": "selection_mode", "mode": "optimised_global", "status": "fixed"}
        ] + optimisation_diagnostics
        selected_edge_set = {
            tuple(sorted((int(edge["a"]), int(edge["b"]))))
            for edge in selected_edges
        }
        candidate_edge_keys = {
            tuple(sorted((int(edge["a"]), int(edge["b"]))))
            for edge in candidate_edges
        }
        for edge in candidate_edges:
            key = tuple(sorted((int(edge["a"]), int(edge["b"]))))
            edge["selected"] = key in selected_edge_set

        # Boundary edges that were not in the optional candidate pool still
        # carry useful metrics (overlap with rib mask, third-boss penalty)
        # computed inside the selector. Surface them so the canvas hover
        # popup can show real numbers instead of placeholders.
        for edge in selected_edges:
            if not bool(edge.get("isBoundaryForced", False)):
                continue
            key = tuple(sorted((int(edge["a"]), int(edge["b"]))))
            if key in candidate_edge_keys:
                continue
            mirror = dict(edge)
            mirror["selected"] = True
            mirror["candidateSource"] = mirror.get("candidateSource", "boundary")
            candidate_edges = list(candidate_edges) + [mirror]
            candidate_edge_keys.add(key)

        base_image = load_base_image(project_dir)
        target_path = debug_image_path(project_dir)
        render_candidate_debug(
            roi=roi,
            base_image=base_image,
            nodes=nodes,
            boss_spokes=boss_spokes,
            candidate_edges=candidate_edges,
            selected_edges=selected_edges,
            ray_length_px=int(params["debugRayLengthPx"]),
            output_path=target_path,
        )
        payload: Dict[str, Any] = {
            "projectDir": str(project_dir),
            "outputDir": str(bay_plan_dir(project_dir)),
            "outputImagePath": None,
            "debugImagePath": str(target_path),
            "ranAt": datetime.now().isoformat(),
            "nodeCount": len(nodes),
            "edgeCount": len(selected_edges),
            "candidateEdgeCount": len(candidate_edges),
            "constraintEdgeCount": int(sum(1 for edge in selected_edges if bool(edge.get("isBoundaryForced", False)))),
            "idealBossUsedCount": int(with_match),
            "bossCount": len(boss_rows),
            "cornerAnchorCount": len(corner_rows),
            "acceptedRibCount": int(sum(len(spokes) for spokes in boss_spokes.values())),
            "rejectedRibCount": 0,
            "enabledConstraintFamilies": [],
            "familySupportScores": {},
            "fallbackApplied": False,
            "fallbackReason": "",
            "params": params,
            "nodes": [
                {
                    "id": node.node_id,
                    "bossId": node.boss_id,
                    "source": str(node.source),
                    "u": float(node.uv[0]),
                    "v": float(node.uv[1]),
                    "x": int(node.xy[0]),
                    "y": int(node.xy[1]),
                }
                for node in nodes
            ],
            "edges": [
                {
                    "a": int(edge["a"]),
                    "b": int(edge["b"]),
                    "isConstraint": bool(edge.get("isBoundaryForced", False)),
                    "isManual": False,
                }
                for edge in selected_edges
            ],
            "candidateEdges": candidate_edges,
            "comparison": None,
            "bossSpokes": [
                spoke
                for idx in range(len(nodes))
                for spoke in boss_spokes.get(idx, [])
            ],
            "spokeDiagnostics": spoke_diagnostics,
            "optimisationDiagnostics": optimisation_diagnostics,
            "usedBosses": used_bosses,
            "idealBosses": [row for row in used_bosses if row["source"] == "ideal"],
            "extractedBosses": [row for row in used_bosses if row["source"] not in ("ideal", "anchor")],
        }
        payload.update(
            score_selected_graph(
                nodes,
                selected_edges,
                candidate_edges,
                rib_mask=grouped_rib_mask,
                corridor_width_px=int(params["corridorWidthPx"]),
                min_node_degree=int(params["minNodeDegree"]),
                max_node_degree=int(params["maxNodeDegree"]),
                boundary_tolerance_uv=float(params["boundaryToleranceUv"]),
            )
        )
        write_state(project_dir, params, result=payload)
        write_result(project_dir, payload)
        return payload

    def _reset_state_sync(self, project_id: str) -> Dict[str, Any]:
        project_dir = get_project_dir(project_id)
        for path in (state_path(project_dir), result_path(project_dir), debug_image_path(project_dir)):
            if path.exists():
                path.unlink()
        return self._get_state_sync(project_id)

    def _save_manual_edges_sync(self, project_id: str, edges: List[Dict[str, Any]]) -> Dict[str, Any]:
        project_dir = get_project_dir(project_id)
        r_path = result_path(project_dir)
        if not r_path.exists():
            raise FileNotFoundError("Reconstruction result not found. Run reconstruction first.")

        payload = load_json_object(r_path)
        nodes = payload.get("nodes")
        if not isinstance(nodes, list) or not nodes:
            raise ValueError("Reconstruction result is missing nodes.")

        valid_node_indices = set(range(len(nodes)))
        if not valid_node_indices:
            raise ValueError("No valid reconstruction nodes found.")

        existing_edges = payload.get("edges")
        existing_edge_map: Dict[tuple[int, int], Dict[str, Any]] = {}
        if isinstance(existing_edges, list):
            for edge in existing_edges:
                if not isinstance(edge, dict):
                    continue
                try:
                    a = int(edge["a"])
                    b = int(edge["b"])
                except (KeyError, TypeError, ValueError):
                    continue
                key = tuple(sorted((a, b)))
                existing_edge_map[key] = edge

        selected_keys: set[tuple[int, int]] = set()
        next_edges: List[Dict[str, Any]] = []
        for raw_edge in edges:
            if not isinstance(raw_edge, dict):
                continue
            try:
                a = int(raw_edge["a"])
                b = int(raw_edge["b"])
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError("Manual rib edges must include numeric 'a' and 'b' node indices.") from exc
            if a == b:
                raise ValueError("A reconstructed rib cannot connect a node to itself.")
            if a not in valid_node_indices or b not in valid_node_indices:
                raise ValueError(f"Manual rib edge {a}-{b} references an unknown node index.")
            key = tuple(sorted((a, b)))
            if key in selected_keys:
                continue
            selected_keys.add(key)
            existing = existing_edge_map.get(key, {})
            next_edges.append(
                {
                    "a": key[0],
                    "b": key[1],
                    "isConstraint": bool(existing.get("isConstraint", False)),
                    "isManual": bool(existing.get("isManual", False)) or key not in existing_edge_map,
                    "constraintFamily": existing.get("constraintFamily"),
                }
            )

        candidate_edges = payload.get("candidateEdges")
        if isinstance(candidate_edges, list):
            for candidate in candidate_edges:
                if not isinstance(candidate, dict):
                    continue
                try:
                    key = tuple(sorted((int(candidate["a"]), int(candidate["b"]))))
                except (KeyError, TypeError, ValueError):
                    continue
                candidate["selected"] = key in selected_keys

        diagnostics = payload.get("optimisationDiagnostics")
        if not isinstance(diagnostics, list):
            diagnostics = []
        diagnostics.append(
            {
                "stage": "manual_override",
                "savedAt": datetime.now().isoformat(),
                "edgeCount": len(next_edges),
            }
        )

        payload["edges"] = next_edges
        payload["edgeCount"] = len(next_edges)
        payload["constraintEdgeCount"] = int(sum(1 for edge in next_edges if bool(edge.get("isConstraint", False))))
        payload["optimisationDiagnostics"] = diagnostics

        params = payload.get("params")
        if not isinstance(params, dict):
            params = dict(DEFAULT_CANDIDATE_PARAMS)
            payload["params"] = params

        reconstruction_mode = str(params.get("reconstructionMode", "current"))
        if reconstruction_mode == "delaunay":
            payload["overallScore"] = 0.0
            payload["overallScoreBreakdown"] = {}
            write_state(project_dir, params, result=payload)
            write_result(project_dir, payload)
            return payload

        grouped_rib_mask = load_grouped_rib_mask(project_dir)
        if grouped_rib_mask is None:
            raise FileNotFoundError("Grouped rib mask not found. Expected segmentations/grouped_rib.png or group_rib.png.")

        payload_nodes = self._build_nodes_from_payload(payload)
        payload_candidate_edges = payload.get("candidateEdges")
        payload.update(
            score_selected_graph(
                payload_nodes,
                next_edges,
                payload_candidate_edges if isinstance(payload_candidate_edges, list) else [],
                rib_mask=grouped_rib_mask,
                corridor_width_px=int(params.get("corridorWidthPx", DEFAULT_CANDIDATE_PARAMS["corridorWidthPx"])),
                min_node_degree=int(params.get("minNodeDegree", DEFAULT_CANDIDATE_PARAMS["minNodeDegree"])),
                max_node_degree=int(params.get("maxNodeDegree", DEFAULT_CANDIDATE_PARAMS["maxNodeDegree"])),
                boundary_tolerance_uv=float(params.get("boundaryToleranceUv", DEFAULT_CANDIDATE_PARAMS["boundaryToleranceUv"])),
            )
        )

        write_state(project_dir, params, result=payload)
        write_result(project_dir, payload)
        return payload
