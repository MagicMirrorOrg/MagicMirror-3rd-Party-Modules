/* Unified metadata collector for stage 1+2 */

import {
  getRepositoryApiMetrics,
  resetRepositoryApiMetrics
} from "../repository-api/api.ts";
import { enrichModules } from "../repository-api/enrich.ts";
import { getRepositoryId } from "../repository-api/helpers.ts";
import { createHttpClient } from "../shared/http-client.ts";
import type { HttpClient } from "../shared/http-client.ts";
import { createLogger } from "../shared/logger.ts";
import { getErrorMessage } from "../shared/errors.ts";
import { createPersistentCache } from "../shared/persistent-cache.ts";
import { createRateLimiter } from "../shared/rate-limiter.ts";
import fs from "node:fs";
import { loadPreviousModules } from "../shared/module-list.ts";
import { parseModuleList } from "./parser.ts";
import type { ParsedModuleEntry } from "./parser.ts";
import path from "node:path";
import process from "node:process";

type EnrichedModule = ParsedModuleEntry;

interface FetchTextResult {
  data: string;
  ok: boolean;
  status: number;
  statusText?: string;
}

interface RunCollectMetadataOptions {
  localOnly?: boolean;
  markdown?: string;
  previousModulesMap?: Map<string, EnrichedModule>;
}

interface RunCollectMetadataResult {
  modules: EnrichedModule[];
}

/**
 * Returns true when an error message indicates a definitive "repository does not
 * exist" response (HTTP 404) rather than a transient failure.
 */
function isDefinitive404(errorMessage: string): boolean {
  return errorMessage.includes("404");
}

const logger = createLogger({ name: "collect-metadata" });

const WIKI_URL = "https://raw.githubusercontent.com/wiki/MagicMirrorOrg/MagicMirror/3rd-Party-Modules.md";
const REPOSITORY_CACHE_PATH = path.join("website", "data", "cache", "repository-api-cache.json");
const REPOSITORY_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3; // 3 days
const FORCE_REFRESH = process.env.FORCE_REFRESH === "true";

const rateLimiter = createRateLimiter({
  tokensPerInterval: 2,
  intervalMs: 1000
});

const httpClient = createHttpClient({ rateLimiter });

const repositoryCache = createPersistentCache({
  filePath: REPOSITORY_CACHE_PATH,
  defaultTtlMs: REPOSITORY_CACHE_TTL_MS,
  version: "repository-api/v3"
});

/**
 * Fetch the raw Markdown content from the Wiki or a local file.
 */
async function fetchMarkdown(): Promise<string> {
  if (process.env.WIKI_FILE) {
    logger.info(`Reading module list from local file: ${process.env.WIKI_FILE}`);
    return fs.readFileSync(process.env.WIKI_FILE, "utf8");
  }

  logger.info(`Fetching module list from Wiki: ${WIKI_URL}`);
  const result = await httpClient.getText(WIKI_URL) as FetchTextResult;
  if (!result.ok) {
    throw new Error(`Failed to fetch Wiki: ${result.status} ${result.statusText}`);
  }
  return result.data;
}

export async function runCollectMetadata({
  localOnly = false,
  markdown,
  previousModulesMap = loadPreviousModules<EnrichedModule>()
}: RunCollectMetadataOptions = {}): Promise<RunCollectMetadataResult> {
  if (localOnly) {
    if (previousModulesMap.size === 0) {
      throw new Error("--local-only requires an existing website/data/modules.json catalogue. Run the normal pipeline first.");
    }
    logger.info(`Local-only mode: using ${previousModulesMap.size} modules from the previous catalogue without fetching metadata.`);
    return {
      modules: Array.from(previousModulesMap.values(), module => ({ ...module, issues: [] }))
    };
  }

  logger.info("Starting unified metadata collection...");
  resetRepositoryApiMetrics();

  if (!process.env.GITHUB_TOKEN) {
    logger.warn("GITHUB_TOKEN is not set. Rate limits will be strict and processing may be slow.");
  }

  const markdownSource = typeof markdown === "string" ? markdown : await fetchMarkdown();
  const { modules } = parseModuleList(markdownSource);
  logger.info(`Parsed ${modules.length} modules from Wiki.`);

  for (const module of modules) {
    if (module.category === "Outdated Modules" && !module.outdated) {
      module.outdated = "This module is marked as outdated in the official module list.";
    }
  }

  await repositoryCache.load();

  const enrichedModules = await enrichModules(modules, previousModulesMap, {
    client: httpClient,
    forceRefresh: FORCE_REFRESH,
    logger,
    repositoryCache
  });
  const currentModuleIds = new Set(enrichedModules.map(module => getRepositoryId(module.url)).filter(Boolean));
  const cachedEntries = repositoryCache.getAllKeys();
  let prunedCount = 0;

  for (const cachedId of cachedEntries) {
    if (!currentModuleIds.has(cachedId)) {
      repositoryCache.delete(cachedId);
      prunedCount += 1;
    }
  }

  if (prunedCount > 0) {
    logger.info(`Pruned ${prunedCount} orphaned cache entries for modules no longer in the Wiki`);
  }

  await repositoryCache.flush();
  logger.info("Repository API diagnostics", getRepositoryApiMetrics());
  logger.info(`Collected ${enrichedModules.length} modules.`);

  return {
    modules: enrichedModules
  };
}
