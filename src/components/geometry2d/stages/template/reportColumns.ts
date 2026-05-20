// Report-variant column set, ordered as "identity → axis hits → measurement →
// residual → status". template_uv is dropped because it is exactly
// [x_ratio, y_ratio] when both axes hit and "None" otherwise — the two ratio
// columns carry the same information and additionally preserve the partial
// match state. x_error / y_error are dropped because uv_error already combines
// them. The diagnostic variant still exposes every column via the picker.
export const REPORT_COLUMNS = [
  "boss_id",
  "point_label",
  "point_type",
  "x_cut",
  "y_cut",
  "x_ratio",
  "y_ratio",
  "boss_uv",
  "uv_error",
  "matched",
] as const;

export function filterReportColumns(available: string[]): string[] {
  const set = new Set(available);
  // uv_error is always shown in the report view because it carries the headline
  // matching error even when the column is missing from older CSVs.
  return REPORT_COLUMNS.filter((col) => col === "uv_error" || set.has(col));
}
