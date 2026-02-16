"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { PointCloudViewer, generateDemoPointCloud } from "@/components/point-cloud/point-cloud-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProjectStore, Measurement, Hypothesis } from "@/lib/store";
import { 
  ChevronLeft, 
  ChevronRight,
  Ruler,
  Target,
  Circle,
  Save,
  History,
  Download,
  RefreshCw,
  Plus,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getReprojectionPreview, getIntradosLines, calculateMeasurements } from "@/lib/api";

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface ReprojectionPoint {
  x: number;
  y: number;
  z: number;
  r?: number;
  g?: number;
  b?: number;
}

interface IntradosLine {
  id: string;
  label: string;
  color: string;
  points3d: [number, number, number][];
}

interface Line3D {
  id: string;
  label: string;
  color: string;
  points: Point3D[];
}

interface MeasurementResponse {
  success: boolean;
  data?: {
    arcRadius: number;
    ribLength: number;
    apexPoint: Point3D;
    springingPoints: Point3D[];
    fitError: number;
    pointDistances: number[];
    segmentPoints: Point3D[];
  };
  error?: string;
}

const DEMO_MEASUREMENTS: Measurement[] = [
  { id: "m1", name: "Rib NE", arcRadius: 4.52, ribLength: 7.12, apexPoint: { x: 0, y: 0, z: 5.2 }, springingPoints: [{ x: -3, y: -3, z: 0 }], timestamp: new Date() },
  { id: "m2", name: "Rib NW", arcRadius: 4.48, ribLength: 7.08, apexPoint: { x: 0, y: 0, z: 5.2 }, springingPoints: [{ x: 3, y: -3, z: 0 }], timestamp: new Date() },
  { id: "m3", name: "Rib SE", arcRadius: 4.55, ribLength: 7.15, apexPoint: { x: 0, y: 0, z: 5.2 }, springingPoints: [{ x: -3, y: 3, z: 0 }], timestamp: new Date() },
  { id: "m4", name: "Rib SW", arcRadius: 4.50, ribLength: 7.10, apexPoint: { x: 0, y: 0, z: 5.2 }, springingPoints: [{ x: 3, y: 3, z: 0 }], timestamp: new Date() },
];

/**
 * Convert normalized error value (0-1) to a color gradient (blue to red)
 */
