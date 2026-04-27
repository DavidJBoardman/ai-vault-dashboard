"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Geometry2DBayPlanEdge,
  Geometry2DBayPlanRunParams,
  Geometry2DBayPlanRunResult,
} from "@/lib/api";
import { getCompactNodeLabel } from "@/components/geometry2d/projectionCanvasUtils";
import { ChevronDown, ChevronUp, CircleHelp, Network, Plus, RefreshCw, RotateCcw, Settings2, Trash2 } from "lucide-react";

const RECONSTRUCTION_PARAM_FALLBACKS = {
  reconstructionMode: "current" as const,
  angleToleranceDeg: 10,
  candidateMinScore: 0.36,
  candidateMaxDistanceUv: 1.6,
  corridorWidthPx: 22,
  mutualOnly: true,
  minNodeDegree: 2,
  maxNodeDegree: 36,
  enforcePlanarity: true,
  delaunayUseRoiBoundary: true,
  delaunayUseCrossAxes: false,
  delaunayUseHalfLines: false,
};

interface BayPlanReconstructionPanelProps {
  result: Geometry2DBayPlanRunResult | null;
  lastRunAt?: string;
  params?: Geometry2DBayPlanRunParams;
  defaults?: Record<string, unknown>;
  selectedEdgeKey?: string | null;
  onParamChange: (patch: Partial<Geometry2DBayPlanRunParams>) => void;
  isLoadingState: boolean;
  isRunning: boolean;
  isSavingManualEdges: boolean;
  onRun: () => void;
  onSaveManualEdges: (edges: Geometry2DBayPlanEdge[]) => void;
  onSelectEdge: (edgeKey: string | null) => void;
  // Which slice of this panel to render. "controls" = the bay-plan setup card,
  // "manualEdit" = the rib edit table card. Splitting them lets step 4D show
  // each as its own tab in the left rail without nuking shared internal state.
  view?: "controls" | "manualEdit";
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asReconstructionMode(value: unknown, fallback: "current" | "delaunay"): "current" | "delaunay" {
  return value === "delaunay" ? "delaunay" : fallback;
}

function normaliseEdge(edge: Geometry2DBayPlanEdge): Geometry2DBayPlanEdge {
  const a = Math.min(edge.a, edge.b);
  const b = Math.max(edge.a, edge.b);
  return { a, b, isConstraint: !!edge.isConstraint, isManual: !!edge.isManual };
}

function edgeKey(edge: Pick<Geometry2DBayPlanEdge, "a" | "b">): string {
  const a = Math.min(edge.a, edge.b);
  const b = Math.max(edge.a, edge.b);
  return `${a}-${b}`;
}

interface SettingBlockProps {
  title: string;
  children: React.ReactNode;
}

function SettingBlock({ title, children }: SettingBlockProps) {
  return (
    <div className="space-y-2 rounded-md border border-border/70 bg-muted/10 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  tooltip?: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
}

function FieldLabel({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span>{label}</span>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="rounded-sm text-muted-foreground/80 transition-colors hover:text-foreground"
              aria-label={`Help: ${label}`}
            >
              <CircleHelp className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-64 text-xs leading-relaxed">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}

function NumberField({ label, tooltip, value, step = 1, min, max, onCommit }: NumberFieldProps) {
  return (
    <Label className="grid gap-1.5 text-xs">
      <FieldLabel label={label} tooltip={tooltip} />
      <Input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        className="h-9 text-sm"
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onCommit(next);
        }}
      />
    </Label>
  );
}

interface ToggleFieldProps {
  label: string;
  tooltip?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function ToggleField({ label, tooltip, checked, onCheckedChange }: ToggleFieldProps) {
  return (
    <Label className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/60 px-3 py-2 text-xs font-medium">
      <FieldLabel label={label} tooltip={tooltip} />
      <Checkbox checked={checked} onCheckedChange={(next) => onCheckedChange(next === true)} />
    </Label>
  );
}

export function BayPlanReconstructionPanel({
  result,
  lastRunAt,
  params,
  defaults,
  selectedEdgeKey,
  onParamChange,
  isLoadingState,
  isRunning,
  isSavingManualEdges,
  onRun,
  onSaveManualEdges,
  onSelectEdge,
  view = "controls",
}: BayPlanReconstructionPanelProps) {
  const showControls = view === "controls";
  const showManualEdit = view === "manualEdit";
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);
  // Default expanded — the parent step gates this card behind a dedicated
  // "Manual edit" tab now, so collapsing it again from inside is redundant.
  const [showManualRibEdits, setShowManualRibEdits] = useState(true);
  const [manualEdges, setManualEdges] = useState<Geometry2DBayPlanEdge[]>([]);
  const [manualEdgeStart, setManualEdgeStart] = useState<string>("");
  const [manualEdgeEnd, setManualEdgeEnd] = useState<string>("");
  const [edgeSearchQuery, setEdgeSearchQuery] = useState("");
  const [edgeSort, setEdgeSort] = useState<{ column: "from" | "to" | "type"; direction: "asc" | "desc" }>({
    column: "from",
    direction: "asc",
  });
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const resolvedParams = useMemo(() => {
    const fallback = defaults || {};
    const merged = { ...fallback, ...(params || {}) };
    return {
      angleToleranceDeg: asNumber(merged.angleToleranceDeg, RECONSTRUCTION_PARAM_FALLBACKS.angleToleranceDeg),
      candidateMinScore: asNumber(merged.candidateMinScore, RECONSTRUCTION_PARAM_FALLBACKS.candidateMinScore),
      candidateMaxDistanceUv: asNumber(merged.candidateMaxDistanceUv, RECONSTRUCTION_PARAM_FALLBACKS.candidateMaxDistanceUv),
      corridorWidthPx: asNumber(merged.corridorWidthPx, RECONSTRUCTION_PARAM_FALLBACKS.corridorWidthPx),
      mutualOnly: asBoolean(merged.mutualOnly, RECONSTRUCTION_PARAM_FALLBACKS.mutualOnly),
      minNodeDegree: asNumber(merged.minNodeDegree, RECONSTRUCTION_PARAM_FALLBACKS.minNodeDegree),
      maxNodeDegree: asNumber(merged.maxNodeDegree, RECONSTRUCTION_PARAM_FALLBACKS.maxNodeDegree),
      enforcePlanarity: asBoolean(merged.enforcePlanarity, RECONSTRUCTION_PARAM_FALLBACKS.enforcePlanarity),
      reconstructionMode: asReconstructionMode(merged.reconstructionMode, RECONSTRUCTION_PARAM_FALLBACKS.reconstructionMode),
      delaunayUseRoiBoundary: asBoolean(merged.delaunayUseRoiBoundary, RECONSTRUCTION_PARAM_FALLBACKS.delaunayUseRoiBoundary),
      delaunayUseCrossAxes: asBoolean(merged.delaunayUseCrossAxes, RECONSTRUCTION_PARAM_FALLBACKS.delaunayUseCrossAxes),
      delaunayUseHalfLines: asBoolean(merged.delaunayUseHalfLines, RECONSTRUCTION_PARAM_FALLBACKS.delaunayUseHalfLines),
    };
  }, [defaults, params]);

  const availableNodeIds = useMemo(() => {
    return (result?.nodes || []).map((node, index) => ({
      index,
      label: getCompactNodeLabel(node.bossId || node.id || index),
      fullLabel: String(node.bossId || node.id || index),
    }));
  }, [result?.nodes]);
  const nodeLabelByIndex = useMemo(
    () =>
      new Map(
        availableNodeIds.map((node) => [node.index, node.label])
      ),
    [availableNodeIds]
  );

  useEffect(() => {
    const nextEdges = (result?.edges || []).map(normaliseEdge).sort((left, right) => {
      if (left.a !== right.a) return left.a - right.a;
      return left.b - right.b;
    });
    setManualEdges(nextEdges);
    setManualEdgeStart("");
    setManualEdgeEnd("");
  }, [result]);

  useEffect(() => {
    if (selectedEdgeKey && !manualEdges.some((edge) => edgeKey(edge) === selectedEdgeKey)) {
      onSelectEdge(null);
    }
  }, [manualEdges, onSelectEdge, selectedEdgeKey]);

  const hasManualRibChanges = useMemo(() => {
    const savedEdges = (result?.edges || []).map(normaliseEdge);
    const savedSignature = savedEdges.map(edgeKey).sort().join("|");
    const draftSignature = manualEdges.map(edgeKey).sort().join("|");
    return savedSignature !== draftSignature;
  }, [manualEdges, result?.edges]);

  const displayedManualEdges = useMemo(() => {
    const savedKeys = new Set(((result?.edges || []).map(edgeKey)));
    return [...manualEdges].sort((left, right) => {
      const leftIsManual = left.isManual === true;
      const rightIsManual = right.isManual === true;
      const leftIsNew = !savedKeys.has(edgeKey(left));
      const rightIsNew = !savedKeys.has(edgeKey(right));
      if (leftIsManual !== rightIsManual) return leftIsManual ? -1 : 1;
      if (leftIsNew !== rightIsNew) return leftIsNew ? -1 : 1;
      if (left.a !== right.a) return left.a - right.a;
      return left.b - right.b;
    });
  }, [manualEdges, result?.edges]);
  const edgeLabelCollator = useMemo(
    () => new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }),
    []
  );

