"""E57 file processing service."""

import asyncio
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import json
import numpy as np

# Try importing E57 reading libraries
HAS_PYE57 = False
HAS_OPEN3D = False

try:
    import pye57
    HAS_PYE57 = True
    print("✓ pye57 library available")
except ImportError:
    print("✗ pye57 not installed - trying Open3D for E57 support")

try:
    import open3d as o3d
    HAS_OPEN3D = True
    print("✓ Open3D library available")
except ImportError:
    print("✗ Open3D not installed")


class E57Processor:
    """Process E57 point cloud files."""
    
    _instance = None
    
    def __new__(cls):
        """Singleton pattern to maintain state across requests."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.current_file: Optional[str] = None
        self.points: Optional[np.ndarray] = None
        self.colors: Optional[np.ndarray] = None
        self.intensity: Optional[np.ndarray] = None
        self.bounding_box: Optional[Dict[str, Dict[str, float]]] = None
        self.point_count: int = 0
        self.has_color: bool = False
        self.has_intensity: bool = False
    
    async def load_file(self, file_path: str) -> Dict[str, Any]:
        """Load an E57 file and extract point cloud data."""
        
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        suffix = path.suffix.lower()
        if suffix not in [".e57", ".ply", ".pcd", ".xyz", ".pts"]:
            raise ValueError(f"Unsupported file type: {suffix}. Expected .e57, .ply, .pcd, .xyz, or .pts")
        
        # Run processing in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, self._load_point_cloud, str(path))
        
        self.current_file = file_path
        return result
    
    def _load_point_cloud(self, file_path: str) -> Dict[str, Any]:
        """Internal method to load point cloud file (runs in thread pool)."""
        
        path = Path(file_path)
        suffix = path.suffix.lower()
        
        # Try pye57 first for E57 files
        if suffix == ".e57" and HAS_PYE57:
            try:
                return self._load_with_pye57(file_path)
            except Exception as e:
                print(f"pye57 failed: {e}, trying Open3D...")
        
        # Try Open3D for any supported format
        if HAS_OPEN3D:
            try:
                return self._load_with_open3d(file_path)
            except Exception as e:
                print(f"Open3D failed: {e}")
        
        # No library available
        if not HAS_PYE57 and not HAS_OPEN3D:
            print("=" * 50)
            print("WARNING: No point cloud library installed!")
            print("To load E57 files, install one of:")
            print("  pip install pye57")
            print("  OR")
            print("  pip install open3d")
            print("=" * 50)
            print("Generating demo data instead...")
            return self._generate_mock_data()
        
        raise RuntimeError("Failed to load point cloud with available libraries")
    
    def _load_with_pye57(self, file_path: str) -> Dict[str, Any]:
        """Load E57 file using pye57 library."""
        print(f"Loading E57 with pye57: {file_path}")
        
        e57_file = pye57.E57(file_path)
        
        # Get scan header
        header = e57_file.get_header(0)
        self.point_count = header.point_count
        
        # Read point data
        data = e57_file.read_scan_raw(0)
        
        # Extract coordinates
        if 'cartesianX' in data:
            x = np.array(data['cartesianX'], dtype=np.float32)
            y = np.array(data['cartesianY'], dtype=np.float32)
            z = np.array(data['cartesianZ'], dtype=np.float32)
        else:
            raise ValueError("Unsupported coordinate format - no Cartesian coordinates found")
        
        self.points = np.column_stack([x, y, z])
        self.point_count = len(self.points)
        
        # Check for color data
        self.has_color = 'colorRed' in data
        if self.has_color:
            r = np.array(data['colorRed'], dtype=np.float32)
            g = np.array(data['colorGreen'], dtype=np.float32)
            b = np.array(data['colorBlue'], dtype=np.float32)
            self.colors = np.column_stack([r, g, b])
        else:
            self.colors = None
        
        # Check for intensity
        self.has_intensity = 'intensity' in data
        if self.has_intensity:
            self.intensity = np.array(data['intensity'], dtype=np.float32)
        else:
            self.intensity = None
        
        # Calculate bounding box
        self.bounding_box = {
            "min": {
                "x": float(np.min(x)),
                "y": float(np.min(y)),
                "z": float(np.min(z)),
            },
            "max": {
                "x": float(np.max(x)),
                "y": float(np.max(y)),
                "z": float(np.max(z)),
            },
        }
        
        e57_file.close()
        print(f"✓ Loaded {self.point_count:,} points with pye57")
        
        return {
            "point_count": self.point_count,
            "bounding_box": self.bounding_box,
            "has_color": self.has_color,
            "has_intensity": self.has_intensity,
        }
    
    def _load_with_open3d(self, file_path: str) -> Dict[str, Any]:
        """Load point cloud file using Open3D library."""
        print(f"Loading point cloud with Open3D: {file_path}")
        
        pcd = o3d.io.read_point_cloud(file_path)
        
        if pcd.is_empty():
            raise ValueError("Failed to load point cloud or file is empty")
        
        # Extract points
        self.points = np.asarray(pcd.points, dtype=np.float32)
        self.point_count = len(self.points)
        
        # Check for colors
        if pcd.has_colors():
            self.colors = np.asarray(pcd.colors, dtype=np.float32) * 255.0
            self.has_color = True
        else:
            self.colors = None
            self.has_color = False
        
        # Open3D doesn't directly expose intensity, but some formats store it in normals
        self.intensity = None
        self.has_intensity = False
        
        # Calculate bounding box
        min_bound = pcd.get_min_bound()
        max_bound = pcd.get_max_bound()
        
        self.bounding_box = {
            "min": {
                "x": float(min_bound[0]),
                "y": float(min_bound[1]),
                "z": float(min_bound[2]),
            },
            "max": {
                "x": float(max_bound[0]),
                "y": float(max_bound[1]),
                "z": float(max_bound[2]),
            },
        }
        
        print(f"✓ Loaded {self.point_count:,} points with Open3D")
        
        return {
            "point_count": self.point_count,
            "bounding_box": self.bounding_box,
            "has_color": self.has_color,
            "has_intensity": self.has_intensity,
        }
    
    def _generate_mock_data(self) -> Dict[str, Any]:
        """Generate mock data for testing without point cloud libraries."""
        
        print("Generating demo vault point cloud...")
        
        # Generate a vault-like point cloud
        n_points = 100000
        self.point_count = n_points
        
        # Create dome/vault shape with ribs
        points_list = []
        colors_list = []
        
        # Main dome surface
        n_surface = int(n_points * 0.8)
        theta = np.random.uniform(0, 2 * np.pi, n_surface)
        phi = np.random.uniform(0, np.pi / 2.2, n_surface)
        r = 5 + np.random.normal(0, 0.05, n_surface)
        
        x = r * np.sin(phi) * np.cos(theta)
        y = r * np.sin(phi) * np.sin(theta)
        z = r * np.cos(phi)
        
        surface_points = np.column_stack([x, y, z])
        surface_colors = np.column_stack([
            np.random.uniform(140, 170, n_surface),
            np.random.uniform(120, 145, n_surface),
            np.random.uniform(100, 125, n_surface),
        ])
        
        points_list.append(surface_points)
        colors_list.append(surface_colors)
        
        # Add vault ribs (diagonal and cross ribs)
        n_ribs = int(n_points * 0.2)
        rib_points = []
        rib_colors = []
        
        for angle in [0, 45, 90, 135, 180, 225, 270, 315]:
            n_per_rib = n_ribs // 8
            rad = np.radians(angle)
            
            t = np.linspace(0, np.pi/2, n_per_rib)
            r_rib = 5.05 + np.random.normal(0, 0.02, n_per_rib)
            
            x_rib = r_rib * np.sin(t) * np.cos(rad)
            y_rib = r_rib * np.sin(t) * np.sin(rad)
            z_rib = r_rib * np.cos(t)
            
            # Add some width to the rib
            for offset in np.linspace(-0.1, 0.1, 3):
                x_off = x_rib + offset * np.sin(rad + np.pi/2)
                y_off = y_rib + offset * np.cos(rad + np.pi/2)
                
                rib_points.append(np.column_stack([x_off, y_off, z_rib]))
                rib_colors.append(np.column_stack([
                    np.full(n_per_rib, 180),
                    np.full(n_per_rib, 155),
                    np.full(n_per_rib, 130),
                ]))
        
        if rib_points:
            points_list.extend(rib_points)
            colors_list.extend(rib_colors)
        
        self.points = np.vstack(points_list).astype(np.float32)
        self.colors = np.vstack(colors_list).astype(np.float32)
        self.point_count = len(self.points)
        
        # Generate intensity
        self.intensity = np.random.uniform(0.4, 0.9, self.point_count).astype(np.float32)
        
        self.bounding_box = {
            "min": {"x": float(np.min(self.points[:, 0])), "y": float(np.min(self.points[:, 1])), "z": float(np.min(self.points[:, 2]))},
            "max": {"x": float(np.max(self.points[:, 0])), "y": float(np.max(self.points[:, 1])), "z": float(np.max(self.points[:, 2]))},
        }
        
        self.has_color = True
        self.has_intensity = True
        
        print(f"✓ Generated {self.point_count:,} demo points")
        
        return {
            "point_count": self.point_count,
            "bounding_box": self.bounding_box,
            "has_color": True,
            "has_intensity": True,
        }
    
    def get_points_chunk(self, start: int, count: int) -> Dict[str, Any]:
        """Get a chunk of points for streaming to frontend."""
        
        if self.points is None:
            return {"points": [], "start": start, "count": 0, "total": 0}
        
        end = min(start + count, len(self.points))
        chunk = self.points[start:end]
        
        result = {
            "start": start,
            "count": len(chunk),
            "total": len(self.points),
            "points": []
        }
        
        for i, point in enumerate(chunk):
            p = {
                "x": float(point[0]), 
                "y": float(point[1]), 
                "z": float(point[2])
            }
            
            if self.colors is not None and start + i < len(self.colors):
                c = self.colors[start + i]
                p["r"] = int(c[0])
                p["g"] = int(c[1])
                p["b"] = int(c[2])
            
            if self.intensity is not None and start + i < len(self.intensity):
                p["intensity"] = float(self.intensity[start + i])
            
            result["points"].append(p)
        
        return result
    
    def get_all_points_binary(self) -> bytes:
        """Get all points as binary data for efficient transfer."""
        if self.points is None:
            return b''
        
        # Format: x,y,z,r,g,b per point as float32
        n_points = len(self.points)
        data = np.zeros((n_points, 6), dtype=np.float32)
        data[:, :3] = self.points
        
        if self.colors is not None:
            data[:, 3:6] = self.colors
        
        return data.tobytes()
    
    def get_downsampled_points(self, max_points: int = 50000) -> List[Dict[str, Any]]:
        """Get a downsampled version of the point cloud for preview."""
        if self.points is None:
            return []
        
        n_points = len(self.points)
        if n_points <= max_points:
            indices = np.arange(n_points)
        else:
            indices = np.random.choice(n_points, max_points, replace=False)
            indices.sort()
        
        result = []
        for i in indices:
            p = {
                "x": float(self.points[i, 0]),
                "y": float(self.points[i, 1]),
                "z": float(self.points[i, 2]),
            }
            
            if self.colors is not None:
                p["r"] = int(self.colors[i, 0])
                p["g"] = int(self.colors[i, 1])
                p["b"] = int(self.colors[i, 2])
            
            if self.intensity is not None:
                p["intensity"] = float(self.intensity[i])
            
            result.append(p)
        
        return result
    
    def to_open3d(self):
        """Convert to Open3D point cloud format."""
        
        if not HAS_OPEN3D:
            raise ImportError("Open3D is required for this operation")
        
        if self.points is None:
            raise ValueError("No point cloud loaded")
        
        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(self.points)
        
        if self.colors is not None:
            pcd.colors = o3d.utility.Vector3dVector(self.colors / 255.0)
        
        return pcd
    
    def is_loaded(self) -> bool:
        """Check if a point cloud is currently loaded."""
        return self.points is not None and len(self.points) > 0


# Global processor instance
_processor: Optional[E57Processor] = None

def get_processor() -> E57Processor:
    """Get the global E57 processor instance."""
    global _processor
    if _processor is None:
        _processor = E57Processor()
    return _processor
