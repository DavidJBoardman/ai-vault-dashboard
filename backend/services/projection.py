"""Projection service for 3D to 2D conversion."""

import asyncio
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List
import numpy as np

try:
    from PIL import Image, ImageDraw
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

from services.e57_processor import get_processor


class ProjectionService:
    """Service for creating 2D projections from 3D point clouds."""
    
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
        self.data_dir = Path("./data/projections")
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.projections: Dict[str, Dict[str, Any]] = {}
    
    async def create_projection(
        self,
        projection_id: str,
        perspective: str,
        custom_angle: Optional[Dict[str, float]] = None,
        resolution: int = 2048,
        scale: float = 1.0,
    ) -> Dict[str, Any]:
        """Create a 2D projection from the point cloud."""
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            self._create_projection,
            projection_id,
            perspective,
            custom_angle,
            resolution,
            scale,
        )
        
        return result
    
    def _create_projection(
        self,
        projection_id: str,
        perspective: str,
        custom_angle: Optional[Dict[str, float]],
        resolution: int,
        scale: float,
    ) -> Dict[str, Any]:
        """Internal projection creation (runs in thread pool)."""
        
        if not HAS_PIL:
            raise ImportError("PIL/Pillow is required for projection")
        
        # Get point cloud data from processor
        processor = get_processor()
        
        if processor.is_loaded() and processor.points is not None:
            image = self._project_point_cloud(
                processor.points,
                processor.colors,
                perspective,
                custom_angle,
                resolution,
                scale,
            )
            print(f"✓ Created real projection from {len(processor.points):,} points")
        else:
            # Fallback to demo projection
            print("No point cloud loaded, generating demo projection")
            image = self._generate_demo_projection(resolution, resolution, perspective)
        
        # Save image
        image_path = self.data_dir / f"{projection_id}.png"
        image.save(image_path, quality=95)
        
        # Store projection info
        self.projections[projection_id] = {
            "id": projection_id,
            "perspective": perspective,
            "resolution": resolution,
            "scale": scale,
            "image_path": str(image_path),
            "width": image.width,
            "height": image.height,
        }
        
        return {
            "image_path": str(image_path),
            "width": image.width,
            "height": image.height,
        }
    
    def _project_point_cloud(
        self,
        points: np.ndarray,
        colors: Optional[np.ndarray],
        perspective: str,
        custom_angle: Optional[Dict[str, float]],
        resolution: int,
        scale: float,
    ) -> "Image.Image":
        """Project actual point cloud data to 2D image."""
        
        # Get projection coordinates
        projected_2d = self._apply_projection_matrix(points, perspective, custom_angle)
        
        # Get depth for sorting (back to front rendering)
        depth = self._get_depth(points, perspective, custom_angle)
        
        # Normalize to image coordinates
        min_x, max_x = projected_2d[:, 0].min(), projected_2d[:, 0].max()
        min_y, max_y = projected_2d[:, 1].min(), projected_2d[:, 1].max()
        
        range_x = max_x - min_x
        range_y = max_y - min_y
        max_range = max(range_x, range_y) / scale
        
        # Center the projection
        center_x = (min_x + max_x) / 2
        center_y = (min_y + max_y) / 2
        
        # Calculate normalized coordinates
        margin = 0.05  # 5% margin
        usable = 1.0 - 2 * margin
        
        norm_x = (projected_2d[:, 0] - center_x) / max_range * usable + 0.5
        norm_y = (projected_2d[:, 1] - center_y) / max_range * usable + 0.5
        
        # Convert to pixel coordinates
        px = (norm_x * resolution).astype(np.int32)
        py = ((1 - norm_y) * resolution).astype(np.int32)  # Flip Y for image coordinates
        
        # Clip to image bounds
        valid = (px >= 0) & (px < resolution) & (py >= 0) & (py < resolution)
        px = px[valid]
        py = py[valid]
        depth_valid = depth[valid]
        
        # Sort by depth (back to front)
        sort_idx = np.argsort(depth_valid)
        px = px[sort_idx]
        py = py[sort_idx]
        
        # Get colors
        if colors is not None:
            colors_valid = colors[valid][sort_idx]
        else:
            # Use height-based coloring
            depth_norm = (depth_valid[sort_idx] - depth_valid.min()) / (depth_valid.max() - depth_valid.min() + 1e-6)
            colors_valid = np.zeros((len(depth_norm), 3))
            colors_valid[:, 0] = 180 + depth_norm * 40
            colors_valid[:, 1] = 150 + depth_norm * 30
            colors_valid[:, 2] = 120 + depth_norm * 20
        
        # Create image
        img_array = np.zeros((resolution, resolution, 3), dtype=np.uint8)
        img_array[:, :] = [15, 20, 30]  # Dark background
        
        # Render points
        for i in range(len(px)):
            x, y = px[i], py[i]
            r, g, b = colors_valid[i]
            
            # Draw point (2x2 for visibility)
            for dx in range(-1, 2):
                for dy in range(-1, 2):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < resolution and 0 <= ny < resolution:
                        img_array[ny, nx] = [int(r), int(g), int(b)]
        
        return Image.fromarray(img_array, mode='RGB')
    
    def _apply_projection_matrix(
        self,
        points: np.ndarray,
        perspective: str,
        custom_angle: Optional[Dict[str, float]] = None,
    ) -> np.ndarray:
        """Apply projection to get 2D coordinates."""
        
        if perspective == "custom" and custom_angle:
            theta = custom_angle["theta"]
            phi = custom_angle["phi"]
            
            cos_t, sin_t = np.cos(theta), np.sin(theta)
            cos_p, sin_p = np.cos(phi), np.sin(phi)
            
            # Rotation matrix for custom angle
            x_rot = points[:, 0] * cos_t - points[:, 1] * sin_t
            y_rot = points[:, 0] * sin_t * cos_p + points[:, 1] * cos_t * cos_p - points[:, 2] * sin_p
            
            return np.column_stack([x_rot, y_rot])
        
        # Standard orthographic projections
        if perspective == "top":
            return points[:, [0, 1]]  # X, Y plane
        elif perspective == "bottom":
            return np.column_stack([points[:, 0], -points[:, 1]])
        elif perspective == "north":
            return points[:, [0, 2]]  # X, Z plane
        elif perspective == "south":
            return np.column_stack([-points[:, 0], points[:, 2]])
        elif perspective == "east":
            return np.column_stack([-points[:, 1], points[:, 2]])  # Y, Z plane
        elif perspective == "west":
            return points[:, [1, 2]]
        else:
            return points[:, [0, 1]]
    
    def _get_depth(
        self,
        points: np.ndarray,
        perspective: str,
        custom_angle: Optional[Dict[str, float]] = None,
    ) -> np.ndarray:
        """Get depth values for each point based on perspective."""
        
        if perspective == "custom" and custom_angle:
            theta = custom_angle["theta"]
            phi = custom_angle["phi"]
            
            # Depth is along the viewing direction
            cos_t, sin_t = np.cos(theta), np.sin(theta)
            cos_p, sin_p = np.cos(phi), np.sin(phi)
            
            depth = points[:, 0] * sin_t * sin_p + points[:, 1] * cos_t * sin_p + points[:, 2] * cos_p
            return depth
        
        if perspective == "top":
            return points[:, 2]  # Z depth
        elif perspective == "bottom":
            return -points[:, 2]
        elif perspective == "north":
            return points[:, 1]  # Y depth
        elif perspective == "south":
            return -points[:, 1]
        elif perspective == "east":
            return points[:, 0]  # X depth
        elif perspective == "west":
            return -points[:, 0]
        else:
            return points[:, 2]
    
    def _generate_demo_projection(
        self,
        width: int,
        height: int,
        perspective: str,
    ) -> "Image.Image":
        """Generate a demo projection image."""
        
        np.random.seed(42)
        
        # Create gradient background
        y_coords = np.linspace(0, 1, height)
        x_coords = np.linspace(0, 1, width)
        xx, yy = np.meshgrid(x_coords, y_coords)
        
        # Base color (dark stone)
        r = np.clip((50 + np.random.randn(height, width) * 5), 0, 255).astype(np.uint8)
        g = np.clip((45 + np.random.randn(height, width) * 5), 0, 255).astype(np.uint8)
        b = np.clip((55 + np.random.randn(height, width) * 5), 0, 255).astype(np.uint8)
        
        center_x, center_y = width // 2, height // 2
        
        # Create circular vault shape
        dist = np.sqrt((xx - 0.5) ** 2 + (yy - 0.5) ** 2)
        vault_mask = dist < 0.42
        
        # Add vault surface
        r = np.where(vault_mask, np.clip(r + 90, 0, 255), r)
        g = np.where(vault_mask, np.clip(g + 75, 0, 255), g)
        b = np.where(vault_mask, np.clip(b + 55, 0, 255), b)
        
        # Create rib pattern
        for angle in [0, 45, 90, 135]:
            rad = np.radians(angle)
            for t in np.linspace(-0.5, 0.5, width * 2):
                rx = int(center_x + t * width * np.cos(rad))
                ry = int(center_y + t * height * np.sin(rad))
                
                for offset in range(-3, 4):
                    px = rx + int(offset * np.sin(rad))
                    py = ry - int(offset * np.cos(rad))
                    
                    if 0 <= px < width and 0 <= py < height and dist[py, px] < 0.4:
                        r[py, px] = min(255, r[py, px] + 25)
                        g[py, px] = min(255, g[py, px] + 18)
                        b[py, px] = min(255, b[py, px] + 12)
        
        rgb = np.stack([r, g, b], axis=-1)
        
        return Image.fromarray(rgb, mode='RGB')
    
    async def list_projections(self) -> List[Dict[str, Any]]:
        """List all created projections."""
        return list(self.projections.values())
    
    async def delete_projection(self, projection_id: str) -> None:
        """Delete a projection."""
        if projection_id in self.projections:
            image_path = Path(self.projections[projection_id]["image_path"])
            if image_path.exists():
                image_path.unlink()
            
            del self.projections[projection_id]
    
    async def get_projection(self, projection_id: str) -> Optional[Dict[str, Any]]:
        """Get projection info by ID."""
        return self.projections.get(projection_id)
    
    def get_projection_image_base64(self, projection_id: str) -> Optional[str]:
        """Get projection image as base64 string."""
        import base64
        
        if projection_id not in self.projections:
            return None
        
        image_path = Path(self.projections[projection_id]["image_path"])
        if not image_path.exists():
            return None
        
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
