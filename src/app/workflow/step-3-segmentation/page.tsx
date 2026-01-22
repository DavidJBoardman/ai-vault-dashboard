"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useProjectStore, Segmentation } from "@/lib/store";
import { runSegmentation, detectIntradosLines } from "@/lib/api";
import { 
  ChevronLeft, 
  ChevronRight, 
  Wand2,
  MousePointer,
  Square,
  Pencil,
  Eye,
  EyeOff,
  RefreshCw,
  Layers,
  Spline
} from "lucide-react";
import { cn } from "@/lib/utils";

const DEMO_SEGMENTATIONS: Segmentation[] = [
  { id: "seg-1", label: "Rib 1 (NE)", color: "#e74c3c", mask: "", visible: true, source: "auto" },
  { id: "seg-2", label: "Rib 2 (NW)", color: "#3498db", mask: "", visible: true, source: "auto" },
  { id: "seg-3", label: "Rib 3 (SE)", color: "#2ecc71", mask: "", visible: true, source: "auto" },
  { id: "seg-4", label: "Rib 4 (SW)", color: "#9b59b6", mask: "", visible: true, source: "auto" },
  { id: "seg-5", label: "Boss Stone", color: "#f39c12", mask: "", visible: true, source: "auto" },
];

type Tool = "select" | "point" | "box" | "brush";

export default function Step3SegmentationPage() {
  const router = useRouter();
  const { currentProject, setSegmentations, updateSegmentation, setIntradosLines, completeStep } = useProjectStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [isProcessing, setIsProcessing] = useState(false);
  const [segmentations, setLocalSegmentations] = useState<Segmentation[]>(
    currentProject?.segmentations || []
  );
  const [showIntrados, setShowIntrados] = useState(true);
  
  // Run auto-segmentation on first load
  useEffect(() => {
    if (segmentations.length === 0) {
      handleAutoSegment();
    }
  }, []);
  
  const handleAutoSegment = async () => {
    setIsProcessing(true);
    
    try {
      // In real implementation, this would call the backend
      // For demo, use placeholder data
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setLocalSegmentations(DEMO_SEGMENTATIONS);
      setSegmentations(DEMO_SEGMENTATIONS);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleDetectIntrados = async () => {
    setIsProcessing(true);
    
    try {
      // In real implementation, call backend
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Demo intrados lines
      setIntradosLines([
        { id: "int-1", points: [], source: "auto" },
        { id: "int-2", points: [], source: "auto" },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const toggleSegmentVisibility = (id: string) => {
    const updated = segmentations.map(seg => 
      seg.id === id ? { ...seg, visible: !seg.visible } : seg
    );
    setLocalSegmentations(updated);
    updateSegmentation(id, { visible: !segmentations.find(s => s.id === id)?.visible });
  };
  
  const handleContinue = () => {
    completeStep(3, { segmentations, intradosLines: currentProject?.intradosLines });
    router.push("/workflow/step-4-geometry-2d");
  };

  return (
    <div className="space-y-6">
      <StepHeader 
        title="2D Segmentation"
        description="Use SAM3 to segment vault features and detect intrados lines"
      />
      
      <div className="grid lg:grid-cols-4 gap-6">
        {/* Tools Panel */}
        <div className="lg:col-span-1 space-y-4">
          {/* Tool Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-display">Tools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
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
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Button>
                ))}
              </div>
              
              <div className="pt-2 space-y-2">
                <Button 
                  variant="secondary" 
                  className="w-full gap-2"
                  onClick={handleAutoSegment}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4" />
                  )}
                  Auto Segment
                </Button>
                
                <Button 
                  variant="secondary" 
                  className="w-full gap-2"
                  onClick={handleDetectIntrados}
                  disabled={isProcessing}
                >
                  <Spline className="w-4 h-4" />
                  Detect Intrados
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {/* Segmentation List */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-display">Segments</CardTitle>
                <span className="text-sm text-muted-foreground">
                  {segmentations.filter(s => s.visible).length}/{segmentations.length}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
              {segmentations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No segments detected
                </p>
              ) : (
                segmentations.map((seg) => (
                  <div
                    key={seg.id}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg transition-colors",
                      seg.visible ? "bg-muted/50" : "opacity-50"
                    )}
                  >
                    <Checkbox
                      checked={seg.visible}
                      onCheckedChange={() => toggleSegmentVisibility(seg.id)}
                    />
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-sm flex-1 truncate">{seg.label}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => toggleSegmentVisibility(seg.id)}
                    >
                      {seg.visible ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          
          {/* Display Options */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-display">Display</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="show-intrados"
                  checked={showIntrados}
                  onCheckedChange={(checked) => setShowIntrados(checked as boolean)}
                />
                <Label htmlFor="show-intrados" className="text-sm">
                  Show Intrados Lines
                </Label>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Canvas Area */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardContent className="p-0 h-full min-h-[500px]">
              <div className="relative w-full h-full bg-black/10 rounded-lg overflow-hidden">
                {/* Segmentation Canvas */}
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <div className="relative w-full max-w-2xl aspect-square bg-muted/30 rounded-lg">
                    {/* Base projection image */}
                    <svg viewBox="0 0 400 400" className="w-full h-full">
                      {/* Background */}
                      <circle cx="200" cy="200" r="180" fill="hsl(var(--muted))" />
                      
                      {/* Vault cells (between ribs) */}
                      <path d="M200,20 L50,50 L20,200 L50,350 L200,380 L350,350 L380,200 L350,50 Z" 
                            fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
                      
                      {/* Segmentation overlays */}
                      {segmentations.filter(s => s.visible).map((seg, i) => {
                        // Demo visualization of segments
                        const angles = [45, 135, 225, 315, 0];
                        const angle = angles[i % angles.length];
                        const rad = (angle * Math.PI) / 180;
                        
                        if (seg.label.includes("Boss")) {
                          return (
                            <circle
                              key={seg.id}
                              cx="200"
                              cy="200"
                              r="20"
                              fill={seg.color}
                              opacity="0.6"
                            />
                          );
                        }
                        
                        return (
                          <line
                            key={seg.id}
                            x1={200 + 160 * Math.cos(rad)}
                            y1={200 + 160 * Math.sin(rad)}
                            x2={200 - 160 * Math.cos(rad)}
                            y2={200 - 160 * Math.sin(rad)}
                            stroke={seg.color}
                            strokeWidth="8"
                            strokeLinecap="round"
                            opacity="0.7"
                          />
                        );
                      })}
                      
                      {/* Intrados lines */}
                      {showIntrados && (
                        <g stroke="hsl(var(--primary))" strokeWidth="2" fill="none" strokeDasharray="4 2">
                          <path d="M50,50 Q200,150 350,50" />
                          <path d="M50,350 Q200,250 350,350" />
                        </g>
                      )}
                    </svg>
                    
                    {/* Tool cursor overlay */}
                    <div className="absolute inset-0 cursor-crosshair" />
                  </div>
                </div>
                
                {/* Processing overlay */}
                {isProcessing && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <div className="text-center space-y-3">
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
                      <p className="text-sm text-muted-foreground">Processing...</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <StepActions>
        <Button variant="outline" onClick={() => router.push("/workflow/step-2-projection")} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to Projection
        </Button>
        <Button 
          onClick={handleContinue} 
          disabled={segmentations.length === 0}
          className="gap-2"
        >
          Continue to 2D Geometry
          <ChevronRight className="w-4 h-4" />
        </Button>
      </StepActions>
    </div>
  );
}

