import assert from "node:assert/strict";
import test from "node:test";

import { decoratePointsWithMatchCsvRows } from "./step4MatchDecorations.ts";

test("preserves partial x-axis match evidence without creating an ideal point", () => {
  const [point] = decoratePointsWithMatchCsvRows(
    [
      {
        id: 8,
        label: "boss stone H",
        x: 100,
        y: 200,
        source: "auto",
        pointType: "boss",
        u: 0.3,
        v: 0.4,
        outOfBounds: false,
      },
    ],
    [
      {
        boss_id: "8",
        point_type: "boss",
        matched: "false",
        variant_label: "None",
        x_cut: "starcut_n=3",
        y_cut: "None",
        x_error: "0.004",
        y_error: "None",
        template_xy: "None",
      },
    ]
  );

  assert.equal(point.matchedTemplateX, null);
  assert.equal(point.matchedTemplateY, null);
  assert.equal(point.matchedXTemplateLabel, "starcut n=3");
  assert.equal(point.matchedYTemplateLabel, null);
  assert.equal(point.matchedXError, 0.004);
  assert.equal(point.matchedYError, null);
});

test("sets ideal coordinates only for full matches", () => {
  const [point] = decoratePointsWithMatchCsvRows(
    [
      {
        id: 2,
        label: "boss stone B",
        x: 100,
        y: 200,
        source: "auto",
        pointType: "boss",
        u: 0.3,
        v: 0.4,
        outOfBounds: false,
      },
    ],
    [
      {
        boss_id: "2",
        point_type: "boss",
        matched: "true",
        variant_label: "starcut_n=4",
        x_cut: "starcut_n=4",
        y_cut: "starcut_n=4",
        x_error: "0.001",
        y_error: "0.002",
        template_xy: "[120, 220]",
      },
    ]
  );

  assert.equal(point.matchedTemplateX, 120);
  assert.equal(point.matchedTemplateY, 220);
  assert.equal(point.matchedVariantLabel, "starcut_n=4");
  assert.equal(point.matchedXTemplateLabel, "starcut n=4");
  assert.equal(point.matchedYTemplateLabel, "starcut n=4");
});
