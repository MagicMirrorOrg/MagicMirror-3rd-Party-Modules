import assert from "node:assert/strict";
import { parsePipelineOptions } from "../index.ts";
import test from "node:test";

test("parses pipeline options in one place", () => {
  assert.deepEqual(parsePipelineOptions([
    "--workers=3",
    "--local-only",
    "--no-cache"
  ]), {
    cacheDisabled: true,
    localOnly: true,
    workerCount: 3
  });
});

test("rejects invalid numeric pipeline options", () => {
  assert.throws(() => parsePipelineOptions(["--workers=0"]), /positive integer/u);
});
