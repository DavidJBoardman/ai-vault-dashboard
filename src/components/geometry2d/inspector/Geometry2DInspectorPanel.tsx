"use client";

import { IntradosLine } from "@/lib/api";
import {
  Geometry2DBayPlanEdge,
  Geometry2DBayPlanRunParams,
  Geometry2DBayPlanRunResult,
  Geometry2DCutTypologyOverlayVariant,
  Geometry2DCutTypologyParams,
  Geometry2DCutTypologyVariantResult,
} from "@/lib/api";

import { Geometry2DWorkflowSection } from "@/components/geometry2d/types";
import { RoiBayProportionPanel } from "@/components/geometry2d/stages/roi";
import { CutTypologyMatchingPanel } from "@/components/geometry2d/stages/template";
import { BayPlanReconstructionPanel } from "@/components/geometry2d/stages/reconstruct";

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
  matchingHeadingPrefix?: string;
  matchingParams: Geometry2DCutTypologyParams;
  matchingOverlayVariants: Geometry2DCutTypologyOverlayVariant[];
  selectedMatchingOverlayLabels: string[];
  matchingVariantResults: Geometry2DCutTypologyVariantResult[];
  matchingCsvColumns: string[];
  matchingCsvRows: Array<Record<string, string>>;
  matchingLastRunAt?: string;
  isLoadingMatchingState: boolean;
  isRunningMatching: boolean;
  isLoadingMatchingCsv: boolean;
  onMatchingParamChange: (patch: Partial<Geometry2DCutTypologyParams>) => void;
  onMatchingOverlayToggle: (variantLabel: string, enabled: boolean) => void;
  onMatchingHideAllOverlays: () => void;
  onMatchingShowPrimaryOverlays: () => void;
  onRunMatching: () => void;
  onLoadMatchingCsv: () => void;
  onGoToNodePreparation: () => void;
  bayPlanResult: Geometry2DBayPlanRunResult | null;
  bayPlanLastRunAt?: string;
  bayPlanParams?: Geometry2DBayPlanRunParams;
  bayPlanDefaults?: Record<string, unknown>;
  selectedBayPlanEdgeKey?: string | null;
  onBayPlanParamChange: (patch: Partial<Geometry2DBayPlanRunParams>) => void;
  isLoadingBayPlanState: boolean;
  isRunningBayPlan: boolean;
  isSavingBayPlanManualEdges: boolean;
  onRunBayPlan: () => void;
  onSaveBayPlanManualEdges: (edges: Geometry2DBayPlanEdge[]) => void;
  onSelectBayPlanEdge: (edgeKey: string | null) => void;
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
  matchingHeadingPrefix,
  matchingParams,
  matchingOverlayVariants,
  selectedMatchingOverlayLabels,
  matchingVariantResults,
  matchingCsvColumns,
  matchingCsvRows,
  matchingLastRunAt,
  isLoadingMatchingState,
  isRunningMatching,
  isLoadingMatchingCsv,
  onMatchingParamChange,
  onMatchingOverlayToggle,
  onMatchingHideAllOverlays,
  onMatchingShowPrimaryOverlays,
  onRunMatching,
  onLoadMatchingCsv,
  onGoToNodePreparation,
  bayPlanResult,
  bayPlanLastRunAt,
  bayPlanParams,
  bayPlanDefaults,
  selectedBayPlanEdgeKey,
  onBayPlanParamChange,
  isLoadingBayPlanState,
  isRunningBayPlan,
  isSavingBayPlanManualEdges,
  onRunBayPlan,
  onSaveBayPlanManualEdges,
  onSelectBayPlanEdge,
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
        />
      )}

      {activeSection === "matching" && (
        <CutTypologyMatchingPanel
          headingPrefix={matchingHeadingPrefix}
          params={matchingParams}
          overlayVariants={matchingOverlayVariants}
          selectedOverlayLabels={selectedMatchingOverlayLabels}
          variantResults={matchingVariantResults}
          matchCsvColumns={matchingCsvColumns}
          matchCsvRows={matchingCsvRows}
          lastRunAt={matchingLastRunAt}
          isLoadingState={isLoadingMatchingState}
          isRunningMatching={isRunningMatching}
          isLoadingMatchCsv={isLoadingMatchingCsv}
          onParamChange={onMatchingParamChange}
          onOverlayToggle={onMatchingOverlayToggle}
          onHideAllOverlays={onMatchingHideAllOverlays}
          onShowPrimaryOverlays={onMatchingShowPrimaryOverlays}
          onRunMatching={onRunMatching}
          onLoadMatchCsv={onLoadMatchingCsv}
          onGoToNodes={onGoToNodePreparation}
        />
      )}

      {activeSection === "reconstruct" && (
        <BayPlanReconstructionPanel
          result={bayPlanResult}
          lastRunAt={bayPlanLastRunAt}
          params={bayPlanParams}
          defaults={bayPlanDefaults}
          selectedEdgeKey={selectedBayPlanEdgeKey}
          onParamChange={onBayPlanParamChange}
          isLoadingState={isLoadingBayPlanState}
          isRunning={isRunningBayPlan}
          isSavingManualEdges={isSavingBayPlanManualEdges}
          onRun={onRunBayPlan}
          onSaveManualEdges={onSaveBayPlanManualEdges}
          onSelectEdge={onSelectBayPlanEdge}
        />
      )}
    </div>
  );
}
