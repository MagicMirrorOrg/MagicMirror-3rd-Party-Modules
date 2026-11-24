import { createPersistentCache } from "./persistent-cache.ts";
import { getCurrentCommit } from "./git.ts";
import { resolve } from "node:path";
import { stringifyDeterministic } from "./deterministic-output.ts";

export const MODULE_ANALYSIS_CACHE_SCHEMA_VERSION = 9;
export const MODULE_ANALYSIS_CACHE_RELATIVE_PATH = "website/data/moduleCache.json";

interface ModuleAnalysisCheckGroupsInput {
  deep?: unknown;
  eslint?: unknown;
  fast?: unknown;
  ncu?: unknown;
  npmDeprecatedCheck?: unknown;
}

export interface NormalizedModuleAnalysisCheckGroups {
  deep: boolean;
  eslint: boolean;
  fast: boolean;
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
  catalogueRevision?: unknown;
  checkGroups?: ModuleAnalysisCheckGroupsInput;
  module?: ModuleAnalysisModuleInput;
  moduleRevision?: unknown;
}

interface ModuleAnalysisCacheContract {
  analysisConfig: NormalizedModuleAnalysisCheckGroups;
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

export function normalizeModuleAnalysisCheckGroups(
  checkGroups: ModuleAnalysisCheckGroupsInput = {}
): NormalizedModuleAnalysisCheckGroups {
  return {
    fast: Boolean(checkGroups.fast),
    deep: Boolean(checkGroups.deep),
    eslint: Boolean(checkGroups.eslint),
    ncu: Boolean(checkGroups.ncu),
    npmDeprecatedCheck: Boolean(checkGroups.npmDeprecatedCheck)
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
  checkGroups
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
    analysisConfig: normalizeModuleAnalysisCheckGroups(checkGroups)
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