  const getEdgeTypeLabel = (edge: Geometry2DBayPlanEdge): "manual" | "constraint" | "auto" => {
    if (edge.isManual) return "manual";
    if (edge.isConstraint) return "constraint";
    return "auto";
  };

  const filteredManualEdges = useMemo(() => {
    const query = edgeSearchQuery.trim().toLowerCase();
    const filtered = displayedManualEdges.filter((edge) => {
      if (!query) return true;
      const startLabel = nodeLabelByIndex.get(edge.a) || String(edge.a);
      const endLabel = nodeLabelByIndex.get(edge.b) || String(edge.b);
      const startFullLabel = availableNodeIds.find((node) => node.index === edge.a)?.fullLabel || startLabel;
      const endFullLabel = availableNodeIds.find((node) => node.index === edge.b)?.fullLabel || endLabel;
      const typeLabel = getEdgeTypeLabel(edge);
      return (
        `node ${startLabel}`.toLowerCase().includes(query) ||
        `node ${endLabel}`.toLowerCase().includes(query) ||
        startLabel.toLowerCase().includes(query) ||
        endLabel.toLowerCase().includes(query) ||
        startFullLabel.toLowerCase().includes(query) ||
        endFullLabel.toLowerCase().includes(query) ||
        typeLabel.includes(query)
      );
    });

    if (selectedEdgeKey && !filtered.some((edge) => edgeKey(edge) === selectedEdgeKey)) {
      const selectedEdge = displayedManualEdges.find((edge) => edgeKey(edge) === selectedEdgeKey);
      if (selectedEdge) filtered.push(selectedEdge);
    }

    return [...filtered].sort((left, right) => {
      const leftFrom = nodeLabelByIndex.get(left.a) || String(left.a);
      const rightFrom = nodeLabelByIndex.get(right.a) || String(right.a);
      const leftTo = nodeLabelByIndex.get(left.b) || String(left.b);
      const rightTo = nodeLabelByIndex.get(right.b) || String(right.b);
      const leftType = getEdgeTypeLabel(left);
      const rightType = getEdgeTypeLabel(right);

      const compare =
        edgeSort.column === "from"
          ? edgeLabelCollator.compare(leftFrom, rightFrom)
          : edgeSort.column === "to"
            ? edgeLabelCollator.compare(leftTo, rightTo)
            : edgeLabelCollator.compare(leftType, rightType);

      if (compare !== 0) {
        return edgeSort.direction === "asc" ? compare : -compare;
      }

      const fallback =
        edgeLabelCollator.compare(leftFrom, rightFrom) ||
        edgeLabelCollator.compare(leftTo, rightTo);
      return edgeSort.direction === "asc" ? fallback : -fallback;
    });
  }, [availableNodeIds, displayedManualEdges, edgeLabelCollator, edgeSearchQuery, edgeSort, nodeLabelByIndex, selectedEdgeKey]);

