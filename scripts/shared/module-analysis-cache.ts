import { createPersistentCache } from "./persistent-cache.ts";
import { getCurrentCommit } from "./git.ts";
import process from "node:process";
import { resolve } from "node:path";
import { stringifyDeterministic } from "./deterministic-output.ts";

export const MODULE_ANALYSIS_CACHE_SCHEMA_VERSION = 11;
export const MODULE_ANALYSIS_CACHE_RELATIVE_PATH = "website/data/moduleCache.json";
const MODULE_ANALYSIS_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3;

interface ModuleAnalysisConfigInput {
  deep?: unknown;
  eslint?: unknown;
  ncu?: unknown;
  npmDeprecatedCheck?: unknown;
}

export interface NormalizedModuleAnalysisConfig {
  deep: boolean;
  eslint: boolean;
  ncu: boolean;
  npmDeprecatedCheck: boolean;
}

interface ModuleAnalysisModuleInput {
  branch?: unknown;
  hasGithubIssues?: unknown;
  id?: unknown;
  isArchived?: unknown;
  issues?: unknown;
  lastCommit?: unknown;
  license?: unknown;
  maintainer?: unknown;
  name?: unknown;
  outdated?: unknown;
  url?: unknown;
}

interface BuildModuleAnalysisCacheContractInput {
  analysisConfig?: ModuleAnalysisConfigInput;
  catalogueRevision?: unknown;
  module?: ModuleAnalysisModuleInput;
  moduleRevision?: unknown;
}

interface ModuleAnalysisCacheContract {
  analysisConfig: NormalizedModuleAnalysisConfig;
  module: {
    branch: string | null;
    hasGithubIssues: unknown;
    id: string;
    isArchived: unknown;
    issues: unknown;
    license: unknown;
    maintainer: unknown;
    name: unknown;
    outdated: unknown;
    url: string;
  };
  repoFreshness: {
    catalogueRevision: string;
    moduleRevision: string;
  };
  schemaVersion: number;
}

interface CreateModuleAnalysisCacheOptions {
  defaultTtlMs?: number;
  filePath?: string;
  now?: () => number;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeModuleAnalysisConfig(
  analysisConfig: ModuleAnalysisConfigInput = {}
): NormalizedModuleAnalysisConfig {
  return {
    deep: Boolean(analysisConfig.deep),
    eslint: Boolean(analysisConfig.eslint),
    ncu: Boolean(analysisConfig.ncu),
    npmDeprecatedCheck: Boolean(analysisConfig.npmDeprecatedCheck)
  };
}

export function resolveModuleAnalysisCachePath(projectRoot: string): string {
  if (typeof projectRoot !== "string" || projectRoot.trim().length === 0) {
    throw new TypeError("resolveModuleAnalysisCachePath requires a non-empty projectRoot");
  }

  return resolve(projectRoot, MODULE_ANALYSIS_CACHE_RELATIVE_PATH);
}

export async function getProjectRevision(projectRoot: string): Promise<string | null> {
  try {
    return await getCurrentCommit({ cwd: projectRoot });
  }
  catch {
    const revision = process.env.PIPELINE_CATALOGUE_REVISION?.trim();
    return revision && /^(?:[\da-f]{40}|[\da-f]{64})$/iu.test(revision) ? revision : null;
  }
}

export function buildModuleAnalysisCacheContract({
  module,
  moduleRevision,
  catalogueRevision,
  analysisConfig
}: BuildModuleAnalysisCacheContractInput = {}): ModuleAnalysisCacheContract | null {
  const moduleId = normalizeOptionalString(module?.id);
  const moduleUrl = normalizeOptionalString(module?.url);
  const moduleBranch = normalizeOptionalString(module?.branch);
  const normalizedModuleRevision = normalizeOptionalString(moduleRevision ?? module?.lastCommit);
  const normalizedCatalogueRevision = normalizeOptionalString(catalogueRevision);

  if (!moduleId || !moduleUrl || !normalizedModuleRevision || !normalizedCatalogueRevision) {
    return null;
  }

  return {
    schemaVersion: MODULE_ANALYSIS_CACHE_SCHEMA_VERSION,
    module: {
      id: moduleId,
      url: moduleUrl,
      branch: moduleBranch,
      name: module?.name ?? null,
      maintainer: module?.maintainer ?? null,
      license: module?.license ?? null,
      outdated: module?.outdated ?? null,
      isArchived: module?.isArchived ?? null,
      hasGithubIssues: module?.hasGithubIssues ?? null,
      issues: module?.issues ?? []
    },
    repoFreshness: {
      moduleRevision: normalizedModuleRevision,
      catalogueRevision: normalizedCatalogueRevision
    },
    analysisConfig: normalizeModuleAnalysisConfig(analysisConfig)
  };
}

export function buildModuleAnalysisCacheKey(options: BuildModuleAnalysisCacheContractInput = {}): string | null {
  const contract = buildModuleAnalysisCacheContract(options);
  if (!contract) {
    return null;
  }

  return stringifyDeterministic(contract, 0);
}

export function createModuleAnalysisCache({
  filePath,
  defaultTtlMs = MODULE_ANALYSIS_CACHE_TTL_MS,
  now
}: CreateModuleAnalysisCacheOptions = {}) {
  return createPersistentCache({
    filePath,
    version: MODULE_ANALYSIS_CACHE_SCHEMA_VERSION,
    defaultTtlMs,
    now
  });
}
