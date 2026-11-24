import type { Issue } from "../check-modules/issue.ts";
import type { ModuleLogger } from "./module-logger.ts";

export interface ModuleInput {
  branch?: string;
  description?: string;
  hasGithubIssues?: boolean;
  id: string;
  isArchived?: boolean;
  issues?: unknown[];
  lastCommit?: string;
  license?: string;
  maintainer: string;
  name: string;
  outdated?: string;
  stars?: number;
  url: string;
  [key: string]: unknown;
}

export interface AnalysisConfig {
  deep?: boolean;
  eslint?: boolean;
  ncu?: boolean;
  npmDeprecatedCheck?: boolean;
}

export interface ProcessModuleConfig {
  analysisConfig?: AnalysisConfig;
  cacheEnabled: boolean;
  catalogueRevision?: string | null;
  imagesDir: string;
  localOnly?: boolean;
  moduleLogger?: ModuleLogger | null;
  modulesDir: string;
  modulesTempDir: string;
  projectRoot: string;
}

export interface PackageSummary {
  dependencies?: Record<string, string>;
  description?: string;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  keywords?: string[];
  license?: string;
  name?: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  type?: string;
  version?: string;
}

export interface PackageJsonInfo {
  error?: string;
  path: string;
  status: "error" | "missing" | "parsed";
  summary?: PackageSummary;
  warnings?: string[];
}

export interface ModuleResult {
  branch?: string;
  cacheKey?: string;
  cloneDir?: string;
  cloned: boolean;
  description?: string;
  error?: string;
  failurePhase?: string;
  fromCache: boolean;
  hasGithubIssues?: boolean;
  id: string;
  image?: string;
  isArchived?: boolean;
  issues: Issue[];
  lastCommit?: string;
  license?: string;
  licenseStatus?: "mismatch";
  maintainer: string;
  name: string;
  packageJson?: PackageJsonInfo;
  processingTimeMs: number;
  skippedReason?: string;
  stars?: number;
  status: "failed" | "skipped" | "success";
  tags?: string[];
  url: string;
}

export interface CloneResult {
  error?: string;
  success: boolean;
}

export interface FindImageResult {
  issues: Issue[];
  targetImageName: string | null;
}

export interface EnrichResult {
  enrichIssues: Issue[];
  image?: string;
  license?: string;
  licenseStatus?: "mismatch";
  packageJson: PackageJsonInfo;
  tags?: string[];
}

export interface AnalysisResult {
  analysisIssues: Issue[];
}
