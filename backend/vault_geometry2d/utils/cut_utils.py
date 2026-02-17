import json
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple
import math
import cv2
import numpy as np

RoiParams = Dict[str, float]


def corners_to_roi(
    corners_xy: Sequence[Tuple[float, float]],
    centre_xy: Optional[Tuple[float, float]] = None,
) -> RoiParams:
    """Build ROI parameters from 4 corners (and optionally the centre).

    Corners should be in order: top-left, top-right, bottom-right, bottom-left
    (same as unit square (0,0), (1,0), (1,1), (0,1)).

    If centre_xy is provided, it is used as (cx, cy); otherwise the centroid
    of the four corners is used. This gives a consistent ROI for ratio-based
    analysis when the vault centre is known.
    """
    if len(corners_xy) != 4:
        raise ValueError("corners_xy must contain exactly 4 points (TL, TR, BR, BL)")
    tl, tr, br, bl = corners_xy
    tl_x, tl_y = float(tl[0]), float(tl[1])
    tr_x, tr_y = float(tr[0]), float(tr[1])
    br_x, br_y = float(br[0]), float(br[1])
    bl_x, bl_y = float(bl[0]), float(bl[1])

    if centre_xy is not None:
        cx = float(centre_xy[0])
        cy = float(centre_xy[1])
    else:
        cx = (tl_x + tr_x + br_x + bl_x) / 4.0
        cy = (tl_y + tr_y + br_y + bl_y) / 4.0

    # Width = average of top and bottom edge lengths; height = average of left and right
    w = 0.5 * (math.hypot(tr_x - tl_x, tr_y - tl_y) + math.hypot(br_x - bl_x, br_y - bl_y))
    h = 0.5 * (math.hypot(tr_x - br_x, tr_y - br_y) + math.hypot(tl_x - bl_x, tl_y - bl_y))
    if w <= 0 or h <= 0:
        raise ValueError("Corners do not form a valid rectangle (non-positive width or height)")

    # Rotation: angle of top edge (TL -> TR) from horizontal, in degrees
    rotation_deg = math.degrees(math.atan2(tr_y - tl_y, tr_x - tl_x))

    return {
        "cx": cx,
        "cy": cy,
        "w": w,
        "h": h,
        "rotation_deg": rotation_deg,
        "scale": 1.0,
    }

# Track persistent windows so we only create them once
_OPEN_WINDOWS = set()

def load_roi(path: str) -> Tuple[RoiParams, Dict[str, object]]:
    """Load ROI from JSON supporting both legacy and new wrapped formats.

    Returns (roi_params, meta) where meta may include image_path and output_path.
    """
    path_obj = Path(path)
    with open(path_obj, "r", encoding="utf-8") as f:
        data = json.load(f)
    meta: Dict[str, object] = {}
    if isinstance(data, dict) and "params" in data and isinstance(data["params"], dict):
        params: RoiParams = data["params"]
        # capture optional meta fields
        for k in ("image_path", "output_path", "image_path_unstretched"):
            if k in data:
                meta[k] = data[k]
    else:
        params = data  # legacy flat structure
    # defaults
    params.setdefault("rotation_deg", 0.0)
    params.setdefault("scale", 1.0)
    # Resolve any relative paths in meta relative to the roi.json location
    base = path_obj.parent
    if "image_path" in meta and meta["image_path"]:
        ip = Path(str(meta["image_path"]))
        meta["image_path"] = str(ip if ip.is_absolute() else (base / ip))
    if "output_path" in meta and meta["output_path"]:
        op = Path(str(meta["output_path"]))
        meta["output_path"] = str(op if op.is_absolute() else (base / op))
    if "image_path_unstretched" in meta and meta["image_path_unstretched"]:
        up = Path(str(meta["image_path_unstretched"]))
        meta["image_path_unstretched"] = str(up if up.is_absolute() else (base / up))
    return params, meta



