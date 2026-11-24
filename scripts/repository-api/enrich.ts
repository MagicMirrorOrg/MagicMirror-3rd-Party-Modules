import {
  fetchRepositoryData,
  normalizeRepositoryData
} from "./api.ts";
import type { NormalizedRepositoryMetadata } from "./api.ts";
import { getRepositoryId, getRepositoryType } from "./helpers.ts";
import { getErrorMessage } from "../shared/errors.ts";
import type { HttpClient } from "../shared/http-client.ts";
import type { ParsedModuleEntry } from "../collect-metadata/parser.ts";

type EnrichedModule = ParsedModuleEntry;

type CachedRepositoryValue = Partial<NormalizedRepositoryMetadata> & {
  error?: string;
  isFailed?: boolean;
};

interface CachedRepositoryEntry {
  value: CachedRepositoryValue;
}

interface FetchTextResult {
  data: string;
  ok: boolean;
  status: number;
  statusText?: string;
}

interface FetchJsonResult {
  data: unknown;
  ok: boolean;
  status: number;
}

interface GraphQlRepoData {
  hasIssuesEnabled?: boolean;
  isArchived?: boolean;
  stargazerCount?: number;
  watchers?: { totalCount?: number };
  [key: string]: unknown;
}

interface GitHubBatchResult {
  error: string | null;
  failed: boolean;
  results: Record<string, GraphQlRepoData>;
}

interface ModuleStats {
  errors: number;
  fallbacks: number;
  hits: number;
  misses: number;
}

interface GitHubBatchDiagnostics {
  individualFallbackAttempts: number;
  individualFallbackSuccesses: number;
  splitRetries: number;
}

interface CircuitBreaker {
  consecutive403Errors: number;
  stopFetching: boolean;
  recordError: (error: Error) => void;
  recordSuccess: () => void;
}

interface ProcessModuleContext {
  circuitBreaker: CircuitBreaker;
  client: HttpClient;
  githubModulesToFetch: EnrichedModule[];
  previousModulesMap: Map<string, EnrichedModule>;
  stats: ModuleStats;
}

type IndividualFetchResult =
  | { data: CachedRepositoryValue; success: true }
  | { error: Error; success: false };
type IndividualFetchSource = "direct" | "batch-recovery";

interface RepositoryCache {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
}

interface EnrichModulesOptions {
  client: HttpClient;
  forceRefresh: boolean;
  logger: RepositoryEnrichmentLogger;
  repositoryCache: RepositoryCache;
}

interface RepositoryEnrichmentLogger {
  debug: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
}

const GITHUB_GRAPHQL_BATCH_SIZE = 100;
const GITHUB_GRAPHQL_MIN_BATCH_SIZE = 20;

function isDefinitive404(errorMessage: string): boolean {
  return errorMessage.includes("404");
}

function getFallbackOrOriginal(module: EnrichedModule, previousModulesMap: Map<string, EnrichedModule>): EnrichedModule {
  const previousModule = previousModulesMap.get(module.url);
  if (!previousModule) {
    return {
      ...module,
      hasGithubIssues: module.hasGithubIssues ?? null,
      isArchived: module.isArchived ?? null
    };
  }
  return {
    ...module,
    stars: previousModule.stars ?? 0,
    license: previousModule.license ?? null,
    hasGithubIssues: previousModule.hasGithubIssues ?? null,
    isArchived: previousModule.isArchived ?? null,
    lastCommit: previousModule.lastCommit ?? null
  };
}

