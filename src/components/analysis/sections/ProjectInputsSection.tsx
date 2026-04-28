import type { ReportData } from "@/lib/report/geometry2dReport";

function fmtPx(n: number): string {
  return Number.isFinite(n) ? `${Math.round(n)} px` : "n/a";
}

export function ProjectInputsSection({ data }: { data: ReportData }) {
  const { inputs } = data;

  const rows: Array<{ label: string; value: string }> = [
    { label: "Projection resolution", value: `${inputs.resolution} px` },
    {
      label: "ROI size",
      value: inputs.roiPx
        ? `${fmtPx(inputs.roiPx.width)} × ${fmtPx(inputs.roiPx.height)}`
        : "not set",
    },
    {
      label: "ROI rotation",
      value: inputs.roiPx ? `${inputs.roiPx.rotation.toFixed(1)}°` : "n/a",
    },
    { label: "Reference points", value: String(inputs.pointCount) },
    { label: "Bosses", value: String(inputs.bossCount) },
    {
      label: "Matching threshold",
      value: inputs.matchingThreshold ?? "default",
    },
  ];

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">§1 Project &amp; inputs</h2>
        <p className="text-sm text-muted-foreground">
          Snapshot of the projection and ROI used to generate this report.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <dl className="grid grid-cols-1 sm:grid-cols-2">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`flex items-center justify-between gap-4 px-4 py-2 text-sm ${
                i % 2 === 0 ? "bg-muted/20" : ""
              }`}
            >
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="font-medium tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
