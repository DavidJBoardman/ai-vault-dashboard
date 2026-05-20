export const REPORT_COLUMNS = [
  "boss_id",
  "point_label",
  "point_type",
  "x_cut",
  "y_cut",
  "boss_uv",
  "template_uv",
  "uv_error",
  "matched",
] as const;

export function filterReportColumns(available: string[]): string[] {
  const set = new Set(available);
  // uv_error is always shown in the report view because it carries the headline
  // matching error even when the column is missing from older CSVs.
  return REPORT_COLUMNS.filter((col) => col === "uv_error" || set.has(col));
}
