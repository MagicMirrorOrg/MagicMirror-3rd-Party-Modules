/**
 * Parallel module analysis stage.
 *
 * Runs module cloning, enrichment, and analysis in a worker pool.
 * The CLI wrapper refreshes metadata and then produces the in-memory
 * analysis payload for downstream pipeline stages.
 */

import { normalizeIssues } from "./check-modules/issue.ts";
import { pruneModuleLogs } from "./shared/log-retention.ts";
import { buildModuleAnalysisCacheKey, createModuleAnalysisCache, getProjectRevision, normalizeModuleAnalysisConfig, resolveModuleAnalysisCachePath } from "./shared/module-analysis-cache.ts";
import { toProcessedModule, type ProcessedModule } from "./shared/module-catalogue-output.ts";
import type { AnalysisConfig, ModuleInput, ModuleResult } from "./workers/module-types.ts";
import type { ProgressEvent, WorkerProcessConfig } from "./workers/worker-protocol.ts";
import { WorkerPool } from "./workers/worker-pool.ts";
import { cpus } from "node:os";
import { createLogger } from "./shared/logger.ts";
import { writeJson } from "./shared/fs-utils.ts";
import { resolve } from "node:path";

interface CacheEntry {
  value: Record<string, unknown>;
}

interface ModuleAnalysisCache {
  delete: (key: string) => void;
  flush: () => Promise<void>;
  get: (key: string) => CacheEntry | null;
  getAllKeys: () => string[];
  load: () => Promise<void>;
  set: (key: string, value: Record<string, unknown>) => void;
}

interface ParallelLogger {
  error: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
}

interface WorkerPoolLike {
  onProgress?: (handler: (event: ProgressEvent) => void) => void;
  processModules: (modules: ModuleInput[], moduleConfig: WorkerProcessConfig) => Promise<ModuleResult[]> | ModuleResult[];
}

interface RunParallelProcessingOptions {
  analysisConfig?: AnalysisConfig;
  batchSize?: number;
  cacheDisabled?: boolean;
  catalogueRevision?: string | null;
  localOnly?: boolean;
  modules: ModuleInput[];
  projectRoot?: string;
  runLogger?: ParallelLogger;
  workerCount?: number;
  workerPool?: WorkerPoolLike | null;
}

export interface ParallelProcessingResult {
  averageProcessingTimeMs: number;
  cachedCount: number;
  cachedPercentage: number;
  durationMs: number;
  failedCount: number;
  results: ModuleResult[];
  skippedCount: number;
  processedModules: ProcessedModule[];
  successCount: number;
}

const logger = createLogger({ name: "parallel-processing" });
const PROJECT_ROOT = resolve(process.cwd());
const DEFAULT_ANALYSIS_CONFIG = normalizeModuleAnalysisConfig({
  deep: true,
  eslint: true,
  ncu: true,
  npmDeprecatedCheck: true
});

/**
 * Prune cache entries that are stale for the current run.
 * Stale means "key is no longer expected" due to removed modules
 * or key-input changes (module revision/check config/catalogue revision).
 *
 * @param {Object} cache Cache instance
 * @param {Array} modules Current module list
 * @param {{ catalogueRevision: string|null, analysisConfig: object }} options
 * @returns {number} Number of entries pruned
 */
export function pruneStaleCacheEntries(
  cache: ModuleAnalysisCache,
  modules: ModuleInput[],
  { catalogueRevision, analysisConfig }: { analysisConfig: AnalysisConfig; catalogueRevision: string | null }
): number {
  if (!catalogueRevision) {
    return 0;
  }

  const expectedKeys = new Set();
  for (const module of modules) {
    const cacheKey = buildModuleAnalysisCacheKey({
      module,
      moduleRevision: module.lastCommit,
      catalogueRevision,
      analysisConfig
    });

    if (cacheKey) {
      expectedKeys.add(cacheKey);
    }
  }

  let prunedCount = 0;
  for (const key of cache.getAllKeys()) {
    if (!expectedKeys.has(key)) {
      cache.delete(key);
      prunedCount += 1;
    }
  }

  return prunedCount;
}

