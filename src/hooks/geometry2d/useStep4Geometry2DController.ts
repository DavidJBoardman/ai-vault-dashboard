"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  saveROI,
  ROIData,
  getIntradosLines,
  IntradosLine,
  prepareGeometry2DInputs,
  type Geometry2DRoiParams,
} from "@/lib/api";
import { useProjectStore, Segmentation } from "@/lib/store";
import { ROIState, useRoiInteraction } from "@/hooks/useRoiInteraction";
import { GeometryResult, Geometry2DWorkflowSection, GroupVisibilityInfo } from "@/components/geometry2d/types";

export type ImageViewType = "colour" | "depthGrayscale" | "depthPlasma";

interface Step4Geometry2DState {
  roi?: ROIState;
  ui?: {
    activeSection?: Geometry2DWorkflowSection;
    showAdvancedLayers?: boolean;
  };
  prep?: {
    bossCount?: number;
    roiPath?: string;
    bossReportPath?: string;
    outputDir?: string;
    vaultRatio?: number;
    vaultRatioSuggestions?: Array<{ label: string; err: number }>;
    autoCorrectRoi?: boolean;
    correctionApplied?: boolean;
    originalRoi?: ROIState;
    correctedRoi?: ROIState;
    appliedRoi?: ROIState;
    showOriginalOverlay?: boolean;
    showUpdatedOverlay?: boolean;
    analysedAt?: string;
  };
  analysis?: GeometryResult | null;
  roiStats?: { insideCount: number; outsideCount: number };
}

const DEFAULT_ROI: ROIState = {
  x: 0.5,
  y: 0.5,
  width: 0.6,
  height: 0.6,
  rotation: 0,
};

function roiParamsToState(params: Geometry2DRoiParams | undefined, resolution: number): ROIState | undefined {
  if (!params) return undefined;
  if (resolution <= 0) return undefined;
  return {
    x: params.cx / resolution,
    y: params.cy / resolution,
    width: params.w / resolution,
    height: params.h / resolution,
    rotation: params.rotation_deg || 0,
  };
}

