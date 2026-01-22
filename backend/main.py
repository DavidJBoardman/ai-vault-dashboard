"""
Medieval Vault Architecture Analysis - Python Backend
FastAPI server for point cloud processing, segmentation, and geometry analysis.
"""

import argparse
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from routers import upload, projection, segmentation, geometry, export
from services.progress_manager import ProgressManager
from services.e57_processor import get_processor

# Global progress manager for WebSocket updates
progress_manager = ProgressManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    # Startup
    print("Starting Vault Analyzer Backend...")
    print("=" * 50)
    
    # Create necessary directories
    data_dir = Path("./data")
    data_dir.mkdir(exist_ok=True)
    (data_dir / "uploads").mkdir(exist_ok=True)
    (data_dir / "projections").mkdir(exist_ok=True)
    (data_dir / "segmentations").mkdir(exist_ok=True)
    (data_dir / "exports").mkdir(exist_ok=True)
    
    print(f"Data directory: {data_dir.absolute()}")
    print("Backend ready!")
    print("=" * 50)
    
    yield
    
    # Shutdown
    print("Shutting down Vault Analyzer Backend...")


app = FastAPI(
    title="Vault Analyzer API",
    description="Backend API for Medieval Vault Architecture Analysis",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware for Electron app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(upload.router, prefix="/api/upload", tags=["Upload"])
app.include_router(projection.router, prefix="/api/projection", tags=["Projection"])
app.include_router(segmentation.router, prefix="/api/segmentation", tags=["Segmentation"])
app.include_router(geometry.router, prefix="/api/geometry", tags=["Geometry"])
app.include_router(export.router, prefix="/api/export", tags=["Export"])


@app.get("/health")
async def health_check() -> Dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "service": "vault-analyzer"}


@app.get("/api/pointcloud/chunk")
async def get_pointcloud_chunk(
    start: int = Query(0, ge=0),
    count: int = Query(10000, ge=1, le=100000)
) -> Dict[str, Any]:
    """Get a chunk of the loaded point cloud."""
    processor = get_processor()
    
    if not processor.is_loaded():
        return {
            "points": [],
            "start": start,
            "count": 0,
            "total": 0,
        }
    
    return processor.get_points_chunk(start, count)


@app.get("/api/pointcloud/preview")
async def get_pointcloud_preview(
    max_points: int = Query(50000, ge=1000, le=200000)
) -> Dict[str, Any]:
    """Get a downsampled preview of the point cloud."""
    processor = get_processor()
    
    if not processor.is_loaded():
        return {"points": [], "total": 0, "bounding_box": None}
    
    points = processor.get_downsampled_points(max_points)
    return {
        "points": points,
        "total": processor.point_count,
        "bounding_box": processor.bounding_box,
    }


@app.get("/api/pointcloud/status")
async def get_pointcloud_status() -> Dict[str, Any]:
    """Get the status of the loaded point cloud."""
    processor = get_processor()
    
    return {
        "loaded": processor.is_loaded(),
        "file": processor.current_file,
        "point_count": processor.point_count if processor.is_loaded() else 0,
        "has_color": processor.has_color if processor.is_loaded() else False,
        "has_intensity": processor.has_intensity if processor.is_loaded() else False,
        "bounding_box": processor.bounding_box if processor.is_loaded() else None,
    }


@app.websocket("/ws/progress")
async def websocket_progress(websocket: WebSocket):
    """WebSocket endpoint for real-time progress updates."""
    await websocket.accept()
    progress_manager.add_client(websocket)
    
    try:
        while True:
            # Keep connection alive
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        progress_manager.remove_client(websocket)


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "Vault Analyzer API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


def main():
    """Main entry point for the backend server."""
    parser = argparse.ArgumentParser(description="Vault Analyzer Backend")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    
    args = parser.parse_args()
    
    uvicorn.run(
        "main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