async function fetchGitHubBatch(modules: EnrichedModule[], client: HttpClient, logger: RepositoryEnrichmentLogger): Promise<GitHubBatchResult> {
  if (modules.length === 0) {
    return { results: {}, failed: false, error: null };
  }

  const repoFragments: string[] = [];
  const aliasMap: Record<string, string> = {};
  for (const [index, module] of modules.entries()) {
    const repoId = getRepositoryId(module.url);
    if (!repoId) {
      continue;
    }
    const [owner, name] = repoId.split("/");
    const alias = `repo${index}`;
    aliasMap[alias] = module.url;
    repoFragments.push(`
      ${alias}: repository(owner: "${owner}", name: "${name}") {
        openIssues: issues(states: OPEN) { totalCount }
        stargazerCount
        watchers { totalCount }
        isArchived
        isDisabled
        hasIssuesEnabled
        pushedAt
        licenseInfo { spdxId }
        defaultBranchRef {
          name
          target { ... on Commit { committedDate } }
        }
      }
    `);
  }

  try {
    const response = await client.getJson("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: `query { ${repoFragments.join("\n")} }` })
    }) as FetchJsonResult;
    if (!response.ok) {
      logger.error(`GitHub GraphQL batch failed: ${response.status}`);
      return { results: {}, failed: true, error: `HTTP ${response.status}` };
    }

    const payload = response.data as { data?: Record<string, unknown>; errors?: Array<{ message?: string }> } | null;
    if (!payload || typeof payload !== "object") {
      return { results: {}, failed: true, error: "Invalid GraphQL payload" };
    }
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      logger.warn("GitHub GraphQL batch returned errors", {
        errorCount: payload.errors.length,
        sample: payload.errors[0]?.message ?? "unknown"
      });
    }
    if (!payload.data || typeof payload.data !== "object") {
      return { results: {}, failed: true, error: "GraphQL payload did not contain data" };
    }

    const results: Record<string, GraphQlRepoData> = {};
    for (const [alias, repoData] of Object.entries(payload.data)) {
      if (repoData) {
        results[aliasMap[alias]] = repoData as GraphQlRepoData;
      }
    }
    return { results, failed: false, error: null };
  }
  catch (error) {
    logger.error("GitHub GraphQL batch error", { error: getErrorMessage(error) });
    return { results: {}, failed: true, error: getErrorMessage(error) };
  }
}

async function fetchIndividualModule(module: EnrichedModule, repoType: string, client: HttpClient, source: IndividualFetchSource): Promise<IndividualFetchResult> {
  try {
    const { response, data, branchData } = await fetchRepositoryData(module, client, process.env, {
      githubCommitCallSource: repoType === "github" ? source : undefined
    });
    if (response && !response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText || ""}`);
    }
    return { success: true, data: normalizeRepositoryData(data, branchData, repoType) };
  }
  catch (error) {
    return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

async function fetchGitHubLastCommitFromAtom(moduleUrl: string, client: HttpClient): Promise<string | null> {
  const repoId = getRepositoryId(moduleUrl);
  if (!repoId) {
    return null;
  }
  try {
    const result = await client.getText(`https://github.com/${repoId}/commits.atom`) as FetchTextResult;
    return result.ok ? result.data.match(/<updated>([^<]+)<\/updated>/u)?.[1] ?? null : null;
  }
  catch {
    return null;
  }
}

export function detectArchivedRepositoryPage(page: string): boolean {
  return /This repository was archived by the owner\b/iu.test(page);
}

async function fetchGitHubArchivedStatus(moduleUrl: string, client: HttpClient): Promise<boolean | null> {
  try {
    const result = await client.getText(moduleUrl) as FetchTextResult;
    return result.ok ? detectArchivedRepositoryPage(result.data) : null;
  }
  catch {
    return null;
  }
}

function shouldRetryBatchWithSmallerChunks(batchFailed: boolean, batchError: string | null, chunkSize: number): boolean {
  return batchFailed
    && typeof batchError === "string"
    && batchError.toLowerCase().includes("terminated")
    && chunkSize > GITHUB_GRAPHQL_MIN_BATCH_SIZE;
}

