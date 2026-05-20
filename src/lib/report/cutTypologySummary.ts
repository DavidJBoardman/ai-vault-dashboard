export interface CutTypologySummary {
  bossesTotal: number;
  bossesMatched: number;
  bossesPartial: number;
  variantsMatched: number;
}

function isTruthyCsvValue(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function isBossRow(row: Record<string, string>): boolean {
  return String(row["point_type"] ?? "").trim().toLowerCase() === "boss";
}

function rowMatchState(row: Record<string, string>): "matched" | "partial" | "unmatched" {
  const explicit = String(row["match_state"] ?? "").trim().toLowerCase();
  if (explicit === "matched" || explicit === "partial" || explicit === "unmatched") {
    return explicit;
  }
  if (isTruthyCsvValue(row["matched"])) return "matched";
  const hasX = String(row["x_cut"] ?? "").trim().toLowerCase() !== "none" && row["x_cut"] !== "";
  const hasY = String(row["y_cut"] ?? "").trim().toLowerCase() !== "none" && row["y_cut"] !== "";
  return hasX || hasY ? "partial" : "unmatched";
}

export function summariseCutTypologyRows(rows: Array<Record<string, string>>): CutTypologySummary {
  const bossRows = rows.filter(isBossRow);
  const matchedBossRows = bossRows.filter((row) => rowMatchState(row) === "matched");
  const partialBossRows = bossRows.filter((row) => rowMatchState(row) === "partial");
  const ignoredVariantLabels = new Set(["", "none", "n/a", "na", "roi_corner", "unmatched"]);
  const variantsMatched = new Set(
    matchedBossRows
      .map((row) => row["variant_label"] ?? row["matchedVariantLabel"] ?? row["matched_variant_label"] ?? "")
      .map((value) => String(value).trim().toLowerCase())
      .filter((value) => !ignoredVariantLabels.has(value))
  ).size;

  return {
    bossesTotal: bossRows.length,
    bossesMatched: matchedBossRows.length,
    bossesPartial: partialBossRows.length,
    variantsMatched,
  };
}
