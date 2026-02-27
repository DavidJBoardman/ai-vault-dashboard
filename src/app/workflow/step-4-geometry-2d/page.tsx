"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { StepHeader, StepActions } from "@/components/workflow/step-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  WorkflowStepperCard,
  LayerControlsToggleCard,
  SegmentationGroupsCard,
  OverlaySettingsCard,
  RoiAccessCard,
  NodePreparationCard,
  Geometry2DInspectorPanel,
  ProjectionCanvas,
  RoiControls,
} from "@/components/geometry2d";
import { useStep4Geometry2DController } from "@/hooks/geometry2d/useStep4Geometry2DController";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";

export default function Step4Geometry2DPage() {
  const router = useRouter();
  const controller = useStep4Geometry2DController();
  const isNodesStage = controller.activeSection === "nodes";
  const isMatchingStage = controller.activeSection === "matching";
  const isReconstructStage = controller.activeSection === "reconstruct";
  const isReportStage = controller.activeSection === "report";
  const isWideStage = isNodesStage || isMatchingStage || isReconstructStage || isReportStage;
  const templateCanvasCols = "lg:col-span-7";
  const templateInspectorCols = "lg:col-span-5";

  const handleContinue = () => {
    controller.persistAnalysisForContinue();
    router.push("/workflow/step-5-reprojection");
  };

  return (
    <div className="space-y-6">
      <StepHeader
        title="2D Geometry Analysis"
        description="Review segmentation results and identify vault construction method"
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
          />

          <div className="grid lg:grid-cols-12 gap-6">
            {!isWideStage && (
              <div className="lg:col-span-3 space-y-4">
                <LayerControlsToggleCard
                  expanded={controller.showAdvancedLayers}
                  onToggle={() => controller.handleAdvancedLayersChange(!controller.showAdvancedLayers)}
                />

                {controller.showAdvancedLayers && (
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

                {controller.activeSection === "roi" ? (
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
                ) : (
                  <RoiAccessCard
                    onGoToRoi={() => controller.handleWorkflowSectionChange("roi")}
                  />
                )}
              </div>
            )}

            <ProjectionCanvas
              containerClassName={
                isWideStage
                  ? templateCanvasCols
                  : "lg:col-span-6"
              }
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
              showMaskOverlay={controller.showMaskOverlay}
              visibleMasks={controller.visibleMasks}
              overlayOpacity={controller.overlayOpacity}
              showROI={controller.activeSection === "nodes" || controller.activeSection === "matching" || controller.activeSection === "reconstruct" ? true : controller.showROI}
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
              showReconstructionOverlay={controller.activeSection === "reconstruct" ? controller.showReconstructionOverlay : false}
              reconstructionResult={controller.activeSection === "reconstruct" ? controller.reconstructResult : null}
              reconstructionPreviewBosses={controller.activeSection === "reconstruct" ? controller.reconstructPreviewBosses : []}
              bossHoverInfoMode={
                controller.activeSection === "nodes"
                  ? "nodes"
                  : controller.activeSection === "matching"
                    ? "matching"
                    : "none"
              }
            />

            {isWideStage && controller.showAdvancedLayers && (
              <div className={`${templateCanvasCols} grid lg:grid-cols-2 gap-4`}>
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
              </div>
            )}

            {isNodesStage && (
              <div className="lg:col-span-5">
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
                />
              </div>
            )}

            {!isNodesStage && (
              <Geometry2DInspectorPanel
                containerClassName={isWideStage ? templateInspectorCols : undefined}
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
                showOriginalRoi={controller.showOriginalOverlay}
                onShowOriginalRoiChange={controller.handleShowOriginalOverlayChange}
                showUpdatedRoi={controller.showUpdatedOverlay}
                onShowUpdatedRoiChange={controller.handleShowUpdatedOverlayChange}
                canShowUpdatedRoi={!!controller.correctedRoiPreview}
                matchingHeadingPrefix="C •"
                matchingParams={controller.templateParams}
                matchingOverlayVariants={controller.templateOverlayVariants}
                selectedMatchingOverlayLabels={controller.selectedTemplateOverlayLabels}
                matchingVariantResults={controller.templateVariantResults}
                matchingBestVariantLabel={controller.templateBestVariantLabel}
                matchingCsvColumns={controller.templateMatchCsvColumns}
                matchingCsvRows={controller.templateMatchCsvRows}
                matchingLastRunAt={controller.templateLastRunAt}
                isLoadingMatchingState={controller.isLoadingTemplateState}
                isRunningMatching={controller.isRunningTemplateMatching}
                isLoadingMatchingCsv={controller.isLoadingTemplateMatchCsv}
                onMatchingParamChange={controller.handleTemplateParamChange}
                onMatchingOverlayToggle={controller.handleTemplateOverlayToggle}
                onMatchingHideAllOverlays={controller.handleTemplateHideAllOverlays}
                onMatchingShowBestOverlay={controller.handleTemplateShowBestOverlay}
                onRunMatching={controller.handleRunTemplateMatching}
                onLoadMatchingCsv={controller.handleLoadTemplateMatchCsv}
                bayPlanResult={controller.reconstructResult}
                bayPlanLastRunAt={controller.reconstructLastRunAt}
                showBayPlanOverlay={controller.showReconstructionOverlay}
                onShowBayPlanOverlayChange={controller.handleShowReconstructionOverlayChange}
                isLoadingBayPlanState={controller.isLoadingReconstructionState}
                isRunningBayPlan={controller.isRunningReconstruction}
                onRunBayPlan={controller.handleRunReconstruction}
                evidenceLastGeneratedAt={controller.evidenceReportState?.lastGeneratedAt}
                evidenceHtmlPath={controller.evidenceReportState?.reportHtmlPath}
                evidenceJsonPath={controller.evidenceReportState?.reportJsonPath}
                evidenceHtml={controller.evidenceReportResult?.reportHtml}
                isLoadingEvidenceState={controller.isLoadingEvidenceReportState}
                isGeneratingEvidence={controller.isGeneratingEvidenceReport}
                onGenerateEvidence={controller.handleGenerateEvidenceReport}
                onDownloadEvidenceHtml={controller.handleDownloadEvidenceHtml}
                onExportEvidencePdf={controller.handleExportEvidencePdf}
              />
            )}
          </div>
        </>
      )}

      <StepActions>
        <Button variant="outline" onClick={() => router.push("/workflow/step-3-segmentation")} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to Segmentation
        </Button>
        <Button
          onClick={handleContinue}
          className="gap-2"
        >
          Continue to Reprojection
          <ChevronRight className="w-4 h-4" />
        </Button>
      </StepActions>
    </div>
  );
}
