import assert from "node:assert/strict";
import test from "node:test";

import { summariseCutTypologyRows } from "./cutTypologySummary.ts";

test("counts only boss rows marked as matched", () => {
  const summary = summariseCutTypologyRows([
    { point_type: "boss", matched: "true", variant_label: "starcut_n=3" },
    { point_type: "boss", matched: "false", variant_label: "starcut_n=3" },
    { point_type: "boss", matched: "", variant_label: "None" },
    { point_type: "corner", matched: "true", variant_label: "roi_corner" },
  ]);

  assert.equal(summary.bossesTotal, 3);
  assert.equal(summary.bossesMatched, 1);
  assert.equal(summary.variantsMatched, 1);
});

test("accepts common true values from CSV-like rows", () => {
  const summary = summariseCutTypologyRows([
    { point_type: "boss", matched: "TRUE", variant_label: "starcut_n=2" },
    { point_type: "boss", matched: "1", variant_label: "starcut_n=3" },
    { point_type: "boss", matched: "yes", variant_label: "circlecut_inner" },
  ]);

  assert.equal(summary.bossesTotal, 3);
  assert.equal(summary.bossesMatched, 3);
  assert.equal(summary.variantsMatched, 3);
});

test("counts partial-match rows separately", () => {
  const summary = summariseCutTypologyRows([
    { point_type: "boss", matched: "True", match_state: "matched", variant_label: "starcut_n=2" },
    { point_type: "boss", matched: "False", match_state: "partial", x_cut: "starcut_n=2", y_cut: "None" },
    { point_type: "boss", matched: "False", match_state: "unmatched", x_cut: "None", y_cut: "None" },
  ]);

  assert.equal(summary.bossesTotal, 3);
  assert.equal(summary.bossesMatched, 1);
  assert.equal(summary.bossesPartial, 1);
});

test("derives partial state from legacy CSVs without match_state", () => {
  const summary = summariseCutTypologyRows([
    { point_type: "boss", matched: "False", x_cut: "starcut_n=2", y_cut: "None" },
  ]);

  assert.equal(summary.bossesPartial, 1);
});
