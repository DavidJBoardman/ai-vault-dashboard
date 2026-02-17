"""
Step 01 — Interactive ROI selection with direct rectangular drawing on unstretched vault image.

Interactive drag-and-drop interface:
- Drag centre to move
- Drag corners to resize
- Drag red handle to rotate
- Press 's' to save, 'q' to quit

Output: roi.json (compatible with step02+ in vault_geometry2d pipeline).
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Dict, Optional, Tuple

import cv2
import numpy as np

from src.vault_geometry2d.utils.unstretch import prepare_unstretched_image, compute_anisotropy_factors
from src.vault_geometry2d.utils.ratio_patterns import suggest_ratio_patterns

RoiParams = Dict[str, float]


def _rotate_point(point: Tuple[float, float], centre: Tuple[float, float], angle_rad: float) -> Tuple[float, float]:
    """Rotate a point around a centre by an angle in radians."""
    px, py = point
    cx, cy = centre
    s, c = math.sin(angle_rad), math.cos(angle_rad)
    dx, dy = px - cx, py - cy
    rx = c * dx - s * dy + cx
    ry = s * dx + c * dy + cy
    return rx, ry


def _unit_corners(half_w: float, half_h: float) -> np.ndarray:
    """Return local rectangle corners before rotation."""
    return np.array(
        [
            [-half_w, -half_h],
            [half_w, -half_h],
            [half_w, half_h],
            [-half_w, half_h],
        ],
        dtype=np.float32,
    )


def _corners_from_params(params: RoiParams) -> np.ndarray:
    """Compute the four rotated corner positions from ROI parameters."""
    cx, cy = params["cx"], params["cy"]
    w, h = params["w"], params["h"]
    angle_deg = params.get("rotation_deg", 0.0)
    half_w, half_h = w / 2.0, h / 2.0
    corners_local = _unit_corners(half_w, half_h)
    angle_rad = math.radians(angle_deg)
    s, c = math.sin(angle_rad), math.cos(angle_rad)
    rot = np.array([[c, -s], [s, c]], dtype=np.float32)
    rotated = (corners_local @ rot.T) + np.array([cx, cy], dtype=np.float32)
    return rotated


def _rotation_handle(params: RoiParams, offset: float = 30.0) -> Tuple[float, float]:
    """Place a rotation handle centred above the top edge by a fixed pixel offset."""
    angle_rad = math.radians(params.get("rotation_deg", 0.0))
    cx, cy = params["cx"], params["cy"]
    half_h = params["h"] / 2.0
    # Top edge mid-point in local coords (0, -half_h)
    top_mid_local = np.array([0.0, -half_h - offset], dtype=np.float32)
    s, c = math.sin(angle_rad), math.cos(angle_rad)
    rot = np.array([[c, -s], [s, c]], dtype=np.float32)
    x, y = (top_mid_local @ rot.T) + np.array([cx, cy], dtype=np.float32)
    return float(x), float(y)


def _put_text_with_outline(
    image: np.ndarray,
    text: str,
    origin: Tuple[int, int],
    font_scale: float = 0.8,
    text_colour: Tuple[int, int, int] = (255, 255, 255),
    thickness: int = 2,
    outline_colour: Tuple[int, int, int] = (0, 0, 0),
) -> None:
    """Draw readable text on busy backgrounds by adding an outline."""
    font = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(image, text, origin, font, font_scale, outline_colour, thickness + 2, cv2.LINE_AA)
    cv2.putText(image, text, origin, font, font_scale, text_colour, thickness, cv2.LINE_AA)


class _InteractionState:
    def __init__(self) -> None:
        self.mode: str = "idle"  # idle | move | scale_corner | rotate
        self.corner_index: int = -1
        self.start_mouse: Tuple[int, int] = (0, 0)
        self.start_params: Optional[RoiParams] = None
        self.start_vector: Optional[Tuple[float, float]] = None


class InteractiveRoiSelector:
    """Interactive rectangular ROI selector with drag-and-drop controls."""
    
    def __init__(self, image: np.ndarray, initial: Optional[RoiParams] = None) -> None:
        if image is None or image.size == 0:
            raise ValueError("Image is empty or failed to load")
        self.image = image
        h, w = image.shape[:2]
        if initial is None:
            size = min(w, h) * 0.5
            initial = {
                "cx": w / 2.0,
                "cy": h / 2.0,
                "w": size * 0.8,
                "h": size * 0.6,
                "rotation_deg": 0.0,
                "scale": 1.0,
            }
        else:
            initial = {**initial}
            initial.setdefault("rotation_deg", 0.0)
            initial.setdefault("scale", 1.0)
        self.params: RoiParams = initial
        self.state = _InteractionState()
        self.window_name = "ROI selector (q=quit, s=save)"
        self.info_extra: str = ""  # additional HUD line for debug
        # Handle radii for interactive elements
        self.handle_radius_centre = 16
        self.handle_radius_corner = 16
        self.handle_radius_rotation = 10
        # Height in pixels for header band above the image
        self.hud_height = 80

    def _draw(self) -> np.ndarray:
        """Draw the current ROI state with handles and HUD."""
        out = self.image.copy()
        corners = _corners_from_params(self.params).astype(int)
        
        # Draw the ROI rectangle with contrast outline
        colour = (40, 235, 40)  # vivid green
        cv2.polylines(out, [corners], isClosed=True, color=(0, 0, 0), thickness=6)
        cv2.polylines(out, [corners], isClosed=True, color=colour, thickness=4)

        # Draw centre and corner handles
        centre = (int(self.params["cx"]), int(self.params["cy"]))
        # Centre: blue with white outline
        cv2.circle(out, centre, self.handle_radius_centre + 2, (255, 255, 255), -1)
        cv2.circle(out, centre, self.handle_radius_centre, (0, 102, 255), -1)
        for pt in corners:
            # Corners: yellow with black outline
            cv2.circle(out, tuple(pt), self.handle_radius_corner + 2, (0, 0, 0), -1)
            cv2.circle(out, tuple(pt), self.handle_radius_corner, (0, 215, 255), -1)
            
        # Rotation handle and guide
        rhx, rhy = _rotation_handle(self.params)
        # Rotation: red with white outline
        cv2.circle(out, (int(rhx), int(rhy)), self.handle_radius_rotation + 2, (255, 255, 255), -1)
        cv2.circle(out, (int(rhx), int(rhy)), self.handle_radius_rotation, (0, 0, 255), -1)
        # Line from top edge mid to rotation handle
        angle_rad = math.radians(self.params.get("rotation_deg", 0.0))
        half_h = self.params["h"] / 2.0
        top_mid = _rotate_point((self.params["cx"], self.params["cy"] - half_h), (self.params["cx"], self.params["cy"]), angle_rad)
        cv2.line(out, (int(top_mid[0]), int(top_mid[1])), (int(rhx), int(rhy)), (255, 255, 255), 2, cv2.LINE_AA)

        # Labels near handles
        _put_text_with_outline(out, "Centre", (centre[0] + 10, centre[1] - 10), font_scale=0.7)
        for i, pt in enumerate(corners):
            _put_text_with_outline(out, f"C{i+1}", (int(pt[0]) + 8, int(pt[1]) - 8), font_scale=0.7)

        # Compose canvas with header above image for HUD text
        h, w = out.shape[:2]
        canvas = np.zeros((h + self.hud_height, w, 3), dtype=out.dtype)
        # Copy image into canvas below the header
        canvas[self.hud_height : self.hud_height + h, 0:w] = out
        # Header background and separator line
        cv2.rectangle(canvas, (0, 0), (w, self.hud_height), (28, 28, 28), -1)
        cv2.line(canvas, (0, self.hud_height - 1), (w, self.hud_height - 1), (90, 90, 90), 1)
        
        # HUD text in header
        info = (
            f"cx={self.params['cx']:.1f}  cy={self.params['cy']:.1f}  "
            f"w={self.params['w']:.1f}  h={self.params['h']:.1f}  "
            f"rot={self.params['rotation_deg']:.1f}°"
        )
        _put_text_with_outline(canvas, info, (12, 22), font_scale=0.7)
        if self.info_extra:
            _put_text_with_outline(canvas, self.info_extra, (12, 44), font_scale=0.7)
        _put_text_with_outline(
            canvas,
            "Drag: centre/corners | Red handle: rotate | s: save | q: quit",
            (12, 66),
            font_scale=0.7,
        )
        return canvas

    def _hit_test(self, x: int, y: int) -> Tuple[str, int]:
        """Returns (mode, corner_index) where corner_index is 0..3 for scale, -1 otherwise."""
        centre = np.array([self.params["cx"], self.params["cy"]])
        if np.linalg.norm(np.array([x, y]) - centre) <= self.handle_radius_centre * 1.5:
            return "move", -1
        # Corners
        corners = _corners_from_params(self.params)
        for i, pt in enumerate(corners):
            if np.linalg.norm(np.array([x, y]) - pt) <= self.handle_radius_corner * 1.5:
                return "scale_corner", i
        # Rotation handle
        rhx, rhy = _rotation_handle(self.params)
        if math.hypot(x - rhx, y - rhy) <= self.handle_radius_rotation * 1.5:
            return "rotate", -1
        return "idle", -1

    def _on_mouse(self, event, x, y, flags, userdata):  # noqa: N802
        """Handle mouse events for interactive ROI manipulation."""
        # Translate window coordinates to image coordinates by removing header offset
        y_img = y - self.hud_height
        if event == cv2.EVENT_LBUTTONDOWN:
            if y_img < 0:
                return  # clicks on the header are ignored
            mode, corner_index = self._hit_test(x, y_img)
            self.state.mode = mode
            self.state.corner_index = corner_index
            self.state.start_mouse = (x, y_img)
            self.state.start_params = dict(self.params)
            if mode == "rotate":
                cx, cy = self.params["cx"], self.params["cy"]
                self.state.start_vector = (x - cx, y_img - cy)
        elif event == cv2.EVENT_MOUSEMOVE and self.state.mode != "idle":
            if y_img < 0:
                return  # ignore drags within the header area
            if self.state.start_params is None:
                return
            start = self.state.start_params
            dx = x - self.state.start_mouse[0]
            dy = y_img - self.state.start_mouse[1]
            if self.state.mode == "move":
                self.params["cx"] = start["cx"] + dx
                self.params["cy"] = start["cy"] + dy
            elif self.state.mode == "scale_corner":
                # Convert mouse to local coords relative to centre
                angle_rad = math.radians(start.get("rotation_deg", 0.0))
                s, c = math.sin(-angle_rad), math.cos(-angle_rad)
                mx, my = x - start["cx"], y_img - start["cy"]
                lx = c * mx - s * my
                ly = s * mx + c * my
                half_w, half_h = abs(lx), abs(ly)
                self.params["w"] = max(20.0, half_w * 2.0)
                self.params["h"] = max(20.0, half_h * 2.0)
            elif self.state.mode == "rotate":
                cx, cy = start["cx"], start["cy"]
                vx0, vy0 = self.state.start_vector if self.state.start_vector else (1.0, 0.0)
                vx1, vy1 = x - cx, y_img - cy
                a0 = math.atan2(vy0, vx0)
                a1 = math.atan2(vy1, vx1)
                delta = math.degrees(a1 - a0)
                self.params["rotation_deg"] = (start.get("rotation_deg", 0.0) + delta) % 360.0
        elif event == cv2.EVENT_LBUTTONUP:
            self.state.mode = "idle"

    def run(self) -> RoiParams:
        """Run the interactive selector until user saves or quits."""
        cv2.namedWindow(self.window_name, cv2.WINDOW_AUTOSIZE)
        cv2.setMouseCallback(self.window_name, self._on_mouse)
        while True:
            frame = self._draw()
            cv2.imshow(self.window_name, frame)
            key = cv2.waitKey(16) & 0xFF
            if key in (ord("q"), 27):
                break
            if key == ord("s"):
                # Feedback flash
                flash = frame.copy()
                cv2.rectangle(flash, (0, 0), (flash.shape[1], flash.shape[0]), (0, 255, 0), 20)
                cv2.imshow(self.window_name, flash)
                cv2.waitKey(150)
                break
        cv2.destroyWindow(self.window_name)
        return dict(self.params)


def load_image(path: str) -> np.ndarray:
    """Robust loading for unicode paths."""
    data = np.fromfile(path, dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def define_roi_interactive(
    image_path: str,
    output_path: Optional[str] = None,
    initial_json: Optional[str] = None,
) -> RoiParams:
    """Run interactive ROI selector and save roi.json. Compatible with vault_geometry2d pipeline."""
    initial: Optional[RoiParams] = None
    unstretched_path: Optional[str] = None
    sy = 1.0
    
    if initial_json and os.path.exists(initial_json):
        with open(initial_json, "r", encoding="utf-8") as f:
            loaded = json.load(f)
            # Support both legacy format (raw params) and new wrapped format {image_path, output_path, params}
            if isinstance(loaded, dict) and "params" in loaded and isinstance(loaded["params"], dict):
                initial = loaded["params"]
                # Prefer unstretched image if present
                img_meta = loaded.get("image_path_unstretched") or loaded.get("image_path") or image_path
                roi_dir = Path(initial_json).parent
                unstretched_path, sy = prepare_unstretched_image(str(img_meta), str(roi_dir))
                print(f"[Step01] Using unstretched from initial: sy={sy:.6f}")
            else:
                initial = loaded
    
    if unstretched_path is None:
        # No initial roi.json or it didn't specify; prepare next to output or image dir
        target_dir = Path(output_path).parent if output_path else Path(image_path).parent
        # Show original anisotropy before correction (debug)
        f = compute_anisotropy_factors(str(image_path))
        if f:
            _sx, _sy, aniso = f
            print(f"[Step01] Original anisotropy (r_world/r_img) = {aniso:.6f}")
        unstretched_path, sy = prepare_unstretched_image(str(image_path), str(target_dir))
        print(f"[Step01] Using unstretched image: sy={sy:.6f}")
    
    image = load_image(unstretched_path)
    if image is None:
        raise ValueError(f"Failed to load image: {unstretched_path}")

    # Visual debug: annotate image info
    try:
        H, W = image.shape[:2]
        aspect = W / H
        info_extra = f"img: {Path(unstretched_path).name}  {W}x{H}  aspect={aspect:.4f}"
    except Exception:
        info_extra = f"img: {Path(unstretched_path).name}"
    
    selector = InteractiveRoiSelector(image, initial)
    selector.info_extra = info_extra
    params = selector.run()
    
    # Derive aspect metrics and persist so later steps don't need to recompute
    image_ratio = None
    world_ratio = None
    anisotropy_val = None
    suggestions = None
    try:
        f2 = compute_anisotropy_factors(str(image_path))
        if f2:
            _sx2, _sy2, aniso2 = f2
            anisotropy_val = float(aniso2)
            orig = load_image(str(image_path))
            if orig is not None:
                r_img = orig.shape[1] / orig.shape[0]
                image_ratio = float(r_img)
                world_ratio = float(anisotropy_val * r_img)
                suggestions = suggest_ratio_patterns(world_ratio)
    except Exception:
        pass

    saved_config = {
        "image_path": str(Path(image_path).resolve()),
        "image_path_unstretched": str(Path(unstretched_path).resolve()) if unstretched_path else None,
        "unstretch_sy": sy,
        "image_ratio": image_ratio,
        "world_ratio": world_ratio,
        "anisotropy": anisotropy_val,
        "world_ratio_suggestions": suggestions,
        "output_path": str(Path(output_path).resolve()) if output_path else None,
        "params": params,
        "source": "vault_geometry2d.step01_roi",
    }

    if output_path:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(saved_config, f, indent=2)
        print(f"Wrote ROI to {output_path}")

    return params


def run_step01(
    image_path: str | Path,
    out_path: str | Path,
    initial_path: str | Path | None = None,
) -> None:
    """Interactive ROI selection. Writes roi.json to out_path."""
    define_roi_interactive(str(image_path), str(out_path), str(initial_path) if initial_path else None)


if __name__ == "__main__":
    import sys
    argv = sys.argv[1:]
    if len(argv) < 2:
        print("Usage: step01_roi.py <image_path> <out_path> [initial_roi.json]")
        sys.exit(1)
    run_step01(argv[0], argv[1], argv[2] if len(argv) > 2 else None)
    print("Done.")
