"""Geometry analysis service for vault classification."""

import asyncio
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import numpy as np

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


class GeometryAnalyzer:
    """Analyze 2D geometry to classify vault construction methods."""
    
    CLASSIFICATION_METHODS = ["starcut", "circlecut", "starcirclecut"]
    
    def __init__(self):
        self.projections_dir = Path("./data/projections")
    
    async def analyze(
        self,
        projection_id: str,
        bounding_box: Tuple[float, float, float, float],
    ) -> Dict[str, Any]:
        """Analyze vault geometry within the specified bounding box."""
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            self._analyze,
            projection_id,
            bounding_box,
        )
        return result
    
    def _analyze(
        self,
        projection_id: str,
        bounding_box: Tuple[float, float, float, float],
    ) -> Dict[str, Any]:
        """Internal analysis (runs in thread pool)."""
        
        x, y, w, h = bounding_box
        
        # Extract region of interest
        image_path = self.projections_dir / f"{projection_id}.png"
        
        if image_path.exists() and HAS_PIL:
            image = Image.open(image_path)
            roi = image.crop((int(x), int(y), int(x + w), int(y + h)))
            roi_array = np.array(roi)
        else:
            # Generate demo analysis
            roi_array = np.zeros((int(h), int(w), 3), dtype=np.uint8)
        
        # Analyze geometry
        classification, confidence = self._classify_vault_type(roi_array)
        
        # Detect boss stones
        boss_stones = self._detect_boss_stones(roi_array, x, y)
        
        # Calculate px, py (vault bay counts)
        px, py = self._calculate_bay_counts(roi_array)
        
        return {
            "classification": classification,
            "boss_stones": boss_stones,
            "px": px,
            "py": py,
            "confidence": confidence,
        }
    
    def _classify_vault_type(
        self,
        roi: np.ndarray,
    ) -> Tuple[str, float]:
        """Classify the vault construction method."""
        
        # Simplified classification based on rib patterns
        # In real implementation, this would use ML or detailed geometric analysis
        
        # Analyze rib angles and patterns
        if len(roi.shape) == 3:
            gray = np.mean(roi, axis=2)
        else:
            gray = roi
        
        # Calculate features
        edges = self._detect_edges(gray)
        
        # Analyze diagonal presence
        diagonals = self._analyze_diagonals(edges)
        
        # Simple classification rules
        if diagonals["has_star_pattern"]:
            if diagonals["has_circles"]:
                return "starcirclecut", 0.75
            return "starcut", 0.85
        elif diagonals["has_circles"]:
            return "circlecut", 0.80
        else:
            return "starcut", 0.60  # Default
    
    def _detect_edges(self, gray: np.ndarray) -> np.ndarray:
        """Detect edges in grayscale image."""
        try:
            from skimage import filters
            return filters.sobel(gray)
        except ImportError:
            # Simple gradient-based edge detection
            dx = np.diff(gray, axis=1)
            dy = np.diff(gray, axis=0)
            return np.sqrt(dx[:-1, :] ** 2 + dy[:, :-1] ** 2)
    
    def _analyze_diagonals(self, edges: np.ndarray) -> Dict[str, bool]:
        """Analyze diagonal patterns in edge image."""
        
        h, w = edges.shape
        center_y, center_x = h // 2, w // 2
        
        # Check for star pattern (ribs radiating from center)
        has_star = True  # Simplified assumption
        
        # Check for circular patterns
        has_circles = False  # Would need proper circle detection
        
        return {
            "has_star_pattern": has_star,
            "has_circles": has_circles,
        }
    
    def _detect_boss_stones(
        self,
        roi: np.ndarray,
        offset_x: float,
        offset_y: float,
    ) -> List[Dict[str, Any]]:
        """Detect boss stones (central keystone positions)."""
        
        h, w = roi.shape[:2] if len(roi.shape) >= 2 else (100, 100)
        
        # For demo, return central boss stone and some secondary ones
        boss_stones = []
        
        # Central boss
        boss_stones.append({
            "x": offset_x + w / 2,
            "y": offset_y + h / 2,
            "label": "Central Boss",
        })
        
        # Quadrant bosses (if present in complex vaults)
        for i, (qx, qy) in enumerate([
            (0.25, 0.25), (0.75, 0.25),
            (0.25, 0.75), (0.75, 0.75),
        ]):
            boss_stones.append({
                "x": offset_x + w * qx,
                "y": offset_y + h * qy,
                "label": f"Secondary Boss {i+1}",
            })
        
        return boss_stones
    
    def _calculate_bay_counts(self, roi: np.ndarray) -> Tuple[int, int]:
        """Calculate the number of vault bays in x and y directions."""
        
        # Simplified: assume single bay vault
        # Real implementation would analyze rib patterns
        
        return 1, 1
    
    async def export_results(
        self,
        projection_id: str,
        output_path: str,
    ) -> str:
        """Export geometry analysis results to CSV."""
        
        # Would export classification, measurements, etc.
        return output_path

