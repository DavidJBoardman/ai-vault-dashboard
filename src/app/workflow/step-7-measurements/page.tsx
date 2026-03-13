"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { PointCloudViewer, generateDemoPointCloud, type RibLabel, type BossStoneMarker } from "@/components/point-cloud/point-cloud-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProjectStore, Measurement } from "@/lib/store";
import { 
  ChevronLeft, 
  ChevronRight,
  Ruler,
  Target,
  Circle,
  Download,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Link2,
  Link2Off,
  Tag,
  Pencil,
  FolderPlus,
  Square,
  CheckSquare,
  Check,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getReprojectionPreview,
  getIntradosLines,
  getBossStoneMarkers,
  calculateMeasurements,
  calculateImpostLine,
  detectRibGroups,
  calculateCustomRibGroups,
  getMeasurementConfig,
  saveMeasurementConfig,
  type RibImpostData,
  type ImpostLineResult,
  type ImpostLineRequest,
  type RibGroup,
  type MeasurementConfig,
  type MeasurementCustomGroup,
} from "@/lib/api";

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

interface DisplayGroup extends RibGroup {
  source: "custom" | "auto" | "single";
}

interface RenameTarget {
  type: "rib" | "group";
  id: string;
  source: "custom" | "auto" | "single";
}

