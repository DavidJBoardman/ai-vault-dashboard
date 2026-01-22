"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { ProjectionPreviewViewer } from "@/components/point-cloud/projection-preview-viewer";
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
  Grid3X3
} from "lucide-react";
import { cn } from "@/lib/utils";

type Perspective = "top" | "bottom" | "north" | "south" | "east" | "west" | "custom";

const PERSPECTIVE_OPTIONS: { value: Perspective; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "top", label: "Top Down", icon: <ArrowDown className="w-4 h-4" />, description: "Looking down at the vault" },
  { value: "bottom", label: "Bottom Up", icon: <ArrowUp className="w-4 h-4" />, description: "Looking up from below" },
  { value: "north", label: "North", icon: <Compass className="w-4 h-4" />, description: "View from north side" },
  { value: "south", label: "South", icon: <Compass className="w-4 h-4 rotate-180" />, description: "View from south side" },
  { value: "east", label: "East", icon: <Compass className="w-4 h-4 rotate-90" />, description: "View from east side" },
  { value: "west", label: "West", icon: <Compass className="w-4 h-4 -rotate-90" />, description: "View from west side" },
];

// Simple 2D projection preview component
function Projection2DPreview({ 
  points, 
  perspective,
  resolution 
}: { 
  points: PointData[]; 
  perspective: Perspective;
  resolution: number;
}) {
  const projectedPoints = useMemo(() => {
    if (points.length === 0) return [];
    
    // Project points based on perspective
    let projected: { x: number; y: number; depth: number; color: string }[] = [];
    
    // Find bounds
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    points.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });
    
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const rangeZ = maxZ - minZ || 1;
    
    // Downsample for preview (max 5000 points)
    const step = Math.max(1, Math.floor(points.length / 5000));
    
    for (let i = 0; i < points.length; i += step) {
      const p = points[i];
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
      
      // Color based on depth
      const brightness = 40 + depth * 60;
      const r = p.r !== undefined ? Math.floor(p.r * (0.5 + depth * 0.5)) : brightness + 20;
      const g = p.g !== undefined ? Math.floor(p.g * (0.5 + depth * 0.5)) : brightness + 10;
      const b = p.b !== undefined ? Math.floor(p.b * (0.5 + depth * 0.5)) : brightness;
      
      projected.push({
        x: px,
        y: py,
        depth,
        color: `rgb(${r}, ${g}, ${b})`
      });
    }
    
    // Sort by depth (back to front)
    projected.sort((a, b) => a.depth - b.depth);
    
    return projected;
  }, [points, perspective]);
  
  if (points.length === 0) {
    return (
      <div className="aspect-square bg-muted/30 rounded-lg flex items-center justify-center">
        <p className="text-muted-foreground text-sm">No data</p>
      </div>
    );
  }
  
  return (
    <div className="aspect-square bg-[#0a0f1a] rounded-lg overflow-hidden relative">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Background */}
        <rect width="100" height="100" fill="#0a0f1a" />
        
        {/* Grid */}
        <g stroke="#1a2744" strokeWidth="0.2">
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(i => (
            <g key={i}>
              <line x1={i} y1="0" x2={i} y2="100" />
              <line x1="0" y1={i} x2="100" y2={i} />
            </g>
          ))}
        </g>
        
        {/* Projected points */}
        {projectedPoints.map((p, i) => (
          <circle
            key={i}
            cx={5 + p.x * 90}
            cy={5 + p.y * 90}
            r={0.3}
            fill={p.color}
            opacity={0.8}
          />
        ))}
        
        {/* Border */}
        <rect 
          x="2" y="2" 
          width="96" height="96" 
          fill="none" 
          stroke="#C9A227" 
          strokeWidth="0.3"
          opacity="0.5"
        />
      </svg>
      
      {/* Resolution indicator */}
      <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs">
        {resolution} × {resolution}
      </div>
      
      {/* Perspective label */}
      <div className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs capitalize">
        {perspective} projection
      </div>
    </div>
  );
}

