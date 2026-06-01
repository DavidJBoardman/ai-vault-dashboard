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
import {
  buildBayPlanPhysicalScale,
  formatMetres,
  ribLengthMetres,
  type BayPlanPhysicalScale,
} from "@/lib/geometry2d/bayPlanScale";
import { ChevronDown, ChevronUp, CircleHelp, Download, Network, Plus, RefreshCw, RotateCcw, Redo2, Ruler, Settings2, Trash2, Undo2 } from "lucide-react";

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
  isExportingDxf: boolean;
  onRun: () => void;
  onExportDxf: () => void;
  onSaveManualEdges: (edges: Geometry2DBayPlanEdge[]) => void;
  /** Keeps the canvas preview in sync with the draft rib list before Save ribs. */
  onDraftEdgesChange?: (edges: Geometry2DBayPlanEdge[]) => void;
  onSelectEdge: (edgeKey: string | null) => void;
  // Which slice of this panel to render. "controls" = the bay-plan setup card,
  // "manualEdit" = the rib edit table card. Splitting them lets step 4D show
  // each as its own tab in the left rail without nuking shared internal state.
  view?: "controls" | "manualEdit";
  // Whether the rendered graph should show measured boss positions (the
  // default scoring substrate) or the idealised template positions from 4C.
  reconstructionView: "measured" | "ideal";
  onChangeReconstructionView: (next: "measured" | "ideal") => void;
  showIdealisedOverlay: boolean;
  onChangeShowIdealisedOverlay: (next: boolean) => void;
  /** Saved ROI width/height converted to metres (matches DXF bay frame). */
  roiBaySizeMetres?: { width: number; height: number } | null;
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

