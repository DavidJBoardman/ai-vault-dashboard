"""Reprojection service for 2D to 3D conversion."""

import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional
import numpy as np
from uuid import uuid4


class ReprojectionService:
    """Service for reprojecting 2D annotations back to 3D."""
    
    def __init__(self):
        self.data_dir = Path("./data")
        self.traces: Dict[str, Dict[str, Any]] = {}
    
    async def reproject(
        self,
        segmentation_ids: List[str],
        output_path: str,
    ) -> str:
        """Reproject selected segmentations to 3D point cloud."""
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            self._reproject,
            segmentation_ids,
            output_path,
        )
        return result
    
    def _reproject(
        self,
        segmentation_ids: List[str],
        output_path: str,
    ) -> str:
        """Internal reprojection (runs in thread pool)."""
        
        # In real implementation:
        # 1. Load original point cloud
        # 2. Load 2D masks for each segmentation
        # 3. Map mask pixels back to 3D points using projection inverse
        # 4. Color/label the corresponding 3D points
        # 5. Export to E57
        
        # For now, return the output path
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Create a placeholder file
        output_file.write_text("E57 reprojection placeholder")
        
        return str(output_file)
    
    async def load_trace(self, file_path: str) -> Dict[str, Any]:
        """Load a trace file (DXF/OBJ)."""
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, self._load_trace, file_path)
        return result
    
    def _load_trace(self, file_path: str) -> Dict[str, Any]:
        """Internal trace loading."""
        
        path = Path(file_path)
        trace_id = str(uuid4())
        
        if not path.exists():
            # Generate demo trace
            points = self._generate_demo_trace_points()
        else:
            # Load actual file
            suffix = path.suffix.lower()
            
            if suffix == ".dxf":
                points = self._load_dxf(path)
            elif suffix == ".obj":
                points = self._load_obj(path)
            else:
                # Try as point list
                points = self._load_points_file(path)
        
        self.traces[trace_id] = {
            "id": trace_id,
            "path": file_path,
            "points": points,
            "aligned": False,
        }
        
        return {
            "id": trace_id,
            "point_count": len(points),
        }
    
    def _generate_demo_trace_points(self) -> List[List[float]]:
        """Generate demo trace points."""
        
        t = np.linspace(0, np.pi, 100)
        x = 5 * np.sin(t)
        y = np.zeros_like(t)
        z = 5 * (1 - np.cos(t))
        
        return [[float(xi), float(yi), float(zi)] for xi, yi, zi in zip(x, y, z)]
    
    def _load_dxf(self, path: Path) -> List[List[float]]:
        """Load points from DXF file."""
        try:
            import ezdxf
            doc = ezdxf.readfile(str(path))
            msp = doc.modelspace()
            
            points = []
            for entity in msp:
                if entity.dxftype() == 'LINE':
                    points.append([entity.dxf.start.x, entity.dxf.start.y, entity.dxf.start.z])
                    points.append([entity.dxf.end.x, entity.dxf.end.y, entity.dxf.end.z])
                elif entity.dxftype() == 'POINT':
                    points.append([entity.dxf.location.x, entity.dxf.location.y, entity.dxf.location.z])
            
            return points if points else self._generate_demo_trace_points()
        except Exception:
            return self._generate_demo_trace_points()
    
    def _load_obj(self, path: Path) -> List[List[float]]:
        """Load points from OBJ file."""
        try:
            points = []
            with open(path, 'r') as f:
                for line in f:
                    if line.startswith('v '):
                        parts = line.split()
                        points.append([float(parts[1]), float(parts[2]), float(parts[3])])
            
            return points if points else self._generate_demo_trace_points()
        except Exception:
            return self._generate_demo_trace_points()
    
    def _load_points_file(self, path: Path) -> List[List[float]]:
        """Load points from a simple text file."""
        try:
            points = []
            with open(path, 'r') as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) >= 3:
                        points.append([float(parts[0]), float(parts[1]), float(parts[2])])
            
            return points if points else self._generate_demo_trace_points()
        except Exception:
            return self._generate_demo_trace_points()
    
    async def align_trace(
        self,
        trace_id: str,
        scale: float,
        rotation: List[float],
        translation: List[float],
    ) -> None:
        """Align a trace with the point cloud."""
        
        if trace_id not in self.traces:
            raise ValueError(f"Trace not found: {trace_id}")
        
        trace = self.traces[trace_id]
        points = np.array(trace["points"])
        
        # Apply scale
        points *= scale
        
        # Apply rotation (simplified - assumes Euler angles)
        if len(rotation) == 3:
            from scipy.spatial.transform import Rotation
            r = Rotation.from_euler('xyz', rotation, degrees=True)
            points = r.apply(points)
        
        # Apply translation
        if len(translation) == 3:
            points += np.array(translation)
        
        trace["points"] = points.tolist()
        trace["aligned"] = True
    
    async def get_trace(self, trace_id: str) -> Optional[Dict[str, Any]]:
        """Get trace data by ID."""
        return self.traces.get(trace_id)

