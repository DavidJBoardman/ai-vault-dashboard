"""Stage 4.5 evidence report service."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from html import escape
from pathlib import Path
from typing import Any, Dict, Optional

from services.geometry2d.roi_adapter import get_project_dir


class EvidenceReportService:
    """Assemble evidence report artefacts for Step 4."""

    async def get_state(self, project_id: str) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_state_sync, project_id)

    async def generate(self, project_id: str) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._generate_sync, project_id)

    def _get_state_sync(self, project_id: str) -> Dict[str, Any]:
        project_dir = get_project_dir(project_id)
        report_dir = self._report_dir(project_dir)
        state_path = report_dir / "state.json"
        report_json_path = report_dir / "evidence_report.json"
        report_html_path = report_dir / "evidence_report.html"

        state_payload: Dict[str, Any] = {
            "projectDir": str(project_dir),
            "outputDir": str(report_dir),
            "statePath": str(state_path),
            "reportJsonPath": str(report_json_path) if report_json_path.exists() else None,
            "reportHtmlPath": str(report_html_path) if report_html_path.exists() else None,
            "lastGeneratedAt": None,
            "summary": None,
        }
        if state_path.exists():
            saved = self._load_json(state_path)
            state_payload["lastGeneratedAt"] = saved.get("lastGeneratedAt")
            state_payload["summary"] = saved.get("summary")

        return state_payload

    def _generate_sync(self, project_id: str) -> Dict[str, Any]:
        project_dir = get_project_dir(project_id)
        report_dir = self._report_dir(project_dir)
        report_payload = self._build_report_payload(project_dir, project_id)
        report_html = self._render_report_html(report_payload)

        report_json_path = report_dir / "evidence_report.json"
        report_html_path = report_dir / "evidence_report.html"
        state_path = report_dir / "state.json"

        with report_json_path.open("w", encoding="utf-8") as f:
            json.dump(report_payload, f, indent=2)
        report_html_path.write_text(report_html, encoding="utf-8")

        summary = {
            "ranAt": report_payload.get("ranAt"),
            "nodeCount": report_payload.get("nodePreparation", {}).get("nodeCount"),
            "edgeCount": report_payload.get("bayPlanReconstruction", {}).get("edgeCount"),
            "bestTypology": report_payload.get("cutTypologyMatching", {}).get("bestVariantLabel"),
        }
        state_payload = {
            "lastGeneratedAt": report_payload.get("ranAt"),
            "summary": summary,
            "updatedAt": datetime.now().isoformat(),
        }
        with state_path.open("w", encoding="utf-8") as f:
            json.dump(state_payload, f, indent=2)

        return {
            "projectDir": str(project_dir),
            "outputDir": str(report_dir),
            "statePath": str(state_path),
            "reportJsonPath": str(report_json_path),
            "reportHtmlPath": str(report_html_path),
            "reportHtml": report_html,
            "summary": summary,
            "ranAt": report_payload.get("ranAt"),
        }

    @staticmethod
    def _report_dir(project_dir: Path) -> Path:
        out = project_dir / "2d_geometry" / "evidence_report"
        out.mkdir(parents=True, exist_ok=True)
        return out

    @staticmethod
    def _load_json(path: Path) -> Dict[str, Any]:
        with path.open("r", encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise ValueError(f"Expected JSON object at {path}")
        return payload

    @classmethod
    def _load_optional_json(cls, path: Path) -> Optional[Dict[str, Any]]:
        if not path.exists():
            return None
        return cls._load_json(path)

    @classmethod
    def _resolve_cut_typology_dir(cls, project_dir: Path) -> Path:
        old_dir = project_dir / "2d_geometry" / "template_matching"
        new_dir = project_dir / "2d_geometry" / "cut_typology_matching"
        if old_dir.exists() and not new_dir.exists():
            old_dir.rename(new_dir)
        new_dir.mkdir(parents=True, exist_ok=True)
        return new_dir

    @classmethod
    def _resolve_bay_plan_dir(cls, project_dir: Path) -> Path:
        old_dir = project_dir / "2d_geometry" / "reconstruction"
        new_dir = project_dir / "2d_geometry" / "bay_plan_reconstruction"
        if old_dir.exists() and not new_dir.exists():
            old_dir.rename(new_dir)
        new_dir.mkdir(parents=True, exist_ok=True)
        return new_dir

    def _build_report_payload(self, project_dir: Path, project_id: str) -> Dict[str, Any]:
        roi_payload = self._load_optional_json(project_dir / "2d_geometry" / "roi.json") or {}
        boss_payload = self._load_optional_json(project_dir / "2d_geometry" / "boss_report.json") or {}

        cut_dir = self._resolve_cut_typology_dir(project_dir)
        cut_result = self._load_optional_json(cut_dir / "cut_typology_result.json")
        if cut_result is None:
            cut_result = self._load_optional_json(cut_dir / "matching_result.json")

        bay_dir = self._resolve_bay_plan_dir(project_dir)
        bay_result = self._load_optional_json(bay_dir / "result.json") or {}

        node_points_payload = self._load_optional_json(cut_dir / "node_points.json")
        if node_points_payload is None:
            node_points_payload = self._load_optional_json(cut_dir / "boss_points.json")

        return {
            "projectId": project_id,
            "projectDir": str(project_dir),
            "ranAt": datetime.now().isoformat(),
            "roiBayProportion": {
                "vaultRatio": roi_payload.get("vault_ratio"),
                "vaultRatioSuggestions": roi_payload.get("vault_ratio_suggestions", []),
                "correctionApplied": roi_payload.get("correction_applied", False),
                "correctionRequested": roi_payload.get("correction_requested", False),
                "roiPath": str(project_dir / "2d_geometry" / "roi.json"),
            },
            "nodePreparation": {
                "nodeCount": int((node_points_payload or {}).get("node_count") or (node_points_payload or {}).get("boss_count") or 0),
                "rawBossCount": int((boss_payload or {}).get("boss_count") or 0),
                "statePath": str(cut_dir / "node_points.json"),
            },
            "cutTypologyMatching": {
                "bestVariantLabel": (cut_result or {}).get("bestVariantLabel"),
                "variantCount": len((cut_result or {}).get("variants", []) or []),
                "tolerance": ((cut_result or {}).get("params", {}) or {}).get("tolerance"),
                "ranAt": (cut_result or {}).get("ranAt"),
                "resultPath": str(cut_dir / "cut_typology_result.json"),
                "csvPath": str(cut_dir / "boss_cut_typology_match.csv"),
            },
            "bayPlanReconstruction": {
                "nodeCount": bay_result.get("nodeCount"),
                "edgeCount": bay_result.get("edgeCount"),
                "enabledConstraintFamilies": bay_result.get("enabledConstraintFamilies", []),
                "fallbackApplied": bay_result.get("fallbackApplied", False),
                "fallbackReason": bay_result.get("fallbackReason", ""),
                "ranAt": bay_result.get("ranAt"),
                "resultPath": str(bay_dir / "result.json"),
            },
            "provenance": {
                "softwareVersion": "1.0.0",
                "generatedAt": datetime.now().isoformat(),
                "paths": {
                    "roi": str(project_dir / "2d_geometry" / "roi.json"),
                    "bossReport": str(project_dir / "2d_geometry" / "boss_report.json"),
                    "cutTypologyDir": str(cut_dir),
                    "bayPlanDir": str(bay_dir),
                },
            },
        }

    @staticmethod
    def _render_report_html(payload: Dict[str, Any]) -> str:
        def pp(value: Any) -> str:
            return escape(json.dumps(value, indent=2, ensure_ascii=False))

        return f"""<!doctype html>
