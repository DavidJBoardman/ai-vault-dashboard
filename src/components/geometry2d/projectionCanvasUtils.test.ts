import { test } from "node:test";
import assert from "node:assert/strict";

import { computeResidualSummary } from "./projectionCanvasUtils.ts";

test("returns null when no boss carries a matched error", () => {
  const summary = computeResidualSummary([
    {},
    { matched: false },
  ]);
  assert.equal(summary, null);
});

test("averages the matched per-axis errors as a percent", () => {
  const summary = computeResidualSummary([
    { matched: true, matchedXError: 0.01, matchedYError: 0.02 },
    { matched: true, matchedXError: 0.04, matchedYError: 0.03 },
  ]);
  assert.ok(summary);
  assert.equal(summary!.sampleCount, 2);
  assert.equal(summary!.meanPercent.toFixed(2), "3.62");
  assert.equal(summary!.maxPercent.toFixed(2), "5.00");
});

test("ignores rows where either axis error is missing or non-finite", () => {
  const summary = computeResidualSummary([
    { matched: true, matchedXError: 0.01, matchedYError: null },
    { matched: true, matchedXError: Number.NaN, matchedYError: 0.02 },
    { matched: true, matchedXError: 0.03, matchedYError: 0.04 },
  ]);
  assert.ok(summary);
  assert.equal(summary!.sampleCount, 1);
  assert.equal(summary!.meanPercent.toFixed(2), "5.00");
  assert.equal(summary!.maxPercent.toFixed(2), "5.00");
});
