"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { PointCloudViewer, ExclusionBoxProps } from "@/components/point-cloud/point-cloud-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useProjectStore } from "@/lib/store";
import { getReprojectionPreview, ReprojectionPoint, getIntradosLines, IntradosLine, traceIntradosLines } from "@/lib/api";
import { 
  ChevronLeft, 
  ChevronRight,
  RotateCcw,
  Eye,
  Layers,
  Info,
  Loader2,
  Spline
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
  
  // Intrados lines state
  const [intradosLines, setIntradosLines] = useState<IntradosLine[]>([]);
  const [showIntradosLines, setShowIntradosLines] = useState(true);
  const [loadingIntrados, setLoadingIntrados] = useState(false);
  const [intradosLineWidth, setIntradosLineWidth] = useState(0.03); // Default tube radius
  const [isTracingIntrados, setIsTracingIntrados] = useState(false);
  const [intradosError, setIntradosError] = useState<string | null>(null);
  
  // Exclusion controls state
  const [floorPlaneZ, setFloorPlaneZ] = useState<number | undefined>(undefined);
  const [showFloorPlane, setShowFloorPlane] = useState(false);
  const [exclusionBox, setExclusionBox] = useState<ExclusionBoxProps | undefined>(undefined);
  const [showExclusionBox, setShowExclusionBox] = useState(false);
  
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
  
  // Track if initial load has been done
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [autoLoadTriggered, setAutoLoadTriggered] = useState(false);
  
  // Initialize selected groups to all available
  useEffect(() => {
    if (availableGroups.length > 0 && selectedGroups.length === 0 && !initialLoadDone) {
      setSelectedGroups(availableGroups.map(g => g.groupId));
      setInitialLoadDone(true);
    }
  }, [availableGroups, selectedGroups.length, initialLoadDone]);
  
  // Load intrados lines when project loads
  useEffect(() => {
    const loadIntradosLines = async () => {
      if (!currentProject?.id) return;
      
      setLoadingIntrados(true);
      console.log(`Loading intrados lines for project: ${currentProject.id}`);
      
      try {
        const response = await getIntradosLines(currentProject.id);
        console.log("Intrados lines response:", response);
        
        if (response.success && response.data) {
          const lines = response.data.lines || [];
          setIntradosLines(lines);
          console.log(`Loaded ${lines.length} intrados lines`);
        } else {
          console.log("No intrados data in response:", response);
        }
      } catch (err) {
        console.error("Error loading intrados lines:", err);
      } finally {
        setLoadingIntrados(false);
      }
    };
    
    loadIntradosLines();
  }, [currentProject?.id]);
  
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
  
  // Convert intrados lines to format for PointCloudViewer
  const lines3D = useMemo(() => {
    if (!intradosLines.length) return [];
    
    return intradosLines.map(line => ({
      id: line.id,
      label: line.label,
      color: line.color,
      points: line.points3d.map(pt => ({
        x: pt[0],
        y: pt[1],
        z: pt[2],
      })),
    }));
  }, [intradosLines]);
  
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
  
  // Trace intrados lines with exclusion parameters
  const handleTraceIntrados = async () => {
    if (!currentProject?.id) return;
    
    setIsTracingIntrados(true);
    setIntradosError(null);
    
    try {
      const response = await traceIntradosLines(currentProject.id, {
        floorPlaneZ: showFloorPlane ? floorPlaneZ : undefined,
        exclusionBox: showExclusionBox ? exclusionBox : undefined,
      });
      
      if (response.success && response.data) {
        setIntradosLines(response.data.lines || []);
        console.log(`Traced ${response.data.lines?.length || 0} intrados lines`);
        
        if (response.data.lines?.length === 0) {
          setIntradosError("No intrados lines traced - check that rib segmentations exist");
        }
      } else {
        setIntradosError(response.error || "Failed to trace intrados lines");
      }
    } catch (error) {
      console.error("Error tracing intrados:", error);
      setIntradosError("Failed to trace intrados lines");
    } finally {
      setIsTracingIntrados(false);
    }
  };
  
  // Initialize floor plane from point cloud bounds
  const initializeExclusionControls = () => {
    if (!pointCloudData || pointCloudData.length === 0) return;
    
    // Find Z bounds
    let minZ = Infinity, maxZ = -Infinity;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    pointCloudData.forEach(p => {
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    
    // Set floor plane slightly above minimum
    const zRange = maxZ - minZ;
    if (floorPlaneZ === undefined) {
      setFloorPlaneZ(minZ + zRange * 0.1);
    }
    
    // Set exclusion box to a default position (can be adjusted)
    if (!exclusionBox) {
      const xCenter = (minX + maxX) / 2;
      const yCenter = (minY + maxY) / 2;
      const boxSize = Math.min(maxX - minX, maxY - minY) * 0.2;
      
      setExclusionBox({
        minX: xCenter - boxSize / 2,
        maxX: xCenter + boxSize / 2,
        minY: yCenter - boxSize / 2,
        maxY: yCenter + boxSize / 2,
        minZ: minZ,
        maxZ: minZ + zRange * 0.3,
        enabled: true,
      });
    }
  };
  
  // Initialize exclusion controls when point cloud is loaded
  useEffect(() => {
    if (pointCloudData && pointCloudData.length > 0) {
      initializeExclusionControls();
    }
  }, [pointCloudData]);
  
  // Auto-load 3D preview when page loads with available data
  useEffect(() => {
    const autoLoadPreview = async () => {
      if (
        currentProject?.id && 
        availableGroups.length > 0 && 
        initialLoadDone && 
        !autoLoadTriggered &&
        !pointCloudData &&
        !isReprojecting
      ) {
        setAutoLoadTriggered(true);
        setIsReprojecting(true);
        setError(null);
        
        try {
          // Use all groups for initial auto-load
          const response = await getReprojectionPreview(
            currentProject.id,
            undefined, // All groups
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
            
            console.log(`Auto-loaded ${response.data.total} points from original E57`);
          } else {
            console.log("Auto-load: No points returned");
          }
        } catch (err) {
          console.error("Auto-load reprojection error:", err);
        } finally {
          setIsReprojecting(false);
        }
      }
    };
    
    // Small delay to ensure state is ready
    const timer = setTimeout(autoLoadPreview, 200);
    return () => clearTimeout(timer);
  }, [currentProject?.id, availableGroups.length, initialLoadDone, autoLoadTriggered, pointCloudData, isReprojecting, pointCount, showUnmaskedPoints]);
  
  const handlePreview = async () => {
    if (!currentProject?.id) {
      setError("No project loaded");
      return;
    }
    
    setIsReprojecting(true);
    setError(null);
    
    try {
      // Pass selected group IDs to the API (empty array = no masks, undefined = all masks)
      const groupIds = selectedGroups.length === 0 ? [] : 
        (selectedGroups.length === availableGroups.length ? undefined : selectedGroups);
      
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
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        setSelectedGroups(availableGroups.map(g => g.groupId));
                        setPreviewReady(false);
                      }}
                      className="text-xs h-7"
                      disabled={selectedGroups.length === availableGroups.length}
                    >
                      All
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        setSelectedGroups([]);
                        setPreviewReady(false);
                      }}
                      className="text-xs h-7"
                      disabled={selectedGroups.length === 0}
                    >
                      None
                    </Button>
                  </div>
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
                
                {/* Show Intrados Lines Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="show-intrados"
                      checked={showIntradosLines}
                      onCheckedChange={(checked) => setShowIntradosLines(checked === true)}
                      disabled={intradosLines.length === 0}
                    />
                    <Label 
                      htmlFor="show-intrados" 
                      className={cn(
                        "text-sm cursor-pointer flex items-center gap-2",
                        intradosLines.length === 0 && "text-muted-foreground"
                      )}
                    >
                      <Spline className="w-4 h-4" />
                      Show intrados lines
                    </Label>
                  </div>
                  {intradosLines.length > 0 ? (
                    <Badge variant="secondary" className="text-xs">
                      {intradosLines.length} lines
                    </Badge>
                  ) : loadingIntrados ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="text-xs text-muted-foreground">None traced</span>
                  )}
                </div>
                
                {/* Intrados Line Thickness Slider */}
                {intradosLines.length > 0 && showIntradosLines && (
                  <div className="space-y-2 pl-6">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-muted-foreground">Line Thickness</Label>
                      <span className="text-sm font-mono text-muted-foreground">
                        {(intradosLineWidth * 100).toFixed(0)}%
                      </span>
                    </div>
                    <Slider
                      value={[intradosLineWidth * 100]}
                      onValueChange={([v]) => setIntradosLineWidth(v / 100)}
                      min={1}
                      max={15}
                      step={1}
                    />
                    <p className="text-xs text-muted-foreground">
                      Adjust the thickness of intrados lines
                    </p>
                  </div>
                )}
                
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
            
            {/* Intrados Tracing */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <Spline className="w-4 h-4" />
                  Intrados Tracing
                </CardTitle>
                <CardDescription className="text-xs">
                  Trace center lines of ribs with exclusion controls
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Floor Plane Control */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="show-floor-plane"
                        checked={showFloorPlane}
                        onCheckedChange={(checked) => setShowFloorPlane(checked === true)}
                      />
                      <Label htmlFor="show-floor-plane" className="text-sm cursor-pointer">
                        Floor Plane (exclude below)
                      </Label>
                    </div>
                    {floorPlaneZ !== undefined && (
                      <span className="text-xs font-mono text-muted-foreground">
                        Z: {floorPlaneZ.toFixed(2)}
                      </span>
                    )}
                  </div>
                  {showFloorPlane && floorPlaneZ !== undefined && pointCloudData && (
                    <div className="pl-6">
                      <Slider
                        value={[floorPlaneZ]}
                        onValueChange={([v]) => setFloorPlaneZ(v)}
                        min={pointCloudData.reduce((min, p) => Math.min(min, p.z), Infinity)}
                        max={pointCloudData.reduce((max, p) => Math.max(max, p.z), -Infinity)}
                        step={0.1}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Points below this Z will be excluded from tracing
                      </p>
                    </div>
                  )}
                </div>
                
                {/* Exclusion Box Control */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="show-exclusion-box"
                      checked={showExclusionBox}
                      onCheckedChange={(checked) => setShowExclusionBox(checked === true)}
                    />
                    <Label htmlFor="show-exclusion-box" className="text-sm cursor-pointer">
                      Exclusion Box (exclude inside)
                    </Label>
                  </div>
                  {showExclusionBox && exclusionBox && pointCloudData && (() => {
                    const bounds = {
                      minX: pointCloudData.reduce((min, p) => Math.min(min, p.x), Infinity),
                      maxX: pointCloudData.reduce((max, p) => Math.max(max, p.x), -Infinity),
                      minY: pointCloudData.reduce((min, p) => Math.min(min, p.y), Infinity),
                      maxY: pointCloudData.reduce((max, p) => Math.max(max, p.y), -Infinity),
                      minZ: pointCloudData.reduce((min, p) => Math.min(min, p.z), Infinity),
                      maxZ: pointCloudData.reduce((max, p) => Math.max(max, p.z), -Infinity),
                    };
                    return (
                    <div className="pl-6 space-y-3">
                      {/* X Range */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground font-medium">X Range</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-xs text-muted-foreground">Min: {exclusionBox.minX.toFixed(1)}</span>
                            <Slider
                              value={[exclusionBox.minX]}
                              onValueChange={([v]) => setExclusionBox({...exclusionBox, minX: Math.min(v, exclusionBox.maxX - 0.1)})}
                              min={bounds.minX}
                              max={bounds.maxX}
                              step={0.1}
                            />
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Max: {exclusionBox.maxX.toFixed(1)}</span>
                            <Slider
                              value={[exclusionBox.maxX]}
                              onValueChange={([v]) => setExclusionBox({...exclusionBox, maxX: Math.max(v, exclusionBox.minX + 0.1)})}
                              min={bounds.minX}
                              max={bounds.maxX}
                              step={0.1}
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* Y Range */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground font-medium">Y Range</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-xs text-muted-foreground">Min: {exclusionBox.minY.toFixed(1)}</span>
                            <Slider
                              value={[exclusionBox.minY]}
                              onValueChange={([v]) => setExclusionBox({...exclusionBox, minY: Math.min(v, exclusionBox.maxY - 0.1)})}
                              min={bounds.minY}
                              max={bounds.maxY}
                              step={0.1}
                            />
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Max: {exclusionBox.maxY.toFixed(1)}</span>
                            <Slider
                              value={[exclusionBox.maxY]}
                              onValueChange={([v]) => setExclusionBox({...exclusionBox, maxY: Math.max(v, exclusionBox.minY + 0.1)})}
                              min={bounds.minY}
                              max={bounds.maxY}
                              step={0.1}
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* Z Range (Height) */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground font-medium">Z Range (Height)</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-xs text-muted-foreground">Min: {exclusionBox.minZ.toFixed(1)}</span>
                            <Slider
                              value={[exclusionBox.minZ]}
                              onValueChange={([v]) => setExclusionBox({...exclusionBox, minZ: Math.min(v, exclusionBox.maxZ - 0.1)})}
                              min={bounds.minZ}
                              max={bounds.maxZ}
                              step={0.1}
                            />
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Max: {exclusionBox.maxZ.toFixed(1)}</span>
                            <Slider
                              value={[exclusionBox.maxZ]}
                              onValueChange={([v]) => setExclusionBox({...exclusionBox, maxZ: Math.max(v, exclusionBox.minZ + 0.1)})}
                              min={bounds.minZ}
                              max={bounds.maxZ}
                              step={0.1}
                            />
                          </div>
                        </div>
                      </div>
                      
                      <p className="text-xs text-muted-foreground">
                        Points inside the red box will be excluded from tracing
                      </p>
                    </div>
                    );
                  })()}
                </div>
                
                {/* Trace Button */}
                <Button
                  className="w-full gap-2"
                  onClick={handleTraceIntrados}
                  disabled={isTracingIntrados || !pointCloudData}
                  variant={intradosLines.length > 0 ? "outline" : "default"}
                >
                  {isTracingIntrados ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Tracing...
                    </>
                  ) : (
                    <>
                      <Spline className="w-4 h-4" />
                      {intradosLines.length > 0 ? "Re-trace Intrados" : "Trace Intrados Lines"}
                    </>
                  )}
                </Button>
                
                {intradosError && (
                  <p className="text-xs text-destructive text-center">{intradosError}</p>
                )}
                
                {intradosLines.length > 0 && (
                  <p className="text-xs text-muted-foreground text-center">
                    {intradosLines.length} intrados lines traced
                  </p>
                )}
                
                {!pointCloudData && (
                  <p className="text-xs text-muted-foreground text-center">
                    Generate 3D preview first to enable tracing
                  </p>
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
                    lines={lines3D}
                    showLines={showIntradosLines}
                    lineWidth={intradosLineWidth}
                    className="h-[500px] rounded-lg overflow-hidden"
                    colorMode="rgb"
                    showGrid={true}
                    showBoundingBox={true}
                    floorPlaneZ={floorPlaneZ}
                    showFloorPlane={showFloorPlane}
                    exclusionBox={exclusionBox}
                    showExclusionBox={showExclusionBox}
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
