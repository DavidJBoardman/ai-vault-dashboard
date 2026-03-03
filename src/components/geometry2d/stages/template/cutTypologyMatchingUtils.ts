import {
  Geometry2DCutTypologyBossMatch,
  Geometry2DCutTypologyBossResult,
  Geometry2DCutTypologyOverlayVariant,
  Geometry2DCutTypologyVariantResult,
} from "@/lib/api";

export type MatchCsvRow = Record<string, string>;

export interface MatchErrorSeverity {
  label: string;
  className: string;
}

export interface PerBossTypologySummary {
  dominantFamily: string;
  dominantCount: number;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  details: Array<[string, number]>;
  hasMixedDetails: boolean;
  overlayLabels: string[];
}

export function rawVariantLabelToTitle(label?: string): string {
  if (!label) return "unknown";
  if (label.startsWith("starcut_n=")) {
    const n = Number(label.split("=", 2)[1]);
    return Number.isFinite(n) ? `standardcut n=${n}` : "standardcut";
  }
  if (label === "circlecut_inner") return "circlecut inner";
  if (label === "circlecut_outer") return "circlecut outer";
  return label;
}

export function variantLabelToFamily(label?: string): string | null {
  if (!label) return null;
  if (label.startsWith("starcut_n=")) return "standard starcut";
  if (label === "circlecut_inner") return "circlecut inner";
  if (label === "circlecut_outer") return "circlecut outer";
  if (label.includes("_x+") || label.includes("+")) return "cross-family";
  return null;
}

export function variantLabelToTitle(variant: Geometry2DCutTypologyOverlayVariant): string {
  if (variant.templateType === "cross" || variant.isCrossTemplate) {
    return `cross (x: ${rawVariantLabelToTitle(variant.xTemplate)}, y: ${rawVariantLabelToTitle(variant.yTemplate)})`;
  }

  if (variant.templateType === "starcut" && typeof variant.n === "number") {
    return `standardcut n=${variant.n}`;
  }
  return rawVariantLabelToTitle(variant.variantLabel);
}

function variantComplexityRank(variant: {
  templateType: string;
  variant: string;
  isCrossTemplate: boolean;
}) {
  if (variant.templateType === "starcut") return 0;
  if (variant.templateType === "circlecut") {
    return variant.variant === "inner" ? 1 : 2;
  }
  if (variant.templateType === "cross" || variant.isCrossTemplate) return 3;
  return 4;
}

export function rankVariantResults(a: Geometry2DCutTypologyVariantResult, b: Geometry2DCutTypologyVariantResult) {
  if (a.matchedCount !== b.matchedCount) return b.matchedCount - a.matchedCount;

  const complexityDiff = variantComplexityRank(a) - variantComplexityRank(b);
  if (complexityDiff !== 0) return complexityDiff;

  const nA = typeof a.n === "number" ? a.n : Number.MAX_SAFE_INTEGER;
  const nB = typeof b.n === "number" ? b.n : Number.MAX_SAFE_INTEGER;
  if (nA !== nB) return nA - nB;

  return a.variantLabel.localeCompare(b.variantLabel);
}

export function rankOverlayVariants(a: Geometry2DCutTypologyOverlayVariant, b: Geometry2DCutTypologyOverlayVariant) {
  const overlayGroupRank = (variant: {
    templateType: string;
    variant: string;
    isCrossTemplate: boolean;
  }) => {
    if (variant.templateType === "circlecut") return variant.variant === "inner" ? 0 : 1;
    if (variant.templateType === "starcut") return 2;
    if (variant.templateType === "cross" || variant.isCrossTemplate) return 3;
    return 4;
  };

  const groupDiff = overlayGroupRank(a) - overlayGroupRank(b);
  if (groupDiff !== 0) return groupDiff;

  const nA = typeof a.n === "number" ? a.n : Number.MAX_SAFE_INTEGER;
  const nB = typeof b.n === "number" ? b.n : Number.MAX_SAFE_INTEGER;
  if (nA !== nB) return nA - nB;

  return a.variantLabel.localeCompare(b.variantLabel);
}

