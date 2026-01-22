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
  BoxPrompt
} from "@/lib/api";
import { 
  ChevronLeft, 
  ChevronRight, 
  Wand2,
  MousePointer,
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
  Edit2
} from "lucide-react";
import { cn } from "@/lib/utils";

// Image type for viewing projections
type ImageViewType = "colour" | "depthGrayscale" | "depthPlasma";
type Tool = "select" | "box";

// Drawn box for prompting
interface DrawnBox {
  id: string;
  coords: [number, number, number, number]; // [x1, y1, x2, y2] in image pixels
  label: 0 | 1; // 1 = positive, 0 = negative
  name?: string; // Optional name for the selection
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
  const [activeTool, setActiveTool] = useState<Tool>("select");
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
  
  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (activeTool !== "box" || !selectedProjection) {
      console.log("Mouse down blocked:", { activeTool, hasProjection: !!selectedProjection });
      return;
    }
    
    e.preventDefault(); // Prevent text selection
    
    const coords = getImageCoordinates(e);
    console.log("Mouse down at:", coords);
    if (!coords) return;
    
    setIsDrawing(true);
    setDrawStart(coords);
    setCurrentBox({ x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y });
  };
  
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart) return;
    
    const coords = getImageCoordinates(e);
    if (!coords) return;
    
    setCurrentBox({
      x1: Math.min(drawStart.x, coords.x),
      y1: Math.min(drawStart.y, coords.y),
      x2: Math.max(drawStart.x, coords.x),
      y2: Math.max(drawStart.y, coords.y),
    });
  };
  
  const handleMouseUp = (e: MouseEvent<HTMLDivElement>) => {
    console.log("Mouse up, isDrawing:", isDrawing, "currentBox:", currentBox);
    
    if (!isDrawing || !currentBox) {
      setIsDrawing(false);
      setDrawStart(null);
      return;
    }
    
    // Only add box if it has meaningful size (at least 10px in each dimension)
    const width = Math.abs(currentBox.x2 - currentBox.x1);
    const height = Math.abs(currentBox.y2 - currentBox.y1);
    
    console.log("Box size:", width, "x", height);
    
    if (width >= 10 && height >= 10) {
      const newBoxId = `box-${Date.now()}`;
      const newBox: DrawnBox = {
        id: newBoxId,
        coords: [currentBox.x1, currentBox.y1, currentBox.x2, currentBox.y2],
        label: 1, // Default to positive
        name: "",
      };
      console.log("Adding box:", newBox);
      setDrawnBoxes(prev => [...prev, newBox]);
      
      // Open naming dialog
      setBoxNamingDialog({
        open: true,
        boxId: newBoxId,
        tempName: "",
      });
    } else {
      console.log("Box too small, not adding");
    }
    
    setIsDrawing(false);
    setDrawStart(null);
    setCurrentBox(null);
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
          // Append to existing masks with proper renumbering to avoid duplicates
          setMasks(prev => {
            // Track label counts as we renumber
            const labelCounts: Record<string, number> = {};
            
            // First, count existing masks by base label
            prev.forEach(m => {
              const baseLabel = m.label.replace(/\s*#?\d+$/, '').trim().toLowerCase();
              labelCounts[baseLabel] = (labelCounts[baseLabel] || 0) + 1;
            });
            
            // Renumber new masks based on existing ones
            const renumberedMasks = newMasks.map((newMask: SegmentationMask) => {
              // Extract base label (e.g., "boss stone" from "boss stone #1")
              const baseLabel = newMask.label.replace(/\s*#?\d+$/, '').trim();
              const baseLabelLower = baseLabel.toLowerCase();
              
              // Increment count for this label
              labelCounts[baseLabelLower] = (labelCounts[baseLabelLower] || 0) + 1;
              const newNumber = labelCounts[baseLabelLower];
              
              // Create new label with proper numbering
              const newLabel = `${baseLabel} #${newNumber}`;
              
              // Generate unique ID to avoid conflicts
              const newId = `mask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              
              return {
                ...newMask,
                id: newId,
                label: newLabel,
              };
            });
            
            // Update store with ALL masks (existing + new)
            const allMasks = [...prev, ...renumberedMasks];
            const storeSegmentations = allMasks.map((m: SegmentationMask) => ({
              id: m.id,
              label: m.label,
              color: m.color,
              mask: m.maskBase64,
              visible: m.visible,
              source: m.source as "auto" | "manual",
            }));
            setSegmentations(storeSegmentations);
            
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
          // Append to existing masks with proper renumbering (same as box selection)
          setMasks(prev => {
            // Track label counts as we renumber
            const labelCounts: Record<string, number> = {};
            
            // First, count existing masks by base label
            prev.forEach(m => {
              const baseLabel = m.label.replace(/\s*#?\d+$/, '').trim().toLowerCase();
              labelCounts[baseLabel] = (labelCounts[baseLabel] || 0) + 1;
            });
            
            // Renumber new masks based on existing ones
            const renumberedMasks = masks.map((newMask: SegmentationMask) => {
              // Extract base label
              const baseLabel = newMask.label.replace(/\s*#?\d+$/, '').trim();
              const baseLabelLower = baseLabel.toLowerCase();
              
              // Increment count for this label
              labelCounts[baseLabelLower] = (labelCounts[baseLabelLower] || 0) + 1;
              const newNumber = labelCounts[baseLabelLower];
              
              // Create new label with proper numbering
              const newLabel = `${baseLabel} #${newNumber}`;
              
              // Generate unique ID
              const newId = `mask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              
              return {
                ...newMask,
                id: newId,
                label: newLabel,
              };
            });
            
            // Combine existing + new masks
            const allMasks = [...prev, ...renumberedMasks];
            
            // Update store with ALL masks
            const storeSegmentations = allMasks.map((m: SegmentationMask) => ({
              id: m.id,
              label: m.label,
              color: m.color,
              mask: m.maskBase64,
              visible: m.visible,
              source: m.source as "auto" | "manual",
            }));
            setSegmentations(storeSegmentations);
            
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
  
  const handleContinue = () => {
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
              <CardContent className="px-2 pb-2 pt-0 space-y-1 max-h-32 overflow-y-auto">
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
                      {proj.images?.colour ? (
                        <img
                          src={`data:image/png;base64,${proj.images.colour}`}
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
                
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { tool: "select", icon: MousePointer, label: "Select", needsMasks: true },
                    { tool: "box", icon: Scan, label: "Box", needsMasks: false },
                  ].map(({ tool, icon: Icon, label, needsMasks }) => (
                    <Button
                      key={tool}
                      variant={activeTool === tool ? "default" : "outline"}
                      size="sm"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() => setActiveTool(tool as Tool)}
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
                            "flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors",
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
                      activeTool === "box" && "cursor-crosshair"
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
                          src={`data:image/png;base64,${currentImage}`}
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
                                maskImage: `url(data:image/png;base64,${mask.maskBase64})`,
                                WebkitMaskImage: `url(data:image/png;base64,${mask.maskBase64})`,
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
                                maskImage: `url(data:image/png;base64,${mask.maskBase64})`,
                                WebkitMaskImage: `url(data:image/png;base64,${mask.maskBase64})`,
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
                        
                        {/* Info overlays */}
                        <div className="absolute top-3 left-3 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs capitalize">
                          {selectedProjection.settings.perspective} view
                        </div>
                        <div className="absolute top-3 right-3 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs">
                          {selectedProjection.settings.resolution}px
                        </div>
                        
                        {/* Drawn box overlays - use percentage-based positioning */}
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
                                return (
                                  <div
                                    key={box.id}
                                    className="absolute border-4"
                                    style={{
                                      left: `${left}%`,
                                      top: `${top}%`,
                                      width: `${width}%`,
                                      height: `${height}%`,
                                      backgroundColor: box.label === 1 ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)",
                                      borderColor: box.label === 1 ? "#22c55e" : "#ef4444",
                                      borderStyle: box.label === 0 ? "dashed" : "solid",
                                    }}
                                  >
                                    <span 
                                      className="absolute -top-6 left-0 px-1.5 py-0.5 text-white text-xs font-bold rounded"
                                      style={{ backgroundColor: box.label === 1 ? "#22c55e" : "#ef4444" }}
                                    >
                                      {box.label === 1 ? "+" : "−"}
                                    </span>
                                  </div>
                                );
                              })}
                              {/* Currently drawing box */}
                              {currentBox && (() => {
                                const left = (currentBox.x1 / imgW) * 100;
                                const top = (currentBox.y1 / imgH) * 100;
                                const width = ((currentBox.x2 - currentBox.x1) / imgW) * 100;
                                const height = ((currentBox.y2 - currentBox.y1) / imgH) * 100;
                                return (
                                  <div
                                    className="absolute border-4 border-dashed border-blue-500 bg-blue-500/30"
                                    style={{
                                      left: `${left}%`,
                                      top: `${top}%`,
                                      width: `${width}%`,
                                      height: `${height}%`,
                                    }}
                                  />
                                );
                              })()}
                            </div>
                          );
                        })()}
                        
                        {masks.length > 0 && (
                          <div className="absolute bottom-3 left-3 bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                            {masks.length} segments
                          </div>
                        )}
                        
                        {/* Box drawing mode indicator */}
                        {activeTool === "box" && (
                          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-blue-500/90 text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2">
                            <Scan className="w-3.5 h-3.5" />
                            Draw boxes to find similar objects
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
