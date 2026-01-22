"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectStore } from "@/lib/store";
import { 
  ChevronLeft,
  Circle,
  Download,
  RefreshCw,
  CheckCircle,
  Table,
  FileSpreadsheet,
  Home
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChordResult {
  predictedMethod: string;
  r1: number;
  r2: number;
  r3: number;
  confidence: number;
  calculations: Record<string, number>;
}

const DEMO_RESULT: ChordResult = {
  predictedMethod: "Three-Center Pointed Arch",
  r1: 4.52,
  r2: 5.10,
  r3: 4.48,
  confidence: 0.87,
  calculations: {
    "Mean Radius": 4.70,
    "Radius Variance": 0.11,
    "Span": 8.50,
    "Rise": 5.20,
    "Rise/Span Ratio": 0.61,
    "Arc Length": 7.12,
    "Chord Length": 6.80,
  },
};

export default function Step8AnalysisPage() {
  const router = useRouter();
  const { currentProject, setChordMethodResult, completeStep } = useProjectStore();
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ChordResult | null>(null);
  
  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setResult(DEMO_RESULT);
    setChordMethodResult({
      predictedMethod: DEMO_RESULT.predictedMethod,
      calculations: DEMO_RESULT.calculations,
    });
    
    setIsAnalyzing(false);
  };
  
  const handleExportAll = () => {
    // Export comprehensive results
    const data = {
      analysis: result,
      project: currentProject?.name,
      timestamp: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vault-analysis-complete.json";
    a.click();
  };
  
  const handleExportCSV = () => {
    if (!result) return;
    
    const csv = [
      "Property,Value",
      `Predicted Method,${result.predictedMethod}`,
      `Confidence,${(result.confidence * 100).toFixed(1)}%`,
      `R1,${result.r1}`,
      `R2,${result.r2}`,
      `R3,${result.r3}`,
      "",
      "Calculations",
      ...Object.entries(result.calculations).map(([k, v]) => `${k},${v}`),
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chord-method-analysis.csv";
    a.click();
  };
  
  const handleFinish = () => {
    completeStep(8, { result });
    router.push("/");
  };

  return (
    <div className="space-y-6">
      <StepHeader 
        title="Three-Circle Chord Method Analysis"
        description="Determine the geometric construction method used for the vault design"
      />
      
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Analysis Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Chord Method Analysis</CardTitle>
            <CardDescription>
              Analyze the vault geometry using the three-circle chord method to predict the construction technique
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-6 rounded-lg bg-muted/30 text-center">
              <div className="w-48 h-48 mx-auto relative">
                {/* Three-circle diagram */}
                <svg viewBox="0 0 200 200" className="w-full h-full">
                  {/* Background arc */}
                  <path
                    d="M 20 180 Q 100 20 180 180"
                    fill="none"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                  />
                  
                  {/* Three circles */}
                  {result && (
                    <>
                      <circle
                        cx="50"
                        cy="150"
                        r={result.r1 * 8}
                        fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth="2"
                        opacity="0.7"
                      />
                      <circle
                        cx="100"
                        cy="60"
                        r={result.r2 * 8}
                        fill="none"
                        stroke="hsl(var(--accent))"
                        strokeWidth="2"
                        opacity="0.7"
                      />
                      <circle
                        cx="150"
                        cy="150"
                        r={result.r3 * 8}
                        fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth="2"
                        opacity="0.7"
                      />
                      
                      {/* Center points */}
                      <circle cx="50" cy="150" r="4" fill="hsl(var(--primary))" />
                      <circle cx="100" cy="60" r="4" fill="hsl(var(--accent))" />
                      <circle cx="150" cy="150" r="4" fill="hsl(var(--primary))" />
                    </>
                  )}
                  
                  {/* Fitted arc */}
                  {result && (
                    <path
                      d="M 20 180 Q 100 30 180 180"
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="3"
                    />
                  )}
                </svg>
              </div>
              
              <p className="text-sm text-muted-foreground mt-4">
                {result 
                  ? "Three-circle fit visualization" 
                  : "Run analysis to see the circle fit"
                }
              </p>
            </div>
            
            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="w-full gap-2"
              size="lg"
            >
              {isAnalyzing ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Circle className="w-5 h-5" />
              )}
              {isAnalyzing ? "Analyzing..." : "Run Chord Method Analysis"}
            </Button>
          </CardContent>
        </Card>
        
        {/* Results */}
        <Card className={cn(!result && "opacity-50")}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-display">Results</CardTitle>
              {result && (
                <div className="flex items-center gap-2 text-green-500">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm">Analysis Complete</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {result ? (
              <>
                {/* Prediction */}
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <p className="text-sm text-muted-foreground">Predicted Construction Method</p>
                  <p className="text-xl font-bold text-primary mt-1">{result.predictedMethod}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Confidence: {(result.confidence * 100).toFixed(1)}%
                  </p>
                </div>
                
                {/* Radii */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold text-primary">{result.r1.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">R1 (m)</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold text-accent">{result.r2.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">R2 (m)</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold text-primary">{result.r3.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">R3 (m)</p>
                  </div>
                </div>
                
                {/* Calculations table */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Table className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Calculation Details</span>
                  </div>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        {Object.entries(result.calculations).map(([key, value], i) => (
                          <tr key={key} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                            <td className="px-3 py-2 font-medium">{key}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {typeof value === "number" ? value.toFixed(2) : value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <Circle className="w-12 h-12 mx-auto text-muted-foreground/50" />
                <p className="text-muted-foreground mt-4">Run analysis to see results</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Export & Complete</CardTitle>
          <CardDescription>
            Export your analysis results and complete the workflow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button
              variant="outline"
              onClick={handleExportCSV}
              disabled={!result}
              className="gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Export CSV
            </Button>
            
            <Button
              variant="outline"
              onClick={handleExportAll}
              disabled={!result}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              Export Complete Analysis
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <StepActions>
        <Button variant="outline" onClick={() => router.push("/workflow/step-7-measurements")} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to Measurements
        </Button>
        <Button onClick={handleFinish} className="gap-2">
          <Home className="w-4 h-4" />
          Complete & Return Home
        </Button>
      </StepActions>
    </div>
  );
}

