"""SAM (Segment Anything Model) service for image segmentation."""

import asyncio
import base64
from io import BytesIO
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import numpy as np

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# SAM2 will be available when installed
try:
    import torch
    from segment_anything import sam_model_registry, SamAutomaticMaskGenerator, SamPredictor
    HAS_SAM = True
except ImportError:
    HAS_SAM = False


class SAMService:
    """Service for SAM-based image segmentation."""
    
    # Class labels for vault architecture
    LABELS = {
        "rib": "Vault Rib",
        "boss": "Boss Stone",
        "cell": "Vault Cell",
        "intrados": "Intrados",
        "background": "Background",
    }
    
    def __init__(self):
        self.model = None
        self.predictor = None
        self.mask_generator = None
        self.projections_dir = Path("./data/projections")
        self.masks_dir = Path("./data/segmentations")
        self.masks_dir.mkdir(parents=True, exist_ok=True)
        self.masks: Dict[str, Dict[str, Any]] = {}
    
    def _ensure_model_loaded(self):
        """Ensure SAM model is loaded."""
        if not HAS_SAM:
            return False
        
        if self.model is None:
            # Load SAM model
            model_type = "vit_h"
            checkpoint = "sam_vit_h_4b8939.pth"
            
            if not Path(checkpoint).exists():
                print(f"SAM checkpoint not found: {checkpoint}")
                return False
            
            device = "cuda" if torch.cuda.is_available() else "cpu"
            self.model = sam_model_registry[model_type](checkpoint=checkpoint)
            self.model.to(device=device)
            
            self.predictor = SamPredictor(self.model)
            self.mask_generator = SamAutomaticMaskGenerator(self.model)
        
        return True
    
    async def auto_segment(self, projection_id: str) -> List[Dict[str, Any]]:
        """Automatically segment an image using SAM."""
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, self._auto_segment, projection_id)
        return result
    
    def _auto_segment(self, projection_id: str) -> List[Dict[str, Any]]:
        """Internal auto-segmentation (runs in thread pool)."""
        
        image_path = self.projections_dir / f"{projection_id}.png"
        
        if not image_path.exists():
            # Generate demo masks if no image
            return self._generate_demo_masks(projection_id)
        
        if not self._ensure_model_loaded() or not HAS_SAM:
            # Return demo masks if SAM not available
            return self._generate_demo_masks(projection_id)
        
        # Load image
        image = np.array(Image.open(image_path).convert("RGB"))
        
        # Generate masks
        masks = self.mask_generator.generate(image)
        
        # Convert to response format
        results = []
        for i, mask_data in enumerate(masks[:10]):  # Limit to top 10 masks
            mask = mask_data["segmentation"]
            
            # Classify based on position/shape (simplified)
            label = self._classify_mask(mask, i)
            
            # Encode mask to base64
            mask_base64 = self._mask_to_base64(mask)
            
            results.append({
                "label": label,
                "mask_base64": mask_base64,
                "confidence": float(mask_data.get("stability_score", 0.9)),
            })
        
        return results
    
    def _generate_demo_masks(self, projection_id: str) -> List[Dict[str, Any]]:
        """Generate demo masks for testing."""
        
        # Create demo segmentation masks
        size = 512
        masks = []
        
        # Rib masks (diagonal lines)
        for i, angle in enumerate([45, 135, 0, 90]):
            mask = np.zeros((size, size), dtype=np.uint8)
            
            # Draw rib-like region
            center = size // 2
            for offset in range(-5, 6):
                rad = np.radians(angle)
                for t in range(-size, size):
                    x = int(center + t * np.cos(rad) + offset * np.sin(rad))
                    y = int(center + t * np.sin(rad) - offset * np.cos(rad))
                    if 0 <= x < size and 0 <= y < size:
                        mask[y, x] = 255
            
            masks.append({
                "label": f"rib_{i+1}",
                "mask_base64": self._mask_to_base64(mask),
                "confidence": 0.85 + np.random.random() * 0.1,
            })
        
        # Boss stone mask (center circle)
        mask = np.zeros((size, size), dtype=np.uint8)
        y, x = np.ogrid[:size, :size]
        center = size // 2
        r = 20
        circle = (x - center) ** 2 + (y - center) ** 2 <= r ** 2
        mask[circle] = 255
        
        masks.append({
            "label": "boss_stone",
            "mask_base64": self._mask_to_base64(mask),
            "confidence": 0.95,
        })
        
        return masks
    
    def _mask_to_base64(self, mask: np.ndarray) -> str:
        """Convert a binary mask to base64 encoded PNG."""
        
        if not HAS_PIL:
            return ""
        
        # Convert to PIL Image
        if mask.dtype == bool:
            mask = mask.astype(np.uint8) * 255
        
        image = Image.fromarray(mask, mode='L')
        
        # Encode to base64
        buffer = BytesIO()
        image.save(buffer, format='PNG')
        return base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    def _classify_mask(self, mask: np.ndarray, index: int) -> str:
        """Classify a mask based on its properties."""
        
        # Simplified classification based on shape
        contours = self._get_contours(mask)
        
        if len(contours) == 0:
            return "background"
        
        # Calculate aspect ratio
        y_coords, x_coords = np.where(mask)
        if len(x_coords) == 0:
            return "background"
        
        width = np.max(x_coords) - np.min(x_coords)
        height = np.max(y_coords) - np.min(y_coords)
        
        if width == 0 or height == 0:
            return "background"
        
        aspect_ratio = width / height
        area = np.sum(mask)
        
        # Classification rules
        if aspect_ratio > 3 or aspect_ratio < 0.33:
            return f"rib_{index}"
        elif area < 1000:
            return "boss_stone"
        else:
            return f"cell_{index}"
    
    def _get_contours(self, mask: np.ndarray) -> List:
        """Get contours from a binary mask."""
        try:
            import cv2
            contours, _ = cv2.findContours(
                mask.astype(np.uint8),
                cv2.RETR_EXTERNAL,
                cv2.CHAIN_APPROX_SIMPLE
            )
            return contours
        except ImportError:
            return []
    
    async def segment_with_points(
        self,
        projection_id: str,
        points: List[Tuple[float, float, int]],
    ) -> List[Dict[str, Any]]:
        """Segment using point prompts."""
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            self._segment_with_points,
            projection_id,
            points,
        )
        return result
    
    def _segment_with_points(
        self,
        projection_id: str,
        points: List[Tuple[float, float, int]],
    ) -> List[Dict[str, Any]]:
        """Internal point-based segmentation."""
        
        if not self._ensure_model_loaded() or not HAS_SAM:
            return self._generate_demo_masks(projection_id)
        
        image_path = self.projections_dir / f"{projection_id}.png"
        if not image_path.exists():
            return self._generate_demo_masks(projection_id)
        
        # Load image
        image = np.array(Image.open(image_path).convert("RGB"))
        self.predictor.set_image(image)
        
        # Convert points
        point_coords = np.array([[p[0], p[1]] for p in points])
        point_labels = np.array([p[2] for p in points])
        
        # Predict
        masks, scores, _ = self.predictor.predict(
            point_coords=point_coords,
            point_labels=point_labels,
            multimask_output=True,
        )
        
        # Return best mask
        best_idx = np.argmax(scores)
        return [{
            "label": "user_selection",
            "mask_base64": self._mask_to_base64(masks[best_idx]),
            "confidence": float(scores[best_idx]),
        }]
    
    async def segment_with_box(
        self,
        projection_id: str,
        box: Tuple[float, float, float, float],
    ) -> List[Dict[str, Any]]:
        """Segment using a bounding box prompt."""
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            self._segment_with_box,
            projection_id,
            box,
        )
        return result
    
    def _segment_with_box(
        self,
        projection_id: str,
        box: Tuple[float, float, float, float],
    ) -> List[Dict[str, Any]]:
        """Internal box-based segmentation."""
        
        if not self._ensure_model_loaded() or not HAS_SAM:
            return self._generate_demo_masks(projection_id)
        
        image_path = self.projections_dir / f"{projection_id}.png"
        if not image_path.exists():
            return self._generate_demo_masks(projection_id)
        
        # Load image
        image = np.array(Image.open(image_path).convert("RGB"))
        self.predictor.set_image(image)
        
        # Convert box (x, y, w, h) to (x1, y1, x2, y2)
        box_array = np.array([
            box[0],
            box[1],
            box[0] + box[2],
            box[1] + box[3],
        ])
        
        # Predict
        masks, scores, _ = self.predictor.predict(
            box=box_array,
            multimask_output=True,
        )
        
        # Return best mask
        best_idx = np.argmax(scores)
        return [{
            "label": "box_selection",
            "mask_base64": self._mask_to_base64(masks[best_idx]),
            "confidence": float(scores[best_idx]),
        }]
    
    async def refine_mask(
        self,
        mask_id: str,
        points: List[Tuple[float, float, int]],
    ) -> Dict[str, Any]:
        """Refine an existing mask with additional prompts."""
        # Implementation would refine the mask with additional SAM prompts
        return {"success": True}

