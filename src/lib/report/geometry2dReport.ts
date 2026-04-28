import JSZip from "jszip";
import type { Project } from "@/lib/store";
import { getCompactNodeLabel } from "@/components/geometry2d/projectionCanvasUtils";
import { buildBayPlanDxf } from "@/lib/geometry2d/bayPlanDxf";

export interface BayProportionCandidate {
  rank: number;
  label: string;
  err: number;
  deltaFromBest: number;
}

export interface ReconstructNode {
  id: string;
  label: string;
  x: number;
  y: number;
  source: string;
}

export interface ReconstructEdge {
  a: number;
  b: number;
  isConstraint: boolean;
  isManual: boolean;
}

export interface ReferencePoint {
  letter: string;
  // Absolute pixel coordinates in the projection image space.
  x: number;
  y: number;
  // ROI-relative normalised coordinates, retained for CSV export.
  u: number;
  v: number;
}

export interface RoiBox {
  // Top-left + size in projection-image pixel space.
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface CutTypologyData {
  columns: string[];
  rows: Array<Record<string, string>>;
}

export interface ReportData {
  generatedAt: string;
  projectId: string;
  projectName: string;
  projectLocation: string;
  projectionName: string;
  projectionImageDataUrl: string | null;
  bayProportion: {
    measured: number | null;
    best: BayProportionCandidate | null;
    candidates: BayProportionCandidate[];
  };
  cutTypology: {
    columns: string[];
    rows: Array<Record<string, string>>;
    bossesMatched: number;
    variantsMatched: number;
  };
  referencePoints: ReferencePoint[];
  reconstruct: {
    nodes: ReconstructNode[];
    edges: ReconstructEdge[];
  };
  roi: RoiBox | null;
  imageSize: ImageSize;
  inputs: {
    resolution: number;
    roiPx: { width: number; height: number; rotation: number } | null;
    bossCount: number;
    pointCount: number;
    matchingThreshold: string | null;
  };
}

interface PrepData {
  vaultRatio?: number;
  vaultRatioSuggestions?: Array<{ label: string; err: number }>;
}

interface PersistedNodePoint {
  label?: string;
  x?: number;
  y?: number;
  u?: number;
  v?: number;
}

interface NodesData {
  points?: PersistedNodePoint[];
}

// ROI may be persisted in two shapes:
//   - legacy: { x, y, width, height, rotation }
//   - controller: { cx, cy, w, h, rotation_deg, scale }
interface PersistedRoi {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  cx?: number;
  cy?: number;
  w?: number;
  h?: number;
  rotation_deg?: number;
  scale?: number;
}

interface PersistedReconstructNode {
  id?: string | number;
  bossId?: string | number;
  label?: string;
  x?: number;
  y?: number;
  source?: string;
}

interface PersistedReconstructEdge {
  a?: number;
  b?: number;
  isConstraint?: boolean;
  isManual?: boolean;
  isBoundaryForced?: boolean;
}

interface ReconstructPersisted {
  result?: {
    nodes?: PersistedReconstructNode[];
    edges?: PersistedReconstructEdge[];
  };
}

interface Geometry2DPersisted {
  prep?: PrepData;
  nodes?: NodesData;
  template?: NodesData;
  roi?: PersistedRoi;
  reconstruct?: ReconstructPersisted;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function pickResolution(projection: {
  settings?: { resolution?: number };
} | null): number {
  return projection?.settings?.resolution ?? 2048;
}

function normaliseRoi(raw: PersistedRoi | undefined, resolution: number): RoiBox | null {
  if (!raw) return null;

  // Centre/size form: { cx, cy, w, h, rotation_deg }
  if (typeof raw.cx === "number" && typeof raw.cy === "number" && typeof raw.w === "number" && typeof raw.h === "number") {
    let { cx, cy, w, h } = raw;
    const looksUnit = cx <= 1.01 && cy <= 1.01 && w <= 1.01 && h <= 1.01;
    if (looksUnit) {
      cx *= resolution;
      cy *= resolution;
      w *= resolution;
      h *= resolution;
    }
    return {
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
      rotation: raw.rotation_deg ?? 0,
    };
  }

  // Centre/size form: { x, y, width, height } — `x, y` are the ROI centre per ROIState.
  if (typeof raw.x === "number" && typeof raw.y === "number" && typeof raw.width === "number" && typeof raw.height === "number") {
    let { x: cx, y: cy, width, height } = raw;
    const looksUnit = cx <= 1.01 && cy <= 1.01 && width <= 1.01 && height <= 1.01;
    if (looksUnit) {
      cx *= resolution;
      cy *= resolution;
      width *= resolution;
      height *= resolution;
    }
    return {
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height,
      rotation: raw.rotation ?? 0,
    };
  }

  return null;
}

function pointToPixel(p: PersistedNodePoint, roi: RoiBox | null, resolution: number): { x: number; y: number } | null {
  // Prefer absolute x, y when available.
  if (typeof p.x === "number" && typeof p.y === "number") {
    const looksUnit = p.x <= 1.01 && p.y <= 1.01;
    return looksUnit ? { x: p.x * resolution, y: p.y * resolution } : { x: p.x, y: p.y };
  }
  // Fall back to ROI-relative u,v.
  if (typeof p.u === "number" && typeof p.v === "number" && roi) {
    return { x: roi.x + p.u * roi.width, y: roi.y + p.v * roi.height };
  }
  return null;
}

function ensureDataUrl(value: string | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("data:")) return value;
  // Treat as raw base64 PNG/JPEG; default to PNG.
  return `data:image/png;base64,${value}`;
}

export function selectReportData(
  project: Project | null,
  cutTypology?: CutTypologyData | null
): ReportData | null {
  if (!project) return null;

  const step4Data = (project.steps?.[4]?.data ?? {}) as { geometry2d?: Geometry2DPersisted };
  const geom = step4Data.geometry2d ?? {};

  const prep = geom.prep ?? {};
  const measured = typeof prep.vaultRatio === "number" ? prep.vaultRatio : null;
  const suggestions = (prep.vaultRatioSuggestions ?? []).slice().sort((a, b) => a.err - b.err);
  const bestErr = suggestions[0]?.err ?? 0;
  const candidates: BayProportionCandidate[] = suggestions.map((s, i) => ({
    rank: i + 1,
    label: s.label,
    err: s.err,
    deltaFromBest: s.err - bestErr,
  }));

  const selectedProjection =
    project.projections.find((p) => p.id === project.selectedProjectionId) ??
    project.projections[0] ??
    null;
  const resolution = pickResolution(selectedProjection);
  const roi = normaliseRoi(geom.roi, resolution);

  const nodePoints = geom.nodes?.points ?? geom.template?.points ?? [];
  const referencePoints: ReferencePoint[] = nodePoints
    .map((p, i): ReferencePoint | null => {
      const pixel = pointToPixel(p, roi, resolution);
      if (!pixel) return null;
      return {
        letter: LETTERS[i] ?? `P${i + 1}`,
        x: pixel.x,
        y: pixel.y,
        u: typeof p.u === "number" ? p.u : 0,
        v: typeof p.v === "number" ? p.v : 0,
      };
    })
    .filter((p): p is ReferencePoint => p !== null);

  const matchColumns = cutTypology?.columns ?? [];
  const matchRows = cutTypology?.rows ?? [];
  const bossRows = matchRows.filter((r) => (r["point_type"] ?? "") === "boss");
  const variantsMatched = new Set(
    matchRows
      .map((r) => r["variant_label"] ?? r["matchedVariantLabel"] ?? r["matched_variant_label"] ?? "")
      .filter((v) => v && v !== "None" && v !== "roi_corner")
  ).size;

  const projectionImageDataUrl =
    ensureDataUrl(selectedProjection?.images?.colour) ??
    ensureDataUrl(selectedProjection?.previewImage) ??
    null;

  const reconstructNodesRaw = geom.reconstruct?.result?.nodes ?? [];
  const reconstructNodes: ReconstructNode[] = reconstructNodesRaw
    .filter((n): n is PersistedReconstructNode & { x: number; y: number } =>
      typeof n.x === "number" && typeof n.y === "number"
    )
    .map((n) => ({
      id: String(n.id ?? ""),
      label: getCompactNodeLabel(n.bossId ?? n.label ?? n.id ?? ""),
      x: n.x,
      y: n.y,
      source: String(n.source ?? ""),
    }));

  const reconstructEdgesRaw = geom.reconstruct?.result?.edges ?? [];
  const reconstructEdges: ReconstructEdge[] = reconstructEdgesRaw
    .filter((e): e is PersistedReconstructEdge & { a: number; b: number } =>
      typeof e.a === "number" && typeof e.b === "number"
    )
    .map((e) => ({
      a: e.a,
      b: e.b,
      isConstraint: Boolean(e.isConstraint || e.isBoundaryForced),
      isManual: Boolean(e.isManual),
    }));

  const templateSettings = (geom.template as { settings?: { matchingThreshold?: number | string } })
    ?.settings;
  const matchingThreshold =
    typeof templateSettings?.matchingThreshold === "number" ||
    typeof templateSettings?.matchingThreshold === "string"
      ? String(templateSettings.matchingThreshold)
      : null;

  const inputs = {
    resolution,
    roiPx: roi
      ? { width: roi.width, height: roi.height, rotation: roi.rotation }
      : null,
    bossCount: bossRows.length,
    pointCount: referencePoints.length,
    matchingThreshold,
  };

  return {
    generatedAt: new Date().toISOString(),
    projectId: project.id,
    projectName: project.name,
    projectLocation: project.location ?? "",
    projectionName: selectedProjection?.name ?? "",
    projectionImageDataUrl,
    bayProportion: {
      measured,
      best: candidates[0] ?? null,
      candidates,
    },
    cutTypology: {
      columns: matchColumns,
      rows: matchRows,
      bossesMatched: bossRows.length,
      variantsMatched,
    },
    referencePoints,
    reconstruct: {
      nodes: reconstructNodes,
      edges: reconstructEdges,
    },
    roi,
    imageSize: { width: resolution, height: resolution },
    inputs,
  };
}

export function toCsv(
  rows: Array<Record<string, string | number>>,
  columns?: string[]
): string {
  if (rows.length === 0) return columns ? columns.join(",") + "\n" : "";
  const cols = columns ?? Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(",");
  const body = rows.map((row) => cols.map((c) => escape(row[c])).join(",")).join("\n");
  return header + "\n" + body + "\n";
}

function buildBayPlanMetadata(data: ReportData) {
  return {
    exportType: "step-4d-bay-plan-dxf",
    generatedAt: data.generatedAt,
    projectId: data.projectId,
    projectName: data.projectName,
    projectionName: data.projectionName,
    coordinateSystem: {
      units: "projection pixels",
      origin: "top-left of projection image",
      xAxis: "right",
      yAxis: "down",
      realWorldScale: "not calibrated in this DXF export",
    },
    imageSize: data.imageSize,
    nodeCount: data.reconstruct.nodes.length,
    ribCount: data.reconstruct.edges.length,
    layers: {
      BAY_RIBS: "Reconstructed rib line segments",
      BAY_NODES: "Node marker circles",
    },
    nodes: data.reconstruct.nodes.map((node, index) => ({
      index,
      id: node.id,
      label: node.label,
      x: node.x,
      y: node.y,
    })),
  };
}

export interface BundleInputs {
  reportHtml: string;
  bayPlanPng: Blob | null;
  data: ReportData;
}

export async function buildBundleZip(inputs: BundleInputs): Promise<Blob> {
  const { reportHtml, bayPlanPng, data } = inputs;
  const zip = new JSZip();

  zip.file("report.html", reportHtml);

  zip.file(
    "bay-proportion.csv",
    toCsv(
      data.bayProportion.candidates.map((c) => ({
        rank: c.rank,
        label: c.label,
        error: c.err.toFixed(6),
        deltaFromBest: c.deltaFromBest.toFixed(6),
      })),
      ["rank", "label", "error", "deltaFromBest"]
    )
  );

  zip.file(
    "cut-typology.csv",
    toCsv(
      data.cutTypology.rows,
      data.cutTypology.columns.length > 0 ? data.cutTypology.columns : undefined
    )
  );

  if (bayPlanPng) {
    zip.file("bay-plan.png", bayPlanPng);
  }

  if (data.reconstruct.nodes.length > 0 && data.reconstruct.edges.length > 0) {
    try {
      const { text } = buildBayPlanDxf(data.reconstruct);
      zip.file("bay-plan.dxf", text);
      zip.file("bay-plan-metadata.json", JSON.stringify(buildBayPlanMetadata(data), null, 2));
    } catch {
      // The report bundle should still export if the optional DXF cannot be built.
    }
  }

  return zip.generateAsync({ type: "blob" });
}
