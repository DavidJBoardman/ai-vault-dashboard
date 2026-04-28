"use client";

import type { ReportData } from "@/lib/report/geometry2dReport";
import { CutTypologyMatchTable } from "@/components/geometry2d/stages/template/CutTypologyMatchTable";

export function CutTypologySection({ data }: { data: ReportData }) {
  const { rows, bossesMatched, variantsMatched } = data.cutTypology;

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">Cut typology</h2>
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "Template matching has not been run."
            : `${bossesMatched} boss${bossesMatched === 1 ? "" : "es"} matched across ${variantsMatched} typology variant${variantsMatched === 1 ? "" : "s"}. This report view keeps the key matching evidence compact; the bundled CSV preserves the full original data.`}
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
