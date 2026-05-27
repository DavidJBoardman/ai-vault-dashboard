"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import type { Geometry2DCutTypologyReading } from "@/lib/api";
import type { CutTypologyReadingSummary, PerBossTypologySummary } from "./cutTypologyMatchingUtils";

function readingLabel(reading: Geometry2DCutTypologyReading): string {
  if (reading === "starcut") return "starcut";
  if (reading === "circlecut_inner") return "circlecut inner";
  if (reading === "circlecut_outer") return "circlecut outer";
  return "mixed (per-boss)";
}

interface CutTypologyReadingBlockProps {
  readingSummary: CutTypologyReadingSummary | null;
  perBossSummary: PerBossTypologySummary | null;
  onSelectReading: (reading: Geometry2DCutTypologyReading) => void;
}

export function CutTypologyReadingBlock({
  readingSummary,
  perBossSummary,
  onSelectReading,
}: CutTypologyReadingBlockProps) {
  const details = useMemo(
    () => readingSummary?.details ?? perBossSummary?.details ?? [],
    [readingSummary, perBossSummary],
  );
  const maxDetailCount = useMemo(() => {
    const counts = details.map(([, count]) => count);
    return Math.max(...(counts.length ? counts : [1]));
  }, [details]);

  if (!readingSummary && !perBossSummary) return null;

  const headlineLabel = readingSummary ? readingLabel(readingSummary.reading) : perBossSummary?.dominantFamily;
  const matchedRows = readingSummary?.matchedRows ?? perBossSummary?.matchedRows ?? 0;
  const totalRows = readingSummary?.totalRows ?? perBossSummary?.totalRows ?? 0;

  return (
    <div className="rounded-md border border-border bg-card/40 p-4 space-y-3">
      {/* Headline = the selected/recommended reading, shown once. */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xl font-semibold leading-none truncate">{headlineLabel}</p>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {matchedRows}/{totalRows}
        </span>
      </div>

      {readingSummary ? (
        <div className="space-y-1">
          {readingSummary.options.map((opt) => {
            const checked = opt.reading === readingSummary.reading;
            return (
              <label
                key={opt.reading}
                className="flex items-center justify-between gap-3 cursor-pointer rounded-md px-2 py-1.5 hover:bg-background/40"
              >
                <span className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="cut-typology-reading"
                    checked={checked}
                    onChange={() => onSelectReading(opt.reading)}
                    className="accent-amber-400"
                  />
                  <span className={checked ? "font-medium text-foreground" : "text-foreground/80"}>
                    {readingLabel(opt.reading)}
                  </span>
                  {opt.reading === readingSummary.recommended ? (
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">recommended</Badge>
                  ) : null}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {opt.matched}/{opt.total}
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      {details.length > 0 ? (
        <div className="space-y-2 border-t border-border/70 pt-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Matched node cuts</p>
          <div className="space-y-2">
            {details.map(([detail, count]) => (
              <div key={`${detail}-${count}`} className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-medium text-foreground">{detail}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-background/70 ring-1 ring-border/60">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#f7a600_0%,#ffd166_100%)]"
                      style={{ width: `${Math.max((count / maxDetailCount) * 100, 10)}%` }}
                    />
                  </div>
                </div>
                <div className="text-right text-sm font-semibold tabular-nums text-foreground">{count}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
