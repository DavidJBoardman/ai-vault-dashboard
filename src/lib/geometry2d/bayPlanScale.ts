/** Physical scale helpers for Step 4D bay-plan readouts (aligned with DXF export). */

export interface BayPlanPhysicalScale {
  metresPerPixel: number;
  /** Span of measured boss positions on the projection image. */
  nodeSpanMetres: { width: number; height: number } | null;
}

export interface BayPlanNodePosition {
  x: number;
  y: number;
}

export function formatMetres(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 100) return value.toFixed(1);
  if (value >= 10) return value.toFixed(2);
  return value.toFixed(decimals);
}

export function buildBayPlanPhysicalScale(
  metresPerPixel: number | null | undefined,
  nodes: ReadonlyArray<BayPlanNodePosition>
): BayPlanPhysicalScale | null {
  if (typeof metresPerPixel !== "number" || !Number.isFinite(metresPerPixel) || metresPerPixel <= 0) {
    return null;
  }

  const xs = nodes.map((node) => node.x).filter((value) => Number.isFinite(value));
  const ys = nodes.map((node) => node.y).filter((value) => Number.isFinite(value));
  let nodeSpanMetres: BayPlanPhysicalScale["nodeSpanMetres"] = null;
  if (xs.length > 0 && ys.length > 0) {
    nodeSpanMetres = {
      width: (Math.max(...xs) - Math.min(...xs)) * metresPerPixel,
      height: (Math.max(...ys) - Math.min(...ys)) * metresPerPixel,
    };
  }

  return { metresPerPixel, nodeSpanMetres };
}

export function ribEdgeListSignature(edges: ReadonlyArray<{ a: number; b: number }>): string {
  return edges
    .map((edge) => {
      const a = Math.min(edge.a, edge.b);
      const b = Math.max(edge.a, edge.b);
      return `${a}-${b}`;
    })
    .sort()
    .join("|");
}

export function ribLengthMetres(
  nodes: ReadonlyArray<BayPlanNodePosition>,
  edge: { a: number; b: number },
  metresPerPixel: number
): number | null {
  const start = nodes[edge.a];
  const end = nodes[edge.b];
  if (!start || !end) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthPx = Math.hypot(dx, dy);
  if (!Number.isFinite(lengthPx)) return null;
  return lengthPx * metresPerPixel;
}
