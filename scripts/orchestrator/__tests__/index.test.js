import assert from "node:assert/strict";
import { parsePipelineOptions } from "../index.ts";
import test from "node:test";

test("parses pipeline options in one place", () => {
  assert.deepEqual(parsePipelineOptions([
    "--workers=3",
    "--batch-size=12",
    "--local-only",
    "--no-cache"
  ]), {
    batchSize: 12,
    cacheDisabled: true,
    localOnly: true,
    workerCount: 3
  });
});

test("rejects invalid numeric pipeline options", () => {
  assert.throws(() => parsePipelineOptions(["--workers=0"]), /positive integer/u);
  assert.throws(() => parsePipelineOptions(["--batch-size=invalid"]), /positive integer/u);
});
