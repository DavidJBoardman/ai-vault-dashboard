"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReportData } from "@/lib/report/geometry2dReport";

const PAGE_SIZE = 10;

export function CutTypologySection({ data }: { data: ReportData }) {
  const { columns, rows, bossesMatched, variantsMatched } = data.cutTypology;
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">§3 Cut typology</h2>
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "Template matching has not been run."
            : `${bossesMatched} boss${bossesMatched === 1 ? "" : "es"} matched across ${variantsMatched} typology variant${variantsMatched === 1 ? "" : "s"}.`}
        </p>
      </div>

      {rows.length > 0 && columns.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="px-3 py-2 font-medium">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Screen mode: paginated slice */}
                {slice.map((row, i) => (
                  <tr
                    key={`screen-${page}-${i}`}
                    className={`screen-only ${i % 2 === 0 ? "bg-muted/20" : ""}`}
                  >
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-2 tabular-nums">
                        {row[col] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Print mode: all rows */}
                {rows.map((row, i) => (
                  <tr
                    key={`print-${i}`}
                    className={`print-only ${i % 2 === 0 ? "bg-muted/20" : ""}`}
                  >
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-2 tabular-nums">
                        {row[col] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="screen-only flex items-center justify-end gap-2 text-sm print:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Prev
              </Button>
              <span className="tabular-nums text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
