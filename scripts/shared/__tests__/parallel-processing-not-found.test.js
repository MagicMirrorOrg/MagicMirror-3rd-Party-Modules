import { createModuleAnalysisCache, normalizeModuleAnalysisConfig } from "../../shared/module-analysis-cache.ts";
import { deepEqual, equal } from "node:assert/strict";
import {
  partitionModulesByCache,
  runParallelProcessing
} from "../../parallel-processing.ts";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { test } from "node:test";
import { tmpdir } from "node:os";

const DEFAULT_ANALYSIS_CONFIG = normalizeModuleAnalysisConfig({
  deep: true,
  eslint: true,
  ncu: true,
  npmDeprecatedCheck: true
});

async function createTempCachePath(prefix = "parallel-not-found-test-") {
  const directoryPath = await mkdtemp(join(tmpdir(), prefix));
  return join(directoryPath, "moduleCache.json");
}

function createSilentLogger() {
  return {
    error: () => null,
    info: () => null,
    warn: () => null
  };
}

test("partitionModulesByCache treats confirmed notFound modules as failed instead of cached skips", async () => {
  const modules = [
    {
      id: "owner/missing-module",
      issues: [],
      lastCommit: null,
      maintainer: "maintainer",
      name: "missing-module",
      notFound: true,
      url: "https://github.com/owner/missing-module"
    }
  ];

  const cache = createModuleAnalysisCache({ filePath: await createTempCachePath() });
  await cache.load();

  const { cachedResults, uncachedModules } = partitionModulesByCache(modules, {
    cache,
    catalogueRevision: "catalogue-rev-test",
    analysisConfig: DEFAULT_ANALYSIS_CONFIG
  });

  equal(uncachedModules.length, 0);
  equal(cachedResults.length, 1);
  equal(cachedResults[0].status, "failed");
  equal(cachedResults[0].failurePhase, "not-found");
  equal("fromCache" in cachedResults[0], false);
});

test("runParallelProcessing counts confirmed notFound modules as failures without invoking workers", async () => {
  const workerPool = {
    processModules() {
      throw new Error("worker should not be called for confirmed notFound modules");
    }
  };

  const modules = [
    {
      id: "owner/missing-module",
      issues: [],
      lastCommit: null,
      maintainer: "maintainer",
      name: "missing-module",
      notFound: true,
      url: "https://github.com/owner/missing-module"
    }
  ];

  const result = await runParallelProcessing({
    modules,
    projectRoot: "/virtual/project",
    workerCount: 1,
    batchSize: 1,
    cacheDisabled: false,
    catalogueRevision: "catalogue-rev-runtime-test",
    workerPool,
    runLogger: createSilentLogger()
  });

  equal(result.failedCount, 1);
  equal(result.skippedCount, 0);
  equal(result.successCount, 0);
  equal(result.results[0].status, "failed");
  equal(result.results[0].failurePhase, "not-found");
  deepEqual(result.results[0].error, "Repository not found (confirmed 404)");
});