export default function Step2ProjectionPage() {
  const router = useRouter();
  const { currentProject, addProjection, removeProjection, completeStep } = useProjectStore();
  
  const [perspective, setPerspective] = useState<Perspective>("top");
  const [resolution, setResolution] = useState(2048);
  const [scale, setScale] = useState(1.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pointCloudData, setPointCloudData] = useState<PointData[]>([]);
  const [activeTab, setActiveTab] = useState("3d");
  const [selectedProjectionId, setSelectedProjectionId] = useState<string | null>(null);
  
  // Get selected projection for display
  const selectedProjection = useMemo(() => {
    if (!selectedProjectionId || !currentProject?.projections) return null;
    return currentProject.projections.find(p => p.id === selectedProjectionId) || null;
  }, [selectedProjectionId, currentProject?.projections]);
  
  // Load point cloud data on mount
  useEffect(() => {
    const loadPointCloud = async () => {
      setIsLoading(true);
      try {
        const response = await getPointCloudPreview(30000);
        if (response.success && response.data) {
          setPointCloudData(response.data.points);
        }
      } catch (error) {
        console.error("Failed to load point cloud:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadPointCloud();
  }, []);
  
  const handleGenerate = async () => {
    setIsGenerating(true);
    
    try {
      const response = await createProjection({
        perspective,
        resolution,
        scale,
      });
      
      if (response.success && response.data) {
        addProjection({
          id: response.data.id,
          settings: { perspective, resolution, scale },
          imagePath: response.data.imagePath,
          imageBase64: response.data.imageBase64,
        });
      } else {
        // Fallback demo
        addProjection({
          id: `proj-${Date.now()}`,
          settings: { perspective, resolution, scale },
          imagePath: "/demo-projection.png",
        });
      }
    } catch (error) {
      console.error("Failed to generate projection:", error);
      // Add anyway for demo
      addProjection({
        id: `proj-${Date.now()}`,
        settings: { perspective, resolution, scale },
        imagePath: "/demo-projection.png",
      });
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
                        {/* Thumbnail */}
                        <div className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                          {proj.imageBase64 ? (
                            <img 
                              src={`data:image/png;base64,${proj.imageBase64}`}
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
                            {proj.settings.resolution}px • {proj.settings.scale}×
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
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-display">Preview</CardTitle>
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
              </div>
              <CardDescription>
                {activeTab === "3d" 
                  ? "Visualize the projection plane on your 3D model" 
                  : "Preview of the 2D projection output"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="aspect-[4/3] rounded-lg bg-muted/30 flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">Loading point cloud...</p>
                  </div>
                </div>
              ) : selectedProjection?.imageBase64 ? (
                // Show selected generated projection
                <div className="space-y-4">
                  <div className="aspect-square max-w-lg mx-auto rounded-lg overflow-hidden bg-[#0a0f1a] relative">
                    <img 
                      src={`data:image/png;base64,${selectedProjection.imageBase64}`}
                      alt={`${selectedProjection.settings.perspective} projection`}
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute top-3 left-3 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs capitalize">
                      {selectedProjection.settings.perspective} view
                    </div>
                    <div className="absolute top-3 right-3 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs">
                      {selectedProjection.settings.resolution}px
                    </div>
                    <div className="absolute bottom-3 left-3 bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      Generated
                    </div>
                  </div>
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
                <>
                  {activeTab === "3d" && (
                    <ProjectionPreviewViewer
                      points={pointCloudData}
                      perspective={perspective}
                      className="aspect-[4/3] rounded-lg overflow-hidden"
                    />
                  )}
                  {activeTab === "2d" && (
                    <div className="flex justify-center">
                      <div className="w-full max-w-md">
                        <Projection2DPreview
                          points={pointCloudData}
                          perspective={perspective}
                          resolution={resolution}
                        />
                      </div>
                    </div>
                  )}
                </>
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