function PhysicalScaleReadout({
  scale,
  roiBaySizeMetres,
  compact = false,
}: {
  scale: BayPlanPhysicalScale;
  roiBaySizeMetres?: { width: number; height: number } | null;
  compact?: boolean;
}) {
  const frame =
    roiBaySizeMetres ??
    scale.nodeSpanMetres;
  const frameLabel = roiBaySizeMetres ? "ROI bay frame" : "Boss span (approx.)";

  return (
    <div
      className={`rounded-md border border-sky-500/35 bg-sky-500/8 ${
        compact ? "px-2.5 py-2 space-y-1 text-xs" : "px-3 py-3 space-y-2"
      }`}
    >
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-sky-200/80">
        <Ruler className="h-3 w-3 shrink-0" />
        Physical scale
      </p>
      <p className={compact ? "leading-relaxed text-foreground" : "leading-snug text-foreground"}>
        <span className={compact ? "font-semibold" : "text-lg font-semibold tabular-nums"}>
          {scale.metresPerPixel.toFixed(4)} m
        </span>
        <span className={compact ? "text-muted-foreground" : "text-sm text-muted-foreground"}>
          {" "}
          per pixel · DXF export uses metres
        </span>
      </p>
      {frame ? (
        <p className={compact ? "text-muted-foreground leading-relaxed" : "text-sm leading-relaxed text-muted-foreground"}>
          {frameLabel}:{" "}
          <span className={compact ? "font-medium text-foreground" : "text-base font-semibold text-foreground tabular-nums"}>
            {formatMetres(frame.width)} m × {formatMetres(frame.height)} m
          </span>
        </p>
      ) : null}
    </div>
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
  isExportingDxf,
  onRun,
  onExportDxf,
  onSaveManualEdges,
  onDraftEdgesChange,
  onSelectEdge,
  view = "controls",
  reconstructionView,
  onChangeReconstructionView,
  showIdealisedOverlay,
  onChangeShowIdealisedOverlay,
  roiBaySizeMetres = null,
}: BayPlanReconstructionPanelProps) {
  const showControls = view === "controls";
  const showManualEdit = view === "manualEdit";
  const hasIdealPositions = useMemo(() => {
    const ideal = result?.nodesIdeal || [];
    return ideal.some((n) => n.u !== null && n.v !== null);
  }, [result?.nodesIdeal]);

  const physicalScale = useMemo(
    () => buildBayPlanPhysicalScale(result?.metresPerPixel, result?.nodes || []),
    [result?.metresPerPixel, result?.nodes]
  );
  const measuredNodes = result?.nodes || [];
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  // Default expanded — the parent step gates this card behind a dedicated
  // "Manual edit" tab now, so collapsing it again from inside is redundant.
  const [showManualRibEdits, setShowManualRibEdits] = useState(true);
  const [manualEdges, setManualEdges] = useState<Geometry2DBayPlanEdge[]>([]);
  const [manualEdgeStart, setManualEdgeStart] = useState<string>("");
  const [manualEdgeEnd, setManualEdgeEnd] = useState<string>("");
  // The original reconstruction edges, captured once per run so "Reset edits"
  // can restore them even after a delete has been saved. `ranAt` is rewritten
  // only by a fresh reconstruction run (manual-edge saves preserve it), so it
  // is a reliable key for "this is still the same reconstruction".
  const [baselineEdges, setBaselineEdges] = useState<Geometry2DBayPlanEdge[]>([]);
  const baselineRanAtRef = useRef<string | null>(null);
  // Local undo/redo stack over the draft edges (mirrors the template-points
  // history). Reset to a single entry whenever a new result loads.
  const [editHistory, setEditHistory] = useState<{ stack: Geometry2DBayPlanEdge[][]; index: number }>({
    stack: [],
    index: -1,
  });
  const [edgeSearchQuery, setEdgeSearchQuery] = useState("");
  const [edgeSort, setEdgeSort] = useState<{ column: "rib" | "type"; direction: "asc" | "desc" }>({
    column: "rib",
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
    // Only re-capture the reset baseline when the reconstruction itself changed
    // (new run). Manual-edge saves keep the same `ranAt`, so the original edges
    // survive and remain recoverable via "Reset edits".
    const ranAt = result?.ranAt ?? null;
    if (baselineRanAtRef.current !== ranAt) {
      baselineRanAtRef.current = ranAt;
      setBaselineEdges(nextEdges);
    }
    setEditHistory({ stack: [nextEdges], index: 0 });
    setManualEdgeStart("");
    setManualEdgeEnd("");
  }, [result]);

  useEffect(() => {
    onDraftEdgesChange?.(manualEdges);
  }, [manualEdges, onDraftEdgesChange]);

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

  // Reset is available whenever the draft differs from the original
  // reconstruction — including after a deletion has been saved.
  const canResetToBaseline = useMemo(() => {
    const baselineSignature = baselineEdges.map(edgeKey).sort().join("|");
    const draftSignature = manualEdges.map(edgeKey).sort().join("|");
    return baselineSignature !== draftSignature;
  }, [baselineEdges, manualEdges]);

  const canUndo = editHistory.index > 0;
  const canRedo = editHistory.index < editHistory.stack.length - 1;

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
        edgeSort.column === "type"
          ? edgeLabelCollator.compare(leftType, rightType)
          : edgeLabelCollator.compare(leftFrom, rightFrom) ||
            edgeLabelCollator.compare(leftTo, rightTo);

      if (compare !== 0) {
        return edgeSort.direction === "asc" ? compare : -compare;
      }

      const fallback =
        edgeSort.column === "type"
          ? edgeLabelCollator.compare(leftFrom, rightFrom)
          : edgeLabelCollator.compare(leftType, rightType);
      return edgeSort.direction === "asc" ? fallback : -fallback;
    });
  }, [availableNodeIds, displayedManualEdges, edgeLabelCollator, edgeSearchQuery, edgeSort, nodeLabelByIndex, selectedEdgeKey]);

  const selectedManualEdgeSummary = useMemo(() => {
    if (!selectedEdgeKey) return null;
    const selectedEdge = manualEdges.find((edge) => edgeKey(edge) === selectedEdgeKey);
    if (!selectedEdge) return null;
    const startLabel = nodeLabelByIndex.get(selectedEdge.a) || String(selectedEdge.a);
    const endLabel = nodeLabelByIndex.get(selectedEdge.b) || String(selectedEdge.b);
    const label = `${startLabel} → ${endLabel}`;
    const lengthM =
      physicalScale && ribLengthMetres(measuredNodes, selectedEdge, physicalScale.metresPerPixel);
    return {
      label,
      lengthLabel: lengthM !== null ? `${formatMetres(lengthM)} m` : null,
    };
  }, [manualEdges, measuredNodes, nodeLabelByIndex, physicalScale, selectedEdgeKey]);

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

  const sortEdges = (edges: Geometry2DBayPlanEdge[]) =>
    [...edges].sort((left, right) => {
      if (left.a !== right.a) return left.a - right.a;
      return left.b - right.b;
    });

  // Apply a new draft edge set and record it on the undo stack, discarding any
  // entries ahead of the current index (the usual redo-tail truncation).
  const applyManualEdges = (next: Geometry2DBayPlanEdge[]) => {
    setManualEdges(next);
    setEditHistory((history) => {
      const base = history.stack.slice(0, history.index + 1);
      base.push(next);
      return { stack: base, index: base.length - 1 };
    });
  };

  const handleUndoManualEdges = () => {
    if (editHistory.index <= 0) return;
    const nextIndex = editHistory.index - 1;
    setManualEdges(editHistory.stack[nextIndex]);
    setEditHistory((history) => ({ ...history, index: nextIndex }));
  };

  const handleRedoManualEdges = () => {
    if (editHistory.index >= editHistory.stack.length - 1) return;
    const nextIndex = editHistory.index + 1;
    setManualEdges(editHistory.stack[nextIndex]);
    setEditHistory((history) => ({ ...history, index: nextIndex }));
  };

  const resetManualRibEdits = () => {
    applyManualEdges(sortEdges(baselineEdges.map(normaliseEdge)));
    setManualEdgeStart("");
    setManualEdgeEnd("");
  };

  const handleAddManualEdge = () => {
    const a = Number(manualEdgeStart);
    const b = Number(manualEdgeEnd);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return;
    const nextEdge = normaliseEdge({ a, b, isConstraint: false, isManual: true });
    const nextKey = edgeKey(nextEdge);
    if (manualEdges.some((edge) => edgeKey(edge) === nextKey)) return;
    applyManualEdges(sortEdges([...manualEdges, nextEdge]));
    setManualEdgeStart("");
    setManualEdgeEnd("");
  };

  const toggleEdgeSort = (column: "rib" | "type") => {
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
    applyManualEdges(manualEdges.filter((edge) => edgeKey(edge) !== targetKey));
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

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">View</span>
            <div className="inline-flex rounded-md border bg-background">
              <Button
                type="button"
                variant={reconstructionView === "measured" ? "default" : "ghost"}
                size="sm"
                className="rounded-r-none"
                onClick={() => onChangeReconstructionView("measured")}
              >
                Measured
              </Button>
              <Button
                type="button"
                variant={reconstructionView === "ideal" ? "default" : "ghost"}
                size="sm"
                className="rounded-l-none"
                disabled={!hasIdealPositions}
                title={hasIdealPositions ? "" : "No matched bosses from Step 4C"}
                onClick={() => onChangeReconstructionView("ideal")}
              >
                Idealised
              </Button>
            </div>
          </div>

          <Label className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/60 px-3 py-2 text-xs font-medium">
            <span className="text-muted-foreground">
              {reconstructionView === "ideal" ? "Show measured overlay" : "Show idealised overlay"}
            </span>
            <Checkbox
              checked={showIdealisedOverlay}
              disabled={!hasIdealPositions}
              onCheckedChange={(next) => onChangeShowIdealisedOverlay(next === true)}
            />
          </Label>

          {result ? (
            <div className="space-y-3">
              {physicalScale ? (
                <PhysicalScaleReadout scale={physicalScale} roiBaySizeMetres={roiBaySizeMetres} />
              ) : (
                <p className="rounded-md border border-dashed border-amber-500/35 bg-amber-500/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  Physical scale unavailable for this projection — rib lengths and DXF export use pixel coordinates.
                </p>
              )}
              <div className="rounded-md border border-border/70 px-3 py-2.5">
                <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                  <div>
                    <span className="block text-foreground text-base font-semibold leading-none tabular-nums">
                      {result.nodeCount}
                    </span>
                    <span>Nodes</span>
                  </div>
                  <div>
                    <span className="block text-foreground text-base font-semibold leading-none tabular-nums">
                      {result.edgeCount}
                    </span>
                    <span>Ribs</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-3 text-xs text-muted-foreground">
              Run the reconstruction to review the retained nodes and rib graph.
            </div>
          )}

          {result && resultReconstructionMode === "current" ? (
            <div className="rounded-md border border-border/60 bg-muted/5 px-3 py-2.5 space-y-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Reconstruction quality</p>
                <p className="text-base font-medium leading-none tabular-nums text-foreground/90">{overallScoreLabel}</p>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="rounded bg-background/40 px-2 py-1.5">
                  <p className="text-muted-foreground">Edge evidence</p>
                  <p className="mt-0.5 font-medium tabular-nums text-foreground/85">{edgeEvidenceLabel ?? "0.00"}</p>
                </div>
                <div className="rounded bg-background/40 px-2 py-1.5">
                  <p className="text-muted-foreground">Boundary</p>
                  <p className="mt-0.5 font-medium tabular-nums text-foreground/85">
                    {boundaryCoverageLabel ?? "0.00"}
                    {selectedBoundaryEdgeCount !== null && mandatoryBoundaryEdgeCount !== null
                      ? ` (${selectedBoundaryEdgeCount}/${mandatoryBoundaryEdgeCount})`
                      : ""}
                  </p>
                </div>
                <div className="rounded bg-background/40 px-2 py-1.5">
                  <p className="text-muted-foreground">Degree</p>
                  <p className="mt-0.5 font-medium tabular-nums text-foreground/85">{degreeSatisfactionLabel ?? "0.00"}</p>
                </div>
                <div className="rounded bg-background/40 px-2 py-1.5">
                  <p className="text-muted-foreground">Mutual support</p>
                  <p className="mt-0.5 font-medium tabular-nums text-foreground/85">
                    {mutualSupportLabel ?? "0.00"}
                    {selectedNonBoundaryEdgeCount !== null ? ` (${selectedNonBoundaryEdgeCount} ribs)` : ""}
                  </p>
                </div>
              </div>
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

          <div className="grid gap-3">
            <Button
              variant={result ? "outline" : "default"}
              className="w-full gap-2"
              onClick={onRun}
              disabled={isLoadingState || isRunning || isExportingDxf}
            >
              <RefreshCw className={`h-4 w-4 ${isRunning ? "animate-spin" : ""}`} />
              {isRunning ? "Running reconstruction..." : result ? "Run reconstruction again" : "Run reconstruction"}
            </Button>
            <Button
              type="button"
              className="w-full gap-2"
              onClick={onExportDxf}
              disabled={!result || isLoadingState || isRunning || isExportingDxf}
            >
              <Download className="h-4 w-4" />
              {isExportingDxf ? "Preparing..." : "Download DXF"}
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {physicalScale
                ? "DXF coordinates are in metres using the physical scale shown above."
                : "Real-world scale unavailable — DXF falls back to pixel coordinates."}
            </p>
          </div>
        </CardContent>
      </Card>
      )}

      {showManualEdit && (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base font-medium">Manual rib edits</CardTitle>
                {hasManualRibChanges ? (
                  <Badge variant="outline" className="border-amber-400/45 bg-amber-500/10 text-amber-100">
                    Unsaved edits
                  </Badge>
                ) : null}
              </div>
              <CardDescription className="text-xs leading-relaxed">
                Edits update the canvas preview immediately. Save ribs when you want them written to the project and DXF export.
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
                {physicalScale ? (
                  <PhysicalScaleReadout scale={physicalScale} roiBaySizeMetres={roiBaySizeMetres} compact />
                ) : null}
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
                    <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                      {selectedManualEdgeSummary ? (
                        <Badge variant="secondary" className="max-w-full bg-amber-500/15 text-amber-100">
                          <span className="truncate">
                            {selectedManualEdgeSummary.label}
                            {selectedManualEdgeSummary.lengthLabel
                              ? ` · ${selectedManualEdgeSummary.lengthLabel}`
                              : ""}
                          </span>
                        </Badge>
                      ) : null}
                      <span className="text-muted-foreground">{manualEdges.length} total</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={edgeSearchQuery}
                      onChange={(event) => setEdgeSearchQuery(event.target.value)}
                      placeholder="Search by node label"
                      className="h-8 flex-1 text-xs sm:min-w-[180px]"
                    />
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Select a row or canvas rib to link views. Undo and redo apply to the preview
                    {physicalScale ? "; hover a rib for length in metres." : "."}
                  </p>

                  {filteredManualEdges.length > 0 ? (
                    <div className="max-h-[clamp(16rem,34vh,24rem)] overflow-auto rounded-md border border-border/70 bg-background/50">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-[1] bg-background/95 backdrop-blur">
                          <tr className="border-b border-border/70 text-left text-muted-foreground">
                            <th className="px-3 py-2 font-medium">
                              <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleEdgeSort("rib")}>
                                Rib
                                {edgeSort.column === "rib" ? (edgeSort.direction === "asc" ? "↑" : "↓") : "↕"}
                              </button>
                            </th>
                            <th className="w-24 px-3 py-2 font-medium">
                              <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleEdgeSort("type")}>
                                Type
                                {edgeSort.column === "type" ? (edgeSort.direction === "asc" ? "↑" : "↓") : "↕"}
                              </button>
                            </th>
                            <th className="w-12 px-2 py-2 text-right font-medium">
                              <span className="sr-only">Remove</span>
                            </th>
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
                                className={`cursor-pointer border-b border-l-2 border-border/50 align-middle last:border-b-0 ${
                                  isSelected
                                    ? "border-l-amber-300 bg-amber-500/18 ring-1 ring-inset ring-amber-300/70"
                                    : "border-l-transparent hover:bg-muted/20"
                                }`}
                                onClick={() => onSelectEdge(isSelected ? null : currentEdgeKey)}
                              >
                                <td className="px-3 py-2.5">
                                  <div className="font-medium text-foreground tabular-nums">
                                    {startLabel}
                                    <span className="mx-1.5 text-muted-foreground">→</span>
                                    {endLabel}
                                  </div>
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
                                    className="capitalize"
                                  >
                                    {typeLabel}
                                  </Badge>
                                </td>
                                <td className="px-2 py-2.5 text-right">
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
                    onClick={handleUndoManualEdges}
                    disabled={!canUndo}
                    title="Undo the last rib edit on the canvas preview"
                  >
                    <Undo2 className="mr-1 h-3.5 w-3.5" />
                    Undo
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={handleRedoManualEdges}
                    disabled={!canRedo}
                    title="Redo the last undone rib edit on the canvas preview"
                  >
                    <Redo2 className="mr-1 h-3.5 w-3.5" />
                    Redo
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={resetManualRibEdits}
                    disabled={!canResetToBaseline}
                    title="Restore the original reconstructed ribs"
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
                    {isSavingManualEdges ? "Saving..." : "Save ribs to project"}
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
