/**
 * Shared utilities for exporting best-fit arc curves as Wavefront OBJ files.
 * Used by both Step 7 (Measurements) and Step 8 (Analysis).
 */

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface ArcParams {
  center: Point3D;
  radius: number;
  startAngle: number;
  endAngle: number;
  u: Point3D;
  v: Point3D;
}

export interface ArcLine {
  id: string;
  label: string;
  points: Point3D[];
  arc?: ArcParams;
}

export interface ArcFitData {
  segmentPoints: Point3D[];
  arcCenter: Point3D;
  arcRadius: number;
  ribLength: number;
  arcBasisU?: Point3D;
  arcBasisV?: Point3D;
  arcStartAngle?: number;
  arcEndAngle?: number;
}

/** Number of segments used when sampling a best-fit arc into an OBJ polyline. */
export const ARC_OBJ_SAMPLES = 128;

/**
 * Ratio of radius-to-rib-length above which the arc is considered a straight
 * line (sagitta < 1.25% of rib length — visually imperceptible curvature).
 */
const STRAIGHT_LINE_RATIO = 10;

export function hasDisplayableRadius(
  r: number | undefined | null,
  ribLength?: number | null,
): r is number {
  if (r == null || r <= 0) return false;
  const threshold =
    ribLength != null && ribLength > 0 ? STRAIGHT_LINE_RATIO * ribLength : 500;
  return r <= threshold;
}

/** Sanitize a rib name into a Wavefront-safe object name. */
export function safeObjName(name: string): string {
  return name.trim().replace(/[^\w.-]+/g, "_") || "arc";
}

/**
 * Build the list of `ArcLine` objects for a single rib from arc-fit data.
 * Handles the backend arc frame, the client-side fallback, and the
 * straight-rib "Ideal Line" case.
 */
export function buildArcLinesFromFit(
  traceId: string,
  data: ArcFitData,
): ArcLine[] {
  const { segmentPoints, arcCenter, arcRadius, ribLength, arcBasisU, arcBasisV, arcStartAngle, arcEndAngle } = data;

  if (segmentPoints.length < 2 || !arcCenter || arcRadius <= 0) return [];

  if (!hasDisplayableRadius(arcRadius, ribLength)) {
    return [{
      id: `${traceId}-ideal-line`,
      label: "Ideal Line",
      points: [segmentPoints[0], segmentPoints[segmentPoints.length - 1]],
    }];
  }

  if (segmentPoints.length < 3) return [];

  const hasBackendArcFrame =
    !!arcBasisU &&
    !!arcBasisV &&
    Number.isFinite(arcStartAngle) &&
    Number.isFinite(arcEndAngle);

  let u: Point3D;
  let v: Point3D;
  let startAngle: number;
  let endAngle: number;

  if (hasBackendArcFrame) {
    u = arcBasisU!;
    v = arcBasisV!;
    startAngle = arcStartAngle as number;
    endAngle = arcEndAngle as number;
  } else {
    const pStart = segmentPoints[0];
    const pMid = segmentPoints[Math.floor(segmentPoints.length / 2)];
    const pEnd = segmentPoints[segmentPoints.length - 1];

    const v1 = { x: pMid.x - pStart.x, y: pMid.y - pStart.y, z: pMid.z - pStart.z };
    const v2 = { x: pEnd.x - pStart.x, y: pEnd.y - pStart.y, z: pEnd.z - pStart.z };

    let normal = {
      x: v1.y * v2.z - v1.z * v2.y,
      y: v1.z * v2.x - v1.x * v2.z,
      z: v1.x * v2.y - v1.y * v2.x,
    };
    const normalLen = Math.hypot(normal.x, normal.y, normal.z);
    if (normalLen === 0) return [];
    normal = { x: normal.x / normalLen, y: normal.y / normalLen, z: normal.z / normalLen };

    const firstVec = { x: pStart.x - arcCenter.x, y: pStart.y - arcCenter.y, z: pStart.z - arcCenter.z };
    const uLen = Math.hypot(firstVec.x, firstVec.y, firstVec.z);
    if (uLen === 0) return [];
    u = { x: firstVec.x / uLen, y: firstVec.y / uLen, z: firstVec.z / uLen };
    v = {
      x: normal.y * u.z - normal.z * u.y,
      y: normal.z * u.x - normal.x * u.z,
      z: normal.x * u.y - normal.y * u.x,
    };

    const angles = segmentPoints.map((p) => {
      const vec = { x: p.x - arcCenter.x, y: p.y - arcCenter.y, z: p.z - arcCenter.z };
      return Math.atan2(vec.x * v.x + vec.y * v.y + vec.z * v.z, vec.x * u.x + vec.y * u.y + vec.z * u.z);
    });

    const unwrapped: number[] = [angles[0]];
    for (let i = 1; i < angles.length; i++) {
      let next = angles[i];
      const prev = unwrapped[i - 1];
      while (next - prev > Math.PI) next -= 2 * Math.PI;
      while (next - prev < -Math.PI) next += 2 * Math.PI;
      unwrapped.push(next);
    }
    startAngle = unwrapped[0];
    endAngle = unwrapped[unwrapped.length - 1];
  }

  const arcEndpoints: Point3D[] = [
    {
      x: arcCenter.x + arcRadius * (Math.cos(startAngle) * u.x + Math.sin(startAngle) * v.x),
      y: arcCenter.y + arcRadius * (Math.cos(startAngle) * u.y + Math.sin(startAngle) * v.y),
      z: arcCenter.z + arcRadius * (Math.cos(startAngle) * u.z + Math.sin(startAngle) * v.z),
    },
    {
      x: arcCenter.x + arcRadius * (Math.cos(endAngle) * u.x + Math.sin(endAngle) * v.x),
      y: arcCenter.y + arcRadius * (Math.cos(endAngle) * u.y + Math.sin(endAngle) * v.y),
      z: arcCenter.z + arcRadius * (Math.cos(endAngle) * u.z + Math.sin(endAngle) * v.z),
    },
  ];

  return [{
    id: `${traceId}-ideal-arc`,
    label: "Ideal Arc",
    points: arcEndpoints,
    arc: { center: arcCenter, radius: arcRadius, startAngle, endAngle, u, v },
  }];
}

