"use client";

import type { ReportData } from "@/lib/report/geometry2dReport";
import { CutTypologyMatchTable } from "@/components/geometry2d/stages/template/CutTypologyMatchTable";

export function CutTypologySection({ data }: { data: ReportData }) {
  const { rows, bossesTotal, bossesMatched, bossesPartial, variantsMatched } = data.cutTypology;
  const matchedPart = `${bossesMatched} matched`;
  const partialPart = bossesPartial > 0 ? `, ${bossesPartial} partial` : "";
  const unmatchedCount = bossesTotal - bossesMatched - bossesPartial;
  const unmatchedPart = unmatchedCount > 0 ? `, ${unmatchedCount} unmatched` : "";

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">Cut typology</h2>
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "Template matching has not been run."
            : `${matchedPart}${partialPart}${unmatchedPart} of ${bossesTotal} boss${bossesTotal === 1 ? "" : "es"} across ${variantsMatched} typology variant${variantsMatched === 1 ? "" : "s"}. The bundled CSV mirrors what is shown above.`}
        </p>
      </div>

      {rows.length > 0 && (
        <CutTypologyMatchTable
          matchCsvColumns={data.cutTypology.columns}
          matchCsvRows={rows}
          className="grid gap-3"
          tableViewportClassName="max-h-[560px]"
          variant="report"
          pageSize={10}
          showDownload={false}
        />
      )}
    </section>
  );
}