async function appendGitHubBatchResult({
  module, batchResults, batchFailed, diagnostics, previousModulesMap, stats, enrichedModules, repositoryCache, client, logger
}: {
  module: EnrichedModule;
  batchResults: Record<string, GraphQlRepoData>;
  batchFailed: boolean;
  diagnostics: GitHubBatchDiagnostics;
  previousModulesMap: Map<string, EnrichedModule>;
  stats: ModuleStats;
  enrichedModules: EnrichedModule[];
  repositoryCache: RepositoryCache;
  client: HttpClient;
  logger: RepositoryEnrichmentLogger;
}): Promise<void> {
  const repoData = batchResults[module.url];
  const repoId = getRepositoryId(module.url);
  if (!repoId) {
    enrichedModules.push(getFallbackOrOriginal(module, previousModulesMap));
    stats.errors += 1;
    return;
  }
  if (repoData) {
    logger.debug(`GraphQL data for ${module.name}:`, repoData);
    const normalized = normalizeRepositoryData(repoData, null, "github");
    repositoryCache.set(repoId, normalized);
    enrichedModules.push({ ...module, ...normalized });
    return;
  }
  if (!batchFailed) {
    logger.warn(`No data returned for ${module.name} in batch`, { url: module.url });
  }
  if (batchFailed) {
    diagnostics.individualFallbackAttempts += 1;
  }
  const recovery = await fetchIndividualModule(module, "github", client, "batch-recovery");
  if (recovery.success) {
    if (batchFailed) {
      diagnostics.individualFallbackSuccesses += 1;
      logger.info(`Recovered ${module.name} via individual GitHub fetch after batch failure`);
    }
    repositoryCache.set(repoId, recovery.data);
    enrichedModules.push({ ...module, ...recovery.data });
    return;
  }
  logger.warn(`Failed to recover metadata for ${module.name}`, { url: module.url, error: recovery.error.message });
  const fallback = getFallbackOrOriginal(module, previousModulesMap);
  if (fallback !== module) {
    logger.info(`Using fallback data for ${module.name} (batch failure)`);
    stats.fallbacks += 1;
  }
  enrichedModules.push(isDefinitive404(recovery.error.message) ? { ...fallback, notFound: true } : fallback);
  stats.errors += 1;
}

async function processGitHubChunk(options: {
  chunk: EnrichedModule[];
  chunkStart: number;
  diagnostics: GitHubBatchDiagnostics;
  previousModulesMap: Map<string, EnrichedModule>;
  stats: ModuleStats;
  enrichedModules: EnrichedModule[];
  repositoryCache: RepositoryCache;
  client: HttpClient;
  logger: RepositoryEnrichmentLogger;
}): Promise<void> {
  const { results, failed, error } = await fetchGitHubBatch(options.chunk, options.client, options.logger);
  if (shouldRetryBatchWithSmallerChunks(failed, error, options.chunk.length)) {
    options.diagnostics.splitRetries += 1;
    const splitPoint = Math.ceil(options.chunk.length / 2);
    options.logger.warn("GitHub GraphQL chunk terminated, retrying with smaller batches", {
      chunkStart: options.chunkStart,
      chunkSize: options.chunk.length,
      leftChunkSize: splitPoint,
      rightChunkSize: options.chunk.length - splitPoint,
      error
    });
    await processGitHubChunk({ ...options, chunk: options.chunk.slice(0, splitPoint), chunkStart: options.chunkStart });
    const rightChunk = options.chunk.slice(splitPoint);
    if (rightChunk.length > 0) {
      await processGitHubChunk({ ...options, chunk: rightChunk, chunkStart: options.chunkStart + splitPoint });
    }
    return;
  }
  if (failed) {
    options.logger.warn("GitHub GraphQL chunk failed, retrying repositories individually", {
      chunkStart: options.chunkStart,
      chunkSize: options.chunk.length,
      error
    });
  }
  for (const module of options.chunk) {
    await appendGitHubBatchResult({
      module,
      batchResults: results,
      batchFailed: failed,
      ...options
    });
  }
}

