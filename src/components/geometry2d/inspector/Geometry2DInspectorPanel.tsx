"use client";

import { IntradosLine } from "@/lib/api";
import {
  Geometry2DBayPlanRunResult,
  Geometry2DCutTypologyOverlayVariant,
  Geometry2DCutTypologyParams,
  Geometry2DCutTypologyVariantResult,
} from "@/lib/api";

import { Geometry2DWorkflowSection } from "@/components/geometry2d/types";
import { RoiBayProportionPanel } from "@/components/geometry2d/stages/roi";
import { CutTypologyMatchingPanel } from "@/components/geometry2d/stages/template";
import { BayPlanReconstructionPanel } from "@/components/geometry2d/stages/reconstruct";
import { EvidenceReportPanel } from "@/components/geometry2d/stages/export";

interface Geometry2DInspectorPanelProps {
  containerClassName?: string;
  activeSection: Geometry2DWorkflowSection;
  isAnalysing: boolean;
  hasSegmentations: boolean;
  onAnalyse: () => void;
  intradosLines: IntradosLine[];
  showIntrados: boolean;
  onShowIntradosChange: (checked: boolean) => void;
  vaultRatio?: number;
  vaultRatioSuggestions?: Array<{ label: string; err: number }>;
  bossCount?: number;
  analysedAt?: string;
  autoCorrectRoi: boolean;
  onAutoCorrectRoiChange: (checked: boolean) => void;
  correctionApplied?: boolean;
  showOriginalRoi: boolean;
  onShowOriginalRoiChange: (checked: boolean) => void;
  showUpdatedRoi: boolean;
  onShowUpdatedRoiChange: (checked: boolean) => void;
  canShowUpdatedRoi: boolean;
  matchingHeadingPrefix?: string;
  matchingParams: Geometry2DCutTypologyParams;
  matchingOverlayVariants: Geometry2DCutTypologyOverlayVariant[];
  selectedMatchingOverlayLabels: string[];
  matchingVariantResults: Geometry2DCutTypologyVariantResult[];
  matchingBestVariantLabel?: string;
  matchingCsvColumns: string[];
  matchingCsvRows: Array<Record<string, string>>;
  matchingLastRunAt?: string;
  isLoadingMatchingState: boolean;
  isRunningMatching: boolean;
  isLoadingMatchingCsv: boolean;
  onMatchingParamChange: (patch: Partial<Geometry2DCutTypologyParams>) => void;
  onMatchingOverlayToggle: (variantLabel: string, enabled: boolean) => void;
  onMatchingHideAllOverlays: () => void;
  onMatchingShowBestOverlay: () => void;
  onRunMatching: () => void;
  onLoadMatchingCsv: () => void;
  bayPlanResult: Geometry2DBayPlanRunResult | null;
  bayPlanLastRunAt?: string;
  showBayPlanOverlay: boolean;
  onShowBayPlanOverlayChange: (checked: boolean) => void;
  isLoadingBayPlanState: boolean;
  isRunningBayPlan: boolean;
  onRunBayPlan: () => void;
  evidenceLastGeneratedAt?: string;
  evidenceHtmlPath?: string;
  evidenceJsonPath?: string;
  evidenceHtml?: string;
  isLoadingEvidenceState: boolean;
  isGeneratingEvidence: boolean;
  onGenerateEvidence: () => void;
  onDownloadEvidenceHtml: () => void;
  onExportEvidencePdf: () => void;
}

