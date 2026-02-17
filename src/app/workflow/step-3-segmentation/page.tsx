"use client";

import { useState, useMemo, useEffect, KeyboardEvent, useRef, MouseEvent, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProjectStore } from "@/lib/store";
import { 
  runSegmentation, 
  checkSamStatus, 
  SegmentationMask,
  BoxPrompt,
  saveProject,
  saveROI,
  ROIData,
  saveProgress
} from "@/lib/api";
import { 
  ChevronLeft, 
  ChevronRight, 
  Wand2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  Check,
  Server,
  Plus,
  X,
  Type,
  Trash2,
  Scan,
  GripVertical,
  Edit2,
  Hexagon,
  Square,
  Move,
  Maximize2,
  RotateCw,
  Scissors
} from "lucide-react";
import { cn, toImageSrc } from "@/lib/utils";

// Image type for viewing projections
type ImageViewType = "colour" | "depthGrayscale" | "depthPlasma";
type Tool = "polygon" | "box" | "roi";

// ROI state interface
interface ROIState {
  x: number;      // Center X (0-1 normalized)
  y: number;      // Center Y (0-1 normalized)
  width: number;  // Width (0-1 normalized)
  height: number; // Height (0-1 normalized)
  rotation: number; // Degrees
}

// ROI interaction mode
type ROIInteractionMode = "none" | "drawing" | "moving" | "resizing" | "rotating";

// Drawn box for prompting
interface DrawnBox {
  id: string;
  coords: [number, number, number, number]; // [x1, y1, x2, y2] in image pixels
  label: 0 | 1; // 1 = positive, 0 = negative
  name?: string; // Optional name for the selection
}

// Box interaction mode
type BoxInteractionMode = "draw" | "move" | null;

// Polygon point
interface PolygonPoint {
  x: number;
  y: number;
}

// Drawn polygon for prompting
interface DrawnPolygon {
  id: string;
  points: PolygonPoint[]; // Array of points in image pixels
  label: 0 | 1;
  name?: string;
  closed: boolean; // Whether the polygon is closed/complete
}

