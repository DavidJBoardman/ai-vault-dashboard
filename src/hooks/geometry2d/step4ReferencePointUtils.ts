import type { Geometry2DNodePoint as Geometry2DTemplateBossPoint } from "@/lib/api";

export function pointSignature(points: Geometry2DTemplateBossPoint[]): string {
  return JSON.stringify(
    [...points]
      .map((point) => ({
        id: point.id,
        label: point.label,
        x: Number(point.x.toFixed(3)),
        y: Number(point.y.toFixed(3)),
        source: point.source,
        pointType: point.pointType || "boss",
      }))
      .sort((a, b) => a.id - b.id)
  );
}

export function cloneTemplatePoints(points: Geometry2DTemplateBossPoint[]): Geometry2DTemplateBossPoint[] {
  return points.map((point) => ({ ...point }));
}

export function coercePointsToPixelCoordinates(
  points: Geometry2DTemplateBossPoint[],
  resolution: number
): Geometry2DTemplateBossPoint[] {
  if (resolution <= 1) return points;
  return points.map((point) => {
    const x = Number(point.x);
    const y = Number(point.y);
    const looksUnit = x >= 0 && x <= 1.01 && y >= 0 && y <= 1.01;
    if (!looksUnit) return point;
    return {
      ...point,
      x: x * resolution,
      y: y * resolution,
    };
  });
}

export function getPointType(point: Pick<Geometry2DTemplateBossPoint, "pointType">): "boss" | "corner" {
  return point.pointType === "corner" ? "corner" : "boss";
}

export function cloneAndSortTemplatePoints(points: Geometry2DTemplateBossPoint[]): Geometry2DTemplateBossPoint[] {
  return points.map((point) => ({ ...point, pointType: getPointType(point) })).sort((a, b) => a.id - b.id);
}

// Match the step-3 alphabet (skips I, O, and Z - Z reserved for the bay
// centre) so manually added boss points continue the same letter sequence
// used by the segmentation labels. After Y the sequence falls through to
// AA, AB, ..., BA, ... (Excel-style on a 23-letter alphabet).
const BOSS_UPPER_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXY";
// Legacy lowercase alphabet still recognised when reading old labels.
const BOSS_LOWER_LETTERS_LEGACY = "abcdefghjklmnpqrstuvwxyz";

function letterFromIndex(index: number): string {
  const L = BOSS_UPPER_LETTERS;
  const base = L.length; // 23
  if (index < 0) return L[0];
  if (index < base) return L[index];
  const two = index - base;
  if (two < base * base) {
    return L[Math.floor(two / base)] + L[two % base];
  }
  const three = two - base * base;
  return (
    L[Math.floor(three / (base * base))] +
    L[Math.floor((three % (base * base)) / base)] +
    L[three % base]
  );
}

function indexFromLetter(letter: string): number | null {
  const L = BOSS_UPPER_LETTERS;
  const base = L.length;
  if (letter.length === 1) {
    const i = L.indexOf(letter);
    if (i >= 0) return i;
    const lower = BOSS_LOWER_LETTERS_LEGACY.indexOf(letter);
    return lower >= 0 ? base + lower : null;
  }
  if (letter.length === 2) {
    const o = L.indexOf(letter[0]);
    const i = L.indexOf(letter[1]);
    return o >= 0 && i >= 0 ? base + o * base + i : null;
  }
  if (letter.length === 3) {
    const a = L.indexOf(letter[0]);
    const b = L.indexOf(letter[1]);
    const c = L.indexOf(letter[2]);
    return a >= 0 && b >= 0 && c >= 0
      ? base + base * base + a * base * base + b * base + c
      : null;
  }
  return null;
}

// Continue the sequence from the highest letter currently in use rather than
// filling gaps left by deleted points - labels stay monotonic and don't reuse
// a tag a user may remember from earlier in the session.
//
// Capacity: A-Y (23) + a-y (24) = 47 unique letters before the alphabet wraps,
// matching step 3's `getAlphabeticalLabel`. In practice a single bay never
// needs that many reference points; if it ever does, the rendered letter
// wraps back to "A" - the row's `#N` remains the unambiguous identifier.
export function pickNextBossLetter(points: Geometry2DTemplateBossPoint[]): string {
  let highest = -1;
  points.forEach((point) => {
    if (getPointType(point) !== "boss") return;
    const match = String(point.label || "").trim().match(/\s+([A-Za-z]{1,3})$/);
    if (!match) return;
    const idx = indexFromLetter(match[1]);
    if (idx !== null && idx > highest) highest = idx;
  });
  return letterFromIndex(highest + 1);
}

