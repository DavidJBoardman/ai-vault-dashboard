"""
Gaussian splatting projection utilities for point cloud to 2D conversion.
Optimized vectorized implementation for fast performance.
"""

import numpy as np
from typing import Tuple, Dict, Any, Optional

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


def create_gaussian_kernel(size: int, sigma: float) -> np.ndarray:
    """
    Create a 2D Gaussian kernel.
    
    Args:
        size: Size of the kernel (must be odd)
        sigma: Standard deviation of the Gaussian
        
    Returns:
        2D numpy array containing the Gaussian kernel
    """
    if size % 2 == 0:
        size += 1
    
    x = np.arange(size) - size // 2
    kernel_1d = np.exp(-x**2 / (2 * sigma**2))
    kernel_2d = np.outer(kernel_1d, kernel_1d)
    kernel_2d /= kernel_2d.sum()
    
    return kernel_2d


def project_to_2d_gaussian_fast(
    points: np.ndarray,
    colours: Optional[np.ndarray],
    resolution: int = 2048,
    bottom_up: bool = True,
    sigma: float = 1.0,
    kernel_size: int = 5,
    perspective: str = "top"
) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
    """
    Fast vectorized Gaussian splatting projection.
    
    Projects 3D points to 2D image using Gaussian splatting for smooth,
    high-quality output without gaps between points.
    
    Args:
        points: Nx3 array of 3D points (already centered)
        colours: Nx3 array of RGB colors (0-1 range) or None
        resolution: Output image resolution (square)
        bottom_up: If True, flip Y axis (looking up at vault)
        sigma: Gaussian kernel standard deviation
        kernel_size: Size of Gaussian kernel (must be odd)
        perspective: Projection perspective ("top", "bottom", "north", "south", "east", "west")
        
    Returns:
        Tuple of (depth_image, colour_image, metadata)
    """
    if kernel_size % 2 == 0:
        kernel_size += 1
    
    # Apply perspective transformation
    if perspective == "top":
        proj_x = points[:, 0]
        proj_y = points[:, 1]
        proj_z = points[:, 2]
    elif perspective == "bottom":
        proj_x = points[:, 0]
        proj_y = -points[:, 1]
        proj_z = -points[:, 2]
    elif perspective == "north":
        proj_x = points[:, 0]
        proj_y = points[:, 2]
        proj_z = points[:, 1]
    elif perspective == "south":
        proj_x = -points[:, 0]
        proj_y = points[:, 2]
        proj_z = -points[:, 1]
    elif perspective == "east":
        proj_x = -points[:, 1]
        proj_y = points[:, 2]
        proj_z = -points[:, 0]
    elif perspective == "west":
        proj_x = points[:, 1]
        proj_y = points[:, 2]
        proj_z = points[:, 0]
    else:
        proj_x = points[:, 0]
        proj_y = points[:, 1]
        proj_z = points[:, 2]
    
    if bottom_up:
        proj_y = -proj_y
    
    # Calculate bounds
    min_x, max_x = proj_x.min(), proj_x.max()
    min_y, max_y = proj_y.min(), proj_y.max()
    min_z, max_z = proj_z.min(), proj_z.max()
    
    range_x = max_x - min_x
    range_y = max_y - min_y
    range_z = max_z - min_z if max_z != min_z else 1.0
    
    # Use the larger range to maintain aspect ratio
    max_range = max(range_x, range_y)
    if max_range == 0:
        max_range = 1.0
    
    # Add margin
    margin = 0.05
    effective_res = int(resolution * (1 - 2 * margin))
    offset = int(resolution * margin)
    
    # Normalize coordinates to pixel space
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2
    
    px = ((proj_x - center_x) / max_range + 0.5) * effective_res + offset
    py = ((proj_y - center_y) / max_range + 0.5) * effective_res + offset
    
    # Convert to integer pixel coordinates
    px_int = px.astype(np.int32)
    py_int = py.astype(np.int32)
    
    # Normalize depth for visualization
    depth_normalized = (proj_z - min_z) / range_z
    
    # Create output images
    depth_img = np.zeros((resolution, resolution), dtype=np.float32)
    weight_img = np.zeros((resolution, resolution), dtype=np.float32)
    
    if colours is not None and len(colours) == len(points):
        colour_img = np.zeros((resolution, resolution, 3), dtype=np.float32)
        has_colours = True
    else:
        colour_img = np.zeros((resolution, resolution, 3), dtype=np.float32)
        has_colours = False
    
    # Create Gaussian kernel
    kernel = create_gaussian_kernel(kernel_size, sigma)
    half_k = kernel_size // 2
    
    # Sort points by depth (back to front) for proper occlusion
    depth_order = np.argsort(depth_normalized)
    
    # Vectorized splatting
    for idx in depth_order:
        x, y = px_int[idx], py_int[idx]
        
        # Skip points outside image bounds
        if x < half_k or x >= resolution - half_k or y < half_k or y >= resolution - half_k:
            continue
        
        # Get the region to splat onto
        y_start, y_end = y - half_k, y + half_k + 1
        x_start, x_end = x - half_k, x + half_k + 1
        
        # Apply Gaussian splat
        depth_img[y_start:y_end, x_start:x_end] += kernel * depth_normalized[idx]
        weight_img[y_start:y_end, x_start:x_end] += kernel
        
        if has_colours:
            for c in range(3):
                colour_img[y_start:y_end, x_start:x_end, c] += kernel * colours[idx, c]
    
    # Normalize by weights
    valid_mask = weight_img > 0
    depth_img[valid_mask] /= weight_img[valid_mask]
    
    if has_colours:
        for c in range(3):
            colour_img[:, :, c][valid_mask] /= weight_img[valid_mask]
    else:
        # Generate height-based colors if no colors provided
        for c in range(3):
            colour_img[:, :, c] = depth_img
    
    # Create metadata
    metadata = {
        "resolution": resolution,
        "sigma": sigma,
        "kernel_size": kernel_size,
        "perspective": perspective,
        "bottom_up": bottom_up,
        "bounds": {
            "min_x": float(min_x), "max_x": float(max_x),
            "min_y": float(min_y), "max_y": float(max_y),
            "min_z": float(min_z), "max_z": float(max_z),
        },
        "point_count": len(points),
        "has_colours": has_colours,
    }
    
    return depth_img, colour_img, metadata


