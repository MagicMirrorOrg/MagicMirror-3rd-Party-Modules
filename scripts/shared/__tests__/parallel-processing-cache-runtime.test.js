import {
  buildModuleAnalysisCacheKey,
  createModuleAnalysisCache,
  normalizeModuleAnalysisConfig
} from "../../shared/module-analysis-cache.ts";
import { deepEqual, equal, ok } from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import {
  partitionModulesByCache,
  pruneStaleCacheEntries,
  runParallelProcessing,
  writeSuccessfulResultsToCache
} from "../../parallel-processing.ts";
import { formatIssues } from "../../check-modules/issue.ts";
import { join } from "node:path";
import process from "node:process";
import { processModule } from "../../workers/process-module.ts";
import { test } from "node:test";
import { tmpdir } from "node:os";

const DEFAULT_ANALYSIS_CONFIG = normalizeModuleAnalysisConfig({
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
    analysisConfig: DEFAULT_ANALYSIS_CONFIG
  });
  ok(cacheKey, "expected cache key for first module");

  cache.set(cacheKey, {
    id: modules[0].id,
    name: modules[0].name,
    maintainer: modules[0].maintainer,
    url: modules[0].url,
    stars: 1,
    issues: []
  });
  modules[0].stars = 2;

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
  equal(cachedResults[0].stars, 2);
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
    analysisConfig
  });
  const keptKey = buildModuleAnalysisCacheKey({
    module: currentModules[1],
    catalogueRevision,
    analysisConfig
  });
  const removedModuleKey = buildModuleAnalysisCacheKey({
    module: removedModule,
    catalogueRevision,
    analysisConfig
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

test("partitionModulesByCache reprocesses modules with missing cached images", async (context) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "parallel-cache-images-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));
  const module = createModule({ id: "owner/module-a", url: "https://github.com/owner/module-a", lastCommit: "sha-a" });
  const catalogueRevision = "catalogue-revision";
  const cache = createModuleAnalysisCache({ filePath: join(projectRoot, "cache.json") });
  await cache.load();
  const cacheKey = buildModuleAnalysisCacheKey({ module, catalogueRevision, analysisConfig: DEFAULT_ANALYSIS_CONFIG });
  cache.set(cacheKey, { ...module, image: "module.webp" });
  const options = { cache, catalogueRevision, analysisConfig: DEFAULT_ANALYSIS_CONFIG, imagesDir: projectRoot };

  equal(partitionModulesByCache([module], options).uncachedModules.length, 1);
  await writeFile(join(projectRoot, "module.webp"), "image");
  equal(partitionModulesByCache([module], options).cachedResults.length, 1);
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
      analysisConfig: DEFAULT_ANALYSIS_CONFIG
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

test("pipeline reuses persisted results with current metadata and available images", async (context) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "parallel-cache-persisted-"));
  const previousRevision = process.env.PIPELINE_CATALOGUE_REVISION;
  process.env.PIPELINE_CATALOGUE_REVISION = "b".repeat(40);
  context.after(async () => {
    if (typeof previousRevision === "string") {
      process.env.PIPELINE_CATALOGUE_REVISION = previousRevision;
    }
    else {
      delete process.env.PIPELINE_CATALOGUE_REVISION;
    }
    await rm(projectRoot, { recursive: true, force: true });
  });
  const imagePath = join(projectRoot, "website", "images", "module.webp");
  await mkdir(join(projectRoot, "website", "images"), { recursive: true });
  await writeFile(imagePath, "image");
  const module = { ...createModule({ id: "owner/module-a", url: "https://github.com/owner/module-a", lastCommit: "sha-a" }), stars: 1 };
  let processedCount = 0;
  const workerPool = {
    processModules(modules, config) {
      processedCount += modules.length;
      return modules.map(entry => ({
        ...entry,
        status: "success",
        image: "module.webp",
        cacheKey: buildModuleAnalysisCacheKey({ module: entry, catalogueRevision: config.catalogueRevision, analysisConfig: config.analysisConfig })
      }));
    }
  };
  const options = { projectRoot, workerPool, runLogger: createSilentLogger() };

  const first = await runParallelProcessing({ ...options, modules: [module] });
  equal(first.cachedCount, 0);
  const second = await runParallelProcessing({ ...options, modules: [{ ...module, stars: 5 }] });
  equal(second.cachedCount, 1);
  equal(second.processedModules[0].stars, 5);
  equal(processedCount, 1);
  await rm(imagePath);
  const third = await runParallelProcessing({ ...options, modules: [module] });
  equal(third.cachedCount, 0);
  equal(processedCount, 2);
});

