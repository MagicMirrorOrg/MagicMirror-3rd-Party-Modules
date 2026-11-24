import type { Issue } from "../check-modules/issue.ts";

export interface CatalogueModule {
  branch?: string;
  category?: string;
  description?: string;
  hasGithubIssues?: boolean | null;
  id: string;
  image?: string;
  isArchived?: boolean | null;
  issues?: Issue[];
  keywords?: string[];
  lastCommit?: string | null;
  license?: string | null;
  maintainer: string;
  maintainerURL?: string;
  name: string;
  notFound?: boolean;
  outdated?: string;
  stars?: number;
  tags?: string[];
  url: string;
  watchersCount?: number;
}

export interface ProcessedModule extends CatalogueModule {
  issues: Issue[];
  error?: string;
  failurePhase?: string;
  licenseStatus?: "mismatch";
  packageJson?: unknown;
  skippedReason?: string;
  status?: "failed" | "skipped" | "success";
}
