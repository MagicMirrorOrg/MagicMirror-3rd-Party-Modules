import fs from "node:fs";

export type RepositoryType = "github" | "gitlab" | "bitbucket" | "codeberg" | "unknown";

export interface RepositoryModuleLike {
  hasGithubIssues?: boolean;
  id: string;
  isArchived?: boolean;
  license?: string | null;
  name: string;
  stars?: number;
  url: string;
  [key: string]: unknown;
}

export interface NormalizedRepositoryData {
  archived: boolean;
  disabled?: boolean;
  has_issues: boolean;
  issues?: number;
  lastCommit: string | null;
  license: string | null;
  stars: number;
  defaultBranch?: string | null;
}

export interface RepositoryDataRecord {
  gitHubData: NormalizedRepositoryData;
  gitHubDataLastUpdate: string | null;
  id: string;
}

export interface PreviousRepositoryData {
  repositories?: RepositoryDataRecord[];
  [key: string]: unknown;
}

export interface RepositoryCacheEntry {
  updatedAt?: string;
  value: NormalizedRepositoryData;
}

export interface RepositoryCacheLike {
  get: (key: string) => RepositoryCacheEntry | undefined;
}

export interface PartitionModulesOptions<TModule extends RepositoryModuleLike> {
  cache: RepositoryCacheLike;
  moduleList: TModule[];
  previousData: PreviousRepositoryData;
  results: RepositoryDataRecord[];
  shouldFetchCallback?: (module: TModule) => boolean;
}

export interface PartitionModulesResult<TModule extends RepositoryModuleLike> {
  cacheKeys: Map<string, string>;
  githubModules: TModule[];
  otherModules: TModule[];
  processedCount: number;
}

const REPOSITORY_HOSTS: ReadonlyMap<string, Exclude<RepositoryType, "unknown">> = new Map([
  ["github.com", "github"],
  ["www.github.com", "github"],
  ["gitlab.com", "gitlab"],
  ["www.gitlab.com", "gitlab"],
  ["bitbucket.org", "bitbucket"],
  ["www.bitbucket.org", "bitbucket"],
  ["codeberg.org", "codeberg"],
  ["www.codeberg.org", "codeberg"]
]);

function normalizeRepositoryUrl(url: string): string {
  return url.startsWith("git+https://") || url.startsWith("git+http://")
    ? url.slice(4)
    : url;
}

function parseRepositoryUrl(url: string): URL | null {
  try {
    return new URL(normalizeRepositoryUrl(url));
  }
  catch {
    return null;
  }
}

function getRepositoryUrlParts(url: string): { pathParts: string[]; type: Exclude<RepositoryType, "unknown"> } | null {
  const parsedUrl = parseRepositoryUrl(url);
  if (!parsedUrl) {
    return null;
  }

  const type = REPOSITORY_HOSTS.get(parsedUrl.hostname.toLowerCase());
  if (!type) {
    return null;
  }

  const rawPathParts = parsedUrl.pathname.split("/").filter(Boolean);
  const pathParts = rawPathParts.map((part, index) =>
    index === rawPathParts.length - 1 ? part.replace(/\.git$/u, "") : part
  );

  return { type, pathParts };
}

export function getRepositoryType(url: string): RepositoryType {
  return getRepositoryUrlParts(url)?.type ?? "unknown";
}

export function getRepositoryId(url: string): string | null {
  const repositoryUrlParts = getRepositoryUrlParts(url);
  if (repositoryUrlParts && repositoryUrlParts.pathParts.length >= 2) {
    return `${repositoryUrlParts.pathParts[0]}/${repositoryUrlParts.pathParts[1]}`;
  }
  return null;
}

export function isRepositoryType(url: string, repositoryType: Exclude<RepositoryType, "unknown">): boolean {
  return getRepositoryUrlParts(url)?.type === repositoryType;
}

export function sortModuleListByLastUpdate<TModule extends RepositoryModuleLike>(previousData: PreviousRepositoryData, moduleList: TModule[]): void {
  moduleList.sort((a, b) => {
    const lastUpdateA = previousData.repositories?.find(repo => repo.id === a.id)?.gitHubDataLastUpdate;
    const lastUpdateB = previousData.repositories?.find(repo => repo.id === b.id)?.gitHubDataLastUpdate;

    if (!lastUpdateA && !lastUpdateB) {
      return 0;
    }

    if (!lastUpdateA) {
      return -1;
    }

    if (!lastUpdateB) {
      return 1;
    }

    return new Date(lastUpdateA).getTime() - new Date(lastUpdateB).getTime();
  });
}

export function sortByNameIgnoringPrefix<TModule extends Pick<RepositoryModuleLike, "name">>(a: TModule, b: TModule): number {
  const nameA = a.name.replace("MMM-", "");
  const nameB = b.name.replace("MMM-", "");
  return nameA.localeCompare(nameB);
}

