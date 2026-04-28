import { Card, CardContent } from "@/components/ui/card";
import type { ReportData } from "@/lib/report/geometry2dReport";

const NEAR_EQUIVALENT_TOL = 0.005;

function fmt(n: number, d = 4): string {
  return Number.isFinite(n) ? n.toFixed(d) : "n/a";
}

export function BayProportionSection({ data }: { data: ReportData }) {
  const { measured, best, candidates } = data.bayProportion;
  const nearEquivalent = candidates.filter(
    (c) => c.rank !== 1 && c.deltaFromBest <= NEAR_EQUIVALENT_TOL
  );

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">§2 Bay proportion</h2>
        <p className="text-sm text-muted-foreground">
          Measured ROI ratio (W/H) compared against canonical mediaeval planning ratios.
        </p>
      </div>

      {best ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Best match</p>
            <p className="mt-1 font-display text-2xl font-semibold text-primary">{best.label}</p>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm tabular-nums">
              <div>
                <span className="text-muted-foreground">Measured ratio: </span>
                <span className="font-medium">{measured != null ? fmt(measured) : "n/a"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Error: </span>
                <span className="font-medium">{fmt(best.err)}</span>
              </div>
            </div>
            {nearEquivalent.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Near-equivalent within Δ ≤ {NEAR_EQUIVALENT_TOL.toFixed(3)}:{" "}
                {nearEquivalent
                  .map((c) => `${c.label} (Δ ${fmt(c.deltaFromBest)})`)
                  .join(", ")}
                .
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          ROI bay-proportion analysis has not been run.
        </p>
      )}

      {candidates.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Rank</th>
                <th className="px-3 py-2 font-medium">Canonical ratio</th>
                <th className="px-3 py-2 text-right font-medium">Error</th>
                <th className="px-3 py-2 text-right font-medium">Δ from best</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c, i) => {
                const isNear = c.rank !== 1 && c.deltaFromBest <= NEAR_EQUIVALENT_TOL;
                return (
                  <tr key={c.label} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                    <td className="px-3 py-2 tabular-nums">{c.rank}</td>
                    <td className="px-3 py-2">{c.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(c.err)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.rank === 1 ? (
                        "—"
                      ) : (
                        <>
                          {fmt(c.deltaFromBest)}
                          {isNear && (
                            <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                              near
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