export default function Step3SegmentationPage() {
  const router = useRouter();
  const { 
    currentProject, 
    setSegmentations, 
    completeStep 
  } = useProjectStore();
  
  // SAM 3 status (informational only)
  const [samStatus, setSamStatus] = useState<{
    available: boolean;
    loaded: boolean;
  }>({ available: false, loaded: false });
  
  // Selected projection
  const [selectedProjectionId, setSelectedProjectionId] = useState<string | null>(
    currentProject?.projections?.[0]?.id || null
  );
  const [selectedImageType, setSelectedImageType] = useState<ImageViewType>("colour");
  
  // Tools
  const [activeTool, setActiveTool] = useState<Tool>("polygon");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  
  // Text prompts for guided segmentation
  const [textPrompts, setTextPrompts] = useState<string[]>([]);
  const [newPrompt, setNewPrompt] = useState("");
  
  // Segmentation state
  const [masks, setMasks] = useState<SegmentationMask[]>([]);
  const [overlayOpacity, setOverlayOpacity] = useState(0.8);
  
  // Box drawing state
  const [drawnBoxes, setDrawnBoxes] = useState<DrawnBox[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  
  // Box interaction state (for moving existing boxes)
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [boxInteractionMode, setBoxInteractionMode] = useState<BoxInteractionMode>(null);
  const [interactionStart, setInteractionStart] = useState<{ x: number; y: number; box: DrawnBox } | null>(null);
  
  // Polygon drawing state
  const [drawnPolygons, setDrawnPolygons] = useState<DrawnPolygon[]>([]);
  const [currentPolygon, setCurrentPolygon] = useState<PolygonPoint[]>([]);
  const [polygonName, setPolygonName] = useState<string>("");
  
  // ROI state
  const [roi, setRoi] = useState<ROIState>({
    x: 0.5,
    y: 0.5,
    width: 0.6,
    height: 0.6,
    rotation: 0,
  });
  const [showROI, setShowROI] = useState(false);
  const [roiInteractionMode, setRoiInteractionMode] = useState<ROIInteractionMode>("none");
  const [roiDragStart, setRoiDragStart] = useState<{ x: number; y: number; roi: ROIState } | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [isApplyingROI, setIsApplyingROI] = useState(false);
  
  // Box naming dialog state
  const [boxNamingDialog, setBoxNamingDialog] = useState<{
    open: boolean;
    boxId: string | null;
    tempName: string;
  }>({ open: false, boxId: null, tempName: "" });
  
  // Mask editing state
  const [editingMaskId, setEditingMaskId] = useState<string | null>(null);
  const [editingMaskName, setEditingMaskName] = useState("");
  
  // Drag and drop state
  const [draggingMaskId, setDraggingMaskId] = useState<string | null>(null);
  const [dropTargetGroup, setDropTargetGroup] = useState<string | null>(null);
  
  // Get selected projection
  const selectedProjection = useMemo(() => {
    if (!selectedProjectionId || !currentProject?.projections) return null;
    return currentProject.projections.find(p => p.id === selectedProjectionId) || null;
  }, [selectedProjectionId, currentProject?.projections]);
  
  // Get current image based on type
  const currentImage = useMemo(() => {
    if (!selectedProjection?.images) return null;
    return selectedProjection.images[selectedImageType] || selectedProjection.images.colour;
  }, [selectedProjection, selectedImageType]);
  
  // Check SAM 3 status on mount
  useEffect(() => {
    const checkStatus = async () => {
      const response = await checkSamStatus();
      if (response.success && response.data) {
        setSamStatus({
          available: response.data.available,
          loaded: response.data.loaded,
        });
      }
    };
    checkStatus();
  }, []);
  
  // Load existing segmentations from store when project is loaded
  useEffect(() => {
    if (currentProject?.segmentations && currentProject.segmentations.length > 0 && masks.length === 0) {
      // Convert store segmentations to SegmentationMask format
      const loadedMasks: SegmentationMask[] = currentProject.segmentations.map((seg) => ({
        id: seg.id,
        label: seg.label,
        color: seg.color,
        maskBase64: seg.mask, // Store uses 'mask', component uses 'maskBase64'
        visible: seg.visible,
        bbox: seg.bbox || [0, 0, 100, 100],
        area: seg.area || 0,
      }));
      setMasks(loadedMasks);
    }
  }, [currentProject?.segmentations, masks.length]);
  
  const handleAddPrompt = () => {
    const trimmed = newPrompt.trim();
    if (trimmed && !textPrompts.includes(trimmed)) {
      setTextPrompts(prev => [...prev, trimmed]);
      setNewPrompt("");
    }
  };
  
  const handleRemovePrompt = (prompt: string) => {
    setTextPrompts(prev => prev.filter(p => p !== prompt));
  };
  
  const handlePromptKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddPrompt();
    }
  };
  
  // Box drawing handlers - simplified coordinate calculation
  const getImageCoordinates = (e: MouseEvent<HTMLDivElement>): { x: number; y: number } | null => {
    if (!imageContainerRef.current) {
      console.log("No container ref");
      return null;
    }
    
    const rect = imageContainerRef.current.getBoundingClientRect();
    
    // Get position relative to container (0-1 range)
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    
    // Clamp to 0-1 range
    const clampedX = Math.max(0, Math.min(1, relX));
    const clampedY = Math.max(0, Math.min(1, relY));
    
    // Convert to image pixel coordinates
    const imgW = imageSize?.width || selectedProjection?.settings?.resolution || 2048;
    const imgH = imageSize?.height || selectedProjection?.settings?.resolution || 2048;
    
    const x = Math.round(clampedX * imgW);
    const y = Math.round(clampedY * imgH);
    
    return { x, y };
  };
  
  // Check if a point is inside a box
  const isPointInBox = (px: number, py: number, box: DrawnBox): boolean => {
    return px >= box.coords[0] && px <= box.coords[2] &&
           py >= box.coords[1] && py <= box.coords[3];
  };
  
  // Check if clicking near a polygon point (to remove it)
  const findNearbyPolygonPoint = (px: number, py: number, points: PolygonPoint[]): number => {
    const threshold = 15; // pixels
    for (let i = 0; i < points.length; i++) {
      const dist = Math.sqrt((px - points[i].x) ** 2 + (py - points[i].y) ** 2);
      if (dist < threshold) {
        return i;
      }
    }
    return -1;
  };

  // Handle click for polygon tool
  const handlePolygonClick = (e: MouseEvent<HTMLDivElement>) => {
    if (activeTool !== "polygon" || !selectedProjection) return;
    
    e.preventDefault();
    const coords = getImageCoordinates(e);
    if (!coords) return;
    
    // Check if clicking near an existing point to remove it
    const nearbyIdx = findNearbyPolygonPoint(coords.x, coords.y, currentPolygon);
    if (nearbyIdx >= 0) {
      // Remove the point
      setCurrentPolygon(prev => prev.filter((_, i) => i !== nearbyIdx));
      return;
    }
    
    // Add new point
    setCurrentPolygon(prev => [...prev, { x: coords.x, y: coords.y }]);
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    // Handle polygon tool with clicks, not drag
    if (activeTool === "polygon") {
      handlePolygonClick(e);
      return;
    }
    
    // Handle ROI tool
    if (activeTool === "roi") {
      handleROIMouseDown(e);
      return;
    }
    
    // Box tool
    if (activeTool !== "box" || !selectedProjection) {
      return;
    }
    
    e.preventDefault();
    const coords = getImageCoordinates(e);
    if (!coords) return;
    
    // Check if clicking inside any existing box (to move it)
    for (const box of [...drawnBoxes].reverse()) {
      if (isPointInBox(coords.x, coords.y, box)) {
        setSelectedBoxId(box.id);
        setBoxInteractionMode("move");
        setInteractionStart({ x: coords.x, y: coords.y, box: { ...box } });
        return;
      }
    }
    
    // Not clicking on any box - start drawing new one
    setSelectedBoxId(null);
    setBoxInteractionMode("draw");
    setIsDrawing(true);
    setDrawStart(coords);
    setCurrentBox({ x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y });
  };
  
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    // Handle ROI tool
    if (activeTool === "roi" && roiInteractionMode !== "none") {
      handleROIMouseMove(e);
      return;
    }
    
    const coords = getImageCoordinates(e);
    if (!coords) return;
    
    // Handle drawing new box
    if (activeTool === "box" && isDrawing && drawStart && boxInteractionMode === "draw") {
      setCurrentBox({
        x1: Math.min(drawStart.x, coords.x),
        y1: Math.min(drawStart.y, coords.y),
        x2: Math.max(drawStart.x, coords.x),
        y2: Math.max(drawStart.y, coords.y),
      });
      return;
    }
    
    // Handle moving box
    if (activeTool === "box" && boxInteractionMode === "move" && interactionStart && selectedBoxId) {
      const dx = coords.x - interactionStart.x;
      const dy = coords.y - interactionStart.y;
      
      setDrawnBoxes(prev => prev.map(box => {
        if (box.id === selectedBoxId) {
          const origBox = interactionStart.box;
          return {
            ...box,
            coords: [
              origBox.coords[0] + dx,
              origBox.coords[1] + dy,
              origBox.coords[2] + dx,
              origBox.coords[3] + dy,
            ] as [number, number, number, number],
          };
        }
        return box;
      }));
      return;
    }
  };
  
  const handleMouseUp = (e: MouseEvent<HTMLDivElement>) => {
    // Polygon tool doesn't use mouse up for drawing
    if (activeTool === "polygon") return;
    
    // Handle ROI tool
    if (activeTool === "roi") {
      handleROIMouseUp();
      return;
    }
    
    // Handle finishing drawing a new box
    if (isDrawing && currentBox && boxInteractionMode === "draw") {
      const width = Math.abs(currentBox.x2 - currentBox.x1);
      const height = Math.abs(currentBox.y2 - currentBox.y1);
      
      if (width >= 10 && height >= 10) {
        const newBoxId = `box-${Date.now()}`;
        const newBox: DrawnBox = {
          id: newBoxId,
          coords: [currentBox.x1, currentBox.y1, currentBox.x2, currentBox.y2],
          label: 1,
          name: "",
        };
        setDrawnBoxes(prev => [...prev, newBox]);
        setSelectedBoxId(newBoxId);
        
        setBoxNamingDialog({
          open: true,
          boxId: newBoxId,
          tempName: "",
        });
      }
    }
    
    // Reset all interaction state
    setIsDrawing(false);
    setDrawStart(null);
    setCurrentBox(null);
    setBoxInteractionMode(null);
    setInteractionStart(null);
  };
  
  const toggleBoxLabel = (boxId: string) => {
    setDrawnBoxes(prev => 
      prev.map(box => 
        box.id === boxId 
          ? { ...box, label: box.label === 1 ? 0 : 1 } 
          : box
      )
    );
  };
  
  const removeBox = (boxId: string) => {
    setDrawnBoxes(prev => prev.filter(box => box.id !== boxId));
  };
  
  const clearAllBoxes = () => {
    setDrawnBoxes([]);
  };
  
  // Polygon functions
  const saveCurrentPolygon = (name?: string) => {
    if (currentPolygon.length >= 3) {
      const newPolygon: DrawnPolygon = {
        id: `polygon-${Date.now()}`,
        points: [...currentPolygon],
        label: 1,
        name: name || polygonName || undefined,
        closed: true,
      };
      setDrawnPolygons(prev => [...prev, newPolygon]);
      setCurrentPolygon([]);
      setPolygonName("");
    }
  };
  
  const clearCurrentPolygon = () => {
    setCurrentPolygon([]);
  };
  
  const removePolygon = (polygonId: string) => {
    setDrawnPolygons(prev => prev.filter(p => p.id !== polygonId));
  };
  
  const clearAllPolygons = () => {
    setDrawnPolygons([]);
    setCurrentPolygon([]);
  };
  
  // ROI helper functions
  const getROICorners = (roiState: ROIState): [number, number][] => {
    const { x, y, width, height, rotation } = roiState;
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const hw = width / 2;
    const hh = height / 2;
    
    const corners: [number, number][] = [
      [-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]
    ].map(([dx, dy]) => [
      x + dx * cos - dy * sin,
      y + dx * sin + dy * cos
    ]);
    
    return corners;
  };
  
  const isPointInROI = (px: number, py: number, roiState: ROIState): boolean => {
    const { x, y, width, height, rotation } = roiState;
    const rad = (-rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    const dx = px - x;
    const dy = py - y;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    
    return Math.abs(localX) <= width / 2 && Math.abs(localY) <= height / 2;
  };
  
  const isMaskInsideROI = (mask: SegmentationMask): boolean => {
    if (!mask.bbox) return false;
    const resolution = selectedProjection?.settings?.resolution || 2048;
    // bbox is [x, y, w, h] in pixels
    const centerX = (mask.bbox[0] + mask.bbox[2] / 2) / resolution;
    const centerY = (mask.bbox[1] + mask.bbox[3] / 2) / resolution;
    return isPointInROI(centerX, centerY, roi);
  };
  
  // ROI mouse handlers
  const handleROIMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (activeTool !== "roi" || !imageContainerRef.current) return;
    
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    // Check if clicking on resize handles
    const corners = getROICorners(roi);
    const handleSize = 0.02;
    
    for (let i = 0; i < corners.length; i++) {
      const [cx, cy] = corners[i];
      if (Math.abs(x - cx) < handleSize && Math.abs(y - cy) < handleSize) {
        setRoiInteractionMode("resizing");
        setResizeHandle(`corner-${i}`);
        setRoiDragStart({ x, y, roi: { ...roi } });
        return;
      }
    }
    
    // Check if clicking on rotation handle (top center)
    const rad = (roi.rotation * Math.PI) / 180;
    const rotHandleX = roi.x + Math.sin(rad) * (roi.height / 2 + 0.03);
    const rotHandleY = roi.y - Math.cos(rad) * (roi.height / 2 + 0.03);
    if (Math.abs(x - rotHandleX) < handleSize && Math.abs(y - rotHandleY) < handleSize) {
      setRoiInteractionMode("rotating");
      setRoiDragStart({ x, y, roi: { ...roi } });
      return;
    }
    
    // Check if clicking inside ROI (move)
    if (isPointInROI(x, y, roi)) {
      setRoiInteractionMode("moving");
      setRoiDragStart({ x, y, roi: { ...roi } });
      return;
    }
    
    // Start drawing new ROI
    setRoiInteractionMode("drawing");
    setRoiDragStart({ x, y, roi: { x, y, width: 0, height: 0, rotation: 0 } });
    setRoi({ x, y, width: 0.01, height: 0.01, rotation: 0 });
  };
  
  const handleROIMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (activeTool !== "roi" || roiInteractionMode === "none" || !roiDragStart || !imageContainerRef.current) return;
    
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    
    if (roiInteractionMode === "drawing") {
      const newWidth = Math.abs(x - roiDragStart.x);
      const newHeight = Math.abs(y - roiDragStart.y);
      const newX = (x + roiDragStart.x) / 2;
      const newY = (y + roiDragStart.y) / 2;
      setRoi({ x: newX, y: newY, width: newWidth, height: newHeight, rotation: 0 });
    } else if (roiInteractionMode === "moving") {
      const dx = x - roiDragStart.x;
      const dy = y - roiDragStart.y;
      setRoi({
        ...roiDragStart.roi,
        x: Math.max(0, Math.min(1, roiDragStart.roi.x + dx)),
        y: Math.max(0, Math.min(1, roiDragStart.roi.y + dy)),
      });
    } else if (roiInteractionMode === "resizing" && resizeHandle) {
      const handleIdx = parseInt(resizeHandle.split("-")[1]);
      const dx = x - roiDragStart.x;
      const dy = y - roiDragStart.y;
      
      // Simple resize - adjust width/height based on which corner
      const origRoi = roiDragStart.roi;
      let newWidth = origRoi.width;
      let newHeight = origRoi.height;
      let newX = origRoi.x;
      let newY = origRoi.y;
      
      if (handleIdx === 0 || handleIdx === 3) { // Left corners
        newWidth = Math.max(0.05, origRoi.width - dx * 2);
      } else {
        newWidth = Math.max(0.05, origRoi.width + dx * 2);
      }
      
      if (handleIdx === 0 || handleIdx === 1) { // Top corners
        newHeight = Math.max(0.05, origRoi.height - dy * 2);
      } else {
        newHeight = Math.max(0.05, origRoi.height + dy * 2);
      }
      
      setRoi({ ...origRoi, width: newWidth, height: newHeight });
    } else if (roiInteractionMode === "rotating") {
      const angle = Math.atan2(x - roi.x, -(y - roi.y)) * (180 / Math.PI);
      setRoi({ ...roi, rotation: angle });
    }
  };
  
  const handleROIMouseUp = () => {
    if (roiInteractionMode === "drawing" && roi.width > 0.02 && roi.height > 0.02) {
      setShowROI(true);
    }
    setRoiInteractionMode("none");
    setRoiDragStart(null);
    setResizeHandle(null);
  };
  
  // Apply ROI - delete masks outside
  const handleApplyROI = async () => {
    if (!currentProject?.id) return;
    
    setIsApplyingROI(true);
    
    try {
      // Filter masks - keep only those inside ROI
      const masksInside = masks.filter(isMaskInsideROI);
      const masksOutside = masks.filter(m => !isMaskInsideROI(m));
      
      console.log(`Applying ROI: ${masksInside.length} inside, ${masksOutside.length} outside`);
      
      // Update local state
      setMasks(masksInside);
      
      // Save ROI to backend
      const resolution = selectedProjection?.settings?.resolution || 2048;
      const corners = getROICorners(roi);
      
      const roiData: ROIData = {
        x: roi.x * resolution,
        y: roi.y * resolution,
        width: roi.width * resolution,
        height: roi.height * resolution,
        rotation: roi.rotation,
        corners: corners.map(([cx, cy]) => [cx * resolution, cy * resolution]),
      };
      
      await saveROI(currentProject.id, roiData);
      
      // Save the filtered masks to backend
      const storeSegmentations = masksInside.map((m: SegmentationMask) => ({
        id: m.id,
        label: m.label,
        color: m.color,
        mask: m.maskBase64,
        visible: m.visible,
        source: m.source as "auto" | "manual",
        bbox: m.bbox,
        area: m.area,
        insideRoi: true,
      }));
      
      setSegmentations(storeSegmentations);
      
      // Save project with updated segmentations
      await saveProject({
        projectId: currentProject.id,
        projectName: currentProject.name,
        e57Path: currentProject.e57Path,
        projections: currentProject.projections.map(p => ({
          id: p.id,
          perspective: p.settings.perspective,
          resolution: p.settings.resolution,
          sigma: p.settings.sigma,
          kernelSize: p.settings.kernelSize,
          bottomUp: p.settings.bottomUp,
          scale: p.settings.scale,
        })),
        segmentations: storeSegmentations.map(s => ({
          id: s.id,
          label: s.label,
          color: s.color,
          maskBase64: s.mask,
          visible: s.visible,
          source: s.source,
          bbox: s.bbox,
          area: s.area,
        })),
        selectedProjectionId: selectedProjectionId || undefined,
      });
      
      // Save ROI to step 3 data for carrying over to step 4
      completeStep(3, { 
        roi: { x: roi.x, y: roi.y, width: roi.width, height: roi.height, rotation: roi.rotation },
        masksDeleted: masksOutside.length,
        masksRemaining: masksInside.length,
      });
      
      alert(`ROI applied! Kept ${masksInside.length} masks, removed ${masksOutside.length} masks outside ROI.`);
      
    } catch (error) {
      console.error("Error applying ROI:", error);
      alert("Failed to apply ROI");
    } finally {
      setIsApplyingROI(false);
    }
  };
  
  // Save box name from dialog
  const handleSaveBoxName = () => {
    if (boxNamingDialog.boxId) {
      setDrawnBoxes(prev => prev.map(box => 
        box.id === boxNamingDialog.boxId 
          ? { ...box, name: boxNamingDialog.tempName.trim() || undefined }
          : box
      ));
    }
    setBoxNamingDialog({ open: false, boxId: null, tempName: "" });
  };
  
  // Cancel box naming - remove the box
  const handleCancelBoxName = () => {
    if (boxNamingDialog.boxId) {
      setDrawnBoxes(prev => prev.filter(box => box.id !== boxNamingDialog.boxId));
    }
    setBoxNamingDialog({ open: false, boxId: null, tempName: "" });
  };
  
  // Edit mask name
  const startEditingMask = (maskId: string, currentName: string) => {
    setEditingMaskId(maskId);
    setEditingMaskName(currentName);
  };
  
  const saveEditingMask = () => {
    if (editingMaskId && editingMaskName.trim()) {
      setMasks(prev => {
        const updated = prev.map(mask =>
          mask.id === editingMaskId
            ? { ...mask, label: editingMaskName.trim() }
            : mask
        );
        return [...updated];
      });
    }
    setEditingMaskId(null);
    setEditingMaskName("");
  };
  
  const cancelEditingMask = () => {
    setEditingMaskId(null);
    setEditingMaskName("");
  };
  
  // Remove mask - create new array reference to ensure React detects the change
  const removeMask = (maskId: string) => {
    setMasks(prev => {
      const filtered = prev.filter(mask => mask.id !== maskId);
      // Return new array to ensure React detects change
      return [...filtered];
    });
  };
  
  // Remove all masks in a group
  const removeGroup = (groupLabel: string) => {
    setMasks(prev => {
      const filtered = prev.filter(mask => {
        const baseLabel = mask.label.replace(/\s*#?\d+$/, '').trim().toLowerCase();
        return baseLabel !== groupLabel.toLowerCase();
      });
      return [...filtered];
    });
  };
  
  // Keyboard handler for box/polygon interactions
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // Handle polygon tool
      if (activeTool === "polygon") {
        // Escape to clear current polygon
        if (e.key === "Escape" && currentPolygon.length > 0) {
          e.preventDefault();
          setCurrentPolygon([]);
        }
        // Enter to save current polygon (if 3+ points)
        if (e.key === "Enter" && currentPolygon.length >= 3) {
          e.preventDefault();
          saveCurrentPolygon();
        }
        // Backspace to remove last point
        if (e.key === "Backspace" && currentPolygon.length > 0) {
          e.preventDefault();
          setCurrentPolygon(prev => prev.slice(0, -1));
        }
        return;
      }
      
      // Handle box tool
      if (activeTool === "box") {
        // Delete selected box with Delete or Backspace
        if ((e.key === "Delete" || e.key === "Backspace") && selectedBoxId) {
          if (boxNamingDialog.open) return;
          e.preventDefault();
          setDrawnBoxes(prev => prev.filter(box => box.id !== selectedBoxId));
          setSelectedBoxId(null);
        }
        
        // Deselect with Escape
        if (e.key === "Escape" && selectedBoxId) {
          e.preventDefault();
          setSelectedBoxId(null);
        }
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTool, selectedBoxId, boxNamingDialog.open, currentPolygon.length]);
  
  // Drag and drop handlers
  const handleDragStart = (e: DragEvent<HTMLDivElement>, maskId: string) => {
    setDraggingMaskId(maskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", maskId);
  };
  
  const handleDragOver = (e: DragEvent<HTMLDivElement>, groupLabel: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetGroup(groupLabel);
  };
  
  const handleDragLeave = () => {
    setDropTargetGroup(null);
  };
  
  const handleDrop = (e: DragEvent<HTMLDivElement>, targetGroupLabel: string) => {
    e.preventDefault();
    setDropTargetGroup(null);
    
    if (draggingMaskId) {
      // Rename the mask to the target group's label + number
      setMasks(prev => {
        // Count how many masks are already in the target group (excluding the one being dragged)
        const existingInGroup = prev.filter(m => {
          if (m.id === draggingMaskId) return false;
          const baseLabel = m.label.replace(/\s*#?\d+$/, '').trim();
          return baseLabel.toLowerCase() === targetGroupLabel.toLowerCase();
        }).length;
        
        const updated = prev.map(mask => {
          if (mask.id === draggingMaskId) {
            const newNumber = existingInGroup + 1;
            // Find group color
            const groupMask = prev.find(m => {
              if (m.id === draggingMaskId) return false;
              const baseLabel = m.label.replace(/\s*#?\d+$/, '').trim();
              return baseLabel.toLowerCase() === targetGroupLabel.toLowerCase();
            });
            return { 
              ...mask, 
              label: `${targetGroupLabel} #${newNumber}`,
              color: groupMask?.color || mask.color
            };
          }
          return mask;
        });
        return [...updated];
      });
    }
    setDraggingMaskId(null);
  };
  
  const handleDragEnd = () => {
    setDraggingMaskId(null);
    setDropTargetGroup(null);
  };
  
  // Handle image load to get actual dimensions
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
  };
  
  // Set default image size based on projection resolution if not yet loaded
  useEffect(() => {
    if (!imageSize && selectedProjection?.settings?.resolution) {
      const res = selectedProjection.settings.resolution;
      setImageSize({ width: res, height: res });
    }
  }, [selectedProjection, imageSize]);
  
  // Run segmentation with drawn boxes
  const handleBoxSegment = async () => {
    if (!selectedProjection || drawnBoxes.length === 0) return;
    
    setIsProcessing(true);
    setProcessingMessage(`Segmenting with ${drawnBoxes.length} box${drawnBoxes.length > 1 ? "es" : ""}...`);
    
    try {
      const boxPrompts: BoxPrompt[] = drawnBoxes.map(box => ({
        coords: box.coords,
        label: box.label,
      }));
      
      // Get the FIRST box name only - this is what will label the detected objects
      // Don't mix with existing text prompts, as that causes labeling confusion
      const firstBoxName = drawnBoxes.find(box => box.name?.trim())?.name?.trim();
      
      const response = await runSegmentation({
        projectionId: selectedProjection.id,
        mode: firstBoxName ? "combined" : "box",
        boxes: boxPrompts,
        // Only pass the box name, not existing text prompts
        textPrompts: firstBoxName ? [firstBoxName] : undefined,
      });
      
      console.log("Box segmentation response:", response);
      
      const data = response.data as any;
      const isSuccess = response.success && data?.success !== false;
      const newMasks = data?.masks || [];
      
      if (isSuccess) {
        setSamStatus(prev => ({ ...prev, loaded: true }));
        
        if (newMasks.length > 0) {
          // Append to existing masks with proper renumbering, color consistency, and duplicate detection
          // We need to compute the updated masks outside setState to avoid calling store actions during render
          const computeUpdatedMasks = (existingMasks: SegmentationMask[]) => {
            // Track label counts as we renumber
            const labelCounts: Record<string, number> = {};
            // Track colors for each group (for consistency)
            const groupColors: Record<string, string> = {};
            
            // First, count existing masks by base label and collect their colors
            existingMasks.forEach(m => {
              const baseLabel = m.label.replace(/\s*#?\d+$/, '').trim().toLowerCase();
              labelCounts[baseLabel] = (labelCounts[baseLabel] || 0) + 1;
              // Store the first color found for this group
              if (!groupColors[baseLabel]) {
                groupColors[baseLabel] = m.color;
              }
            });
            
            // Helper to calculate bounding box IoU (Intersection over Union)
            const calculateBboxIoU = (bbox1: number[], bbox2: number[]): number => {
              // Both bboxes in [x, y, w, h] format
              const [x1, y1, w1, h1] = bbox1;
              const [x2, y2, w2, h2] = bbox2;
              
              const xA = Math.max(x1, x2);
              const yA = Math.max(y1, y2);
              const xB = Math.min(x1 + w1, x2 + w2);
              const yB = Math.min(y1 + h1, y2 + h2);
              
              const interWidth = Math.max(0, xB - xA);
              const interHeight = Math.max(0, yB - yA);
              const interArea = interWidth * interHeight;
              
              const area1 = w1 * h1;
              const area2 = w2 * h2;
              const unionArea = area1 + area2 - interArea;
              
              return unionArea > 0 ? interArea / unionArea : 0;
            };
            
            // Check if a new mask overlaps significantly with existing masks
            const isDuplicateMask = (newMask: SegmentationMask): boolean => {
              const IOU_THRESHOLD = 0.5; // Consider duplicate if >50% overlap
              
              for (const existingMask of existingMasks) {
                if (existingMask.bbox && newMask.bbox) {
                  const iou = calculateBboxIoU(existingMask.bbox, newMask.bbox);
                  if (iou > IOU_THRESHOLD) {
                    console.log(`Skipping duplicate mask (IoU=${iou.toFixed(2)}): ${newMask.label}`);
                    return true;
                  }
                }
              }
              return false;
            };
            
            // Default color palette for new groups
            const colorPalette = [
              "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF",
              "#00FFFF", "#FF6600", "#9900FF", "#00FF99", "#FF0099",
            ];
            let colorIndex = Object.keys(groupColors).length;
            
            // Filter out duplicates and renumber new masks
            const renumberedMasks = newMasks
              .filter((newMask: SegmentationMask) => !isDuplicateMask(newMask))
              .map((newMask: SegmentationMask) => {
                // Extract base label (e.g., "boss stone" from "boss stone #1")
                const baseLabel = newMask.label.replace(/\s*#?\d+$/, '').trim();
                const baseLabelLower = baseLabel.toLowerCase();
                
                // Increment count for this label
                labelCounts[baseLabelLower] = (labelCounts[baseLabelLower] || 0) + 1;
                const newNumber = labelCounts[baseLabelLower];
                
                // Create new label with proper numbering
                const newLabel = `${baseLabel} #${newNumber}`;
                
                // Get consistent color for this group
                let maskColor = groupColors[baseLabelLower];
                if (!maskColor) {
                  // New group - assign a color from palette
                  maskColor = colorPalette[colorIndex % colorPalette.length];
                  groupColors[baseLabelLower] = maskColor;
                  colorIndex++;
                }
                
                // Generate unique ID to avoid conflicts
                const newId = `mask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                return {
                  ...newMask,
                  id: newId,
                  label: newLabel,
                  color: maskColor, // Use consistent group color
                };
              });
            
            if (renumberedMasks.length < newMasks.length) {
              console.log(`Filtered ${newMasks.length - renumberedMasks.length} duplicate masks`);
            }
            
            return [...existingMasks, ...renumberedMasks];
          };
          
          // Get current masks and compute updated list
          setMasks(prev => {
            const allMasks = computeUpdatedMasks(prev);
            
            // Schedule store update after this render cycle
            setTimeout(() => {
              const storeSegmentations = allMasks.map((m: SegmentationMask) => ({
                id: m.id,
                label: m.label,
                color: m.color,
                mask: m.maskBase64,
                visible: m.visible,
                source: m.source as "auto" | "manual",
              }));
              setSegmentations(storeSegmentations);
            }, 0);
            
            return allMasks;
          });
          
          // Clear boxes after successful segmentation
          setDrawnBoxes([]);
        } else {
          alert("No similar objects found for the selected region(s). Try drawing a box around a more distinct feature.");
        }
      } else {
        const errorMsg = response.error || data?.error;
        alert(`Segmentation failed: ${errorMsg || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Box segmentation error:", error);
    } finally {
      setIsProcessing(false);
      setProcessingMessage("");
    }
  };
  
  // Run segmentation with polygons (converts to bounding boxes for SAM)
  const handlePolygonSegment = async () => {
    if (!selectedProjection || drawnPolygons.length === 0) return;
    
    setIsProcessing(true);
    setProcessingMessage(`Segmenting with ${drawnPolygons.length} polygon${drawnPolygons.length > 1 ? "s" : ""}...`);
    
    try {
      // Convert polygons to bounding boxes for SAM
      const boxPrompts: BoxPrompt[] = drawnPolygons.map(polygon => {
        const xs = polygon.points.map(p => p.x);
        const ys = polygon.points.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        
        return {
          coords: [minX, minY, maxX, maxY] as [number, number, number, number],
          label: polygon.label,
        };
      });
      
      // Get the first polygon name
      const firstName = drawnPolygons.find(p => p.name?.trim())?.name?.trim();
      
      const response = await runSegmentation({
        projectionId: selectedProjection.id,
        mode: firstName ? "combined" : "box",
        boxes: boxPrompts,
        textPrompts: firstName ? [firstName] : undefined,
      });
      
      console.log("Polygon segmentation response:", response);
      
      const data = response.data as any;
      const isSuccess = response.success && data?.success !== false;
      const newMasks = data?.masks || [];
      
      if (isSuccess) {
        setSamStatus(prev => ({ ...prev, loaded: true }));
        
        if (newMasks.length > 0) {
          // Same mask processing as box segment
          const computeUpdatedMasks = (existingMasks: SegmentationMask[]) => {
            const labelCounts: Record<string, number> = {};
            const groupColors: Record<string, string> = {};
            
            existingMasks.forEach(m => {
              const baseLabel = m.label.replace(/\s*#?\d+$/, '').trim().toLowerCase();
              labelCounts[baseLabel] = (labelCounts[baseLabel] || 0) + 1;
              if (!groupColors[baseLabel]) {
                groupColors[baseLabel] = m.color;
              }
            });
            
            const calculateBboxIoU = (bbox1: number[], bbox2: number[]): number => {
              const [x1, y1, w1, h1] = bbox1;
              const [x2, y2, w2, h2] = bbox2;
              const xA = Math.max(x1, x2);
              const yA = Math.max(y1, y2);
              const xB = Math.min(x1 + w1, x2 + w2);
              const yB = Math.min(y1 + h1, y2 + h2);
              const interWidth = Math.max(0, xB - xA);
              const interHeight = Math.max(0, yB - yA);
              const interArea = interWidth * interHeight;
              const area1 = w1 * h1;
              const area2 = w2 * h2;
              const unionArea = area1 + area2 - interArea;
              return unionArea > 0 ? interArea / unionArea : 0;
            };
            
            const isDuplicateMask = (newMask: SegmentationMask): boolean => {
              const IOU_THRESHOLD = 0.5;
              for (const existingMask of existingMasks) {
                if (existingMask.bbox && newMask.bbox) {
                  const iou = calculateBboxIoU(existingMask.bbox, newMask.bbox);
                  if (iou > IOU_THRESHOLD) return true;
                }
              }
              return false;
            };
            
            const colorPalette = [
              "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF",
              "#00FFFF", "#FF6600", "#9900FF", "#00FF99", "#FF0099",
            ];
            let colorIndex = Object.keys(groupColors).length;
            
            const renumberedMasks = newMasks
              .filter((newMask: SegmentationMask) => !isDuplicateMask(newMask))
              .map((newMask: SegmentationMask) => {
                const baseLabel = newMask.label.replace(/\s*#?\d+$/, '').trim();
                const baseLabelLower = baseLabel.toLowerCase();
                labelCounts[baseLabelLower] = (labelCounts[baseLabelLower] || 0) + 1;
                const newNumber = labelCounts[baseLabelLower];
                const newLabel = `${baseLabel} #${newNumber}`;
                
                let maskColor = groupColors[baseLabelLower];
                if (!maskColor) {
                  maskColor = colorPalette[colorIndex % colorPalette.length];
                  groupColors[baseLabelLower] = maskColor;
                  colorIndex++;
                }
                
                const newId = `mask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                return { ...newMask, id: newId, label: newLabel, color: maskColor };
              });
            
            return [...existingMasks, ...renumberedMasks];
          };
          
          setMasks(prev => {
            const allMasks = computeUpdatedMasks(prev);
            setTimeout(() => {
              const storeSegmentations = allMasks.map((m: SegmentationMask) => ({
                id: m.id,
                label: m.label,
                color: m.color,
                mask: m.maskBase64,
                visible: m.visible,
                source: m.source as "auto" | "manual",
              }));
              setSegmentations(storeSegmentations);
            }, 0);
            return allMasks;
          });
          
          // Clear polygons after successful segmentation
          setDrawnPolygons([]);
        } else {
          alert("No objects found in the selected polygon region(s).");
        }
      } else {
        const errorMsg = response.error || data?.error;
        alert(`Segmentation failed: ${errorMsg || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Polygon segmentation error:", error);
    } finally {
      setIsProcessing(false);
      setProcessingMessage("");
    }
  };
  
  const handleAutoSegment = async () => {
    if (!selectedProjection) return;
    
    setIsProcessing(true);
    setProcessingMessage("Loading SAM model...");
    
    try {
      const hasPrompts = textPrompts.length > 0;
      setProcessingMessage(
        hasPrompts 
          ? `Segmenting with prompts: ${textPrompts.join(", ")}...`
          : "Running automatic segmentation..."
      );
      
      const response = await runSegmentation({
        projectionId: selectedProjection.id,
        mode: hasPrompts ? "text" : "auto",
        textPrompts: hasPrompts ? textPrompts : undefined,
      });
      
      console.log("Segmentation response:", response);
      
      // Handle the response - check both wrapper success and inner success
      const data = response.data as any;
      const isSuccess = response.success && data?.success !== false;
      const masks = data?.masks || [];
      const errorMsg = response.error || data?.error;
      
      if (isSuccess) {
        // Update SAM status
        setSamStatus(prev => ({ ...prev, loaded: true }));
        
        if (masks.length > 0) {
          // Append to existing masks with proper renumbering, color consistency, and duplicate detection
          // Compute updated masks outside setState to avoid calling store actions during render
          const computeUpdatedMasks = (existingMasks: SegmentationMask[]) => {
            // Track label counts as we renumber
            const labelCounts: Record<string, number> = {};
            // Track colors for each group (for consistency)
            const groupColors: Record<string, string> = {};
            
            // First, count existing masks by base label and collect their colors
            existingMasks.forEach(m => {
              const baseLabel = m.label.replace(/\s*#?\d+$/, '').trim().toLowerCase();
              labelCounts[baseLabel] = (labelCounts[baseLabel] || 0) + 1;
              // Store the first color found for this group
              if (!groupColors[baseLabel]) {
                groupColors[baseLabel] = m.color;
              }
            });
            
            // Helper to calculate bounding box IoU (Intersection over Union)
            const calculateBboxIoU = (bbox1: number[], bbox2: number[]): number => {
              // Both bboxes in [x, y, w, h] format
              const [x1, y1, w1, h1] = bbox1;
              const [x2, y2, w2, h2] = bbox2;
              
              const xA = Math.max(x1, x2);
              const yA = Math.max(y1, y2);
              const xB = Math.min(x1 + w1, x2 + w2);
              const yB = Math.min(y1 + h1, y2 + h2);
              
              const interWidth = Math.max(0, xB - xA);
              const interHeight = Math.max(0, yB - yA);
              const interArea = interWidth * interHeight;
              
              const area1 = w1 * h1;
              const area2 = w2 * h2;
              const unionArea = area1 + area2 - interArea;
              
              return unionArea > 0 ? interArea / unionArea : 0;
            };
            
            // Check if a new mask overlaps significantly with existing masks
            const isDuplicateMask = (newMask: SegmentationMask): boolean => {
              const IOU_THRESHOLD = 0.5; // Consider duplicate if >50% overlap
              
              for (const existingMask of existingMasks) {
                if (existingMask.bbox && newMask.bbox) {
                  const iou = calculateBboxIoU(existingMask.bbox, newMask.bbox);
                  if (iou > IOU_THRESHOLD) {
                    console.log(`Skipping duplicate mask (IoU=${iou.toFixed(2)}): ${newMask.label}`);
                    return true;
                  }
                }
              }
              return false;
            };
            
            // Default color palette for new groups
            const colorPalette = [
              "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF",
              "#00FFFF", "#FF6600", "#9900FF", "#00FF99", "#FF0099",
            ];
            let colorIndex = Object.keys(groupColors).length;
            
            // Filter out duplicates and renumber new masks
            const renumberedMasks = masks
              .filter((newMask: SegmentationMask) => !isDuplicateMask(newMask))
              .map((newMask: SegmentationMask) => {
                // Extract base label
                const baseLabel = newMask.label.replace(/\s*#?\d+$/, '').trim();
                const baseLabelLower = baseLabel.toLowerCase();
                
                // Increment count for this label
                labelCounts[baseLabelLower] = (labelCounts[baseLabelLower] || 0) + 1;
                const newNumber = labelCounts[baseLabelLower];
                
                // Create new label with proper numbering
                const newLabel = `${baseLabel} #${newNumber}`;
                
                // Get consistent color for this group
                let maskColor = groupColors[baseLabelLower];
                if (!maskColor) {
                  // New group - assign a color from palette
                  maskColor = colorPalette[colorIndex % colorPalette.length];
                  groupColors[baseLabelLower] = maskColor;
                  colorIndex++;
                }
                
                // Generate unique ID
                const newId = `mask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                return {
                  ...newMask,
                  id: newId,
                  label: newLabel,
                  color: maskColor, // Use consistent group color
                };
              });
            
            if (renumberedMasks.length < masks.length) {
              console.log(`Filtered ${masks.length - renumberedMasks.length} duplicate masks`);
            }
            
            return [...existingMasks, ...renumberedMasks];
          };
          
          // Update masks and schedule store update after render
          setMasks(prev => {
            const allMasks = computeUpdatedMasks(prev);
            
            // Schedule store update after this render cycle
            setTimeout(() => {
              const storeSegmentations = allMasks.map((m: SegmentationMask) => ({
                id: m.id,
                label: m.label,
                color: m.color,
                mask: m.maskBase64,
                visible: m.visible,
                source: m.source as "auto" | "manual",
              }));
              setSegmentations(storeSegmentations);
            }, 0);
            
            return allMasks;
          });
        } else {
          // No masks found - don't clear existing, just show message
          alert(`No objects found matching your prompts. Try different terms like:\n• "rib" - vault ribs\n• "arch" - arched sections\n• "stone" - stone surfaces\n• "boss" - decorative bosses`);
        }
      } else {
        console.error("Segmentation failed:", errorMsg);
        alert(`Segmentation failed: ${errorMsg || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Segmentation error:", error);
    } finally {
      setIsProcessing(false);
      setProcessingMessage("");
    }
  };
  
  const toggleMaskVisibility = (id: string) => {
    setMasks(prev => {
      const updated = prev.map(m => m.id === id ? { ...m, visible: !m.visible } : m);
      return [...updated];
    });
  };
  
  const selectAllMasks = () => {
    setMasks(prev => {
      const updated = prev.map(m => ({ ...m, visible: true }));
      return [...updated];
    });
  };
  
  const deselectAllMasks = () => {
    setMasks(prev => {
      const updated = prev.map(m => ({ ...m, visible: false }));
      return [...updated];
    });
  };
  
  const handleContinue = async () => {
    // Save masks to store
    const storeSegmentations = masks.map(m => ({
      id: m.id,
      label: m.label,
      color: m.color,
      mask: m.maskBase64,
      visible: m.visible,
      source: m.source as "auto" | "manual",
    }));
    setSegmentations(storeSegmentations);
    completeStep(3, { segmentations: storeSegmentations, intradosLines: currentProject?.intradosLines });
    
    // Save project data to backend for persistence
    if (currentProject) {
      try {
        const projectData = {
          projectId: currentProject.id,
          projectName: currentProject.name,
          e57Path: currentProject.e57Path,
          projections: currentProject.projections.map(p => ({
            id: p.id,
            perspective: p.settings.perspective,
            resolution: p.settings.resolution,
            sigma: p.settings.sigma,
            kernelSize: p.settings.kernelSize,
            bottomUp: p.settings.bottomUp,
            scale: p.settings.scale,
          })),
          segmentations: masks.map(m => ({
            id: m.id,
            label: m.label,
            color: m.color,
            maskBase64: m.maskBase64,
            bbox: m.bbox,
            area: m.area,
            visible: m.visible,
            source: m.source,
          })),
          selectedProjectionId: selectedProjectionId || undefined,
        };
        
        const result = await saveProject(projectData);
        if (result.success) {
          console.log(`Project saved: ${result.data?.savedSegmentations} segmentations`);
        } else {
          console.warn("Failed to save project:", result.error);
        }
      } catch (error) {
        console.error("Error saving project:", error);
      }
    }
    
    router.push("/workflow/step-4-geometry-2d");
  };

  // Check if we have projections
  const hasProjections = (currentProject?.projections?.length || 0) > 0;
  const visibleMasks = masks.filter(m => m.visible);
  
  // Group masks by label (extract base label without number)
  const groupedMasks = useMemo(() => {
    const groups: Record<string, SegmentationMask[]> = {};
    
    masks.forEach(mask => {
      // Extract base label (remove trailing numbers like "rib #1" -> "rib")
      const baseLabel = mask.label.replace(/\s*#?\d+$/, '').trim() || mask.label;
      
      if (!groups[baseLabel]) {
        groups[baseLabel] = [];
      }
      groups[baseLabel].push(mask);
    });
    
    // Debug: log grouping
    if (masks.length > 0) {
      console.log("Mask grouping:", Object.entries(groups).map(([label, items]) => ({
        label,
        count: items.length,
        colors: Array.from(new Set(items.map(m => m.color))),
        items: items.map(m => ({ id: m.id, label: m.label, color: m.color }))
      })));
    }
    
    return groups;
  }, [masks]);
  
  const toggleGroupVisibility = (groupLabel: string, visible: boolean) => {
    setMasks(prev => {
      const updated = prev.map(m => {
        const baseLabel = m.label.replace(/\s*#?\d+$/, '').trim() || m.label;
        if (baseLabel.toLowerCase() === groupLabel.toLowerCase()) {
          return { ...m, visible };
        }
        return m;
      });
      return [...updated];
    });
  };
  
  const isGroupVisible = (groupLabel: string): boolean => {
    const group = groupedMasks[groupLabel];
    return group?.some(m => m.visible) || false;
  };
  
  const isGroupFullyVisible = (groupLabel: string): boolean => {
    const group = groupedMasks[groupLabel];
    return group?.every(m => m.visible) || false;
  };

  return (
    <div className="space-y-6">
      <StepHeader 
        title="2D Segmentation"
        description="Use SAM to segment vault features and detect intrados lines"
      />
      
      {/* SAM 3 Status Banner - informational only */}
      {samStatus.loaded && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-green-500/10 text-green-500">
          <Server className="w-5 h-5" />
          <span className="text-sm font-medium">SAM 3 Model Loaded</span>
          <span className="text-xs opacity-70">Ready for text-guided segmentation</span>
        </div>
      )}
      
      {!hasProjections ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-12 text-center space-y-4">
            <AlertCircle className="w-12 h-12 mx-auto text-amber-500" />
            <div>
              <h3 className="text-lg font-medium">No Projections Available</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create projections in Step 2 before running segmentation.
              </p>
            </div>
            <Button onClick={() => router.push("/workflow/step-2-projection")}>
              <ChevronLeft className="w-4 h-4 mr-2" />
              Go to Projection
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left Panel */}
          <div className="lg:col-span-3 space-y-3">
            {/* Projection Selection */}
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium">Select Projection</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-2 pt-1 space-y-1 max-h-32 overflow-y-auto">
                {currentProject?.projections.map((proj) => (
                  <div
                    key={proj.id}
                    className={cn(
                      "flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors",
                      selectedProjectionId === proj.id
                        ? "bg-primary/20 ring-1 ring-primary"
                        : "hover:bg-muted/50"
                    )}
                    onClick={() => {
                      setSelectedProjectionId(proj.id);
                      setMasks([]); // Clear masks when changing projection
                    }}
                  >
                    <div className="w-8 h-8 rounded overflow-hidden bg-muted flex-shrink-0">
                      {(proj.images?.colour || proj.previewImage) ? (
                        <img
                          src={toImageSrc(proj.images?.colour || proj.previewImage)}
                          alt={proj.settings.perspective}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-full h-full p-1.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium capitalize truncate">
                        {proj.settings.perspective}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {proj.settings.resolution}px
                      </p>
                    </div>
                    {selectedProjectionId === proj.id && (
                      <Check className="w-3 h-3 text-primary flex-shrink-0" />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
            
            {/* Segmentation Tools */}
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium">Segmentation</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0 space-y-3">
                {/* Text Prompts Input */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Type className="w-3 h-3" />
                    Text Prompts
                  </Label>
                  
                  {/* Quick Presets */}
                  <div className="flex flex-wrap gap-1">
                    {["rib", "boss stone", "keystone", "intrados", "tiercerons", "lierne", "vault cell"].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => {
                          if (!textPrompts.includes(preset)) {
                            setTextPrompts(prev => [...prev, preset]);
                          }
                        }}
                        disabled={textPrompts.includes(preset)}
                        className={cn(
                          "px-2 py-0.5 text-xs rounded border transition-colors",
                          textPrompts.includes(preset)
                            ? "bg-primary/20 border-primary/50 text-primary cursor-default"
                            : "border-muted-foreground/30 hover:border-primary hover:bg-primary/10"
                        )}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  
                  {/* Custom Input */}
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="Or type custom..."
                      value={newPrompt}
                      onChange={(e) => setNewPrompt(e.target.value)}
                      onKeyDown={handlePromptKeyDown}
                      className="flex-1 h-7 text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleAddPrompt}
                      disabled={!newPrompt.trim()}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  
                  {/* Selected Prompt Tags */}
                  {textPrompts.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-dashed">
                      <span className="text-xs text-muted-foreground/50 mr-1">Selected:</span>
                      {textPrompts.map((prompt) => (
                        <Badge
                          key={prompt}
                          variant="secondary"
                          className="gap-0.5 pr-0.5 text-xs py-0"
                        >
                          {prompt}
                          <button
                            onClick={() => handleRemovePrompt(prompt)}
                            className="ml-0.5 hover:bg-destructive/20 hover:text-destructive rounded-full p-0.5"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                
                <Button 
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={handleAutoSegment}
                  disabled={isProcessing || !selectedProjection}
                >
                  {isProcessing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Wand2 className="w-3 h-3" />
                  )}
                  {textPrompts.length > 0 ? "Run SAM Segmentation" : "Run SAM Segmentation"}
                </Button>
                
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { tool: "polygon", icon: Hexagon, label: "Polygon", needsMasks: false },
                    { tool: "box", icon: Scan, label: "Box", needsMasks: false },
                    { tool: "roi", icon: Square, label: "ROI", needsMasks: false },
                  ].map(({ tool, icon: Icon, label, needsMasks }) => (
                    <Button
                      key={tool}
                      variant={activeTool === tool ? "default" : "outline"}
                      size="sm"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() => {
                        setActiveTool(tool as Tool);
                        if (tool === "roi") setShowROI(true);
                      }}
                      disabled={!selectedProjection || (needsMasks && masks.length === 0)}
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </Button>
                  ))}
                </div>
                
                {/* Box Prompts Section - Compact */}
                {(activeTool === "box" || drawnBoxes.length > 0) && (
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Scan className="w-3 h-3" />
                        Box Selection {drawnBoxes.length > 0 && `(${drawnBoxes.length})`}
                      </span>
                      {drawnBoxes.length > 0 && (
                        <button
                          onClick={clearAllBoxes}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    
                    {drawnBoxes.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70 italic">
                        Draw boxes to find similar objects
                      </p>
                    ) : (
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {drawnBoxes.map((box, idx) => (
                          <div 
                            key={box.id}
                            className={cn(
                              "group flex items-center gap-1.5 px-1.5 py-1 rounded text-xs",
                              box.label === 1 
                                ? "bg-green-500/10" 
                                : "bg-red-500/10"
                            )}
                          >
                            <button
                              onClick={() => toggleBoxLabel(box.id)}
                              className={cn(
                                "w-4 h-4 rounded flex items-center justify-center font-bold text-xs flex-shrink-0",
                                box.label === 1 
                                  ? "bg-green-500 text-white" 
                                  : "bg-red-500 text-white"
                              )}
                              title="Toggle +/−"
                            >
                              {box.label === 1 ? "+" : "−"}
                            </button>
                            <span className="flex-1 truncate">
                              {box.name || `Box ${idx + 1}`}
                            </span>
                            <div className="flex opacity-0 group-hover:opacity-100">
                              <button
                                className="p-0.5 hover:text-primary"
                                onClick={() => setBoxNamingDialog({ 
                                  open: true, 
                                  boxId: box.id, 
                                  tempName: box.name || "" 
                                })}
                                title="Rename"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                className="p-0.5 hover:text-destructive"
                                onClick={() => removeBox(box.id)}
                                title="Remove"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <Button 
                      size="sm"
                      className="w-full gap-1.5 bg-blue-600 hover:bg-blue-700"
                      onClick={handleBoxSegment}
                      disabled={isProcessing || drawnBoxes.length === 0}
                    >
                      {isProcessing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Scan className="w-3 h-3" />
                      )}
                      Find Similar
                    </Button>
                  </div>
                )}
                
                {/* Polygon Section */}
                {(activeTool === "polygon" || drawnPolygons.length > 0 || currentPolygon.length > 0) && (
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Hexagon className="w-3 h-3" />
                        Polygon Selection
                      </span>
                      {(drawnPolygons.length > 0 || currentPolygon.length > 0) && (
                        <button
                          onClick={clearAllPolygons}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    
                    {/* Current polygon being drawn */}
                    {currentPolygon.length > 0 && (
                      <div className="space-y-2 p-2 bg-blue-500/10 rounded">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-blue-400">
                            Drawing: {currentPolygon.length} points
                          </span>
                          <button
                            onClick={clearCurrentPolygon}
                            className="text-xs text-muted-foreground hover:text-destructive"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            placeholder="Name (e.g., rib)"
                            value={polygonName}
                            onChange={(e) => setPolygonName(e.target.value)}
                            className="flex-1 h-6 px-2 text-xs bg-background border rounded"
                          />
                          <Button
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => saveCurrentPolygon()}
                            disabled={currentPolygon.length < 3}
                          >
                            Save
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {currentPolygon.length < 3 
                            ? `Need ${3 - currentPolygon.length} more point${3 - currentPolygon.length > 1 ? 's' : ''}`
                            : "Press Enter to save, Esc to cancel, Backspace to undo"
                          }
                        </p>
                      </div>
                    )}
                    
                    {currentPolygon.length === 0 && drawnPolygons.length === 0 && (
                      <p className="text-xs text-muted-foreground/70 italic">
                        Click to place points. Click on a point to remove it.
                      </p>
                    )}
                    
                    {/* Saved polygons list */}
                    {drawnPolygons.length > 0 && (
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {drawnPolygons.map((polygon, idx) => (
                          <div 
                            key={polygon.id}
                            className="group flex items-center gap-1.5 px-1.5 py-1 rounded text-xs bg-purple-500/10"
                          >
                            <div className="w-4 h-4 rounded flex items-center justify-center bg-purple-500 text-white text-[10px] font-bold">
                              {polygon.points.length}
                            </div>
                            <span className="flex-1 truncate">
                              {polygon.name || `Polygon ${idx + 1}`}
                            </span>
                            <button
                              className="p-0.5 hover:text-destructive opacity-0 group-hover:opacity-100"
                              onClick={() => removePolygon(polygon.id)}
                              title="Remove"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Run SAM on polygons */}
                    {drawnPolygons.length > 0 && (
                      <Button 
                        size="sm"
                        className="w-full gap-1.5 bg-purple-600 hover:bg-purple-700"
                        onClick={handlePolygonSegment}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Hexagon className="w-3 h-3" />
                        )}
                        Find in Polygons
                      </Button>
                    )}
                  </div>
                )}
                
                {/* ROI Section */}
                {activeTool === "roi" && (
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Square className="w-3 h-3" />
                        Region of Interest
                      </span>
                      {showROI && (
                        <button
                          onClick={() => setShowROI(false)}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          Hide
                        </button>
                      )}
                    </div>
                    
                    <p className="text-xs text-muted-foreground/70">
                      Draw a box to define the region. Masks outside will be deleted when applied.
                    </p>
                    
                    {showROI && roi.width > 0.02 && (
                      <>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Size:</span>
                            <span>{Math.round(roi.width * 100)}% x {Math.round(roi.height * 100)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Rotation:</span>
                            <span>{Math.round(roi.rotation)}°</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Masks inside:</span>
                            <span className="text-green-600">{masks.filter(isMaskInsideROI).length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Masks outside:</span>
                            <span className="text-red-600">{masks.filter(m => !isMaskInsideROI(m)).length}</span>
                          </div>
                        </div>
                        
                        <Button 
                          size="sm"
                          variant="destructive"
                          className="w-full gap-1.5"
                          onClick={handleApplyROI}
                          disabled={isApplyingROI || masks.filter(m => !isMaskInsideROI(m)).length === 0}
                        >
                          {isApplyingROI ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Scissors className="w-3 h-3" />
                          )}
                          Apply ROI & Delete Outside
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Detected Segments */}
            {masks.length > 0 && (
              <Card>
                <CardHeader className="py-2 px-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium">Segments</CardTitle>
                    <div className="flex items-center gap-1">
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted"
                        onClick={selectAllMasks}
                      >
                        All
                      </button>
                      <span className="text-muted-foreground/50">|</span>
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted"
                        onClick={deselectAllMasks}
                      >
                        None
                      </button>
                      <span className="text-xs text-muted-foreground ml-1">
                        {visibleMasks.length}/{masks.length}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-2 pb-2 pt-0 space-y-1.5 max-h-60 overflow-y-auto">
                  {Object.entries(groupedMasks).map(([groupLabel, groupMasks]) => {
                    const groupColor = groupMasks[0]?.color || "#888";
                    const visibleInGroup = groupMasks.filter(m => m.visible).length;
                    const isFullyVisible = isGroupFullyVisible(groupLabel);
                    
                    return (
                      <div key={groupLabel} className="space-y-0.5">
                        {/* Group Header - Drop target */}
                        <div
                          className={cn(
                            "group/header flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors",
                            isFullyVisible ? "bg-primary/20" : "bg-muted/30 hover:bg-muted/50",
                            dropTargetGroup === groupLabel && "ring-1 ring-primary ring-dashed bg-primary/10"
                          )}
                          onClick={() => toggleGroupVisibility(groupLabel, !isFullyVisible)}
                          onDragOver={(e) => handleDragOver(e, groupLabel)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, groupLabel)}
                        >
                          <Checkbox
                            checked={isFullyVisible}
                            onCheckedChange={(checked) => toggleGroupVisibility(groupLabel, !!checked)}
                            className="h-3.5 w-3.5"
                          />
                          <div
                            className="w-3 h-3 rounded flex-shrink-0"
                            style={{ backgroundColor: groupColor }}
                          />
                          <span className="text-sm font-medium flex-1 capitalize">
                            {groupLabel}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {visibleInGroup}/{groupMasks.length}
                          </span>
                          {dropTargetGroup === groupLabel && (
                            <span className="text-xs text-primary ml-1">↓</span>
                          )}
                          {/* Delete group button */}
                          <button
                            className="p-0.5 opacity-0 group-hover/header:opacity-100 hover:text-destructive transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete all ${groupMasks.length} masks in "${groupLabel}"?`)) {
                                removeGroup(groupLabel);
                              }
                            }}
                            title={`Delete all ${groupMasks.length} masks in this group`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        
                        {/* Individual Masks in Group */}
                        <div className="pl-4 space-y-px">
                          {groupMasks.map((mask) => (
                            <div
                              key={mask.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, mask.id)}
                              onDragEnd={handleDragEnd}
                              className={cn(
                                "group flex items-center gap-1 px-1 py-0.5 rounded text-xs cursor-grab active:cursor-grabbing hover:bg-muted/50",
                                mask.visible ? "opacity-100" : "opacity-40",
                                draggingMaskId === mask.id && "opacity-50 ring-1 ring-primary"
                              )}
                            >
                              <GripVertical className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground flex-shrink-0" />
                              <Checkbox
                                checked={mask.visible}
                                onCheckedChange={() => toggleMaskVisibility(mask.id)}
                                className="h-3 w-3"
                              />
                              {editingMaskId === mask.id ? (
                                <Input
                                  value={editingMaskName}
                                  onChange={(e) => setEditingMaskName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveEditingMask();
                                    if (e.key === "Escape") cancelEditingMask();
                                  }}
                                  onBlur={saveEditingMask}
                                  autoFocus
                                  className="h-5 text-xs px-1 flex-1"
                                />
                              ) : (
                                <span 
                                  className="flex-1 truncate text-xs"
                                  onDoubleClick={() => startEditingMask(mask.id, mask.label)}
                                  title="Double-click to rename"
                                >
                                  {mask.label}
                                </span>
                              )}
                              {/* Actions - visible on hover */}
                              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  className="p-0.5 hover:text-primary"
                                  onClick={() => startEditingMask(mask.id, mask.label)}
                                  title="Rename"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  className="p-0.5 hover:text-destructive"
                                  onClick={() => removeMask(mask.id)}
                                  title="Remove"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
          
          {/* Main Preview Area */}
          <div className="lg:col-span-9">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle className="text-lg font-display">
                      {selectedProjection 
                        ? `${selectedProjection.settings.perspective} Projection`
                        : "Select a Projection"}
                    </CardTitle>
                    <CardDescription>
                      {masks.length > 0 
                        ? `${masks.length} segments detected (${visibleMasks.length} visible)` 
                        : "Click 'Run SAM Segmentation' to detect features"}
                    </CardDescription>
                  </div>
                  
                  {/* Image Type Selector */}
                  {selectedProjection && (
                    <div className="flex gap-1">
                      {(["colour", "depthGrayscale", "depthPlasma"] as const).map((type) => (
                        <Button
                          key={type}
                          variant={selectedImageType === type ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedImageType(type)}
                        >
                          {type === "colour" ? "Colour" : type === "depthGrayscale" ? "Depth" : "Plasma"}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Display Controls */}
                  {masks.length > 0 && (
                    <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
                      <Label className="text-sm whitespace-nowrap">Overlay</Label>
                      <Slider
                        value={[overlayOpacity * 100]}
                        onValueChange={([v]) => setOverlayOpacity(v / 100)}
                        min={0}
                        max={100}
                        step={5}
                        className="flex-1 max-w-xs"
                      />
                      <span className="text-sm text-muted-foreground w-10">
                        {Math.round(overlayOpacity * 100)}%
                      </span>
                    </div>
                  )}
                  
                  {/* Image Preview */}
                  <div 
                    ref={imageContainerRef}
                    className={cn(
                      "relative aspect-square max-w-2xl mx-auto bg-[#0a0f1a] rounded-lg overflow-hidden",
                      (activeTool === "box" || activeTool === "polygon" || activeTool === "roi") && "cursor-crosshair"
                    )}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={() => {
                      if (isDrawing) {
                        setIsDrawing(false);
                        setDrawStart(null);
                        setCurrentBox(null);
                      }
                    }}
                  >
                    {!selectedProjection ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center space-y-2">
                          <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground/50" />
                          <p className="text-sm text-muted-foreground">
                            Select a projection from the list
                          </p>
                        </div>
                      </div>
                    ) : currentImage ? (
                      <>
                        {/* Base projection image - pointer-events-none so mouse events go to parent */}
                        <img
                          src={toImageSrc(currentImage)}
                          alt="Projection"
                          className="w-full h-full object-contain pointer-events-none select-none"
                          onLoad={handleImageLoad}
                          draggable={false}
                        />
                        
                        {/* Segmentation mask overlays */}
                        {visibleMasks.map((mask) => (
                          <div
                            key={mask.id}
                            className="absolute inset-0 pointer-events-none"
                            style={{ opacity: overlayOpacity }}
                          >
                            {/* Strong colored mask overlay */}
                            <div
                              className="absolute inset-0"
                              style={{
                                backgroundColor: mask.color,
                                maskImage: `url(${toImageSrc(mask.maskBase64)})`,
                                WebkitMaskImage: `url(${toImageSrc(mask.maskBase64)})`,
                                maskSize: "contain",
                                WebkitMaskSize: "contain",
                                maskPosition: "center",
                                WebkitMaskPosition: "center",
                                maskRepeat: "no-repeat",
                                WebkitMaskRepeat: "no-repeat",
                              }}
                            />
                            {/* Bright border/edge highlight */}
                            <div
                              className="absolute inset-0"
                              style={{
                                background: `linear-gradient(45deg, ${mask.color}, ${mask.color}dd)`,
                                maskImage: `url(${toImageSrc(mask.maskBase64)})`,
                                WebkitMaskImage: `url(${toImageSrc(mask.maskBase64)})`,
                                maskSize: "contain",
                                WebkitMaskSize: "contain",
                                maskPosition: "center",
                                WebkitMaskPosition: "center",
                                maskRepeat: "no-repeat",
                                WebkitMaskRepeat: "no-repeat",
                                filter: `drop-shadow(0 0 4px ${mask.color}) drop-shadow(0 0 8px ${mask.color})`,
                              }}
                            />
                          </div>
                        ))}
                        
                        {/* Info overlays - combined top bar */}
                        <div className="absolute top-2 left-2 right-2 flex justify-between items-center pointer-events-none">
                          <div className="bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-[10px] capitalize">
                            {selectedProjection.settings.perspective} view
                          </div>
                          <div className="bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-[10px]">
                            {selectedProjection.settings.resolution}px
                          </div>
                        </div>
                        
                        {/* Drawn box overlays */}
                        {(drawnBoxes.length > 0 || currentBox) && (() => {
                          const imgW = imageSize?.width || selectedProjection?.settings?.resolution || 2048;
                          const imgH = imageSize?.height || selectedProjection?.settings?.resolution || 2048;
                          return (
                            <div className="absolute inset-0 pointer-events-none">
                              {/* Existing drawn boxes */}
                              {drawnBoxes.map((box) => {
                                const left = (box.coords[0] / imgW) * 100;
                                const top = (box.coords[1] / imgH) * 100;
                                const width = ((box.coords[2] - box.coords[0]) / imgW) * 100;
                                const height = ((box.coords[3] - box.coords[1]) / imgH) * 100;
                                const isSelected = box.id === selectedBoxId;
                                
                                return (
                                  <div
                                    key={box.id}
                                    className={cn(
                                      "absolute border-4",
                                      isSelected && "ring-2 ring-white"
                                    )}
                                    style={{
                                      left: `${left}%`,
                                      top: `${top}%`,
                                      width: `${width}%`,
                                      height: `${height}%`,
                                      backgroundColor: box.label === 1 ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)",
                                      borderColor: isSelected ? "#3b82f6" : (box.label === 1 ? "#22c55e" : "#ef4444"),
                                      borderStyle: box.label === 0 ? "dashed" : "solid",
                                    }}
                                  >
                                    <span 
                                      className="absolute -top-6 left-0 px-1.5 py-0.5 text-white text-xs font-bold rounded"
                                      style={{ backgroundColor: box.label === 1 ? "#22c55e" : "#ef4444" }}
                                    >
                                      {box.label === 1 ? "+" : "−"} {box.name || ""}
                                    </span>
                                  </div>
                                );
                              })}
                              {/* Currently drawing box */}
                              {currentBox && boxInteractionMode === "draw" && (() => {
                                const left = (currentBox.x1 / imgW) * 100;
                                const top = (currentBox.y1 / imgH) * 100;
                                const bwidth = ((currentBox.x2 - currentBox.x1) / imgW) * 100;
                                const bheight = ((currentBox.y2 - currentBox.y1) / imgH) * 100;
                                return (
                                  <div
                                    className="absolute border-4 border-dashed border-blue-500 bg-blue-500/30"
                                    style={{
                                      left: `${left}%`,
                                      top: `${top}%`,
                                      width: `${bwidth}%`,
                                      height: `${bheight}%`,
                                    }}
                                  />
                                );
                              })()}
                            </div>
                          );
                        })()}
                        
                        {/* Polygon overlays */}
                        {(drawnPolygons.length > 0 || currentPolygon.length > 0) && (() => {
                          const imgW = imageSize?.width || selectedProjection?.settings?.resolution || 2048;
                          const imgH = imageSize?.height || selectedProjection?.settings?.resolution || 2048;
                          
                          // Convert point to 0-100 coordinate space (for viewBox)
                          const toViewBox = (p: PolygonPoint) => ({
                            x: (p.x / imgW) * 100,
                            y: (p.y / imgH) * 100,
                          });
                          
                          return (
                            <svg 
                              className="absolute inset-0 w-full h-full pointer-events-none"
                              viewBox="0 0 100 100"
                              preserveAspectRatio="none"
                            >
                              {/* Saved polygons */}
                              {drawnPolygons.map((polygon) => {
                                const pts = polygon.points.map(toViewBox);
                                const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
                                return (
                                  <g key={polygon.id}>
                                    <path
                                      d={pathD}
                                      fill="rgba(168, 85, 247, 0.3)"
                                      stroke="#a855f7"
                                      strokeWidth="0.3"
                                      vectorEffect="non-scaling-stroke"
                                    />
                                    {/* Points */}
                                    {pts.map((p, i) => (
                                      <circle
                                        key={i}
                                        cx={p.x}
                                        cy={p.y}
                                        r="0.8"
                                        fill="#a855f7"
                                        stroke="white"
                                        strokeWidth="0.2"
                                      />
                                    ))}
                                  </g>
                                );
                              })}
                              
                              {/* Current polygon being drawn */}
                              {currentPolygon.length > 0 && (() => {
                                const pts = currentPolygon.map(toViewBox);
                                const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + 
                                  (currentPolygon.length >= 3 ? ' Z' : '');
                                return (
                                  <g>
                                    {/* Fill when 3+ points */}
                                    {currentPolygon.length >= 3 && (
                                      <path
                                        d={pathD}
                                        fill="rgba(59, 130, 246, 0.2)"
                                        stroke="none"
                                      />
                                    )}
                                    {/* Lines connecting all points */}
                                    <path
                                      d={pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                                      fill="none"
                                      stroke="#3b82f6"
                                      strokeWidth="0.4"
                                      strokeDasharray="1,0.5"
                                    />
                                    {/* Closing line preview when 3+ points */}
                                    {currentPolygon.length >= 3 && (
                                      <line
                                        x1={pts[pts.length - 1].x}
                                        y1={pts[pts.length - 1].y}
                                        x2={pts[0].x}
                                        y2={pts[0].y}
                                        stroke="#3b82f6"
                                        strokeWidth="0.3"
                                        strokeDasharray="0.5,0.5"
                                        opacity="0.5"
                                      />
                                    )}
                                    {/* Points with numbers */}
                                    {pts.map((p, i) => (
                                      <g key={i}>
                                        <circle
                                          cx={p.x}
                                          cy={p.y}
                                          r="1.2"
                                          fill="#3b82f6"
                                          stroke="white"
                                          strokeWidth="0.2"
                                        />
                                        <text
                                          x={p.x}
                                          y={p.y}
                                          textAnchor="middle"
                                          dominantBaseline="central"
                                          fill="white"
                                          fontSize="1.5"
                                          fontWeight="bold"
                                        >
                                          {i + 1}
                                        </text>
                                      </g>
                                    ))}
                                  </g>
                                );
                              })()}
                            </svg>
                          );
                        })()}
                        
                        {masks.length > 0 && (
                          <div className="absolute bottom-2 left-2 bg-green-500/20 text-green-400 px-2 py-1 rounded text-[10px] flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                            {masks.length} segments
                          </div>
                        )}
                        
                        {/* ROI overlay */}
                        {showROI && roi.width > 0.02 && (() => {
                          const corners = getROICorners(roi);
                          // Convert to percentage
                          const cornersPct = corners.map(([x, y]) => [x * 100, y * 100]);
                          
                          return (
                            <svg 
                              className="absolute inset-0 w-full h-full pointer-events-none z-20"
                              viewBox="0 0 100 100"
                              preserveAspectRatio="none"
                            >
                              {/* Darkened area outside ROI */}
                              <defs>
                                <mask id="roi-mask-seg">
                                  <rect x="0" y="0" width="100" height="100" fill="white" />
                                  <polygon
                                    points={cornersPct.map(([x, y]) => `${x},${y}`).join(" ")}
                                    fill="black"
                                  />
                                </mask>
                              </defs>
                              <rect 
                                x="0" y="0" width="100" height="100" 
                                fill="rgba(0,0,0,0.5)" 
                                mask="url(#roi-mask-seg)"
                              />
                              
                              {/* ROI border */}
                              <polygon
                                points={cornersPct.map(([x, y]) => `${x},${y}`).join(" ")}
                                fill="none"
                                stroke="#22c55e"
                                strokeWidth="0.3"
                                strokeDasharray={activeTool === "roi" ? "none" : "1,0.5"}
                              />
                              
                              {/* Corner handles (only when ROI tool active) */}
                              {activeTool === "roi" && cornersPct.map(([x, y], i) => (
                                <circle
                                  key={i}
                                  cx={x}
                                  cy={y}
                                  r="1"
                                  fill="#22c55e"
                                  stroke="white"
                                  strokeWidth="0.2"
                                />
                              ))}
                              
                              {/* Rotation handle (only when ROI tool active) */}
                              {activeTool === "roi" && (() => {
                                const rad = (roi.rotation * Math.PI) / 180;
                                const handleX = (roi.x + Math.sin(rad) * (roi.height / 2 + 0.03)) * 100;
                                const handleY = (roi.y - Math.cos(rad) * (roi.height / 2 + 0.03)) * 100;
                                const topCenterX = (roi.x + Math.sin(rad) * (roi.height / 2)) * 100;
                                const topCenterY = (roi.y - Math.cos(rad) * (roi.height / 2)) * 100;
                                return (
                                  <>
                                    <line
                                      x1={topCenterX}
                                      y1={topCenterY}
                                      x2={handleX}
                                      y2={handleY}
                                      stroke="#22c55e"
                                      strokeWidth="0.15"
                                    />
                                    <circle
                                      cx={handleX}
                                      cy={handleY}
                                      r="0.8"
                                      fill="#22c55e"
                                      stroke="white"
                                      strokeWidth="0.2"
                                    />
                                  </>
                                );
                              })()}
                            </svg>
                          );
                        })()}
                        
                        {/* Tool mode indicator */}
                        {activeTool === "box" && (
                          <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-blue-500/90 text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 z-10">
                            {boxInteractionMode === "move" ? (
                              <>
                                <Scan className="w-3.5 h-3.5" />
                                Drag to move box
                              </>
                            ) : selectedBoxId ? (
                              <>
                                <Scan className="w-3.5 h-3.5" />
                                Drag to move • Click elsewhere to deselect
                              </>
                            ) : (
                              <>
                                <Scan className="w-3.5 h-3.5" />
                                Draw boxes • Click box to move
                              </>
                            )}
                          </div>
                        )}
                        
                        {/* Polygon mode indicator */}
                        {activeTool === "polygon" && (
                          <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-purple-500/90 text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 z-10">
                            <Hexagon className="w-3.5 h-3.5" />
                            {currentPolygon.length === 0 
                              ? "Click to place points" 
                              : currentPolygon.length < 3
                              ? `${currentPolygon.length}/3 points • Click to add`
                              : `${currentPolygon.length} points • Enter to save • Click point to remove`
                            }
                          </div>
                        )}
                        
                        {/* ROI mode indicator */}
                        {activeTool === "roi" && (
                          <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-green-500/90 text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 z-10">
                            <Square className="w-3.5 h-3.5" />
                            {roiInteractionMode === "drawing" 
                              ? "Drawing ROI..." 
                              : roiInteractionMode === "moving"
                              ? "Moving ROI..."
                              : roiInteractionMode === "resizing"
                              ? "Resizing ROI..."
                              : roiInteractionMode === "rotating"
                              ? "Rotating ROI..."
                              : showROI && roi.width > 0.02
                              ? "Drag to move • Corners to resize • Top handle to rotate"
                              : "Click and drag to draw ROI"
                            }
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    
                    {/* Processing overlay */}
                    {isProcessing && (
                      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                        <div className="text-center space-y-3">
                          <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
                          <p className="text-sm font-medium">{processingMessage || "Processing..."}</p>
                          <p className="text-xs text-muted-foreground">
                            This may take a minute for large images
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Stats */}
                  {masks.length > 0 && (
                    <div className="flex justify-center gap-6 text-xs text-muted-foreground">
                      <span>Total area: {masks.reduce((sum, m) => sum + m.area, 0).toLocaleString()}px²</span>
                      <span>Avg confidence: {(masks.reduce((sum, m) => sum + m.predictedIou, 0) / masks.length * 100).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      
      <StepActions>
        <Button 
          variant="outline" 
          onClick={() => router.push("/workflow/step-2-projection")} 
          className="gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Projection
        </Button>
        <Button 
          onClick={handleContinue} 
          disabled={masks.length === 0}
          className="gap-2"
        >
          Continue to 2D Geometry
          <ChevronRight className="w-4 h-4" />
        </Button>
      </StepActions>
      
      {/* Box Naming Dialog */}
      <Dialog open={boxNamingDialog.open} onOpenChange={(open) => {
        if (!open) handleCancelBoxName();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Name This Selection</DialogTitle>
            <DialogDescription>
              Enter a name for what you're selecting (e.g., "rib", "boss stone", "keystone").
              Leave empty to use a generic name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="box-name">Object Name</Label>
              <Input
                id="box-name"
                value={boxNamingDialog.tempName}
                onChange={(e) => setBoxNamingDialog(prev => ({ ...prev, tempName: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveBoxName();
                  }
                }}
                placeholder="e.g., rib, boss stone, keystone"
                autoFocus
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <p className="text-xs text-muted-foreground w-full mb-1">Quick select:</p>
              {["rib", "boss stone", "keystone", "intrados", "tiercerons", "lierne"].map((name) => (
                <Badge
                  key={name}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/20"
                  onClick={() => setBoxNamingDialog(prev => ({ ...prev, tempName: name }))}
                >
                  {name}
                </Badge>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancelBoxName}>
              Cancel
            </Button>
            <Button onClick={handleSaveBoxName}>
              <Check className="w-4 h-4 mr-2" />
              Save Selection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
