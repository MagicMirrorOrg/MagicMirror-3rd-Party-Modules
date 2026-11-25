export type RepositoryType = "github" | "gitlab" | "bitbucket" | "codeberg" | "unknown";

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