function errorToColor(normalizedError: number): string {
  // Clamp value between 0 and 1
  const t = Math.max(0, Math.min(1, normalizedError));
  
  // Blue (0, 0, 255) to Red (255, 0, 0)
  const r = Math.round(255 * t);
  const g = Math.round(255 * (1 - t));
  const b = 0;
  
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Create colored line segments from trace points and error distances
 */
function createColoredTraceLines(
  segmentPoints: Point3D[],
  pointDistances: number[],
  traceId: string
): Line3D[] {
  if (segmentPoints.length < 2 || pointDistances.length === 0) {
    return [];
  }
  
  // Find min and max distances for normalization
  const minDist = Math.min(...pointDistances);
  const maxDist = Math.max(...pointDistances);
  const range = maxDist - minDist || 1;
  
  // Create line segments between consecutive points
  const lines: Line3D[] = [];
  
  for (let i = 0; i < segmentPoints.length - 1; i++) {
    // Use average of the two endpoints' errors for the segment color
    const error1 = pointDistances[i];
    const error2 = pointDistances[i + 1];
    const avgError = (error1 + error2) / 2;
    
    // Normalize error to 0-1 range
    const normalizedError = Math.abs((avgError - minDist) / range);
    const color = errorToColor(normalizedError);
    
    lines.push({
      id: `${traceId}-segment-${i}`,
      label: `Segment ${i + 1}`,
      color,
      points: [segmentPoints[i], segmentPoints[i + 1]],
    });
  }
  
  return lines;
}

export default function Step7MeasurementsPage() {
  const router = useRouter();
  const { currentProject, addMeasurement, saveHypothesis, completeStep } = useProjectStore();
  
  const [measurements, setMeasurements] = useState<Measurement[]>(DEMO_MEASUREMENTS);
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [selectedRib, setSelectedRib] = useState<string | null>(null);
  const [hypothesisName, setHypothesisName] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  
  // Data loading states
  const [pointCloudData, setPointCloudData] = useState<ReprojectionPoint[] | null>(null);
  const [intradosLines, setIntradosLines] = useState<IntradosLine[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Filter controls
  const [arcFilter, setArcFilter] = useState([0, 10]);
  const [rotationFilter, setRotationFilter] = useState([0]);
  
  // Measurement visualization data
  const [measurementData, setMeasurementData] = useState<MeasurementResponse["data"] | null>(null);
  const [traceLines, setTraceLines] = useState<Line3D[]>([]);
  
  const selectedMeasurement = measurements.find(m => m.id === selectedRib);
  
  // Load 3D preview and intrados lines on mount or when project changes
  useEffect(() => {
    const loadData = async () => {
      if (!currentProject?.id) return;
      
      setPreviewLoading(true);
      try {
        // Load point cloud data
        const previewResponse = await getReprojectionPreview(
          currentProject.id,
          undefined, // All groups
          20000,
          true // showUnmaskedPoints
        );
        
        if (previewResponse.success && previewResponse.data?.points) {
          setPointCloudData(previewResponse.data.points);
        }
        
        // Load intrados lines
        const linesResponse = await getIntradosLines(currentProject.id);
        if (linesResponse.success && linesResponse.data?.lines) {
          const transformedLines: IntradosLine[] = linesResponse.data.lines.map(line => ({
            ...line,
            points3d: line.points3d.map(p => [p[0], p[1], p[2]] as [number, number, number])
          }));
          setIntradosLines(transformedLines);
          
          // Set first line as selected if available
          if (linesResponse.data.lines.length > 0 && !selectedRib) {
            setSelectedRib(linesResponse.data.lines[0].id);
          }
        }
      } catch (err) {
        console.error("Error loading preview data:", err);
      } finally {
        setPreviewLoading(false);
      }
    };
    
    loadData();
  }, [currentProject?.id, selectedRib]);
  
  // Compute colored traces for all intrados lines
  useEffect(() => {
    const computeAllTraces = async () => {
      const allTraces: Line3D[] = [];
      
      for (const line of intradosLines) {
        try {
          const response = await calculateMeasurements({
            traceId: line.id,
            segmentStart: 0,
            segmentEnd: 1,
            tracePoints: line.points3d,
          });
          
          if (response.success && response.data) {
            const coloredLines = createColoredTraceLines(
              response.data.segmentPoints,
              response.data.pointDistances,
              line.id
            );
            allTraces.push(...coloredLines);
          } else {
            console.error(`Error computing trace for ${line.id}:`, response.error);
          }
        } catch (err) {
          console.error(`Error computing trace for ${line.id}:`, err);
        }
      }
      
      setTraceLines(allTraces);
    };
    
    if (intradosLines.length > 0) {
      computeAllTraces();
    }
  }, [intradosLines]);
  
  // Load measurement data when rib is selected (for details panel)
  useEffect(() => {
    const loadMeasurement = async () => {
      if (!selectedRib) return;
      
      // Find the intrados line for this rib
      const selectedLine = intradosLines.find(line => line.id === selectedRib);
      if (!selectedLine) return;
      
      setIsCalculating(true);
      try {
        // Call the measurements API with actual trace points
        const response = await calculateMeasurements({
          traceId: selectedRib,
          segmentStart: 0,
          segmentEnd: 1,
          tracePoints: selectedLine.points3d,
        })
        
        const data: MeasurementResponse = {
          success: response.success,
          data: response.data as MeasurementResponse["data"],
          error: response.error,
        };
        
        if (data.success && data.data) {
          setMeasurementData(data.data);
        }
      } catch (err) {
        console.error("Error loading measurement:", err);
      } finally {
        setIsCalculating(false);
      }
    };
    
    loadMeasurement();
  }, [selectedRib, intradosLines]);
  
  // Convert IntradosLine to measurement format for display
  const intradosToMeasurement = (line: IntradosLine): Measurement => {
    const points = line.points3d;
    const apexIdx = points.reduce((maxIdx, point, idx, arr) => 
      point[2] > arr[maxIdx][2] ? idx : maxIdx, 0);
    const apexPoint = points[apexIdx];
    
    return {
      id: line.id,
      name: line.label,
      arcRadius: 0,
      ribLength: 0,
      apexPoint: {
        x: apexPoint[0],
        y: apexPoint[1],
        z: apexPoint[2],
      },
      springingPoints: [
        { x: points[0][0], y: points[0][1], z: points[0][2] },
        { x: points[points.length - 1][0], y: points[points.length - 1][1], z: points[points.length - 1][2] },
      ],
      timestamp: new Date(),
    };
  };
  
  // Convert intrados lines to measurements
  const loadedMeasurements = useMemo(() => {
    if (intradosLines.length > 0) {
      return intradosLines.map(intradosToMeasurement);
    }
    return DEMO_MEASUREMENTS;
  }, [intradosLines]);
  
  // Update measurements when loaded data changes
  useEffect(() => {
    setMeasurements(loadedMeasurements);
  }, [loadedMeasurements]);
  
  const handleCalculate = async () => {
    setIsCalculating(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsCalculating(false);
  };
  
  const handleSaveHypothesis = () => {
    if (!hypothesisName.trim()) return;
    
    const hypothesis: Hypothesis = {
      id: `hyp-${Date.now()}`,
      name: hypothesisName,
      description: `Measurements saved at ${new Date().toLocaleString()}`,
      measurements: [...measurements],
      createdAt: new Date(),
    };
    
    setHypotheses([...hypotheses, hypothesis]);
    saveHypothesis(hypothesis);
    setHypothesisName("");
  };
  
  const handleExport = () => {
    const csv = [
      "Rib,Arc Radius,Rib Length,Apex X,Apex Y,Apex Z",
      ...measurements.map(m => 
        `${m.name},${m.arcRadius},${m.ribLength},${m.apexPoint?.x || 0},${m.apexPoint?.y || 0},${m.apexPoint?.z || 0}`
      ),
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "measurements.csv";
    a.click();
  };
  
  const handleContinue = () => {
    completeStep(7, { measurements, hypotheses });
    router.push("/workflow/step-8-analysis");
  };

  return (
    <div className="space-y-6">
      <StepHeader 
        title="Measurements & Analysis"
        description="Calculate arc radius, rib length, and geometric properties"
      />
      
      <div className="grid lg:grid-cols-3 gap-6">
        {/* 3D Viewer with colored trace heatmap */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display">3D Heatmap View</CardTitle>
                  <CardDescription>
                    Trace visualization colored by fit error (blue = low error, red = high error)
                  </CardDescription>
                </div>
                <Button onClick={handleCalculate} disabled={isCalculating} size="sm" className="gap-2">
                  {isCalculating ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Ruler className="w-4 h-4" />
                  )}
                  Recalculate
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {previewLoading ? (
                  <div className="h-[400px] rounded-lg bg-muted flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Loading preview...</p>
                    </div>
                  </div>
                ) : pointCloudData ? (
                  <PointCloudViewer
                    points={pointCloudData}
                    className="h-[400px] rounded-lg overflow-hidden"
                    colorMode="height"
                    showGrid={true}
                    showBoundingBox={true}
                    lines={traceLines}
                    lineWidth={0.03}
                  />
                ) : (
                  <div className="h-[400px] rounded-lg bg-muted flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">No data available</p>
                  </div>
                )}
                
                {/* Color legend */}
                <div className="absolute bottom-4 right-4 bg-background/90 backdrop-blur-sm rounded-lg p-3 z-10 text-sm">
                  <p className="font-medium mb-2">Error Gradient</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-3 rounded" style={{background: "rgb(0, 255, 0)"}}></div>
                      <span className="text-xs text-muted-foreground">Low Error</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-3 rounded" style={{background: "rgb(255, 0, 0)"}}></div>
                      <span className="text-xs text-muted-foreground">High Error</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Measurements Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Rib Measurements</CardTitle>
              <CardDescription>Select a rib to view details</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {measurements.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "p-3 rounded-lg border cursor-pointer transition-colors",
                        selectedRib === m.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setSelectedRib(m.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{m.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {m.arcRadius > 0 && `R: ${m.arcRadius.toFixed(2)}m`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          
          {/* Selected Measurement Details */}
          {selectedMeasurement && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-display">{selectedMeasurement.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedMeasurement.arcRadius > 0 && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <Circle className="w-5 h-5 mx-auto mb-1 text-primary" />
                      <p className="text-lg font-bold">{selectedMeasurement.arcRadius.toFixed(2)}m</p>
                      <p className="text-xs text-muted-foreground">Arc Radius</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <Ruler className="w-5 h-5 mx-auto mb-1 text-primary" />
                      <p className="text-lg font-bold">{selectedMeasurement.ribLength.toFixed(2)}m</p>
                      <p className="text-xs text-muted-foreground">Rib Length</p>
                    </div>
                  </div>
                )}
                
                {measurementData && (
                  <div className="space-y-2">
                    <div className="p-2 rounded bg-muted/30">
                      <p className="text-xs text-muted-foreground">Fit Error</p>
                      <p className="text-sm font-medium">{measurementData.fitError.toFixed(4)}m</p>
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Apex Point</Label>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="p-2 rounded bg-muted/30 text-center">
                      <span className="text-muted-foreground">X:</span> {selectedMeasurement.apexPoint?.x.toFixed(2)}
                    </div>
                    <div className="p-2 rounded bg-muted/30 text-center">
                      <span className="text-muted-foreground">Y:</span> {selectedMeasurement.apexPoint?.y.toFixed(2)}
                    </div>
                    <div className="p-2 rounded bg-muted/30 text-center">
                      <span className="text-muted-foreground">Z:</span> {selectedMeasurement.apexPoint?.z.toFixed(2)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Filter Controls */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-display">Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Arc Radius Range</Label>
                  <span className="text-xs text-muted-foreground">
                    {arcFilter[0]} - {arcFilter[1]}m
                  </span>
                </div>
                <Slider
                  value={arcFilter}
                  onValueChange={setArcFilter}
                  min={0}
                  max={10}
                  step={0.1}
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Rotation Offset</Label>
                  <span className="text-xs text-muted-foreground">{rotationFilter[0]}°</span>
                </div>
                <Slider
                  value={rotationFilter}
                  onValueChange={setRotationFilter}
                  min={-45}
                  max={45}
                  step={1}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Hypothesis Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-display">Hypothesis History</CardTitle>
              <CardDescription>Save measurement configurations for comparison</CardDescription>
            </div>
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download className="w-4 h-4" />
              Export Data
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1 flex gap-2">
              <Input
                placeholder="Hypothesis name..."
                value={hypothesisName}
                onChange={(e) => setHypothesisName(e.target.value)}
              />
              <Button onClick={handleSaveHypothesis} disabled={!hypothesisName.trim()} className="gap-2">
                <Save className="w-4 h-4" />
                Save
              </Button>
            </div>
          </div>
          
          {hypotheses.length > 0 && (
            <div className="mt-4">
              <Label className="text-sm text-muted-foreground">Saved Hypotheses</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {hypotheses.map((h) => (
                  <div key={h.id} className="p-3 rounded-lg border bg-muted/30">
                    <p className="font-medium text-sm">{h.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.measurements.length} measurements
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <StepActions>
        <Button variant="outline" onClick={() => router.push("/workflow/step-6-traces")} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to Traces
        </Button>
        <Button onClick={handleContinue} className="gap-2">
          Continue to Analysis
          <ChevronRight className="w-4 h-4" />
        </Button>
      </StepActions>
    </div>
  );
}

