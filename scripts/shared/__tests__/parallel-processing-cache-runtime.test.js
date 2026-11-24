import {
  buildModuleAnalysisCacheKey,
  createModuleAnalysisCache,
  normalizeModuleAnalysisCheckGroups
} from "../../shared/module-analysis-cache.ts";
import { deepEqual, equal, ok } from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import {
  partitionModulesByCache,
  pruneStaleCacheEntries,
  runParallelProcessing,
  writeSuccessfulResultsToCache
} from "../../parallel-processing.ts";
import { formatIssues } from "../../check-modules/issue.ts";
import { join } from "node:path";
import { processModule } from "../../../pipeline/workers/process-module.ts";
import { test } from "node:test";
import { tmpdir } from "node:os";

const DEFAULT_ANALYSIS_CONFIG = normalizeModuleAnalysisCheckGroups({
  fast: true,
  deep: true,
  eslint: true,
  ncu: true,
  npmDeprecatedCheck: true
});

async function createTempCachePath(prefix = "parallel-cache-runtime-test-") {
  const directoryPath = await mkdtemp(join(tmpdir(), prefix));
  return join(directoryPath, "moduleCache.json");
}

function createModule({ id, url, lastCommit }) {
  return {
    id,
    url,
    lastCommit,
    name: id,
    maintainer: "maintainer",
    issues: []
  };
}

function createSilentLogger() {
  return {
    error: () => null,
    info: () => null,
    warn: () => null
  };
}

test("partitionModulesByCache splits cache hits and misses with skipped semantics", async () => {
  const catalogueRevision = "catalogue-rev-1";
  const modules = [
    createModule({ id: "owner/module-a", url: "https://github.com/owner/module-a", lastCommit: "sha-a" }),
    createModule({ id: "owner/module-b", url: "https://github.com/owner/module-b", lastCommit: "sha-b" })
  ];

  const cache = createModuleAnalysisCache({ filePath: await createTempCachePath() });
  await cache.load();

  const cacheKey = buildModuleAnalysisCacheKey({
    module: modules[0],
    catalogueRevision,
    checkGroups: DEFAULT_ANALYSIS_CONFIG
  });
  ok(cacheKey, "expected cache key for first module");

  cache.set(cacheKey, {
    id: modules[0].id,
    name: modules[0].name,
    maintainer: modules[0].maintainer,
    url: modules[0].url,
    issues: []
  });

  const { cachedResults, uncachedModules } = partitionModulesByCache(modules, {
    cache,
    catalogueRevision,
    analysisConfig: DEFAULT_ANALYSIS_CONFIG
  });

  equal(cachedResults.length, 1);
  equal(uncachedModules.length, 1);
  equal(cachedResults[0].id, modules[0].id);
  equal(cachedResults[0].status, "skipped");
  equal(cachedResults[0].skippedReason, "cached");
  equal(cachedResults[0].fromCache, true);
  equal(uncachedModules[0].id, modules[1].id);
});

