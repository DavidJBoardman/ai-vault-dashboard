"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { PointCloudViewer } from "@/components/point-cloud/point-cloud-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useProjectStore, Segmentation } from "@/lib/store";
import { getReprojectionPreview, ReprojectionPoint } from "@/lib/api";
import { 
  ChevronLeft, 
  ChevronRight,
  RotateCcw,
  Eye,
  RefreshCw,
  FileOutput,
  Layers,
  Info,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Step5ReprojectionPage() {
  const router = useRouter();
  const { currentProject, setReprojectionSelections, completeStep } = useProjectStore();
  
  // Selected mask groups (by groupId)
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [showUnmaskedPoints, setShowUnmaskedPoints] = useState(true);
  const [isReprojecting, setIsReprojecting] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [pointCloudData, setPointCloudData] = useState<ReprojectionPoint[] | null>(null);
  const [pointCount, setPointCount] = useState(500000);
  const [error, setError] = useState<string | null>(null);
  const [previewStats, setPreviewStats] = useState<{
    total: number;
    originalTotal: number;
    maskedCount: number;
    unmaskedCount: number;
    groupCounts: Record<string, number>;
  } | null>(null);
  
  // Get segmentations and groups from store
  const segmentations = currentProject?.segmentations || [];
  const segmentationGroups = currentProject?.segmentationGroups || [];
  
  // Build groups from segmentations if not available in store
  const availableGroups = useMemo(() => {
    if (segmentationGroups.length > 0) {
      return segmentationGroups;
    }
    
    // Fallback: build from segmentations
    const groups: Record<string, { groupId: string; label: string; color: string; count: number }> = {};
    segmentations.forEach(seg => {
      const groupId = seg.groupId || seg.label.replace(/\s*#?\d+$/, '').trim().toLowerCase().replace(/\s+/g, '_');
      if (!groups[groupId]) {
        groups[groupId] = {
          groupId,
          label: seg.groupId || seg.label.replace(/\s*#?\d+$/, '').trim(),
          color: seg.color,
          count: 0,
        };
      }
      groups[groupId].count++;
    });
    
    return Object.values(groups);
  }, [segmentations, segmentationGroups]);
  
  // Initialize selected groups to all available
  useEffect(() => {
    if (availableGroups.length > 0 && selectedGroups.length === 0) {
      setSelectedGroups(availableGroups.map(g => g.groupId));
    }
  }, [availableGroups, selectedGroups.length]);
  
  // Get projection metadata
  const projectionMetadata = useMemo(() => {
    const proj = currentProject?.projections?.[0];
    if (!proj) return null;
    return {
      resolution: proj.settings?.resolution || 2048,
      scale: proj.metadata?.scale || 1.0,
      bounds: proj.metadata?.bounds,
    };
  }, [currentProject?.projections]);
  
  // Toggle a group selection
  const toggleGroup = (groupId: string) => {
    setSelectedGroups(prev => {
      if (prev.includes(groupId)) {
        return prev.filter(g => g !== groupId);
      }
      return [...prev, groupId];
    });
    setPreviewReady(false);
  };
  
  // Select/deselect all groups
  const toggleAllGroups = () => {
    if (selectedGroups.length === availableGroups.length) {
      setSelectedGroups([]);
    } else {
      setSelectedGroups(availableGroups.map(g => g.groupId));
    }
    setPreviewReady(false);
  };
  
  const handlePreview = async () => {
    if (!currentProject?.id) {
      setError("No project loaded");
      return;
    }
    
    if (selectedGroups.length === 0) {
      setError("Please select at least one mask group");
      return;
    }
    
    setIsReprojecting(true);
    setError(null);
    
    try {
      // Pass selected group IDs to the API
      const groupIds = selectedGroups.length === availableGroups.length ? undefined : selectedGroups;
      
      const response = await getReprojectionPreview(
        currentProject.id,
        groupIds,
        pointCount,
        showUnmaskedPoints
      );
      
      if (response.success && response.data && response.data.points?.length > 0) {
        setPointCloudData(response.data.points);
        setPreviewReady(true);
        setPreviewStats({
          total: response.data.total || response.data.points.length,
          originalTotal: response.data.originalTotal || 0,
          maskedCount: response.data.maskedCount || 0,
          unmaskedCount: response.data.unmaskedCount || 0,
          groupCounts: response.data.groupCounts || {},
        });
        
        console.log(`Loaded ${response.data.total} points from original E57 (${response.data.originalTotal} total)`);
        console.log(`  - Masked: ${response.data.maskedCount}, Unmasked: ${response.data.unmaskedCount}`);
        console.log(`  - Group counts:`, response.data.groupCounts);
      } else {
        setError(response.error || "Failed to generate preview - no points returned");
        setPreviewStats(null);
      }
    } catch (err) {
      console.error("Reprojection error:", err);
      setError("Failed to generate reprojection preview");
    } finally {
      setIsReprojecting(false);
    }
  };
  
  const handleContinue = () => {
    setReprojectionSelections(selectedGroups);
    completeStep(5, { selectedGroups, showUnmaskedPoints });
    router.push("/workflow/step-6-traces");
  };

  // Check if we have data to work with
  const hasData = availableGroups.length > 0;

  return (
    <div className="space-y-6">
      <StepHeader 
        title="Reprojection to 3D"
        description="Preview segmentation masks reprojected back onto the 3D point cloud"
      />
      
      {!hasData ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Info className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Segmentation Data</h3>
            <p className="text-muted-foreground mb-4">
              Please complete the segmentation step first to generate masks for reprojection.
            </p>
            <Button onClick={() => router.push("/workflow/step-3-segmentation")}>
              Go to Segmentation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Selection Panel */}
          <div className="space-y-4">
            {/* Mask Groups Selection */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Mask Groups
                </CardTitle>
                <CardDescription className="text-xs">
                  Select which mask groups to overlay on the original point cloud
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Select All / Deselect All */}
                <div className="flex items-center justify-between pb-2 border-b">
                  <Label className="text-sm">
                    {selectedGroups.length} of {availableGroups.length} selected
                  </Label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={toggleAllGroups}
                    className="text-xs h-7"
                  >
                    {selectedGroups.length === availableGroups.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>
                
                {/* Group list */}
                {availableGroups.map((group) => {
                  const isSelected = selectedGroups.includes(group.groupId);
                  const count = previewStats?.groupCounts?.[group.groupId] || group.count || 0;
                  
                  return (
                    <div
                      key={group.groupId}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-lg border transition-colors cursor-pointer",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => toggleGroup(group.groupId)}
                    >
                      <Checkbox
                        checked={isSelected}
                        className="pointer-events-none"
                      />
                      <div
                        className="w-4 h-4 rounded-full border"
                        style={{ backgroundColor: group.color }}
                      />
                      <div className="flex-1">
                        <Label className="text-sm cursor-pointer capitalize">
                          {group.label || group.groupId.replace(/_/g, ' ')}
                        </Label>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {previewStats ? count.toLocaleString() : `${group.count || '?'} masks`}
                      </Badge>
                    </div>
                  );
                })}
                
                {availableGroups.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No mask groups found. Complete Step 3 to create segmentations.
                  </p>
                )}
              </CardContent>
            </Card>
            
            {/* Preview Settings */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display">Preview Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Show Unmasked Points Toggle */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-unmasked"
                    checked={showUnmaskedPoints}
                    onCheckedChange={(checked) => {
                      setShowUnmaskedPoints(checked === true);
                      setPreviewReady(false);
                    }}
                  />
                  <Label htmlFor="show-unmasked" className="text-sm cursor-pointer">
                    Show unmasked points (original colors)
                  </Label>
                </div>
                
                {/* Point Count Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Max Points</Label>
                    <span className="text-sm font-mono">{pointCount.toLocaleString()}</span>
                  </div>
                  <Slider
                    value={[pointCount]}
                    onValueChange={([v]) => {
                      setPointCount(v);
                      setPreviewReady(false);
                    }}
                    min={100000}
                    max={2000000}
                    step={100000}
                  />
                  <p className="text-xs text-muted-foreground">
                    Higher values show more detail but may be slower
                  </p>
                </div>
                
                {/* Preview Stats */}
                {previewStats && previewStats.total > 0 && (
                  <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                    <p><strong>Original E57:</strong> {(previewStats.originalTotal || 0).toLocaleString()} points</p>
                    <p><strong>Displayed:</strong> {(previewStats.total || 0).toLocaleString()} points</p>
                    <p><strong>Masked:</strong> {(previewStats.maskedCount || 0).toLocaleString()} points</p>
                    {showUnmaskedPoints && (
                      <p><strong>Unmasked:</strong> {(previewStats.unmaskedCount || 0).toLocaleString()} points</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Actions */}
            <Card>
              <CardContent className="pt-6 space-y-3">
                <Button
                  className="w-full gap-2"
                  onClick={handlePreview}
                  disabled={isReprojecting}
                >
                  {isReprojecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating Preview...
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" />
                      Generate 3D Preview
                    </>
                  )}
                </Button>
                
                {error && (
                  <p className="text-xs text-destructive text-center">{error}</p>
                )}
                
                {previewReady && pointCloudData && (
                  <div className="text-xs text-center text-muted-foreground">
                    Showing {pointCloudData.length.toLocaleString()} points
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          {/* 3D Preview */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display">3D Preview</CardTitle>
                <CardDescription>
                  {previewReady 
                    ? "Segmentation masks reprojected to 3D point cloud" 
                    : "Select options and click 'Generate 3D Preview'"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pointCloudData && pointCloudData.length > 0 ? (
                  <PointCloudViewer
                    points={pointCloudData}
                    className="h-[500px] rounded-lg overflow-hidden"
                    colorMode="rgb"
                    showGrid={true}
                    showBoundingBox={true}
                  />
                ) : (
                  <div className="h-[500px] flex items-center justify-center bg-muted/30 rounded-lg">
                    <div className="text-center space-y-4">
                      {isReprojecting ? (
                        <>
                          <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
                          <div>
                            <p className="text-muted-foreground">Generating preview...</p>
                            <p className="text-sm text-muted-foreground/70">
                              This may take a moment
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-12 h-12 mx-auto text-muted-foreground" />
                          <div>
                            <p className="text-muted-foreground">No preview generated</p>
                            <p className="text-sm text-muted-foreground/70">
                              Select options and click Generate 3D Preview
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      
      <StepActions>
        <Button variant="outline" onClick={() => router.push("/workflow/step-4-geometry-2d")} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to 2D Geometry
        </Button>
        <Button onClick={handleContinue} disabled={!hasData} className="gap-2">
          Continue to Traces
          <ChevronRight className="w-4 h-4" />
        </Button>
      </StepActions>
    </div>
  );
}