/**
 * Sample a best-fit `ArcLine` into dense 3D points in real-world coordinates.
 * Uses the parametric formula `P = center + radius·(cosθ·u + sinθ·v)` WITHOUT
 * the Y/Z swap (that swap is viewer-only). Straight lines return their endpoints.
 */
export function sampleArcLinePoints(line: ArcLine): Point3D[] {
  if (!line.arc) return line.points;

  const { center, radius, startAngle, endAngle, u, v } = line.arc;
  let sweep = endAngle - startAngle;
  const twoPi = Math.PI * 2;
  if (!Number.isFinite(sweep)) sweep = 0;
  else if (Math.abs(sweep) > twoPi) sweep = sweep % twoPi;

  const points: Point3D[] = [];
  for (let i = 0; i <= ARC_OBJ_SAMPLES; i++) {
    const angle = startAngle + (i / ARC_OBJ_SAMPLES) * sweep;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    points.push({
      x: center.x + radius * (cos * u.x + sin * v.x),
      y: center.y + radius * (cos * u.y + sin * v.y),
      z: center.z + radius * (cos * u.z + sin * v.z),
    });
  }
  return points;
}

/**
 * Serialize named polylines into Wavefront OBJ text. Convention matches
 * `backend/services/intrados_export.py`: header comment, one `o <name>` block
 * per curve, `v x y z` vertices in meters, and a single `l i1 i2 …` polyline
 * element using running 1-based vertex indices.
 */
export function buildArcObjText(objects: Array<{ name: string; points: Point3D[] }>): string {
  const out: string[] = ["# Best-fit arc curves — Vault Analyser", "# Units: meters", ""];
  let vertexBase = 0;
  for (const obj of objects) {
    if (obj.points.length < 2) continue;
    out.push(`o ${obj.name}`);
    for (const p of obj.points) {
      out.push(`v ${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)}`);
    }
    const indices = obj.points.map((_, i) => vertexBase + i + 1);
    out.push(`l ${indices.join(" ")}`);
    out.push("");
    vertexBase += obj.points.length;
  }
  return out.join("\n");
}

/** Trigger a browser download of OBJ content. */
export function downloadObj(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "model/obj" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
