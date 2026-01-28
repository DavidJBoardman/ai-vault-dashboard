"use client";

import { useState, useMemo, useEffect, useRef, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useProjectStore, Segmentation } from "@/lib/store";
import { saveROI, ROIData, getIntradosLines, IntradosLine } from "@/lib/api";
import { 
  ChevronLeft, 
  ChevronRight,
  Play,
  RefreshCw,
  Download,
  Star,
  Circle,
  Hexagon,
  Eye,
  EyeOff,
  Layers,
  Image as ImageIcon,
  AlertCircle,
  Square,
  RotateCw,
  Save,
  Move,
  Maximize2,
  Spline,
  Loader2
} from "lucide-react";
import { cn, toImageSrc } from "@/lib/utils";

interface GeometryResult {
  classification: "starcut" | "circlecut" | "starcirclecut";
  bossStones: Array<{ x: number; y: number; label: string }>;
  px: number;
  py: number;
}

// Image view types
type ImageViewType = "colour" | "depthGrayscale" | "depthPlasma";

// ROI state interface
interface ROIState {
  x: number;      // Center X (0-1 normalized)
  y: number;      // Center Y (0-1 normalized)
  width: number;  // Width (0-1 normalized)
  height: number; // Height (0-1 normalized)
  rotation: number; // Degrees
}

// Interaction mode
type InteractionMode = "none" | "drawing" | "moving" | "resizing" | "rotating";