const EMPTY_MEASUREMENT_CONFIG: MeasurementConfig = {
  ribNameById: {},
  customGroups: [],
  disabledAutoGroupIds: [],
  groupNameById: {},
  bossStoneNameById: {},
};



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
  const { currentProject, addMeasurement, completeStep } = useProjectStore();
  
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [selectedRib, setSelectedRib] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [exportingRibs, setExportingRibs] = useState(false);
  
  // Data loading states
  const [pointCloudData, setPointCloudData] = useState<ReprojectionPoint[] | null>(null);
  const [intradosLines, setIntradosLines] = useState<IntradosLine[]>([]);
  const [bossStoneMarkers, setBossStoneMarkers] = useState<BossStoneMarker[]>([]);
  const [showBossStones, setShowBossStones] = useState(true);
  const initialSelectionSetRef = useRef(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Measurement visualization data
  const [measurementData, setMeasurementData] = useState<MeasurementResponse["data"] | null>(null);
  const measurementCacheRef = useRef<Map<string, MeasurementResponse["data"]>>(new Map());
  const [baseTraceLines, setBaseTraceLines] = useState<Line3D[]>([]);
  const [viewMode, setViewMode] = useState<"errorHeatmap" | "bestFitArc">("errorHeatmap");
  const [showLabels, setShowLabels] = useState(false);
  // Derive display traces: apply selection highlight in memory with no API calls
  const traceLines = useMemo(() => {
    if (viewMode !== "errorHeatmap" || !selectedRib) return baseTraceLines;
    const prefix = `${selectedRib}-segment-`;
    return baseTraceLines.map(line =>
      line.id.startsWith(prefix) ? { ...line, color: "rgb(180, 180, 180)" } : line
    );
  }, [baseTraceLines, selectedRib, viewMode]);
  
  // Impost line data
  const [impostLineData, setImpostLineData] = useState<ImpostLineResult | null>(null);
  const [isLoadingImpost, setIsLoadingImpost] = useState(false);
  const [impostMode, setImpostMode] = useState<"auto" | "floorPlane">("floorPlane");
  const step5FloorPlaneZ = currentProject?.stepData?.[5]?.floorPlaneZ as number | undefined;

  // Rib grouping state
  const [ribGroups, setRibGroups] = useState<RibGroup[] | null>(null);
  const [customGroupMetrics, setCustomGroupMetrics] = useState<Record<string, RibGroup["combinedMeasurements"]>>({});
  const [measurementConfig, setMeasurementConfig] = useState<MeasurementConfig>(EMPTY_MEASUREMENT_CONFIG);
  const [selectedForGrouping, setSelectedForGrouping] = useState<Set<string>>(new Set());
  const [configLoaded, setConfigLoaded] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [proximityThreshold, setProximityThreshold] = useState(2.0);
  const [isDetectingGroups, setIsDetectingGroups] = useState(false);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Boss stone rename + selection state
  const [bossStoneRenameId, setBossStoneRenameId] = useState<string | null>(null);
  const [bossStoneRenameValue, setBossStoneRenameValue] = useState("");
  const [selectedBossStone, setSelectedBossStone] = useState<string | null>(null);
  const bossStoneRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const bossStoneScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const ribRowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const measurementConfigRef = useRef<MeasurementConfig>(EMPTY_MEASUREMENT_CONFIG);
  useEffect(() => {
    measurementConfigRef.current = measurementConfig;
  }, [measurementConfig]);
  
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
          
          // Set first line as selected on initial load only
          if (linesResponse.data.lines.length > 0 && !initialSelectionSetRef.current) {
            setSelectedRib(linesResponse.data.lines[0].id);
            initialSelectionSetRef.current = true;
          }
        }

        // Load boss stone / keystone markers (purely for orientation visualisation)
        const bossResponse = await getBossStoneMarkers(currentProject.id);
        if (bossResponse.success && bossResponse.data?.markers) {
          setBossStoneMarkers(bossResponse.data.markers);
        }
      } catch (err) {
        console.error("Error loading preview data:", err);
      } finally {
        setPreviewLoading(false);
      }
    };
    
    loadData();
  }, [currentProject?.id]);
  
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

  // Detect rib groups whenever intrados lines or threshold changes
  useEffect(() => {
    const detectGroups = async () => {
      if (intradosLines.length === 0) {
        setRibGroups(null);
        return;
      }
      setIsDetectingGroups(true);
      try {
        const response = await detectRibGroups({
          ribs: intradosLines.map(line => ({ id: line.id, points: line.points3d })),
          maxGap: proximityThreshold,
        });
        if (response.success && response.data) {
          setRibGroups(response.data);
        }
      } catch (err) {
        console.error("Error detecting rib groups:", err);
      } finally {
        setIsDetectingGroups(false);
      }
    };
    detectGroups();
  }, [intradosLines, proximityThreshold]);

  useEffect(() => {
    const loadConfig = async () => {
      if (!currentProject?.id) return;
      setConfigLoaded(false);
      try {
        const response = await getMeasurementConfig(currentProject.id);
        if (response.success && response.data) {
          setMeasurementConfig(response.data);
        } else {
          setMeasurementConfig(EMPTY_MEASUREMENT_CONFIG);
        }
      } catch (err) {
        console.error("Error loading measurement config:", err);
        setMeasurementConfig(EMPTY_MEASUREMENT_CONFIG);
      } finally {
        setConfigLoaded(true);
      }
    };
    loadConfig();
  }, [currentProject?.id]);

  const saveConfigNow = useCallback(async (nextConfig?: MeasurementConfig) => {
    if (!currentProject?.id) return;
    const payload = nextConfig ?? measurementConfigRef.current;
    try {
      await saveMeasurementConfig(currentProject.id, payload);
    } catch (err) {
      console.error("Error saving measurement config:", err);
    }
  }, [currentProject?.id]);

  useEffect(() => {
    if (!configLoaded || !currentProject?.id) return;
    const handle = setTimeout(() => {
      saveConfigNow();
    }, 400);
    return () => clearTimeout(handle);
  }, [measurementConfig, configLoaded, currentProject?.id, saveConfigNow]);

  useEffect(() => {
    if (intradosLines.length === 0) return;
    const validIds = new Set(intradosLines.map(l => l.id));
    setMeasurementConfig(prev => ({
      ...prev,
      ribNameById: Object.fromEntries(
        Object.entries(prev.ribNameById).filter(([ribId]) => validIds.has(ribId))
      ),
      customGroups: prev.customGroups
        .map(g => ({ ...g, ribIds: g.ribIds.filter(ribId => validIds.has(ribId)) }))
        .filter(g => g.ribIds.length > 0),
    }));
  }, [intradosLines]);

  // Prune boss stone names for markers that no longer exist
  useEffect(() => {
    if (bossStoneMarkers.length === 0) return;
    const validIds = new Set(bossStoneMarkers.map(m => m.id));
    setMeasurementConfig(prev => {
      const pruned = Object.fromEntries(
        Object.entries(prev.bossStoneNameById).filter(([id]) => validIds.has(id))
      );
      if (Object.keys(pruned).length === Object.keys(prev.bossStoneNameById).length) return prev;
      return { ...prev, bossStoneNameById: pruned };
    });
  }, [bossStoneMarkers]);

  const isRibInCustomGroup = useCallback((ribId: string): boolean => {
    return measurementConfig.customGroups.some(g => g.ribIds.includes(ribId));
  }, [measurementConfig.customGroups]);

  const handleUngroup = (groupId: string, source: "custom" | "auto" | "single") => {
    if (source === "custom") {
      setMeasurementConfig(prev => ({
        ...prev,
        customGroups: prev.customGroups.filter(g => g.id !== groupId),
      }));
      return;
    }
    if (source === "auto") {
      setMeasurementConfig(prev => {
        if (prev.disabledAutoGroupIds.includes(groupId)) return prev;
        return {
          ...prev,
          disabledAutoGroupIds: [...prev.disabledAutoGroupIds, groupId],
        };
      });
    }
  };

  const toggleRibForGrouping = (ribId: string) => {
    setSelectedForGrouping(prev => {
      const next = new Set(prev);
      if (next.has(ribId)) next.delete(ribId);
      else next.add(ribId);
      return next;
    });
  };

  const handleCreateCustomGroup = () => {
    const selected = Array.from(selectedForGrouping);
    if (selected.length < 2) return;

    const groupId = `manual-${Date.now()}`;
    const nextGroup: MeasurementCustomGroup = {
      id: groupId,
      name: `Group ${measurementConfig.customGroups.length + 1}`,
      ribIds: selected,
    };

    setMeasurementConfig(prev => {
      const selectedSet = new Set(selected);
      const existingGroups = prev.customGroups
        .map(g => ({ ...g, ribIds: g.ribIds.filter(ribId => !selectedSet.has(ribId)) }))
        .filter(g => g.ribIds.length > 0);
      return {
        ...prev,
        customGroups: [...existingGroups, nextGroup],
      };
    });
    setSelectedForGrouping(new Set());
    setExpandedGroups(prev => new Set(prev).add(groupId));
  };

  const startRenameRib = (ribId: string, currentName: string) => {
    setRenameTarget({ type: "rib", id: ribId, source: "single" });
    setRenameValue(currentName);
  };

  const startRenameGroup = (
    groupId: string,
    currentName: string,
    source: "custom" | "auto" | "single",
  ) => {
    setRenameTarget({ type: "group", id: groupId, source });
    setRenameValue(currentName);
  };

  const cancelRename = () => {
    setRenameTarget(null);
    setRenameValue("");
  };

  const startRenameBossStone = (markerId: string, currentName: string) => {
    setBossStoneRenameId(markerId);
    setBossStoneRenameValue(currentName);
  };

  const commitRenameBossStone = () => {
    const nextName = bossStoneRenameValue.trim();
    if (bossStoneRenameId && nextName) {
      setMeasurementConfig(prev => ({
        ...prev,
        bossStoneNameById: { ...prev.bossStoneNameById, [bossStoneRenameId]: nextName },
      }));
    }
    setBossStoneRenameId(null);
    setBossStoneRenameValue("");
  };

  const cancelRenameBossStone = () => {
    setBossStoneRenameId(null);
    setBossStoneRenameValue("");
  };

  const commitRename = () => {
    if (!renameTarget) return;
    const nextName = renameValue.trim();
    if (!nextName) return;

    if (renameTarget.type === "rib") {
      setMeasurementConfig(prev => ({
        ...prev,
        ribNameById: {
          ...prev.ribNameById,
          [renameTarget.id]: nextName,
        },
      }));
      cancelRename();
      return;
    }

    if (renameTarget.source === "custom") {
      setMeasurementConfig(prev => ({
        ...prev,
        customGroups: prev.customGroups.map(g =>
          g.id === renameTarget.id ? { ...g, name: nextName } : g
        ),
      }));
      cancelRename();
      return;
    }

    if (renameTarget.source === "auto") {
      setMeasurementConfig(prev => ({
        ...prev,
        groupNameById: {
          ...prev.groupNameById,
          [renameTarget.id]: nextName,
        },
      }));
      cancelRename();
    }
  };

  const toggleExpandGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  useEffect(() => {
    const computeCustomGroupMetrics = async () => {
      if (measurementConfig.customGroups.length === 0 || intradosLines.length === 0) {
        setCustomGroupMetrics({});
        return;
      }
      try {
        const response = await calculateCustomRibGroups({
          ribs: intradosLines.map(line => ({ id: line.id, points: line.points3d })),
          groups: measurementConfig.customGroups.map(g => ({
            groupId: g.id,
            groupName: g.name,
            ribIds: g.ribIds,
          })),
        });
        if (response.success && response.data) {
          const byId: Record<string, RibGroup["combinedMeasurements"]> = {};
          response.data.forEach(group => {
            byId[group.groupId] = group.combinedMeasurements;
          });
          setCustomGroupMetrics(byId);
        }
      } catch (err) {
        console.error("Error computing custom group measurements:", err);
      }
    };
    computeCustomGroupMetrics();
  }, [intradosLines, measurementConfig.customGroups]);

  const displayGroups = useMemo((): DisplayGroup[] => {
    const result: DisplayGroup[] = [];
    const assigned = new Set<string>();

    const fallbackCombined = (ribIds: string[]): RibGroup["combinedMeasurements"] => {
      const members = measurements.filter(m => ribIds.includes(m.id));
      const count = Math.max(members.length, 1);
      const avgRadius = members.reduce((acc, m) => acc + m.arcRadius, 0) / count;
      const totalLength = members.reduce((acc, m) => acc + m.ribLength, 0);
      return {
        arc_radius: avgRadius,
        rib_length: totalLength,
        apex_point: { x: 0, y: 0, z: 0 },
        arc_center: { x: 0, y: 0, z: 0 },
        arc_center_z: 0,
        fit_error: 0,
      };
    };

    for (const group of measurementConfig.customGroups) {
      const ribIds = group.ribIds.filter(ribId => intradosLines.some(line => line.id === ribId));
      if (ribIds.length === 0) continue;
      ribIds.forEach(ribId => assigned.add(ribId));
      result.push({
        groupId: group.id,
        groupName: group.name,
        ribIds,
        isGrouped: ribIds.length > 1,
        combinedMeasurements: customGroupMetrics[group.id] ?? fallbackCombined(ribIds),
        source: "custom",
      });
    }

    if (ribGroups) {
      for (const group of ribGroups) {
        if (measurementConfig.disabledAutoGroupIds.includes(group.groupId)) continue;
        const hasAssignedMember = group.ribIds.some(ribId => assigned.has(ribId));
        if (hasAssignedMember) continue;
        group.ribIds.forEach(ribId => assigned.add(ribId));
        result.push({
          ...group,
          groupName: measurementConfig.groupNameById[group.groupId] ?? group.groupName,
          source: group.isGrouped ? "auto" : "single",
        });
      }
    }

    for (const line of intradosLines) {
      if (assigned.has(line.id)) continue;
      const m = measurements.find(x => x.id === line.id);
      result.push({
        groupId: line.id,
        groupName: measurementConfig.ribNameById[line.id] ?? line.label,
        ribIds: [line.id],
        isGrouped: false,
        combinedMeasurements: {
          arc_radius: m?.arcRadius ?? 0,
          rib_length: m?.ribLength ?? 0,
          apex_point: { x: 0, y: 0, z: 0 },
          arc_center: { x: 0, y: 0, z: 0 },
          arc_center_z: 0,
          fit_error: 0,
        },
        source: "single",
      });
    }

    return result;
  }, [ribGroups, measurementConfig, intradosLines, measurements, customGroupMetrics]);

  const selectedGroup = useMemo(
    () => (selectedGroupId ? displayGroups.find(g => g.groupId === selectedGroupId) ?? null : null),
    [selectedGroupId, displayGroups]
  );

  useEffect(() => {
    if (!selectedRib) return;

    const containingGroup = displayGroups.find(group => group.ribIds.includes(selectedRib));
    if (!containingGroup) return;

    if (containingGroup.isGrouped && !expandedGroups.has(containingGroup.groupId)) {
      setExpandedGroups(prev => {
        if (prev.has(containingGroup.groupId)) return prev;
        const next = new Set(prev);
        next.add(containingGroup.groupId);
        return next;
      });
      return;
    }

    const target = ribRowRefs.current[selectedRib];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedRib, displayGroups]);

  // Scroll boss stone panel to the selected row when clicked in 3D viewer
  // Use manual viewport scroll to avoid the page itself scrolling
  useEffect(() => {
    if (!selectedBossStone) return;
    const target = bossStoneRowRefs.current[selectedBossStone];
    const viewport = bossStoneScrollAreaRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
    if (target && viewport) {
      const targetMid = target.offsetTop + target.offsetHeight / 2;
      const scrollTo = targetMid - viewport.clientHeight / 2;
      viewport.scrollTo({ top: scrollTo, behavior: "smooth" });
    }
  }, [selectedBossStone]);

  // Compute colored traces for all intrados lines
  useEffect(() => {
    const computeAllTraces = async () => {
      const allTraces: Line3D[] = [];
      measurementCacheRef.current.clear();
      
      for (const line of intradosLines) {
        try {
          const response = await calculateMeasurements({
            traceId: line.id,
            segmentStart: 0,
            segmentEnd: 1,
            tracePoints: line.points3d,
          });
          
          if (response.success && response.data) {
            // Cache measurement data so selection changes don't re-hit the API
            measurementCacheRef.current.set(line.id, response.data);

            let lineTraces: Line3D[] = [];
            
            if (viewMode === "bestFitArc") {
              lineTraces = createBestFitArcLines(
                response.data.segmentPoints,
                response.data.arcCenter,
                response.data.arcRadius,
                line.id
              );
            } else {
              // Always bake base heatmap colors without selection;
              // selection highlight is applied via the traceLines useMemo
              lineTraces = createColoredTraceLines(
                response.data.segmentPoints,
                response.data.pointDistances,
                line.id,
                false
              );
            }

            allTraces.push(...lineTraces);
          } else {
            console.error(`Error computing trace for ${line.id}:`, response.error);
          }
        } catch (err) {
          console.error(`Error computing trace for ${line.id}:`, err);
        }
      }
      
      setBaseTraceLines(allTraces);
    };
    
    if (intradosLines.length > 0) {
      computeAllTraces();
    }
  }, [intradosLines, viewMode]); // selectedRib removed — highlight is applied by useMemo
  
  // Load measurement data when rib is selected (for details panel)
  useEffect(() => {
    const loadMeasurement = async () => {
      if (!selectedRib) return;

      // Fast path: use data already cached by computeAllTraces
      const cached = measurementCacheRef.current.get(selectedRib);
      if (cached) {
        setMeasurementData(cached);
        return;
      }

      // Slow path: cache not yet populated (still loading), call API directly
      const selectedLine = intradosLines.find(line => line.id === selectedRib);
      if (!selectedLine) return;
      
      setIsCalculating(true);
      try {
        const response = await calculateMeasurements({
          traceId: selectedRib,
          segmentStart: 0,
          segmentEnd: 1,
          tracePoints: selectedLine.points3d,
        });
        
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
      name: measurementConfig.ribNameById[line.id] ?? line.label,
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
    return intradosLines.map(intradosToMeasurement);
  }, [intradosLines, measurementConfig.ribNameById]);

  // Compute rib label positions at each rib's apex point
  const ribLabels = useMemo((): RibLabel[] => {
    return intradosLines.map(line => {
      const pts = line.points3d;
      const apexIdx = pts.reduce((maxI, p, i, arr) => p[2] > arr[maxI][2] ? i : maxI, 0);
      return {
        id: line.id,
        label: measurementConfig.ribNameById[line.id] ?? line.label,
        position: { x: pts[apexIdx][0], y: pts[apexIdx][1], z: pts[apexIdx][2] },
      };
    });
  }, [intradosLines, measurementConfig.ribNameById]);

  // Full rib paths for click hit-areas in the 3D viewer (one tube per rib)
  const ribPaths = useMemo(() =>
    intradosLines.map(line => ({
      id: line.id,
      points: line.points3d.map(p => ({ x: p[0], y: p[1], z: p[2] })),
    })),
  [intradosLines]);

  // Merge custom names into markers so the 3D labels stay in sync
  const displayBossStoneMarkers = useMemo(() =>
    bossStoneMarkers.map(m => ({
      ...m,
      label: measurementConfig.bossStoneNameById[m.id] ?? m.label,
    })),
  [bossStoneMarkers, measurementConfig.bossStoneNameById]);
  
  // Update measurements when loaded data changes
  useEffect(() => {
    setMeasurements(loadedMeasurements);
  }, [loadedMeasurements]);
  
  const handleCalculate = async () => {
    setIsCalculating(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsCalculating(false);
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
  
  const handleContinue = async () => {
    await saveConfigNow();
    completeStep(7, { measurements });
    router.push("/workflow/step-8-analysis");
  };

  return (
    <div className="flex flex-col gap-6">
      <StepHeader 
        title="Measurements & Analysis"
        description="Calculate arc radius, rib length, and geometric properties"
      />
      
      <div className="grid lg:grid-cols-3 gap-6">

        {/* 3D Viewer */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-3">
              <div className="relative h-[504px]">
                {!pointCloudData && previewLoading ? (
                  <div className="h-full rounded-lg bg-muted flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Loading preview...</p>
                    </div>
                  </div>
                ) : pointCloudData ? (
                  <PointCloudViewer
                    points={pointCloudData}
                    className="h-full rounded-lg overflow-hidden"
                    colorMode="height"
                    showGrid={true}
                    showBoundingBox={true}
                    lines={traceLines}
                    lineWidth={0.03}
                    ribLabels={showLabels ? ribLabels : []}
                    selectedLabelId={selectedRib}
                    onLabelClick={setSelectedRib}
                    ribPaths={ribPaths}
                    onLineClick={setSelectedRib}
                    bossStoneMarkers={displayBossStoneMarkers}
                    showBossStones={showBossStones}
                    selectedBossStoneId={selectedBossStone}
                    onBossStoneClick={setSelectedBossStone}
                  />
                ) : (
                  <div className="h-full rounded-lg bg-muted flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">No data available</p>
                  </div>
                )}

                {/* Overlay toolbar */}
                <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                  <div className="flex rounded-lg border border-border bg-background/90 backdrop-blur-sm p-1">
                    <Button
                      variant={viewMode === "errorHeatmap" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("errorHeatmap")}
                      className="gap-1 h-7"
                    >
                      <Target className="w-3.5 h-3.5" />
                      <span className="text-xs">Error Heat</span>
                    </Button>
                    <Button
                      variant={viewMode === "bestFitArc" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("bestFitArc")}
                      className="gap-1 h-7"
                    >
                      <Circle className="w-3.5 h-3.5" />
                      <span className="text-xs">Best Fit Arc</span>
                    </Button>
                  </div>
                  <div className="flex rounded-lg border border-border bg-background/90 backdrop-blur-sm p-1">
                  <Button
                    variant={showLabels ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setShowLabels(v => !v)}
                    className="gap-1 h-7"
                    title={showLabels ? "Hide rib labels" : "Show rib labels"}
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span className="text-xs">Ribs</span>
                  </Button>
                  {bossStoneMarkers.length > 0 && (
                    <Button
                      variant={showBossStones ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setShowBossStones(v => !v)}
                      className="gap-1 h-7"
                      title={showBossStones ? "Hide boss stones" : "Show boss stones"}
                    >
                      <Circle className="w-3.5 h-3.5" />
                      <span className="text-xs">Bosses</span>
                    </Button>
                  )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right panel — rib list + impost + details */}
        <div className="flex flex-col gap-4">

          {/* Rib list card */}
          <Card>
            <CardHeader className="pb-2 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-display">Rib Measurements</CardTitle>
                  <CardDescription>Select a rib to view details</CardDescription>
                </div>
                <Button size="sm" onClick={handleExportAllRibs} disabled={exportingRibs} className="gap-2">
                  {exportingRibs ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 px-4 pb-4">

              {/* Rib list */}
              {previewLoading && displayGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Loading ribs…</p>
                </div>
              ) : (
              <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Selected for grouping: {selectedForGrouping.size}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 gap-1"
                  onClick={handleCreateCustomGroup}
                  disabled={selectedForGrouping.size < 2}
                  title="Create a manual group from selected ribs"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span className="text-xs">Group Selected</span>
                </Button>
              </div>
              {renameTarget && (
                <div className="rounded-md border bg-muted/40 p-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      placeholder={renameTarget.type === "rib" ? "Rib name" : "Group name"}
                      className="h-8"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") cancelRename();
                      }}
                    />
                    <Button size="icon" variant="secondary" className="h-8 w-8" onClick={commitRename} title="Save rename">
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelRename} title="Cancel rename">
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
              <ScrollArea className="h-64">
                <div className="space-y-2 pr-2">
                    {displayGroups.length > 0 ? displayGroups.map((group) => {
                      const isMulti = group.isGrouped && group.ribIds.length > 1;
                      const isExpanded = expandedGroups.has(group.groupId);
                      const primaryId = group.ribIds[0];
                      const groupTitle = group.groupName ?? `Group (${group.ribIds.length} ribs)`;

                      if (isMulti) {
                        return (
                          <div key={group.groupId} className="rounded-lg border border-amber-500/60 overflow-hidden">
                            <div
                              className={cn(
                                "p-3 cursor-pointer transition-colors bg-amber-500/5 hover:bg-amber-500/10",
                                (selectedGroupId === group.groupId || group.ribIds.includes(selectedRib ?? "")) && "bg-amber-500/15"
                              )}
                              onClick={() => {
                                setSelectedGroupId(group.groupId);
                                setSelectedRib(primaryId);
                                toggleExpandGroup(group.groupId);
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Link2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  <span className="font-medium text-sm truncate">
                                    {groupTitle} ({group.ribIds.length} ribs)
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-xs text-muted-foreground">
                                    R: {group.combinedMeasurements.arc_radius.toFixed(2)}m
                                  </span>
                                  <button
                                    className="p-0.5 rounded hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                                    title="Rename this group"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startRenameGroup(group.groupId, groupTitle, group.source);
                                    }}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    className="p-0.5 rounded hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                                    title="Ungroup these ribs"
                                    onClick={(e) => { e.stopPropagation(); handleUngroup(group.groupId, group.source); }}
                                  >
                                    <Link2Off className="w-3.5 h-3.5" />
                                  </button>
                                  {isExpanded
                                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                                </div>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                L: {group.combinedMeasurements.rib_length.toFixed(2)}m
                                {" · "}Err: {group.combinedMeasurements.fit_error.toFixed(4)}m
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="border-t border-amber-500/30 divide-y divide-amber-500/20">
                                {group.ribIds.map(ribId => {
                                  const m = measurements.find(x => x.id === ribId);
                                  return (
                                    <div
                                      key={ribId}
                                      ref={(el) => {
                                        ribRowRefs.current[ribId] = el;
                                      }}
                                      className={cn(
                                        "px-3 py-2 cursor-pointer transition-colors hover:bg-muted/50",
                                        selectedRib === ribId && "bg-primary/5"
                                      )}
                                      onClick={() => { setSelectedRib(ribId); setSelectedGroupId(null); }}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <button
                                            className="p-0.5 rounded hover:bg-muted"
                                            title="Toggle rib for grouping"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleRibForGrouping(ribId);
                                            }}
                                          >
                                            {selectedForGrouping.has(ribId)
                                              ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                                              : <Square className="w-3.5 h-3.5 text-muted-foreground" />}
                                          </button>
                                          <span className="text-sm truncate">{m?.name ?? ribId}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <button
                                            className="p-0.5 rounded hover:bg-muted"
                                            title="Rename rib"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              startRenameRib(ribId, m?.name ?? ribId);
                                            }}
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>
                                        <span className="text-xs text-muted-foreground">
                                          {m && m.arcRadius > 0 ? `R: ${m.arcRadius.toFixed(2)}m` : ""}
                                        </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }

                      const m = measurements.find(x => x.id === primaryId);
                      return (
                        <div
                          key={group.groupId}
                          ref={(el) => {
                            ribRowRefs.current[primaryId] = el;
                          }}
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-colors",
                            selectedRib === primaryId
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          )}
                          onClick={() => { setSelectedRib(primaryId); setSelectedGroupId(null); }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <button
                                className="p-0.5 rounded hover:bg-muted"
                                title="Toggle rib for grouping"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleRibForGrouping(primaryId);
                                }}
                              >
                                {selectedForGrouping.has(primaryId)
                                  ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                                  : <Square className="w-3.5 h-3.5 text-muted-foreground" />}
                              </button>
                              <span className="font-medium truncate">{m?.name ?? group.groupName ?? primaryId}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {!isRibInCustomGroup(primaryId) && group.source === "auto" && (
                                <button
                                  className="p-0.5 rounded hover:bg-muted"
                                  title="Rename suggested auto group"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startRenameGroup(group.groupId, group.groupName ?? "Group", group.source);
                                  }}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                className="p-0.5 rounded hover:bg-muted"
                                title="Rename rib"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startRenameRib(primaryId, m?.name ?? primaryId);
                                }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-sm text-muted-foreground">
                                {m && m.arcRadius > 0 && `R: ${m.arcRadius.toFixed(2)}m`}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }) : null}
                </div>
              </ScrollArea>

              {/* Keystone gap slider */}
              <div className="shrink-0 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <label>Max keystone gap</label>
                  <span className="font-mono">{proximityThreshold.toFixed(1)} m</span>
                </div>
                <Slider
                  min={0.1}
                  max={5.0}
                  step={0.1}
                  value={[proximityThreshold]}
                  onValueChange={([v]) => setProximityThreshold(v)}
                />
                {isDetectingGroups && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Detecting groups…
                  </p>
                )}
              </div>
              </>
              )}

            </CardContent>
          </Card>

          {/* Boss Stones panel — only shown when boss stone markers were detected */}
          {bossStoneMarkers.length > 0 && (
            <Card>
              <CardHeader className="pb-2 shrink-0">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <Circle className="w-4 h-4 text-blue-400" />
                  Boss Stones
                </CardTitle>
                <CardDescription className="text-xs">
                  Rename detected boss stone / keystone markers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 px-4 pb-4">
                {bossStoneRenameId && (
                  <div className="rounded-md border bg-muted/40 p-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={bossStoneRenameValue}
                        onChange={(e) => setBossStoneRenameValue(e.target.value)}
                        placeholder="Boss stone name"
                        className="h-8"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRenameBossStone();
                          if (e.key === "Escape") cancelRenameBossStone();
                        }}
                      />
                      <Button size="icon" variant="secondary" className="h-8 w-8" onClick={commitRenameBossStone} title="Save name">
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelRenameBossStone} title="Cancel">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
                <div ref={bossStoneScrollAreaRef}>
                <ScrollArea className="h-48">
                  <div className="space-y-2 pr-2">
                    {bossStoneMarkers.map((marker) => {
                      const displayName = measurementConfig.bossStoneNameById[marker.id] || marker.label;
                      const isRenaming = bossStoneRenameId === marker.id;
                      const isSelected = selectedBossStone === marker.id;
                      return (
                        <div
                          key={marker.id}
                          ref={(el) => { bossStoneRowRefs.current[marker.id] = el; }}
                          className={cn(
                            "p-3 rounded-lg border transition-colors cursor-pointer",
                            isRenaming
                              ? "border-blue-400/60 bg-blue-400/5"
                              : isSelected
                              ? "border-blue-400/70 bg-blue-400/10"
                              : "border-border hover:border-blue-400/50"
                          )}
                          onClick={() => setSelectedBossStone(isSelected ? null : marker.id)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ background: isSelected ? "#88CCFF" : "#4488FF" }}
                              />
                              <span className="text-sm font-medium truncate">{displayName}</span>
                            </div>
                            <button
                              className="p-0.5 rounded hover:bg-muted shrink-0"
                              title="Rename"
                              onClick={(e) => { e.stopPropagation(); startRenameBossStone(marker.id, displayName); }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Impost Line */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-display">Impost Line</CardTitle>
                {isLoadingImpost && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
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

              {impostMode === "floorPlane" && (
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  {step5FloorPlaneZ !== undefined ? (
                    <p className="text-muted-foreground">
                      Floor plane Z from Step 5:{" "}
                      <span className="font-mono font-semibold text-foreground">
                        {step5FloorPlaneZ.toFixed(3)}m
                      </span>
                    </p>
                  ) : (
                    <p className="text-amber-600 dark:text-amber-400">
                      Floor plane not set in Step 5. Switch to <strong>Auto</strong> mode.
                    </p>
                  )}
                </div>
              )}

              {impostMode === "auto" && (
                impostLineData ? (
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs text-muted-foreground">
                      Height ({impostLineData.num_ribs_used} ribs)
                    </p>
                    <p className="font-bold">{impostLineData.impost_height.toFixed(3)}m</p>
                  </div>
                ) : (
                  <p className="text-center text-xs text-muted-foreground py-1">
                    {isLoadingImpost ? "Calculating..." : "No impost data available"}
                  </p>
                )
              )}
            </CardContent>
          </Card>

          {/* Selected rib / group details card */}
          {(selectedGroup || selectedMeasurement) && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-display">
                    {selectedGroup
                      ? `${selectedGroup.groupName ?? "Group"} (${selectedGroup.ribIds.length} ribs)`
                      : selectedMeasurement!.name}
                  </CardTitle>
                  {isLoadingImpost && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 px-4 pb-4">
                {selectedGroup ? (
                  // ── Group combined metrics ──────────────────────────────
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded-lg bg-muted/50 text-center">
                        <Circle className="w-3.5 h-3.5 mx-auto mb-0.5 text-primary" />
                        <p className="text-sm font-bold">{selectedGroup.combinedMeasurements.arc_radius.toFixed(2)}m</p>
                        <p className="text-xs text-muted-foreground">Arc Radius</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/50 text-center">
                        <Ruler className="w-3.5 h-3.5 mx-auto mb-0.5 text-primary" />
                        <p className="text-sm font-bold">{selectedGroup.combinedMeasurements.rib_length.toFixed(2)}m</p>
                        <p className="text-xs text-muted-foreground">Total Length</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/50 text-center col-span-2">
                        <p className="text-sm font-bold">{selectedGroup.combinedMeasurements.fit_error.toFixed(4)}m</p>
                        <p className="text-xs text-muted-foreground">Fit Error</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Individual Ribs</Label>
                      {selectedGroup.ribIds.map(ribId => {
                        const m = measurements.find(x => x.id === ribId);
                        const cached = measurementCacheRef.current.get(ribId);
                        return (
                          <button
                            key={ribId}
                            className="w-full text-left px-2 py-1 rounded text-xs hover:bg-muted/60 flex items-center justify-between"
                            onClick={() => { setSelectedRib(ribId); setSelectedGroupId(null); }}
                          >
                            <span className="truncate">{m?.name ?? ribId}</span>
                            <span className="text-muted-foreground shrink-0 ml-2">
                              {cached?.arcRadius ? `R: ${cached.arcRadius.toFixed(2)}m` : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  // ── Individual rib metrics ──────────────────────────────
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded-lg bg-muted/50 text-center">
                        <Circle className="w-3.5 h-3.5 mx-auto mb-0.5 text-primary" />
                        <p className="text-sm font-bold">{(measurementData?.arcRadius ?? selectedMeasurement!.arcRadius).toFixed(2)}m</p>
                        <p className="text-xs text-muted-foreground">Arc Radius</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/50 text-center">
                        <Ruler className="w-3.5 h-3.5 mx-auto mb-0.5 text-primary" />
                        <p className="text-sm font-bold">{(measurementData?.ribLength ?? selectedMeasurement!.ribLength).toFixed(2)}m</p>
                        <p className="text-xs text-muted-foreground">Rib Length</p>
                      </div>
                      {selectedRibImpostData && (
                        <div className="p-2 rounded-lg bg-muted/50 text-center">
                          <Ruler className="w-3.5 h-3.5 mx-auto mb-0.5 text-primary" />
                          <p className="text-sm font-bold">{selectedRibImpostData.impost_distance.toFixed(3)}m</p>
                          <p className="text-xs text-muted-foreground">Impost Dist</p>
                        </div>
                      )}
                      {measurementData && (
                        <div className="p-2 rounded-lg bg-muted/50 text-center">
                          <p className="text-sm font-bold">{measurementData.fitError.toFixed(4)}m</p>
                          <p className="text-xs text-muted-foreground">Fit Error</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Apex Point</Label>
                      <div className="grid grid-cols-3 gap-1.5 text-xs">
                        <div className="p-1.5 rounded bg-muted/30 text-center">
                          <p className="text-muted-foreground font-medium">X</p>
                          <p className="font-mono">{selectedMeasurement!.apexPoint?.x.toFixed(2)}</p>
                        </div>
                        <div className="p-1.5 rounded bg-muted/30 text-center">
                          <p className="text-muted-foreground font-medium">Y</p>
                          <p className="font-mono">{selectedMeasurement!.apexPoint?.y.toFixed(2)}</p>
                        </div>
                        <div className="p-1.5 rounded bg-muted/30 text-center">
                          <p className="text-muted-foreground font-medium">Z</p>
                          <p className="font-mono">{selectedMeasurement!.apexPoint?.z.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>

                    {selectedMeasurement!.springingPoints && selectedMeasurement!.springingPoints.length > 0 && (() => {
                      const point = selectedMeasurement!.springingPoints[0];
                      return (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Springing Point</Label>
                          <div className="grid grid-cols-3 gap-1.5 text-xs">
                            <div className="p-1.5 rounded bg-muted/30 text-center">
                              <p className="text-muted-foreground font-medium">X</p>
                              <p className="font-mono">{point.x.toFixed(2)}</p>
                            </div>
                            <div className="p-1.5 rounded bg-muted/30 text-center">
                              <p className="text-muted-foreground font-medium">Y</p>
                              <p className="font-mono">{point.y.toFixed(2)}</p>
                            </div>
                            <div className="p-1.5 rounded bg-muted/30 text-center">
                              <p className="text-muted-foreground font-medium">Z</p>
                              <p className="font-mono">{point.z.toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      </div>
      
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

