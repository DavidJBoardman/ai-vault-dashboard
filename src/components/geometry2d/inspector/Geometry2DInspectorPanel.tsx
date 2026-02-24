"use client";

import { IntradosLine } from "@/lib/api";

import { GeometryResult, Geometry2DWorkflowSection } from "@/components/geometry2d/types";
import { RoiGeometricAnalysisPanel } from "@/components/geometry2d/stages/roi";
import { TemplateMatchingPanel } from "@/components/geometry2d/stages/template";
import { PatternReconstructionPanel } from "@/components/geometry2d/stages/reconstruct";
import { ExportPanel } from "@/components/geometry2d/stages/export";

interface Geometry2DInspectorPanelProps {
  activeSection: Geometry2DWorkflowSection;
  isAnalysing: boolean;
  hasSegmentations: boolean;
  onAnalyse: () => void;
  intradosLines: IntradosLine[];
  showIntrados: boolean;
  onShowIntradosChange: (checked: boolean) => void;
  result: GeometryResult | null;
  onExportCSV: () => void;
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
}

export function Geometry2DInspectorPanel({
  activeSection,
  isAnalysing,
  hasSegmentations,
  onAnalyse,
  intradosLines,
  showIntrados,
  onShowIntradosChange,
  result,
  onExportCSV,
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
}: Geometry2DInspectorPanelProps) {
  return (
    <div className="lg:col-span-3 space-y-4">
      {activeSection === "roi" && (
        <RoiGeometricAnalysisPanel
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

      {activeSection === "template" && <TemplateMatchingPanel />}

      {activeSection === "reconstruct" && (
        <PatternReconstructionPanel
          intradosLines={intradosLines}
          showIntrados={showIntrados}
          onShowIntradosChange={onShowIntradosChange}
        />
      )}

      {activeSection === "export" && (
        <ExportPanel
          result={result}
          onExportCSV={onExportCSV}
        />
      )}
    </div>
  );
}
