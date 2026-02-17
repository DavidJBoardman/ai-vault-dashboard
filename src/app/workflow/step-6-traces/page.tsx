"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { PointCloudViewer, Line3D } from "@/components/point-cloud/point-cloud-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useProjectStore } from "@/lib/store";
import { 
  getReprojectionPreview, 
  ReprojectionPoint, 
  getIntradosLines, 
  IntradosLine,
  exportIntrados3dm,
  import3dmTraces,
  getImportedTraces,
  ImportedCurve
} from "@/lib/api";
import { 
  ChevronLeft, 
  ChevronRight,
  Upload,
  Download,
  Spline,
  Check,
  Eye,
  Layers,
  Loader2,
  FileBox,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Step6TracesPage() {
  const router = useRouter();
  const { currentProject, addTrace3D, completeStep } = useProjectStore();
  
  // Trace source selection
  const [traceSource, setTraceSource] = useState<"auto" | "manual">("auto");
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  // 3D Preview data
  const [pointCloudData, setPointCloudData] = useState<ReprojectionPoint[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Intrados lines (auto-detected)
  const [autoIntradosLines, setAutoIntradosLines] = useState<IntradosLine[]>([]);
  const [showAutoLines, setShowAutoLines] = useState(true);
  
  // Manual traces (imported from 3DM)
  const [manualTraces, setManualTraces] = useState<ImportedCurve[]>([]);
  const [showManualLines, setShowManualLines] = useState(true);
  const [manualSource, setManualSource] = useState<string | null>(null);
  
  // Display settings
  const [lineWidth, setLineWidth] = useState(0.03);
  const [pointCount] = useState(500000);
  
  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportedFile, setExportedFile] = useState<string | null>(null);
  
  // Final selection
  const [selectedTraceType, setSelectedTraceType] = useState<"auto" | "manual" | "both">("auto");
  const [isConfirmed, setIsConfirmed] = useState(false);
  
  // Load 3D preview on mount
  useEffect(() => {
    const loadPreview = async () => {
      if (!currentProject?.id || pointCloudData) return;
      
      setPreviewLoading(true);
      try {
        const response = await getReprojectionPreview(
          currentProject.id,
          undefined, // All groups
          pointCount,
          true // showUnmaskedPoints
        );
        
        if (response.success && response.data?.points) {
          setPointCloudData(response.data.points);
        }
      } catch (err) {
        console.error("Error loading preview:", err);
      } finally {
        setPreviewLoading(false);
      }
    };
    
    loadPreview();
  }, [currentProject?.id, pointCloudData, pointCount]);
  
  // Load auto intrados lines on mount
  useEffect(() => {
    const loadAutoLines = async () => {
      if (!currentProject?.id) return;
      
      try {
        const response = await getIntradosLines(currentProject.id);
        if (response.success && response.data?.lines) {
          setAutoIntradosLines(response.data.lines);
        }
      } catch (err) {
        console.error("Error loading intrados lines:", err);
      }
    };
    
    loadAutoLines();
  }, [currentProject?.id]);
  
  // Load previously imported manual traces
  useEffect(() => {
    const loadManualTraces = async () => {
      if (!currentProject?.id) return;
      
      try {
        const response = await getImportedTraces(currentProject.id);
        if (response.success && response.data?.curves) {
          setManualTraces(response.data.curves);
          setManualSource(response.data.source || null);
        }
      } catch (err) {
        console.error("Error loading manual traces:", err);
      }
    };
    
    loadManualTraces();
  }, [currentProject?.id]);
  
  // Convert IntradosLine to Line3D format for viewer
  const intradosToLine3D = (line: IntradosLine): Line3D => ({
    id: line.id,
    label: line.label,
    color: line.color,
    points: line.points3d.map(([x, y, z]) => ({ x, y, z }))
  });
  
  // Convert imported curves to Line3D format for viewer
  const manualLinesForViewer = useMemo((): Line3D[] => {
    return manualTraces.map(curve => ({
      id: curve.id,
      label: curve.name,
      color: "#00ff88", // Distinct green color for manual traces
      points: curve.points.map(([x, y, z]) => ({ x, y, z: z ?? 0 }))
    }));
  }, [manualTraces]);
  
  // Combined lines for viewer based on selection
  const visibleLines = useMemo((): Line3D[] => {
    const lines: Line3D[] = [];
    
    if (showAutoLines && (selectedTraceType === "auto" || selectedTraceType === "both")) {
      lines.push(...autoIntradosLines.map(intradosToLine3D));
    }
    
    if (showManualLines && (selectedTraceType === "manual" || selectedTraceType === "both")) {
      lines.push(...manualLinesForViewer);
    }
    
    return lines;
  }, [autoIntradosLines, manualLinesForViewer, showAutoLines, showManualLines, selectedTraceType]);
  
  // Handle uploading a 3DM file
  const handleUpload3dm = async () => {
    if (!currentProject?.id) return;
    
    let filePath: string | null = null;
    
    if (typeof window !== "undefined" && window.electronAPI) {
      const result = await window.electronAPI.openFile({
        filters: [
          { name: "Rhino 3DM Files", extensions: ["3dm"] },
          { name: "All Files", extensions: ["*"] }
        ],
      });
      
      if (!result.canceled && result.filePaths[0]) {
        filePath = result.filePaths[0];
      }
    } else {
      // Demo mode - show alert
      alert("File upload requires the Electron app. In demo mode, traces cannot be imported.");
      return;
    }
    
    if (!filePath) return;
    
    setIsLoading(true);
    setLoadingMessage("Importing 3DM file...");
    setError(null);
    
    try {
      const response = await import3dmTraces(currentProject.id, filePath);
      
      if (response.success && response.data) {
        setManualTraces(response.data.curves);
        setManualSource(filePath);
        setTraceSource("manual");
        setSelectedTraceType("manual");
        setLoadingMessage(`Imported ${response.data.curveCount} curves`);
      } else {
        setError(response.error || "Failed to import 3DM file");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  };
  
  // Handle exporting to 3DM
  const handleExport3dm = async () => {
    if (!currentProject?.id) return;
    
    setIsExporting(true);
    setError(null);
    
    try {
      const response = await exportIntrados3dm(currentProject.id, "Intrados Lines");
      
      if (response.success && response.data) {
        setExportedFile(response.data.filePath);
        
        // Show success message
        alert(`Exported ${response.data.curvesExported} curves to:\n${response.data.fileName}`);
      } else {
        setError(response.error || "Export failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };
  
  // Handle confirming trace selection
  const handleConfirm = () => {
    setIsConfirmed(true);
    addTrace3D({
      id: `trace-${Date.now()}`,
      path: selectedTraceType === "manual" ? (manualSource || "manual") : "auto",
      aligned: true,
    });
  };
  
  // Handle continue to next step
  const handleContinue = () => {
    completeStep(6, { 
      traceSource: selectedTraceType,
      autoLinesCount: autoIntradosLines.length,
      manualLinesCount: manualTraces.length,
      isConfirmed 
    });
    router.push("/workflow/step-7-measurements");
  };

  return (
    <div className="space-y-6">
      <StepHeader 
        title="3D Geometry Traces"
        description="Export auto-detected traces or import manual traces from Rhino"
      />
      
      <div className="grid lg:grid-cols-3 gap-6">
        {/* 3D Viewer */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                {previewLoading ? (
                  <div className="h-[500px] rounded-lg bg-muted flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Loading 3D preview...</p>
                    </div>
                  </div>
                ) : pointCloudData ? (
                  <PointCloudViewer
                    points={pointCloudData}
                    className="h-[500px] rounded-lg overflow-hidden"
                    colorMode="height"
                    showGrid={true}
                    showBoundingBox={true}
                    lines={visibleLines}
                    lineWidth={lineWidth}
                  />
                ) : (
                  <div className="h-[500px] rounded-lg bg-muted flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">No point cloud data available</p>
                  </div>
                )}
                
                {/* Trace overlay indicator */}
                <div className="absolute top-4 left-4 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2 z-10 space-y-1">
                  {autoIntradosLines.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-0.5 bg-orange-500 rounded" />
                      <span>Auto: {autoIntradosLines.length} lines</span>
                      {showAutoLines && selectedTraceType !== "manual" && (
                        <Eye className="w-3 h-3 text-muted-foreground" />
                      )}
                    </div>
                  )}
                  {manualTraces.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-0.5 bg-green-500 rounded" />
                      <span>Manual: {manualTraces.length} curves</span>
                      {showManualLines && selectedTraceType !== "auto" && (
                        <Eye className="w-3 h-3 text-muted-foreground" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Controls Sidebar */}
        <div className="space-y-4">
          {/* Error display */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="p-3">
                <div className="flex items-start gap-2 text-destructive">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Auto-Detected Traces */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <Spline className="w-4 h-4" />
                  Auto-Detected Traces
                </CardTitle>
                {autoIntradosLines.length > 0 && (
                  <Badge variant="secondary">{autoIntradosLines.length}</Badge>
                )}
              </div>
              <CardDescription className="text-xs">
                Intrados lines generated from segmentation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {autoIntradosLines.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2">
                      <Checkbox
                        checked={showAutoLines}
                        onCheckedChange={(checked) => setShowAutoLines(!!checked)}
                      />
                      Show in viewer
                    </Label>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={handleExport3dm}
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Export as .3dm
                  </Button>
                  
                  {exportedFile && (
                    <p className="text-xs text-muted-foreground text-center">
                      Exported successfully
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No auto-detected traces available.
                  <br />
                  <span className="text-xs">Generate them on the Reprojection page.</span>
                </p>
              )}
            </CardContent>
          </Card>
          
          {/* Manual Traces */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <FileBox className="w-4 h-4" />
                  Manual Traces
                </CardTitle>
                {manualTraces.length > 0 && (
                  <Badge variant="secondary">{manualTraces.length}</Badge>
                )}
              </div>
              <CardDescription className="text-xs">
                Import hand-drawn traces from Rhino .3dm files
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={handleUpload3dm}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Upload .3dm File
              </Button>
              
              {manualTraces.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2">
                      <Checkbox
                        checked={showManualLines}
                        onCheckedChange={(checked) => setShowManualLines(!!checked)}
                      />
                      Show in viewer
                    </Label>
                  </div>
                  
                  {manualSource && (
                    <p className="text-xs text-muted-foreground truncate" title={manualSource}>
                      Source: {manualSource.split(/[/\\]/).pop()}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          
          {/* Display Settings */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Display Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Line Thickness</Label>
                  <span className="text-xs text-muted-foreground">{lineWidth.toFixed(3)}</span>
                </div>
                <Slider
                  value={[lineWidth]}
                  onValueChange={([v]) => setLineWidth(v)}
                  min={0.01}
                  max={0.1}
                  step={0.005}
                />
              </div>
            </CardContent>
          </Card>
          
          {/* Trace Selection */}
          <Card className={cn(
            (autoIntradosLines.length === 0 && manualTraces.length === 0) && "opacity-50 pointer-events-none"
          )}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-display">Use Traces</CardTitle>
              <CardDescription className="text-xs">
                Select which traces to use for measurements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Tabs value={selectedTraceType} onValueChange={(v) => setSelectedTraceType(v as any)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="auto" disabled={autoIntradosLines.length === 0}>
                    Auto
                  </TabsTrigger>
                  <TabsTrigger value="manual" disabled={manualTraces.length === 0}>
                    Manual
                  </TabsTrigger>
                  <TabsTrigger 
                    value="both" 
                    disabled={autoIntradosLines.length === 0 || manualTraces.length === 0}
                  >
                    Both
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              
              <Button
                onClick={handleConfirm}
                disabled={isConfirmed || (autoIntradosLines.length === 0 && manualTraces.length === 0)}
                className="w-full gap-2"
              >
                {isConfirmed ? (
                  <>
                    <Check className="w-4 h-4" />
                    Selection Confirmed
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirm Selection
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <StepActions>
        <Button variant="outline" onClick={() => router.push("/workflow/step-5-reprojection")} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to Reprojection
        </Button>
        <Button 
          onClick={handleContinue}
          disabled={!isConfirmed}
          className="gap-2"
        >
          Continue to Measurements
          <ChevronRight className="w-4 h-4" />
        </Button>
      </StepActions>
    </div>
  );
}