function allocateNextPointId(usedIds: Set<number>): number {
  let nextId = Math.max(0, ...Array.from(usedIds)) + 1;
  while (usedIds.has(nextId)) {
    nextId += 1;
  }
  usedIds.add(nextId);
  return nextId;
}

function distanceBetweenPoints(
  a: Pick<Geometry2DTemplateBossPoint, "x" | "y">,
  b: Pick<Geometry2DTemplateBossPoint, "x" | "y">
) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function reconcileLegacyCornerReferencePoints(
  points: Geometry2DTemplateBossPoint[],
  detectedPoints: Geometry2DTemplateBossPoint[]
): Geometry2DTemplateBossPoint[] {
  const detectedCorners = detectedPoints.filter((point) => getPointType(point) === "corner");
  if (detectedCorners.length === 0) return cloneAndSortTemplatePoints(points);

  const nextPoints = cloneAndSortTemplatePoints(points);
  const usedPointIds = new Set<number>();
  const CORNER_MATCH_TOLERANCE_PX = 18;

  detectedCorners.forEach((cornerPoint) => {
    let matchIndex = nextPoints.findIndex(
      (point) => getPointType(point) === "corner" && point.label === cornerPoint.label
    );

    if (matchIndex < 0) {
      matchIndex = nextPoints.findIndex((point) => point.id === cornerPoint.id);
    }

    if (matchIndex < 0) {
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      nextPoints.forEach((point, index) => {
        if (usedPointIds.has(point.id)) return;
        const distance = distanceBetweenPoints(point, cornerPoint);
        if (distance <= CORNER_MATCH_TOLERANCE_PX && distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      matchIndex = bestIndex;
    }

    if (matchIndex >= 0) {
      usedPointIds.add(nextPoints[matchIndex].id);
      nextPoints[matchIndex] = {
        ...nextPoints[matchIndex],
        label: cornerPoint.label,
        pointType: "corner",
      };
    }
  });

  return cloneAndSortTemplatePoints(nextPoints);
}

function mergeCornerReferencePoints(
  points: Geometry2DTemplateBossPoint[],
  detectedPoints: Geometry2DTemplateBossPoint[]
): Geometry2DTemplateBossPoint[] {
  const cornersByLabel = new Map(
    detectedPoints
      .filter((point) => getPointType(point) === "corner")
      .map((point) => [point.label, { ...point, pointType: "corner" as const }])
  );
  const merged = cloneAndSortTemplatePoints(points);
  const usedIds = new Set(merged.map((point) => point.id));
  const existingCornerLabels = new Set(
    merged.filter((point) => getPointType(point) === "corner").map((point) => point.label)
  );
  cornersByLabel.forEach((point, label) => {
    if (!existingCornerLabels.has(label)) {
      const nextPoint = usedIds.has(point.id)
        ? { ...point, id: allocateNextPointId(usedIds) }
        : point;
      usedIds.add(nextPoint.id);
      merged.push(nextPoint);
    }
  });
  return cloneAndSortTemplatePoints(merged);
}

export function applyCornerPointPreference(
  points: Geometry2DTemplateBossPoint[],
  detectedPoints: Geometry2DTemplateBossPoint[],
  includeCorners: boolean
): Geometry2DTemplateBossPoint[] {
  if (includeCorners) {
    return mergeCornerReferencePoints(reconcileLegacyCornerReferencePoints(points, detectedPoints), detectedPoints);
  }
  return cloneAndSortTemplatePoints(points.filter((point) => getPointType(point) !== "corner"));
}

export function normaliseReferencePointsForDisplay(
  points: Geometry2DTemplateBossPoint[],
  detectedPoints: Geometry2DTemplateBossPoint[],
  includeCorners: boolean
): Geometry2DTemplateBossPoint[] {
  return applyCornerPointPreference(cloneAndSortTemplatePoints(points), detectedPoints, includeCorners);
}