/**
 * Partition modules into cache hits and misses.
 * Returns results for hits immediately; misses must be processed by workers.
 *
 * @param {Array} modules
 * @param {{ cache: object, catalogueRevision: string|null, analysisConfig: object }} options
 * @returns {{ cachedResults: Array, uncachedModules: Array }}
 */
export function partitionModulesByCache(
  modules: ModuleInput[],
  { cache, catalogueRevision, analysisConfig }: { analysisConfig: AnalysisConfig; cache: ModuleAnalysisCache; catalogueRevision: string | null }
): { cachedResults: ModuleResult[]; uncachedModules: ModuleInput[] } {
  const cachedResults: ModuleResult[] = [];
  const uncachedModules: ModuleInput[] = [];

  for (const module of modules) {
    if (module.notFound) {
      cachedResults.push({
        ...module,
        status: "failed",
        failurePhase: "not-found",
        error: "Repository not found (confirmed 404)"
      } as ModuleResult);
      continue;
    }

    const cacheKey = catalogueRevision
      ? buildModuleAnalysisCacheKey({
        module,
        moduleRevision: module.lastCommit,
        catalogueRevision,
        analysisConfig
      })
      : null;
    const entry = cacheKey ? cache.get(cacheKey) : null;

    if (entry) {
      cachedResults.push({
        ...entry.value,
        issues: normalizeIssues(entry.value.issues),
        cacheKey,
        fromCache: true,
        status: "skipped",
        skippedReason: "cached"
      } as ModuleResult);
    }
    else {
      uncachedModules.push(module);
    }
  }

  return { cachedResults, uncachedModules };
}

/**
 * Write successful worker results to cache.
 *
 * @param {Array} workerResults Worker results from pool.processModules
 * @param {Object} cache Cache instance
 * @param {string|null} catalogueRevision Current catalogue revision
 * @returns {number} Number of cache entries written
 */
export function writeSuccessfulResultsToCache(
  workerResults: ModuleResult[],
  cache: ModuleAnalysisCache,
  catalogueRevision: string | null
): number {
  if (!catalogueRevision || workerResults.length === 0) {
    return 0;
  }

  const metaKeys = new Set(["cacheKey", "fromCache", "processingTimeMs", "cloneDir", "moduleLogger"]);
  let writtenCount = 0;

  for (const result of workerResults) {
    if (result.status === "success" && result.cacheKey) {
      const cachedData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(result)) {
        if (!metaKeys.has(key)) {
          cachedData[key] = value;
        }
      }

      cache.set(result.cacheKey, cachedData);
      writtenCount += 1;
    }
  }

  return writtenCount;
}

function createWorkerPool(workerCount: number, batchSize: number): WorkerPoolLike {
  return new WorkerPool({
    workerCount,
    batchSize,
    batchTimeoutMs: 1800000
  });
}

function buildMergedModules(modules: ModuleInput[], results: ModuleResult[]): ModuleResult[] {
  const resultsById = new Map(results.map(result => [result.id, result]));

  return modules.map((module) => {
    const result = resultsById.get(module.id);
    if (!result) {
      return {
        ...module,
        issues: normalizeIssues(module.issues),
        status: "failed",
        failurePhase: "pipeline",
        error: "No worker result available for module",
        cloned: false,
        fromCache: false,
        processingTimeMs: 0
      };
    }

    return {
      ...module,
      ...result,
      issues: normalizeIssues(result.issues || module.issues)
    };
  });
}

function summarizeResults(results: ModuleResult[], durationMs: number): Omit<ParallelProcessingResult, "durationMs" | "results" | "processedModules"> {
  const successCount = results.filter(result => result.status === "success").length;
  const failedCount = results.filter(result => result.status === "failed").length;
  const skippedCount = results.filter(result => result.status === "skipped").length;
  const cachedCount = results.filter(result => result.fromCache).length;

  return {
    averageProcessingTimeMs: results.length > 0 ? Math.round(durationMs / results.length) : 0,
    cachedCount,
    cachedPercentage: results.length > 0 ? Math.round(cachedCount / results.length * 100) : 0,
    failedCount,
    skippedCount,
    successCount
  };
}

