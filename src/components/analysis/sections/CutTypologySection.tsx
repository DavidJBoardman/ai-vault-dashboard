"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReportData } from "@/lib/report/geometry2dReport";

const PAGE_SIZE = 10;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const DISPLAY_COLUMNS: Array<{ key: string; label: string; align?: "left" | "right" }> = [
  { key: "boss_id", label: "ID" },
  { key: "display_label", label: "Label" },
  { key: "variant_label", label: "Variant" },
  { key: "x_error", label: "x error", align: "right" },
  { key: "y_error", label: "y error", align: "right" },
  { key: "matched", label: "Matched" },
];

function fmtError(raw: string | undefined): string {
  if (raw == null || raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n.toFixed(4) : raw;
}

function fmtMatched(raw: string | undefined): string {
  if (raw == null) return "";
  const v = raw.toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return "Yes";
  if (v === "false" || v === "0" || v === "no") return "No";
  return raw;
}

export function CutTypologySection({ data }: { data: ReportData }) {
  const { rows, bossesMatched, variantsMatched } = data.cutTypology;
  const [page, setPage] = useState(0);

  const displayRows = useMemo(() => {
    let bossIndex = 0;
    return rows.map((r) => {
      const isBoss = (r["point_type"] ?? "") === "boss";
      const displayLabel = isBoss
        ? `Boss ${LETTERS[bossIndex++] ?? `#${bossIndex}`}`
        : r["point_label"] ?? "";
      return {
        ...r,
        display_label: displayLabel,
        x_error: fmtError(r["x_error"]),
        y_error: fmtError(r["y_error"]),
        matched: fmtMatched(r["matched"]),
      };
    });
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const slice = displayRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">§3 Cut typology</h2>
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "Template matching has not been run."
            : `${bossesMatched} boss${bossesMatched === 1 ? "" : "es"} matched across ${variantsMatched} typology variant${variantsMatched === 1 ? "" : "s"}. Bosses re-lettered for display; the bundled CSV preserves original labels.`}
        </p>
      </div>

      {displayRows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  {DISPLAY_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`px-3 py-2 font-medium ${col.align === "right" ? "text-right" : ""}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((row, i) => (
                  <tr
                    key={`screen-${page}-${i}`}
                    className={`screen-only ${i % 2 === 0 ? "bg-muted/20" : ""}`}
                  >
                    {DISPLAY_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-2 tabular-nums ${col.align === "right" ? "text-right" : ""}`}
                      >
                        {row[col.key] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
                {displayRows.map((row, i) => (
                  <tr
                    key={`print-${i}`}
                    className={`print-only ${i % 2 === 0 ? "bg-muted/20" : ""}`}
                  >
                    {DISPLAY_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-2 tabular-nums ${col.align === "right" ? "text-right" : ""}`}
                      >
                        {row[col.key] ?? ""}
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