test("pipeline reports periodic progress and individual failures", async (context) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "parallel-progress-test-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));
  const modules = Array.from({ length: 53 }, (unused, index) => createModule({
    id: `owner/module-${index}`,
    url: `https://github.com/owner/module-${index}`,
    lastCommit: "sha"
  }));
  modules[0].notFound = true;
  const messages = { info: [], warn: [] };
  let onProgress;
  const workerPool = {
    onProgress(handler) { onProgress = handler; },
    processModules(entries) {
      return entries.map((module, index) => {
        const status = { 10: "failed", 20: "skipped" }[index] ?? "success";
        onProgress({ type: "module", status: "started", moduleId: module.id });
        onProgress({ type: "module", status, moduleId: module.id, ...(status === "failed" ? { error: "Worker 2 timed out" } : {}) });
        return { ...module, status };
      });
    }
  };
  await runParallelProcessing({
    modules,
    projectRoot,
    catalogueRevision: "catalogue-revision",
    workerPool,
    runLogger: { info: message => messages.info.push(message), warn: message => messages.warn.push(message), error: () => null }
  });

  deepEqual(messages.info.filter(message => message.startsWith("Processed ")), ["Processed 50/53 modules", "Processed 53/53 modules"]);
  ok(messages.info.includes("Cache: 0 hit(s), 52 to process"));
  ok(messages.warn.some(message => message.includes("failed: owner/module-0: Repository not found")));
  ok(messages.warn.some(message => message.includes("failed: owner/module-11: Worker 2 timed out")));
  ok(messages.warn.some(message => message.includes("skipped: owner/module-21")));
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
    cacheDisabled: false,
    localOnly: true,
    catalogueRevision: "catalogue-rev-runtime-test",
    workerPool,
    runLogger: createSilentLogger()
  });

  deepEqual(capturedModules, modules);
  equal(capturedModuleConfig.projectRoot, "/virtual/project");
  ok(capturedModuleConfig.runId.length > 0);
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
  let closeCount = 0;
  const moduleLogger = {
    info: () => null,
    error: () => null,
    debug: () => null,
    close: () => { closeCount += 1; }
  };
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
    localOnly: true,
    moduleLogger
  };

  const missing = await processModule(module, config);
  equal(missing.status, "skipped");
  equal(missing.skippedReason, "No local clone available");
  equal(missing.cloned, false);
  equal("cacheKey" in missing, false);
  equal(closeCount, 0);

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
  equal(closeCount, 0);
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
    runLogger: createSilentLogger()
  });
  equal(parallelResult.successCount, 1);
  equal(parallelResult.skippedCount, 1);
  equal(parallelResult.failedCount, 0);
  equal(parallelResult.cachedCount, 0);
  ok(formatIssues(parallelResult.results.find(entry => entry.id === module.id).issues).some(issue => issue.includes("axios:")));
  equal(await readFile(sourcePath, "utf8"), source);
  const logsRoot = join(projectRoot, "logs");
  const [runId] = await readdir(logsRoot);
  const logsDir = join(logsRoot, runId, "modules");
  const logFiles = await readdir(logsDir);
  const logs = await Promise.all(logFiles.map(file => readFile(join(logsDir, file), "utf8")));
  ok(logs.some(log => log.includes("Module processing completed successfully")));
  ok(logs.some(log => log.includes("Skipped - no local clone available")));
});
