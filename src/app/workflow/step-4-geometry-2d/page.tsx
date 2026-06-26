"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  const [stageToolTab, setStageToolTab] = useState<"controls" | "manualEdit" | "overlays">("controls");
  const [matchingAdvancedParamsFocusSignal, setMatchingAdvancedParamsFocusSignal] = useState(0);
  const [previewTemplateOverlayLabel, setPreviewTemplateOverlayLabel] = useState<string | null>(null);
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
  const matchingUnmatchedCount = controller.matchingUnmatchedNodeIds.length;
  const hasVisibleReferenceSegmentationLayers = Object.values(controller.groupVisibility).some((info) => info.visible > 0);
  const isStep4Busy =
    controller.isAnalysing ||
    controller.isSavingROI ||
    controller.isLoadingTemplateState ||
    controller.isSavingTemplatePoints ||
    controller.isRunningTemplateMatching ||
    controller.isLoadingTemplateMatchCsv ||
    controller.isLoadingReconstructionState ||
    controller.isRunningReconstruction ||
    controller.isSavingReconstructionManualEdges;

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
        stale: controller.nodesStale,
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
        stale: controller.matchingStale,
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
        stale: controller.reconstructStale,
      },
    ],
    [
      controller.activeSection,
      controller.hasSavedRoi,
      hasMatchingResult,
      hasReconstructionResult,
      hasSavedNodes,
      controller.nodesStale,
      controller.matchingStale,
      controller.reconstructStale,
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
    setPreviewTemplateOverlayLabel(null);
    if (!isReconstructStage) {
      setSelectedReconstructionEdgeKey(null);
    }
  }, [controller.activeSection, isReconstructStage]);

  useEffect(() => {
    if (!isMatchingStage) {
      setPreviewTemplateOverlayLabel(null);
    }
  }, [isMatchingStage]);

  const handleSelectReconstructionEdge = (edgeKey: string | null) => {
    setSelectedReconstructionEdgeKey(edgeKey);
    // If the user is on the Overlays tab, surface the inspector so they can
    // see the selected edge's details. If they are already on Controls or
    // Manual edit (both render the inspector), leave the tab alone — selecting
    // a rib row should not bounce them out of the Manual edit table.
    if (edgeKey && stageToolTab === "overlays") {
      setStageToolTab("controls");
    }
  };

  const handleResetStep4 = async () => {
    if (!window.confirm("Reset Step 4 and clear ROI analysis, nodes, matching, and reconstruction results?")) {
      return;
    }
    setSelectedReconstructionEdgeKey(null);
    setStageToolTab("controls");
    await controller.handleResetStep4();
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
            onReset={handleResetStep4}
            resetDisabled={isStep4Busy}
            allComplete={
              controller.hasSavedRoi &&
              hasSavedNodes &&
              hasMatchingResult &&
              hasReconstructionResult &&
              !controller.nodesStale &&
              !controller.matchingStale &&
              !controller.reconstructStale
            }
            onContinue={handleContinue}
          />

          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 space-y-4">
              {(isRoiStage || isNodesStage || isMatchingStage || isReconstructStage) && (
                <Card>
                  <CardContent className="p-2">
                    {/* 4D adds a "Manual edit" tab between Controls and Overlays
                        because rib editing has its own scroll budget. The
                        other stages stay on the two-tab layout. */}
                    {(() => {
                      const tabs = isReconstructStage
                        ? (["controls", "manualEdit", "overlays"] as const)
                        : (["controls", "overlays"] as const);
                      const labelFor = (tab: typeof tabs[number]) =>
                        tab === "controls" ? "Controls" : tab === "manualEdit" ? "Manual edit" : "Overlays";
                      return (
                        <div
                          className="grid gap-2"
                          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
                        >
                          {tabs.map((tab) => (
                            <Button
                              key={tab}
                              type="button"
                              size="sm"
                              variant={stageToolTab === tab ? "default" : "outline"}
                              className="h-8 gap-1.5"
                              onClick={() => setStageToolTab(tab)}
                            >
                              {labelFor(tab)}
                              {tab === "manualEdit" && controller.hasUnsavedManualRibEdits ? (
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                                  title="Unsaved rib edits"
                                  aria-hidden
                                />
                              ) : null}
                            </Button>
                          ))}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {isReconstructStage &&
              controller.hasUnsavedManualRibEdits &&
              stageToolTab !== "manualEdit" ? (
                <Card className="border-amber-500/35 bg-amber-500/10">
                  <CardContent className="flex flex-col gap-2.5 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-100/95">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Manual rib edits are visible on the preview but not saved to the project yet. Open
                        Manual edit and use Save ribs to project when you are ready.
                      </span>
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 border-amber-400/40"
                      onClick={() => setStageToolTab("manualEdit")}
                    >
                      Manual edit
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {stageToolTab === "controls" && isRoiStage ? (
                <RoiControls
                  showROI={controller.showROI}
                  onShowROIChange={controller.handleShowROIChange}
                  roi={controller.roi}
                  onRotationChange={(rotation) => controller.setRoi((prev) => ({ ...prev, rotation }))}
                  onResetROI={controller.handleResetROI}
                  onSaveROI={controller.handleSaveROI}
                  isSavingROI={controller.isSavingROI}
                  hasSegmentations={controller.hasSegmentations}
                  roiSaveResult={controller.roiSaveResult}
                  isRoiImportedFromStep3={!controller.hasSavedRoi && !!controller.step3Roi}
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
                  allPoints={controller.templatePoints}
                  projectionResolution={controller.selectedProjection?.settings?.resolution || 2048}
                  totalPointsCount={controller.templatePoints.length}
                  selectedPointId={controller.selectedTemplatePointId}
                  filter={controller.templatePointFilter}
                  includeRoiCornerPoints={controller.includeRoiCornerPoints}
                  hasUnsavedChanges={controller.hasTemplatePointChanges}
                  isLoadingState={controller.isLoadingTemplateState}
                  isSavingPoints={controller.isSavingTemplatePoints}
                  onFilterChange={controller.setTemplatePointFilter}
                  onIncludeRoiCornerPointsChange={controller.handleIncludeRoiCornerPointsChange}
                  onSelectPoint={controller.handleSelectTemplatePoint}
                  onPointChange={controller.handleTemplatePointChange}
                  onPointRename={controller.handleTemplatePointRename}
                  onAddPoint={controller.handleAddTemplatePoint}
                  onRemovePoint={controller.handleRemoveTemplatePoint}
                  onSavePoints={controller.handleSaveTemplatePoints}
                  onResetToDetected={controller.handleResetTemplatePoints}
                  onGoToRoi={() => controller.handleWorkflowSectionChange("roi")}
                />
              ) : (stageToolTab === "controls" || (stageToolTab === "manualEdit" && isReconstructStage)) ? (
                <Geometry2DInspectorPanel
                  reconstructView={stageToolTab === "manualEdit" ? "manualEdit" : "controls"}
                  activeSection={controller.activeSection}
                  isAnalysing={controller.isAnalysing}
                  hasSegmentations={controller.hasSegmentations}
                  bossSegmentationCount={controller.bossSegmentationCount}
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
                  onTemplateOverlayPreviewChange={setPreviewTemplateOverlayLabel}
                  onMatchingHideAllOverlays={controller.handleTemplateHideAllOverlays}
                  onMatchingShowPrimaryOverlays={controller.handleTemplateShowPrimaryOverlays}
                  onRunMatching={controller.handleRunTemplateMatching}
                  onLoadMatchingCsv={controller.handleLoadTemplateMatchCsv}
                  matchingAdvancedParamsFocusSignal={matchingAdvancedParamsFocusSignal}
                  matchingSelectedReading={controller.selectedReading}
                  matchingPerBoss={controller.templatePerBoss}
                  onMatchingSelectReading={controller.handleSelectReading}
                  bayPlanResult={controller.reconstructResult}
                  bayPlanLastRunAt={controller.reconstructLastRunAt}
                  bayPlanParams={controller.reconstructParams}
                  bayPlanDefaults={controller.reconstructDefaults}
                  selectedBayPlanEdgeKey={selectedReconstructionEdgeKey}
                  onBayPlanParamChange={controller.handleReconstructParamChange}
                  isLoadingBayPlanState={controller.isLoadingReconstructionState}
                  isRunningBayPlan={controller.isRunningReconstruction}
                  isSavingBayPlanManualEdges={controller.isSavingReconstructionManualEdges}
                  isExportingBayPlanDxf={controller.isExportingBayPlanDxf}
                  onRunBayPlan={controller.handleRunReconstruction}
                  onExportBayPlanDxf={controller.handleExportBayPlanDxf}
                  onSaveBayPlanManualEdges={controller.handleSaveManualReconstructionEdges}
                  onBayPlanDraftEdgesChange={controller.handleReconstructDraftEdgesChange}
                  onSelectBayPlanEdge={handleSelectReconstructionEdge}
                  reconstructionView={controller.reconstructionView}
                  onChangeReconstructionView={controller.setReconstructionView}
                  showIdealisedOverlay={controller.showIdealisedOverlay}
                  onChangeShowIdealisedOverlay={controller.setShowIdealisedOverlay}
                  bayPlanRoiBayMetres={controller.bayPlanRoiBayMetres}
                />
              ) : isRoiStage ? (
                <RoiEvidenceLayersCard
                  hasSegmentations={controller.hasSegmentations}
                  groupVisibility={controller.groupVisibility}
                  groupedSegmentations={controller.groupedSegmentations}
                  onToggleSegmentation={controller.toggleSegmentationVisibility}
                  showBaseImage={controller.showBaseImage}
                  onShowBaseImageChange={controller.handleShowBaseImageChange}
                  editRoiEnabled={controller.showROI}
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
                  groupedSegmentations={controller.groupedSegmentations}
                  onToggleSegmentation={controller.toggleSegmentationVisibility}
                  showBaseImage={controller.showBaseImage}
                  onShowBaseImageChange={controller.handleShowBaseImageChange}
                  roiLabel={controller.correctedRoiPreview ? "Suggested ROI" : "ROI"}
                  showRoi={controller.showROI}
                  onShowRoiChange={controller.setShowROI}
                  showRoiCornerGuides={controller.includeRoiCornerPoints ? false : controller.showRoiCornerGuides}
                  onShowRoiCornerGuidesChange={
                    controller.includeRoiCornerPoints ? undefined : controller.handleShowRoiCornerGuidesChange
                  }
                  onToggleGroup={controller.toggleGroupVisibility}
                  expanded
                  showToggle={false}
                />
              ) : isMatchingStage ? (
                <ReferencePointLayersCard
                  groupVisibility={controller.groupVisibility}
                  groupedSegmentations={controller.groupedSegmentations}
                  onToggleSegmentation={controller.toggleSegmentationVisibility}
                  showBaseImage={controller.showBaseImage}
                  onShowBaseImageChange={controller.handleShowBaseImageChange}
                  roiLabel={controller.correctedRoiPreview ? "Suggested ROI" : "ROI"}
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

              {stageToolTab === "overlays" && controller.intradosLines.length > 0 ? (
                <Card>
                  <CardContent className="p-3">
                    <Label className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/40 px-3 py-2">
                      <div className="space-y-0.5">
                        <span className="text-sm font-medium">Step 6 traces</span>
                        <p className="text-[11px] text-muted-foreground">
                          Show generated trace lines on this 2D preview.
                        </p>
                      </div>
                      <Checkbox
                        checked={controller.showIntrados}
                        onCheckedChange={(checked) => controller.setShowIntrados(checked === true)}
                      />
                    </Label>
                  </CardContent>
                </Card>
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

            <div className="lg:col-span-7 lg:sticky lg:top-4 self-start">
              <div className="space-y-4">
                <ProjectionCanvas
                  selectedProjection={controller.selectedProjection}
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
                  showOriginalOverlay={
                    controller.activeSection === "nodes" ||
                    controller.activeSection === "matching" ||
                    controller.activeSection === "reconstruct" ||
                    (controller.activeSection === "roi" && controller.showROI)
                      ? false
                      : controller.showOriginalOverlay
                  }
                  showUpdatedOverlay={
                    controller.activeSection === "nodes" ||
                    controller.activeSection === "matching" ||
                    controller.activeSection === "reconstruct" ||
                    (controller.activeSection === "roi" && controller.showROI)
                      ? false
                      : controller.showUpdatedOverlay
                  }
                  showIntrados={controller.showIntrados}
                  intradosLines={controller.intradosLines}
                  isAnalysing={controller.isAnalysing}
                  templateBossPoints={controller.activeSection === "nodes" || controller.activeSection === "matching" ? controller.templatePoints : []}
                  selectedBossPointId={controller.activeSection === "nodes" ? controller.selectedTemplatePointId : undefined}
                  selectedTemplateOverlays={controller.activeSection === "matching" ? controller.selectedTemplateOverlays : []}
                  templateOverlayVariants={controller.activeSection === "matching" ? controller.templateOverlayVariants : []}
                  previewTemplateOverlayLabel={controller.activeSection === "matching" ? previewTemplateOverlayLabel : null}
                  matchingEvidenceLoaded={controller.activeSection === "matching" ? controller.matchingEvidenceLoaded : false}
                  matchingUnmatchedNodeIds={controller.activeSection === "matching" ? controller.matchingUnmatchedNodeIds : []}
                  showRoiCornerGuides={
                    controller.activeSection === "nodes" && !controller.includeRoiCornerPoints
                      ? controller.showRoiCornerGuides
                      : false
                  }
                  showReconstructionOverlay={controller.activeSection === "reconstruct" ? controller.reconstructLayers.showReconstructedRibs : false}
                  showReconstructionNodes={controller.activeSection === "reconstruct" ? controller.reconstructLayers.showNodes : false}
                  reconstructionResult={
                    controller.activeSection === "reconstruct" ? controller.reconstructResultForCanvas : null
                  }
                  reconstructionView={controller.reconstructionView}
                  showIdealisedOverlay={controller.showIdealisedOverlay}
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
                {isMatchingStage && matchingUnmatchedCount > 0 && (
                  <Card className="border-amber-500/35 bg-amber-500/10">
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 text-amber-200">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <p className="text-sm font-medium">
                            {matchingUnmatchedCount} node{matchingUnmatchedCount === 1 ? "" : "s"} did not find a match
                          </p>
                        </div>
                        <p className="text-xs leading-relaxed text-amber-100/80">
                          Highlighted in the preview. If a point is misplaced, adjust it in 4B. If it looks correct but
                          narrowly misses a cut line, increase the point-to-cut tolerance in Advanced parameters, then run
                          matching again.
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => controller.handleWorkflowSectionChange("nodes")}
                        >
                          Back to 4B
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => {
                            setStageToolTab("controls");
                            setMatchingAdvancedParamsFocusSignal((value) => value + 1);
                          }}
                        >
                          Review tolerance
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
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
