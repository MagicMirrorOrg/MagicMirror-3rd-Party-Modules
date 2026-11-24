import { createPersistentCache } from "./persistent-cache.ts";
import { getCurrentCommit } from "./git.ts";
import { resolve } from "node:path";
import { stringifyDeterministic } from "./deterministic-output.ts";

export const MODULE_ANALYSIS_CACHE_SCHEMA_VERSION = 10;
export const MODULE_ANALYSIS_CACHE_RELATIVE_PATH = "website/data/moduleCache.json";

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
  id?: unknown;
  lastCommit?: unknown;
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
    id: string;
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
    return null;
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
      branch: moduleBranch
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
  defaultTtlMs = 0,
  now
}: CreateModuleAnalysisCacheOptions = {}) {
  return createPersistentCache({
    filePath,
    version: MODULE_ANALYSIS_CACHE_SCHEMA_VERSION,
    defaultTtlMs,
    now
  });
}
