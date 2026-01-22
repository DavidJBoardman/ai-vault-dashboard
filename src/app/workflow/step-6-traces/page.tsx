"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { PointCloudViewer, generateDemoPointCloud } from "@/components/point-cloud/point-cloud-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useProjectStore } from "@/lib/store";
import { 
  ChevronLeft, 
  ChevronRight,
  Upload,
  Spline,
  RefreshCw,
  Check,
  Move,
  RotateCw,
  Maximize
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Step6TracesPage() {
  const router = useRouter();
  const { currentProject, addTrace3D, completeStep } = useProjectStore();
  
  const [traceSource, setTraceSource] = useState<"auto" | "manual">("auto");
  const [isLoading, setIsLoading] = useState(false);
  const [traceLoaded, setTraceLoaded] = useState(false);
  const [isAligned, setIsAligned] = useState(false);
  
  // Alignment controls
  const [scale, setScale] = useState([100]);
  const [rotationZ, setRotationZ] = useState([0]);
  const [translateX, setTranslateX] = useState([0]);
  const [translateY, setTranslateY] = useState([0]);
  
  const [pointCloudData] = useState(() => generateDemoPointCloud(20000));
  
  const handleLoadAutoTrace = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setTraceLoaded(true);
    setIsLoading(false);
  };
  
  const handleUploadManualTrace = async () => {
    if (typeof window !== "undefined" && window.electronAPI) {
      const result = await window.electronAPI.openFile({
        filters: [
          { name: "Trace Files", extensions: ["dxf", "obj", "txt"] },
        ],
      });
      
      if (!result.canceled && result.filePaths[0]) {
        setIsLoading(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        setTraceLoaded(true);
        setTraceSource("manual");
        setIsLoading(false);
      }
    } else {
      // Demo mode
      setIsLoading(true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      setTraceLoaded(true);
      setTraceSource("manual");
      setIsLoading(false);
    }
  };
  
  const handleConfirmAlignment = () => {
    setIsAligned(true);
    addTrace3D({
      id: `trace-${Date.now()}`,
      path: "auto-trace",
      aligned: true,
    });
  };
  
  const handleContinue = () => {
    completeStep(6, { traceSource, isAligned });
    router.push("/workflow/step-7-measurements");
  };

  return (
    <div className="space-y-6">
      <StepHeader 
        title="3D Geometry Description"
        description="Load and align intrados line traces with the 3D point cloud"
      />
      
      <Tabs value={traceSource} onValueChange={(v) => setTraceSource(v as "auto" | "manual")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="auto" className="gap-2">
            <Spline className="w-4 h-4" />
            Auto-Detected Trace
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <Upload className="w-4 h-4" />
            Manual Upload
          </TabsTrigger>
        </TabsList>
        
        <div className="mt-6 grid lg:grid-cols-3 gap-6">
          {/* 3D Viewer */}
          <div className="lg:col-span-2">
            <Card className="h-full min-h-[500px]">
              <CardContent className="h-full p-0">
                <div className="relative h-full">
                  <PointCloudViewer
                    points={pointCloudData}
                    className="h-full rounded-lg overflow-hidden"
                    colorMode="height"
                    showGrid={true}
                    showBoundingBox={true}
                  />
                  
                  {/* Trace overlay indicator */}
                  {traceLoaded && (
                    <div className="absolute top-4 left-4 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Spline className="w-4 h-4 text-primary" />
                        <span className="text-sm">
                          {isAligned ? "Trace aligned" : "Trace loaded - adjust alignment"}
                        </span>
                        {isAligned && <Check className="w-4 h-4 text-green-500" />}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Controls */}
          <div className="space-y-4">
            <TabsContent value="auto" className="mt-0 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display">Auto-Detected Trace</CardTitle>
                  <CardDescription>
                    Use the intrados lines detected in Step 3
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!traceLoaded ? (
                    <Button 
                      onClick={handleLoadAutoTrace} 
                      disabled={isLoading}
                      className="w-full gap-2"
                    >
                      {isLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Spline className="w-4 h-4" />
                      )}
                      Load Auto Trace
                    </Button>
                  ) : (
                    <div className="text-center py-4">
                      <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
                      <p className="text-sm">Auto trace loaded</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="manual" className="mt-0 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display">Manual Upload</CardTitle>
                  <CardDescription>
                    Upload a manually traced file (DXF, OBJ, or point list)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={handleUploadManualTrace}
                    disabled={isLoading}
                    className="w-full gap-2"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    Upload Trace File
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Alignment Controls */}
            <Card className={cn(!traceLoaded && "opacity-50 pointer-events-none")}>
              <CardHeader>
                <CardTitle className="text-lg font-display">Alignment</CardTitle>
                <CardDescription>
                  Adjust trace position to match point cloud
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Maximize className="w-4 h-4" />
                      Scale
                    </Label>
                    <span className="text-sm text-muted-foreground">{scale[0]}%</span>
                  </div>
                  <Slider
                    value={scale}
                    onValueChange={setScale}
                    min={50}
                    max={150}
                    step={1}
                  />
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <RotateCw className="w-4 h-4" />
                      Rotation
                    </Label>
                    <span className="text-sm text-muted-foreground">{rotationZ[0]}°</span>
                  </div>
                  <Slider
                    value={rotationZ}
                    onValueChange={setRotationZ}
                    min={-180}
                    max={180}
                    step={1}
                  />
                </div>
                
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <Move className="w-4 h-4" />
                    Translation
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>X</span>
                        <span>{translateX[0]}</span>
                      </div>
                      <Slider
                        value={translateX}
                        onValueChange={setTranslateX}
                        min={-10}
                        max={10}
                        step={0.1}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Y</span>
                        <span>{translateY[0]}</span>
                      </div>
                      <Slider
                        value={translateY}
                        onValueChange={setTranslateY}
                        min={-10}
                        max={10}
                        step={0.1}
                      />
                    </div>
                  </div>
                </div>
                
                <Button
                  onClick={handleConfirmAlignment}
                  disabled={!traceLoaded || isAligned}
                  className="w-full gap-2"
                >
                  <Check className="w-4 h-4" />
                  {isAligned ? "Alignment Confirmed" : "Confirm Alignment"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </Tabs>
      
      <StepActions>
        <Button variant="outline" onClick={() => router.push("/workflow/step-5-reprojection")} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to Reprojection
        </Button>
        <Button 
          onClick={handleContinue}
          disabled={!isAligned}
          className="gap-2"
        >
          Continue to Measurements
          <ChevronRight className="w-4 h-4" />
        </Button>
      </StepActions>
    </div>
  );
}

