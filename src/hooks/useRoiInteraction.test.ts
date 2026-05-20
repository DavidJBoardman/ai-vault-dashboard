import assert from "node:assert/strict";
import test from "node:test";

import { resizeRoiFromHandle, type ROIState } from "./useRoiInteraction.ts";

const baseRoi: ROIState = {
  x: 0.5,
  y: 0.5,
  width: 0.4,
  height: 0.4,
  rotation: 0,
};

function assertClose(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${actual} to be close to ${expected}`);
}

test("resizing a horizontal ROI boundary keeps the centroid fixed", () => {
  const next = resizeRoiFromHandle(baseRoi, "e", 0.1, 0);

  assert.equal(next.x, baseRoi.x);
  assert.equal(next.y, baseRoi.y);
  assertClose(next.width, 0.6);
  assert.equal(next.height, baseRoi.height);
});

test("resizing a vertical ROI boundary keeps the centroid fixed", () => {
  const next = resizeRoiFromHandle(baseRoi, "n", 0, -0.1);

  assert.equal(next.x, baseRoi.x);
  assert.equal(next.y, baseRoi.y);
  assert.equal(next.width, baseRoi.width);
  assertClose(next.height, 0.6);
});