export function estimateBossTotal(variant: Geometry2DCutTypologyVariantResult): number {
  if (variant.coverage > 0) {
    return Math.max(variant.matchedCount, Math.round(variant.matchedCount / variant.coverage));
  }
  return variant.matchedCount;
}

export function formatDecimalSix(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const raw = String(value).trim();
  if (!raw || raw.toLowerCase() === "none") return raw;
  const num = Number(raw);
  if (!Number.isFinite(num)) return raw;
  return num.toFixed(6);
}

export function formatUvPair(value: string | undefined): string {
  if (!value) return "";
  const raw = value.trim();
  if (!raw || raw.toLowerCase() === "none") return raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length >= 2) {
      return `[${formatDecimalSix(parsed[0])}, ${formatDecimalSix(parsed[1])}]`;
    }
    return raw;
  } catch {
    return raw;
  }
}

export function getMatchColumnClass(column: string): string {
  switch (column) {
    case "boss_id":
      return "w-[64px]";
    case "x_cut":
    case "y_cut":
      return "w-[132px]";
    case "boss_uv":
      return "w-[190px]";
    case "template_uv":
      return "w-[120px]";
    case "boss_xy":
    case "template_xy":
      return "w-[118px]";
    case "xy_error":
      return "w-[180px]";
    case "matched":
      return "w-[80px]";
    default:
      return "w-[120px]";
  }
}

export function normaliseMatchCsvRows(matchCsvRows: Array<Record<string, string>>): MatchCsvRow[] {
  return matchCsvRows.map((row) => {
    const xError = formatDecimalSix(row.x_error);
    const yError = formatDecimalSix(row.y_error);
    return {
      ...row,
      boss_uv: formatUvPair(row.boss_uv),
      xy_error:
        (!xError || xError.toLowerCase() === "none") && (!yError || yError.toLowerCase() === "none")
          ? "None"
          : `[${xError || "None"}, ${yError || "None"}]`,
    };
  });
}

export function parseXyErrorScore(value: string | undefined): number {
  if (!value || value.toLowerCase() === "none") return -1;
  const match = value.match(/\[\s*([^,\]]+)\s*,\s*([^\]]+)\s*\]/);
  if (!match) return -1;
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
  return Math.abs(x) + Math.abs(y);
}

export function getXyErrorSeverity(score: number): MatchErrorSeverity {
  if (score < 0) return { label: "N/A", className: "bg-muted/40 text-muted-foreground" };
  if (score > 0.01) return { label: "High", className: "bg-red-500/20 text-red-300" };
  if (score > 0.005) return { label: "Med", className: "bg-amber-500/20 text-amber-300" };
  return { label: "Low", className: "bg-emerald-500/20 text-emerald-300" };
}

function familyFromRow(row: MatchCsvRow): string {
  const xFamily = variantLabelToFamily(row.x_cut);
  const yFamily = variantLabelToFamily(row.y_cut);
  const variantFamily = variantLabelToFamily(row.variant_label);
  const familySet = new Set([xFamily, yFamily, variantFamily].filter((value): value is string => !!value));
  const familyValues = Array.from(familySet);
  return familyValues.length === 1 ? familyValues[0] : familyValues.length > 1 ? "hybrid" : "unresolved";
}

function detailLabelFromRow(row: MatchCsvRow, family: string): string {
  if (family === "hybrid") {
    return `${rawVariantLabelToTitle(row.x_cut)} x ${rawVariantLabelToTitle(row.y_cut)}`;
  }
  if (family === "unresolved") {
    return "unresolved";
  }
  return rawVariantLabelToTitle(row.variant_label || row.x_cut || row.y_cut);
}

