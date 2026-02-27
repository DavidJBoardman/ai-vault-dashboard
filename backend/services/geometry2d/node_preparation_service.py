"""Stage 4.2 node alignment and preparation service."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, Sequence

from services.geometry2d.cut_typology_matching_service import CutTypologyMatchingService


class NodePreparationService:
    """Load and persist editable reconstruction nodes."""

    async def get_state(self, project_id: str) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_state_sync, project_id)

    async def save_nodes(self, project_id: str, points: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._save_nodes_sync, project_id, list(points))

    @staticmethod
    def _get_state_sync(project_id: str) -> Dict[str, Any]:
        # Reuse cut-typology shared node loading to avoid duplicated point logic.
        service = CutTypologyMatchingService()
        return service._get_state_sync(project_id)

    @staticmethod
    def _save_nodes_sync(project_id: str, points: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
        service = CutTypologyMatchingService()
        return service._save_points_sync(project_id, points)
