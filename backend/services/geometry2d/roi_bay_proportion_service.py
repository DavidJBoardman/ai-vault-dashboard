"""Stage 4.1 ROI and bay proportion service."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Dict, Optional, Sequence

from services.geometry2d.prepare_bosses import prepare_bosses_for_geometry2d
from services.geometry2d.roi_correction import auto_correct_roi_params, resolve_auto_correct_options
from services.geometry2d.roi_adapter import get_project_dir, prepare_roi_for_geometry2d


class RoiBayProportionService:
    """Prepare ROI and bay proportion inputs for Geometry2D."""

    async def prepare(
        self,
        *,
        project_id: str,
        projection_id: str,
        manual_bosses: Optional[Sequence[Dict[str, float]]] = None,
        min_boss_area: int = 10,
        auto_correct_roi: bool = True,
        auto_correct_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._prepare_sync,
            project_id,
            projection_id,
            manual_bosses,
            min_boss_area,
            auto_correct_roi,
            auto_correct_config,
        )

    def _prepare_sync(
        self,
        project_id: str,
        projection_id: str,
        manual_bosses: Optional[Sequence[Dict[str, float]]],
        min_boss_area: int,
        auto_correct_roi: bool,
        auto_correct_config: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        project_dir = get_project_dir(project_id)

        roi_payload = prepare_roi_for_geometry2d(project_id, projection_id)
        original_params = dict(roi_payload.get("params", {}))
        boss_payload = prepare_bosses_for_geometry2d(
            project_dir,
            roi_payload=roi_payload,
            manual_bosses=manual_bosses,
            min_area=min_boss_area,
        )
        correction_options = resolve_auto_correct_options(auto_correct_config)
        correction = (
            auto_correct_roi_params(original_params, boss_payload, **{
                k: v for k, v in correction_options.items() if k != "preset"
            })
            if auto_correct_roi and isinstance(original_params, dict)
            else None
        )

        roi_payload["original_params"] = original_params
        roi_payload["correction_requested"] = bool(auto_correct_roi)
        if correction:
            corrected_params = correction["params"]
            correction_meta = correction.get("meta", {})
            if isinstance(correction_meta, dict):
                correction_meta["preset"] = correction_options.get("preset", "balanced")
            improved = bool(correction_meta.get("improved")) if isinstance(correction_meta, dict) else True
            roi_payload["corrected_params"] = corrected_params
            roi_payload["correction_applied"] = improved
            roi_payload["auto_correction"] = correction_meta
            if improved:
                roi_payload["params"] = corrected_params
                self._persist_roi_payload(project_dir, roi_payload)
                boss_payload = prepare_bosses_for_geometry2d(
                    project_dir,
                    roi_payload=roi_payload,
                    manual_bosses=manual_bosses,
                    min_area=min_boss_area,
                )
            else:
                roi_payload["params"] = original_params
                self._persist_roi_payload(project_dir, roi_payload)
        else:
            roi_payload["corrected_params"] = None
            roi_payload["correction_applied"] = False
            if auto_correct_roi:
                roi_payload["auto_correction"] = {
                    "method": "boss_uv_bbox",
                    "status": "skipped",
                    "reason": "not_enough_in_bounds_boss_points_or_invalid_roi",
                }
            self._persist_roi_payload(project_dir, roi_payload)

        out_dir = project_dir / "2d_geometry"
        return {
            "projectDir": str(project_dir),
            "outputDir": str(out_dir),
            "roiPath": str((out_dir / "roi.json")),
            "bossReportPath": str((out_dir / "boss_report.json")),
            "roi": roi_payload,
            "bossReport": boss_payload,
        }

    @staticmethod
    def _persist_roi_payload(project_dir: Path, roi_payload: Dict[str, Any]) -> None:
        out_path = project_dir / "2d_geometry" / "roi.json"
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(roi_payload, f, indent=2)
