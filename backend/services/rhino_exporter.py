"""
Service for exporting and importing Rhino 3DM files.
Handles conversion of intrados lines to/from .3dm format.
"""

import json
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import numpy as np

try:
    import rhino3dm
    RHINO3DM_AVAILABLE = True
except ImportError:
    RHINO3DM_AVAILABLE = False
    print("Warning: rhino3dm not installed. 3DM export/import will not be available.")


def export_intrados_to_3dm(
    intrados_lines: List[Dict[str, Any]],
    output_path: str,
    layer_name: str = "Intrados Lines"
) -> Dict[str, Any]:
    """
    Export intrados lines to a Rhino 3DM file.
    
    Args:
        intrados_lines: List of intrados line data, each with 'points' array
        output_path: Path to save the .3dm file
        layer_name: Name for the layer containing the curves
        
    Returns:
        Dict with success status and info
    """
    if not RHINO3DM_AVAILABLE:
        return {
            "success": False,
            "error": "rhino3dm library not installed. Run: pip install rhino3dm"
        }
    
    try:
        # Create a new 3dm file
        model = rhino3dm.File3dm()
        
        # Add a layer for intrados lines
        layer = rhino3dm.Layer()
        layer.Name = layer_name
        layer.Color = (255, 100, 50, 255)  # Orange-ish color
        layer_index = model.Layers.Add(layer)
        
        curves_added = 0
        
        for idx, line_data in enumerate(intrados_lines):
            points = line_data.get("points", [])
            if len(points) < 2:
                continue
            
            # Create a polyline from points
            polyline = rhino3dm.Polyline(len(points))
            for pt in points:
                # Handle both [x, y, z] array format and {x, y, z} dict format
                if isinstance(pt, dict):
                    x, y, z = pt.get("x", 0), pt.get("y", 0), pt.get("z", 0)
                else:
                    x, y, z = pt[0], pt[1], pt[2] if len(pt) > 2 else 0
                polyline.Add(x, y, z)
            
            # Create a curve from the polyline
            curve = rhino3dm.PolylineCurve(polyline)
            
            # Set object attributes
            attributes = rhino3dm.ObjectAttributes()
            attributes.LayerIndex = layer_index
            attributes.Name = line_data.get("maskLabel", f"intrados_{idx}")
            
            # Add to model
            model.Objects.AddCurve(curve, attributes)
            curves_added += 1
        
        # Write to file
        model.Write(output_path, version=7)  # Version 7 for wide compatibility
        
        return {
            "success": True,
            "path": output_path,
            "curvesExported": curves_added,
            "message": f"Exported {curves_added} intrados curves to {output_path}"
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def import_3dm_curves(
    file_path: str,
    layer_filter: Optional[str] = None
) -> Dict[str, Any]:
    """
    Import curves from a Rhino 3DM file.
    
    Args:
        file_path: Path to the .3dm file
        layer_filter: Optional layer name to filter curves (case-insensitive)
        
    Returns:
        Dict with success status and imported curve data
    """
    if not RHINO3DM_AVAILABLE:
        return {
            "success": False,
            "error": "rhino3dm library not installed. Run: pip install rhino3dm"
        }
    
    try:
        # Read the 3dm file
        model = rhino3dm.File3dm.Read(file_path)
        
        if model is None:
            return {
                "success": False,
                "error": f"Could not read 3DM file: {file_path}"
            }
        
        # Build layer lookup
        layer_names = {}
        for i, layer in enumerate(model.Layers):
            layer_names[i] = layer.Name
        
        curves = []
        
        for obj in model.Objects:
            geometry = obj.Geometry
            
            # Check if it's a curve
            if not isinstance(geometry, (rhino3dm.Curve, rhino3dm.PolylineCurve, rhino3dm.NurbsCurve)):
                continue
            
            # Get layer name
            layer_idx = obj.Attributes.LayerIndex
            obj_layer = layer_names.get(layer_idx, "Default")
            
            # Apply layer filter if specified
            if layer_filter and layer_filter.lower() not in obj_layer.lower():
                continue
            
            # Extract points from curve
            points = []
            
            # Try to get as polyline first
            is_polyline, polyline = geometry.TryGetPolyline()
            
            if is_polyline and polyline:
                for i in range(polyline.Count):
                    pt = polyline[i]
                    points.append([pt.X, pt.Y, pt.Z])
            else:
                # Sample the curve at regular intervals
                domain = geometry.Domain
                num_samples = max(50, int(geometry.GetLength() / 0.1))
                for i in range(num_samples + 1):
                    t = domain.T0 + (domain.T1 - domain.T0) * (i / num_samples)
                    pt = geometry.PointAt(t)
                    points.append([pt.X, pt.Y, pt.Z])
            
            if len(points) >= 2:
                curves.append({
                    "id": f"imported_{len(curves)}",
                    "name": obj.Attributes.Name or f"curve_{len(curves)}",
                    "layer": obj_layer,
                    "points": points,
                    "pointCount": len(points),
                    "source": "imported"
                })
        
        return {
            "success": True,
            "curves": curves,
            "curveCount": len(curves),
            "layers": list(set(layer_names.values())),
            "message": f"Imported {len(curves)} curves from {file_path}"
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def get_3dm_info(file_path: str) -> Dict[str, Any]:
    """
    Get information about a 3DM file without fully importing all geometry.
    
    Args:
        file_path: Path to the .3dm file
        
    Returns:
        Dict with file info
    """
    if not RHINO3DM_AVAILABLE:
        return {
            "success": False,
            "error": "rhino3dm library not installed"
        }
    
    try:
        model = rhino3dm.File3dm.Read(file_path)
        
        if model is None:
            return {
                "success": False,
                "error": f"Could not read 3DM file: {file_path}"
            }
        
        # Count object types
        curve_count = 0
        point_count = 0
        mesh_count = 0
        other_count = 0
        
        for obj in model.Objects:
            geom = obj.Geometry
            if isinstance(geom, (rhino3dm.Curve, rhino3dm.PolylineCurve, rhino3dm.NurbsCurve)):
                curve_count += 1
            elif isinstance(geom, rhino3dm.Point):
                point_count += 1
            elif isinstance(geom, rhino3dm.Mesh):
                mesh_count += 1
            else:
                other_count += 1
        
        # Get layers
        layers = [layer.Name for layer in model.Layers]
        
        return {
            "success": True,
            "layers": layers,
            "objectCounts": {
                "curves": curve_count,
                "points": point_count,
                "meshes": mesh_count,
                "other": other_count,
                "total": len(model.Objects)
            },
            "settings": {
                "units": str(model.Settings.ModelUnitSystem),
            }
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
