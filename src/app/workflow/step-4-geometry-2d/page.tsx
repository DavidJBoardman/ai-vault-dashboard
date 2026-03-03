"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  WorkflowStepperCard,
  type WorkflowStepperItem,
  LayerControlsToggleCard,
  RoiEvidenceLayersCard,
  ReferencePointLayersCard,
  SegmentationGroupsCard,
  OverlaySettingsCard,
  RoiAccessCard,
  NodePreparationCard,
  Geometry2DInspectorPanel,
  ProjectionCanvas,
  ReconstructionLayersCard,
  RoiControls,
} from "@/components/geometry2d";
import { useStep4Geometry2DController } from "@/hooks/geometry2d/useStep4Geometry2DController";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";

export default function Step4Geometry2DPage() {
  const router = useRouter();
  const controller = useStep4Geometry2DController();
  const [selectedReconstructionEdgeKey, setSelectedReconstructionEdgeKey] = useState<string | null>(null);
  const [stageToolTab, setStageToolTab] = useState<"controls" | "overlays">("controls");
  const hasInitialisedRoiEvidenceLayers = useRef(false);
  const hasInitialisedNodeLayers = useRef(false);
  const hasInitialisedMatchingLayers = useRef(false);
  const hasInitialisedReconstructLayers = useRef(false);
  const isRoiStage = controller.activeSection === "roi";
  const isNodesStage = controller.activeSection === "nodes";
  const isMatchingStage = controller.activeSection === "matching";
  const isReconstructStage = controller.activeSection === "reconstruct";
  const hasSavedNodes = controller.templatePoints.length > 0 && !controller.hasTemplatePointChanges;
  const hasMatchingResult = !!controller.templateLastRunAt;
  const hasReconstructionResult = !!controller.reconstructLastRunAt;
  const hasVisibleReferenceSegmentationLayers = Object.values(controller.groupVisibility).some((info) => info.visible > 0);

  const workflowSections = useMemo<WorkflowStepperItem[]>(
    () => [
      {
        id: "roi" as const,
        stepLabel: "A",
        title: "ROI & Bay Proportion",
        status: controller.activeSection === "roi"
          ? "current"
          : controller.hasSavedRoi
            ? "completed"
            : "available",
      },
      {
        id: "nodes" as const,
        stepLabel: "B",
        title: "Reference Points",
        status: controller.activeSection === "nodes"
          ? "current"
          : hasSavedNodes
            ? "completed"
            : controller.hasSavedRoi
              ? "available"
              : "locked",
        lockedReason: "Complete and save A first",
      },
      {
        id: "matching" as const,
        stepLabel: "C",
        title: "Cut-Typology",
        status: controller.activeSection === "matching"
          ? "current"
          : hasMatchingResult
            ? "completed"
            : hasSavedNodes
              ? "available"
              : "locked",
        lockedReason: "Save nodes in B first",
      },
      {
        id: "reconstruct" as const,
        stepLabel: "D",
        title: "Bay Plan",
        status: controller.activeSection === "reconstruct"
          ? "current"
          : hasReconstructionResult
            ? "completed"
            : hasMatchingResult
              ? "available"
              : "locked",
        lockedReason: "Run cut-typology in C first",
      },
    ],
    [
      controller.activeSection,
      controller.hasSavedRoi,
      hasMatchingResult,
      hasReconstructionResult,
      hasSavedNodes,
    ]
  );

  const handleContinue = () => {
    controller.persistAnalysisForContinue();
    router.push("/workflow/step-5-reprojection");
  };

  useEffect(() => {
    if (!isRoiStage || hasInitialisedRoiEvidenceLayers.current) return;
    hasInitialisedRoiEvidenceLayers.current = true;
    if (controller.segmentations.some((seg) => seg.visible)) {
      controller.toggleAllVisibility(false);
    }
  }, [controller, isRoiStage]);

  useEffect(() => {
    if (!isNodesStage || hasInitialisedNodeLayers.current) return;
    hasInitialisedNodeLayers.current = true;
    if (controller.segmentations.some((seg) => seg.visible)) {
      controller.toggleAllVisibility(false);
    }
    controller.setShowROI(true);
  }, [controller, isNodesStage]);

  useEffect(() => {
    if (!isMatchingStage || hasInitialisedMatchingLayers.current) return;
    hasInitialisedMatchingLayers.current = true;
    if (controller.segmentations.some((seg) => seg.visible)) {
      controller.toggleAllVisibility(false);
    }
    controller.setShowROI(true);
  }, [controller, isMatchingStage]);

  useEffect(() => {
    if (!isReconstructStage || hasInitialisedReconstructLayers.current) return;
    hasInitialisedReconstructLayers.current = true;
    controller.handleReconstructLayersExpandedChange(false);
  }, [controller, isReconstructStage]);

  useEffect(() => {
    setStageToolTab("controls");
    if (!isReconstructStage) {
      setSelectedReconstructionEdgeKey(null);
    }
  }, [controller.activeSection, isReconstructStage]);

  const handleSelectReconstructionEdge = (edgeKey: string | null) => {
    setSelectedReconstructionEdgeKey(edgeKey);
    if (edgeKey) {
      setStageToolTab("controls");
    }
  };

  return (
    <div className="space-y-6">
      <StepHeader
        title="2D Geometry Analysis"
      />

      {!controller.hasProjection ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-12 text-center space-y-4">
            <AlertCircle className="w-12 h-12 mx-auto text-amber-500" />
            <div>
              <h3 className="text-lg font-medium">No Projection Available</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create projections in Step 2 before proceeding.
              </p>
            </div>
            <Button onClick={() => router.push("/workflow/step-2-projection")}>
              <ChevronLeft className="w-4 h-4 mr-2" />
              Go to Projection
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <WorkflowStepperCard
            activeSection={controller.activeSection}
            onSectionChange={controller.handleWorkflowSectionChange}
            sections={workflowSections}
          />

          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-4">
              {(isRoiStage || isNodesStage || isMatchingStage || isReconstructStage) && (
                <Card>
                  <CardContent className="p-2">
                    <div className="grid grid-cols-2 gap-2">
                      {(["controls", "overlays"] as const).map((tab) => (
                        <Button
                          key={tab}
                          type="button"
                          size="sm"
                          variant={stageToolTab === tab ? "default" : "outline"}
                          className="h-8"
                          onClick={() => setStageToolTab(tab)}
                        >
                          {tab === "controls" ? "Controls" : "Overlays"}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {stageToolTab === "controls" && isRoiStage ? (
                <RoiControls
                  showROI={controller.showROI}
                  onShowROIChange={controller.setShowROI}
                  roi={controller.roi}
                  onRotationChange={(rotation) => controller.setRoi((prev) => ({ ...prev, rotation }))}
                  onSaveROI={controller.handleSaveROI}
                  isSavingROI={controller.isSavingROI}
                  hasSegmentations={controller.hasSegmentations}
                  roiSaveResult={controller.roiSaveResult}
                />
              ) : stageToolTab === "controls" && !isNodesStage && !isMatchingStage && !isReconstructStage ? (
                <RoiAccessCard
                  onGoToRoi={() => controller.handleWorkflowSectionChange("roi")}
                />
              ) : null}

              {stageToolTab === "controls" && isNodesStage ? (
                <NodePreparationCard
                  titlePrefix="B •"
                  points={controller.filteredTemplatePoints}
                  projectionResolution={controller.selectedProjection?.settings?.resolution || 2048}
                  totalPointsCount={controller.templatePoints.length}
                  selectedPointId={controller.selectedTemplatePointId}
                  filter={controller.templatePointFilter}
                  hasUnsavedChanges={controller.hasTemplatePointChanges}
                  isLoadingState={controller.isLoadingTemplateState}
                  isSavingPoints={controller.isSavingTemplatePoints}
                  onFilterChange={controller.setTemplatePointFilter}
                  onSelectPoint={controller.handleSelectTemplatePoint}
                  onPointChange={controller.handleTemplatePointChange}
                  onAddPoint={controller.handleAddTemplatePoint}
                  onRemovePoint={controller.handleRemoveTemplatePoint}
                  onSavePoints={controller.handleSaveTemplatePoints}
                  onResetToDetected={controller.handleResetTemplatePoints}
                  onGoToRoi={() => controller.handleWorkflowSectionChange("roi")}
                />
              ) : stageToolTab === "controls" ? (
                <Geometry2DInspectorPanel
                  activeSection={controller.activeSection}
                  isAnalysing={controller.isAnalysing}
                  hasSegmentations={controller.hasSegmentations}
                  onAnalyse={controller.handleAnalyse}
                  intradosLines={controller.intradosLines}
                  showIntrados={controller.showIntrados}
                  onShowIntradosChange={controller.setShowIntrados}
                  vaultRatio={controller.vaultRatio}
                  vaultRatioSuggestions={controller.vaultRatioSuggestions}
                  bossCount={controller.bossCount}
                  analysedAt={controller.analysedAt}
                  autoCorrectRoi={controller.autoCorrectRoi}
                  onAutoCorrectRoiChange={controller.handleAutoCorrectToggle}
                  correctionApplied={controller.correctionApplied}
                  matchingHeadingPrefix="C •"
                  matchingParams={controller.templateParams}
                  matchingOverlayVariants={controller.templateOverlayVariants}
                  selectedMatchingOverlayLabels={controller.selectedTemplateOverlayLabels}
                  matchingVariantResults={controller.templateVariantResults}
                  matchingCsvColumns={controller.templateMatchCsvColumns}
                  matchingCsvRows={controller.templateMatchCsvRows}
                  matchingLastRunAt={controller.templateLastRunAt}
                  isLoadingMatchingState={controller.isLoadingTemplateState}
                  isRunningMatching={controller.isRunningTemplateMatching}
                  isLoadingMatchingCsv={controller.isLoadingTemplateMatchCsv}
                  onMatchingParamChange={controller.handleTemplateParamChange}
                  onMatchingOverlayToggle={controller.handleTemplateOverlayToggle}
                  onMatchingHideAllOverlays={controller.handleTemplateHideAllOverlays}
                  onMatchingShowPrimaryOverlays={controller.handleTemplateShowPrimaryOverlays}
                  onRunMatching={controller.handleRunTemplateMatching}
                  onLoadMatchingCsv={controller.handleLoadTemplateMatchCsv}
                  onGoToNodePreparation={() => controller.handleWorkflowSectionChange("nodes")}
                  bayPlanResult={controller.reconstructResult}
                  bayPlanLastRunAt={controller.reconstructLastRunAt}
                  bayPlanParams={controller.reconstructParams}
                  bayPlanDefaults={controller.reconstructDefaults}
                  selectedBayPlanEdgeKey={selectedReconstructionEdgeKey}
                  onBayPlanParamChange={controller.handleReconstructParamChange}
                  isLoadingBayPlanState={controller.isLoadingReconstructionState}
                  isRunningBayPlan={controller.isRunningReconstruction}
                  isSavingBayPlanManualEdges={controller.isSavingReconstructionManualEdges}
                  onRunBayPlan={controller.handleRunReconstruction}
                  onSaveBayPlanManualEdges={controller.handleSaveManualReconstructionEdges}
                  onSelectBayPlanEdge={handleSelectReconstructionEdge}
                />
              ) : isRoiStage ? (
                <RoiEvidenceLayersCard
                  hasSegmentations={controller.hasSegmentations}
                  groupVisibility={controller.groupVisibility}
                  showBaseImage={controller.showBaseImage}
                  onShowBaseImageChange={controller.handleShowBaseImageChange}
                  showOriginalRoi={controller.showOriginalOverlay}
                  onShowOriginalRoiChange={controller.handleShowOriginalOverlayChange}
                  canShowOriginalRoi={!!controller.originalRoiPreview}
                  showUpdatedRoi={controller.showUpdatedOverlay}
                  onShowUpdatedRoiChange={controller.handleShowUpdatedOverlayChange}
                  canShowUpdatedRoi={!!controller.correctedRoiPreview}
                  onToggleGroup={controller.toggleGroupVisibility}
                  onHideAllGroups={() => controller.toggleAllVisibility(false)}
                  onGoToSegmentation={() => router.push("/workflow/step-3-segmentation")}
                  expanded
                  showToggle={false}
                />
              ) : isNodesStage ? (
                <ReferencePointLayersCard
                  groupVisibility={controller.groupVisibility}
                  showBaseImage={controller.showBaseImage}
                  onShowBaseImageChange={controller.handleShowBaseImageChange}
                  roiLabel={controller.correctedRoiPreview ? "Updated ROI" : "ROI"}
                  showRoi={controller.showROI}
                  onShowRoiChange={controller.setShowROI}
                  onToggleGroup={controller.toggleGroupVisibility}
                  expanded
                  showToggle={false}
                />
              ) : isMatchingStage ? (
                <ReferencePointLayersCard
                  groupVisibility={controller.groupVisibility}
                  showBaseImage={controller.showBaseImage}
                  onShowBaseImageChange={controller.handleShowBaseImageChange}
                  roiLabel={controller.correctedRoiPreview ? "Updated ROI" : "ROI"}
                  showRoi={controller.showROI}
                  onShowRoiChange={controller.setShowROI}
                  onToggleGroup={controller.toggleGroupVisibility}
                  collapsedDescription="Optional overlays for reviewing the cut-typology evidence."
                  expandedDescription="Show the ROI and any segmented classes needed to judge the recommended cut grid."
                  expanded
                  showToggle={false}
                />
              ) : isReconstructStage ? (
                <ReconstructionLayersCard
                  expanded
                  layers={controller.reconstructLayers}
                  segmentationLayers={controller.reconstructionSegmentationLayers}
                  onOverlayLayerChange={controller.handleReconstructOverlayLayerChange}
                  onSegmentationLayerChange={controller.handleReconstructSegmentationLayerChange}
                  showToggle={false}
                />
              ) : null}

              {!isRoiStage && !isNodesStage && !isMatchingStage && !isReconstructStage && (
                <>
                  <LayerControlsToggleCard
                    expanded={controller.showAdvancedLayers}
                    onToggle={() => controller.handleAdvancedLayersChange(!controller.showAdvancedLayers)}
                  />

                  {controller.showAdvancedLayers && !isReconstructStage && (
                    <>
                      <SegmentationGroupsCard
                        totalMasks={controller.segmentations.length}
                        hasSegmentations={controller.hasSegmentations}
                        groupVisibility={controller.groupVisibility}
                        onToggleAll={controller.toggleAllVisibility}
                        onToggleGroup={controller.toggleGroupVisibility}
                        onGoToSegmentation={() => router.push("/workflow/step-3-segmentation")}
                      />

                      <OverlaySettingsCard
                        showMaskOverlay={controller.showMaskOverlay}
                        onShowMaskOverlayChange={(checked) => controller.setShowMaskOverlay(checked)}
                        overlayOpacity={controller.overlayOpacity}
                        onOverlayOpacityChange={(value) => controller.setOverlayOpacity(value)}
                      />
                    </>
                  )}
                </>
              )}
            </div>

            <div className="lg:col-span-7">
              <div className="space-y-4">
                <ProjectionCanvas
                  selectedProjection={controller.selectedProjection}
                  selectedImageType={controller.selectedImageType}
                  onImageTypeChange={controller.setSelectedImageType}
                  currentImage={controller.currentImage}
                  canvasRef={controller.canvasRef}
                  onMouseDown={controller.activeSection === "roi" ? controller.handleMouseDown : () => {}}
                  onMouseMove={controller.activeSection === "roi" ? controller.handleMouseMove : () => {}}
                  onMouseUp={controller.activeSection === "roi" ? controller.handleMouseUp : () => {}}
                  roiInteractive={controller.activeSection === "roi"}
                  bossPointInteractive={controller.activeSection === "nodes"}
                  enableViewportTools={
                    controller.activeSection === "roi" ||
                    controller.activeSection === "nodes" ||
                    controller.activeSection === "matching" ||
                    controller.activeSection === "reconstruct"
                  }
                  onBossPointSelect={controller.handleSelectTemplatePoint}
                  onBossPointMove={(pointId, x, y) => controller.handleTemplatePointMove(pointId, x, y)}
                  onBossPointMoveEnd={controller.handleTemplatePointMoveEnd}
                  canUndoBossPoints={controller.canUndoTemplatePoints}
                  canRedoBossPoints={controller.canRedoTemplatePoints}
                  onUndoBossPoints={controller.handleUndoTemplatePoints}
                  onRedoBossPoints={controller.handleRedoTemplatePoints}
                  showMaskOverlay={
                    isRoiStage || isNodesStage || isMatchingStage
                      ? hasVisibleReferenceSegmentationLayers
                      : controller.activeSection === "reconstruct"
                        ? controller.reconstructionVisibleMasks.length > 0
                        : controller.showMaskOverlay
                  }
                  visibleMasks={controller.activeSection === "reconstruct" ? controller.reconstructionVisibleMasks : controller.visibleMasks}
                  overlayOpacity={controller.overlayOpacity}
                  showBaseImage={
                    controller.activeSection === "reconstruct"
                      ? controller.reconstructLayers.showBaseImage
                      : controller.showBaseImage
                  }
                  showROI={
                    controller.activeSection === "nodes"
                      ? controller.showROI
                      : controller.activeSection === "matching"
                        ? controller.showROI
                        : controller.activeSection === "reconstruct"
                          ? controller.reconstructLayers.showROI
                          : controller.showROI
                  }
                  roi={controller.roi}
                  originalRoi={controller.originalRoiPreview}
                  correctedRoi={controller.correctedRoiPreview}
                  showOriginalOverlay={controller.activeSection === "nodes" || controller.activeSection === "matching" || controller.activeSection === "reconstruct" ? false : controller.showOriginalOverlay}
                  showUpdatedOverlay={controller.activeSection === "nodes" || controller.activeSection === "matching" || controller.activeSection === "reconstruct" ? false : controller.showUpdatedOverlay}
                  showIntrados={controller.showIntrados}
                  intradosLines={controller.intradosLines}
                  isAnalysing={controller.isAnalysing}
                  templateBossPoints={controller.activeSection === "nodes" || controller.activeSection === "matching" ? controller.templatePoints : []}
                  selectedBossPointId={controller.activeSection === "nodes" ? controller.selectedTemplatePointId : undefined}
                  selectedTemplateOverlays={controller.activeSection === "matching" ? controller.selectedTemplateOverlays : []}
                  matchingEvidenceLoaded={controller.activeSection === "matching" ? controller.matchingEvidenceLoaded : false}
                  matchingUnmatchedNodeIds={controller.activeSection === "matching" ? controller.matchingUnmatchedNodeIds : []}
                  showReconstructionOverlay={controller.activeSection === "reconstruct" ? controller.reconstructLayers.showReconstructedRibs : false}
                  showReconstructionNodes={controller.activeSection === "reconstruct" ? controller.reconstructLayers.showNodes : false}
                  reconstructionResult={controller.activeSection === "reconstruct" ? controller.reconstructResult : null}
                  reconstructionPreviewBosses={controller.activeSection === "reconstruct" ? controller.reconstructPreviewBosses : []}
                  selectedReconstructionEdgeKey={controller.activeSection === "reconstruct" ? selectedReconstructionEdgeKey : null}
                  onReconstructionEdgeSelect={controller.activeSection === "reconstruct" ? handleSelectReconstructionEdge : undefined}
                  bossHoverInfoMode={
                    controller.activeSection === "nodes"
                      ? "nodes"
                      : controller.activeSection === "matching"
                        ? "matching"
                        : "none"
                  }
                />
              </div>
            </div>
          </div>
        </>
      )}

      <StepActions>
        <Button variant="outline" onClick={() => router.push("/workflow/step-3-segmentation")} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to Segmentation
        </Button>
        <Button onClick={handleContinue} className="gap-2">
          Continue to Reprojection
          <ChevronRight className="w-4 h-4" />
        </Button>
      </StepActions>
    </div>
  );
}
