import assert from "node:assert/strict";
import test from "node:test";

import { pickNextBossLetter } from "./step4ReferencePointUtils.ts";

function corner(label: string, id: number) {
  return { id, label, x: 0, y: 0, source: "auto" as const, pointType: "corner" as const };
}

function boss(label: string, id: number) {
  return { id, label, x: 0, y: 0, source: "manual" as const, pointType: "boss" as const };
}

test("pickNextBossLetter starts at E when ROI corners occupy A–D", () => {
  const points = [
    corner("Corner C", 1),
    corner("Corner A", 2),
    corner("Corner B", 3),
    corner("Corner D", 4),
  ];
  assert.equal(pickNextBossLetter(points), "E");
});

test("pickNextBossLetter advances after existing boss stones", () => {
  const points = [
    corner("Corner A", 1),
    corner("Corner B", 2),
    corner("Corner C", 3),
    corner("Corner D", 4),
    boss("boss stone E", 5),
    boss("boss stone F", 6),
  ];
  assert.equal(pickNextBossLetter(points), "G");
});

test("pickNextBossLetter respects highest boss letter without corners in the list", () => {
  assert.equal(pickNextBossLetter([boss("boss stone H", 1)]), "J");
});

test("pickNextBossLetter defaults to E with an empty point list", () => {
  assert.equal(pickNextBossLetter([]), "E");
});