export function useStep4Geometry2DController() {
  const { currentProject, setGeometryResult, completeStep, updateSegmentation } = useProjectStore();

  const [isAnalysing, setIsAnalysing] = useState(false);
  const [result, setResult] = useState<GeometryResult | null>(null);
  const [vaultRatio, setVaultRatio] = useState<number | undefined>(undefined);
  const [vaultRatioSuggestions, setVaultRatioSuggestions] = useState<Array<{ label: string; err: number }>>([]);
  const [bossCount, setBossCount] = useState<number | undefined>(undefined);
  const [analysedAt, setAnalysedAt] = useState<string | undefined>(undefined);
  const [autoCorrectRoi, setAutoCorrectRoi] = useState(true);
  const [correctionApplied, setCorrectionApplied] = useState<boolean | undefined>(undefined);
  const [originalRoiPreview, setOriginalRoiPreview] = useState<ROIState | undefined>(undefined);
  const [correctedRoiPreview, setCorrectedRoiPreview] = useState<ROIState | undefined>(undefined);
  const [showOriginalOverlay, setShowOriginalOverlay] = useState(true);
  const [showUpdatedOverlay, setShowUpdatedOverlay] = useState(true);

  const [roi, setRoi] = useState<ROIState>(DEFAULT_ROI);
  const [showROI, setShowROI] = useState(true);
  const [isSavingROI, setIsSavingROI] = useState(false);
  const [roiSaveResult, setRoiSaveResult] = useState<{ inside: number; outside: number } | null>(null);

  const [intradosLines, setIntradosLines] = useState<IntradosLine[]>([]);
  const [showIntrados, setShowIntrados] = useState(true);
  const [activeSection, setActiveSection] = useState<Geometry2DWorkflowSection>("roi");
  const [showAdvancedLayers, setShowAdvancedLayers] = useState(true);

  const canvasRef = useRef<HTMLDivElement>(null);

  const [selectedImageType, setSelectedImageType] = useState<ImageViewType>("colour");
  const [overlayOpacity, setOverlayOpacity] = useState(0.6);
  const [showMaskOverlay, setShowMaskOverlay] = useState(true);

  const updateStep4Geometry2D = useCallback((patch: Partial<Step4Geometry2DState>) => {
    const existingStep4Data = currentProject?.steps?.[4]?.data || {};
    const existingGeometry2d = (existingStep4Data as { geometry2d?: Step4Geometry2DState }).geometry2d || {};
    completeStep(4, {
      ...existingStep4Data,
      geometry2d: {
        ...existingGeometry2d,
        ...patch,
      },
    });
  }, [completeStep, currentProject?.steps]);

  const selectedProjection = useMemo(() => {
    if (!currentProject?.projections?.length) return null;
    return currentProject.projections[0];
  }, [currentProject?.projections]);

  const currentImage = useMemo(() => {
    if (!selectedProjection?.images) return null;
    return selectedProjection.images[selectedImageType] || selectedProjection.images.colour;
  }, [selectedProjection, selectedImageType]);

  const segmentations = useMemo(() => currentProject?.segmentations || [], [currentProject?.segmentations]);

  const groupedSegmentations = useMemo(() => {
    const groups: Record<string, Segmentation[]> = {};
    segmentations.forEach(seg => {
      const baseLabel = seg.label.replace(/\s*#?\d+$/, "").trim() || seg.label;
      if (!groups[baseLabel]) {
        groups[baseLabel] = [];
      }
      groups[baseLabel].push(seg);
    });
    return groups;
  }, [segmentations]);

  const groupVisibility = useMemo(() => {
    const visibility: Record<string, GroupVisibilityInfo> = {};
    Object.entries(groupedSegmentations).forEach(([label, segs]) => {
      visibility[label] = {
        visible: segs.filter(s => s.visible).length,
        total: segs.length,
        color: segs[0]?.color || "#888888",
      };
    });
    return visibility;
  }, [groupedSegmentations]);

  const toggleGroupVisibility = (groupLabel: string) => {
    const group = groupedSegmentations[groupLabel];
    if (!group) return;
    const anyVisible = group.some(s => s.visible);
    group.forEach(seg => {
      updateSegmentation(seg.id, { visible: !anyVisible });
    });
  };

  const toggleAllVisibility = (visible: boolean) => {
    segmentations.forEach(seg => {
      updateSegmentation(seg.id, { visible });
    });
  };

  const visibleMasks = segmentations.filter(s => s.visible);

  const { handleMouseDown, handleMouseMove, handleMouseUp, getROICorners } = useRoiInteraction({
    canvasRef,
    showROI,
    roi,
    setRoi,
  });

  const handleAutoCorrectToggle = (checked: boolean) => {
    setAutoCorrectRoi(checked);
    if (checked && correctedRoiPreview) {
      setRoi(correctedRoiPreview);
    } else if (!checked && originalRoiPreview) {
      setRoi(originalRoiPreview);
    }

    updateStep4Geometry2D({
      prep: {
        ...((currentProject?.steps?.[4]?.data as { geometry2d?: Step4Geometry2DState } | undefined)?.geometry2d?.prep || {}),
        autoCorrectRoi: checked,
      },
    });
  };

  const handleWorkflowSectionChange = (section: Geometry2DWorkflowSection) => {
    setActiveSection(section);
    updateStep4Geometry2D({
      ui: {
        ...((currentProject?.steps?.[4]?.data as { geometry2d?: Step4Geometry2DState } | undefined)?.geometry2d?.ui || {}),
        activeSection: section,
      },
    });
  };

  const handleAdvancedLayersChange = (checked: boolean) => {
    setShowAdvancedLayers(checked);
    updateStep4Geometry2D({
      ui: {
        ...((currentProject?.steps?.[4]?.data as { geometry2d?: Step4Geometry2DState } | undefined)?.geometry2d?.ui || {}),
        showAdvancedLayers: checked,
      },
    });
  };

  const handleShowOriginalOverlayChange = (checked: boolean) => {
    setShowOriginalOverlay(checked);
    updateStep4Geometry2D({
      prep: {
        ...((currentProject?.steps?.[4]?.data as { geometry2d?: Step4Geometry2DState } | undefined)?.geometry2d?.prep || {}),
        showOriginalOverlay: checked,
      },
    });
  };

  const handleShowUpdatedOverlayChange = (checked: boolean) => {
    setShowUpdatedOverlay(checked);
    updateStep4Geometry2D({
      prep: {
        ...((currentProject?.steps?.[4]?.data as { geometry2d?: Step4Geometry2DState } | undefined)?.geometry2d?.prep || {}),
        showUpdatedOverlay: checked,
      },
    });
  };

  const handleSaveROI = async () => {
    if (!currentProject) return;

    setIsSavingROI(true);
    setRoiSaveResult(null);

    try {
      const resolution = selectedProjection?.settings?.resolution || 2048;
      const corners = getROICorners(roi);

      const roiData: ROIData = {
        x: roi.x * resolution,
        y: roi.y * resolution,
        width: roi.width * resolution,
        height: roi.height * resolution,
        rotation: roi.rotation,
        corners: corners.map(([cx, cy]) => [cx * resolution, cy * resolution]),
      };

      const saveResult = await saveROI(currentProject.id, roiData);

      if (saveResult.success && saveResult.data) {
        setRoiSaveResult({
          inside: saveResult.data.insideCount,
          outside: saveResult.data.outsideCount,
        });

        updateStep4Geometry2D({
          roi: {
            x: roi.x,
            y: roi.y,
            width: roi.width,
            height: roi.height,
            rotation: roi.rotation,
          },
          roiStats: {
            insideCount: saveResult.data.insideCount,
            outsideCount: saveResult.data.outsideCount,
          },
        });
      } else {
        alert(`Failed to save ROI: ${saveResult.error}`);
      }
    } catch (error) {
      console.error("Error saving ROI:", error);
    } finally {
      setIsSavingROI(false);
    }
  };

  useEffect(() => {
    const loadIntradosLines = async () => {
      if (!currentProject?.id) return;
      try {
        const response = await getIntradosLines(currentProject.id);
        if (response.success && response.data) {
          setIntradosLines(response.data.lines || []);
        }
      } catch (error) {
        console.error("Error loading intrados lines:", error);
      }
    };

    loadIntradosLines();
  }, [currentProject?.id]);

  useEffect(() => {
    const step4Data = currentProject?.steps?.[4]?.data as
      | {
          geometry2d?: Step4Geometry2DState;
          geometry2dPrep?: { vaultRatio?: number; vaultRatioSuggestions?: Array<{ label: string; err: number }> };
          geometryResult?: GeometryResult | null;
          roi?: ROIState;
        }
      | undefined;
    const geometry2dData = step4Data?.geometry2d;
    const legacyPrep = step4Data?.geometry2dPrep;
    const legacyAnalysis = step4Data?.geometryResult;
    const legacyRoi = step4Data?.roi;

    if (!geometry2dData && (legacyPrep || legacyAnalysis !== undefined || legacyRoi)) {
      updateStep4Geometry2D({
        prep: legacyPrep,
        analysis: legacyAnalysis,
        roi: legacyRoi,
      });
    }

    const prepData = geometry2dData?.prep;
    if (prepData) {
      setVaultRatio(prepData.vaultRatio);
      setVaultRatioSuggestions(prepData.vaultRatioSuggestions || []);
      setBossCount(prepData.bossCount);
      setAnalysedAt(prepData.analysedAt);
      setAutoCorrectRoi(prepData.autoCorrectRoi ?? true);
      setCorrectionApplied(prepData.correctionApplied);
      setOriginalRoiPreview(prepData.originalRoi);
      setCorrectedRoiPreview(prepData.correctedRoi);
      setShowOriginalOverlay(prepData.showOriginalOverlay ?? true);
      setShowUpdatedOverlay(prepData.showUpdatedOverlay ?? true);
    }
    if (geometry2dData?.ui) {
      setActiveSection(geometry2dData.ui.activeSection || "roi");
      setShowAdvancedLayers(geometry2dData.ui.showAdvancedLayers ?? true);
    }
    if (geometry2dData?.analysis) {
      setResult(geometry2dData.analysis);
    }

    const step4Roi = geometry2dData?.roi;
    if (step4Roi && step4Roi.x !== undefined) {
      setRoi({
        x: step4Roi.x,
        y: step4Roi.y,
        width: step4Roi.width,
        height: step4Roi.height,
        rotation: step4Roi.rotation || 0,
      });
      return;
    }

    const step3Roi = currentProject?.steps?.[3]?.data?.roi as ROIState | undefined;
    if (step3Roi && step3Roi.x !== undefined) {
      updateStep4Geometry2D({ roi: step3Roi });
      setRoi({
        x: step3Roi.x,
        y: step3Roi.y,
        width: step3Roi.width,
        height: step3Roi.height,
        rotation: step3Roi.rotation || 0,
      });
    }
  }, [currentProject?.steps, updateStep4Geometry2D]);

  const handleAnalyse = async () => {
    if (!currentProject?.id) {
      alert("No active project selected.");
      return;
    }
    if (!selectedProjection?.id) {
      alert("No projection selected.");
      return;
    }

    setIsAnalysing(true);

    try {
      const prepResponse = await prepareGeometry2DInputs({
        projectId: currentProject.id,
        projectionId: selectedProjection.id,
        autoCorrectRoi,
      });

      if (!prepResponse.success || !prepResponse.data) {
        throw new Error(prepResponse.error || "Failed to prepare Geometry2D inputs.");
      }

      const resolution = selectedProjection?.settings?.resolution || 2048;
      const originalFromBackend = roiParamsToState(prepResponse.data.originalRoiParams, resolution);
      const correctedFromBackend = roiParamsToState(prepResponse.data.correctedRoiParams, resolution);
      const appliedFromBackend = roiParamsToState(prepResponse.data.appliedRoiParams, resolution);
      const nextRoi = appliedFromBackend || roi;

      setOriginalRoiPreview(originalFromBackend);
      setCorrectedRoiPreview(correctedFromBackend);
      setCorrectionApplied(prepResponse.data.correctionApplied);
      setShowOriginalOverlay(true);
      setShowUpdatedOverlay(!!correctedFromBackend);
      setRoi(nextRoi);

      updateStep4Geometry2D({
        roi: nextRoi,
        prep: {
          bossCount: prepResponse.data.bossCount,
          roiPath: prepResponse.data.roiPath,
          bossReportPath: prepResponse.data.bossReportPath,
          outputDir: prepResponse.data.outputDir,
          vaultRatio: prepResponse.data.vaultRatio,
          vaultRatioSuggestions: prepResponse.data.vaultRatioSuggestions || [],
          autoCorrectRoi,
          correctionApplied: prepResponse.data.correctionApplied,
          originalRoi: originalFromBackend,
          correctedRoi: correctedFromBackend,
          appliedRoi: appliedFromBackend,
          showOriginalOverlay: true,
          showUpdatedOverlay: !!correctedFromBackend,
          analysedAt: new Date().toISOString(),
        },
      });

      setVaultRatio(prepResponse.data.vaultRatio);
      setVaultRatioSuggestions(prepResponse.data.vaultRatioSuggestions || []);
      setBossCount(prepResponse.data.bossCount);
      setAnalysedAt(new Date().toISOString());

      setGeometryResult({
        classification: null,
        bossStones: [],
        px: 0,
        py: 0,
        boundingBox: {
          x: nextRoi.x,
          y: nextRoi.y,
          width: nextRoi.width,
          height: nextRoi.height,
        },
      });

      alert(
        `Geometry2D inputs prepared. Detected ${prepResponse.data.bossCount} boss centres. ROI correction ${
          prepResponse.data.correctionApplied ? "applied" : autoCorrectRoi ? "skipped" : "disabled"
        }.`
      );
    } catch (error) {
      console.error("Failed to prepare Geometry2D inputs:", error);
      alert(error instanceof Error ? error.message : "Failed to prepare Geometry2D inputs.");
    } finally {
      setIsAnalysing(false);
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

  const persistAnalysisForContinue = () => {
    updateStep4Geometry2D({ analysis: result });
  };

  return {
    currentProject,
    selectedProjection,
    currentImage,
    segmentations,
    groupVisibility,
    visibleMasks,
    canvasRef,

    isAnalysing,
    result,
    vaultRatio,
    vaultRatioSuggestions,
    bossCount,
    analysedAt,
    autoCorrectRoi,
    correctionApplied,
    originalRoiPreview,
    correctedRoiPreview,
    showOriginalOverlay,
    showUpdatedOverlay,

    roi,
    setRoi,
    showROI,
    setShowROI,
    isSavingROI,
    roiSaveResult,

    intradosLines,
    showIntrados,
    setShowIntrados,
    activeSection,
    showAdvancedLayers,

    selectedImageType,
    setSelectedImageType,
    overlayOpacity,
    setOverlayOpacity,
    showMaskOverlay,
    setShowMaskOverlay,

    handleMouseDown,
    handleMouseMove,
    handleMouseUp,

    handleAutoCorrectToggle,
    handleWorkflowSectionChange,
    handleAdvancedLayersChange,
    handleShowOriginalOverlayChange,
    handleShowUpdatedOverlayChange,
    handleSaveROI,
    handleAnalyse,
    handleExportCSV,
    toggleGroupVisibility,
    toggleAllVisibility,
    persistAnalysisForContinue,

    hasProjection: !!selectedProjection,
    hasSegmentations: segmentations.length > 0,
  };
}
