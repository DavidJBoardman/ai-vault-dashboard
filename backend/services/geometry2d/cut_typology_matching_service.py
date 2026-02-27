"""Stage 4.3 cut-typology matching service."""

from __future__ import annotations

import asyncio
import csv
import json
import math
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np

from services.geometry2d.roi_adapter import get_project_dir
from services.geometry2d.utils.roi_math import image_to_unit, unit_to_image
from services.geometry2d.utils.template_keypoints import generate_keypoints
from services.geometry2d.utils.template_scoring import extract_template_ratios, match_boss_to_ratios

DEFAULT_TEMPLATE_PARAMS: Dict[str, Any] = {
    "starcutMin": 2,
    "starcutMax": 6,
    "includeStarcut": True,
    "includeInner": True,
    "includeOuter": True,
    "allowCrossTemplate": True,
    "tolerance": 0.01,
}
ROI_INSIDE_MARGIN_UV = 0.02

PARAMETER_SCHEMA: List[Dict[str, Any]] = [
    {
        "key": "starcutMin",
        "label": "Starcut Min n",
        "type": "integer",
        "min": 2,
        "max": 12,
        "step": 1,
        "default": 2,
        "description": "Lower bound for standardcut grid divisors.",
    },
    {
        "key": "starcutMax",
        "label": "Starcut Max n",
        "type": "integer",
        "min": 2,
        "max": 12,
        "step": 1,
        "default": 6,
        "description": "Upper bound for standardcut grid divisors.",
    },
    {
        "key": "includeStarcut",
        "label": "Include standardcut grids",
        "type": "boolean",
        "default": True,
        "description": "Enable standard n-by-n grid variants.",
    },
    {
        "key": "includeInner",
        "label": "Include circlecut inner",
        "type": "boolean",
        "default": True,
        "description": "Enable inner circlecut variant.",
    },
    {
        "key": "includeOuter",
        "label": "Include circlecut outer",
        "type": "boolean",
        "default": True,
        "description": "Enable outer circlecut variant.",
    },
    {
        "key": "allowCrossTemplate",
        "label": "Allow cross templates",
        "type": "boolean",
        "default": True,
        "description": "Allow x-ratios and y-ratios from different variants.",
    },
    {
        "key": "tolerance",
        "label": "Ratio tolerance",
        "type": "float",
        "min": 0.001,
        "max": 0.1,
        "step": 0.001,
        "default": 0.01,
        "description": "Maximum absolute ratio distance for a matched coordinate.",
    },
]


@dataclass
class TemplateVariant:
    variant_label: str
    template_type: str
    variant: str
    n: Optional[int]
    template_uv: np.ndarray
    overlay_lines_uv: List[List[List[float]]]
    overlay_points_uv: List[List[float]]
    x_source_label: Optional[str] = None
    y_source_label: Optional[str] = None