export function buildPerBossTypologySummary(rows: MatchCsvRow[]): PerBossTypologySummary | null {
  if (rows.length === 0) return null;

  const familyCounts = new Map<string, number>();
  const detailCounts = new Map<string, number>();
  let matchedRows = 0;

  rows.forEach((row) => {
    const matched = String(row.matched || "").toLowerCase() === "true";
    if (!matched) return;
    matchedRows += 1;

    const family = familyFromRow(row);
    familyCounts.set(family, (familyCounts.get(family) || 0) + 1);

    const detailLabel = detailLabelFromRow(row, family);
    detailCounts.set(detailLabel, (detailCounts.get(detailLabel) || 0) + 1);
  });

  if (matchedRows === 0) return null;

  const dominantFamilyEntry = Array.from(familyCounts.entries()).sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  })[0];
  if (!dominantFamilyEntry) return null;

  const dominantFamily = dominantFamilyEntry[0];
  const dominantCount = dominantFamilyEntry[1];
  const dominantDetails = Array.from(detailCounts.entries())
    .filter(([detail]) => {
      if (dominantFamily === "standard starcut") return detail.startsWith("standardcut");
      if (dominantFamily === "circlecut inner") return detail === "circlecut inner";
      if (dominantFamily === "circlecut outer") return detail === "circlecut outer";
      if (dominantFamily === "cross-family") return detail.startsWith("cross");
      if (dominantFamily === "hybrid") return detail.includes(" x ");
      return detail === "unresolved";
    })
    .sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });

  const overlayLabels = Array.from(
    new Set(
      rows.flatMap((row) => {
        const matched = String(row.matched || "").toLowerCase() === "true";
        if (!matched || familyFromRow(row) !== dominantFamily) return [];
        const labels: string[] = [];
        if (row.x_cut) labels.push(row.x_cut);
        if (row.y_cut) labels.push(row.y_cut);
        if (row.variant_label && row.variant_label !== "None") labels.push(row.variant_label);
        return labels.filter((label) => {
          if (!label || label === "None") return false;
          if (dominantFamily === "standard starcut") return label.startsWith("starcut_n=");
          if (dominantFamily === "circlecut inner") return label === "circlecut_inner";
          if (dominantFamily === "circlecut outer") return label === "circlecut_outer";
          if (dominantFamily === "cross-family") return label.includes("_x+") || label.includes("+");
          return true;
        });
      })
    )
  ).sort((a, b) => a.localeCompare(b));

  return {
    dominantFamily,
    dominantCount,
    totalRows: rows.length,
    matchedRows,
    unmatchedRows: rows.length - matchedRows,
    details: dominantDetails.slice(0, 6),
    hasMixedDetails: dominantDetails.length > 1,
    overlayLabels,
  };
}

function matchPriority(label?: string): [number, number] {
  if (!label) return [3, 9999];
  if (label.startsWith("starcut_n=")) {
    const n = Number(label.split("=", 2)[1]);
    return [0, Number.isFinite(n) ? n : 9999];
  }
  if (label === "circlecut_inner") return [1, 0];
  if (label === "circlecut_outer") return [2, 0];
  return [3, 9999];
}

export function selectSimplestBossMatch(matches: Geometry2DCutTypologyBossMatch[]): Geometry2DCutTypologyBossMatch | null {
  if (matches.length === 0) return null;
  const sorted = [...matches].sort((a, b) => {
    const aPriority = matchPriority(a.variantLabel);
    const bPriority = matchPriority(b.variantLabel);
    if (aPriority[0] !== bPriority[0]) return aPriority[0] - bPriority[0];
    if (aPriority[1] !== bPriority[1]) return aPriority[1] - bPriority[1];
    const aError = Number(a.xError || 9999) + Number(a.yError || 9999);
    const bError = Number(b.xError || 9999) + Number(b.yError || 9999);
    return aError - bError;
  });
  return sorted[0] || null;
}

export function collectPrimaryReadingOverlayLabelsFromPerBoss(rows: Geometry2DCutTypologyBossResult[]): string[] {
  if (rows.length === 0) return [];

  const simplifiedRows: MatchCsvRow[] = rows.map((row) => {
    const simplest = selectSimplestBossMatch(row.matches || []);
    const variantLabel = simplest?.variantLabel || "None";
    const isCross = !!simplest?.isCrossTemplate;
    return {
      boss_id: String(row.id),
      variant_label: variantLabel,
      x_cut: isCross ? String(simplest?.xTemplate || "None") : variantLabel,
      y_cut: isCross ? String(simplest?.yTemplate || "None") : variantLabel,
      matched: simplest ? "true" : "false",
    };
  });

  return buildPerBossTypologySummary(simplifiedRows)?.overlayLabels || [];
}