export async function loadPreviousData(remoteFilePath: string, localFilePath: string): Promise<PreviousRepositoryData> {
  let previousData: PreviousRepositoryData = {};
  try {
    const response = await fetch(remoteFilePath);
    if (response.ok) {
      previousData = await response.json() as PreviousRepositoryData;
    }
    else if (fs.existsSync(localFilePath)) {
      previousData = JSON.parse(fs.readFileSync(localFilePath, "utf8")) as PreviousRepositoryData;
    }
    else {
      console.warn(`Local file ${localFilePath} does not exist.`);
    }
  }
  catch (error) {
    console.error("Error fetching remote data, falling back to local file:", error);
    try {
      previousData = JSON.parse(fs.readFileSync(localFilePath, "utf8")) as PreviousRepositoryData;
    }
    catch (localError) {
      console.error("Error reading local data:", localError);
    }
  }
  return previousData;
}

export function createDefaultRepositoryData<TModule extends RepositoryModuleLike>({ repositoryId, module }: { module: TModule; repositoryId: string }): RepositoryDataRecord {
  if (typeof module.stars !== "number") {
    module.stars = 0;
  }
  if (typeof module.hasGithubIssues !== "boolean") {
    module.hasGithubIssues = true;
  }
  if (typeof module.isArchived !== "boolean") {
    module.isArchived = false;
  }

  return {
    id: repositoryId,
    gitHubDataLastUpdate: null,
    gitHubData: {
      issues: 0,
      stars: module.stars,
      license: module.license ?? null,
      archived: module.isArchived === true,
      disabled: false,
      defaultBranch: null,
      has_issues: module.hasGithubIssues,
      lastCommit: null
    }
  };
}

export function getRepositoryCacheKey(module: Pick<RepositoryModuleLike, "url">): string | null {
  const repoType = getRepositoryType(module.url);
  const repoId = getRepositoryId(module.url);
  if (!repoId || repoType === "unknown") {
    return null;
  }
  return `${repoType}:${repoId.toLowerCase()}`;
}

export function applyRepositoryData<TModule extends RepositoryModuleLike>(module: TModule, normalizedData: NormalizedRepositoryData): void {
  module.stars = normalizedData.stars;
  if (normalizedData.has_issues === false) {
    module.hasGithubIssues = false;
  }
  if (normalizedData.archived === true) {
    module.isArchived = true;
  }
  if (normalizedData.license) {
    module.license = normalizedData.license;
  }
}

export function createRepositoryDataRecord({ moduleId, normalizedData, timestamp }: { moduleId: string; normalizedData: NormalizedRepositoryData; timestamp: string }): RepositoryDataRecord {
  return {
    id: moduleId,
    gitHubDataLastUpdate: timestamp,
    gitHubData: normalizedData
  };
}

export function partitionModules<TModule extends RepositoryModuleLike>({ moduleList, previousData, results, cache, shouldFetchCallback }: PartitionModulesOptions<TModule>): PartitionModulesResult<TModule> {
  const githubModules: TModule[] = [];
  const otherModules: TModule[] = [];
  const cacheKeys = new Map<string, string>();
  let processedCount = 0;

  for (const module of moduleList) {
    const cacheKey = getRepositoryCacheKey(module);
    let handledByCache = false;

    if (cacheKey) {
      cacheKeys.set(module.id, cacheKey);
      const cacheEntry = cache.get(cacheKey);
      if (cacheEntry) {
        applyRepositoryData(module, cacheEntry.value);
        const record = createRepositoryDataRecord({
          moduleId: module.id,
          normalizedData: cacheEntry.value,
          timestamp: cacheEntry.updatedAt ?? new Date().toISOString()
        });
        results.push(record);
        processedCount += 1;
        handledByCache = true;
      }
    }

    if (!handledByCache) {
      const shouldFetchData = shouldFetchCallback ? shouldFetchCallback(module) : true;
      if (shouldFetchData) {
        const repoType = getRepositoryType(module.url);
        if (repoType === "github") {
          githubModules.push(module);
        }
        else {
          otherModules.push(module);
        }
      }
      else {
        useHistoricalData(previousData, module.id, module, results);
        processedCount += 1;
      }
    }
  }

  return { githubModules, otherModules, cacheKeys, processedCount };
}

export function useHistoricalData<TModule extends RepositoryModuleLike>(previousData: PreviousRepositoryData, repositoryId: string, module: TModule, results: RepositoryDataRecord[]): void {
  const existingRepository = previousData.repositories?.find(repo => repo.id === repositoryId);
  if (existingRepository) {
    applyRepositoryData(module, existingRepository.gitHubData);
    results.push(existingRepository);
    return;
  }

  const fallbackData = createDefaultRepositoryData({ repositoryId, module });
  results.push(fallbackData);
}
