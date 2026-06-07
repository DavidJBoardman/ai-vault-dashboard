import JSZip from "jszip";
import type { Project } from "@/lib/store";
import { formatCutTypologyValue, getCompactNodeLabel } from "@/components/geometry2d/projectionCanvasUtils";
import {
  formatTemplateUvForRow,
  normaliseMatchCsvRows,
} from "@/components/geometry2d/stages/template/cutTypologyMatchingUtils";
import { filterReportColumns } from "@/components/geometry2d/stages/template/reportColumns";
import { buildBayPlanDxf } from "@/lib/geometry2d/bayPlanDxf";
import { resolveGeometry2DProjection } from "@/lib/geometry2d/projectionSelection";
import { summariseCutTypologyRows } from "@/lib/report/cutTypologySummary";

export interface BayProportionCandidate {
  rank: number;
  label: string;
  err: number;
  deltaFromBest: number;
}

export interface ReconstructNode {
  id: string;
  bossId: string | null;
  label: string;
  x: number;
  y: number;
  source: string;
}

export interface ReconstructIdealNode {
  id: string;
  bossId: string | null;
  label: string;
  x: number | null;
  y: number | null;
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
    bossesTotal: number;
    bossesMatched: number;
    bossesPartial: number;
    variantsMatched: number;
  };
  referencePoints: ReferencePoint[];
  reconstruct: {
    nodes: ReconstructNode[];
    nodesIdeal: ReconstructIdealNode[];
    edges: ReconstructEdge[];
  };
  roi: RoiBox | null;
  imageSize: ImageSize;
  // Real-world metres per projection pixel; null when projection metadata is
  // unavailable (e.g. Step 4D reconstruction not run, or scan not calibrated).
  metresPerPixel: number | null;
  inputs: {
    resolution: number;
    roiPx: { width: number; height: number; rotation: number } | null;
    // Physical ROI extent in metres, derived from roiPx × metresPerPixel.
    roiMetres: { width: number; height: number } | null;
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
  bossId?: string | number | null;
  label?: string;
  x?: number;
  y?: number;
  source?: string;
}

interface PersistedReconstructIdealNode {
  id?: string | number | null;
  bossId?: string | number | null;
  label?: string;
  x?: number | null;
  y?: number | null;
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
    nodesIdeal?: PersistedReconstructIdealNode[];
    edges?: PersistedReconstructEdge[];
    metresPerPixel?: number | null;
  };
}

interface Geometry2DPersisted {
  projectionId?: string;
  projectionName?: string;
  projectionResolution?: number;
  prep?: PrepData;
  nodes?: NodesData;
  template?: NodesData;
  matching?: { params?: Record<string, unknown>; lastRunAt?: string | null };
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
  // Projection images are persisted as fetchable backend URLs (see Step 2's
  // getProjectionImageUrl), not raw base64. Pass those through untouched —
  // wrapping them as `data:image/png;base64,<url>` produces a broken href and
  // was the reason the bay-plan background never rendered.
  if (
    value.startsWith("data:") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("blob:") ||
    value.startsWith("/")
  ) {
    return value;
  }
  // Treat anything else as raw base64 PNG/JPEG; default to PNG.
  return `data:image/png;base64,${value}`;
}

