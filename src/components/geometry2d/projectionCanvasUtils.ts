export interface ReconstructionBossStyle {
  fill: string;
  stroke: string;
  label: string;
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
    return { fill: "#f472b6", stroke: "#ffffff", label: "Corner anchor" };
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
