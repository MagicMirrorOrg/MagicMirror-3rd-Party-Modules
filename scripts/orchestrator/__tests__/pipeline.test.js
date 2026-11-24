import { PIPELINE_ID, PIPELINE_STAGES } from "../pipeline.ts";
import assert from "node:assert/strict";
import test from "node:test";

test("defines the supported linear pipeline once", () => {
  assert.equal(PIPELINE_ID, "full-refresh-parallel");
  assert.deepEqual(PIPELINE_STAGES.map(stage => stage.id), [
    "collect-metadata",
    "parallel-processing",
    "aggregate-catalogue",
    "generate-result-markdown"
  ]);
  assert.equal(new Set(PIPELINE_STAGES.map(stage => stage.id)).size, PIPELINE_STAGES.length);
});

test("declares schema-validated publication artifacts on their producing stage", () => {
  const aggregate = PIPELINE_STAGES.find(stage => stage.id === "aggregate-catalogue");
  assert.ok(aggregate);
  assert.deepEqual(aggregate.outputs.map(output => [output.path, output.schemaId]), [
    ["website/data/modules.json", "modules.final"],
    ["website/data/modules.min.json", "modules.min"],
    ["website/data/stats.json", "stats"]
  ]);
});