def prepare_export_images_gaussian(
    depth_img: np.ndarray,
    colour_img: np.ndarray
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Prepare images for export and visualization.
    
    Args:
        depth_img: 2D depth image (float32, 0-1 range)
        colour_img: 3D colour image (float32, 0-1 range)
        
    Returns:
        Tuple of (colour_uint8, depth_grayscale, depth_plasma)
    """
    # Colour image to uint8
    colour_uint8 = np.clip(colour_img * 255, 0, 255).astype(np.uint8)
    
    # Depth grayscale
    depth_grayscale = np.clip(depth_img * 255, 0, 255).astype(np.uint8)
    
    # Depth with plasma colormap
    if HAS_CV2:
        depth_plasma = cv2.applyColorMap(depth_grayscale, cv2.COLORMAP_PLASMA)
        depth_plasma = cv2.cvtColor(depth_plasma, cv2.COLOR_BGR2RGB)
    else:
        # Fallback: create a simple warm colormap
        depth_plasma = np.zeros((depth_img.shape[0], depth_img.shape[1], 3), dtype=np.uint8)
        norm_depth = depth_img
        depth_plasma[:, :, 0] = np.clip(norm_depth * 255, 0, 255).astype(np.uint8)  # R
        depth_plasma[:, :, 1] = np.clip(norm_depth * 180, 0, 255).astype(np.uint8)  # G
        depth_plasma[:, :, 2] = np.clip((1 - norm_depth) * 200 + 55, 0, 255).astype(np.uint8)  # B
    
    return colour_uint8, depth_grayscale, depth_plasma


def save_projection_gaussian(
    depth_img: np.ndarray,
    colour_img: np.ndarray,
    metadata: Dict[str, Any],
    folder_dir: str,
    projection_id: str
) -> Dict[str, str]:
    """
    Save Gaussian projection images and metadata.
    
    Args:
        depth_img: 2D depth image
        colour_img: 3D colour image
        metadata: Projection metadata
        folder_dir: Output folder path
        projection_id: Unique projection identifier
        
    Returns:
        Dictionary with paths to saved files
    """
    import json
    from pathlib import Path
    
    folder = Path(folder_dir)
    folder.mkdir(parents=True, exist_ok=True)
    
    # Prepare export images
    colour_uint8, depth_gray, depth_plasma = prepare_export_images_gaussian(depth_img, colour_img)
    
    paths = {}
    
    if HAS_PIL:
        # Save colour image
        colour_path = folder / f"{projection_id}_colour.png"
        Image.fromarray(colour_uint8).save(colour_path, quality=95)
        paths["colour"] = str(colour_path)
        
        # Save depth grayscale
        depth_gray_path = folder / f"{projection_id}_depth_gray.png"
        Image.fromarray(depth_gray).save(depth_gray_path)
        paths["depth_grayscale"] = str(depth_gray_path)
        
        # Save depth plasma (colorized)
        depth_plasma_path = folder / f"{projection_id}_depth_plasma.png"
        Image.fromarray(depth_plasma).save(depth_plasma_path)
        paths["depth_plasma"] = str(depth_plasma_path)
    
    # Save raw depth as numpy (for reprojection later)
    depth_npy_path = folder / f"{projection_id}_depth.npy"
    np.save(depth_npy_path, depth_img)
    paths["depth_raw"] = str(depth_npy_path)
    
    # Save metadata
    metadata_path = folder / f"{projection_id}_metadata.json"
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    paths["metadata"] = str(metadata_path)
    
    return paths

