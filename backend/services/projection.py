"""Projection service for 3D to 2D conversion using Gaussian splatting."""

import asyncio
import json
import base64
from pathlib import Path
from typing import Dict, Any, Optional, List
import numpy as np

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

from services.e57_processor import get_processor
from services.app_paths import get_data_root
from services.projection_gaussian_utils import (
    project_to_2d_gaussian_fast,
    prepare_export_images_gaussian,
    save_projection_gaussian,
)


class ProjectionService:
    """Service for creating 2D projections from 3D point clouds using Gaussian splatting."""

    MIN_PROJECTION_POINTS = 250_000
    MAX_PROJECTION_POINTS = 2_000_000
    
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
        self.data_dir = get_data_root() / "projections"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.projections: Dict[str, Dict[str, Any]] = {}
        
        # Load existing projections from disk
        self._load_projections_from_disk()
    
    def _load_projections_from_disk(self):
        """Load existing projection metadata from disk."""
        for metadata_file in self.data_dir.glob("*_metadata.json"):
            try:
                with open(metadata_file, "r") as f:
                    metadata = json.load(f)
                
                projection_id = metadata_file.stem.replace("_metadata", "")
                
                # Check if associated files exist
                colour_path = self.data_dir / f"{projection_id}_colour.png"
                if colour_path.exists():
                    self.projections[projection_id] = {
                        "id": projection_id,
                        "perspective": metadata.get("perspective", "top"),
                        "resolution": metadata.get("resolution", 2048),
                        "sigma": metadata.get("sigma", 1.0),
                        "kernel_size": metadata.get("kernel_size", 5),
                        "bottom_up": metadata.get("bottom_up", True),
                        "paths": {
                            "colour": str(colour_path),
                            "depth_grayscale": str(self.data_dir / f"{projection_id}_depth_gray.png"),
                            "depth_plasma": str(self.data_dir / f"{projection_id}_depth_plasma.png"),
                            "depth_raw": str(self.data_dir / f"{projection_id}_depth.npy"),
                            "metadata": str(metadata_file),
                        },
                        "metadata": metadata,
                    }
                    print(f"Loaded existing projection: {projection_id}")
            except Exception as e:
                print(f"Error loading projection {metadata_file}: {e}")
    
    async def create_projection(
        self,
        projection_id: str,
        perspective: str,
        resolution: int = 2048,
        sigma: float = 1.0,
        kernel_size: int = 5,
        bottom_up: bool = True,
        scale: float = 1.0,
    ) -> Dict[str, Any]:
        """Create a 2D projection from the point cloud using Gaussian splatting."""
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            self._create_projection,
            projection_id,
            perspective,
            resolution,
            sigma,
            kernel_size,
            bottom_up,
            scale,
        )
        
        return result
    
    def _create_projection(
        self,
        projection_id: str,
        perspective: str,
        resolution: int,
        sigma: float,
        kernel_size: int,
        bottom_up: bool,
        scale: float,
    ) -> Dict[str, Any]:
        """Internal projection creation using Gaussian splatting (runs in thread pool)."""
        
        if not HAS_PIL:
            raise ImportError("PIL/Pillow is required for projection")
        
        # Get point cloud data from processor
        processor = get_processor()
        
        if processor.is_loaded() and processor.points is not None:
            all_points = processor.points
            all_colours = processor.colors
            source_point_count = len(all_points)
            target_point_count = self._get_target_point_count(source_point_count, resolution)
            sampled = target_point_count < source_point_count

            if sampled:
                sample_indices = np.linspace(
                    0,
                    source_point_count - 1,
                    num=target_point_count,
                    dtype=np.int64,
                )
                points = all_points[sample_indices]
                colours = all_colours[sample_indices] if all_colours is not None else None
                print(
                    "Projection input sampled "
                    f"from {source_point_count:,} to {target_point_count:,} points"
                )
            else:
                points = all_points
                colours = all_colours

            print(f"Creating Gaussian projection from {len(points):,} points...")
            print(f"  Perspective: {perspective}, Resolution: {resolution}")
            print(f"  Sigma: {sigma}, Kernel: {kernel_size}, Bottom-up: {bottom_up}")
            
            # Center the point cloud
            centroid = np.mean(all_points, axis=0)
            centred_points = points - centroid
            
            # Normalize colours to 0-1 range if needed
            if colours is not None:
                print(f"  Raw color range: {colours.min():.3f} - {colours.max():.3f}")
                if colours.max() > 1.0:
                    colours = colours / 255.0
                print(f"  Normalized color range: {colours.min():.3f} - {colours.max():.3f}")
            
            # Create Gaussian splatting projection
            depth_img, colour_img, coordinate_img, metadata = project_to_2d_gaussian_fast(
                points=centred_points,
                colours=colours,
                resolution=resolution,
                bottom_up=bottom_up,
                sigma=sigma,
                kernel_size=kernel_size,
                perspective=perspective,
            )
            
            # Add centroid to metadata for reprojection
            metadata["centroid"] = centroid.tolist()
            metadata["scale"] = scale
            metadata["source_point_count"] = int(source_point_count)
            metadata["sampled_point_count"] = int(len(points))
            metadata["sampling_applied"] = sampled
            
            # Save projection files
            paths = save_projection_gaussian(
                depth_img=depth_img,
                colour_img=colour_img,
                coordinate_img=coordinate_img,
                metadata=metadata,
                folder_dir=str(self.data_dir),
                projection_id=projection_id,
            )
            
            print(f"[OK] Gaussian projection saved: {projection_id}")
            
        else:
            # Fallback to demo projection
            print("No point cloud loaded, generating demo projection")
            depth_img, colour_img, coordinate_img, metadata = self._generate_demo_gaussian(resolution)
            
            paths = save_projection_gaussian(
                depth_img=depth_img,
                colour_img=colour_img,
                coordinate_img=coordinate_img,
                metadata=metadata,
                folder_dir=str(self.data_dir),
                projection_id=projection_id,
            )
        
        # Store projection info
        self.projections[projection_id] = {
            "id": projection_id,
            "perspective": perspective,
            "resolution": resolution,
            "sigma": sigma,
            "kernel_size": kernel_size,
            "bottom_up": bottom_up,
            "paths": paths,
            "metadata": metadata,
        }
        
        return {
            "id": projection_id,
            "paths": paths,
            "metadata": metadata,
        }

    def _get_target_point_count(self, point_count: int, resolution: int) -> int:
        """Limit projection work to a practical point budget for desktop packaging."""
        if point_count <= self.MIN_PROJECTION_POINTS:
            return point_count

        pixel_budget = max(resolution * resolution // 2, self.MIN_PROJECTION_POINTS)
        return min(point_count, pixel_budget, self.MAX_PROJECTION_POINTS)
    
    def _generate_demo_gaussian(self, resolution: int) -> tuple:
        """Generate a demo Gaussian projection for testing."""
        
        # Generate demo vault points
        n_points = 100000
        np.random.seed(42)
        
        # Create dome shape
        theta = np.random.uniform(0, 2 * np.pi, n_points)
        phi = np.random.uniform(0, np.pi / 2.2, n_points)
        r = 5 + np.random.normal(0, 0.05, n_points)
        
        x = r * np.sin(phi) * np.cos(theta)
        y = r * np.sin(phi) * np.sin(theta)
        z = r * np.cos(phi)
        
        points = np.column_stack([x, y, z])
        
        # Demo colours (stone-like)
        colours = np.random.uniform(0.4, 0.6, (n_points, 3))
        colours[:, 0] += 0.1  # Slightly warmer
        
        depth_img, colour_img, coordinate_img, metadata = project_to_2d_gaussian_fast(
            points=points,
            colours=colours,
            resolution=resolution,
            bottom_up=True,
            sigma=1.0,
            kernel_size=5,
            perspective="top",
        )
        
        metadata["demo"] = True
        
        return depth_img, colour_img, coordinate_img, metadata
    
    def get_projection_images_base64(self, projection_id: str) -> Optional[Dict[str, str]]:
        """Get all projection images as base64 strings."""
        
        if projection_id not in self.projections:
            return None
        
        proj = self.projections[projection_id]
        paths = proj.get("paths", {})
        
        result = {}
        
        for key in ["colour", "depth_grayscale", "depth_plasma"]:
            path = paths.get(key)
            if path and Path(path).exists():
                with open(path, "rb") as f:
                    result[key] = base64.b64encode(f.read()).decode("utf-8")
        
        return result
    
    def get_projection_image_base64(self, projection_id: str, image_type: str = "colour") -> Optional[str]:
        """Get a specific projection image as base64 string."""
        
        if projection_id not in self.projections:
            return None
        
        paths = self.projections[projection_id].get("paths", {})
        path = paths.get(image_type)
        
        if path and Path(path).exists():
            with open(path, "rb") as f:
                return base64.b64encode(f.read()).decode("utf-8")
        
        return None
    
    async def list_projections(self) -> List[Dict[str, Any]]:
        """List all created projections."""
        return [
            {
                "id": proj["id"],
                "perspective": proj["perspective"],
                "resolution": proj["resolution"],
                "sigma": proj.get("sigma", 1.0),
                "kernel_size": proj.get("kernel_size", 5),
                "has_images": bool(proj.get("paths")),
            }
            for proj in self.projections.values()
        ]
    
    async def delete_projection(self, projection_id: str) -> None:
        """Delete a projection and its files."""
        if projection_id in self.projections:
            paths = self.projections[projection_id].get("paths", {})
            
            # Delete all associated files
            for path in paths.values():
                p = Path(path)
                if p.exists():
                    p.unlink()
            
            del self.projections[projection_id]
    
    async def get_projection(self, projection_id: str) -> Optional[Dict[str, Any]]:
        """Get projection info by ID."""
        return self.projections.get(projection_id)
    
    def get_projection_for_export(self, projection_id: str) -> Optional[Dict[str, Any]]:
        """Get projection data for project export/save."""
        if projection_id not in self.projections:
            return None
        
        proj = self.projections[projection_id]
        
        # Include base64 images for portability
        images = self.get_projection_images_base64(projection_id)
        
        return {
            "id": proj["id"],
            "perspective": proj["perspective"],
            "resolution": proj["resolution"],
            "sigma": proj.get("sigma", 1.0),
            "kernel_size": proj.get("kernel_size", 5),
            "bottom_up": proj.get("bottom_up", True),
            "metadata": proj.get("metadata", {}),
            "images": images,
        }


# Singleton accessor
_projection_service: Optional[ProjectionService] = None


def get_projection_service() -> ProjectionService:
    """Get the projection service singleton."""
    global _projection_service
    if _projection_service is None:
        _projection_service = ProjectionService()
    return _projection_service