function logProcessingSummary(results: ModuleResult[], durationMs: number, runLogger: ParallelLogger): Omit<ParallelProcessingResult, "durationMs" | "results" | "processedModules"> {
  const summary = summarizeResults(results, durationMs);

  runLogger.info("\n========== Processing Complete ==========");
  runLogger.info(`Total modules: ${results.length}`);
  runLogger.info(`Success: ${summary.successCount} | Failed: ${summary.failedCount} | Skipped: ${summary.skippedCount}`);
  runLogger.info(`Cached: ${summary.cachedCount} (${summary.cachedPercentage}%)`);
  runLogger.info(`Total time: ${(durationMs / 1000).toFixed(1)}s`);
  runLogger.info(`Average: ${summary.averageProcessingTimeMs}ms per module`);

  if (summary.failedCount > 0) {
    runLogger.warn(`\n${summary.failedCount} modules failed - check logs for details`);
  }

  return summary;
}

/**
 * Run the parallel-processing stage against an in-memory Stage 2 module list.
 *
 * @param {object} options
 * @param {Array} options.modules Stage 2 modules to process
 * @param {string} [options.projectRoot] Project root for path resolution
 * @param {number} [options.workerCount] Worker count override
 * @param {number} [options.batchSize] Batch size override
 * @param {boolean} [options.cacheDisabled] Disable cache read/write behavior
 * @param {object} [options.analysisConfig] Check-group configuration
 * @param {string|null} [options.catalogueRevision] Catalogue revision override
 * @param {object|null} [options.workerPool] Injected worker pool for tests/future orchestrator wiring
 * @param {object} [options.runLogger] Logger implementation
 * @returns {Promise<object>} Summary, results, and generated processed modules
 */
