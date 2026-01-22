"use client";

import { useState } from "react";
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
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";

const DEMO_MEASUREMENTS: Measurement[] = [
  { id: "m1", name: "Rib NE", arcRadius: 4.52, ribLength: 7.12, apexPoint: { x: 0, y: 0, z: 5.2 }, springingPoints: [{ x: -3, y: -3, z: 0 }], timestamp: new Date() },
  { id: "m2", name: "Rib NW", arcRadius: 4.48, ribLength: 7.08, apexPoint: { x: 0, y: 0, z: 5.2 }, springingPoints: [{ x: 3, y: -3, z: 0 }], timestamp: new Date() },
  { id: "m3", name: "Rib SE", arcRadius: 4.55, ribLength: 7.15, apexPoint: { x: 0, y: 0, z: 5.2 }, springingPoints: [{ x: -3, y: 3, z: 0 }], timestamp: new Date() },
  { id: "m4", name: "Rib SW", arcRadius: 4.50, ribLength: 7.10, apexPoint: { x: 0, y: 0, z: 5.2 }, springingPoints: [{ x: 3, y: 3, z: 0 }], timestamp: new Date() },
];

export default function Step7MeasurementsPage() {
  const router = useRouter();
  const { currentProject, addMeasurement, saveHypothesis, completeStep } = useProjectStore();
  
  const [measurements, setMeasurements] = useState<Measurement[]>(DEMO_MEASUREMENTS);
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [selectedRib, setSelectedRib] = useState<string | null>("m1");
  const [hypothesisName, setHypothesisName] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  
  // Filter controls
  const [arcFilter, setArcFilter] = useState([0, 10]);
  const [rotationFilter, setRotationFilter] = useState([0]);
  
  const [pointCloudData] = useState(() => generateDemoPointCloud(20000));
  
  const selectedMeasurement = measurements.find(m => m.id === selectedRib);
  
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
        {/* 3D Viewer with heatmap */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display">3D Heatmap View</CardTitle>
                  <CardDescription>
                    Visualization of intrados line fit quality
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
            <CardContent className="h-[400px]">
              <PointCloudViewer
                points={pointCloudData}
                className="h-full rounded-lg overflow-hidden"
                colorMode="height"
                showGrid={true}
                showBoundingBox={true}
              />
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
                          R: {m.arcRadius.toFixed(2)}m
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

