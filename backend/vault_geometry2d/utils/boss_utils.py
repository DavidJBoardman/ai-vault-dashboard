from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
import sys
import json
from typing import Iterable, List, Optional, Sequence, Tuple

import cv2
import numpy as np

project_root = Path(__file__).parent.parent.parent
if project_root not in sys.path:
    sys.path.append(str(project_root))
from src.vault_geometry2d.utils.cut_utils import image_to_unit, RoiParams, show_overlay


@dataclass
class BossDetection:
    component_id: int
    area: int
    centroid_xy: Tuple[float, float]
    bbox: Tuple[int, int, int, int]
    centroid_uv: Tuple[float, float]
    out_of_bounds: bool


def parse_colour_to_bgr(colour: str) -> Tuple[int, int, int]:
    """Parse a colour string into BGR.

    Accepts formats:
      - "#rrggbb" or "rrggbb"
      - "r,g,b" (decimal, 0..255)
    Returns (B, G, R).
    """
    s = colour.strip().lower()
    if s.startswith("#"):
        s = s[1:]
    if "," in s:
        parts = [int(p) for p in s.split(",")]
        if len(parts) != 3:
            raise ValueError("rgb string must have 3 comma-separated values")
        r, g, b = parts[0], parts[1], parts[2]
        return int(b), int(g), int(r)
    if len(s) == 6:
        r = int(s[0:2], 16)
        g = int(s[2:4], 16)
        b = int(s[4:6], 16)
        return b, g, r
    raise ValueError(f"Unsupported colour format: {colour}")



# --- 1. rgb to binary mask ---
def binary_from_bgr_by_colour(
    image_bgr: np.ndarray,
    colour_bgr: Tuple[int, int, int],
    tol_h: int = 10,
    tol_s: int = 10,
    tol_v: int = 10,
) -> np.ndarray:
    """Segment pixels near a target colour (BGR) using HSV tolerances.

    Handles hue wrap-around. Returns uint8 binary mask (0 or 255).
    """
    if image_bgr is None or image_bgr.size == 0:
        raise ValueError("image is empty")
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    target_hsv = cv2.cvtColor(np.uint8([[list(colour_bgr)]]), cv2.COLOR_BGR2HSV)[0, 0]
    th, ts, tv = int(target_hsv[0]), int(target_hsv[1]), int(target_hsv[2])

    lower1 = np.array([max(0, th - tol_h), max(0, ts - tol_s), max(0, tv - tol_v)], dtype=np.uint8)
    upper1 = np.array([min(179, th + tol_h), min(255, ts + tol_s), min(255, tv + tol_v)], dtype=np.uint8)

    if th - tol_h < 0:
        lower2 = np.array([180 + (th - tol_h), max(0, ts - tol_s), max(0, tv - tol_v)], dtype=np.uint8)
        upper2 = np.array([179, min(255, ts + tol_s), min(255, tv + tol_v)], dtype=np.uint8)
        mask = cv2.inRange(hsv, lower1, upper1) | cv2.inRange(hsv, lower2, upper2)
    elif th + tol_h > 179:
        lower2 = np.array([0, max(0, ts - tol_s), max(0, tv - tol_v)], dtype=np.uint8)
        upper2 = np.array([(th + tol_h) - 180, min(255, ts + tol_s), min(255, tv + tol_v)], dtype=np.uint8)
        mask = cv2.inRange(hsv, lower1, upper1) | cv2.inRange(hsv, lower2, upper2)
    else:
        mask = cv2.inRange(hsv, lower1, upper1)

    # show_overlay(mask, "mask")
    return mask


# --- 2. clean binary mask ---
def clean_binary_mask(
    binary: np.ndarray,
    open_ks: int = 3,
    close_ks: int = 5,
    fill_holes: bool = True,
) -> np.ndarray:
    """Morphologically clean a binary mask (uint8 0/255)."""
    b = (binary > 0).astype(np.uint8) * 255
    if open_ks and open_ks > 1:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (open_ks, open_ks))
        b = cv2.morphologyEx(b, cv2.MORPH_OPEN, k)
    if close_ks and close_ks > 1:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_ks, close_ks))
        b = cv2.morphologyEx(b, cv2.MORPH_CLOSE, k)
    if fill_holes:
        h, w = b.shape[:2]
        ff = b.copy()
        mask = np.zeros((h + 2, w + 2), np.uint8)
        cv2.floodFill(ff, mask, (0, 0), 255)
        inv = cv2.bitwise_not(ff)
        b = cv2.bitwise_or(b, inv)

    # show_overlay(b, "cleaned mask")
    return b


# --- 3. collect bosses ---
def collect_bosses_from_binary(
    binary: np.ndarray,
    roi: RoiParams,
    min_area: int,
    max_area: Optional[int],
) -> List[BossDetection]:
    tol = 0.05
    if binary is None or binary.ndim != 2:
        raise ValueError("binary must be a 2D uint8 image")
    _, bw = cv2.threshold(binary, 0, 255, cv2.THRESH_BINARY)
    num_labels, _labels, stats, centroids = cv2.connectedComponentsWithStats(bw, connectivity=8)
    detections: List[BossDetection] = []
    for label in range(1, num_labels):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area < min_area:
            continue
        if max_area is not None and area > max_area:
            continue
        cx, cy = map(float, centroids[label])
        u, v = image_to_unit((cx, cy), roi)
        x = int(stats[label, cv2.CC_STAT_LEFT])
        y = int(stats[label, cv2.CC_STAT_TOP])
        w = int(stats[label, cv2.CC_STAT_WIDTH])
        h = int(stats[label, cv2.CC_STAT_HEIGHT])
        detections.append(
            BossDetection(
                component_id=label,
                area=area,
                centroid_xy=(cx, cy),
                bbox=(int(x), int(y), int(w), int(h)),
                centroid_uv=(u, v),
                out_of_bounds=not (0.0-tol < u < 1.0+tol and 0.0-tol < v < 1.0+tol),
            )
        )
    
    
    return detections

