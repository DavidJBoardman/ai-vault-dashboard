import JSZip from "jszip";
import type { Project } from "@/lib/store";

export interface BayProportionCandidate {
  rank: number;
  label: string;
  err: number;
  deltaFromBest: number;
}

export interface ReferencePoint {
  letter: string;
  u: number;
  v: number;
}

export interface RoiBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
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
  roi: RoiBox | null;
}

interface PrepData {
  vaultRatio?: number;
  vaultRatioSuggestions?: Array<{ label: string; err: number }>;
}

interface NodesData {
  points?: Array<{ label?: string; u?: number; v?: number }>;
}

interface Geometry2DPersisted {
  prep?: PrepData;
  nodes?: NodesData;
  template?: NodesData;
  roi?: RoiBox;
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

  const nodePoints = (geom.nodes?.points ?? geom.template?.points ?? []).filter(
    (p): p is { label?: string; u: number; v: number } =>
      typeof p?.u === "number" && typeof p?.v === "number"
  );
  const referencePoints: ReferencePoint[] = nodePoints.map((p, i) => ({
    letter: p.label && p.label.length > 0 ? p.label : String.fromCharCode(65 + i),
    u: p.u,
    v: p.v,
  }));

  const matchColumns = cutTypology?.columns ?? [];
  const matchRows = cutTypology?.rows ?? [];
  const variantsMatched = new Set(
    matchRows
      .map((r) => r["matchedVariantLabel"] || r["matched_variant_label"] || "")
      .filter((v) => v.length > 0)
  ).size;

  const selectedProjection =
    project.projections.find((p) => p.id === project.selectedProjectionId) ??
    project.projections[0] ??
    null;

  const projectionImageDataUrl =
    ensureDataUrl(selectedProjection?.images?.colour) ??
    ensureDataUrl(selectedProjection?.previewImage) ??
    null;

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
      bossesMatched: matchRows.length,
      variantsMatched,
    },
    referencePoints,
    roi: geom.roi ?? null,
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

  zip.file(
    "bay-plan.csv",
    toCsv(
      data.referencePoints.map((p) => ({ letter: p.letter, u: p.u.toFixed(6), v: p.v.toFixed(6) })),
      ["letter", "u", "v"]
    )
  );

  if (bayPlanPng) {
    zip.file("bay-plan.png", bayPlanPng);
  }

  return zip.generateAsync({ type: "blob" });
}
