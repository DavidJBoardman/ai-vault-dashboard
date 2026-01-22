"use client";

import { useState, useMemo, useEffect, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useProjectStore } from "@/lib/store";
import { 
  runSegmentation, 
  checkSamStatus, 
  SegmentationMask 
} from "@/lib/api";
import { 
  ChevronLeft, 
  ChevronRight, 
  Wand2,
  MousePointer,
  Square,
  Pencil,
  Eye,
  EyeOff,
  Spline,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  Check,
  Layers,
  Server,
  Plus,
  X,
  Type
} from "lucide-react";
import { cn } from "@/lib/utils";

// Image type for viewing projections
type ImageViewType = "colour" | "depthGrayscale" | "depthPlasma";
type Tool = "select" | "point" | "box" | "brush";

export default function Step3SegmentationPage() {
  const router = useRouter();
  const { 
    currentProject, 
    setSegmentations, 
    setIntradosLines, 
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
  const [showIntrados, setShowIntrados] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(0.8);
  
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
          setMasks(masks);
          
          // Convert to store format
          const storeSegmentations = masks.map((m: SegmentationMask) => ({
            id: m.id,
            label: m.label,
            color: m.color,
            mask: m.maskBase64,
            visible: m.visible,
            source: m.source as "auto" | "manual",
          }));
          setSegmentations(storeSegmentations);
        } else {
          // No masks found - this is not an error, just no matches
          setMasks([]);
          setSegmentations([]);
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
  
  const handleDetectIntrados = async () => {
    if (!selectedProjection) return;
    
    setIsProcessing(true);
    setProcessingMessage("Detecting intrados lines...");
    
    try {
      // For now, simulate intrados detection
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setIntradosLines([
        { id: "int-1", points: [], source: "auto" },
        { id: "int-2", points: [], source: "auto" },
        { id: "int-3", points: [], source: "auto" },
        { id: "int-4", points: [], source: "auto" },
      ]);
    } finally {
      setIsProcessing(false);
      setProcessingMessage("");
    }
  };
  
  const toggleMaskVisibility = (id: string) => {
    setMasks(prev => 
      prev.map(m => m.id === id ? { ...m, visible: !m.visible } : m)
    );
  };
  
  const selectAllMasks = () => {
    setMasks(prev => prev.map(m => ({ ...m, visible: true })));
  };
  
  const deselectAllMasks = () => {
    setMasks(prev => prev.map(m => ({ ...m, visible: false })));
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
    setMasks(prev => prev.map(m => {
      const baseLabel = m.label.replace(/\s*#?\d+$/, '').trim() || m.label;
      if (baseLabel === groupLabel) {
        return { ...m, visible };
      }
      return m;
    }));
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
          <div className="lg:col-span-3 space-y-4">
            {/* Projection Selection */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-display">Select Projection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-48 overflow-y-auto">
                {currentProject?.projections.map((proj) => (
                  <div
                    key={proj.id}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                      selectedProjectionId === proj.id
                        ? "bg-primary/20 ring-1 ring-primary"
                        : "bg-muted/50 hover:bg-muted"
                    )}
                    onClick={() => {
                      setSelectedProjectionId(proj.id);
                      setMasks([]); // Clear masks when changing projection
                    }}
                  >
                    <div className="w-10 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                      {proj.images?.colour ? (
                        <img
                          src={`data:image/png;base64,${proj.images.colour}`}
                          alt={proj.settings.perspective}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-full h-full p-2 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium capitalize truncate">
                        {proj.settings.perspective}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {proj.settings.resolution}px
                      </p>
                    </div>
                    {selectedProjectionId === proj.id && (
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
            
            {/* Segmentation Tools */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-display">Segmentation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Text Prompts Input */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <Type className="w-4 h-4" />
                    Text Prompts
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. rib, boss stone, vault cell..."
                      value={newPrompt}
                      onChange={(e) => setNewPrompt(e.target.value)}
                      onKeyDown={handlePromptKeyDown}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleAddPrompt}
                      disabled={!newPrompt.trim()}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  {/* Prompt Tags */}
                  {textPrompts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {textPrompts.map((prompt) => (
                        <Badge
                          key={prompt}
                          variant="secondary"
                          className="gap-1 pr-1"
                        >
                          {prompt}
                          <button
                            onClick={() => handleRemovePrompt(prompt)}
                            className="ml-1 hover:bg-muted rounded-full p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground">
                    {textPrompts.length === 0 
                      ? "Add prompts to find specific features, or leave empty for auto-detect"
                      : `${textPrompts.length} prompt${textPrompts.length > 1 ? 's' : ''} will guide segmentation`}
                  </p>
                </div>
                
                <Button 
                  variant="default" 
                  className="w-full gap-2"
                  onClick={handleAutoSegment}
                  disabled={isProcessing || !selectedProjection}
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4" />
                  )}
                  {textPrompts.length > 0 ? "Run with Prompts" : "Run SAM Segmentation"}
                </Button>
                
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { tool: "select", icon: MousePointer, label: "Select" },
                    { tool: "point", icon: MousePointer, label: "Point" },
                    { tool: "box", icon: Square, label: "Box" },
                    { tool: "brush", icon: Pencil, label: "Brush" },
                  ].map(({ tool, icon: Icon, label }) => (
                    <Button
                      key={tool}
                      variant={activeTool === tool ? "default" : "outline"}
                      size="sm"
                      className="gap-2"
                      onClick={() => setActiveTool(tool as Tool)}
                      disabled={!selectedProjection || masks.length === 0}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </Button>
                  ))}
                </div>
                
                <Button 
                  variant="secondary" 
                  className="w-full gap-2"
                  onClick={handleDetectIntrados}
                  disabled={isProcessing || !selectedProjection}
                >
                  <Spline className="w-4 h-4" />
                  Detect Intrados
                </Button>
              </CardContent>
            </Card>
            
            {/* Detected Segments */}
            {masks.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-display">Segments</CardTitle>
                    <span className="text-sm text-muted-foreground">
                      {visibleMasks.length}/{masks.length}
                    </span>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={selectAllMasks}
                    >
                      <Eye className="w-3 h-3" />
                      All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={deselectAllMasks}
                    >
                      <EyeOff className="w-3 h-3" />
                      None
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 max-h-80 overflow-y-auto">
                  {Object.entries(groupedMasks).map(([groupLabel, groupMasks]) => {
                    const groupColor = groupMasks[0]?.color || "#888";
                    const visibleInGroup = groupMasks.filter(m => m.visible).length;
                    const isFullyVisible = isGroupFullyVisible(groupLabel);
                    
                    return (
                      <div key={groupLabel} className="space-y-1">
                        {/* Group Header */}
                        <div
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors",
                            isFullyVisible ? "bg-primary/20" : "bg-muted/30 hover:bg-muted/50"
                          )}
                          onClick={() => toggleGroupVisibility(groupLabel, !isFullyVisible)}
                        >
                          <Checkbox
                            checked={isFullyVisible}
                            onCheckedChange={(checked) => toggleGroupVisibility(groupLabel, !!checked)}
                          />
                          <div
                            className="w-4 h-4 rounded flex-shrink-0"
                            style={{ backgroundColor: groupColor }}
                          />
                          <span className="text-sm font-medium flex-1 capitalize">
                            {groupLabel}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {visibleInGroup}/{groupMasks.length}
                          </Badge>
                        </div>
                        
                        {/* Individual Masks in Group */}
                        <div className="pl-6 space-y-0.5">
                          {groupMasks.map((mask) => (
                            <div
                              key={mask.id}
                              className={cn(
                                "flex items-center gap-2 p-1.5 rounded transition-colors text-sm",
                                mask.visible ? "opacity-100" : "opacity-40"
                              )}
                            >
                              <Checkbox
                                checked={mask.visible}
                                onCheckedChange={() => toggleMaskVisibility(mask.id)}
                                className="h-3.5 w-3.5"
                              />
                              <span className="flex-1 truncate text-xs">
                                {mask.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {(mask.area / 1000).toFixed(1)}k
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => toggleMaskVisibility(mask.id)}
                              >
                                {mask.visible ? (
                                  <Eye className="w-2.5 h-2.5" />
                                ) : (
                                  <EyeOff className="w-2.5 h-2.5" />
                                )}
                              </Button>
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
                    <div className="flex items-center gap-6 p-3 bg-muted/50 rounded-lg flex-wrap">
                      <div className="flex items-center gap-2">
                        <Checkbox 
                          id="show-intrados"
                          checked={showIntrados}
                          onCheckedChange={(checked) => setShowIntrados(checked as boolean)}
                        />
                        <Label htmlFor="show-intrados" className="text-sm">
                          Show Intrados
                        </Label>
                      </div>
                      
                      <div className="flex items-center gap-3 flex-1 max-w-xs">
                        <Layers className="w-4 h-4 text-muted-foreground" />
                        <Label className="text-sm whitespace-nowrap">Overlay</Label>
                        <Slider
                          value={[overlayOpacity * 100]}
                          onValueChange={([v]) => setOverlayOpacity(v / 100)}
                          min={0}
                          max={100}
                          step={5}
                          className="flex-1"
                        />
                        <span className="text-sm text-muted-foreground w-10">
                          {Math.round(overlayOpacity * 100)}%
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Image Preview */}
                  <div className="relative aspect-square max-w-2xl mx-auto bg-[#0a0f1a] rounded-lg overflow-hidden">
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
                        {/* Base projection image */}
                        <img
                          src={`data:image/png;base64,${currentImage}`}
                          alt="Projection"
                          className="w-full h-full object-contain"
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
                        
                        {masks.length > 0 && (
                          <div className="absolute bottom-3 left-3 bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                            {masks.length} segments
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
    </div>
  );
}
