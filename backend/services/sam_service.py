"""
SAM 3 (Segment Anything Model 3) service for vault segmentation.
Uses HuggingFace Transformers implementation which works on macOS (MPS).

Reference: https://huggingface.co/facebook/sam3/discussions/11
"""

import base64
import io
import sys
from pathlib import Path
from typing import Dict, Any, List, Optional
import numpy as np

# Debug: Print Python info on startup
print("=" * 60)
print("SAM SERVICE - PYTHON ENVIRONMENT DEBUG")
print("=" * 60)
print(f"Python executable: {sys.executable}")
print(f"Python version: {sys.version.split()[0]}")
print("=" * 60)

try:
    from PIL import Image
    HAS_PIL = True
    print("✓ PIL/Pillow imported")
except ImportError as e:
    HAS_PIL = False
    print(f"✗ PIL import failed: {e}")

# PyTorch import and device detection
HAS_TORCH = False
DEVICE = "cpu"
try:
    import torch
    HAS_TORCH = True
    # Prefer MPS on macOS, then CUDA, then CPU
    if torch.backends.mps.is_available():
        DEVICE = "mps"
        print(f"✓ PyTorch {torch.__version__} (MPS - Apple Silicon)")
    elif torch.cuda.is_available():
        DEVICE = "cuda"
        print(f"✓ PyTorch {torch.__version__} (CUDA)")
    else:
        print(f"✓ PyTorch {torch.__version__} (CPU)")
except ImportError as e:
    print(f"✗ PyTorch import failed: {e}")

# SAM 3 via HuggingFace Transformers
HAS_SAM3 = False
try:
    print("Attempting to import SAM 3 via HuggingFace Transformers...")
    from transformers import Sam3Processor, Sam3Model
    HAS_SAM3 = True
    print("✓ SAM 3 (HuggingFace) imported successfully!")
except ImportError as e:
    print(f"✗ SAM 3 HuggingFace import failed: {e}")
    print("  Install with: pip install git+https://github.com/huggingface/transformers torchvision")
except Exception as e:
    print(f"✗ SAM 3 error: {type(e).__name__}: {e}")

print("=" * 60)


