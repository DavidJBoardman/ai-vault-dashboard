"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { PointCloudViewer, generateDemoPointCloud } from "@/components/point-cloud/point-cloud-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useProjectStore } from "@/lib/store";
import { reprojectTo3D } from "@/lib/api";
import { 
  ChevronLeft, 
  ChevronRight,
  RotateCcw,
  Download,
  Eye,
  RefreshCw,
  FileOutput
} from "lucide-react";
import { cn } from "@/lib/utils";

const REPROJECTION_OPTIONS = [
  { id: "all-masks", label: "All Segmentation Masks", description: "Include all detected ribs and cells" },
  { id: "ribs-only", label: "Ribs Only", description: "Only vault rib segmentations" },
  { id: "boss-stones", label: "Boss Stone Highlights", description: "Keystone positions marked" },
  { id: "geometry", label: "Geometry Classification", description: "Starcut/circlecut overlay" },
  { id: "intrados", label: "Intrados Lines", description: "Rib skeleton traces" },
];

export default function Step5ReprojectionPage() {
  const router = useRouter();
  const { currentProject, setReprojectionSelections, completeStep } = useProjectStore();
  
  const [selectedOptions, setSelectedOptions] = useState<string[]>(["all-masks", "boss-stones"]);
  const [isReprojecting, setIsReprojecting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [pointCloudData, setPointCloudData] = useState<ReturnType<typeof generateDemoPointCloud> | null>(null);
  
  const toggleOption = (id: string) => {
    setSelectedOptions(prev => 
      prev.includes(id) 
        ? prev.filter(o => o !== id) 
        : [...prev, id]
    );
    setPreviewReady(false);
  };
  
  const handlePreview = async () => {
    setIsReprojecting(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Generate demo point cloud with colored annotations
      const points = generateDemoPointCloud(25000);
      
      // Color some points based on selections
      if (selectedOptions.includes("ribs-only") || selectedOptions.includes("all-masks")) {
        points.forEach((p, i) => {
          if (i % 20 === 0) {
            p.r = 255;
            p.g = 100;
            p.b = 100;
          }
        });
      }
      
      setPointCloudData(points);
      setPreviewReady(true);
    } finally {
      setIsReprojecting(false);
    }
  };
  
  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      if (typeof window !== "undefined" && window.electronAPI) {
        const result = await window.electronAPI.saveFile({
          filters: [{ name: "E57 Files", extensions: ["e57"] }],
        });
        
        if (!result.canceled && result.filePath) {
          await reprojectTo3D({
            segmentationIds: selectedOptions,
            outputPath: result.filePath,
          });
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    } finally {
      setIsExporting(false);
    }
  };
  
  const handleContinue = () => {
    setReprojectionSelections(selectedOptions);
    completeStep(5, { selections: selectedOptions });
    router.push("/workflow/step-6-traces");
  };

  return (
    <div className="space-y-6">
      <StepHeader 
        title="Reprojection to 3D"
        description="Select annotations to reproject back to the 3D point cloud and export"
      />
      
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Selection Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Select Annotations</CardTitle>
              <CardDescription>
                Choose which analysis results to include in the 3D model
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {REPROJECTION_OPTIONS.map((option) => (
                <div
                  key={option.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                    selectedOptions.includes(option.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                  onClick={() => toggleOption(option.id)}
                >
                  <Checkbox
                    checked={selectedOptions.includes(option.id)}
                    className="mt-0.5"
                  />
                  <div>
                    <Label className="cursor-pointer">{option.label}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {option.description}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6 space-y-3">
              <Button
                className="w-full gap-2"
                onClick={handlePreview}
                disabled={selectedOptions.length === 0 || isReprojecting}
              >
                {isReprojecting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                Preview 3D Result
              </Button>
              
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleExport}
                disabled={!previewReady || isExporting}
              >
                {isExporting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <FileOutput className="w-4 h-4" />
                )}
                Export to E57
              </Button>
            </CardContent>
          </Card>
        </div>
        
        {/* 3D Preview */}
        <div className="lg:col-span-2">
          <Card className="h-full min-h-[500px]">
            <CardHeader>
              <CardTitle className="font-display">3D Preview</CardTitle>
              <CardDescription>
                {previewReady 
                  ? "Preview with selected annotations applied" 
                  : "Generate preview to see annotated point cloud"
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[calc(100%-5rem)]">
              {pointCloudData ? (
                <PointCloudViewer
                  points={pointCloudData}
                  className="h-full rounded-lg overflow-hidden"
                  colorMode="rgb"
                  showGrid={true}
                  showBoundingBox={true}
                />
              ) : (
                <div className="h-full flex items-center justify-center bg-muted/30 rounded-lg">
                  <div className="text-center space-y-4">
                    <RotateCcw className="w-12 h-12 mx-auto text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">No preview generated</p>
                      <p className="text-sm text-muted-foreground/70">
                        Select options and click Preview
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      <StepActions>
        <Button variant="outline" onClick={() => router.push("/workflow/step-4-geometry-2d")} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to 2D Geometry
        </Button>
        <Button onClick={handleContinue} className="gap-2">
          Continue to Traces
          <ChevronRight className="w-4 h-4" />
        </Button>
      </StepActions>
    </div>
  );
}