def collect_bosses_from_points(points: Iterable[Tuple[float, float]], roi: RoiParams) -> List[BossDetection]:
    tol = 0.05
    detections: List[BossDetection] = []
    for idx, (cx, cy) in enumerate(points, start=1):
        u, v = image_to_unit((cx, cy), roi)
        detections.append(
            BossDetection(
                component_id=idx,
                area=0,
                centroid_xy=(cx, cy),
                bbox=(0, 0, 0, 0),
                centroid_uv=(u, v),
                out_of_bounds=not (0.0-tol < u < 1.0+tol and 0.0-tol < v < 1.0+tol),
            )
        )
    return detections



def min_pairwise_distance(points_uv: Sequence[Tuple[float, float]]) -> float:
    if len(points_uv) < 2:
        return float("inf")
    pts = np.array(points_uv, dtype=np.float64)
    diff = pts[np.newaxis, :, :] - pts[:, np.newaxis, :]
    dist = np.linalg.norm(diff, axis=-1)
    np.fill_diagonal(dist, np.inf)
    return float(np.min(dist))


def list_too_close(points_uv: Sequence[Tuple[float, float]], tol: float) -> List[Tuple[int, int]]:
    close_pairs: List[Tuple[int, int]] = []
    for i in range(len(points_uv)):
        for j in range(i + 1, len(points_uv)):
            if math.dist(points_uv[i], points_uv[j]) < tol:
                close_pairs.append((i, j))
    return close_pairs


def dedupe_points(points_uv: List[Tuple[float, float]], tol: float) -> Tuple[List[Tuple[float, float]], List[Tuple[int, int]], List[int]]:
    """Greedy dedupe: remove later points in any pair closer than ``tol``.

    Returns (filtered_points, removed_pairs, removed_indices).
    """
    keep: List[Tuple[float, float]] = []
    removed_pairs: List[Tuple[int, int]] = []
    removed_indices: List[int] = []
    for i, p in enumerate(points_uv):
        drop = False
        for j, q in enumerate(keep):
            if math.dist(p, q) < tol:
                removed_pairs.append((j, i))
                removed_indices.append(i)
                drop = True
                break
        if not drop:
            keep.append(p)
    return keep, removed_pairs, removed_indices


def draw_boss_overlay(
    image_path: Optional[Path],
    detections: Sequence[BossDetection],
    overlay_path: Path,
) -> None:
    if image_path is None:
        return
    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        return
    overlay = image.copy()
    for det in detections:
        colour = (50, 200, 50) if not det.out_of_bounds else (40, 40, 220)
        cx, cy = map(int, map(round, det.centroid_xy))

        # centroid marker and id
        cv2.circle(overlay, (cx, cy), 20, colour, -1)
        # thicker outline and fill for improved readability
        cv2.putText(overlay, f"{det.component_id}", (cx + 20, cy - 20), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 5, cv2.LINE_AA)
        # cv2.putText(overlay, f"{det.component_id}", (cx + 16, cy - 16), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (255, 255, 255), 3, cv2.LINE_AA)

        # crosshair lines
        size = 10
        cv2.line(overlay, (cx - size, cy), (cx + size, cy), (0, 0, 0), 3, cv2.LINE_AA)
        cv2.line(overlay, (cx, cy - size), (cx, cy + size), (0, 0, 0), 3, cv2.LINE_AA)
        cv2.line(overlay, (cx - size, cy), (cx + size, cy), (255, 255, 255), 1, cv2.LINE_AA)
        cv2.line(overlay, (cx, cy - size), (cx, cy + size), (255, 255, 255), 1, cv2.LINE_AA)
    overlay_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(overlay_path), overlay)
    show_overlay(overlay, "boss overlay")



# ========================================================================================================================
def load_manual_points(path: Path) -> List[Tuple[float, float]]:
    """Load manually specified boss points from JSON or CSV."""
    if path.suffix.lower() == ".json":
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and "points" in data:
            data = data["points"]
        if not isinstance(data, Sequence):
            raise ValueError(f"JSON at {path} must contain a list of points or an object with 'points'")
        points: List[Tuple[float, float]] = []
        for entry in data:
            if isinstance(entry, dict):
                if "x" not in entry or "y" not in entry:
                    raise ValueError(f"Point dict {entry} missing 'x'/'y'")
                points.append((float(entry["x"]), float(entry["y"])))
            elif isinstance(entry, Sequence) and len(entry) >= 2:
                points.append((float(entry[0]), float(entry[1])))
            else:
                raise ValueError(f"Unsupported point entry {entry!r}")
        return points
    if path.suffix.lower() in {".csv", ".tsv"}:
        import csv

        delimiter = "," if path.suffix.lower() == ".csv" else "\t"
        points: List[Tuple[float, float]] = []
        with path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f, delimiter=delimiter)
            if "x" not in reader.fieldnames or "y" not in reader.fieldnames:
                raise ValueError(f"CSV at {path} must contain 'x' and 'y' columns")
            for row in reader:
                points.append((float(row["x"]), float(row["y"])))
        return points
    raise ValueError(f"Unsupported manual points format: {path.suffix}")