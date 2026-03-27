import type { ImportedCurve, IntradosLine as ApiIntradosLine } from "@/lib/api";

export type TraceSource = "auto" | "manual";
export type TraceSourceSelection = TraceSource | "both";

export interface WorkflowTraceLine {
  id: string;
  rawId: string;
  label: string;
  color: string;
  source: TraceSource;
  points3d: [number, number, number][];
}

export const MANUAL_TRACE_COLOR = "#00ff88";
export const MAX_IMPORTED_TRACE_POINTS = 160;

function toFiniteNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function normalizePoint3DTuple(point: unknown): [number, number, number] | null {
  if (!Array.isArray(point) || point.length < 2) {
    return null;
  }

  return [
    toFiniteNumber(point[0]),
    toFiniteNumber(point[1]),
    toFiniteNumber(point[2]),
  ];
}

export function resampleTracePoints(
  points: [number, number, number][],
  maxPoints: number,
): [number, number, number][] {
  if (points.length <= maxPoints || maxPoints < 2) {
    return points;
  }

  const cumulativeDistances = new Array<number>(points.length).fill(0);
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dx = current[0] - previous[0];
    const dy = current[1] - previous[1];
    const dz = current[2] - previous[2];
    cumulativeDistances[index] = cumulativeDistances[index - 1] + Math.hypot(dx, dy, dz);
  }

  const totalDistance = cumulativeDistances[cumulativeDistances.length - 1];
  if (totalDistance <= 0) {
    return [points[0], ...points.slice(1, maxPoints - 1), points[points.length - 1]];
  }

  const resampled: [number, number, number][] = [points[0]];
  let sourceIndex = 1;

  for (let targetIndex = 1; targetIndex < maxPoints - 1; targetIndex += 1) {
    const targetDistance = (totalDistance * targetIndex) / (maxPoints - 1);
    while (
      sourceIndex < cumulativeDistances.length - 1 &&
      cumulativeDistances[sourceIndex] < targetDistance
    ) {
      sourceIndex += 1;
    }

    const previousIndex = Math.max(0, sourceIndex - 1);
    const previousDistance = cumulativeDistances[previousIndex];
    const nextDistance = cumulativeDistances[sourceIndex];

    if (nextDistance <= previousDistance) {
      resampled.push(points[sourceIndex]);
      continue;
    }

    const ratio = (targetDistance - previousDistance) / (nextDistance - previousDistance);
    const start = points[previousIndex];
    const end = points[sourceIndex];

    resampled.push([
      start[0] + (end[0] - start[0]) * ratio,
      start[1] + (end[1] - start[1]) * ratio,
      start[2] + (end[2] - start[2]) * ratio,
    ]);
  }

  resampled.push(points[points.length - 1]);
  return resampled;
}

export function normalizeImportedCurves(curves: unknown, fallbackSource?: string | null): ImportedCurve[] {
  if (!Array.isArray(curves)) {
    return [];
  }

  return curves.flatMap((curve, index) => {
    if (!curve || typeof curve !== "object") {
      return [];
    }

    const value = curve as Record<string, unknown>;
    const rawPoints = Array.isArray(value.points)
      ? value.points
          .map(normalizePoint3DTuple)
          .filter((point): point is [number, number, number] => point !== null)
      : [];
    const points = resampleTracePoints(rawPoints, MAX_IMPORTED_TRACE_POINTS);

    return [{
      id: typeof value.id === "string" && value.id.trim() ? value.id : `curve-${index + 1}`,
      name: typeof value.name === "string" && value.name.trim() ? value.name : `Curve ${index + 1}`,
      layer: typeof value.layer === "string" ? value.layer : "Imported Traces",
      points,
      pointCount: points.length,
      source: typeof value.source === "string" ? value.source : (fallbackSource ?? "manual"),
    }];
  });
}

export function toWorkflowTraceLineFromIntrados(line: ApiIntradosLine): WorkflowTraceLine {
  const points3d = Array.isArray(line.points3d)
    ? line.points3d
        .map(normalizePoint3DTuple)
        .filter((point): point is [number, number, number] => point !== null)
    : [];

  return {
    id: line.id,
    rawId: line.id,
    label: line.label,
    color: line.color,
    source: "auto",
    points3d,
  };
}

export function toWorkflowTraceLineFromImportedCurve(curve: ImportedCurve, index: number): WorkflowTraceLine {
  return {
    id: `manual:${curve.id || `curve-${index + 1}`}`,
    rawId: curve.id || `curve-${index + 1}`,
    label: curve.name || `Curve ${index + 1}`,
    color: MANUAL_TRACE_COLOR,
    source: "manual",
    points3d: curve.points
      .map(normalizePoint3DTuple)
      .filter((point): point is [number, number, number] => point !== null),
  };
}

export function coerceTraceSourceSelection(value: unknown): TraceSourceSelection {
  return value === "manual" || value === "both" || value === "auto"
    ? value
    : "auto";
}

export function resolveAvailableTraceSource(
  preferred: TraceSourceSelection,
  hasAuto: boolean,
  hasManual: boolean,
): TraceSourceSelection {
  if (preferred === "both") {
    if (hasAuto && hasManual) {
      return "both";
    }
    if (hasManual) {
      return "manual";
    }
    if (hasAuto) {
      return "auto";
    }
    return "auto";
  }

  if (preferred === "manual") {
    if (hasManual) {
      return "manual";
    }
    if (hasAuto) {
      return "auto";
    }
    return "manual";
  }

  if (hasAuto) {
    return "auto";
  }
  if (hasManual) {
    return "manual";
  }
  return "auto";
}