  useEffect(() => {
    if (!selectedEdgeKey) return;
    if (!showManualRibEdits) {
      setShowManualRibEdits(true);
      return;
    }
    const row = rowRefs.current.get(selectedEdgeKey);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [filteredManualEdges, selectedEdgeKey, showManualRibEdits]);

  const reconstructionStatusLabel = isRunning ? "Running" : result ? "Result ready" : "Awaiting run";
  const formattedLastRunAt = lastRunAt ? new Date(lastRunAt).toLocaleString("en-GB") : null;
  const resultReconstructionMode = result?.params?.reconstructionMode === "delaunay" ? "delaunay" : "current";
  const idealReferenceSummary = result
    ? `${result.idealBossUsedCount}/${result.bossCount} boss references used ideal matched positions from Step 4C, plus ${result.cornerAnchorCount} ROI corner anchor${result.cornerAnchorCount === 1 ? "" : "s"}.`
    : "Reconstruction uses the ideal matched boss references from Step 4C when they are available, plus ROI corner anchors.";
  const overallScoreLabel =
    typeof result?.overallScore === "number" && Number.isFinite(result.overallScore)
      ? result.overallScore.toFixed(3)
      : "0.000";
  const edgeEvidenceLabel =
    typeof result?.overallScoreBreakdown?.edgeEvidence === "number"
      ? result.overallScoreBreakdown.edgeEvidence.toFixed(2)
      : null;
  const boundaryCoverageLabel =
    typeof result?.overallScoreBreakdown?.boundaryCoverage === "number"
      ? result.overallScoreBreakdown.boundaryCoverage.toFixed(2)
      : null;
  const degreeSatisfactionLabel =
    typeof result?.overallScoreBreakdown?.degreeSatisfaction === "number"
      ? result.overallScoreBreakdown.degreeSatisfaction.toFixed(2)
      : null;
  const mutualSupportLabel =
    typeof result?.overallScoreBreakdown?.mutualSupport === "number"
      ? result.overallScoreBreakdown.mutualSupport.toFixed(2)
      : null;
  const selectedNonBoundaryEdgeCount =
    typeof result?.overallScoreBreakdown?.selectedNonBoundaryEdgeCount === "number"
      ? Math.round(result.overallScoreBreakdown.selectedNonBoundaryEdgeCount)
      : null;
  const selectedBoundaryEdgeCount =
    typeof result?.overallScoreBreakdown?.selectedBoundaryEdgeCount === "number"
      ? Math.round(result.overallScoreBreakdown.selectedBoundaryEdgeCount)
      : null;
  const mandatoryBoundaryEdgeCount =
    typeof result?.overallScoreBreakdown?.mandatoryBoundaryEdgeCount === "number"
      ? Math.round(result.overallScoreBreakdown.mandatoryBoundaryEdgeCount)
      : null;

  const resetAdvancedSettings = () => {
    onParamChange({
      angleToleranceDeg: asNumber(defaults?.angleToleranceDeg, RECONSTRUCTION_PARAM_FALLBACKS.angleToleranceDeg),
      candidateMinScore: asNumber(defaults?.candidateMinScore, RECONSTRUCTION_PARAM_FALLBACKS.candidateMinScore),
      candidateMaxDistanceUv: asNumber(defaults?.candidateMaxDistanceUv, RECONSTRUCTION_PARAM_FALLBACKS.candidateMaxDistanceUv),
      corridorWidthPx: asNumber(defaults?.corridorWidthPx, RECONSTRUCTION_PARAM_FALLBACKS.corridorWidthPx),
      mutualOnly: asBoolean(defaults?.mutualOnly, RECONSTRUCTION_PARAM_FALLBACKS.mutualOnly),
      minNodeDegree: asNumber(defaults?.minNodeDegree, RECONSTRUCTION_PARAM_FALLBACKS.minNodeDegree),
      maxNodeDegree: asNumber(defaults?.maxNodeDegree, RECONSTRUCTION_PARAM_FALLBACKS.maxNodeDegree),
      enforcePlanarity: asBoolean(defaults?.enforcePlanarity, RECONSTRUCTION_PARAM_FALLBACKS.enforcePlanarity),
      reconstructionMode: asReconstructionMode(defaults?.reconstructionMode, RECONSTRUCTION_PARAM_FALLBACKS.reconstructionMode),
      delaunayUseRoiBoundary: asBoolean(defaults?.delaunayUseRoiBoundary, RECONSTRUCTION_PARAM_FALLBACKS.delaunayUseRoiBoundary),
      delaunayUseCrossAxes: asBoolean(defaults?.delaunayUseCrossAxes, RECONSTRUCTION_PARAM_FALLBACKS.delaunayUseCrossAxes),
      delaunayUseHalfLines: asBoolean(defaults?.delaunayUseHalfLines, RECONSTRUCTION_PARAM_FALLBACKS.delaunayUseHalfLines),
    });
  };

  const resetManualRibEdits = () => {
    const nextEdges = (result?.edges || []).map(normaliseEdge).sort((left, right) => {
      if (left.a !== right.a) return left.a - right.a;
      return left.b - right.b;
    });
    setManualEdges(nextEdges);
    setManualEdgeStart("");
    setManualEdgeEnd("");
  };

  const handleAddManualEdge = () => {
    const a = Number(manualEdgeStart);
    const b = Number(manualEdgeEnd);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return;
    const nextEdge = normaliseEdge({ a, b, isConstraint: false, isManual: true });
    const nextKey = edgeKey(nextEdge);
    setManualEdges((prev) => {
      if (prev.some((edge) => edgeKey(edge) === nextKey)) return prev;
      return [...prev, nextEdge].sort((left, right) => {
        if (left.a !== right.a) return left.a - right.a;
        return left.b - right.b;
      });
    });
    setManualEdgeStart("");
    setManualEdgeEnd("");
  };

  const toggleEdgeSort = (column: "from" | "to" | "type") => {
    setEdgeSort((current) => ({
      column,
      direction: current.column === column && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleRemoveManualEdge = (target: Geometry2DBayPlanEdge) => {
    const targetKey = edgeKey(target);
    if (selectedEdgeKey === targetKey) {
      onSelectEdge(null);
    }
    setManualEdges((prev) => prev.filter((edge) => edgeKey(edge) !== targetKey));
  };

  return (
    <TooltipProvider delayDuration={180}>
      <>
      {showControls && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Network className="h-4 w-4" />
            D • Bay Plan
          </CardTitle>
          <CardDescription className="text-xs">
            Run the reconstruction, then review the current bay-plan result before making any manual edits.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant={result ? "secondary" : "outline"}>{reconstructionStatusLabel}</Badge>
            {formattedLastRunAt ? <span>Last run: {formattedLastRunAt}</span> : <span>No reconstruction run yet.</span>}
          </div>

          {result ? (
            <div className="rounded-md border border-border/70 px-3 py-3">
              <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                <div>
                  <span className="block text-foreground text-lg font-semibold leading-none">{result.nodeCount}</span>
                  <span>Nodes</span>
                </div>
                <div>
                  <span className="block text-foreground text-lg font-semibold leading-none">{result.edgeCount}</span>
                  <span>Ribs</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-3 text-xs text-muted-foreground">
              Run the reconstruction to review the retained nodes and rib graph.
            </div>
          )}

          <div className="rounded-md border border-sky-500/30 bg-sky-500/8 px-3 py-2.5 text-xs text-sky-50/90">
            <p className="font-medium text-sky-100">Reconstruction reference source</p>
            <p className="mt-1 leading-relaxed text-sky-50/80">
              {idealReferenceSummary}
            </p>
          </div>

          {result && resultReconstructionMode === "current" ? (
            <div className="rounded-md border border-border/70 bg-muted/10 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Score</p>
                  <p className="mt-1 text-sm font-semibold leading-none">{overallScoreLabel}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => setShowScoreBreakdown((prev) => !prev)}
                >
                  {showScoreBreakdown ? "Hide" : "Show"}
                  {showScoreBreakdown ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
                </Button>
              </div>
              {edgeEvidenceLabel && boundaryCoverageLabel && degreeSatisfactionLabel ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Evidence {edgeEvidenceLabel} · Boundary {boundaryCoverageLabel} · Degree {degreeSatisfactionLabel}
                </p>
              ) : null}

              {showScoreBreakdown ? (
                <div className="mt-3 space-y-2 border-t border-border/60 pt-3 text-xs">
                  <div className="flex items-center justify-between gap-3 rounded-md bg-background/50 px-3 py-2">
                    <span className="text-muted-foreground">Edge evidence</span>
                    <span className="font-medium">{edgeEvidenceLabel ?? "0.00"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md bg-background/50 px-3 py-2">
                    <span className="text-muted-foreground">Boundary coverage</span>
                    <span className="font-medium">
                      {boundaryCoverageLabel ?? "0.00"}
                      {selectedBoundaryEdgeCount !== null && mandatoryBoundaryEdgeCount !== null
                        ? ` (${selectedBoundaryEdgeCount}/${mandatoryBoundaryEdgeCount})`
                        : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md bg-background/50 px-3 py-2">
                    <span className="text-muted-foreground">Degree satisfaction</span>
                    <span className="font-medium">{degreeSatisfactionLabel ?? "0.00"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md bg-background/50 px-3 py-2">
                    <span className="text-muted-foreground">Mutual support</span>
                    <span className="font-medium">
                      {mutualSupportLabel ?? "0.00"}
                      {selectedNonBoundaryEdgeCount !== null ? ` (${selectedNonBoundaryEdgeCount} ribs)` : ""}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : result && resultReconstructionMode === "delaunay" ? (
            <div className="rounded-md border border-border/70 bg-muted/10 px-3 py-2.5 text-xs text-muted-foreground">
              Delaunay result is topology-only. Use it when rib segmentation is not available; no evidence score is computed.
            </div>
          ) : null}

          <Card className="border-border/70 bg-muted/10 shadow-none">
            <CardContent className="px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Settings2 className="h-4 w-4" />
                    Advanced settings
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => setShowAdvancedSettings((prev) => !prev)}
                >
                  {showAdvancedSettings ? "Hide" : "Show"}
                  {showAdvancedSettings ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
                </Button>
              </div>

              {showAdvancedSettings && (
                <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={resetAdvancedSettings}>
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      Reset to defaults
                    </Button>
                  </div>

                  <SettingBlock title="Algorithm">
                    <Label className="grid gap-1.5 text-xs">
                      <FieldLabel
                        label="Reconstruction method"
                        tooltip="Choose the evidence-guided rib graph when segmented ribs are available, or Delaunay when they are not."
                      />
                      <Select
                        value={resolvedParams.reconstructionMode}
                        onValueChange={(value) => onParamChange({ reconstructionMode: asReconstructionMode(value, "current") })}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Evidence-guided graph" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="current">Evidence-guided graph</SelectItem>
                          <SelectItem value="delaunay">Delaunay</SelectItem>
                        </SelectContent>
                      </Select>
                    </Label>
                    {resolvedParams.reconstructionMode === "delaunay" ? (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Use Delaunay when rib segmentation is not available. It builds a topology from boss nodes and explicit constraints rather than rib-mask evidence.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Use the evidence-guided graph when grouped rib segmentation is well defined.
                      </p>
                    )}
                  </SettingBlock>

                  {resolvedParams.reconstructionMode === "current" ? (
                  <SettingBlock title="Edge Detection">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <NumberField
                        label="Angle tolerance (deg)"
                        tooltip="Directions within this angular window are treated as the same spoke. Lower values are stricter."
                        value={resolvedParams.angleToleranceDeg}
                        step={1}
                        min={1}
                        max={90}
                        onCommit={(value) => onParamChange({ angleToleranceDeg: value })}
                      />
                      <NumberField
                        label="Candidate score"
                        tooltip="Minimum rib-overlap score needed for a candidate edge to survive."
                        value={resolvedParams.candidateMinScore}
                        step={0.01}
                        min={0}
                        max={1}
                        onCommit={(value) => onParamChange({ candidateMinScore: value })}
                      />
                      <NumberField
                        label="Distance cap (UV)"
                        tooltip="Maximum boss-to-boss spacing in normalised bay coordinates. This is not measured in pixels."
                        value={resolvedParams.candidateMaxDistanceUv}
                        step={0.05}
                        min={0.1}
                        max={2}
                        onCommit={(value) => onParamChange({ candidateMaxDistanceUv: value })}
                      />
                      <NumberField
                        label="Corridor width (px)"
                        tooltip="Width of the temporary scoring band used to test overlap with the rib mask. It does not change the displayed line thickness."
                        value={resolvedParams.corridorWidthPx}
                        step={1}
                        min={1}
                        max={256}
                        onCommit={(value) => onParamChange({ corridorWidthPx: value })}
                      />
                    </div>
                  </SettingBlock>
                  ) : null}

                  {resolvedParams.reconstructionMode === "current" ? (
                  <SettingBlock title="Graph Rules">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <NumberField
                        label="Minimum node degree"
                        tooltip="If possible, the graph repair step gives each node at least this many connected edges."
                        value={resolvedParams.minNodeDegree}
                        step={1}
                        min={0}
                        max={8}
                        onCommit={(value) => onParamChange({ minNodeDegree: value })}
                      />
                      <NumberField
                        label="Maximum node degree"
                        tooltip="Upper degree limit during global graph selection. Lower values suppress over-connected nodes."
                        value={resolvedParams.maxNodeDegree}
                        step={1}
                        min={1}
                        max={64}
                        onCommit={(value) => onParamChange({ maxNodeDegree: value })}
                      />
                      <ToggleField
                        label="Require mutual support"
                        tooltip="Only keep a connection if both endpoints independently support the same edge."
                        checked={resolvedParams.mutualOnly}
                        onCheckedChange={(checked) => onParamChange({ mutualOnly: checked })}
                      />
                      <ToggleField
                        label="Enforce planarity"
                        tooltip="Reject edges that would cross other selected edges in the 2D bay graph."
                        checked={resolvedParams.enforcePlanarity}
                        onCheckedChange={(checked) => onParamChange({ enforcePlanarity: checked })}
                      />
                    </div>
                  </SettingBlock>
                  ) : null}

                  {resolvedParams.reconstructionMode === "delaunay" ? (
                  <SettingBlock title="Delaunay Constraints">
                    {resultReconstructionMode === "delaunay" && result?.edgeCount === 0 ? (
                      <p className="text-xs leading-relaxed text-amber-300">
                        Delaunay reconstruction returned no edges. Check the constraint settings and backend triangulation support.
                      </p>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-3">
                      <ToggleField
                        label="ROI boundary"
                        tooltip="Keep the ROI perimeter as fixed constrained segments in the Delaunay mesh."
                        checked={resolvedParams.delaunayUseRoiBoundary}
                        onCheckedChange={(checked) => onParamChange({ delaunayUseRoiBoundary: checked })}
                      />
                      <ToggleField
                        label="Cross axes"
                        tooltip="Add horizontal and vertical centre axes as constrained Delaunay segments."
                        checked={resolvedParams.delaunayUseCrossAxes}
                        onCheckedChange={(checked) => onParamChange({ delaunayUseCrossAxes: checked })}
                      />
                      <ToggleField
                        label="Half-lines"
                        tooltip="Add the two ROI diagonals as constrained lines in the Delaunay mesh."
                        checked={resolvedParams.delaunayUseHalfLines}
                        onCheckedChange={(checked) => onParamChange({ delaunayUseHalfLines: checked })}
                      />
                    </div>
                  </SettingBlock>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Button className="w-full gap-2" onClick={onRun} disabled={isLoadingState || isRunning}>
            <RefreshCw className={`h-4 w-4 ${isRunning ? "animate-spin" : ""}`} />
            {isRunning ? "Running reconstruction..." : result ? "Run reconstruction again" : "Run reconstruction"}
          </Button>
        </CardContent>
      </Card>
      )}

      {showManualEdit && (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-medium">Manual rib edits</CardTitle>
              <CardDescription className="text-xs">
                Adjust reconstructed ribs node by node only where the automatic result is unconvincing.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setShowManualRibEdits((prev) => !prev)}
            >
              {showManualRibEdits ? "Hide" : "Show"}
              {showManualRibEdits ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
            </Button>
          </div>
        </CardHeader>
        {showManualRibEdits && (
          <CardContent className="space-y-3">
            {!result ? (
              <p className="text-xs text-muted-foreground">
                Run reconstruction first, then edit the reconstructed ribs here.
              </p>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Label className="grid gap-1.5 text-xs">
                    <span className="text-muted-foreground">From node</span>
                    <Select value={manualEdgeStart} onValueChange={setManualEdgeStart}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Choose node" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableNodeIds.map((node) => (
                          <SelectItem key={`start-${node.index}`} value={String(node.index)}>
                            {node.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Label>

                  <Label className="grid gap-1.5 text-xs">
                    <span className="text-muted-foreground">To node</span>
                    <Select value={manualEdgeEnd} onValueChange={setManualEdgeEnd}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Choose node" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableNodeIds.map((node) => (
                          <SelectItem key={`end-${node.index}`} value={String(node.index)}>
                            {node.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Label>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full gap-2 sm:w-auto"
                      onClick={handleAddManualEdge}
                      disabled={!manualEdgeStart || !manualEdgeEnd || manualEdgeStart === manualEdgeEnd}
                    >
                      <Plus className="h-4 w-4" />
                      Add rib
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-border/70 bg-muted/10 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Reconstructed ribs
                    </p>
                    <span className="text-xs text-muted-foreground">{manualEdges.length} total</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={edgeSearchQuery}
                      onChange={(event) => setEdgeSearchQuery(event.target.value)}
                      placeholder="Search by node label"
                      className="h-8 flex-1 text-xs sm:min-w-[180px]"
                    />
                    <span className="text-[11px] text-muted-foreground">Click a row or rib to link both views.</span>
                  </div>

                  {filteredManualEdges.length > 0 ? (
                    <div className="max-h-72 overflow-auto rounded-md border border-border/70 bg-background/50">
                      <table className="w-full table-fixed text-xs">
                        <thead className="sticky top-0 bg-background/95 backdrop-blur">
                          <tr className="border-b border-border/70 text-left text-muted-foreground">
                            <th className="w-[28%] px-3 py-2 font-medium">
                              <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleEdgeSort("from")}>
                                From
                                {edgeSort.column === "from" ? (edgeSort.direction === "asc" ? "↑" : "↓") : "↕"}
                              </button>
                            </th>
                            <th className="w-[28%] px-3 py-2 font-medium">
                              <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleEdgeSort("to")}>
                                To
                                {edgeSort.column === "to" ? (edgeSort.direction === "asc" ? "↑" : "↓") : "↕"}
                              </button>
                            </th>
                            <th className="w-[24%] px-3 py-2 font-medium">
                              <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleEdgeSort("type")}>
                                Type
                                {edgeSort.column === "type" ? (edgeSort.direction === "asc" ? "↑" : "↓") : "↕"}
                              </button>
                            </th>
                            <th className="w-[20%] px-3 py-2 text-right font-medium">Remove</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredManualEdges.map((edge) => {
                            const startLabel = nodeLabelByIndex.get(edge.a) || String(edge.a);
                            const endLabel = nodeLabelByIndex.get(edge.b) || String(edge.b);
                            const currentEdgeKey = edgeKey(edge);
                            const isSelected = selectedEdgeKey === currentEdgeKey;
                            const typeLabel = getEdgeTypeLabel(edge);
                            return (
                              <tr
                                key={currentEdgeKey}
                                ref={(node) => {
                                  if (node) rowRefs.current.set(currentEdgeKey, node);
                                  else rowRefs.current.delete(currentEdgeKey);
                                }}
                                className={`cursor-pointer border-b border-border/50 align-top last:border-b-0 ${
                                  isSelected ? "bg-amber-500/12 ring-1 ring-inset ring-amber-400/50" : "hover:bg-muted/20"
                                }`}
                                onClick={() => onSelectEdge(isSelected ? null : currentEdgeKey)}
                              >
                                <td className="px-3 py-2.5">
                                  <div className="font-medium text-foreground">{startLabel}</div>
                                </td>
                                <td className="px-3 py-2.5">
                                  <div className="font-medium text-foreground">{endLabel}</div>
                                </td>
                                <td className="px-3 py-2.5">
                                  <Badge
                                    variant={
                                      typeLabel === "manual"
                                        ? "destructive"
                                        : typeLabel === "constraint"
                                          ? "outline"
                                          : "secondary"
                                    }
                                  >
                                    {typeLabel}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                    title="Remove rib"
                                    aria-label={`Remove rib from ${startLabel} to ${endLabel}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleRemoveManualEdge(edge);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {displayedManualEdges.length > 0 ? "No ribs match the current node search." : "No reconstructed ribs are currently selected."}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={resetManualRibEdits}
                    disabled={!hasManualRibChanges}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    Reset edits
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={() => onSaveManualEdges(manualEdges)}
                    disabled={!hasManualRibChanges || isSavingManualEdges}
                  >
                    {isSavingManualEdges ? "Saving..." : "Save ribs"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>
      )}
      </>
    </TooltipProvider>
  );
}
