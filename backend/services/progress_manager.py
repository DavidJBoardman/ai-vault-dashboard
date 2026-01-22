"""Progress manager for WebSocket-based progress updates."""

import asyncio
import json
from typing import List, Dict, Any
from fastapi import WebSocket


class ProgressManager:
    """Manages WebSocket connections and broadcasts progress updates."""
    
    def __init__(self):
        self.clients: List[WebSocket] = []
        self._lock = asyncio.Lock()
    
    def add_client(self, websocket: WebSocket):
        """Add a WebSocket client."""
        self.clients.append(websocket)
    
    def remove_client(self, websocket: WebSocket):
        """Remove a WebSocket client."""
        if websocket in self.clients:
            self.clients.remove(websocket)
    
    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast a message to all connected clients."""
        disconnected = []
        
        for client in self.clients:
            try:
                await client.send_text(json.dumps(message))
            except Exception:
                disconnected.append(client)
        
        # Clean up disconnected clients
        for client in disconnected:
            self.remove_client(client)
    
    async def send_progress(self, step: str, percent: float, message: str):
        """Send a progress update to all clients."""
        await self.broadcast({
            "type": "progress",
            "step": step,
            "percent": percent,
            "message": message,
        })
    
    async def send_complete(self, step: str, result: Any = None):
        """Send a completion message."""
        await self.broadcast({
            "type": "complete",
            "step": step,
            "result": result,
        })
    
    async def send_error(self, step: str, error: str):
        """Send an error message."""
        await self.broadcast({
            "type": "error",
            "step": step,
            "error": error,
        })


# Global instance
_progress_manager: ProgressManager = None


def get_progress_manager() -> ProgressManager:
    """Get the global progress manager instance."""
    global _progress_manager
    if _progress_manager is None:
        _progress_manager = ProgressManager()
    return _progress_manager