export function selectReportData(
  project: Project | null,
  cutTypology?: CutTypologyData | null,
  options?: { projectionImageDataUrl?: string | null }
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

  const selectedProjection = resolveGeometry2DProjection({
    project,
    preferStep4Projection: true,
  });
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

  // Normalise rows so uv_error is synthesised from x_error / y_error in the
  // same way the on-screen 4C and Step 8 match tables do. Otherwise the
  // bundle CSV and report.html see empty uv_error cells (backend writes the
  // two axes separately, never a combined column).
  const rawMatchRows = cutTypology?.rows ?? [];
  const matchRows = normaliseMatchCsvRows(rawMatchRows) as Array<Record<string, string>>;
  const rawMatchColumns = cutTypology?.columns ?? [];
  // Ensure uv_error appears in the column list once we've synthesised it, so
  // downstream filtering can pick it up.
  const matchColumns = rawMatchColumns.includes("uv_error")
    ? rawMatchColumns
    : [...rawMatchColumns, "uv_error"];
  const cutTypologySummary = summariseCutTypologyRows(matchRows);

  // Prefer a caller-supplied self-contained data URL (fetched as base64) when
  // available — it renders on-screen AND survives SVG-to-PNG rasterisation for
  // the bundle export, whereas a backend URL is blocked when the SVG is loaded
  // as an image. Fall back to the persisted projection URL otherwise.
  const projectionImageDataUrl =
    options?.projectionImageDataUrl ??
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
      bossId: n.bossId != null ? String(n.bossId) : null,
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

  const reconstructIdealRaw = geom.reconstruct?.result?.nodesIdeal ?? [];
  const reconstructIdeal: ReconstructIdealNode[] = reconstructIdealRaw.map((n) => ({
    id: String(n.id ?? ""),
    bossId: n.bossId != null ? String(n.bossId) : null,
    label: getCompactNodeLabel(n.bossId ?? n.label ?? n.id ?? ""),
    x: typeof n.x === "number" ? n.x : null,
    y: typeof n.y === "number" ? n.y : null,
    source: String(n.source ?? "ideal"),
  }));

  // Step 4C now persists matching parameters under geom.matching.params; older
  // projects may still have geom.template.settings. Read both so the field
  // reflects whatever shape is on disk.
  const matchingParams = geom.matching?.params;
  const legacyTemplateSettings = (geom.template as { settings?: { matchingThreshold?: number | string } })?.settings;
  const matchingThresholdRaw =
    (matchingParams && typeof matchingParams === "object" ? matchingParams["matchingThreshold"] : undefined)
    ?? legacyTemplateSettings?.matchingThreshold;
  const matchingThreshold =
    typeof matchingThresholdRaw === "number" || typeof matchingThresholdRaw === "string"
      ? String(matchingThresholdRaw)
      : null;

  // Real-world scale from the Step 4D bay-plan reconstruction. roi.width/height
  // are already in projection pixels (normaliseRoi scaled unit ROIs up), so the
  // physical extent is simply pixels × metres-per-pixel.
  const rawMetresPerPixel = geom.reconstruct?.result?.metresPerPixel;
  const metresPerPixel =
    typeof rawMetresPerPixel === "number" && Number.isFinite(rawMetresPerPixel) && rawMetresPerPixel > 0
      ? rawMetresPerPixel
      : null;
  const roiMetres =
    metresPerPixel && roi
      ? { width: roi.width * metresPerPixel, height: roi.height * metresPerPixel }
      : null;

  const inputs = {
    resolution,
    roiPx: roi
      ? { width: roi.width, height: roi.height, rotation: roi.rotation }
      : null,
    roiMetres,
    bossCount: cutTypologySummary.bossesTotal,
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
      bossesTotal: cutTypologySummary.bossesTotal,
      bossesMatched: cutTypologySummary.bossesMatched,
      bossesPartial: cutTypologySummary.bossesPartial,
      variantsMatched: cutTypologySummary.variantsMatched,
    },
    referencePoints,
    reconstruct: {
      nodes: reconstructNodes,
      nodesIdeal: reconstructIdeal,
      edges: reconstructEdges,
    },
    roi,
    imageSize: { width: resolution, height: resolution },
    metresPerPixel,
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
  const hasIdeal = data.reconstruct.nodesIdeal.some((n) => n.x !== null && n.y !== null);
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
      BAY_RIBS_MEASURED: "Reconstructed rib line segments (measured boss positions)",
      BAY_NODES_MEASURED: "Node markers at measured boss positions",
      ...(hasIdeal
        ? {
            BAY_RIBS_IDEAL: "Ribs reprojected onto the matched 4C cut-typology template",
            BAY_NODES_IDEAL: "Node markers at idealised boss positions (measured fallback if no 4C match)",
          }
        : {}),
    },
    nodes: data.reconstruct.nodes.map((node, index) => ({
      index,
      id: node.id,
      bossId: node.bossId,
      label: node.label,
      x: node.x,
      y: node.y,
    })),
    nodesIdeal: hasIdeal
      ? data.reconstruct.nodesIdeal.map((node, index) => ({
          index,
          id: node.id,
          bossId: node.bossId,
          label: node.label,
          x: node.x,
          y: node.y,
        }))
      : [],
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
        error: c.err.toFixed(4),
        deltaFromBest: c.deltaFromBest.toFixed(4),
      })),
      ["rank", "label", "error", "deltaFromBest"]
    )
  );

  // Use the same column set the user sees on screen (Step 8 report variant
  // = REPORT_COLUMNS) so the bundled CSV matches the in-app table and the
  // bundled report.html. Apply the same per-cell formatting (compact labels,
  // partial-axis template_uv, 4dp numeric rounding).
  const reportColumnsForCsv = filterReportColumns(data.cutTypology.columns);
  const cutTypologyExportRows = data.cutTypology.rows.map((row) => {
    const out: Record<string, string> = {};
    for (const col of reportColumnsForCsv) {
      if (col === "point_label") {
        out[col] = getCompactNodeLabel(row.point_label || row.boss_id) || row.point_label || "";
      } else if (col === "template_uv") {
        out[col] = formatTemplateUvForRow(row, formatCutTypologyValue);
      } else {
        out[col] = formatCutTypologyValue(row[col]);
      }
    }
    return out;
  });
  zip.file(
    "cut-typology.csv",
    toCsv(cutTypologyExportRows, reportColumnsForCsv)
  );

  if (bayPlanPng) {
    zip.file("bay-plan.png", bayPlanPng);
  }

  if (data.reconstruct.nodes.length > 0 && data.reconstruct.edges.length > 0) {
    try {
      const { text } = buildBayPlanDxf({
        nodes: data.reconstruct.nodes.map((n) => ({
          id: n.id || null,
          bossId: n.bossId,
          label: n.label,
          x: n.x,
          y: n.y,
        })),
        nodesIdeal:
          data.reconstruct.nodesIdeal.length > 0
            ? data.reconstruct.nodesIdeal.map((n) => ({
                id: n.id || null,
                bossId: n.bossId,
                label: n.label,
                x: n.x,
                y: n.y,
              }))
            : undefined,
        edges: data.reconstruct.edges,
      });
      zip.file("bay-plan.dxf", text);
      zip.file("bay-plan-metadata.json", JSON.stringify(buildBayPlanMetadata(data), null, 2));
    } catch {
      // The report bundle should still export if the optional DXF cannot be built.
    }
  }

  return zip.generateAsync({ type: "blob" });
}