<html lang=\"en-GB\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>Vault Evidence Report</title>
  <style>
    body {{ font-family: Georgia, 'Times New Roman', serif; margin: 24px; color: #0f172a; }}
    h1 {{ margin: 0 0 8px; }}
    h2 {{ margin-top: 24px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }}
    .meta {{ color: #475569; margin-bottom: 12px; }}
    pre {{ background: #f8fafc; padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: auto; }}
    @media print {{ body {{ margin: 12mm; }} }}
  </style>
</head>
<body>
  <h1>Step 4 Evidence Report</h1>
  <div class=\"meta\">Generated: {escape(str(payload.get('ranAt', '')))}</div>

  <h2>4.1 ROI &amp; Bay Proportion</h2>
  <pre>{pp(payload.get('roiBayProportion', {}))}</pre>

  <h2>4.2 Node Alignment &amp; Preparation</h2>
  <pre>{pp(payload.get('nodePreparation', {}))}</pre>

  <h2>4.3 Cut-Typology Matching</h2>
  <pre>{pp(payload.get('cutTypologyMatching', {}))}</pre>

  <h2>4.4 Bay Plan Reconstruction</h2>
  <pre>{pp(payload.get('bayPlanReconstruction', {}))}</pre>

  <h2>4.5 Provenance</h2>
  <pre>{pp(payload.get('provenance', {}))}</pre>
</body>
</html>
"""