async function processModule(module: EnrichedModule, context: ProcessModuleContext, options: EnrichModulesOptions): Promise<EnrichedModule | null> {
  const { previousModulesMap, circuitBreaker, stats, githubModulesToFetch, client } = context;
  const repoId = getRepositoryId(module.url);
  if (!repoId) {
    const fallback = getFallbackOrOriginal(module, previousModulesMap);
    stats.errors += 1;
    if (fallback !== module) {
      stats.fallbacks += 1;
    }
    return fallback;
  }
  const cachedEntry = options.repositoryCache.get(repoId) as CachedRepositoryEntry | null;
  const cachedValue = cachedEntry?.value;
  if (!options.forceRefresh && cachedValue && !cachedValue.isFailed) {
    stats.hits += 1;
    return { ...module, ...cachedValue };
  }
  stats.misses += 1;
  if (circuitBreaker.stopFetching) {
    const fallback = getFallbackOrOriginal(module, previousModulesMap);
    if (fallback !== module) {
      stats.fallbacks += 1;
    }
    return fallback;
  }

  const repoType = getRepositoryType(module.url);
  if (repoType === "github" && process.env.GITHUB_TOKEN) {
    githubModulesToFetch.push(module);
    return null;
  }
  const recovery = await fetchIndividualModule(module, repoType, client, "direct");
  if (recovery.success) {
    circuitBreaker.recordSuccess();
    options.repositoryCache.set(repoId, recovery.data);
    return { ...module, ...recovery.data };
  }

  if (repoType === "github" && !process.env.GITHUB_TOKEN && recovery.error.message.includes("403")) {
    const [lastCommitFromAtom, archivedFromPage] = await Promise.all([
      fetchGitHubLastCommitFromAtom(module.url, client),
      fetchGitHubArchivedStatus(module.url, client)
    ]);
    if (lastCommitFromAtom || typeof archivedFromPage === "boolean") {
      const atomRecovery: CachedRepositoryValue = {
        lastCommit: lastCommitFromAtom,
        isArchived: archivedFromPage ?? (typeof module.isArchived === "boolean" ? module.isArchived : undefined),
        hasGithubIssues: typeof module.hasGithubIssues === "boolean" ? module.hasGithubIssues : undefined
      };
      options.repositoryCache.set(repoId, atomRecovery);
      options.logger.info(`Recovered ${module.name} lastCommit via GitHub Atom fallback`);
      return { ...module, ...atomRecovery };
    }
  }

  options.logger.warn(`Failed to fetch metadata for ${module.name}`, { url: module.url, error: recovery.error.message });
  circuitBreaker.recordError(recovery.error);
  const fallback = getFallbackOrOriginal(module, previousModulesMap);
  if (fallback !== module) {
    stats.fallbacks += 1;
  }
  stats.errors += 1;
  return isDefinitive404(recovery.error.message) ? { ...fallback, notFound: true } : fallback;
}

export async function enrichModules(modules: ParsedModuleEntry[], previousModulesMap: Map<string, EnrichedModule>, options: EnrichModulesOptions): Promise<EnrichedModule[]> {
  const enrichedModules: EnrichedModule[] = [];
  const githubModulesToFetch: EnrichedModule[] = [];
  const stats: ModuleStats = { hits: 0, misses: 0, errors: 0, fallbacks: 0 };
  const diagnostics: GitHubBatchDiagnostics = { splitRetries: 0, individualFallbackAttempts: 0, individualFallbackSuccesses: 0 };
  const circuitBreaker: CircuitBreaker = {
    consecutive403Errors: 0,
    stopFetching: false,
    recordError(error) {
      if (error.message.includes("403")) {
        this.consecutive403Errors += 1;
        if (this.consecutive403Errors >= 5) {
          options.logger.warn("Rate limit hit (403) multiple times. Stopping further API requests and using fallback data.");
          this.stopFetching = true;
        }
      }
      else {
        this.consecutive403Errors = 0;
      }
    },
    recordSuccess() {
      this.consecutive403Errors = 0;
    }
  };
  const context: ProcessModuleContext = { previousModulesMap, circuitBreaker, stats, githubModulesToFetch, client: options.client };

  for (const [index, module] of modules.entries()) {
    if ((index + 1) % 50 === 0) {
      options.logger.info(`Processed ${index + 1}/${modules.length} modules (Cache/Pre-sort)...`);
    }
    const result = await processModule({ ...module }, context, options);
    if (result) {
      enrichedModules.push(result);
    }
  }

  if (githubModulesToFetch.length > 0) {
    options.logger.info(`Batch fetching ${githubModulesToFetch.length} GitHub repositories...`);
    for (let index = 0; index < githubModulesToFetch.length; index += GITHUB_GRAPHQL_BATCH_SIZE) {
      await processGitHubChunk({
        chunk: githubModulesToFetch.slice(index, index + GITHUB_GRAPHQL_BATCH_SIZE),
        chunkStart: index,
        diagnostics,
        previousModulesMap,
        stats,
        enrichedModules,
        repositoryCache: options.repositoryCache,
        client: options.client,
        logger: options.logger
      });
    }
    options.logger.info("GitHub batch diagnostics", diagnostics);
  }
  options.logger.info("Metadata collection stats", stats);
  return enrichedModules;
}
