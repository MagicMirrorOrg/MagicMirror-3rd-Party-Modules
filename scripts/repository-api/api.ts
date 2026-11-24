import { Buffer } from "node:buffer";
import process from "node:process";

import { getRepositoryId, getRepositoryType } from "./helpers.ts";
import type { RepositoryType } from "./helpers.ts";

interface RepositoryModuleRef {
  url: string;
}

interface RequestHeaders {
  [key: string]: string | undefined;
  Authorization?: string;
}

interface HttpResponse<TData> {
  data: TData;
  ok: boolean;
  status: number;
  statusText?: string;
}

interface HttpClientLike {
  getJson: <TData = unknown>(url: string, options?: { headers?: RequestHeaders }) => Promise<HttpResponse<TData>>;
}

type GitHubCommitCallSource = "direct" | "batch-recovery";

interface FetchRepositoryDataOptions {
  githubCommitCallSource?: GitHubCommitCallSource;
}

interface RepositoryApiData {
  archived?: boolean;
  default_branch?: string;
  defaultBranchRef?: { name?: string; target?: { committedDate?: string | null } };
  hasIssuesEnabled?: boolean;
  has_issues?: boolean;
  isArchived?: boolean;
  issues_enabled?: boolean;
  license?: { key?: string; spdx_id?: string } | null;
  licenseInfo?: { spdxId?: string | null } | null;
  licenses?: Array<string | null>;
  mainbranch?: { name?: string | null } | null;
  pushedAt?: string | null;
  pushed_at?: string | null;
  star_count?: number;
  stargazerCount?: number;
  stargazers_count?: number;
  stars_count?: number;
  subscribers_count?: number;
  watchers?: { totalCount?: number };
  watchers_count?: number;
  [key: string]: unknown;
}

interface RepositoryBranchData {
  commit?: { author?: { date?: string | null } };
  committed_date?: string | null;
  date?: string | null;
  [key: string]: unknown;
}

interface FetchRepositoryDataResult {
  branchData: RepositoryBranchData | null;
  data: RepositoryApiData;
  repoType: RepositoryType;
  response: {
    ok: boolean;
    status: number;
    statusText?: string;
  };
}

export interface NormalizedRepositoryMetadata {
  hasGithubIssues: boolean;
  isArchived: boolean;
  lastCommit: string | null;
  license: string | null;
  watchersCount?: number;
  stars: number;
}

interface RepositoryApiMetricsSnapshot {
  githubBranchCommitApiCallsBatchRecovery: number;
  githubBranchCommitApiCallsDirect: number;
  githubBranchCommitApiCalls: number;
}

const repositoryApiMetrics: RepositoryApiMetricsSnapshot = {
  githubBranchCommitApiCallsBatchRecovery: 0,
  githubBranchCommitApiCallsDirect: 0,
  githubBranchCommitApiCalls: 0
};

export function resetRepositoryApiMetrics(): void {
  repositoryApiMetrics.githubBranchCommitApiCallsBatchRecovery = 0;
  repositoryApiMetrics.githubBranchCommitApiCallsDirect = 0;
  repositoryApiMetrics.githubBranchCommitApiCalls = 0;
}

export function getRepositoryApiMetrics(): RepositoryApiMetricsSnapshot {
  return {
    githubBranchCommitApiCallsBatchRecovery: repositoryApiMetrics.githubBranchCommitApiCallsBatchRecovery,
    githubBranchCommitApiCallsDirect: repositoryApiMetrics.githubBranchCommitApiCallsDirect,
    githubBranchCommitApiCalls: repositoryApiMetrics.githubBranchCommitApiCalls
  };
}

