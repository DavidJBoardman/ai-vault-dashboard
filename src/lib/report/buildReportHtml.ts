import { formatCutTypologyValue, getCompactNodeLabel } from "@/components/geometry2d/projectionCanvasUtils";
import { filterReportColumns } from "@/components/geometry2d/stages/template/reportColumns";
import packageJson from "../../../package.json";
import type { ReportData } from "./geometry2dReport";

const NEAR_EQUIVALENT_TOL = 0.005;
const HIGH_ERROR_TOL = 0.005;

function escape(value: unknown): string {
  return String(value ?? "").replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] || c)
  );
}

function fmt(n: number | null | undefined, d = 4): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(d) : "n/a";
}

function parseUvError(value: string | undefined): number {
  if (!value) return Number.NaN;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

function renderHeader(data: ReportData): string {
  return `
<header class="vr-header">
  <h1>${escape(data.projectName || "Untitled project")}</h1>
  <dl class="vr-meta">
    <div><dt>Project ID</dt><dd class="mono">${escape(data.projectId)}</dd></div>
    <div><dt>Projection</dt><dd>${escape(data.projectionName || "—")}</dd></div>
    <div><dt>Generated</dt><dd>${escape(new Date(data.generatedAt).toLocaleString())}</dd></div>
  </dl>
</header>`;
}

function renderBayPlan(data: ReportData, bayPlanFilename: string | null): string {
  const nodeCount = data.reconstruct.nodes.length || data.referencePoints.length;
  const edgeCount = data.reconstruct.edges.length;
  if (!bayPlanFilename || nodeCount === 0) {
    return `
<section class="vr-section">
  <h2>Bay plan</h2>
  <p class="vr-muted">No reconstructed plan available.</p>
</section>`;
  }
  return `
<section class="vr-section">
  <h2>Bay plan</h2>
  <p class="vr-muted">Reconstructed ribs over the projection, oriented to the saved ROI.</p>
  <figure class="vr-figure">
    <img src="${escape(bayPlanFilename)}" alt="Bay plan preview" />
    <figcaption>${nodeCount} nodes · ${edgeCount} ribs</figcaption>
  </figure>
</section>`;
}

function renderBayProportion(data: ReportData): string {
  const { measured, best, candidates } = data.bayProportion;
  if (!best) {
    return `
<section class="vr-section">
  <h2>Bay proportion</h2>
  <p class="vr-muted">ROI bay-proportion analysis has not been run.</p>
</section>`;
  }

  const nearEquivalent = candidates.filter(
    (c) => c.rank !== 1 && c.deltaFromBest <= NEAR_EQUIVALENT_TOL
  );

  const candidateRows = candidates
    .map((c) => {
      const isNear = c.rank !== 1 && c.deltaFromBest <= NEAR_EQUIVALENT_TOL;
      const delta =
        c.rank === 1
          ? "—"
          : `${fmt(c.deltaFromBest)}${isNear ? ' <span class="vr-tag">near</span>' : ""}`;
      return `<tr><td class="num">${c.rank}</td><td>${escape(c.label)}</td><td class="num">${fmt(c.err)}</td><td class="num">${delta}</td></tr>`;
    })
    .join("");

  return `
<section class="vr-section">
  <h2>Bay proportion</h2>
  <p class="vr-muted">Measured ROI ratio (W/H) compared against canonical mediaeval planning ratios.</p>
  <div class="vr-card">
    <p class="vr-card-eyebrow">Best match</p>
    <p class="vr-card-headline">${escape(best.label)}</p>
    <div class="vr-card-grid">
      <div><span class="vr-muted">Measured ratio:</span> <strong>${measured != null ? fmt(measured) : "n/a"}</strong></div>
      <div><span class="vr-muted">Error:</span> <strong>${fmt(best.err)}</strong></div>
    </div>
    ${
      nearEquivalent.length > 0
        ? `<p class="vr-card-foot">Near-equivalent within Δ ≤ ${NEAR_EQUIVALENT_TOL.toFixed(3)}: ${escape(nearEquivalent.map((c) => `${c.label} (Δ ${fmt(c.deltaFromBest)})`).join(", "))}.</p>`
        : ""
    }
  </div>
  <table class="vr-table">
    <thead><tr><th class="num">Rank</th><th>Canonical ratio</th><th class="num">Error</th><th class="num">Δ from best</th></tr></thead>
    <tbody>${candidateRows}</tbody>
  </table>
</section>`;
}

function renderCutTypology(data: ReportData): string {
  const { columns, rows, bossesTotal, bossesMatched, bossesPartial, variantsMatched } = data.cutTypology;
  if (rows.length === 0 || columns.length === 0) {
    return `
<section class="vr-section">
  <h2>Cut typology</h2>
  <p class="vr-muted">Template matching has not been run.</p>
</section>`;
  }

  const matchedPart = `${bossesMatched} matched`;
  const partialPart = bossesPartial > 0 ? `, ${bossesPartial} partial` : "";
  const unmatchedCount = bossesTotal - bossesMatched - bossesPartial;
  const unmatchedPart = unmatchedCount > 0 ? `, ${unmatchedCount} unmatched` : "";

  // Mirror the on-screen Step 8 view: the 4C match table's "report" variant
  // shows only the REPORT_COLUMNS subset, so the printable HTML uses the same
  // filter to stay in sync.
  const reportColumns = filterReportColumns(columns);

  const numericCols = new Set(
    reportColumns.filter((col) =>
      rows.some((row) => {
        const raw = row[col];
        if (raw == null || raw === "") return false;
        return Number.isFinite(Number.parseFloat(String(raw)));
      })
    )
  );

  const headerCells = reportColumns
    .map((col) => `<th${numericCols.has(col) ? ' class="num"' : ""}>${escape(col)}</th>`)
    .join("");

  const bodyRows = rows
    .map((row) => {
      const cells = reportColumns
        .map((col) => {
          const raw = row[col] ?? "";
          if (col === "matched" || col === "match_state") {
            const explicit = String(row.match_state ?? "").trim().toLowerCase();
            const matchedFlag = String(row.matched ?? "").trim().toLowerCase() === "true";
            const hasX = String(row.x_cut ?? "").trim().toLowerCase() !== "none" && (row.x_cut ?? "") !== "";
            const hasY = String(row.y_cut ?? "").trim().toLowerCase() !== "none" && (row.y_cut ?? "") !== "";
            const state = (explicit === "matched" || explicit === "partial" || explicit === "unmatched")
              ? explicit
              : matchedFlag
                ? "matched"
                : (hasX || hasY)
                  ? "partial"
                  : "unmatched";
            const cls = state === "matched" ? "vr-pill-ok" : state === "partial" ? "vr-pill-warn" : "vr-pill-bad";
            const label = state.charAt(0).toUpperCase() + state.slice(1);
            return `<td><span class="vr-pill ${cls}">${label}</span></td>`;
          }
          if (col === "point_label") {
            const compact = getCompactNodeLabel(row.point_label || row.boss_id);
            return `<td>${escape(compact || raw)}</td>`;
          }
          if (col === "uv_error") {
            const score = parseUvError(String(raw));
            const cls = Number.isFinite(score) && score > HIGH_ERROR_TOL ? "vr-num vr-error-high" : "vr-num";
            return `<td class="${cls}">${escape(formatCutTypologyValue(raw))}</td>`;
          }
          const cls = numericCols.has(col) ? "vr-num" : "";
          return `<td class="${cls}">${escape(formatCutTypologyValue(raw))}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
<section class="vr-section">
  <h2>Cut typology</h2>
  <p class="vr-muted">${matchedPart}${partialPart}${unmatchedPart} of ${bossesTotal} boss${bossesTotal === 1 ? "" : "es"} across ${variantsMatched} typology variant${variantsMatched === 1 ? "" : "s"}.</p>
  <table class="vr-table vr-table-compact">
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</section>`;
}

function renderFooter(data: ReportData): string {
  return `
<footer class="vr-footer">
  Generated by Vault Analyser v${escape(packageJson.version)} · ${escape(new Date(data.generatedAt).toLocaleString())}
</footer>`;
}

const STYLES = `
:root {
  --ink: #111827;
  --ink-muted: #6b7280;
  --line: #e5e7eb;
  --line-soft: #f1f5f9;
  --bg: #ffffff;
  --bg-soft: #f9fafb;
  --accent: #1d4ed8;
  --accent-soft: #eff6ff;
  --ok: #047857;
  --ok-soft: #ecfdf5;
  --bad: #b91c1c;
  --bad-soft: #fef2f2;
  --warn: #b45309;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--ink);
  background: var(--bg);
}
.vr-doc {
  max-width: 960px;
  margin: 2rem auto;
  padding: 0 1.75rem 3rem;
}
h1, h2 { font-family: Georgia, "Times New Roman", serif; font-weight: 600; color: var(--ink); }
h1 { font-size: 1.875rem; margin: 0 0 .25rem; letter-spacing: -0.01em; }
h2 { font-size: 1.25rem; margin: 0 0 .5rem; }
p { margin: .25rem 0; }

.vr-header { padding-bottom: 1.25rem; border-bottom: 1px solid var(--line); margin-bottom: 1.75rem; }
.vr-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: .5rem 1.5rem; margin: .75rem 0 0; padding: 0; }
.vr-meta div { display: flex; flex-wrap: wrap; gap: .5rem; align-items: baseline; }
.vr-meta dt { font-weight: 600; color: var(--ink); margin: 0; }
.vr-meta dd { margin: 0; color: var(--ink-muted); }
.mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: .8em; }

.vr-section { margin: 2rem 0; page-break-inside: avoid; }
.vr-section + .vr-section { border-top: 1px solid var(--line-soft); padding-top: 1.5rem; }
.vr-muted { color: var(--ink-muted); font-size: .9rem; margin: .25rem 0 1rem; }

.vr-figure { margin: 1rem 0 0; text-align: center; }
.vr-figure img { max-width: 100%; max-height: 520px; height: auto; border: 1px solid var(--line); border-radius: 6px; background: #000; }
.vr-figure figcaption { color: var(--ink-muted); font-size: .8rem; margin-top: .5rem; }

.vr-card {
  border: 1px solid var(--accent);
  background: var(--accent-soft);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin: 0 0 1rem;
}
.vr-card-eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: .7rem; color: var(--ink-muted); margin: 0; }
.vr-card-headline { font-family: Georgia, serif; font-size: 1.5rem; font-weight: 600; color: var(--accent); margin: .25rem 0 .75rem; }
.vr-card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .25rem 1.5rem; font-variant-numeric: tabular-nums; }
.vr-card-foot { margin-top: .75rem; font-size: .8rem; color: var(--ink-muted); }

.vr-table { width: 100%; border-collapse: collapse; margin: .5rem 0 0; font-size: .9rem; }
.vr-table th, .vr-table td { padding: .5rem .75rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.vr-table th { background: var(--bg-soft); font-weight: 600; font-size: .8rem; }
.vr-table tbody tr:nth-child(even) { background: var(--bg-soft); }
.vr-table th.num, .vr-table td.num, .vr-num { text-align: right; font-variant-numeric: tabular-nums; }
.vr-table-compact th, .vr-table-compact td { padding: .35rem .6rem; font-size: .82rem; }

.vr-tag {
  display: inline-block;
  margin-left: .35rem;
  padding: .05rem .4rem;
  border-radius: 3px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: .65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  vertical-align: middle;
}

.vr-pill {
  display: inline-block;
  padding: .1rem .5rem;
  border-radius: 999px;
  font-size: .7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
}
.vr-pill-ok { background: var(--ok-soft); color: var(--ok); }
.vr-pill-warn { background: #fffbeb; color: var(--warn); }
.vr-pill-bad { background: var(--bad-soft); color: var(--bad); }
.vr-error-high { color: var(--warn); font-weight: 600; }

.vr-footer {
  margin-top: 2.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
  text-align: center;
  font-size: .75rem;
  color: var(--ink-muted);
}

@media print {
  body { font-size: 12px; }
  .vr-doc { margin: 0; padding: 0 1rem; max-width: none; }
  .vr-section { page-break-inside: avoid; }
  .vr-figure img { max-height: 420px; }
}
`;

export function buildReportHtml(data: ReportData, bayPlanFilename: string | null): string {
  const title = `${data.projectName || "Vault Analyser"} — 2D report`;
  const body = [
    renderHeader(data),
    renderBayPlan(data, bayPlanFilename),
    renderBayProportion(data),
    renderCutTypology(data),
    renderFooter(data),
  ].join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<main class="vr-doc">${body}</main>
</body>
</html>`;
}
