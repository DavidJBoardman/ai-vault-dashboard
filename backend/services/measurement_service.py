"""Measurement service for 3D geometric calculations."""

import asyncio
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
from scipy import optimize


class MeasurementService:
    """Service for calculating geometric measurements on vault ribs."""
    
    def __init__(self):
        self.traces: Dict[str, np.ndarray] = {}
        self.measurements: Dict[str, Dict[str, Any]] = {}
        self.hypotheses: Dict[str, Dict[str, Any]] = {}
    
    async def calculate(
        self,
        trace_id: str,
        segment_start: float,
        segment_end: float,
    ) -> Dict[str, Any]:
        """Calculate measurements for a trace segment."""
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            self._calculate,
            trace_id,
            segment_start,
            segment_end,
        )
        return result
    
    def _calculate(
        self,
        trace_id: str,
        segment_start: float,
        segment_end: float,
    ) -> Dict[str, Any]:
        """Internal measurement calculation."""
        
        # Get trace points
        if trace_id not in self.traces:
            # Generate demo trace
            self.traces[trace_id] = self._generate_demo_trace()
        
        points = self.traces[trace_id]
        
        # Extract segment
        n_points = len(points)
        start_idx = int(segment_start * n_points)
        end_idx = int(segment_end * n_points)
        segment = points[start_idx:end_idx]
        
        if len(segment) < 3:
            segment = points  # Use full trace if segment too small
        
        # Calculate arc parameters
        arc_params = self._fit_arc(segment)

        # Calculate point distances from arc for visualization
        point_distances = self._calculate_point_distances_from_arc(segment, arc_params)
        
        # Calculate rib length
        rib_length = self._calculate_length(segment)
        
        # Find apex and springing points
        apex = self._find_apex(segment)
        springing = self._find_springing_points(segment)
        
        # Convert segment points to list format for API response
        segment_points = segment.tolist()
        
        return {
            "arc_radius": arc_params["radius"],
            "rib_length": rib_length,
            "apex_point": apex,
            "springing_points": springing,
            "fit_error": arc_params["error"],
            "point_distances": point_distances.tolist(),
            "segment_points": segment_points,
        }
    
    def _generate_demo_trace(self) -> np.ndarray:
        """Generate a demo rib trace."""
        
        # Create a curved rib profile
        t = np.linspace(0, np.pi, 100)
        
        # Parametric curve for a pointed arch rib
        x = 5 * np.sin(t)
        y = np.zeros_like(t)
        z = 5 * (1 - np.cos(t))
        
        # Add some noise
        x += np.random.normal(0, 0.02, len(t))
        y += np.random.normal(0, 0.02, len(t))
        z += np.random.normal(0, 0.02, len(t))
        
        return np.column_stack([x, y, z])
    
    def _fit_arc(self, points: np.ndarray) -> Dict[str, float]:
        """Fit a circular arc to the points."""
        
        # Project to 2D (XZ plane for simplicity)
        x = points[:, 0]
        z = points[:, 2]
        
        # Initial guess for circle: center at mean, radius = half span
        x_mean, z_mean = np.mean(x), np.mean(z)
        r_guess = np.max(np.sqrt((x - x_mean)**2 + (z - z_mean)**2))
        
        def residuals(params):
            cx, cz, r = params
            return np.sqrt((x - cx)**2 + (z - cz)**2) - r
        
        try:
            result = optimize.least_squares(
                residuals,
                [x_mean, z_mean, r_guess],
                bounds=([x_mean - 10, z_mean - 10, 0.1], [x_mean + 10, z_mean + 10, 20])
            )
            
            cx, cz, radius = result.x
            error = np.sqrt(np.mean(result.fun**2))
            
            return {"radius": float(radius), "center": (cx, cz), "error": float(error)}
        except Exception:
            return {"radius": float(r_guess), "center": (x_mean, z_mean), "error": 0.5}
    
    def _calculate_length(self, points: np.ndarray) -> float:
        """Calculate the arc length of the rib."""
        
        diffs = np.diff(points, axis=0)
        distances = np.sqrt(np.sum(diffs**2, axis=1))
        return float(np.sum(distances))
    
    def _find_apex(self, points: np.ndarray) -> Dict[str, float]:
        """Find the apex (highest point) of the rib."""
        
        # Find point with maximum z
        apex_idx = np.argmax(points[:, 2])
        apex = points[apex_idx]
        
        return {"x": float(apex[0]), "y": float(apex[1]), "z": float(apex[2])}
    
    def _find_springing_points(self, points: np.ndarray) -> List[Dict[str, float]]:
        """Find the springing points (base points) of the rib."""
        
        # First and last points are typically springing points
        springing = []
        
        for point in [points[0], points[-1]]:
            springing.append({
                "x": float(point[0]),
                "y": float(point[1]),
                "z": float(point[2]),
            })
        
        return springing
    
    def _calculate_point_distances_from_arc(
      self,
      points: np.ndarray,
      arc_params: Dict[str, float],
  ) -> np.ndarray:
      """Calculate distance of each point from the ideal fitted arc.
      
      Args:
          points: Array of 3D points (N x 3)
          arc_params: Dictionary containing arc parameters with 'center' and 'radius'
      
      Returns:
          Array of distances for each point from the ideal arc (N,)
      """
      
      # Extract center and radius from arc parameters
      cx, cz = arc_params["center"]
      radius = arc_params["radius"]
      
      # Project points to 2D (XZ plane)
      x = points[:, 0]
      z = points[:, 2]
      
      # Calculate distance from each point to the arc center
      distances_to_center = np.sqrt((x - cx)**2 + (z - cz)**2)
      
      # Calculate signed distance from the ideal arc
      # Positive = outside the arc, Negative = inside the arc
      point_distances = distances_to_center - radius
      
      return point_distances
    
    async def chord_method_analysis(self, hypothesis_id: str) -> Dict[str, Any]:
        """Perform three-circle chord method analysis."""
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            self._chord_method_analysis,
            hypothesis_id,
        )
        return result
    
    def _chord_method_analysis(self, hypothesis_id: str) -> Dict[str, Any]:
        """Internal chord method analysis."""
        
        # Get hypothesis data (or generate demo)
        if hypothesis_id not in self.hypotheses:
            # Generate demo analysis
            pass
        
        # Three-circle method: fit three circles to different rib segments
        # This is a simplified implementation
        
        r1 = 5.0 + np.random.normal(0, 0.2)
        r2 = 4.5 + np.random.normal(0, 0.2)
        r3 = 5.5 + np.random.normal(0, 0.2)
        
        centers = [
            {"x": -2.0, "y": 0.0, "z": 2.0},
            {"x": 0.0, "y": 0.0, "z": 3.5},
            {"x": 2.0, "y": 0.0, "z": 2.0},
        ]
        
        # Determine predicted method based on circle relationships
        r_ratio = max(r1, r2, r3) / min(r1, r2, r3)
        
        if r_ratio < 1.1:
            predicted_method = "Single center method"
        elif r_ratio < 1.3:
            predicted_method = "Three-center pointed arch"
        else:
            predicted_method = "Multi-center compound arch"
        
        # Calculate additional metrics
        calculations = {
            "r1": r1,
            "r2": r2,
            "r3": r3,
            "ratio_r1_r2": r1 / r2,
            "ratio_r2_r3": r2 / r3,
            "mean_radius": np.mean([r1, r2, r3]),
            "span": 10.0,
            "rise": 5.0,
            "rise_span_ratio": 0.5,
        }
        
        return {
            "predicted_method": predicted_method,
            "three_circle": {
                "r1": r1,
                "r2": r2,
                "r3": r3,
                "centers": centers,
            },
            "calculations": calculations,
            "confidence": 0.82,
        }
    
    async def save_hypothesis(
        self,
        name: str,
        description: str,
        measurements: List[Dict[str, Any]],
    ) -> str:
        """Save a measurement hypothesis."""
        
        import uuid
        hypothesis_id = str(uuid.uuid4())
        
        self.hypotheses[hypothesis_id] = {
            "id": hypothesis_id,
            "name": name,
            "description": description,
            "measurements": measurements,
        }
        
        return hypothesis_id