export function Geometry2DInspectorPanel({
  containerClassName,
  activeSection,
  isAnalysing,
  hasSegmentations,
  onAnalyse,
  vaultRatio,
  vaultRatioSuggestions,
  bossCount,
  analysedAt,
  autoCorrectRoi,
  onAutoCorrectRoiChange,
  correctionApplied,
  showOriginalRoi,
  onShowOriginalRoiChange,
  showUpdatedRoi,
  onShowUpdatedRoiChange,
  canShowUpdatedRoi,
  matchingHeadingPrefix,
  matchingParams,
  matchingOverlayVariants,
  selectedMatchingOverlayLabels,
  matchingVariantResults,
  matchingBestVariantLabel,
  matchingCsvColumns,
  matchingCsvRows,
  matchingLastRunAt,
  isLoadingMatchingState,
  isRunningMatching,
  isLoadingMatchingCsv,
  onMatchingParamChange,
  onMatchingOverlayToggle,
  onMatchingHideAllOverlays,
  onMatchingShowBestOverlay,
  onRunMatching,
  onLoadMatchingCsv,
  bayPlanResult,
  bayPlanLastRunAt,
  showBayPlanOverlay,
  onShowBayPlanOverlayChange,
  isLoadingBayPlanState,
  isRunningBayPlan,
  onRunBayPlan,
  evidenceLastGeneratedAt,
  evidenceHtmlPath,
  evidenceJsonPath,
  evidenceHtml,
  isLoadingEvidenceState,
  isGeneratingEvidence,
  onGenerateEvidence,
  onDownloadEvidenceHtml,
  onExportEvidencePdf,
}: Geometry2DInspectorPanelProps) {
  return (
    <div className={`${containerClassName || "lg:col-span-3"} space-y-4`}>
      {activeSection === "roi" && (
        <RoiBayProportionPanel
          isAnalysing={isAnalysing}
          hasSegmentations={hasSegmentations}
          onAnalyse={onAnalyse}
          vaultRatio={vaultRatio}
          vaultRatioSuggestions={vaultRatioSuggestions}
          bossCount={bossCount}
          analysedAt={analysedAt}
          autoCorrectRoi={autoCorrectRoi}
          onAutoCorrectRoiChange={onAutoCorrectRoiChange}
          correctionApplied={correctionApplied}
          showOriginalRoi={showOriginalRoi}
          onShowOriginalRoiChange={onShowOriginalRoiChange}
          showUpdatedRoi={showUpdatedRoi}
          onShowUpdatedRoiChange={onShowUpdatedRoiChange}
          canShowUpdatedRoi={canShowUpdatedRoi}
        />
      )}

      {activeSection === "matching" && (
        <CutTypologyMatchingPanel
          headingPrefix={matchingHeadingPrefix}
          params={matchingParams}
          overlayVariants={matchingOverlayVariants}
          selectedOverlayLabels={selectedMatchingOverlayLabels}
          variantResults={matchingVariantResults}
          bestVariantLabel={matchingBestVariantLabel}
          matchCsvColumns={matchingCsvColumns}
          matchCsvRows={matchingCsvRows}
          lastRunAt={matchingLastRunAt}
          isLoadingState={isLoadingMatchingState}
          isRunningMatching={isRunningMatching}
          isLoadingMatchCsv={isLoadingMatchingCsv}
          onParamChange={onMatchingParamChange}
          onOverlayToggle={onMatchingOverlayToggle}
          onHideAllOverlays={onMatchingHideAllOverlays}
          onShowBestOverlay={onMatchingShowBestOverlay}
          onRunMatching={onRunMatching}
          onLoadMatchCsv={onLoadMatchingCsv}
        />
      )}

      {activeSection === "reconstruct" && (
        <BayPlanReconstructionPanel
          result={bayPlanResult}
          lastRunAt={bayPlanLastRunAt}
          showOverlay={showBayPlanOverlay}
          onShowOverlayChange={onShowBayPlanOverlayChange}
          isLoadingState={isLoadingBayPlanState}
          isRunning={isRunningBayPlan}
          onRun={onRunBayPlan}
        />
      )}

      {activeSection === "report" && (
        <EvidenceReportPanel
          lastGeneratedAt={evidenceLastGeneratedAt}
          reportHtmlPath={evidenceHtmlPath}
          reportJsonPath={evidenceJsonPath}
          reportHtml={evidenceHtml}
          isLoadingState={isLoadingEvidenceState}
          isGenerating={isGeneratingEvidence}
          onGenerate={onGenerateEvidence}
          onDownloadHtml={onDownloadEvidenceHtml}
          onExportPdf={onExportEvidencePdf}
        />
      )}
    </div>
  );
}