def unit_to_image(point_uv: Tuple[float, float], roi: RoiParams) -> Tuple[int, int]:
    """Map a unit-square point (u,v in [0,1]) into image pixel coords using ROI.

    The rectangle defined by the ROI corresponds to the unit square where (0,0) is
    top-left and (1,1) is bottom-right before rotation.
    """
    u, v = point_uv
    cx, cy = roi["cx"], roi["cy"]
    w, h = roi["w"], roi["h"]
    angle = math.radians(roi.get("rotation_deg", 0.0))
    # local coordinates centred at (0,0)
    x_local = (u - 0.5) * w
    y_local = (v - 0.5) * h
    s, c = math.sin(angle), math.cos(angle)
    x_rot = c * x_local - s * y_local
    y_rot = s * x_local + c * y_local
    x_img = int(round(cx + x_rot))
    y_img = int(round(cy + y_rot))
    return x_img, y_img



def image_to_unit(point_xy: Tuple[float, float], roi: RoiParams) -> Tuple[float, float]:
    """Map image pixel coordinates (x, y) into ROI unit-square coordinates.

    Inverse of ``unit_to_image`` using the same ROI convention.
    """
    x, y = point_xy
    cx, cy = roi["cx"], roi["cy"]
    w, h = roi["w"], roi["h"]
    if w == 0 or h == 0:
        raise ValueError("ROI width/height cannot be zero when converting coordinates")
    angle = math.radians(roi.get("rotation_deg", 0.0))
    s, c = math.sin(-angle), math.cos(-angle)
    # centre and un-rotate
    dx, dy = x - cx, y - cy
    x_local = c * dx - s * dy
    y_local = s * dx + c * dy
    u = x_local / w + 0.5
    v = y_local / h + 0.5
    return u, v


def draw_dashed_line(
    image: np.ndarray,
    p0: Tuple[int, int],
    p1: Tuple[int, int],
    colour: Tuple[int, int, int],
    thickness: int = 2,
    dash_length: int = 14,
    gap_length: int = 10,
    outline_colour: Optional[Tuple[int, int, int]] = (0, 0, 0),
    outline_extra: int = 2,
) -> None:
    """Draw a high-contrast dashed line between p0 and p1 (in-place).

    Draws an optional darker outline behind each dash for visibility.
    """
    x0, y0 = p0
    x1, y1 = p1
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy)
    if length == 0:
        return
    vx, vy = dx / length, dy / length
    pos = 0.0
    while pos < length:
        seg_start = pos
        seg_end = min(pos + dash_length, length)
        sx = int(round(x0 + vx * seg_start))
        sy = int(round(y0 + vy * seg_start))
        ex = int(round(x0 + vx * seg_end))
        ey = int(round(y0 + vy * seg_end))
        if outline_colour is not None:
            cv2.line(image, (sx, sy), (ex, ey), outline_colour, thickness + outline_extra, cv2.LINE_AA)
        cv2.line(image, (sx, sy), (ex, ey), colour, thickness, cv2.LINE_AA)
        pos += dash_length + gap_length


def rectangle_vertices(roi: RoiParams) -> List[Tuple[int, int]]:
    """Return the four rectangle vertices (clockwise) in image pixels."""
    return [
        unit_to_image((0.0, 0.0), roi),
        unit_to_image((1.0, 0.0), roi),
        unit_to_image((1.0, 1.0), roi),
        unit_to_image((0.0, 1.0), roi),
    ]



def ray_circle_point(centre: Tuple[int, int], target: Tuple[int, int], radius: int) -> Tuple[int, int]:
    """Return the point on the circle that is closest to the target point."""
    c = np.array(centre, float)
    v = np.array(target, float) - c
    n = np.linalg.norm(v)
    if n == 0:
        return tuple(c.astype(int))
    u = v / n
    p = c + radius * u
    return int(round(p[0])), int(round(p[1]))


# ------------------------------------------------------------
# Show overlay
# ------------------------------------------------------------
def show_overlay(overlay: Optional[np.ndarray], title: str = "overlay") -> int:
    """Show an image in a persistent window and pause.

    - The same window stays open across calls; we only create it once.
    - delay=0 blocks until a key is pressed; delay>0 pauses that many ms.
    - Returns the pressed key (or -1 when no key within delay>0).
    - Press 'q' or ESC to close the window.
    """
    if overlay is None:
        return -1
    if overlay.size == 0:
        return -1
    h, w = overlay.shape[:2] if len(overlay.shape) >= 2 else (0, 0)
    if w <= 0 or h <= 0:
        return -1
    cv2.imshow(title, overlay)
    cv2.waitKey(0)
    cv2.destroyWindow(title)
    return 0