export default function Step4Geometry2DPage() {
  const router = useRouter();
  const { currentProject, setGeometryResult, completeStep, updateSegmentation } = useProjectStore();
  
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [result, setResult] = useState<GeometryResult | null>(null);
  
  // ROI state
  const [roi, setRoi] = useState<ROIState>({
    x: 0.5,
    y: 0.5,
    width: 0.6,
    height: 0.6,
    rotation: 0,
  });
  const [showROI, setShowROI] = useState(true);
  const [isSavingROI, setIsSavingROI] = useState(false);
  const [roiSaveResult, setRoiSaveResult] = useState<{ inside: number; outside: number } | null>(null);
  
  // Intrados state (display only - tracing moved to Step 5)
  const [intradosLines, setIntradosLines] = useState<IntradosLine[]>([]);
  const [showIntrados, setShowIntrados] = useState(true);
  
  // Interaction state
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("none");
  const [dragStart, setDragStart] = useState<{ x: number; y: number; roi: ROIState } | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  
  // View state
  const [selectedImageType, setSelectedImageType] = useState<ImageViewType>("colour");
  const [overlayOpacity, setOverlayOpacity] = useState(0.6);
  const [showMaskOverlay, setShowMaskOverlay] = useState(true);
  
  // Get the first projection (or selected one from Step 3)
  const selectedProjection = useMemo(() => {
    if (!currentProject?.projections?.length) return null;
    // Use the first projection for now
    return currentProject.projections[0];
  }, [currentProject?.projections]);
  
  // Get current projection image
  const currentImage = useMemo(() => {
    if (!selectedProjection?.images) return null;
    return selectedProjection.images[selectedImageType] || selectedProjection.images.colour;
  }, [selectedProjection, selectedImageType]);
  
  // Get segmentations from store
  const segmentations = currentProject?.segmentations || [];
  
  // Group segmentations by base label
  const groupedSegmentations = useMemo(() => {
    const groups: Record<string, Segmentation[]> = {};
    
    segmentations.forEach(seg => {
      const baseLabel = seg.label.replace(/\s*#?\d+$/, '').trim() || seg.label;
      if (!groups[baseLabel]) {
        groups[baseLabel] = [];
      }
      groups[baseLabel].push(seg);
    });
    
    return groups;
  }, [segmentations]);
  
  // Calculate group visibility
  const groupVisibility = useMemo(() => {
    const visibility: Record<string, { visible: number; total: number; color: string }> = {};
    
    Object.entries(groupedSegmentations).forEach(([label, segs]) => {
      visibility[label] = {
        visible: segs.filter(s => s.visible).length,
        total: segs.length,
        color: segs[0]?.color || "#888888",
      };
    });
    
    return visibility;
  }, [groupedSegmentations]);
  
  // Toggle group visibility
  const toggleGroupVisibility = (groupLabel: string) => {
    const group = groupedSegmentations[groupLabel];
    if (!group) return;
    
    // If any in group are visible, hide all. Otherwise show all.
    const anyVisible = group.some(s => s.visible);
    
    group.forEach(seg => {
      updateSegmentation(seg.id, { visible: !anyVisible });
    });
  };
  
  // Toggle all visibility
  const toggleAllVisibility = (visible: boolean) => {
    segmentations.forEach(seg => {
      updateSegmentation(seg.id, { visible });
    });
  };
  
  // Get visible masks for overlay
  const visibleMasks = segmentations.filter(s => s.visible);
  
  // Get group list for display
  const groupList = Object.keys(groupedSegmentations);
  
  // Convert mouse event to normalized coordinates (0-1)
  const getMousePosition = (e: MouseEvent): { x: number; y: number } | null => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };
  
  // Calculate ROI corners with rotation
  const getROICorners = (r: ROIState): number[][] => {
    const cos = Math.cos((r.rotation * Math.PI) / 180);
    const sin = Math.sin((r.rotation * Math.PI) / 180);
    const hw = r.width / 2;
    const hh = r.height / 2;
    
    // Corners relative to center (before rotation)
    const corners = [
      [-hw, -hh], // top-left
      [hw, -hh],  // top-right
      [hw, hh],   // bottom-right
      [-hw, hh],  // bottom-left
    ];
    
    // Rotate and translate
    return corners.map(([cx, cy]) => [
      r.x + cx * cos - cy * sin,
      r.y + cx * sin + cy * cos,
    ]);
  };
  
  // Check if point is near ROI edge for resize
  const getResizeHandle = (pos: { x: number; y: number }, r: ROIState): string | null => {
    const corners = getROICorners(r);
    const threshold = 0.03; // 3% of canvas size
    
    // Check corners
    const handleNames = ["nw", "ne", "se", "sw"];
    for (let i = 0; i < corners.length; i++) {
      const dist = Math.hypot(pos.x - corners[i][0], pos.y - corners[i][1]);
      if (dist < threshold) return handleNames[i];
    }
    
    // Check rotation handle (above top edge)
    const topCenter = [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2];
    const rotateHandleOffset = 0.05;
    const cos = Math.cos((r.rotation * Math.PI) / 180);
    const sin = Math.sin((r.rotation * Math.PI) / 180);
    const rotateHandle = [topCenter[0] - rotateHandleOffset * sin, topCenter[1] - rotateHandleOffset * cos];
    const rotDist = Math.hypot(pos.x - rotateHandle[0], pos.y - rotateHandle[1]);
    if (rotDist < threshold) return "rotate";
    
    return null;
  };
  
  // Check if point is inside ROI
  const isInsideROI = (pos: { x: number; y: number }, r: ROIState): boolean => {
    // Transform point to ROI local coordinates
    const cos = Math.cos((-r.rotation * Math.PI) / 180);
    const sin = Math.sin((-r.rotation * Math.PI) / 180);
    const dx = pos.x - r.x;
    const dy = pos.y - r.y;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    
    return Math.abs(localX) < r.width / 2 && Math.abs(localY) < r.height / 2;
  };
  
  // Mouse handlers for ROI
  const handleMouseDown = (e: MouseEvent) => {
    if (!showROI) return;
    const pos = getMousePosition(e);
    if (!pos) return;
    
    const handle = getResizeHandle(pos, roi);
    if (handle) {
      if (handle === "rotate") {
        setInteractionMode("rotating");
      } else {
        setInteractionMode("resizing");
        setResizeHandle(handle);
      }
      setDragStart({ x: pos.x, y: pos.y, roi: { ...roi } });
    } else if (isInsideROI(pos, roi)) {
      setInteractionMode("moving");
      setDragStart({ x: pos.x, y: pos.y, roi: { ...roi } });
    }
  };
  
  const handleMouseMove = (e: MouseEvent) => {
    if (!dragStart || interactionMode === "none") return;
    const pos = getMousePosition(e);
    if (!pos) return;
    
    const dx = pos.x - dragStart.x;
    const dy = pos.y - dragStart.y;
    
    if (interactionMode === "moving") {
      setRoi({
        ...dragStart.roi,
        x: Math.max(0.1, Math.min(0.9, dragStart.roi.x + dx)),
        y: Math.max(0.1, Math.min(0.9, dragStart.roi.y + dy)),
      });
    } else if (interactionMode === "rotating") {
      // Calculate angle from center to mouse
      const angle = Math.atan2(pos.y - roi.y, pos.x - roi.x);
      const startAngle = Math.atan2(dragStart.y - dragStart.roi.y, dragStart.x - dragStart.roi.x);
      const deltaAngle = ((angle - startAngle) * 180) / Math.PI;
      setRoi({
        ...dragStart.roi,
        rotation: dragStart.roi.rotation + deltaAngle,
      });
    } else if (interactionMode === "resizing" && resizeHandle) {
      // Transform delta to local coordinates
      const cos = Math.cos((-dragStart.roi.rotation * Math.PI) / 180);
      const sin = Math.sin((-dragStart.roi.rotation * Math.PI) / 180);
      const localDx = dx * cos - dy * sin;
      const localDy = dx * sin + dy * cos;
      
      let newWidth = dragStart.roi.width;
      let newHeight = dragStart.roi.height;
      let newX = dragStart.roi.x;
      let newY = dragStart.roi.y;
      
      if (resizeHandle.includes("e")) {
        newWidth = Math.max(0.1, dragStart.roi.width + localDx * 2);
      }
      if (resizeHandle.includes("w")) {
        newWidth = Math.max(0.1, dragStart.roi.width - localDx * 2);
      }
      if (resizeHandle.includes("s")) {
        newHeight = Math.max(0.1, dragStart.roi.height + localDy * 2);
      }
      if (resizeHandle.includes("n")) {
        newHeight = Math.max(0.1, dragStart.roi.height - localDy * 2);
      }
      
      setRoi({ ...dragStart.roi, width: newWidth, height: newHeight, x: newX, y: newY });
    }
  };
  
  const handleMouseUp = () => {
    setInteractionMode("none");
    setDragStart(null);
    setResizeHandle(null);
  };
  
  // Save ROI to backend - flags all masks with insideRoi
  const handleSaveROI = async () => {
    if (!currentProject) return;
    
    setIsSavingROI(true);
    setRoiSaveResult(null);
    
    try {
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
      
      const result = await saveROI(currentProject.id, roiData);
      
      if (result.success && result.data) {
        console.log(`ROI saved: ${result.data.insideCount} inside, ${result.data.outsideCount} outside`);
        setRoiSaveResult({
          inside: result.data.insideCount,
          outside: result.data.outsideCount,
        });
      } else {
        console.error("Failed to save ROI:", result.error);
        alert(`Failed to save ROI: ${result.error}`);
      }
    } catch (error) {
      console.error("Error saving ROI:", error);
    } finally {
      setIsSavingROI(false);
    }
  };
  
  // Load intrados lines from saved data (tracing is now done in Step 5)
  useEffect(() => {
    const loadIntradosLines = async () => {
      if (!currentProject?.id) return;
      
      try {
        const response = await getIntradosLines(currentProject.id);
        if (response.success && response.data) {
          setIntradosLines(response.data.lines || []);
        }
      } catch (error) {
        console.error("Error loading intrados lines:", error);
      }
    };
    
    loadIntradosLines();
  }, [currentProject?.id]);
  
  const handleAnalyse = async () => {
    setIsAnalysing(true);
    
    try {
      // Demo analysis - replace with actual algorithm later
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const demoResult: GeometryResult = {
        classification: "starcut",
        bossStones: [
          { x: 200, y: 200, label: "Central Boss" },
          { x: 100, y: 100, label: "NW Boss" },
          { x: 300, y: 100, label: "NE Boss" },
          { x: 100, y: 300, label: "SW Boss" },
          { x: 300, y: 300, label: "SE Boss" },
        ],
        px: 1,
        py: 1,
      };
      
      setResult(demoResult);
      setGeometryResult({
        ...demoResult,
        boundingBox: {
          x: roi.x,
          y: roi.y,
          width: roi.width,
          height: roi.height,
        },
      });
    } finally {
      setIsAnalysing(false);
    }
  };
  
  const handleExportCSV = () => {
    if (!result) return;
    
    const csv = [
      "Property,Value",
      `Classification,${result.classification}`,
      `Boss Stone Count,${result.bossStones.length}`,
      `Px,${result.px}`,
      `Py,${result.py}`,
      "",
      "Boss Stones",
      "Label,X,Y",
      ...result.bossStones.map(b => `${b.label},${b.x},${b.y}`),
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "geometry-analysis.csv";
    a.click();
  };
  
  const handleContinue = () => {
    completeStep(4, { geometryResult: result });
    router.push("/workflow/step-5-reprojection");
  };
  
  const getClassificationIcon = (type: string) => {
    switch (type) {
      case "starcut": return <Star className="w-5 h-5" />;
      case "circlecut": return <Circle className="w-5 h-5" />;
      case "starcirclecut": return <Hexagon className="w-5 h-5" />;
      default: return null;
    }
  };
  
  // Check if we have data from previous steps
  const hasProjection = !!selectedProjection;
  const hasSegmentations = segmentations.length > 0;

  return (
    <div className="space-y-6">
      <StepHeader 
        title="2D Geometry Analysis"
        description="Review segmentation results and identify vault construction method"
      />
      
      {!hasProjection ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-12 text-center space-y-4">
            <AlertCircle className="w-12 h-12 mx-auto text-amber-500" />
            <div>
              <h3 className="text-lg font-medium">No Projection Available</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create projections in Step 2 before proceeding.
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
          {/* Left Panel - Segmentation Groups */}
          <div className="lg:col-span-3 space-y-4">
            {/* Segmentation Groups */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Segmentation Groups
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {segmentations.length} masks
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Toggle groups to show/hide on preview
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {hasSegmentations ? (
                  <>
                    {/* Select/Deselect All */}
                    <div className="flex gap-2 mb-3">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 h-7 text-xs"
                        onClick={() => toggleAllVisibility(true)}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Show All
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 h-7 text-xs"
                        onClick={() => toggleAllVisibility(false)}
                      >
                        <EyeOff className="w-3 h-3 mr-1" />
                        Hide All
                      </Button>
                    </div>
                    
                    {/* Group List */}
                    <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                      {Object.entries(groupVisibility).map(([label, info]) => (
                        <div
                          key={label}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                            info.visible === info.total 
                              ? "bg-primary/10 border border-primary/20"
                              : info.visible > 0
                                ? "bg-muted/50 border border-border"
                                : "bg-muted/30 border border-transparent opacity-60"
                          )}
                          onClick={() => toggleGroupVisibility(label)}
                        >
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: info.color }}
                          />
                          <span className="flex-1 text-sm truncate capitalize">
                            {label}
                          </span>
                          <Badge 
                            variant={info.visible === info.total ? "default" : "secondary"}
                            className="text-xs px-1.5"
                          >
                            {info.visible}/{info.total}
                          </Badge>
                          {info.visible === info.total ? (
                            <Eye className="w-3.5 h-3.5 text-primary" />
                          ) : info.visible > 0 ? (
                            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No segmentations yet</p>
                    <Button 
                      variant="link" 
                      size="sm"
                      onClick={() => router.push("/workflow/step-3-segmentation")}
                    >
                      Go to Segmentation
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Overlay Controls */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Overlay Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Show Masks</Label>
                  <Checkbox 
                    checked={showMaskOverlay}
                    onCheckedChange={(checked) => setShowMaskOverlay(!!checked)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Opacity: {Math.round(overlayOpacity * 100)}%</Label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={overlayOpacity * 100}
                    onChange={(e) => setOverlayOpacity(parseInt(e.target.value) / 100)}
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </CardContent>
            </Card>
            
            {/* ROI Controls */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Square className="w-4 h-4" />
                  Region of Interest
                </CardTitle>
                <CardDescription className="text-xs">
                  Drag to move, corners to resize, top handle to rotate
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Show ROI</Label>
                  <Checkbox 
                    checked={showROI}
                    onCheckedChange={(checked) => setShowROI(!!checked)}
                  />
                </div>
                
                {/* Rotation slider */}
                <div className="space-y-1.5">
                  <Label className="text-sm flex items-center gap-2">
                    <RotateCw className="w-3 h-3" />
                    Rotation: {Math.round(roi.rotation)}°
                  </Label>
                  <Slider
                    value={[roi.rotation]}
                    onValueChange={([v]) => setRoi(prev => ({ ...prev, rotation: v }))}
                    min={-180}
                    max={180}
                    step={1}
                    className="w-full"
                  />
                </div>
                
                {/* Size display */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Size: {Math.round(roi.width * 100)}% × {Math.round(roi.height * 100)}%</p>
                  <p>Center: ({Math.round(roi.x * 100)}%, {Math.round(roi.y * 100)}%)</p>
                </div>
                
                {/* Save button */}
                <Button
                  onClick={handleSaveROI}
                  disabled={isSavingROI || !hasSegmentations}
                  className="w-full gap-2"
                  size="sm"
                >
                  {isSavingROI ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save ROI
                </Button>
                
                {/* Result display */}
                {roiSaveResult && (
                  <div className="p-2 rounded-md bg-primary/10 border border-primary/20">
                    <p className="text-xs font-medium text-primary">ROI Saved</p>
                    <div className="flex gap-3 mt-1 text-xs">
                      <span className="text-green-600">
                        ✓ {roiSaveResult.inside} inside
                      </span>
                      <span className="text-muted-foreground">
                        {roiSaveResult.outside} outside
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          {/* Center - Preview Canvas */}
          <div className="lg:col-span-6">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="font-display">Projection Preview</CardTitle>
                    <CardDescription>
                      {selectedProjection?.settings?.perspective || "bottom"} view • {selectedProjection?.settings?.resolution || 2048}px
                    </CardDescription>
                  </div>
                  
                  {/* Image Type Toggle */}
                  <div className="flex gap-1">
                    {(["colour", "depthGrayscale", "depthPlasma"] as ImageViewType[]).map((type) => (
                      <Button
                        key={type}
                        variant={selectedImageType === type ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedImageType(type)}
                        className="h-7 text-xs"
                      >
                        {type === "colour" ? "RGB" : type === "depthGrayscale" ? "Depth" : "Plasma"}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div 
                  ref={canvasRef}
                  className="relative aspect-square bg-muted/30 rounded-lg overflow-hidden cursor-crosshair"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  {/* Base projection image */}
                  {currentImage ? (
                    <img
                      src={toImageSrc(currentImage)}
                      alt="Projection"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center text-muted-foreground">
                        <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No projection image available</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Mask overlays */}
                  {showMaskOverlay && visibleMasks.map((mask) => (
                    <img
                      key={mask.id}
                      src={toImageSrc(mask.mask)}
                      alt={mask.label}
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      style={{ opacity: overlayOpacity }}
                    />
                  ))}
                  
                  {/* ROI Overlay */}
                  {showROI && (
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      {/* ROI rectangle */}
                      <g transform={`rotate(${roi.rotation} ${roi.x * 100} ${roi.y * 100})`}>
                        {/* Main rectangle */}
                        <rect
                          x={(roi.x - roi.width / 2) * 100}
                          y={(roi.y - roi.height / 2) * 100}
                          width={roi.width * 100}
                          height={roi.height * 100}
                          fill="none"
                          stroke="hsl(var(--primary))"
                          strokeWidth="0.3"
                          strokeDasharray="1 0.5"
                          className="pointer-events-auto cursor-move"
                        />
                        
                        {/* Corner handles */}
                        {[
                          [roi.x - roi.width / 2, roi.y - roi.height / 2, "nw"],
                          [roi.x + roi.width / 2, roi.y - roi.height / 2, "ne"],
                          [roi.x + roi.width / 2, roi.y + roi.height / 2, "se"],
                          [roi.x - roi.width / 2, roi.y + roi.height / 2, "sw"],
                        ].map(([x, y, handle]) => (
                          <circle
                            key={handle as string}
                            cx={(x as number) * 100}
                            cy={(y as number) * 100}
                            r="1.2"
                            fill="hsl(var(--primary))"
                            stroke="white"
                            strokeWidth="0.3"
                            className="pointer-events-auto cursor-nwse-resize"
                          />
                        ))}
                        
                        {/* Rotation handle */}
                        <line
                          x1={roi.x * 100}
                          y1={(roi.y - roi.height / 2) * 100}
                          x2={roi.x * 100}
                          y2={(roi.y - roi.height / 2 - 0.05) * 100}
                          stroke="hsl(var(--primary))"
                          strokeWidth="0.2"
                        />
                        <circle
                          cx={roi.x * 100}
                          cy={(roi.y - roi.height / 2 - 0.05) * 100}
                          r="1"
                          fill="hsl(var(--accent))"
                          stroke="white"
                          strokeWidth="0.3"
                          className="pointer-events-auto cursor-grab"
                        />
                        
                        {/* Center crosshair */}
                        <circle
                          cx={roi.x * 100}
                          cy={roi.y * 100}
                          r="0.8"
                          fill="none"
                          stroke="hsl(var(--primary))"
                          strokeWidth="0.2"
                        />
                      </g>
                    </svg>
                  )}
                  
                  {/* Intrados Lines Overlay */}
                  {showIntrados && intradosLines.length > 0 && (
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox={`0 0 ${selectedProjection?.settings?.resolution || 2048} ${selectedProjection?.settings?.resolution || 2048}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {intradosLines.map((line) => {
                        if (line.points2d.length < 2) return null;
                        
                        // Create path from 2D points
                        const pathData = line.points2d
                          .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt[0]} ${pt[1]}`)
                          .join(' ');
                        
                        return (
                          <g key={line.id}>
                            {/* Shadow/glow effect */}
                            <path
                              d={pathData}
                              fill="none"
                              stroke="black"
                              strokeWidth="6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              opacity="0.3"
                            />
                            {/* Main line */}
                            <path
                              d={pathData}
                              fill="none"
                              stroke={line.color}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            {/* Start point */}
                            <circle
                              cx={line.points2d[0][0]}
                              cy={line.points2d[0][1]}
                              r="5"
                              fill={line.color}
                              stroke="white"
                              strokeWidth="2"
                            />
                            {/* End point */}
                            <circle
                              cx={line.points2d[line.points2d.length - 1][0]}
                              cy={line.points2d[line.points2d.length - 1][1]}
                              r="5"
                              fill={line.color}
                              stroke="white"
                              strokeWidth="2"
                            />
                          </g>
                        );
                      })}
                    </svg>
                  )}
                  
                  {/* Processing overlay */}
                  {isAnalysing && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                      <div className="text-center space-y-3">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
                        <p className="text-sm text-muted-foreground">Analysing geometry...</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Right Panel - Analysis Results */}
          <div className="lg:col-span-3 space-y-4">
            {/* Analysis Controls */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Geometry Analysis</CardTitle>
                <CardDescription className="text-xs">
                  Identify vault construction method
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  onClick={handleAnalyse} 
                  disabled={isAnalysing || !hasSegmentations}
                  className="w-full gap-2"
                >
                  {isAnalysing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Analyse Geometry
                </Button>
                
                {!hasSegmentations && (
                  <p className="text-xs text-muted-foreground text-center">
                    Run segmentation first to enable analysis
                  </p>
                )}
              </CardContent>
            </Card>
            
            {/* Intrados Lines (Display Only) */}
            {intradosLines.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Spline className="w-4 h-4" />
                    Intrados Lines
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="show-intrados"
                      checked={showIntrados}
                      onCheckedChange={(checked) => setShowIntrados(checked === true)}
                    />
                    <Label htmlFor="show-intrados" className="text-xs">Show</Label>
                  </div>
                </div>
                <CardDescription className="text-xs">
                  Traced in Step 5 (Reprojection)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {intradosLines.length} intrados lines traced
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {intradosLines.map((line) => (
                      <div 
                        key={line.id} 
                        className="flex items-center justify-between p-1.5 rounded bg-muted/50 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: line.color }}
                          />
                          <span>{line.label}</span>
                        </div>
                        <span className="text-muted-foreground">
                          {line.lineLength} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            )}
            
            {/* Classification Result */}
            <Card className={cn(!result && "opacity-50")}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Classification</CardTitle>
              </CardHeader>
              <CardContent>
                {result ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10">
                      {getClassificationIcon(result.classification)}
                      <div>
                        <p className="font-semibold capitalize">{result.classification}</p>
                        <p className="text-xs text-muted-foreground">Vault construction method</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                        <p className="text-xl font-bold text-primary">{result.px}</p>
                        <p className="text-xs text-muted-foreground">Px (X bays)</p>
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                        <p className="text-xl font-bold text-primary">{result.py}</p>
                        <p className="text-xs text-muted-foreground">Py (Y bays)</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Run analysis to see results
                  </p>
                )}
              </CardContent>
            </Card>
            
            {/* Boss Stones */}
            <Card className={cn(!result && "opacity-50")}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Boss Stones</CardTitle>
                <CardDescription className="text-xs">
                  {result ? `${result.bossStones.length} detected` : "Pending analysis"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result ? (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {result.bossStones.map((boss, i) => (
                      <div key={i} className="flex items-center justify-between p-1.5 rounded bg-muted/50 text-sm">
                        <span>{boss.label}</span>
                        <span className="text-xs text-muted-foreground">
                          ({boss.x.toFixed(0)}, {boss.y.toFixed(0)})
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No boss stones detected
                  </p>
                )}
              </CardContent>
            </Card>
            
            {/* Export */}
            <Card>
              <CardContent className="pt-4">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  disabled={!result}
                  onClick={handleExportCSV}
                >
                  <Download className="w-4 h-4" />
                  Export Results (CSV)
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      
      <StepActions>
        <Button variant="outline" onClick={() => router.push("/workflow/step-3-segmentation")} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to Segmentation
        </Button>
        <Button 
          onClick={handleContinue}
          className="gap-2"
        >
          Continue to Reprojection
          <ChevronRight className="w-4 h-4" />
        </Button>
      </StepActions>
    </div>
  );
}
