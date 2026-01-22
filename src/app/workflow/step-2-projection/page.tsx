"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { PointCloudViewer } from "@/components/point-cloud/point-cloud-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectStore } from "@/lib/store";
import { createProjection, getPointCloudPreview, PointData } from "@/lib/api";
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus,
  Trash2,
  Eye,
  ArrowUp,
  ArrowDown,
  Compass,
  RefreshCw,
  Loader2,
  Image as ImageIcon,
  Box,
  Grid3X3,
  Layers
} from "lucide-react";
import { cn } from "@/lib/utils";

type Perspective = "top" | "bottom" | "north" | "south" | "east" | "west";

const PERSPECTIVE_OPTIONS: { value: Perspective; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "top", label: "Top Down", icon: <ArrowDown className="w-4 h-4" />, description: "Looking down at the vault" },
  { value: "bottom", label: "Bottom Up", icon: <ArrowUp className="w-4 h-4" />, description: "Looking up from below" },
  { value: "north", label: "North", icon: <Compass className="w-4 h-4" />, description: "View from north side" },
  { value: "south", label: "South", icon: <Compass className="w-4 h-4 rotate-180" />, description: "View from south side" },
  { value: "east", label: "East", icon: <Compass className="w-4 h-4 rotate-90" />, description: "View from east side" },
  { value: "west", label: "West", icon: <Compass className="w-4 h-4 -rotate-90" />, description: "View from west side" },
];

// Point count presets
const POINT_COUNT_PRESETS = [
  { value: 50000, label: "50K" },
  { value: 100000, label: "100K" },
  { value: 250000, label: "250K" },
  { value: 500000, label: "500K" },
  { value: 1000000, label: "1M" },
  { value: 2000000, label: "2M" },
];

// Helper to format numbers
const formatNumber = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
};

type ColorMode2D = "height" | "rgb" | "intensity" | "uniform";

