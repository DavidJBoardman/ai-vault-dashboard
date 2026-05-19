import { test } from "node:test";
import assert from "node:assert/strict";

import { computeResidualSummary } from "./projectionCanvasUtils";

test("returns null when no boss carries a matched error", () => {
  const summary = computeResidualSummary([
    { id: "A", x: 0, y: 0, source: "anchor" },
    { id: "B", x: 0, y: 0, source: "raw", matched: false },
  ]);
  assert.equal(summary, null);
});

test("averages the matched per-axis errors as a percent", () => {
  const summary = computeResidualSummary([
    { id: "B1", x: 0, y: 0, source: "raw", matched: true, matchedXError: 0.01, matchedYError: 0.02 },
    { id: "B2", x: 0, y: 0, source: "raw", matched: true, matchedXError: 0.04, matchedYError: 0.03 },
  ]);
  assert.ok(summary);
  assert.equal(summary!.sampleCount, 2);
  assert.equal(summary!.meanPercent.toFixed(2), "3.62");
  assert.equal(summary!.maxPercent.toFixed(2), "5.00");
});

test("ignores rows where either axis error is missing or non-finite", () => {
  const summary = computeResidualSummary([
    { id: "B1", x: 0, y: 0, source: "raw", matched: true, matchedXError: 0.01, matchedYError: null },
    { id: "B2", x: 0, y: 0, source: "raw", matched: true, matchedXError: Number.NaN, matchedYError: 0.02 },
    { id: "B3", x: 0, y: 0, source: "raw", matched: true, matchedXError: 0.03, matchedYError: 0.04 },
  ]);
  assert.ok(summary);
  assert.equal(summary!.sampleCount, 1);
  assert.equal(summary!.meanPercent.toFixed(2), "5.00");
  assert.equal(summary!.maxPercent.toFixed(2), "5.00");
});