test("pruneStaleCacheEntries removes orphaned and invalidated keys", async () => {
  const catalogueRevision = "catalogue-rev-2";
  const analysisConfig = DEFAULT_ANALYSIS_CONFIG;

  const currentModules = [
    createModule({ id: "owner/module-a", url: "https://github.com/owner/module-a", lastCommit: "sha-a-new" }),
    createModule({ id: "owner/module-b", url: "https://github.com/owner/module-b", lastCommit: "sha-b" })
  ];

  const staleRevisionModule = createModule({ id: "owner/module-a", url: "https://github.com/owner/module-a", lastCommit: "sha-a-old" });
  const removedModule = createModule({ id: "owner/module-c", url: "https://github.com/owner/module-c", lastCommit: "sha-c" });

  const cache = createModuleAnalysisCache({ filePath: await createTempCachePath() });
  await cache.load();

  const staleRevisionKey = buildModuleAnalysisCacheKey({
    module: staleRevisionModule,
    catalogueRevision,
    checkGroups: analysisConfig
  });
  const keptKey = buildModuleAnalysisCacheKey({
    module: currentModules[1],
    catalogueRevision,
    checkGroups: analysisConfig
  });
  const removedModuleKey = buildModuleAnalysisCacheKey({
    module: removedModule,
    catalogueRevision,
    checkGroups: analysisConfig
  });

  ok(staleRevisionKey);
  ok(keptKey);
  ok(removedModuleKey);

  cache.set(staleRevisionKey, { id: staleRevisionModule.id, status: "success" });
  cache.set(keptKey, { id: currentModules[1].id, status: "success" });
  cache.set(removedModuleKey, { id: removedModule.id, status: "success" });

  const prunedCount = pruneStaleCacheEntries(cache, currentModules, {
    catalogueRevision,
    analysisConfig
  });

  equal(prunedCount, 2);
  deepEqual(cache.getAllKeys(), [keptKey]);
});

test("integration: second run has higher cache skip-rate", async () => {
  const catalogueRevision = "catalogue-rev-3";
  const modules = [
    createModule({ id: "owner/module-a", url: "https://github.com/owner/module-a", lastCommit: "sha-a" }),
    createModule({ id: "owner/module-b", url: "https://github.com/owner/module-b", lastCommit: "sha-b" }),
    createModule({ id: "owner/module-c", url: "https://github.com/owner/module-c", lastCommit: "sha-c" })
  ];

  const cache = createModuleAnalysisCache({ filePath: await createTempCachePath() });
  await cache.load();

  const firstRun = partitionModulesByCache(modules, {
    cache,
    catalogueRevision,
    analysisConfig: DEFAULT_ANALYSIS_CONFIG
  });

  equal(firstRun.cachedResults.length, 0);
  equal(firstRun.uncachedModules.length, modules.length);

  const workerResults = firstRun.uncachedModules.map((module) => {
    const cacheKey = buildModuleAnalysisCacheKey({
      module,
      catalogueRevision,
      checkGroups: DEFAULT_ANALYSIS_CONFIG
    });

    return {
      id: module.id,
      name: module.name,
      maintainer: module.maintainer,
      url: module.url,
      issues: [],
      status: "success",
      cacheKey,
      fromCache: false
    };
  });

  const writtenCount = writeSuccessfulResultsToCache(workerResults, cache, catalogueRevision);
  equal(writtenCount, modules.length);
  await cache.flush();

  const secondRun = partitionModulesByCache(modules, {
    cache,
    catalogueRevision,
    analysisConfig: DEFAULT_ANALYSIS_CONFIG
  });

  const firstRunSkipRate = firstRun.cachedResults.length / modules.length;
  const secondRunSkipRate = secondRun.cachedResults.length / modules.length;

  equal(secondRun.uncachedModules.length, 0);
  equal(secondRunSkipRate, 1);
  ok(secondRunSkipRate > firstRunSkipRate);
});

test("runParallelProcessing processes local modules without enabling the analysis cache", async () => {
  const modules = [
    createModule({ id: "owner/module-a", url: "https://github.com/owner/module-a", lastCommit: "sha-a" }),
    createModule({ id: "owner/module-b", url: "https://github.com/owner/module-b", lastCommit: "sha-b" })
  ];

  let capturedModules = null;
  let capturedModuleConfig = null;
  let progressHandler = null;

  const workerPool = {
    onProgress(handler) {
      progressHandler = handler;
    },
    processModules(uncachedModules, moduleConfig) {
      capturedModules = uncachedModules;
      capturedModuleConfig = moduleConfig;

      for (const module of uncachedModules) {
        progressHandler?.({
          type: "module",
          status: "success",
          moduleId: module.id,
          fromCache: false
        });
      }

      return uncachedModules.map(module => ({
        ...module,
        status: "success",
        fromCache: false,
        issues: [...module.issues]
      }));
    }
  };

  const result = await runParallelProcessing({
    modules,
    projectRoot: "/virtual/project",
    workerCount: 1,
    batchSize: modules.length,
    cacheDisabled: false,
    localOnly: true,
    catalogueRevision: "catalogue-rev-runtime-test",
    workerPool,
    runLogger: createSilentLogger()
  });

  deepEqual(capturedModules, modules);
  equal(capturedModuleConfig.projectRoot, "/virtual/project");
  equal(capturedModuleConfig.cacheEnabled, false);
  equal(capturedModuleConfig.localOnly, true);
  equal(capturedModuleConfig.catalogueRevision, "catalogue-rev-runtime-test");
  equal(result.results.length, modules.length);
  equal(result.processedModules.length, modules.length);
  equal(result.successCount, modules.length);
  equal(result.failedCount, 0);
  equal(result.skippedCount, 0);
  equal(result.cachedCount, 0);
});

