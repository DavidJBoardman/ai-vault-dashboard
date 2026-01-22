"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectStore } from "@/lib/store";
import { analyzeGeometry } from "@/lib/api";
import { 
  ChevronLeft, 
  ChevronRight,
  Play,
  RefreshCw,
  Download,
  Star,
  Circle,
  Hexagon,
  Table
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GeometryResult {
  classification: "starcut" | "circlecut" | "starcirclecut";
  bossStones: Array<{ x: number; y: number; label: string }>;
  px: number;
  py: number;
}

export default function Step4Geometry2DPage() {
  const router = useRouter();
  const { currentProject, setGeometryResult, completeStep } = useProjectStore();
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<GeometryResult | null>(null);
  const [boundingBox, setBoundingBox] = useState({ x: 50, y: 50, width: 300, height: 300 });
  const [isDragging, setIsDragging] = useState(false);
  
  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    
    try {
      // Demo analysis
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const demoResult: GeometryResult = {
        classification: "starcut",
        bossStones: [
          { x: 200, y: 200, label: "Central Boss" },
          { x: 100, y: 100, label: "NW Boss" },
          { x: 300, y: 100, label: "NE Boss" },
          { x: 100, y: 300, label: "SW Boss" },
          { x: 300, y: 300, label: "SE Boss" },
        ],
        px: 1,
        py: 1,
      };
      
      setResult(demoResult);
      setGeometryResult({
        ...demoResult,
        boundingBox,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const handleExportCSV = () => {
    if (!result) return;
    
    const csv = [
      "Property,Value",
      `Classification,${result.classification}`,
      `Boss Stone Count,${result.bossStones.length}`,
      `Px,${result.px}`,
      `Py,${result.py}`,
      "",
      "Boss Stones",
      "Label,X,Y",
      ...result.bossStones.map(b => `${b.label},${b.x},${b.y}`),
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "geometry-analysis.csv";
    a.click();
  };
  
  const handleContinue = () => {
    completeStep(4, { geometryResult: result });
    router.push("/workflow/step-5-reprojection");
  };
  
  const getClassificationIcon = (type: string) => {
    switch (type) {
      case "starcut": return <Star className="w-5 h-5" />;
      case "circlecut": return <Circle className="w-5 h-5" />;
      case "starcirclecut": return <Hexagon className="w-5 h-5" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <StepHeader 
        title="2D Geometry Analysis"
        description="Identify vault construction method (starcut, circle cut, or star-circle cut)"
      />
      
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Analysis Canvas */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display">Region of Interest</CardTitle>
                  <CardDescription>
                    Adjust the bounding box to match the vault corners
                  </CardDescription>
                </div>
                <Button onClick={handleAnalyze} disabled={isAnalyzing} className="gap-2">
                  {isAnalyzing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Analyze Geometry
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative aspect-square bg-muted/30 rounded-lg overflow-hidden">
                <svg viewBox="0 0 400 400" className="w-full h-full">
                  {/* Background */}
                  <rect width="400" height="400" fill="hsl(var(--muted) / 0.3)" />
                  
                  {/* Demo vault image */}
                  <circle cx="200" cy="200" r="180" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
                  
                  {/* Rib lines */}
                  <g stroke="hsl(var(--primary) / 0.5)" strokeWidth="4">
                    <line x1="50" y1="50" x2="350" y2="350" />
                    <line x1="350" y1="50" x2="50" y2="350" />
                    <line x1="200" y1="20" x2="200" y2="380" />
                    <line x1="20" y1="200" x2="380" y2="200" />
                  </g>
                  
                  {/* Bounding box */}
                  <rect
                    x={boundingBox.x}
                    y={boundingBox.y}
                    width={boundingBox.width}
                    height={boundingBox.height}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="2"
                    strokeDasharray="8 4"
                    className="cursor-move"
                  />
                  
                  {/* Corner handles */}
                  {[
                    [boundingBox.x, boundingBox.y],
                    [boundingBox.x + boundingBox.width, boundingBox.y],
                    [boundingBox.x, boundingBox.y + boundingBox.height],
                    [boundingBox.x + boundingBox.width, boundingBox.y + boundingBox.height],
                  ].map(([x, y], i) => (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r="6"
                      fill="hsl(var(--primary))"
                      className="cursor-nwse-resize"
                    />
                  ))}
                  
                  {/* Boss stone markers (if analyzed) */}
                  {result?.bossStones.map((boss, i) => (
                    <g key={i}>
                      <circle
                        cx={boss.x}
                        cy={boss.y}
                        r="12"
                        fill="hsl(var(--accent))"
                        stroke="white"
                        strokeWidth="2"
                      />
                      <text
                        x={boss.x}
                        y={boss.y + 25}
                        textAnchor="middle"
                        fontSize="10"
                        fill="hsl(var(--foreground))"
                      >
                        {boss.label}
                      </text>
                    </g>
                  ))}
                </svg>
                
                {/* Processing overlay */}
                {isAnalyzing && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <div className="text-center space-y-3">
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
                      <p className="text-sm text-muted-foreground">Analyzing geometry...</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Results Panel */}
        <div className="space-y-4">
          {/* Classification Result */}
          <Card className={cn(!result && "opacity-50")}>
            <CardHeader>
              <CardTitle className="font-display">Classification</CardTitle>
            </CardHeader>
            <CardContent>
              {result ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10">
                    {getClassificationIcon(result.classification)}
                    <div>
                      <p className="font-semibold capitalize">{result.classification}</p>
                      <p className="text-sm text-muted-foreground">Vault construction method</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-2xl font-bold text-primary">{result.px}</p>
                      <p className="text-xs text-muted-foreground">Px (X bays)</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-2xl font-bold text-primary">{result.py}</p>
                      <p className="text-xs text-muted-foreground">Py (Y bays)</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Run analysis to see results
                </p>
              )}
            </CardContent>
          </Card>
          
          {/* Boss Stones */}
          <Card className={cn(!result && "opacity-50")}>
            <CardHeader>
              <CardTitle className="font-display">Boss Stones</CardTitle>
              <CardDescription>
                {result ? `${result.bossStones.length} detected` : "Pending analysis"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result ? (
                <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
                  {result.bossStones.map((boss, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/50">
                      <span className="text-sm">{boss.label}</span>
                      <span className="text-xs text-muted-foreground">
                        ({boss.x.toFixed(0)}, {boss.y.toFixed(0)})
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No boss stones detected
                </p>
              )}
            </CardContent>
          </Card>
          
          {/* Export */}
          <Card>
            <CardContent className="pt-6">
              <Button
                variant="outline"
                className="w-full gap-2"
                disabled={!result}
                onClick={handleExportCSV}
              >
                <Download className="w-4 h-4" />
                Export Results (CSV)
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <StepActions>
        <Button variant="outline" onClick={() => router.push("/workflow/step-3-segmentation")} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to Segmentation
        </Button>
        <Button 
          onClick={handleContinue}
          disabled={!result}
          className="gap-2"
        >
          Continue to Reprojection
          <ChevronRight className="w-4 h-4" />
        </Button>
      </StepActions>
    </div>
  );
}

