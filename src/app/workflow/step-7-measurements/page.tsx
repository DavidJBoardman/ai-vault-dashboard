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
import { getReprojectionPreview, getIntradosLines, calculateMeasurements, calculateImpostLine, type RibImpostData, type ImpostLineResult, type ImpostLineRequest } from "@/lib/api";

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
  arc?: {
    center: Point3D;
    radius: number;
    startAngle: number;
    endAngle: number;
    u: { x: number; y: number; z: number };
    v: { x: number; y: number; z: number };
  };
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
    arcCenter: Point3D;
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
 * Convert normalized error value (0-1) to a color gradient (green to red)
 */
function errorToColor(normalizedError: number): string {
  const t = Math.max(0, Math.min(1, normalizedError));

  let r: number;
  let g: number;

  if (t < 0.5) {
    // Green → Yellow
    const localT = t * 2; // scale 0–0.5 to 0–1
    r = Math.round(255 * localT);
    g = 255;
  } else {
    // Yellow → Red
    const localT = (t - 0.5) * 2; // scale 0.5–1 to 0–1
    r = 255;
    g = Math.round(255 * (1 - localT));
  }

  return `rgb(${r}, ${g}, 0)`;
}

/**
 * Create colored line segments from trace points and error distances
 */
function createColoredTraceLines(
  segmentPoints: Point3D[],
  pointDistances: number[],
  traceId: string,
  isSelected: boolean = false
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
    
    // If selected, use full color gradient; otherwise use neutral gray
    const color = isSelected ? "rgb(180, 180, 180)" : errorToColor(normalizedError);
    
    lines.push({
      id: `${traceId}-segment-${i}`,
      label: `Segment ${i + 1}`,
      color,
      points: [segmentPoints[i], segmentPoints[i + 1]],
    });
  }
  
  return lines;
}