export async function runParallelProcessing({
  modules,
  projectRoot = PROJECT_ROOT,
  workerCount = Math.max(1, cpus().length - 1),
  batchSize = 50,
  cacheDisabled = false,
  localOnly = false,
  analysisConfig = DEFAULT_ANALYSIS_CONFIG,
  catalogueRevision,
  workerPool = null,
  runLogger = logger
}: RunParallelProcessingOptions): Promise<ParallelProcessingResult> {
  if (!Array.isArray(modules)) {
    throw new TypeError("runParallelProcessing requires a modules array");
  }

  cacheDisabled ||= localOnly;

  const startTime = Date.now();
  const runId = new Date(startTime).toISOString().replace(/:/gu, "-").replace(/\..+/u, "");
  const prunedLogRuns = await pruneModuleLogs(projectRoot);
  const pool = workerPool ?? createWorkerPool(workerCount, batchSize);
  const normalizedAnalysisConfig = normalizeModuleAnalysisConfig(analysisConfig) as AnalysisConfig;

  if (prunedLogRuns > 0) {
    runLogger.info(`Logs: removed ${prunedLogRuns} expired run(s)`);
  }
  runLogger.info(`Loaded ${modules.length} modules`);
  runLogger.info(`Starting parallel processing with ${workerCount} workers, batch size ${batchSize}`);

  if (localOnly) {
    runLogger.info("Local-only mode: rechecking existing clones without cloning or updating repositories; missing clones will be skipped.");
  }

  if (cacheDisabled) {
    runLogger.warn("Analysis cache disabled: all modules will be processed fresh");
  }

  let processedCount = 0;
  if (typeof pool.onProgress === "function") {
    pool.onProgress((event) => {
      if (event.type === "module" && event.status !== "started") {
        processedCount += 1;
        let status = "⊘";
        if (event.status === "success") {
          status = "✓";
        }
        else if (event.status === "failed") {
          status = "✗";
        }
        const cacheInfo = event.fromCache ? " (cached)" : "";
        runLogger.info(`[${processedCount}/${modules.length}] ${status} ${event.moduleId}${cacheInfo}`);
      }
    });
  }

  const resolvedCatalogueRevision = typeof catalogueRevision === "undefined"
    ? await getProjectRevision(projectRoot)
    : catalogueRevision;

  if (!resolvedCatalogueRevision) {
    runLogger.warn("Could not resolve current catalogue revision; module cache keys will be unavailable for this run");
  }

  const cachePath = resolveModuleAnalysisCachePath(projectRoot);
  let cache: ModuleAnalysisCache | null = null;
  let prunedCount = 0;
  let cachedResults: ModuleResult[] = [];
  let uncachedModules = modules;

  if (!cacheDisabled) {
    cache = createModuleAnalysisCache({ filePath: cachePath }) as ModuleAnalysisCache;
    await cache.load();
    prunedCount = pruneStaleCacheEntries(cache, modules, {
      catalogueRevision: resolvedCatalogueRevision,
      analysisConfig: normalizedAnalysisConfig
    });
    ({ cachedResults, uncachedModules } = partitionModulesByCache(modules, {
      cache,
      catalogueRevision: resolvedCatalogueRevision,
      analysisConfig: normalizedAnalysisConfig
    }));

    if (cachedResults.length > 0) {
      for (const result of cachedResults) {
        processedCount += 1;
        runLogger.info(`[${processedCount}/${modules.length}] ⊙ ${result.id} (cached)`);
      }
      runLogger.info(`Cache: ${cachedResults.length} hit(s), ${uncachedModules.length} to process`);
    }
  }

  const moduleConfig = {
    projectRoot,
    runId,
    localOnly,
    modulesDir: resolve(projectRoot, "modules"),
    modulesTempDir: resolve(projectRoot, "modules_temp"),
    imagesDir: resolve(projectRoot, "website/images"),
    cacheEnabled: !cacheDisabled,
    catalogueRevision: resolvedCatalogueRevision,
    analysisConfig: normalizedAnalysisConfig
  };
  const workerResults = uncachedModules.length > 0
    ? await pool.processModules(uncachedModules, moduleConfig)
    : [];
  const results = [...cachedResults, ...workerResults];
  const writtenCount = cache
    ? writeSuccessfulResultsToCache(workerResults, cache, resolvedCatalogueRevision)
    : 0;

  if (cache && (prunedCount > 0 || writtenCount > 0)) {
    await cache.flush();
    runLogger.info(`Cache: ${prunedCount} pruned, ${writtenCount} written`);
  }

  const mergedModules = buildMergedModules(modules, results);
  const processedModules = mergedModules.map(module => toProcessedModule(module));
  const durationMs = Date.now() - startTime;
  const summary = logProcessingSummary(results, durationMs, runLogger);

  return {
    ...summary,
    durationMs,
    results,
    processedModules
  };
}

type SkipCategory = "NOT_FOUND" | "AUTHENTICATION" | "NETWORK" | "INFRASTRUCTURE" | "UNKNOWN";

function classifyFailure(result: ModuleResult): SkipCategory {
  if (result.failurePhase === "not-found") return "NOT_FOUND";
  if (result.failurePhase && result.failurePhase !== "clone") {
    return "INFRASTRUCTURE";
  }
  const error = result.error?.toLowerCase() ?? "";
  if (error.includes("not found") || error.includes("does not exist")) return "NOT_FOUND";
  if (error.includes("authentication") || error.includes("permission denied") || error.includes("access denied")) return "AUTHENTICATION";
  if (error.includes("econnrefused") || error.includes("etimedout") || error.includes("enotfound") || error.includes("timeout")) return "NETWORK";
  return "UNKNOWN";
}

export async function writeSkippedModulesFile(results: ModuleResult[], projectRoot: string): Promise<void> {
  const failedResults = results.filter(r => r.status === "failed");
  const skippedEntries = failedResults.map(r => ({
    id: r.id,
    name: r.name,
    maintainer: r.maintainer,
    url: r.url,
    error: r.error ?? "Processing failed",
    reason: r.failurePhase ? `Processing failed during ${r.failurePhase}` : "Processing failed",
    metadata: {
      category: classifyFailure(r),
      ...(r.error ? { error: r.error } : {})
    }
  }));

  const outputPath = resolve(projectRoot, "website/data/skipped_modules.json");
  await writeJson(outputPath, skippedEntries);
}
