import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pruneModuleLogs } from "../log-retention.ts";
import test from "node:test";
import { tmpdir } from "node:os";

test("pruneModuleLogs keeps the newest configured runs", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "log-retention-test-"));
  const logsDirectory = join(projectRoot, "logs");
  await mkdir(logsDirectory);
  for (const runId of ["2026-11-20T10-00-00", "2026-11-21T10-00-00", "2026-11-22T10-00-00"]) {
    await mkdir(join(logsDirectory, runId));
  }
  await writeFile(join(logsDirectory, "README.txt"), "not a run");

  assert.equal(await pruneModuleLogs(projectRoot, 2), 1);
  assert.deepEqual((await readdir(logsDirectory)).sort(), [
    "2026-11-21T10-00-00",
    "2026-11-22T10-00-00",
    "README.txt"
  ]);
});
