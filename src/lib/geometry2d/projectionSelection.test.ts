import assert from "node:assert/strict";
import test from "node:test";

import { resolveGeometry2DProjection } from "./projectionSelection.ts";

const projections = [
  { id: "projection-a", name: "Projection A", settings: { resolution: 1024 } },
  { id: "projection-b", name: "Projection B", settings: { resolution: 2048 } },
];

test("uses the persisted Step 4 projection when reporting existing geometry", () => {
  const projection = resolveGeometry2DProjection({
    project: {
      selectedProjectionId: "projection-b",
      steps: {
        3: { data: { selectedProjectionId: "projection-b" } },
        4: { data: { geometry2d: { projectionId: "projection-a" } } },
      },
      projections,
    },
    preferStep4Projection: true,
  });

  assert.equal(projection?.id, "projection-a");
});

test("uses the selected project projection before falling back to Step 3 or first projection", () => {
  const projection = resolveGeometry2DProjection({
    project: {
      selectedProjectionId: "projection-b",
      steps: {
        3: { data: { selectedProjectionId: "projection-a" } },
      },
      projections,
    },
  });

  assert.equal(projection?.id, "projection-b");
});

test("falls back to the Step 3 projection when the project has no current selection", () => {
  const projection = resolveGeometry2DProjection({
    project: {
      steps: {
        3: { data: { selectedProjectionId: "projection-b" } },
      },
      projections,
    },
  });

  assert.equal(projection?.id, "projection-b");
});
