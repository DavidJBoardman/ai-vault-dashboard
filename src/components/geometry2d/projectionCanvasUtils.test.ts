import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildActiveTemplateOverlayLabels,
  computeResidualSummary,
  getBossMatchState,
} from "./projectionCanvasUtils.ts";

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

test("classifies full, partial, unmatched, and corner match states", () => {
  assert.equal(getBossMatchState({ pointType: "corner" }), "corner");
  assert.equal(
    getBossMatchState({
      pointType: "boss",
      matchedXTemplateLabel: "x=1/2",
      matchedYTemplateLabel: "y=1/3",
    }),
    "matched"
  );
  assert.equal(
    getBossMatchState({
      pointType: "boss",
      matchedXTemplateLabel: "x=1/2",
    }),
    "partial"
  );
  assert.equal(getBossMatchState({ pointType: "boss" }), "unmatched");
});

test("merges selected overlay labels with a transient preview label", () => {
  assert.deepEqual(buildActiveTemplateOverlayLabels(["starcut_n=4"], null), ["starcut_n=4"]);
  assert.deepEqual(
    buildActiveTemplateOverlayLabels(["starcut_n=4"], "circlecut_outer"),
    ["starcut_n=4", "circlecut_outer"]
  );
  assert.deepEqual(
    buildActiveTemplateOverlayLabels(["starcut_n=4"], "starcut_n=4"),
    ["starcut_n=4"]
  );
});