// Canvas-based 2D projection preview - handles ALL points efficiently
function Projection2DPreview({ 
  points, 
  perspective,
  resolution,
  totalPointCount
}: { 
  points: PointData[]; 
  perspective: Perspective;
  resolution: number;
  totalPointCount: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [colorMode, setColorMode] = useState<ColorMode2D>("height");
  const [pointSize, setPointSize] = useState(1);
  
  // HSL to RGB helper
  const hsl2rgb = useCallback((h: number, s: number, l: number): [number, number, number] => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 1/6) { r = c; g = x; b = 0; }
    else if (h < 2/6) { r = x; g = c; b = 0; }
    else if (h < 3/6) { r = 0; g = c; b = x; }
    else if (h < 4/6) { r = 0; g = x; b = c; }
    else if (h < 5/6) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }, []);
  
  // Render to canvas - can handle ALL points
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const size = 800; // Internal canvas resolution
    canvas.width = size;
    canvas.height = size;
    
    // Clear and draw background
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, size, size);
    
    // Draw grid
    ctx.strokeStyle = '#1a2744';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const pos = (i / 10) * size;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }
    
    // Calculate bounds
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let minIntensity = Infinity, maxIntensity = -Infinity;
    
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
      if (p.intensity !== undefined) {
        if (p.intensity < minIntensity) minIntensity = p.intensity;
        if (p.intensity > maxIntensity) maxIntensity = p.intensity;
      }
    }
    
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const rangeZ = maxZ - minZ || 1;
    const rangeIntensity = maxIntensity - minIntensity || 1;
    
    // Project and sort all points by depth
    const projected: { x: number; y: number; depth: number; r: number; g: number; b: number }[] = [];
    
    for (const p of points) {
      let px: number, py: number, depth: number;
      
      switch (perspective) {
        case "top":
          px = (p.x - minX) / rangeX;
          py = (p.y - minY) / rangeY;
          depth = (p.z - minZ) / rangeZ;
          break;
        case "bottom":
          px = (p.x - minX) / rangeX;
          py = (maxY - p.y) / rangeY;
          depth = (maxZ - p.z) / rangeZ;
          break;
        case "north":
          px = (p.x - minX) / rangeX;
          py = (maxZ - p.z) / rangeZ;
          depth = (p.y - minY) / rangeY;
          break;
        case "south":
          px = (maxX - p.x) / rangeX;
          py = (maxZ - p.z) / rangeZ;
          depth = (maxY - p.y) / rangeY;
          break;
        case "east":
          px = (maxY - p.y) / rangeY;
          py = (maxZ - p.z) / rangeZ;
          depth = (maxX - p.x) / rangeX;
          break;
        case "west":
          px = (p.y - minY) / rangeY;
          py = (maxZ - p.z) / rangeZ;
          depth = (p.x - minX) / rangeX;
          break;
        default:
          px = (p.x - minX) / rangeX;
          py = (p.y - minY) / rangeY;
          depth = (p.z - minZ) / rangeZ;
      }
      
      // Calculate color based on mode
      let r: number, g: number, b: number;
      
      switch (colorMode) {
        case "rgb":
          if (p.r !== undefined && p.g !== undefined && p.b !== undefined) {
            const depthFactor = 0.6 + depth * 0.4;
            r = Math.floor(p.r * depthFactor);
            g = Math.floor(p.g * depthFactor);
            b = Math.floor(p.b * depthFactor);
          } else {
            const [hr, hg, hb] = hsl2rgb(0.08 - depth * 0.08, 0.7 + depth * 0.2, 0.5 - depth * 0.2);
            r = hr; g = hg; b = hb;
          }
          break;
          
        case "intensity":
          if (p.intensity !== undefined) {
            const normalizedIntensity = (p.intensity - minIntensity) / rangeIntensity;
            const value = Math.floor(40 + normalizedIntensity * 200);
            r = g = b = value;
          } else {
            const value = Math.floor(40 + depth * 180);
            r = g = b = value;
          }
          break;
          
        case "uniform":
          r = Math.floor(180 + depth * 40);
          g = Math.floor(140 + depth * 30);
          b = Math.floor(80 + depth * 20);
          break;
          
        case "height":
        default:
          const normalized = (p.z - minZ) / rangeZ;
          const [hr, hg, hb] = hsl2rgb(0.08 - normalized * 0.08, 0.7 + normalized * 0.2, 0.5 - normalized * 0.2);
          r = hr; g = hg; b = hb;
          break;
      }
      
      projected.push({ x: px, y: py, depth, r, g, b });
    }
    
    // Sort by depth (back to front)
    projected.sort((a, b) => a.depth - b.depth);
    
    // Draw all points
    const margin = size * 0.03;
    const drawSize = size - margin * 2;
    
    for (const p of projected) {
      ctx.fillStyle = `rgb(${Math.round(p.r)}, ${Math.round(p.g)}, ${Math.round(p.b)})`;
      ctx.beginPath();
      ctx.arc(
        margin + p.x * drawSize,
        margin + p.y * drawSize,
        pointSize,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    
    // Draw border
    ctx.strokeStyle = '#C9A227';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(margin, margin, drawSize, drawSize);
    ctx.globalAlpha = 1;
    
  }, [points, perspective, colorMode, pointSize, hsl2rgb]);
  
  if (points.length === 0) {
    return (
      <div className="aspect-square bg-muted/30 rounded-lg flex items-center justify-center">
        <p className="text-muted-foreground text-sm">No data</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      <div className="aspect-square bg-[#0a0f1a] rounded-lg overflow-hidden relative">
        <canvas 
          ref={canvasRef}
          className="w-full h-full"
          style={{ imageRendering: 'auto' }}
        />
        
        {/* Info overlays */}
        <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs">
          {resolution} × {resolution}
        </div>
        <div className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs capitalize">
          {perspective} projection
        </div>
        <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs">
          {formatNumber(points.length)} pts (preview)
        </div>
        
        {/* Full resolution indicator */}
        <div className="absolute bottom-2 left-2 bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          Output uses all {formatNumber(totalPointCount)}
        </div>
      </div>
      
      {/* Controls - same style as 3D viewer */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        {/* Color mode buttons */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {(["height", "rgb", "intensity", "uniform"] as const).map((mode) => (
            <Button
              key={mode}
              variant={colorMode === mode ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs capitalize"
              onClick={() => setColorMode(mode)}
            >
              {mode}
            </Button>
          ))}
        </div>
        
        {/* Point size slider */}
        <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-3 py-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Point Size</Label>
          <Slider
            value={[pointSize]}
            onValueChange={([v]) => setPointSize(v)}
            min={1}
            max={4}
            step={0.5}
            className="w-24"
          />
        </div>
      </div>
    </div>
  );
}

// Image type for viewing projections
type ImageViewType = "colour" | "depthGrayscale" | "depthPlasma";

export default function Step2ProjectionPage() {
  const router = useRouter();
  const { currentProject, addProjection, removeProjection, completeStep } = useProjectStore();
  
  // Projection settings
  const [perspective, setPerspective] = useState<Perspective>("top");
  const [resolution, setResolution] = useState(2048);
  const [sigma, setSigma] = useState(1.0);
  const [kernelSize, setKernelSize] = useState(5);
  const [bottomUp, setBottomUp] = useState(true);
  const [scale, setScale] = useState(1.0);
  
  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isReloading, setIsReloading] = useState(false);
  const [pointCloudData, setPointCloudData] = useState<PointData[]>([]);
  const [activeTab, setActiveTab] = useState("3d");
  const [selectedProjectionId, setSelectedProjectionId] = useState<string | null>(null);
  const [selectedImageType, setSelectedImageType] = useState<ImageViewType>("colour");
  const [totalPointCount, setTotalPointCount] = useState(0);
  const [displayPointCount, setDisplayPointCount] = useState(100000);
  
  // Get selected projection for display
  const selectedProjection = useMemo(() => {
    if (!selectedProjectionId || !currentProject?.projections) return null;
    return currentProject.projections.find(p => p.id === selectedProjectionId) || null;
  }, [selectedProjectionId, currentProject?.projections]);
  
  // Get current image based on selected type
  const currentImage = useMemo(() => {
    if (!selectedProjection?.images) return null;
    return selectedProjection.images[selectedImageType] || selectedProjection.images.colour;
  }, [selectedProjection, selectedImageType]);
  
  // Load point cloud data
  const loadPointCloud = async (maxPoints: number, showReloading = false) => {
    if (showReloading) {
      setIsReloading(true);
    } else {
      setIsLoading(true);
    }
    
    try {
      const response = await getPointCloudPreview(maxPoints);
      if (response.success && response.data) {
        setPointCloudData(response.data.points);
        setTotalPointCount(response.data.total);
      }
    } catch (error) {
      console.error("Failed to load point cloud:", error);
    } finally {
      setIsLoading(false);
      setIsReloading(false);
    }
  };
  
  // Load on mount
  useEffect(() => {
    loadPointCloud(displayPointCount);
  }, []);
  
  const handleReloadPoints = () => {
    loadPointCloud(displayPointCount, true);
  };
  
  const handleGenerate = async () => {
    setIsGenerating(true);
    
    try {
      const response = await createProjection({
        perspective,
        resolution,
        sigma,
        kernelSize,
        bottomUp,
        scale,
      });
      
      if (response.success && response.data) {
        addProjection({
          id: response.data.id,
          settings: { 
            perspective, 
            resolution, 
            sigma, 
            kernelSize, 
            bottomUp, 
            scale 
          },
          images: {
            colour: response.data.images.colour,
            depthGrayscale: response.data.images.depthGrayscale,
            depthPlasma: response.data.images.depthPlasma,
          },
          metadata: response.data.metadata,
        });
        
        // Auto-select the new projection
        setSelectedProjectionId(response.data.id);
      } else {
        console.error("Projection failed:", response.error);
      }
    } catch (error) {
      console.error("Failed to generate projection:", error);
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleContinue = () => {
    completeStep(2, { projections: currentProject?.projections });
    router.push("/workflow/step-3-segmentation");
  };

  return (
    <div className="space-y-6">
      <StepHeader 
        title="3D to 2D Projection"
        description="Generate scaled 2D images from different perspectives for segmentation analysis"
      />
      
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Settings Panel */}
        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-display">Projection Settings</CardTitle>
              <CardDescription>Select view angle and output options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Perspective Selection */}
              <div className="space-y-3">
                <Label>Perspective View</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PERSPECTIVE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      variant={perspective === option.value ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "justify-start gap-2 h-auto py-2",
                        perspective === option.value && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                      )}
                      onClick={() => setPerspective(option.value)}
                    >
                      {option.icon}
                      <span>{option.label}</span>
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {PERSPECTIVE_OPTIONS.find(o => o.value === perspective)?.description}
                </p>
              </div>
              
              {/* Resolution */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Output Resolution</Label>
                  <span className="text-sm font-medium text-primary">{resolution}px</span>
                </div>
                <Slider
                  value={[resolution]}
                  onValueChange={([v]) => setResolution(v)}
                  min={512}
                  max={4096}
                  step={256}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>512px</span>
                  <span>4096px</span>
                </div>
              </div>
              
              {/* Gaussian Sigma */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Gaussian Spread (σ)</Label>
                  <span className="text-sm font-medium text-primary">{sigma.toFixed(1)}</span>
                </div>
                <Slider
                  value={[sigma * 10]}
                  onValueChange={([v]) => setSigma(v / 10)}
                  min={5}
                  max={30}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Controls point spread. Higher = smoother, Lower = sharper
                </p>
              </div>
              
              {/* Kernel Size */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Kernel Size</Label>
                  <span className="text-sm font-medium text-primary">{kernelSize}px</span>
                </div>
                <Slider
                  value={[kernelSize]}
                  onValueChange={([v]) => setKernelSize(v % 2 === 0 ? v + 1 : v)}
                  min={3}
                  max={11}
                  step={2}
                />
                <p className="text-xs text-muted-foreground">
                  Gaussian kernel size (must be odd)
                </p>
              </div>
              
              {/* Bottom-up toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>Bottom-up View</Label>
                  <p className="text-xs text-muted-foreground">
                    Looking up at the vault
                  </p>
                </div>
                <Button
                  variant={bottomUp ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBottomUp(!bottomUp)}
                >
                  {bottomUp ? "On" : "Off"}
                </Button>
              </div>
              
              {/* Scale */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Scale Factor</Label>
                  <span className="text-sm font-medium text-primary">{scale.toFixed(1)}×</span>
                </div>
                <Slider
                  value={[scale * 10]}
                  onValueChange={([v]) => setScale(v / 10)}
                  min={5}
                  max={20}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Adjust to fit the vault region in the output image
                </p>
              </div>
              
              <Button 
                onClick={handleGenerate}
                disabled={isGenerating || isLoading}
                className="w-full gap-2"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add Projection
                  </>
                )}
              </Button>
              
              {totalPointCount > 0 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Projections will use all <strong>{totalPointCount.toLocaleString()}</strong> points at full resolution
                </p>
              )}
            </CardContent>
          </Card>
          
          {/* Generated Projections List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-display flex items-center justify-between">
                <span>Projections</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {currentProject?.projections.length || 0} created
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(currentProject?.projections.length || 0) === 0 ? (
                <div className="text-center py-6 space-y-2">
                  <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    No projections generated yet
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    Select a view and click "Add Projection"
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {currentProject?.projections.map((proj) => (
                    <div 
                      key={proj.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg transition-colors group cursor-pointer",
                        selectedProjectionId === proj.id 
                          ? "bg-primary/20 ring-1 ring-primary" 
                          : "bg-muted/50 hover:bg-muted"
                      )}
                      onClick={() => setSelectedProjectionId(proj.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                          {proj.images?.colour ? (
                            <img 
                              src={`data:image/png;base64,${proj.images.colour}`}
                              alt={`${proj.settings.perspective} projection`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Eye className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium capitalize">
                            {proj.settings.perspective} View
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {proj.settings.resolution}px • σ{proj.settings.sigma}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeProjection(proj.id);
                          if (selectedProjectionId === proj.id) {
                            setSelectedProjectionId(null);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Preview Panel */}
        <div className="lg:col-span-8">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="text-lg font-display">Preview</CardTitle>
                  <CardDescription>
                    {selectedProjection 
                      ? `Viewing generated ${selectedProjection.settings.perspective} projection`
                      : `Displaying ${formatNumber(pointCloudData.length)} of ${formatNumber(totalPointCount)} points`}
                    {!selectedProjection && totalPointCount > pointCloudData.length && (
                      <span className="text-amber-500 ml-1">
                        ({((pointCloudData.length / totalPointCount) * 100).toFixed(1)}% shown)
                      </span>
                    )}
                  </CardDescription>
                </div>
                {!selectedProjection && (
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="h-8">
                      <TabsTrigger value="3d" className="text-xs gap-1.5 px-3">
                        <Box className="w-3 h-3" />
                        3D View
                      </TabsTrigger>
                      <TabsTrigger value="2d" className="text-xs gap-1.5 px-3">
                        <Grid3X3 className="w-3 h-3" />
                        2D Preview
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Point Count Controls - same as Step 1 */}
              {!selectedProjection && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">Display Points</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono bg-background px-2 py-1 rounded">
                        {formatNumber(displayPointCount)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReloadPoints}
                        disabled={isLoading || isReloading}
                        className="gap-1.5"
                      >
                        {isReloading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        Reload
                      </Button>
                    </div>
                  </div>
                  
                  {/* Slider */}
                  <div className="space-y-2">
                    <Slider
                      value={[displayPointCount]}
                      onValueChange={([v]) => setDisplayPointCount(v)}
                      min={10000}
                      max={Math.min(totalPointCount || 2000000, 2000000)}
                      step={10000}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>10K</span>
                      <span>{formatNumber(Math.min(totalPointCount || 2000000, 2000000))}</span>
                    </div>
                  </div>
                  
                  {/* Quick presets */}
                  <div className="flex flex-wrap gap-2">
                    {POINT_COUNT_PRESETS.filter(p => p.value <= (totalPointCount || 2000000)).map((preset) => (
                      <Button
                        key={preset.value}
                        variant={displayPointCount === preset.value ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setDisplayPointCount(preset.value)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                    {totalPointCount > 0 && (
                      <Button
                        variant={displayPointCount === totalPointCount ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setDisplayPointCount(totalPointCount)}
                      >
                        All ({formatNumber(totalPointCount)})
                      </Button>
                    )}
                  </div>
                  
                  <p className="text-xs text-muted-foreground">
                    <strong>Note:</strong> The viewer shows a subset for performance. Projections will use all {formatNumber(totalPointCount)} points at full resolution.
                  </p>
                </div>
              )}
              
              {/* Main Preview Area */}
              {isLoading ? (
                <div className="h-[500px] rounded-lg bg-muted/30 flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">Loading point cloud...</p>
                  </div>
                </div>
              ) : selectedProjection?.images ? (
                // Show selected generated projection with image type selector
                <div className="space-y-4">
                  {/* Image Type Selector */}
                  <div className="flex justify-center gap-2">
                    <Button
                      variant={selectedImageType === "colour" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedImageType("colour")}
                    >
                      Colour
                    </Button>
                    <Button
                      variant={selectedImageType === "depthGrayscale" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedImageType("depthGrayscale")}
                    >
                      Depth (Gray)
                    </Button>
                    <Button
                      variant={selectedImageType === "depthPlasma" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedImageType("depthPlasma")}
                    >
                      Depth (Plasma)
                    </Button>
                  </div>
                  
                  <div className="aspect-square max-w-lg mx-auto rounded-lg overflow-hidden bg-[#0a0f1a] relative">
                    {currentImage ? (
                      <img 
                        src={`data:image/png;base64,${currentImage}`}
                        alt={`${selectedProjection.settings.perspective} projection - ${selectedImageType}`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        Image not available
                      </div>
                    )}
                    <div className="absolute top-3 left-3 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs capitalize">
                      {selectedProjection.settings.perspective} view
                    </div>
                    <div className="absolute top-3 right-3 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs">
                      {selectedProjection.settings.resolution}px • σ{selectedProjection.settings.sigma}
                    </div>
                    <div className="absolute bottom-3 left-3 bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      Gaussian Splatting
                    </div>
                    <div className="absolute bottom-3 right-3 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs capitalize">
                      {selectedImageType === "depthGrayscale" ? "Depth (Grayscale)" : 
                       selectedImageType === "depthPlasma" ? "Depth (Plasma)" : "Colour"}
                    </div>
                  </div>
                  
                  {/* Metadata info */}
                  {selectedProjection.metadata && (
                    <div className="text-center text-xs text-muted-foreground">
                      {selectedProjection.metadata.point_count?.toLocaleString()} points rendered
                    </div>
                  )}
                  
                  <div className="text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedProjectionId(null)}
                    >
                      Back to Preview
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  {isReloading && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                      <div className="text-center space-y-2">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                        <p className="text-sm text-muted-foreground">Loading {formatNumber(displayPointCount)} points...</p>
                      </div>
                    </div>
                  )}
                  
                  {activeTab === "3d" && (
                    <>
                      {/* Perspective indicator */}
                      <div className="mb-3 flex items-center gap-3 px-3 py-2 bg-primary/10 rounded-lg">
                        <div className="flex items-center gap-2 text-primary">
                          {PERSPECTIVE_OPTIONS.find(o => o.value === perspective)?.icon}
                          <span className="text-sm font-medium capitalize">{perspective} View Selected</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          — Rotate the view to inspect, then click "Add Projection" to capture
                        </span>
                      </div>
                      
                      {/* Use the same PointCloudViewer as Step 1 */}
                      <PointCloudViewer
                        points={pointCloudData}
                        className="h-[500px] rounded-lg overflow-hidden"
                        colorMode="height"
                        showGrid={true}
                        showBoundingBox={true}
                      />
                    </>
                  )}
                  {activeTab === "2d" && (
                    <div className="flex justify-center">
                      <div className="w-full max-w-lg">
                        <Projection2DPreview
                          points={pointCloudData}
                          perspective={perspective}
                          resolution={resolution}
                          totalPointCount={totalPointCount}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      <StepActions>
        <Button variant="outline" onClick={() => router.push("/workflow/step-1-upload")} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to Upload
        </Button>
        <Button 
          onClick={handleContinue} 
          disabled={(currentProject?.projections.length || 0) === 0}
          className="gap-2"
        >
          Continue to Segmentation
          <ChevronRight className="w-4 h-4" />
        </Button>
      </StepActions>
    </div>
  );
}