test("local-only workers analyze existing files without Git and skip missing clones", async (context) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "local-only-worker-test-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));
  const module = {
    id: "example/MMM-Local",
    name: "MMM-Local",
    maintainer: "example",
    url: "not-a-git-url",
    lastCommit: "2099-01-01T00:00:00Z",
    outdated: "Marked outdated",
    issues: []
  };
  const config = {
    projectRoot,
    modulesDir: join(projectRoot, "modules"),
    modulesTempDir: join(projectRoot, "modules_temp"),
    imagesDir: join(projectRoot, "website", "images"),
    cacheEnabled: true,
    localOnly: true
  };

  const missing = await processModule(module, config);
  equal(missing.status, "skipped");
  equal(missing.skippedReason, "No local clone available");
  equal(missing.cloned, false);
  equal("cacheKey" in missing, false);

  const cloneDir = join(config.modulesDir, "MMM-Local-----example");
  await mkdir(config.modulesDir, { recursive: true });
  await writeFile(cloneDir, "not a directory");
  equal((await processModule(module, config)).status, "skipped");
  await rm(cloneDir);
  await mkdir(cloneDir);
  const sourcePath = join(cloneDir, "node_helper.js");
  const source = "const client = require('axios');\n";
  await writeFile(sourcePath, source);
  const result = await processModule(module, config);
  equal(result.status, "success");
  equal(result.fromCache, false);
  equal("cacheKey" in result, false);
  ok(result.issues.every(issue => typeof issue === "object"));
  ok(formatIssues(result.issues).some(issue => issue.includes("axios:") && issue.includes("node_helper.js:1:")));
  equal(await readFile(sourcePath, "utf8"), source);

  const requiredOnly = await processModule({
    ...module,
    issues: ["existing-1", "existing-2", "existing-3", "existing-4", "existing-5"]
  }, {
    ...config,
    analysisConfig: { deep: false, eslint: false, ncu: false, npmDeprecatedCheck: false }
  });
  equal(requiredOnly.status, "success");
  equal(formatIssues(requiredOnly.issues).filter(issue => issue.includes("axios:")).length, 1);
  equal(formatIssues(requiredOnly.issues).some(issue => issue.startsWith("ESLint issues:")), false);

  const parallelResult = await runParallelProcessing({
    modules: [module, { ...module, id: "example/MMM-Missing", name: "MMM-Missing" }],
    projectRoot,
    localOnly: true,
    cacheDisabled: false,
    catalogueRevision: "local-test-revision",
    workerCount: 1,
    batchSize: 2,
    runLogger: createSilentLogger()
  });
  equal(parallelResult.successCount, 1);
  equal(parallelResult.skippedCount, 1);
  equal(parallelResult.failedCount, 0);
  equal(parallelResult.cachedCount, 0);
  ok(formatIssues(parallelResult.results.find(entry => entry.id === module.id).issues).some(issue => issue.includes("axios:")));
  equal(await readFile(sourcePath, "utf8"), source);
});
