export interface Step4DecoratedPoint {
  id: number;
  matchedTemplateX?: number | null;
  matchedTemplateY?: number | null;
  matchedVariantLabel?: string | null;
  matchedXTemplateLabel?: string | null;
  matchedYTemplateLabel?: string | null;
  matchedXError?: number | null;
  matchedYError?: number | null;
}

export type Step4MatchCsvRow = Record<string, string>;

export function formatTemplateLabel(raw?: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("starcut_n=")) {
    const n = Number(raw.split("=", 2)[1]);
    return Number.isFinite(n) ? `starcut n=${n}` : "starcut";
  }
  if (raw === "circlecut_inner") return "circlecut inner";
  if (raw === "circlecut_outer") return "circlecut outer";
  return raw;
}

export function parseOptionalMatchCsvValue(raw?: string | null): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value || value.toLowerCase() === "none") return null;
  return value;
}

export function parseMatchCsvPixelPair(raw?: string | null): [number, number] | null {
  const value = parseOptionalMatchCsvValue(raw);
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length < 2) return null;
    const x = Number(parsed[0]);
    const y = Number(parsed[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return [x, y];
  } catch {
    return null;
  }
}

function parseOptionalNumber(raw?: string | null): number | null {
  const value = parseOptionalMatchCsvValue(raw);
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isMatchedRow(row: Step4MatchCsvRow | undefined): boolean {
  return String(row?.matched || "").trim().toLowerCase() === "true";
}

export function decoratePointsWithMatchCsvRows<T extends Step4DecoratedPoint>(
  points: T[],
  rows: Step4MatchCsvRow[]
): Array<T & Step4DecoratedPoint> {
  const rowsByBossId = new Map<number, Step4MatchCsvRow>();
  for (const row of rows) {
    const bossId = Number(row.boss_id);
    if (Number.isFinite(bossId) && !rowsByBossId.has(bossId)) {
      rowsByBossId.set(bossId, row);
    }
  }

  return points.map((point) => {
    const row = rowsByBossId.get(point.id);
    const matched = isMatchedRow(row);
    const templatePixel = matched ? parseMatchCsvPixelPair(row?.template_xy) : null;
    return {
      ...point,
      matchedTemplateX: templatePixel ? Math.round(templatePixel[0]) : null,
      matchedTemplateY: templatePixel ? Math.round(templatePixel[1]) : null,
      matchedVariantLabel: matched ? parseOptionalMatchCsvValue(row?.variant_label) : null,
      matchedXTemplateLabel: formatTemplateLabel(parseOptionalMatchCsvValue(row?.x_cut)),
      matchedYTemplateLabel: formatTemplateLabel(parseOptionalMatchCsvValue(row?.y_cut)),
      matchedXError: parseOptionalNumber(row?.x_error),
      matchedYError: parseOptionalNumber(row?.y_error),
    };
  });
}
