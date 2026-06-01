import assert from "node:assert/strict";
import test from "node:test";

import { buildBayPlanPhysicalScale, formatMetres, ribLengthMetres } from "./bayPlanScale.ts";

test("buildBayPlanPhysicalScale derives node span in metres", () => {
  const scale = buildBayPlanPhysicalScale(0.01, [
    { x: 0, y: 0 },
    { x: 100, y: 50 },
  ]);
  assert.ok(scale);
  assert.equal(scale.metresPerPixel, 0.01);
  assert.deepEqual(scale.nodeSpanMetres, { width: 1, height: 0.5 });
});

test("ribLengthMetres uses pixel hypotenuse times scale", () => {
  const nodes = [
    { x: 0, y: 0 },
    { x: 300, y: 400 },
  ];
  const length = ribLengthMetres(nodes, { a: 0, b: 1 }, 0.01);
  assert.equal(length, 5);
});

test("formatMetres trims precision for large values", () => {
  assert.equal(formatMetres(12.3456), "12.35");
  assert.equal(formatMetres(123.456), "123.5");
});
