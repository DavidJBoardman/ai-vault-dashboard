export interface ReconstructionBossStyle {
  fill: string;
  stroke: string;
  label: string;
}

/**
 * Derive a short identity tag for a reference point matching the segmentation
 * label suffix (e.g. "boss stone A" -> "A", corner "NW" -> "NW").
 */
export function getNodePointTag(point: { label?: string; id?: number; pointType?: string }): string {
  const raw = (point.label || "").trim();
  if (raw) {
    // Match 1–3 trailing letters so AA, AB, … (and any future fall-through
    // double-letter tags) extract correctly alongside single-letter A–Y.
    const alpha = raw.match(/\s+([A-Za-z]{1,3})$/);
    if (alpha) return alpha[1].toUpperCase();
    const num = raw.match(/#?(\d+)$/);
    if (num) return num[1];
    if (point.pointType === "corner") return raw.toUpperCase();
  }
  return point.id !== undefined ? String(point.id) : "";
}

// Number of decimals retained for any cut-typology table cell. Picked at 4
// because uv coordinates are ratios in [-1, 1] so ±0.00005 is well below the
// matching tolerance, but the rendered values stay legible.
export const CUT_TYPOLOGY_DECIMALS = 4;

export function formatCutTypologyValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (!str) return "";
  // Round any decimal token with more than CUT_TYPOLOGY_DECIMALS digits after
  // the point. Tokens that already fit (e.g. "0.5", "1.0") are left alone so
  // we don't artificially pad short values.
  return str.replace(/-?\d+\.\d+/g, (match) => {
    const decimals = match.split(".")[1]?.length ?? 0;
    if (decimals <= CUT_TYPOLOGY_DECIMALS) return match;
    const num = Number.parseFloat(match);
    if (!Number.isFinite(num)) return match;
    return num.toFixed(CUT_TYPOLOGY_DECIMALS);
  });
}

export function getCompactNodeLabel(label: string | number | null | undefined): string {
  const raw = String(label ?? "").trim();
  if (!raw) return "";
  const alpha = raw.match(/\s+([A-Za-z]{1,3})$/);
  if (alpha) return alpha[1].toUpperCase();
  const num = raw.match(/#?(\d+)$/);
  if (num) return num[1];
  return raw;
}

export interface DelaunayConstraintStyle {
  stroke: string;
  opacity: number;
  dash: string;
  label: string;
}

export function getReconstructionBossStyle(
  source: string,
  options: { idealisedView?: boolean } = {}
): ReconstructionBossStyle {
  const idealisedView = !!options.idealisedView;
  if (source === "anchor") {
    // Anchors are pinned to ROI corners; same cyan styling in both views.
    return { fill: "#ffffff", stroke: "#0ea5e9", label: "Corner anchor" };
  }
  if (source === "manual") {
    // Idealised view tints the fill violet to signal "this point is now
    // showing its idealised position" but keeps the amber ring so the user
    // can still see it was a manual node. The chip label gains an
    // "Idealised" qualifier so each chip is self-describing.
    return idealisedView
      ? { fill: "#c4b5fd", stroke: "#facc15", label: "Idealised manual node" }
      : { fill: "#facc15", stroke: "#78350f", label: "Manual node" };
  }
  if (source === "ideal") {
    // Explicit "ideal" source — legacy code paths before the measured-
    // precedence rewrite. Renders the same as a detected boss in idealised
    // view.
    return { fill: "#c4b5fd", stroke: "#6d28d9", label: "Idealised detected node" };
  }
  // Detected/raw/auto bosses.
  return idealisedView
    ? { fill: "#c4b5fd", stroke: "#6d28d9", label: "Idealised detected node" }
    : { fill: "#cbd5e1", stroke: "#334155", label: "Detected node" };
}

export function getDelaunayConstraintStyle(family?: string | null): DelaunayConstraintStyle {
  const families = String(family || "")
    .split("+")
    .map((value) => value.trim())
    .filter(Boolean);

  if (families.length > 1) {
    return {
      stroke: "#f8fafc",
      opacity: 0.9,
      dash: "none",
      label: "Shared constraint",
    };
  }
  if (families[0] === "cross") {
    return {
      stroke: "#f472b6",
      opacity: 0.88,
      dash: "8 4",
      label: "Cross constraint",
    };
  }
  if (families[0] === "half_line") {
    return {
      stroke: "#a3e635",
      opacity: 0.88,
      dash: "10 5",
      label: "Half-line constraint",
    };
  }
  return {
    stroke: "#fbbf24",
    opacity: 0.88,
    dash: "none",
    label: "ROI constraint",
  };
}


export interface ResidualSummary {
  meanPercent: number;
  maxPercent: number;
  sampleCount: number;
}

export function computeResidualSummary(
  bosses: ReadonlyArray<{
    matched?: boolean | null;
    matchedXError?: number | null;
    matchedYError?: number | null;
  }>
): ResidualSummary | null {
  const residuals: number[] = [];
  for (const boss of bosses) {
    if (boss.matched !== true) continue;
    const xErr = typeof boss.matchedXError === "number" && Number.isFinite(boss.matchedXError) ? boss.matchedXError : null;
    const yErr = typeof boss.matchedYError === "number" && Number.isFinite(boss.matchedYError) ? boss.matchedYError : null;
    if (xErr === null || yErr === null) continue;
    residuals.push(Math.hypot(xErr, yErr));
  }
  if (residuals.length === 0) return null;
  const sum = residuals.reduce((acc, v) => acc + v, 0);
  return {
    meanPercent: (sum / residuals.length) * 100,
    maxPercent: Math.max(...residuals) * 100,
    sampleCount: residuals.length,
  };
}
