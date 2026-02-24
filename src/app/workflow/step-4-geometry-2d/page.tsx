"use client";

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
  Geometry2DInspectorPanel,
  ProjectionCanvas,
  RoiControls,
} from "@/components/geometry2d";
import { useStep4Geometry2DController } from "@/hooks/geometry2d/useStep4Geometry2DController";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";

export default function Step4Geometry2DPage() {
  const router = useRouter();
  const controller = useStep4Geometry2DController();

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

            <ProjectionCanvas
              selectedProjection={controller.selectedProjection}
              selectedImageType={controller.selectedImageType}
              onImageTypeChange={controller.setSelectedImageType}
              currentImage={controller.currentImage}
              canvasRef={controller.canvasRef}
              onMouseDown={controller.handleMouseDown}
              onMouseMove={controller.handleMouseMove}
              onMouseUp={controller.handleMouseUp}
              showMaskOverlay={controller.showMaskOverlay}
              visibleMasks={controller.visibleMasks}
              overlayOpacity={controller.overlayOpacity}
              showROI={controller.showROI}
              roi={controller.roi}
              originalRoi={controller.originalRoiPreview}
              correctedRoi={controller.correctedRoiPreview}
              showOriginalOverlay={controller.showOriginalOverlay}
              showUpdatedOverlay={controller.showUpdatedOverlay}
              showIntrados={controller.showIntrados}
              intradosLines={controller.intradosLines}
              isAnalysing={controller.isAnalysing}
            />

            <Geometry2DInspectorPanel
              activeSection={controller.activeSection}
              isAnalysing={controller.isAnalysing}
              hasSegmentations={controller.hasSegmentations}
              onAnalyse={controller.handleAnalyse}
              intradosLines={controller.intradosLines}
              showIntrados={controller.showIntrados}
              onShowIntradosChange={controller.setShowIntrados}
              result={controller.result}
              onExportCSV={controller.handleExportCSV}
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
            />
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
