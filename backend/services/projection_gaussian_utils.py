"""
Gaussian splatting projection utilities for point cloud to 2D conversion.
Optimized vectorized implementation for fast performance.
"""

import numpy as np
from typing import Tuple, Dict, Any, Optional
import time

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

try:
    from scipy.ndimage import gaussian_filter
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


def project_to_2d_gaussian_fast(
    points: np.ndarray,
    colours: Optional[np.ndarray],
    resolution: int = 2048,
    bottom_up: bool = True,
    sigma: float = 1.0,
    kernel_size: int = 5,
    perspective: str = "top"
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Dict[str, Any]]:
    """
    Highly optimized Gaussian splatting projection using rasterize-then-blur approach.
    
    This is much faster than per-point kernel application because:
    1. Uses np.add.at for fast vectorized point accumulation
    2. Uses scipy's gaussian_filter (optimized C code) instead of per-point kernels
    3. No Python loop over millions of points
    
    Args:
        points: Nx3 array of 3D points (already centered)
        colours: Nx3 array of RGB colors (0-1 range) or None
        resolution: Output image resolution (square)
        bottom_up: If True, flip Y axis (looking up at vault)
        sigma: Gaussian kernel standard deviation
        kernel_size: Size of Gaussian kernel (unused, kept for API compatibility)
        perspective: Projection perspective ("top", "bottom", "north", "south", "east", "west")
        
    Returns:
        Tuple of (depth_image, colour_image, coordinate_image, metadata)
        coordinate_image: 3-channel array with normalized (x, y, z) per pixel for reconstruction
    """
    start_time = time.time()
    
    # Debug: check input color range
    if colours is not None:
        print(f"  Input colors range: {colours.min():.3f} - {colours.max():.3f}")
    
    # Apply perspective transformation (vectorized)
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
    
    # Calculate bounds (vectorized)
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
    
    # Normalize coordinates to pixel space (vectorized)
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2
    
    px = ((proj_x - center_x) / max_range + 0.5) * effective_res + offset
    py = ((proj_y - center_y) / max_range + 0.5) * effective_res + offset
    
    # Convert to integer pixel coordinates
    px_int = np.clip(px.astype(np.int32), 0, resolution - 1)
    py_int = np.clip(py.astype(np.int32), 0, resolution - 1)
    
    # Normalize depth for visualization
    depth_normalized = (proj_z - min_z) / range_z
    
    # Check if we have colors
    has_colours = colours is not None and len(colours) == len(points)
    
    # ============== FAST RASTERIZATION using np.add.at ==============
    # This is MUCH faster than looping through points
    
    # Create accumulator arrays
    depth_sum = np.zeros((resolution, resolution), dtype=np.float64)
    weight_sum = np.zeros((resolution, resolution), dtype=np.float64)
    
    # Flatten indices for np.add.at
    flat_indices = py_int * resolution + px_int
    
    # Accumulate depth values (vectorized, no loop!)
    np.add.at(depth_sum.ravel(), flat_indices, depth_normalized)
    np.add.at(weight_sum.ravel(), flat_indices, 1.0)
    
    # Handle colors - use separate arrays to avoid non-contiguous slicing issues
    if has_colours:
        # Create separate contiguous arrays for each color channel
        colour_r = np.zeros((resolution * resolution,), dtype=np.float64)
        colour_g = np.zeros((resolution * resolution,), dtype=np.float64)
        colour_b = np.zeros((resolution * resolution,), dtype=np.float64)
        
        np.add.at(colour_r, flat_indices, colours[:, 0])
        np.add.at(colour_g, flat_indices, colours[:, 1])
        np.add.at(colour_b, flat_indices, colours[:, 2])
        
        # Reshape back to 2D and stack into 3D array
        colour_sum = np.stack([
            colour_r.reshape(resolution, resolution),
            colour_g.reshape(resolution, resolution),
            colour_b.reshape(resolution, resolution)
        ], axis=-1)
    
    # ============== ACCUMULATE ORIGINAL 3D COORDINATES ==============
    # Store the original (non-transformed) 3D coordinates for each pixel
    # This allows perfect reconstruction back to 3D
    
    # Normalize original coordinates to 0-1 range
    orig_min_x, orig_max_x = points[:, 0].min(), points[:, 0].max()
    orig_min_y, orig_max_y = points[:, 1].min(), points[:, 1].max()
    orig_min_z, orig_max_z = points[:, 2].min(), points[:, 2].max()
    
    orig_range_x = orig_max_x - orig_min_x if orig_max_x != orig_min_x else 1.0
    orig_range_y = orig_max_y - orig_min_y if orig_max_y != orig_min_y else 1.0
    orig_range_z = orig_max_z - orig_min_z if orig_max_z != orig_min_z else 1.0
    
    # Normalize original coordinates
    norm_orig_x = (points[:, 0] - orig_min_x) / orig_range_x
    norm_orig_y = (points[:, 1] - orig_min_y) / orig_range_y
    norm_orig_z = (points[:, 2] - orig_min_z) / orig_range_z
    
    # Accumulate normalized original coordinates
    coord_x = np.zeros((resolution * resolution,), dtype=np.float64)
    coord_y = np.zeros((resolution * resolution,), dtype=np.float64)
    coord_z = np.zeros((resolution * resolution,), dtype=np.float64)
    
    np.add.at(coord_x, flat_indices, norm_orig_x)
    np.add.at(coord_y, flat_indices, norm_orig_y)
    np.add.at(coord_z, flat_indices, norm_orig_z)
    
    # Reshape to 2D
    coord_x_2d = coord_x.reshape(resolution, resolution)
    coord_y_2d = coord_y.reshape(resolution, resolution)
    coord_z_2d = coord_z.reshape(resolution, resolution)
    
    raster_time = time.time()
    print(f"  Rasterization: {raster_time - start_time:.2f}s")
    
    # ============== APPLY GAUSSIAN BLUR ==============
    # This replaces per-point kernel application with a single efficient filter
    
    # Use sigma directly as pixel radius (user's sigma value maps to pixel blur)
    # Typical values: 0.5-3.0 work well for most point clouds
    pixel_sigma = max(0.5, min(sigma * 1.5, 4.0))
    print(f"  Using pixel sigma: {pixel_sigma:.2f}")
    
    if HAS_SCIPY:
        # Use scipy's highly optimized gaussian_filter
        depth_sum = gaussian_filter(depth_sum, sigma=pixel_sigma, mode='constant')
        weight_sum = gaussian_filter(weight_sum, sigma=pixel_sigma, mode='constant')
        
        if has_colours:
            for c in range(3):
                colour_sum[:, :, c] = gaussian_filter(colour_sum[:, :, c], sigma=pixel_sigma, mode='constant')
        
        # Blur coordinates too for consistent reconstruction
        coord_x_2d = gaussian_filter(coord_x_2d, sigma=pixel_sigma, mode='constant')
        coord_y_2d = gaussian_filter(coord_y_2d, sigma=pixel_sigma, mode='constant')
        coord_z_2d = gaussian_filter(coord_z_2d, sigma=pixel_sigma, mode='constant')
    elif HAS_CV2:
        # Fallback to OpenCV
        ksize = int(pixel_sigma * 6) | 1  # Ensure odd
        depth_sum = cv2.GaussianBlur(depth_sum, (ksize, ksize), pixel_sigma)
        weight_sum = cv2.GaussianBlur(weight_sum, (ksize, ksize), pixel_sigma)
        
        if has_colours:
            for c in range(3):
                colour_sum[:, :, c] = cv2.GaussianBlur(colour_sum[:, :, c], (ksize, ksize), pixel_sigma)
        
        # Blur coordinates too
        coord_x_2d = cv2.GaussianBlur(coord_x_2d, (ksize, ksize), pixel_sigma)
        coord_y_2d = cv2.GaussianBlur(coord_y_2d, (ksize, ksize), pixel_sigma)
        coord_z_2d = cv2.GaussianBlur(coord_z_2d, (ksize, ksize), pixel_sigma)
    
    blur_time = time.time()
    print(f"  Gaussian blur: {blur_time - raster_time:.2f}s")
    
    # ============== NORMALIZE ==============
    # Avoid division by zero - use a threshold relative to max weight
    weight_threshold = weight_sum.max() * 0.001 if weight_sum.max() > 0 else 1e-10
    valid_mask = weight_sum > weight_threshold
    
    print(f"  Weight range: {weight_sum.min():.6f} - {weight_sum.max():.6f}")
    print(f"  Valid pixels: {valid_mask.sum():,} / {resolution * resolution:,}")
    
    depth_img = np.zeros((resolution, resolution), dtype=np.float32)
    if valid_mask.any():
        depth_img[valid_mask] = (depth_sum[valid_mask] / weight_sum[valid_mask]).astype(np.float32)
        
        # Re-normalize depth to 0-1 range for proper visualization
        depth_min = depth_img[valid_mask].min()
        depth_max = depth_img[valid_mask].max()
        print(f"  Raw depth range: {depth_min:.3f} - {depth_max:.3f}")
        
        if depth_max > depth_min:
            depth_img[valid_mask] = (depth_img[valid_mask] - depth_min) / (depth_max - depth_min)
    
    if has_colours:
        colour_img = np.zeros((resolution, resolution, 3), dtype=np.float32)
        for c in range(3):
            colour_img[:, :, c][valid_mask] = (colour_sum[:, :, c][valid_mask] / weight_sum[valid_mask]).astype(np.float32)
        
        # Clamp colors to 0-1 range
        colour_img = np.clip(colour_img, 0.0, 1.0)
        print(f"  Color range after norm: {colour_img.min():.3f} - {colour_img.max():.3f}")
    else:
        # Generate height-based colors if no colors provided
        colour_img = np.stack([depth_img, depth_img, depth_img], axis=-1)
    
    print(f"  Final depth range: {depth_img.min():.3f} - {depth_img.max():.3f}")
    
    # ============== NORMALIZE COORDINATES ==============
    # Create coordinate image with normalized original 3D coordinates
    coordinate_img = np.zeros((resolution, resolution, 3), dtype=np.float32)
    if valid_mask.any():
        coordinate_img[:, :, 0][valid_mask] = (coord_x_2d[valid_mask] / weight_sum[valid_mask]).astype(np.float32)
        coordinate_img[:, :, 1][valid_mask] = (coord_y_2d[valid_mask] / weight_sum[valid_mask]).astype(np.float32)
        coordinate_img[:, :, 2][valid_mask] = (coord_z_2d[valid_mask] / weight_sum[valid_mask]).astype(np.float32)
    
    print(f"  Coordinate ranges: X={coordinate_img[:,:,0].max():.3f}, Y={coordinate_img[:,:,1].max():.3f}, Z={coordinate_img[:,:,2].max():.3f}")
    
    total_time = time.time() - start_time
    print(f"  Total projection time: {total_time:.2f}s for {len(points):,} points")
    
    # Create metadata with original coordinate bounds for reconstruction
    metadata = {
        "resolution": resolution,
        "sigma": sigma,
        "kernel_size": kernel_size,
        "perspective": perspective,
        "bottom_up": bottom_up,
        # Projected bounds (after perspective transform)
        "bounds": {
            "min_x": float(min_x), "max_x": float(max_x),
            "min_y": float(min_y), "max_y": float(max_y),
            "min_z": float(min_z), "max_z": float(max_z),
        },
        # Original coordinate bounds for reconstruction (before any transform)
        "min_vals": [float(orig_min_x), float(orig_min_y), float(orig_min_z)],
        "range_vals": [float(orig_range_x), float(orig_range_y), float(orig_range_z)],
        "point_count": len(points),
        "has_colours": has_colours,
        "processing_time_seconds": total_time,
    }
    
    return depth_img, colour_img, coordinate_img, metadata


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
    print(f"  Export - depth input range: {depth_img.min():.3f} - {depth_img.max():.3f}")
    print(f"  Export - colour input range: {colour_img.min():.3f} - {colour_img.max():.3f}")
    
    # Colour image to uint8
    colour_uint8 = np.clip(colour_img * 255, 0, 255).astype(np.uint8)
    print(f"  Export - colour uint8 range: {colour_uint8.min()} - {colour_uint8.max()}")
    
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
    coordinate_img: np.ndarray,
    metadata: Dict[str, Any],
    folder_dir: str,
    projection_id: str
) -> Dict[str, str]:
    """
    Save Gaussian projection images and metadata.
    
    Args:
        depth_img: 2D depth image
        colour_img: 3D colour image
        coordinate_img: 3D coordinate image (normalized x, y, z per pixel)
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
    
    # Save coordinate data as numpy (for perfect 3D reconstruction)
    coordinates_npy_path = folder / f"{projection_id}_coordinates.npy"
    np.save(coordinates_npy_path, coordinate_img)
    paths["coordinates"] = str(coordinates_npy_path)
    print(f"  Saved coordinates: {coordinates_npy_path} (shape: {coordinate_img.shape})")
    
    # Save metadata
    metadata_path = folder / f"{projection_id}_metadata.json"
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    paths["metadata"] = str(metadata_path)
    
    return paths