class SAM3Service:
    """Service for running SAM 3 segmentation with text prompts via HuggingFace."""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        
        self.model = None
        self.processor = None
        self.model_loaded = False
        self.current_image = None
        self.current_image_id = None
        
    def load_model(self) -> bool:
        """Load the SAM 3 model from HuggingFace."""
        if not HAS_SAM3:
            print("SAM 3 not available - transformers package not installed correctly")
            return False
        
        if self.model_loaded:
            return True
        
        try:
            print("Loading SAM 3 model from HuggingFace (facebook/sam3)...")
            print("This may take a few minutes on first run to download the model...")
            
            # Load processor and model from HuggingFace
            self.processor = Sam3Processor.from_pretrained("facebook/sam3")
            self.model = Sam3Model.from_pretrained("facebook/sam3")
            
            # Move model to appropriate device
            if DEVICE != "cpu":
                print(f"Moving model to {DEVICE}...")
                self.model = self.model.to(DEVICE)
            
            self.model.eval()  # Set to evaluation mode
            self.model_loaded = True
            print(f"✓ SAM 3 model loaded successfully on {DEVICE}")
            return True
            
        except Exception as e:
            print(f"Error loading SAM 3 model: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def set_image_from_base64(self, image_base64: str, image_id: str) -> bool:
        """Set the image for prediction from base64 string."""
        if not self.model_loaded:
            if not self.load_model():
                return False
        
        if self.current_image_id == image_id and self.current_image is not None:
            # Image already loaded
            return True
        
        try:
            # Decode base64 image
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data)).convert("RGB")
            
            self.current_image = image
            self.current_image_id = image_id
            
            print(f"✓ Image set for SAM 3: {image.size}")
            return True
            
        except Exception as e:
            print(f"Error setting image: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def segment_with_text_prompts(
        self,
        text_prompts: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Segment image using text prompts with SAM 3.
        
        Uses the HuggingFace Transformers API:
        https://huggingface.co/facebook/sam3
        
        Args:
            text_prompts: List of text prompts (e.g., ["rib", "boss stone", "vault cell"])
            
        Returns:
            List of mask dictionaries with id, label, color, maskBase64, etc.
        """
        if not self.model_loaded or self.current_image is None:
            print("Model not loaded or no image set")
            return []
        
        try:
            # Bright, saturated colors for high visibility
            color_palette = [
                "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF",
                "#00FFFF", "#FF6600", "#9900FF", "#00FF99", "#FF0099",
            ]
            
            # Create color map for each prompt
            prompt_color_map = {}
            for idx, prompt in enumerate(text_prompts):
                prompt_color_map[prompt] = color_palette[idx % len(color_palette)]
            
            all_masks = []
            
            # Process each text prompt
            for prompt_idx, prompt in enumerate(text_prompts):
                print(f"Processing prompt: '{prompt}'...")
                
                # Process image with text prompt using HuggingFace processor
                # Reference: https://huggingface.co/facebook/sam3#text-only-prompts
                inputs = self.processor(
                    images=self.current_image,
                    text=prompt,
                    return_tensors="pt"
                )
                
                # Get original sizes for post-processing
                original_sizes = inputs.get("original_sizes", None)
                
                # Move inputs to device
                if DEVICE != "cpu":
                    inputs = {k: v.to(DEVICE) if hasattr(v, 'to') else v for k, v in inputs.items()}
                
                # Run inference
                with torch.no_grad():
                    outputs = self.model(**inputs)
                
                # Post-process results using post_process_instance_segmentation
                # This is the correct method per HuggingFace docs
                target_sizes = original_sizes.tolist() if hasattr(original_sizes, 'tolist') else [[self.current_image.height, self.current_image.width]]
                
                results = self.processor.post_process_instance_segmentation(
                    outputs,
                    threshold=0.5,
                    mask_threshold=0.5,
                    target_sizes=target_sizes
                )[0]  # Get first batch result
                
                # Results contain: masks, boxes, scores
                masks = results.get("masks", [])
                boxes = results.get("boxes", [])
                scores = results.get("scores", [])
                
                print(f"  → Found {len(masks)} masks for '{prompt}'")
                
                # Process each mask for this prompt
                for mask_idx, mask in enumerate(masks):
                    # Get score
                    score = float(scores[mask_idx]) if mask_idx < len(scores) else 0.9
                    
                    # Get bounding box (xyxy format from HuggingFace)
                    bbox = None
                    if mask_idx < len(boxes):
                        box = boxes[mask_idx]
                        if hasattr(box, 'tolist'):
                            box = box.tolist()
                        # Convert xyxy to xywh
                        bbox = [int(box[0]), int(box[1]), int(box[2] - box[0]), int(box[3] - box[1])]
                    
                    # Convert mask to numpy
                    if hasattr(mask, 'cpu'):
                        mask_np = mask.cpu().numpy()
                    else:
                        mask_np = np.array(mask)
                    
                    # Ensure 2D
                    while mask_np.ndim > 2:
                        mask_np = mask_np[0]
                    
                    mask_info = self._process_mask(
                        mask=mask_np,
                        score=score,
                        prompt=prompt,
                        prompt_idx=prompt_idx,
                        mask_idx=mask_idx,
                        color=prompt_color_map[prompt],
                        bbox=bbox
                    )
                    
                    if mask_info:
                        all_masks.append(mask_info)
                        print(f"    → Mask {mask_idx + 1}: label='{mask_info['label']}', "
                              f"color={mask_info['color']}, area={mask_info['area']}")
            
            print(f"✓ SAM 3 segmentation complete: {len(all_masks)} total masks")
            return all_masks
                
        except Exception as e:
            print(f"Error with SAM 3 text segmentation: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def segment_with_boxes(
        self,
        boxes: List[Dict[str, Any]],
        text_prompt: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Segment image using bounding box prompts with SAM 3.
        
        Based on HuggingFace SAM 3 documentation:
        https://huggingface.co/facebook/sam3#single-bounding-box-prompt
        
        Args:
            boxes: List of box dicts with keys:
                - coords: [x1, y1, x2, y2] in pixel coordinates (xyxy format)
                - label: 1 for positive (include), 0 for negative (exclude)
            text_prompt: Optional text to combine with boxes
            
        Returns:
            List of mask dictionaries
        """
        if not self.model_loaded or self.current_image is None:
            print("Model not loaded or no image set")
            return []
        
        if not boxes:
            print("No boxes provided")
            return []
        
        try:
            # Extract box coordinates and labels
            input_boxes = [[box["coords"] for box in boxes]]  # [batch, num_boxes, 4]
            input_boxes_labels = [[box.get("label", 1) for box in boxes]]  # 1=positive, 0=negative
            
            positive_count = sum(1 for box in boxes if box.get("label", 1) == 1)
            negative_count = len(boxes) - positive_count
            
            prompt_desc = f"{positive_count} positive, {negative_count} negative boxes"
            if text_prompt:
                prompt_desc += f" + text: '{text_prompt}'"
            print(f"Processing box prompt: {prompt_desc}")
            
            # Build processor inputs
            processor_kwargs = {
                "images": self.current_image,
                "input_boxes": input_boxes,
                "input_boxes_labels": input_boxes_labels,
                "return_tensors": "pt"
            }
            
            # Add text if provided (for combined prompts)
            if text_prompt:
                processor_kwargs["text"] = text_prompt
            
            inputs = self.processor(**processor_kwargs)
            
            # Get original sizes for post-processing
            original_sizes = inputs.get("original_sizes", None)
            
            # Move inputs to device
            if DEVICE != "cpu":
                inputs = {k: v.to(DEVICE) if hasattr(v, 'to') else v for k, v in inputs.items()}
            
            # Run inference
            with torch.no_grad():
                outputs = self.model(**inputs)
            
            # Post-process results
            target_sizes = original_sizes.tolist() if hasattr(original_sizes, 'tolist') else [[self.current_image.height, self.current_image.width]]
            
            results = self.processor.post_process_instance_segmentation(
                outputs,
                threshold=0.5,
                mask_threshold=0.5,
                target_sizes=target_sizes
            )[0]
            
            # Results contain: masks, boxes, scores
            masks = results.get("masks", [])
            result_boxes = results.get("boxes", [])
            scores = results.get("scores", [])
            
            print(f"  → Found {len(masks)} masks from box prompt")
            
            # Bright colors for box-prompted masks
            color_palette = [
                "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
                "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9",
            ]
            
            # Create label from prompt
            label_base = text_prompt if text_prompt else "box selection"
            
            all_masks = []
            for mask_idx, mask in enumerate(masks):
                score = float(scores[mask_idx]) if mask_idx < len(scores) else 0.9
                
                # Get bounding box
                bbox = None
                if mask_idx < len(result_boxes):
                    box = result_boxes[mask_idx]
                    if hasattr(box, 'tolist'):
                        box = box.tolist()
                    bbox = [int(box[0]), int(box[1]), int(box[2] - box[0]), int(box[3] - box[1])]
                
                # Convert mask to numpy
                if hasattr(mask, 'cpu'):
                    mask_np = mask.cpu().numpy()
                else:
                    mask_np = np.array(mask)
                
                while mask_np.ndim > 2:
                    mask_np = mask_np[0]
                
                color = color_palette[mask_idx % len(color_palette)]
                
                mask_info = self._process_mask(
                    mask=mask_np,
                    score=score,
                    prompt=label_base,
                    prompt_idx=0,
                    mask_idx=mask_idx,
                    color=color,
                    bbox=bbox
                )
                
                if mask_info:
                    all_masks.append(mask_info)
                    print(f"    → Mask {mask_idx + 1}: area={mask_info['area']}, score={score:.2f}")
            
            print(f"✓ Box segmentation complete: {len(all_masks)} masks")
            return all_masks
            
        except Exception as e:
            print(f"Error with box segmentation: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def generate_automatic_masks(self) -> List[Dict[str, Any]]:
        """
        Generate masks automatically without prompts.
        Uses a generic prompt to detect all objects.
        """
        if not self.model_loaded or self.current_image is None:
            return []
        
        try:
            # Use generic prompts for automatic detection
            generic_prompts = ["object", "region", "structure"]
            return self.segment_with_text_prompts(generic_prompts)
            
        except Exception as e:
            print(f"Error generating automatic masks: {e}")
            return []
    
    def _process_mask(
        self,
        mask: np.ndarray,
        score: float,
        prompt: str,
        prompt_idx: int,
        mask_idx: int,
        color: str,
        bbox: Optional[List[float]] = None
    ) -> Optional[Dict[str, Any]]:
        """Process a single mask from SAM 3 output."""
        try:
            # Ensure 2D mask
            while mask.ndim > 2:
                mask = mask[0]
            
            # Ensure boolean mask
            if mask.dtype != bool:
                mask = mask > 0.5
            
            # Check if mask has any content
            if not mask.any():
                return None
            
            # Calculate bounding box if not provided
            if bbox is None:
                rows = np.any(mask, axis=1)
                cols = np.any(mask, axis=0)
                
                if not rows.any() or not cols.any():
                    return None
                
                rmin, rmax = np.where(rows)[0][[0, -1]]
                cmin, cmax = np.where(cols)[0][[0, -1]]
                bbox = [int(cmin), int(rmin), int(cmax - cmin), int(rmax - rmin)]
            else:
                # Convert bbox to [x, y, w, h] if in [x1, y1, x2, y2] format
                if len(bbox) == 4 and bbox[2] > bbox[0] and bbox[3] > bbox[1]:
                    bbox = [int(bbox[0]), int(bbox[1]), 
                            int(bbox[2] - bbox[0]), int(bbox[3] - bbox[1])]
            
            area = int(mask.sum())
            
            # Skip very small masks
            if area < 100:
                return None
            
            # Convert mask to base64 PNG
            mask_base64 = self._mask_to_base64(mask, color)
            
            # Create label with numbering
            label = f"{prompt} #{mask_idx + 1}"
            
            # Create unique ID
            safe_prompt = prompt.replace(" ", "-").lower()
            mask_id = f"seg-{safe_prompt}-{mask_idx}"
            
            return {
                "id": mask_id,
                "label": label,
                "color": color,
                "maskBase64": mask_base64,
                "bbox": bbox,
                "area": area,
                "predictedIou": score,
                "stabilityScore": score,
                "visible": True,
                "source": "auto",
            }
            
        except Exception as e:
            print(f"Error processing mask: {e}")
            return None
    
    def _mask_to_base64(self, mask: np.ndarray, color: str) -> str:
        """Convert a binary mask to base64 PNG with color."""
        try:
            h, w = mask.shape
            
            # Parse color hex to RGB
            color = color.lstrip('#')
            r, g, b = tuple(int(color[i:i+2], 16) for i in (0, 2, 4))
            
            # Create RGBA image with mask color
            rgba = np.zeros((h, w, 4), dtype=np.uint8)
            rgba[mask > 0] = [r, g, b, 200]  # Semi-transparent
            
            img = Image.fromarray(rgba, mode="RGBA")
            
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            buffer.seek(0)
            
            return base64.b64encode(buffer.read()).decode("utf-8")
            
        except Exception as e:
            print(f"Error converting mask to base64: {e}")
            return ""
    
    def is_available(self) -> bool:
        """Check if SAM 3 is available."""
        return HAS_SAM3 and HAS_TORCH
    
    def is_loaded(self) -> bool:
        """Check if model is loaded."""
        return self.model_loaded


# Singleton accessor
_sam_service: Optional[SAM3Service] = None


def get_sam_service() -> SAM3Service:
    """Get the SAM 3 service singleton."""
    global _sam_service
    if _sam_service is None:
        _sam_service = SAM3Service()
    return _sam_service
