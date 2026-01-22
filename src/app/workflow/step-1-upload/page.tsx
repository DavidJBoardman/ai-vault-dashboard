"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { PointCloudViewer, generateDemoPointCloud } from "@/components/point-cloud/point-cloud-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useProjectStore } from "@/lib/store";
import { 
  uploadE57, 
  loadDemoData as loadDemoDataApi, 
  getPointCloudPreview,
  checkBackendHealth,
  PointData
} from "@/lib/api";
import { 
  Upload, 
  FileUp, 
  CheckCircle, 
  AlertCircle,
  ChevronRight,
  Box,
  Layers,
  Loader2,
  Server,
  ServerOff,
  RefreshCw,
  Eye
} from "lucide-react";
import { cn } from "@/lib/utils";

// Point count presets
const POINT_COUNT_PRESETS = [
  { value: 50000, label: "50K" },
  { value: 100000, label: "100K" },
  { value: 250000, label: "250K" },
  { value: 500000, label: "500K" },
  { value: 1000000, label: "1M" },
  { value: 2000000, label: "2M" },
];

export default function Step1UploadPage() {
  const router = useRouter();
  const { 
    currentProject, 
    setE57Path, 
    setPointCloudStats, 
    completeStep 
  } = useProjectStore();
  
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingPoints, setIsLoadingPoints] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pointCloudData, setPointCloudData] = useState<PointData[] | null>(null);
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [boundingBox, setBoundingBox] = useState<{ min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null>(null);
  
  // Point count controls
  const [displayPointCount, setDisplayPointCount] = useState(100000);
  const [totalPointCount, setTotalPointCount] = useState(0);
  
  // For demo purposes
  const [demoMode, setDemoMode] = useState(false);

  // Check backend health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const isHealthy = await checkBackendHealth();
        setBackendStatus(isHealthy ? "online" : "offline");
      } catch {
        setBackendStatus("offline");
      }
    };
    checkHealth();
    
    // Check periodically
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);
  
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const e57File = files.find(f => f.name.endsWith('.e57'));
    
    if (e57File) {
      await processFile((e57File as any).path || e57File.name);
    } else {
      setUploadError("Please upload an E57 file");
    }
  }, []);
  
  const handleFileSelect = async () => {
    if (typeof window !== "undefined" && window.electronAPI) {
      const result = await window.electronAPI.openFile({
        filters: [{ name: "E57 Files", extensions: ["e57"] }],
      });
      
      if (!result.canceled && result.filePaths[0]) {
        await processFile(result.filePaths[0]);
      }
    } else {
      // Web fallback - use demo mode
      loadDemoData();
    }
  };
  
  const processFile = async (filePath: string) => {
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setDemoMode(false);
    
    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + 10, 70));
    }, 200);
    
    try {
      const response = await uploadE57(filePath);
      
      if (response.success && response.data) {
        setE57Path(filePath);
        setPointCloudStats({
          pointCount: response.data.pointCount,
          boundingBox: response.data.boundingBox,
        });
        setBoundingBox(response.data.boundingBox);
        setTotalPointCount(response.data.pointCount);
        
        setUploadProgress(80);
        
        // Now fetch the actual point cloud data
        await fetchPointCloudData(displayPointCount);
        
        setUploadProgress(100);
      } else {
        throw new Error(response.error || "Failed to process file");
      }
    } catch (error) {
      console.warn("Backend error, using demo mode:", error);
      loadDemoData();
    } finally {
      clearInterval(progressInterval);
      setIsUploading(false);
    }
  };
  
  const fetchPointCloudData = async (maxPoints: number) => {
    setIsLoadingPoints(true);
    try {
      const response = await getPointCloudPreview(maxPoints);
      
      if (response.success && response.data) {
        setPointCloudData(response.data.points);
        setTotalPointCount(response.data.total);
        if (response.data.bounding_box) {
          setBoundingBox(response.data.bounding_box);
        }
        setPointCloudStats({
          pointCount: response.data.total,
          boundingBox: response.data.bounding_box || undefined,
        });
      }
    } catch (error) {
      console.error("Failed to fetch point cloud:", error);
    } finally {
      setIsLoadingPoints(false);
    }
  };
  
  const handleRefreshPoints = async () => {
    if (backendStatus === "online") {
      await fetchPointCloudData(displayPointCount);
    }
  };
  
  const loadDemoData = async () => {
    setDemoMode(true);
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          return 90;
        }
        return prev + 5;
      });
    }, 50);
    
    try {
      // Try to use backend demo mode first
      if (backendStatus === "online") {
        const response = await loadDemoDataApi();
        
        if (response.success && response.data) {
          setPointCloudStats({
            pointCount: response.data.pointCount,
            boundingBox: response.data.boundingBox,
          });
          setBoundingBox(response.data.boundingBox);
          setTotalPointCount(response.data.pointCount);
          
          // Fetch the demo points
          await fetchPointCloudData(displayPointCount);
          setUploadProgress(100);
          return;
        }
      }
      
      // Fallback to client-side demo generation
      const demoPoints = generateDemoPointCloud(50000);
      setPointCloudData(demoPoints);
      setTotalPointCount(demoPoints.length);
      setPointCloudStats({
        pointCount: demoPoints.length,
        boundingBox: {
          min: { x: -5, y: -5, z: 0 },
          max: { x: 5, y: 5, z: 5 },
        },
      });
      setBoundingBox({
        min: { x: -5, y: -5, z: 0 },
        max: { x: 5, y: 5, z: 5 },
      });
      setUploadProgress(100);
    } finally {
      clearInterval(progressInterval);
      setIsUploading(false);
    }
  };
  
  const handleContinue = () => {
    completeStep(1, { hasPointCloud: true });
    router.push("/workflow/step-2-projection");
  };

  const formatBoundingBox = () => {
    if (!boundingBox) return "N/A";
    const dx = (boundingBox.max.x - boundingBox.min.x).toFixed(1);
    const dy = (boundingBox.max.y - boundingBox.min.y).toFixed(1);
    const dz = (boundingBox.max.z - boundingBox.min.z).toFixed(1);
    return `${dx} × ${dy} × ${dz}`;
  };
  
  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return n.toString();
  };

  return (
    <div className="space-y-6">
      <StepHeader 
        title="Upload E57 Scan"
        description="Import your 3D point cloud scan to begin the analysis workflow"
      />
      
      {/* Backend Status Indicator */}
      <div className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm w-fit",
        backendStatus === "online" && "bg-green-500/10 text-green-500",
        backendStatus === "offline" && "bg-amber-500/10 text-amber-500",
        backendStatus === "checking" && "bg-muted text-muted-foreground"
      )}>
        {backendStatus === "online" && <Server className="w-4 h-4" />}
        {backendStatus === "offline" && <ServerOff className="w-4 h-4" />}
        {backendStatus === "checking" && <Loader2 className="w-4 h-4 animate-spin" />}
        <span>
          {backendStatus === "online" && "Backend connected"}
          {backendStatus === "offline" && "Backend offline - Demo mode available"}
          {backendStatus === "checking" && "Checking backend..."}
        </span>
      </div>
      
      {!pointCloudData ? (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Upload Area */}
          <Card
            className={cn(
              "border-2 border-dashed transition-colors cursor-pointer",
              isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
              isUploading && "pointer-events-none opacity-70"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleFileSelect}
          >
            <CardContent className="flex flex-col items-center justify-center py-12">
              {isUploading ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <FileUp className="w-8 h-8 text-primary animate-pulse" />
                  </div>
                  <p className="font-medium mb-4">
                    {isLoadingPoints ? "Loading point cloud..." : "Processing E57 file..."}
                  </p>
                  <Progress value={uploadProgress} className="w-64" />
                  <p className="text-sm text-muted-foreground mt-2">{uploadProgress}%</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                  <p className="font-medium text-lg mb-2">Upload E57 Point Cloud</p>
                  <p className="text-sm text-muted-foreground text-center max-w-xs">
                    Drag and drop your E57 file here, or click to browse
                  </p>
                  {uploadError && (
                    <div className="flex items-center gap-2 mt-4 text-destructive">
                      <AlertCircle className="w-4 h-4" />
                      <p className="text-sm">{uploadError}</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          
          {/* Info Panel */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-display">Supported Formats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span>E57 (ASTM standard)</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  E57 is the standard format for 3D point cloud data from laser scanners. 
                  Make sure your scan includes color or intensity data for best results.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-display">Demo Mode</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Don't have an E57 file? Try the demo mode with a simulated vault point cloud.
                </p>
                <Button variant="outline" onClick={loadDemoData} disabled={isUploading}>
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load Demo Data"
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Success Banner */}
          {demoMode && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <p className="text-sm">
                <strong>Demo Mode:</strong> Using simulated vault data. Upload a real E57 file for actual analysis.
              </p>
            </div>
          )}
          
          {/* 3D Viewer */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle className="font-display">Point Cloud Preview</CardTitle>
                  <CardDescription className="mt-1">
                    Displaying {formatNumber(pointCloudData.length)} of {formatNumber(totalPointCount)} points
                    {totalPointCount > pointCloudData.length && (
                      <span className="text-amber-500 ml-2">
                        ({((pointCloudData.length / totalPointCount) * 100).toFixed(1)}% shown)
                      </span>
                    )}
                  </CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setPointCloudData(null);
                    setBoundingBox(null);
                    setTotalPointCount(0);
                  }}
                >
                  Upload New
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Point Count Controls */}
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
                      onClick={handleRefreshPoints}
                      disabled={isLoadingPoints || backendStatus !== "online"}
                      className="gap-1.5"
                    >
                      {isLoadingPoints ? (
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
              
              {/* Viewer */}
              <div className="relative">
                {isLoadingPoints && (
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                    <div className="text-center space-y-2">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                      <p className="text-sm text-muted-foreground">Loading {formatNumber(displayPointCount)} points...</p>
                    </div>
                  </div>
                )}
                <PointCloudViewer
                  points={pointCloudData}
                  className="h-[500px] rounded-lg overflow-hidden"
                  colorMode="height"
                  showGrid={true}
                  showBoundingBox={true}
                />
              </div>
            </CardContent>
          </Card>
          
          {/* Stats */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Layers className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {formatNumber(totalPointCount)}
                    </p>
                    <p className="text-sm text-muted-foreground">Total Points</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/10">
                    <Box className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{formatBoundingBox()}</p>
                    <p className="text-sm text-muted-foreground">Bounding Box (m)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">Ready</p>
                    <p className="text-sm text-muted-foreground">Processing Status</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      
      <StepActions>
        <div />
        <Button 
          onClick={handleContinue} 
          disabled={!pointCloudData}
          className="gap-2"
        >
          Continue to Projection
          <ChevronRight className="w-4 h-4" />
        </Button>
      </StepActions>
    </div>
  );
}