function createBestFitArcLines(
  segmentPoints: Point3D[],
  arcCenter: Point3D,
  arcRadius: number,
  traceId: string
): Line3D[] {
  if (segmentPoints.length < 3 || !arcCenter || arcRadius <= 0) return [];

  const arcColor = "rgb(100, 150, 255)";
  const lines: Line3D[] = [];

  // --- 1. Compute robust normal using cross of endpoints ---
  const pStart = segmentPoints[0];
  const pMid = segmentPoints[Math.floor(segmentPoints.length / 2)];
  const pEnd = segmentPoints[segmentPoints.length - 1];

  const v1 = {
    x: pMid.x - pStart.x,
    y: pMid.y - pStart.y,
    z: pMid.z - pStart.z,
  };

  const v2 = {
    x: pEnd.x - pStart.x,
    y: pEnd.y - pStart.y,
    z: pEnd.z - pStart.z,
  };

  let normal = {
    x: v1.y * v2.z - v1.z * v2.y,
    y: v1.z * v2.x - v1.x * v2.z,
    z: v1.x * v2.y - v1.y * v2.x,
  };

  const normalLen = Math.hypot(normal.x, normal.y, normal.z);
  if (normalLen === 0) return [];

  normal = {
    x: normal.x / normalLen,
    y: normal.y / normalLen,
    z: normal.z / normalLen,
  };

  // --- 2. Build basis ---
  const firstVec = {
    x: pStart.x - arcCenter.x,
    y: pStart.y - arcCenter.y,
    z: pStart.z - arcCenter.z,
  };

  const uLen = Math.hypot(firstVec.x, firstVec.y, firstVec.z);
  if (uLen === 0) return [];

  const u = {
    x: firstVec.x / uLen,
    y: firstVec.y / uLen,
    z: firstVec.z / uLen,
  };

  const v = {
    x: normal.y * u.z - normal.z * u.y,
    y: normal.z * u.x - normal.x * u.z,
    z: normal.x * u.y - normal.y * u.x,
  };

  // --- 3. Compute angles ---
  let angles = segmentPoints.map((p) => {
    const vec = {
      x: p.x - arcCenter.x,
      y: p.y - arcCenter.y,
      z: p.z - arcCenter.z,
    };

    const dotU = vec.x * u.x + vec.y * u.y + vec.z * u.z;
    const dotV = vec.x * v.x + vec.y * v.y + vec.z * v.z;

    return Math.atan2(dotV, dotU);
  });

  // --- 4. Sort + unwrap angles ---
  angles = angles.sort((a, b) => a - b);

  for (let i = 1; i < angles.length; i++) {
    while (angles[i] - angles[i - 1] > Math.PI) {
      angles[i] -= 2 * Math.PI;
    }
    while (angles[i] - angles[i - 1] < -Math.PI) {
      angles[i] += 2 * Math.PI;
    }
  }

  const minAngle = angles[0];
  const maxAngle = angles[angles.length - 1];

  // --- 5. Return as true mathematical arc with parameters ---
  // Sample just the endpoints for the preview spheres
  const arcPoints: Point3D[] = [
    {
      x: arcCenter.x + arcRadius * (Math.cos(minAngle) * u.x + Math.sin(minAngle) * v.x),
      y: arcCenter.y + arcRadius * (Math.cos(minAngle) * u.y + Math.sin(minAngle) * v.y),
      z: arcCenter.z + arcRadius * (Math.cos(minAngle) * u.z + Math.sin(minAngle) * v.z),
    },
    {
      x: arcCenter.x + arcRadius * (Math.cos(maxAngle) * u.x + Math.sin(maxAngle) * v.x),
      y: arcCenter.y + arcRadius * (Math.cos(maxAngle) * u.y + Math.sin(maxAngle) * v.y),
      z: arcCenter.z + arcRadius * (Math.cos(maxAngle) * u.z + Math.sin(maxAngle) * v.z),
    },
  ];

  lines.push({
    id: `${traceId}-ideal-arc`,
    label: `Ideal Arc`,
    color: arcColor,
    points: arcPoints,
    arc: {
      center: arcCenter,
      radius: arcRadius,
      startAngle: minAngle,
      endAngle: maxAngle,
      u,
      v,
    },
  });

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
  const [exportingRibs, setExportingRibs] = useState(false);
  
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
  const [viewMode, setViewMode] = useState<"errorHeatmap" | "bestFitArc">("errorHeatmap");
  
  // Impost line data
  const [impostLineData, setImpostLineData] = useState<ImpostLineResult | null>(null);
  const [isLoadingImpost, setIsLoadingImpost] = useState(false);
  const [impostMode, setImpostMode] = useState<"auto" | "floorPlane">("floorPlane");
  const step5FloorPlaneZ = currentProject?.stepData?.[5]?.floorPlaneZ as number | undefined;
  
  const selectedMeasurement = measurements.find(m => m.id === selectedRib);
  const selectedRibImpostData = selectedRib && impostLineData?.ribs[selectedRib] as RibImpostData | undefined;
  
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
  
  // Calculate impost line when intrados lines load or mode/floor plane changes
  useEffect(() => {
    const loadImpostLine = async () => {
      if (intradosLines.length === 0) return;
      
      // In floor plane mode, require a valid value from step 5
      if (impostMode === "floorPlane" && step5FloorPlaneZ === undefined) return;
      
      setIsLoadingImpost(true);
      setImpostLineData(null);
      try {
        const ribsData: ImpostLineRequest["ribs"] = intradosLines.map(line => ({
          id: line.id,
          points: line.points3d,
        }));
        
        const impostHeight = impostMode === "floorPlane" ? step5FloorPlaneZ : undefined;
        
        const response = await calculateImpostLine({
          ribs: ribsData,
          impostHeight,
        });
        
        if (response.success && response.data) {
          setImpostLineData(response.data);
        } else {
          console.error("Error loading impost line:", response.error);
        }
      } catch (err) {
        console.error("Error calculating impost line:", err);
      } finally {
        setIsLoadingImpost(false);
      }
    };
    
    loadImpostLine();
  }, [intradosLines, impostMode, step5FloorPlaneZ]);
  
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
            let lineTraces: Line3D[] = [];
            
            if (viewMode === "bestFitArc") {
              // Best fit arc view: uniform colored arc
              lineTraces = createBestFitArcLines(
                response.data.segmentPoints,
                response.data.arcCenter,
                response.data.arcRadius,
                line.id
              );
            } else {
              // Error heatmap view: color by fit error
              lineTraces = createColoredTraceLines(
                response.data.segmentPoints,
                response.data.pointDistances,
                line.id,
                line.id === selectedRib
              );
            }

            allTraces.push(...lineTraces);

            if (line.id === selectedRib) {
              setMeasurementData(response.data);
            }
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
  }, [intradosLines, selectedRib, viewMode]);
  
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

  // Export all ribs: query measurements for each intrados line and download CSV
  const handleExportAllRibs = async () => {
    if (!intradosLines || intradosLines.length === 0) return;
    setExportingRibs(true);

    const rows: string[] = [];
    // Header
    rows.push([
      "RibID",
      "ApexX",
      "ApexY",
      "ApexZ",
      "RibLength",
      "ArcRadius",
      "FitError",
      "ImpostDistance"
    ].join(","));

    for (const line of intradosLines) {
      try {
        const resp = await calculateMeasurements({
          traceId: line.id,
          segmentStart: 0,
          segmentEnd: 1,
          tracePoints: line.points3d,
        });

        let apex = { x: 0, y: 0, z: 0 };
        let ribLength = 0;
        let arcRadius = 0;
        let fitError = 0;
        let impostDistance = 0;

        if (resp.success && resp.data) {
          const d = resp.data;
          apex = d.apexPoint ?? apex;
          ribLength = d.ribLength ?? 0;
          arcRadius = d.arcRadius ?? 0;
          fitError = d.fitError ?? 0;
        } else {
          // Fallback: derive apex from raw line points
          const pts = line.points3d;
          if (pts && pts.length > 0) {
            const apexIdx = pts.reduce((maxIdx, p, idx, arr) => p[2] > arr[maxIdx][2] ? idx : maxIdx, 0);
            const ap = pts[apexIdx];
            apex = { x: ap[0], y: ap[1], z: ap[2] };
          }
        }

        // Get impost distance from impost line data
        if (impostLineData && impostLineData.ribs[line.id]) {
          impostDistance = impostLineData.ribs[line.id].impost_distance ?? 0;
        }

        rows.push([
          line.label,
          apex.x.toFixed(4),
          apex.y.toFixed(4),
          apex.z.toFixed(4),
          ribLength.toFixed(4),
          arcRadius.toFixed(4),
          fitError.toFixed(6),
          impostDistance.toFixed(4),
        ].join(","));
      } catch (err) {
        console.error(`Error exporting rib ${line.id}:`, err);
      }
    }

    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ribs_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setExportingRibs(false);
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
                  <CardTitle className="font-display">
                    {viewMode === "errorHeatmap" ? "3D Error Heatmap" : "3D Best Fit Arc"}
                  </CardTitle>
                  <CardDescription>
                    {viewMode === "errorHeatmap"
                      ? "Trace visualization colored by fit error (green = low error, red = high error)"
                      : "Ideal circular arcs for each rib based on calculated radius"}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border border-border bg-muted p-1">
                    <Button
                      variant={viewMode === "errorHeatmap" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("errorHeatmap")}
                      className="gap-1"
                    >
                      <Target className="w-3.5 h-3.5" />
                      <span className="text-xs">Error Heat</span>
                    </Button>
                    <Button
                      variant={viewMode === "bestFitArc" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("bestFitArc")}
                      className="gap-1"
                    >
                      <Circle className="w-3.5 h-3.5" />
                      <span className="text-xs">Best Fit Arc</span>
                    </Button>
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
                  {viewMode === "errorHeatmap" ? (
                    <>
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
                    </>
                  ) : (
                    <>
                      <p className="font-medium mb-2">Arc View</p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-3 rounded" style={{background: "rgb(100, 150, 255)"}}></div>
                          <span className="text-xs text-muted-foreground">Ideal Arc</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 max-w-xs">
                          Shows fitted circular arcs for each rib
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Measurements Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-display">Rib Measurements</CardTitle>
                  <CardDescription>Select a rib to view details</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleExportAllRibs} disabled={exportingRibs} className="gap-2">
                    {exportingRibs ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Export Ribs
                  </Button>
                </div>
              </div>
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
          
          {/* Impost Line Display */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-display">Impost Line</CardTitle>
                {isLoadingImpost && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Mode selector */}
              <div className="flex rounded-lg border border-border bg-muted p-1 gap-1">
                <Button
                  variant={impostMode === "floorPlane" ? "default" : "ghost"}
                  size="sm"
                  className="flex-1 text-xs h-7"
                  onClick={() => setImpostMode("floorPlane")}
                >
                  Floor Plane
                </Button>
                <Button
                  variant={impostMode === "auto" ? "default" : "ghost"}
                  size="sm"
                  className="flex-1 text-xs h-7"
                  onClick={() => setImpostMode("auto")}
                >
                  Auto
                </Button>
              </div>

              {/* Floor plane source info */}
              {impostMode === "floorPlane" && (
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  {step5FloorPlaneZ !== undefined ? (
                    <p className="text-muted-foreground">
                      Using floor plane Z from Step 5:{" "}
                      <span className="font-mono font-semibold text-foreground">
                        {step5FloorPlaneZ.toFixed(3)}m
                      </span>
                    </p>
                  ) : (
                    <p className="text-amber-600 dark:text-amber-400">
                      No floor plane set in Step 5. Enable a floor plane there first.
                    </p>
                  )}
                </div>
              )}

              {/* Result — only show height box in Auto mode */}
              {impostMode === "auto" && (
                impostLineData ? (
                  <>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-base font-bold">{impostLineData.impost_height.toFixed(3)}m</p>
                      <p className="text-xs text-muted-foreground">Height</p>
                    </div>
                    <div className="text-xs text-muted-foreground text-center">
                      Calculated from {impostLineData.num_ribs_used} springing rib(s)
                    </div>
                  </>
                ) : (
                  <div className="p-3 rounded-lg bg-muted/30 text-center text-xs text-muted-foreground">
                    {isLoadingImpost ? "Calculating..." : "No impost data available"}
                  </div>
                )
              )}
            </CardContent>
          </Card>
          
          {/* Selected Measurement Details */}
          {selectedMeasurement && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-display">{selectedMeasurement.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Impost Distance - mode-aware */}
                {isLoadingImpost ? (
                  <div className="p-3 rounded-lg bg-muted/30 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Recalculating impost distance...
                  </div>
                ) : selectedRibImpostData ? (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                    <p className="text-base font-bold text-blue-900 dark:text-blue-100">{selectedRibImpostData.impost_distance.toFixed(3)}m</p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">Impost Distance</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      {impostMode === "auto"
                        ? "Distance from springing point to auto-calculated impost line"
                        : `Distance from springing point to floor plane (Z = ${step5FloorPlaneZ?.toFixed(3)}m)`}
                    </p>
                  </div>
                ) : null}
                
                {/* Arc Radius and Rib Length */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <Circle className="w-4 h-4 mx-auto mb-1 text-primary" />
                    <p className="text-base font-bold">{(measurementData?.arcRadius ?? selectedMeasurement.arcRadius).toFixed(2)}m</p>
                    <p className="text-xs text-muted-foreground">Arc Radius</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <Ruler className="w-4 h-4 mx-auto mb-1 text-primary" />
                    <p className="text-base font-bold">{(measurementData?.ribLength ?? selectedMeasurement.ribLength).toFixed(2)}m</p>
                    <p className="text-xs text-muted-foreground">Rib Length</p>
                  </div>
                </div>
                
                {/* Fit Error */}
                {measurementData && (
                  <div className="p-2 rounded bg-muted/30">
                    <p className="text-xs text-muted-foreground">Fit Error</p>
                    <p className="text-sm font-medium">{measurementData.fitError.toFixed(4)}m</p>
                  </div>
                )}
                
                {/* Apex Point */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Apex Point</Label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2 rounded bg-muted/30 text-center">
                      <p className="text-muted-foreground font-medium">X</p>
                      <p className="font-mono">{selectedMeasurement.apexPoint?.x.toFixed(2)}</p>
                    </div>
                    <div className="p-2 rounded bg-muted/30 text-center">
                      <p className="text-muted-foreground font-medium">Y</p>
                      <p className="font-mono">{selectedMeasurement.apexPoint?.y.toFixed(2)}</p>
                    </div>
                    <div className="p-2 rounded bg-muted/30 text-center">
                      <p className="text-muted-foreground font-medium">Z</p>
                      <p className="font-mono">{selectedMeasurement.apexPoint?.z.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
                
                {/* Springing Points */}
                {selectedMeasurement.springingPoints && selectedMeasurement.springingPoints.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Springing Points</Label>
                    <div className="space-y-2">
                      {selectedMeasurement.springingPoints.map((point, idx) => (
                        <div key={idx} className="grid grid-cols-3 gap-2 text-xs">
                          <div className="p-2 rounded bg-muted/30 text-center">
                            <p className="text-muted-foreground font-medium">X</p>
                            <p className="font-mono">{point.x.toFixed(2)}</p>
                          </div>
                          <div className="p-2 rounded bg-muted/30 text-center">
                            <p className="text-muted-foreground font-medium">Y</p>
                            <p className="font-mono">{point.y.toFixed(2)}</p>
                          </div>
                          <div className="p-2 rounded bg-muted/30 text-center">
                            <p className="text-muted-foreground font-medium">Z</p>
                            <p className="font-mono">{point.z.toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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