class CutTypologyMatchingService:
    """Run cut-typology matching from prepared node points."""

    async def get_state(self, project_id: str) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_state_sync, project_id)

    async def save_points(self, project_id: str, points: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._save_points_sync, project_id, list(points))

    async def run_matching(
        self,
        project_id: str,
        params: Optional[Dict[str, Any]] = None,
        points: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._run_matching_sync,
            project_id,
            dict(params or {}),
            list(points) if points is not None else None,
        )

    async def get_match_csv(self, project_id: str) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_match_csv_sync, project_id)

    def _get_state_sync(self, project_id: str) -> Dict[str, Any]:
        project_dir = get_project_dir(project_id)
        roi = self._load_roi_params(project_dir)
        detected_points = self._load_base_points(project_dir)
        points = self._read_or_build_points(project_dir)
        points_with_uv = self._attach_uv(points, roi)
        detected_points_with_uv = self._attach_uv(detected_points, roi)

        last_result_path = self._matching_result_path(project_dir)
        saved_params: Optional[Dict[str, Any]] = None
        last_summary: Optional[Dict[str, Any]] = None
        if last_result_path.exists():
            result_payload = self._load_json_object(last_result_path)
            raw_params = result_payload.get("params")
            if isinstance(raw_params, dict):
                saved_params = self._resolve_params(raw_params)
            variant_summaries = result_payload.get("variants")
            if isinstance(variant_summaries, list):
                last_summary = {
                    "variantCount": len(variant_summaries),
                    "bestVariantLabel": result_payload.get("bestVariantLabel"),
                    "ranAt": result_payload.get("ranAt"),
                }

        active_params = saved_params or self._resolve_params(None)
        overlay_variants = self._serialize_overlay_variants(self._build_variants(roi, active_params))

        return {
            "projectDir": str(project_dir),
            "points": points_with_uv,
            "detectedPoints": detected_points_with_uv,
            "roi": roi,
            "defaults": dict(DEFAULT_TEMPLATE_PARAMS),
            "params": active_params,
            "parameterSchema": list(PARAMETER_SCHEMA),
            "overlayVariants": overlay_variants,
            "lastResultSummary": last_summary,
            "statePath": str(self._node_points_path(project_dir)),
        }

    def _save_points_sync(self, project_id: str, points: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
        project_dir = get_project_dir(project_id)
        roi = self._load_roi_params(project_dir)
        normalised = self._normalise_points(points)
        self._persist_points(project_dir, normalised)

        return {
            "projectDir": str(project_dir),
            "savedCount": len(normalised),
            "points": self._attach_uv(normalised, roi),
            "statePath": str(self._node_points_path(project_dir)),
        }

    def _run_matching_sync(
        self,
        project_id: str,
        params: Dict[str, Any],
        points: Optional[Sequence[Dict[str, Any]]],
    ) -> Dict[str, Any]:
        project_dir = get_project_dir(project_id)
        roi = self._load_roi_params(project_dir)
        resolved_params = self._resolve_params(params)

        if points is not None:
            point_rows = self._normalise_points(points)
            self._persist_points(project_dir, point_rows)
        else:
            point_rows = self._read_or_build_points(project_dir)

        points_with_uv = self._attach_uv(point_rows, roi)
        if not points_with_uv:
            raise ValueError("No node points available for cut-typology matching")

        bosses_uv = np.array([[float(p["u"]), float(p["v"])] for p in points_with_uv], dtype=float).reshape(-1, 2)
        variants = self._build_variants(roi, resolved_params)
        tolerance = float(resolved_params["tolerance"])

        per_variant_matches: Dict[str, Dict[int, Dict[str, Any]]] = {}
        variant_summaries: List[Dict[str, Any]] = []
        for variant in variants:
            if variant.x_source_label and variant.y_source_label:
                x_source = self._get_variant_by_label(variants, variant.x_source_label)
                y_source = self._get_variant_by_label(variants, variant.y_source_label)
                if x_source is None or y_source is None:
                    continue
                x_ratios, _ = extract_template_ratios(x_source.template_uv)
                _, y_ratios = extract_template_ratios(y_source.template_uv)
                matched = self._match_with_ratio_sets(
                    bosses_uv,
                    x_ratios=x_ratios,
                    y_ratios=y_ratios,
                    tolerance=tolerance,
                    x_template_label=variant.x_source_label,
                    y_template_label=variant.y_source_label,
                )
            else:
                x_ratios, y_ratios = extract_template_ratios(variant.template_uv)
                matched = self._match_with_ratio_sets(
                    bosses_uv,
                    x_ratios=x_ratios,
                    y_ratios=y_ratios,
                    tolerance=tolerance,
                )

            per_variant_matches[variant.variant_label] = matched
            matched_indices = [idx for idx, info in matched.items() if bool(info.get("matched"))]
            matched_ids = [int(points_with_uv[idx]["id"]) for idx in matched_indices]
            variant_summaries.append(
                {
                    "variantLabel": variant.variant_label,
                    "templateType": variant.template_type,
                    "variant": variant.variant,
                    "n": variant.n,
                    "isCrossTemplate": bool(variant.x_source_label and variant.y_source_label),
                    "xTemplate": variant.x_source_label,
                    "yTemplate": variant.y_source_label,
                    "matchedCount": len(matched_indices),
                    "coverage": float(len(matched_indices) / len(points_with_uv)),
                    "matchedBossIds": matched_ids,
                    "overlay": {
                        "linesUv": variant.overlay_lines_uv,
                        "pointsUv": variant.overlay_points_uv,
                    },
                }
            )

        per_boss_rows: List[Dict[str, Any]] = []
        for idx, point in enumerate(points_with_uv):
            boss_matches: List[Dict[str, Any]] = []
            for summary in variant_summaries:
                variant_label = str(summary["variantLabel"])
                info = per_variant_matches.get(variant_label, {}).get(idx)
                if not info or not bool(info.get("matched")):
                    continue
                boss_matches.append(
                    {
                        "variantLabel": variant_label,
                        "templateType": summary.get("templateType"),
                        "isCrossTemplate": summary.get("isCrossTemplate", False),
                        "xTemplate": info.get("x_template"),
                        "yTemplate": info.get("y_template"),
                        "xRatio": info.get("x_ratio"),
                        "yRatio": info.get("y_ratio"),
                        "xError": info.get("x_dist"),
                        "yError": info.get("y_dist"),
                        "xRatioIndex": info.get("x_ratio_idx"),
                        "yRatioIndex": info.get("y_ratio_idx"),
                    }
                )

            per_boss_rows.append(
                {
                    **point,
                    "matchedAny": len(boss_matches) > 0,
                    "matchedCount": len(boss_matches),
                    "matches": boss_matches,
                }
            )

        best_variant_label: Optional[str] = None
        if variant_summaries:
            variant_summaries.sort(key=self._variant_summary_rank_key)
            best_variant_label = str(variant_summaries[0]["variantLabel"])

        payload = {
            "projectDir": str(project_dir),
            "outputDir": str(self._cut_typology_dir(project_dir)),
            "roi": roi,
            "params": resolved_params,
            "points": points_with_uv,
            "variants": variant_summaries,
            "perBoss": per_boss_rows,
            "bestVariantLabel": best_variant_label,
            "ranAt": datetime.now().isoformat(),
        }

        self._write_match_csv(project_dir, roi, per_boss_rows)
        self._persist_matching_result(project_dir, payload)
        payload["matchCsvPath"] = str(self._matching_csv_path(project_dir))
        return payload

    def _get_match_csv_sync(self, project_id: str) -> Dict[str, Any]:
        project_dir = get_project_dir(project_id)
        csv_path = self._matching_csv_path(project_dir)
        if not csv_path.exists():
            raise FileNotFoundError(f"Match CSV not found: {csv_path}. Run cut-typology matching first.")

        rows: List[Dict[str, str]] = []
        with csv_path.open("r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            columns = list(reader.fieldnames or [])
            for row in reader:
                rows.append({str(k): str(v or "") for k, v in row.items()})

        return {
            "projectDir": str(project_dir),
            "csvPath": str(csv_path),
            "columns": columns,
            "rows": rows,
        }

    @staticmethod
    def _load_json_object(path: Path) -> Dict[str, Any]:
        with path.open("r", encoding="utf-8") as f:
            raw = json.load(f)
        if not isinstance(raw, dict):
            raise ValueError(f"Expected JSON object at {path}")
        return raw

    @staticmethod
    def _cut_typology_dir(project_dir: Path) -> Path:
        old_dir = project_dir / "2d_geometry" / "template_matching"
        out_dir = project_dir / "2d_geometry" / "cut_typology_matching"
        if old_dir.exists() and not out_dir.exists():
            old_dir.rename(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        return out_dir

    @classmethod
    def _node_points_path(cls, project_dir: Path) -> Path:
        out_dir = cls._cut_typology_dir(project_dir)
        old_path = out_dir / "boss_points.json"
        new_path = out_dir / "node_points.json"
        if old_path.exists() and not new_path.exists():
            old_path.rename(new_path)
        return new_path

    @classmethod
    def _matching_result_path(cls, project_dir: Path) -> Path:
        out_dir = cls._cut_typology_dir(project_dir)
        old_path = out_dir / "matching_result.json"
        new_path = out_dir / "cut_typology_result.json"
        if old_path.exists() and not new_path.exists():
            old_path.rename(new_path)
        return new_path

    @classmethod
    def _matching_csv_path(cls, project_dir: Path) -> Path:
        out_dir = cls._cut_typology_dir(project_dir)
        old_path = out_dir / "boss_template_match.csv"
        new_path = out_dir / "boss_cut_typology_match.csv"
        if old_path.exists() and not new_path.exists():
            old_path.rename(new_path)
        return new_path

    @classmethod
    def _persist_matching_result(cls, project_dir: Path, payload: Dict[str, Any]) -> None:
        path = cls._matching_result_path(project_dir)
        with path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)

    @classmethod
    def _persist_points(cls, project_dir: Path, points: Sequence[Dict[str, Any]]) -> None:
        path = cls._node_points_path(project_dir)
        payload = {
            "source": "services.geometry2d.node_preparation_service",
            "updated_at": datetime.now().isoformat(),
            "node_count": len(points),
            "points": list(points),
        }
        with path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)

    @staticmethod
    def _variant_priority(variant_label: str) -> Tuple[int, int]:
        if variant_label.startswith("starcut_n="):
            try:
                return (0, int(variant_label.split("=", 1)[1]))
            except Exception:
                return (0, 9999)
        if variant_label == "circlecut_inner":
            return (1, 0)
        if variant_label == "circlecut_outer":
            return (2, 0)
        return (3, 9999)

    @classmethod
    def _variant_summary_rank_key(cls, summary: Dict[str, Any]) -> Tuple[int, int, int, str]:
        matched_count = int(summary.get("matchedCount") or 0)
        template_type = str(summary.get("templateType") or "")
        variant_label = str(summary.get("variantLabel") or "")

        if template_type == "starcut":
            complexity = 0
        elif template_type == "circlecut":
            complexity = 1 if variant_label == "circlecut_inner" else 2
        elif template_type == "cross" or bool(summary.get("isCrossTemplate")):
            complexity = 3
        else:
            complexity = 4

        n_value = int(summary["n"]) if isinstance(summary.get("n"), (int, float)) else 9999
        return (-matched_count, complexity, n_value, variant_label)

    @classmethod
    def _select_simplest_match(cls, matches: Sequence[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not matches:
            return None
        return sorted(
            matches,
            key=lambda match: (
                cls._variant_priority(str(match.get("variantLabel", ""))),
                float(match.get("xError") or 9999.0) + float(match.get("yError") or 9999.0),
            ),
        )[0]

    @classmethod
    def _write_match_csv(cls, project_dir: Path, roi: Dict[str, float], per_boss_rows: Sequence[Dict[str, Any]]) -> None:
        csv_path = cls._matching_csv_path(project_dir)
        fieldnames = [
            "boss_id",
            "variant_label",
            "template_type",
            "x_cut",
            "y_cut",
            "boss_uv",
            "template_uv",
            "boss_xy",
            "template_xy",
            "x_error",
            "y_error",
            "matched",
        ]

        rows: List[Dict[str, Any]] = []
        for point in per_boss_rows:
            boss_id = point.get("id")
            boss_uv = [point.get("u"), point.get("v")]
            boss_xy = [int(round(float(point.get("x", 0.0)))), int(round(float(point.get("y", 0.0))))]
            matches = point.get("matches")
            if not isinstance(matches, list) or len(matches) == 0:
                rows.append(
                    {
                        "boss_id": boss_id,
                        "variant_label": "None",
                        "template_type": "None",
                        "x_cut": "None",
                        "y_cut": "None",
                        "boss_uv": str(boss_uv),
                        "template_uv": "None",
                        "boss_xy": str(boss_xy),
                        "template_xy": "None",
                        "x_error": "None",
                        "y_error": "None",
                        "matched": False,
                    }
                )
                continue

            match = cls._select_simplest_match(matches)
            if not isinstance(match, dict):
                continue

            variant_label = str(match.get("variantLabel") or "None")
            is_cross = bool(match.get("isCrossTemplate"))
            x_cut = str(match.get("xTemplate") or "None") if is_cross else variant_label
            y_cut = str(match.get("yTemplate") or "None") if is_cross else variant_label
            x_ratio = match.get("xRatio")
            y_ratio = match.get("yRatio")

            template_xy: Optional[List[int]] = None
            if isinstance(x_ratio, (int, float)) and isinstance(y_ratio, (int, float)):
                tx, ty = unit_to_image((float(x_ratio), float(y_ratio)), roi)
                template_xy = [int(round(float(tx))), int(round(float(ty)))]

            rows.append(
                {
                    "boss_id": boss_id,
                    "variant_label": variant_label,
                    "template_type": str(match.get("templateType") or "None"),
                    "x_cut": x_cut,
                    "y_cut": y_cut,
                    "boss_uv": str(boss_uv),
                    "template_uv": str([x_ratio, y_ratio]) if x_ratio is not None and y_ratio is not None else "None",
                    "boss_xy": str(boss_xy),
                    "template_xy": str(template_xy) if template_xy is not None else "None",
                    "x_error": match.get("xError", "None"),
                    "y_error": match.get("yError", "None"),
                    "matched": bool(match.get("xRatio") is not None and match.get("yRatio") is not None),
                }
            )

        with csv_path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

    def _load_roi_params(self, project_dir: Path) -> Dict[str, float]:
        roi_path = project_dir / "2d_geometry" / "roi.json"
        if not roi_path.exists():
            raise FileNotFoundError(f"ROI not found: {roi_path}. Run ROI analysis first.")

        payload = self._load_json_object(roi_path)
        params = payload.get("params")
        if not isinstance(params, dict):
            raise ValueError("roi.json missing params")

        required = ("cx", "cy", "w", "h")
        for key in required:
            if key not in params:
                raise ValueError(f"roi.json params missing '{key}'")

        return {
            "cx": float(params["cx"]),
            "cy": float(params["cy"]),
            "w": float(params["w"]),
            "h": float(params["h"]),
            "rotation_deg": float(params.get("rotation_deg", 0.0) or 0.0),
            "scale": float(params.get("scale", 1.0) or 1.0),
        }

    def _load_base_points(self, project_dir: Path) -> List[Dict[str, Any]]:
        boss_path = project_dir / "2d_geometry" / "boss_report.json"
        if not boss_path.exists():
            raise FileNotFoundError(f"Boss report not found: {boss_path}. Run ROI analysis first.")

        payload = self._load_json_object(boss_path)
        bosses = payload.get("bosses")
        if not isinstance(bosses, list):
            raise ValueError("boss_report.json missing bosses")

        points: List[Dict[str, Any]] = []
        for idx, boss in enumerate(bosses, start=1):
            if not isinstance(boss, dict):
                continue
            centroid = boss.get("centroid_xy")
            if not isinstance(centroid, dict):
                continue
            if "x" not in centroid or "y" not in centroid:
                continue
            boss_id = int(boss.get("id", idx))
            points.append(
                {
                    "id": boss_id,
                    "label": str(boss_id),
                    "x": float(centroid["x"]),
                    "y": float(centroid["y"]),
                    "source": "auto",
                }
            )

        points.sort(key=lambda p: int(p["id"]))
        return points

    def _read_or_build_points(self, project_dir: Path) -> List[Dict[str, Any]]:
        state_path = self._node_points_path(project_dir)
        if state_path.exists():
            payload = self._load_json_object(state_path)
            raw_points = payload.get("points")
            if isinstance(raw_points, list):
                return self._normalise_points(raw_points)

        points = self._load_base_points(project_dir)
        self._persist_points(project_dir, points)
        return points

    @staticmethod
    def _normalise_points(points: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not points:
            return []

        normalised: List[Dict[str, Any]] = []
        seen_ids: set[int] = set()
        for row in points:
            if not isinstance(row, dict):
                raise ValueError("Each point must be an object")
            if "id" not in row or "x" not in row or "y" not in row:
                raise ValueError("Each point requires id, x, y")
            point_id = int(row["id"])
            if point_id <= 0:
                raise ValueError("Point id must be a positive integer")
            if point_id in seen_ids:
                raise ValueError(f"Duplicate point id: {point_id}")
            seen_ids.add(point_id)

            normalised.append(
                {
                    "id": point_id,
                    "label": str(point_id),
                    "x": float(row["x"]),
                    "y": float(row["y"]),
                    "source": str(row.get("source", "manual")),
                }
            )

        normalised.sort(key=lambda p: int(p["id"]))
        return normalised

    @staticmethod
    def _attach_uv(points: Sequence[Dict[str, Any]], roi: Dict[str, float]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for point in points:
            u, v = image_to_unit((float(point["x"]), float(point["y"])), roi)
            out.append(
                {
                    **point,
                    "u": float(u),
                    "v": float(v),
                    "outOfBounds": bool(
                        not (
                            -ROI_INSIDE_MARGIN_UV <= u <= 1.0 + ROI_INSIDE_MARGIN_UV
                            and -ROI_INSIDE_MARGIN_UV <= v <= 1.0 + ROI_INSIDE_MARGIN_UV
                        )
                    ),
                }
            )
        return out

    @staticmethod
    def _resolve_params(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        source = dict(DEFAULT_TEMPLATE_PARAMS)
        if isinstance(raw, dict):
            source.update(raw)

        starcut_min = max(2, int(source.get("starcutMin", DEFAULT_TEMPLATE_PARAMS["starcutMin"])))
        starcut_max = max(starcut_min, int(source.get("starcutMax", DEFAULT_TEMPLATE_PARAMS["starcutMax"])))

        params = {
            "starcutMin": int(starcut_min),
            "starcutMax": int(starcut_max),
            "includeStarcut": bool(source.get("includeStarcut", True)),
            "includeInner": bool(source.get("includeInner", True)),
            "includeOuter": bool(source.get("includeOuter", True)),
            "allowCrossTemplate": bool(source.get("allowCrossTemplate", True)),
            "tolerance": float(source.get("tolerance", DEFAULT_TEMPLATE_PARAMS["tolerance"])),
        }
        params["tolerance"] = min(0.1, max(0.001, params["tolerance"]))

        if not (params["includeStarcut"] or params["includeInner"] or params["includeOuter"]):
            raise ValueError("At least one cut-typology family must be enabled")
        return params

    @staticmethod
    def _variant_label(template_type: str, n: Optional[int], subtype: Optional[str]) -> str:
        if template_type == "starcut" and n is not None:
            return f"starcut_n={n}"
        if template_type == "circlecut" and subtype:
            return f"circlecut_{subtype}"
        return f"{template_type}_{subtype or n or '?'}"

    @staticmethod
    def _grid_overlay_lines(n: int) -> List[List[List[float]]]:
        lines: List[List[List[float]]] = []
        steps = int(max(2, n))
        for i in range(0, steps + 1):
            u = float(i / steps)
            lines.append([[u, 0.0], [u, 1.0]])
            lines.append([[0.0, u], [1.0, u]])
        return lines

    @staticmethod
    def _ray_circle_point(
        centre: Tuple[float, float],
        target: Tuple[float, float],
        radius: float,
    ) -> Tuple[float, float]:
        c = np.array(centre, dtype=float)
        v = np.array(target, dtype=float) - c
        n = float(np.linalg.norm(v))
        if n == 0:
            return float(c[0]), float(c[1])
        p = c + radius * (v / n)
        return float(p[0]), float(p[1])

    def _circle_overlay(self, roi: Dict[str, float], variant: str) -> Tuple[List[List[List[float]]], List[List[float]]]:
        cx, cy = float(roi["cx"]), float(roi["cy"])
        w, h = float(roi["w"]), float(roi["h"])
        if variant == "inner":
            radius = 0.5 * max(w, h)
        elif variant == "outer":
            radius = 0.5 * math.hypot(w, h)
        else:
            raise ValueError("Circle overlay variant must be 'inner' or 'outer'")

        mt = unit_to_image((0.5, 0.0), roi)
        mr = unit_to_image((1.0, 0.5), roi)
        mb = unit_to_image((0.5, 1.0), roi)
        ml = unit_to_image((0.0, 0.5), roi)

        pt = image_to_unit(self._ray_circle_point((cx, cy), mt, radius), roi)
        pr = image_to_unit(self._ray_circle_point((cx, cy), mr, radius), roi)
        pb = image_to_unit(self._ray_circle_point((cx, cy), mb, radius), roi)
        pl = image_to_unit(self._ray_circle_point((cx, cy), ml, radius), roi)

        circle_points: List[List[float]] = []
        n_samples = 72
        angle0 = math.radians(float(roi.get("rotation_deg", 0.0) or 0.0))
        for i in range(n_samples):
            t = (2.0 * math.pi * i / n_samples) + angle0
            xi = cx + radius * math.cos(t)
            yi = cy + radius * math.sin(t)
            u, v = image_to_unit((xi, yi), roi)
            circle_points.append([float(u), float(v)])

        lines: List[List[List[float]]] = []
        for i in range(n_samples):
            a = circle_points[i]
            b = circle_points[(i + 1) % n_samples]
            lines.append([a, b])

        # Add circle-starcut spine guides.
        guides: List[List[List[float]]] = [
            [[0.0, 0.0], [1.0, 1.0]],
            [[1.0, 0.0], [0.0, 1.0]],
            [[0.0, 0.0], list(pr)],
            [[0.0, 0.0], list(pb)],
            [[1.0, 0.0], list(pl)],
            [[1.0, 0.0], list(pb)],
            [[1.0, 1.0], list(pt)],
            [[1.0, 1.0], list(pl)],
            [[0.0, 1.0], list(pt)],
            [[0.0, 1.0], list(pr)],
            [list(pt), list(pb)],
            [list(pl), list(pr)],
        ]
        lines.extend(guides)

        key_points = [list(pt), list(pr), list(pb), list(pl), [0.5, 0.5]]
        return lines, key_points

    def _build_variants(self, roi: Dict[str, float], params: Dict[str, Any]) -> List[TemplateVariant]:
        variants: List[TemplateVariant] = []

        if bool(params.get("includeStarcut", True)):
            for n in range(int(params["starcutMin"]), int(params["starcutMax"]) + 1):
                keypoints = np.array(generate_keypoints("standard", n=n), dtype=float)
                label = self._variant_label("starcut", n, None)
                variants.append(
                    TemplateVariant(
                        variant_label=label,
                        template_type="starcut",
                        variant="standard",
                        n=n,
                        template_uv=keypoints,
                        overlay_lines_uv=self._grid_overlay_lines(n),
                        overlay_points_uv=keypoints.tolist(),
                    )
                )

        if bool(params.get("includeInner", True)):
            inner_points = np.array(generate_keypoints("inner", roi=roi), dtype=float)
            inner_lines, inner_markers = self._circle_overlay(roi, "inner")
            variants.append(
                TemplateVariant(
                    variant_label=self._variant_label("circlecut", None, "inner"),
                    template_type="circlecut",
                    variant="inner",
                    n=None,
                    template_uv=inner_points,
                    overlay_lines_uv=inner_lines,
                    overlay_points_uv=inner_markers,
                )
            )

        if bool(params.get("includeOuter", True)):
            outer_points = np.array(generate_keypoints("outer", roi=roi), dtype=float)
            outer_lines, outer_markers = self._circle_overlay(roi, "outer")
            variants.append(
                TemplateVariant(
                    variant_label=self._variant_label("circlecut", None, "outer"),
                    template_type="circlecut",
                    variant="outer",
                    n=None,
                    template_uv=outer_points,
                    overlay_lines_uv=outer_lines,
                    overlay_points_uv=outer_markers,
                )
            )

        if not variants:
            raise ValueError("No template variants enabled")

        if bool(params.get("allowCrossTemplate", True)):
            starcuts = [v for v in variants if v.template_type == "starcut"]
            circles = [v for v in variants if v.template_type == "circlecut"]
            for sx in starcuts:
                for cy in circles:
                    label = f"{sx.variant_label}_x+{cy.variant_label}_y"
                    variants.append(
                        TemplateVariant(
                            variant_label=label,
                            template_type="cross",
                            variant="cross",
                            n=None,
                            template_uv=np.empty((0, 2), dtype=float),
                            overlay_lines_uv=sx.overlay_lines_uv + cy.overlay_lines_uv,
                            overlay_points_uv=sx.overlay_points_uv + cy.overlay_points_uv,
                            x_source_label=sx.variant_label,
                            y_source_label=cy.variant_label,
                        )
                    )
            for cx in circles:
                for sy in starcuts:
                    label = f"{cx.variant_label}_x+{sy.variant_label}_y"
                    variants.append(
                        TemplateVariant(
                            variant_label=label,
                            template_type="cross",
                            variant="cross",
                            n=None,
                            template_uv=np.empty((0, 2), dtype=float),
                            overlay_lines_uv=cx.overlay_lines_uv + sy.overlay_lines_uv,
                            overlay_points_uv=cx.overlay_points_uv + sy.overlay_points_uv,
                            x_source_label=cx.variant_label,
                            y_source_label=sy.variant_label,
                        )
                    )

        return variants

    @staticmethod
    def _get_variant_by_label(variants: Sequence[TemplateVariant], label: str) -> Optional[TemplateVariant]:
        for variant in variants:
            if variant.variant_label == label:
                return variant
        return None

    @staticmethod
    def _match_with_ratio_sets(
        bosses_uv: np.ndarray,
        *,
        x_ratios: np.ndarray,
        y_ratios: np.ndarray,
        tolerance: float,
        x_template_label: Optional[str] = None,
        y_template_label: Optional[str] = None,
    ) -> Dict[int, Dict[str, Any]]:
        out: Dict[int, Dict[str, Any]] = {}
        for boss_idx in range(bosses_uv.shape[0]):
            boss_uv = bosses_uv[boss_idx]
            x_idx, y_idx, x_dist, y_dist = match_boss_to_ratios(
                (float(boss_uv[0]), float(boss_uv[1])),
                x_ratios,
                y_ratios,
                tolerance,
            )
            out[boss_idx] = {
                "matched": bool(x_idx is not None and y_idx is not None),
                "x_ratio_idx": x_idx,
                "y_ratio_idx": y_idx,
                "x_ratio": float(x_ratios[x_idx]) if x_idx is not None else None,
                "y_ratio": float(y_ratios[y_idx]) if y_idx is not None else None,
                "x_dist": float(x_dist),
                "y_dist": float(y_dist),
                "x_template": x_template_label,
                "y_template": y_template_label,
            }
        return out

    @staticmethod
    def _serialize_overlay_variants(variants: Iterable[TemplateVariant]) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for variant in variants:
            rows.append(
                {
                    "variantLabel": variant.variant_label,
                    "templateType": variant.template_type,
                    "variant": variant.variant,
                    "n": variant.n,
                    "isCrossTemplate": bool(variant.x_source_label and variant.y_source_label),
                    "xTemplate": variant.x_source_label,
                    "yTemplate": variant.y_source_label,
                    "overlay": {
                        "linesUv": variant.overlay_lines_uv,
                        "pointsUv": variant.overlay_points_uv,
                    },
                }
            )
        return rows