export async function fetchRepositoryData(
  module: RepositoryModuleRef,
  httpClient: HttpClientLike,
  env: NodeJS.ProcessEnv = process.env,
  options: FetchRepositoryDataOptions = {}
): Promise<FetchRepositoryDataResult> {
  const repoType = getRepositoryType(module.url);
  const repoId = getRepositoryId(module.url);

  if (!repoId) {
    throw new Error(`Could not extract repository ID from URL: ${module.url}`);
  }

  let apiUrl = "";
  let branchUrl: string | null = null;
  const headers: RequestHeaders = {};

  switch (repoType) {
    case "github":
      apiUrl = `https://api.github.com/repos/${repoId}`;
      if (env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
      }
      break;
    case "gitlab": {
      const encodedId = encodeURIComponent(repoId);
      apiUrl = `https://gitlab.com/api/v4/projects/${encodedId}`;
      if (env.GITLAB_TOKEN) {
        headers.Authorization = `Bearer ${env.GITLAB_TOKEN}`;
      }
      break;
    }
    case "bitbucket":
      apiUrl = `https://api.bitbucket.org/2.0/repositories/${repoId}`;
      if (env.BITBUCKET_USERNAME && env.BITBUCKET_APP_PASSWORD) {
        const auth = Buffer.from(`${env.BITBUCKET_USERNAME}:${env.BITBUCKET_APP_PASSWORD}`).toString("base64");
        headers.Authorization = `Basic ${auth}`;
      }
      break;
    case "codeberg":
      apiUrl = `https://codeberg.org/api/v1/repos/${repoId}`;
      if (env.CODEBERG_TOKEN) {
        headers.Authorization = `token ${env.CODEBERG_TOKEN}`;
      }
      break;
    default:
      throw new Error(`Unsupported repository type: ${repoType}`);
  }

  const result = await httpClient.getJson<RepositoryApiData>(apiUrl, { headers });
  const data = result.data;

  let branchData: RepositoryBranchData | null = null;
  if (result.status === 200) {
    switch (repoType) {
      case "github":
        branchUrl = `https://api.github.com/repos/${repoId}/commits/${data.default_branch}`;
        break;
      case "gitlab": {
        const encodedIdForBranch = encodeURIComponent(repoId);
        branchUrl = `https://gitlab.com/api/v4/projects/${encodedIdForBranch}/repository/commits/${data.default_branch}`;
        break;
      }
      case "bitbucket":
        branchUrl = `https://api.bitbucket.org/2.0/repositories/${repoId}/commits/${data.mainbranch?.name || "main"}`;
        break;
      case "codeberg":
        branchUrl = `https://codeberg.org/api/v1/repos/${repoId}/commits?sha=${encodeURIComponent(data.default_branch || "main")}&limit=1`;
        break;
      default:
        break;
    }

    if (branchUrl) {
      if (repoType === "github") {
        repositoryApiMetrics.githubBranchCommitApiCalls += 1;
        if (options.githubCommitCallSource === "batch-recovery") {
          repositoryApiMetrics.githubBranchCommitApiCallsBatchRecovery += 1;
        }
        else {
          repositoryApiMetrics.githubBranchCommitApiCallsDirect += 1;
        }
      }
      const branchResult = await httpClient.getJson<RepositoryBranchData | RepositoryBranchData[]>(branchUrl, { headers });
      branchData = Array.isArray(branchResult.data) ? branchResult.data[0] ?? null : branchResult.data;
    }

    if (repoType === "bitbucket") {
      const watchersUrl = `https://api.bitbucket.org/2.0/repositories/${repoId}/watchers?pagelen=1`;
      const watchersResult = await httpClient.getJson<{ size?: number }>(watchersUrl, { headers });
      if (watchersResult.status === 200) {
        data.watchers_count = watchersResult.data.size ?? 0;
      }
    }
  }

  return {
    response: {
      status: result.status,
      ok: result.ok,
      statusText: result.statusText
    },
    data,
    branchData,
    repoType
  };
}

export function normalizeRepositoryData(data: RepositoryApiData, branchData: RepositoryBranchData | null, repoType: RepositoryType | string): NormalizedRepositoryMetadata {
  const isArchived = data.archived ?? data.isArchived ?? false;
  let stars = 0;
  let license: string | null = null;
  let hasGithubIssues = false;
  let lastCommit: string | null = null;
  let watchersCount: number | undefined;

  switch (repoType) {
    case "github":
      stars = data.stargazers_count ?? data.stargazerCount ?? 0;
      license = data.license?.spdx_id ?? data.licenseInfo?.spdxId ?? null;
      hasGithubIssues = data.has_issues ?? data.hasIssuesEnabled ?? false;
      lastCommit = branchData?.commit?.author?.date
        ?? data.defaultBranchRef?.target?.committedDate
        ?? data.pushed_at
        ?? data.pushedAt
        ?? null;
      // Prefer the REST subscribers_count, then GraphQL watchers.totalCount.
      watchersCount = typeof data.subscribers_count === "number"
        ? data.subscribers_count
        : (typeof data.watchers?.totalCount === "number" ? data.watchers.totalCount : undefined);
      break;
    case "gitlab":
      stars = data.star_count ?? 0;
      hasGithubIssues = data.issues_enabled ?? false;
      lastCommit = branchData?.committed_date ?? null;
      break;
    case "bitbucket":
      stars = data.watchers_count ?? 0;
      license = data.license?.key ?? null;
      hasGithubIssues = data.has_issues ?? false;
      lastCommit = branchData?.date ?? null;
      break;
    case "codeberg":
      stars = data.stars_count ?? 0;
      license = data.licenses?.[0] ?? null;
      hasGithubIssues = data.has_issues ?? false;
      lastCommit = branchData?.commit?.author?.date ?? null;
      break;
    default:
      break;
  }

  return {
    stars,
    license,
    hasGithubIssues,
    isArchived,
    lastCommit,
    watchersCount
  };
}
