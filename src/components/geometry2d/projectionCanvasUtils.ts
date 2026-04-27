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

export function getReconstructionBossStyle(source: string): ReconstructionBossStyle {
  if (source === "ideal") {
    return { fill: "#ffffff", stroke: "#0ea5e9", label: "Ideal match" };
  }
  if (source === "anchor") {
    // Match the cyan styling used for corner reference points in steps 4B / 4C
    // so the same four nodes look consistent across the workflow.
    return { fill: "#ffffff", stroke: "#0ea5e9", label: "Corner anchor" };
  }
  if (source === "manual") {
    return { fill: "#facc15", stroke: "#78350f", label: "Manual node" };
  }
  return { fill: "#cbd5e1", stroke: "#334155", label: "Detected node" };
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
