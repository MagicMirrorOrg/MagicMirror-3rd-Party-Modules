import { ensureDirectory, fileExists } from "../../scripts/shared/fs-utils.ts";
import { ensureRepository, getCommitDate } from "../../scripts/shared/git.ts";
import { isRepositoryType } from "../../scripts/updateRepositoryApiData/helpers.ts";
import { rename, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { getRuleById } from "../../scripts/check-modules/rule-registry.ts";
import { buildModuleAnalysisCacheKey } from "../../scripts/shared/module-analysis-cache.ts";
import { createDeterministicImageName } from "../../scripts/shared/deterministic-output.ts";
import { createLogger } from "../../scripts/shared/logger.ts";
import { analyzeModule as performModuleAnalysis } from "../../scripts/check-modules/module-analyzer.ts";
import fs from "node:fs";
import normalizeData from "normalize-package-data";
import path from "node:path";
import sharp from "sharp";
import { promisify } from "node:util";
import type { ModuleLogger } from "./module-logger.ts";

const logger = createLogger({ name: "worker" });
const execFileAsync = promisify(execFile);
export const NCU_COOLDOWN = "7d";

interface ModuleInput {
  branch?: string;
  description?: string;
  hasGithubIssues?: boolean;
  id: string;
  isArchived?: boolean;
  issues?: string[];
  lastCommit?: string;
  license?: string;
  maintainer: string;
  name: string;
  outdated?: string;
  stars?: number;
  url: string;
  [key: string]: unknown;
}

interface AnalysisConfig {
  deep?: boolean;
  eslint?: boolean;
  fast?: boolean;
  ncu?: boolean;
  npmDeprecatedCheck?: boolean;
  [key: string]: unknown;
}

interface ProcessModuleConfig {
  analysisConfig?: AnalysisConfig;
  cacheEnabled: boolean;
  cachePath?: string;
  cacheSchemaVersion?: number;
  catalogueRevision?: string | null;
  checkGroups?: AnalysisConfig;
  imagesDir: string;
  localOnly?: boolean;
  moduleLogger?: ModuleLogger | null;
  modulesDir: string;
  modulesTempDir: string;
  projectRoot: string;
  timeoutMs?: number;
}

interface PackageSummary {
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

interface PackageJsonInfo {
  error?: string;
  path: string;
  status: "error" | "missing" | "parsed";
  summary?: PackageSummary;
  warnings?: string[];
}

interface ModuleResult {
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
  issues: string[];
  lastCommit?: string;
  license?: string;
  licenseStatus?: "mismatch";
  maintainer: string;
  name: string;
  packageJson?: PackageJsonInfo;
  processingTimeMs: number;
  recommendations?: string[];
  skippedReason?: string;
  stars?: number;
  status: "failed" | "skipped" | "success";
  tags?: string[];
  url: string;
}

interface CloneResult {
  error?: string;
  success: boolean;
}

interface FindImageResult {
  issues: string[];
  targetImageName: string | null;
}

interface EnrichResult {
  enrichIssues: string[];
  image?: string;
  license?: string;
  licenseStatus?: "mismatch";
  packageJson: PackageJsonInfo;
  tags?: string[];
}

interface AnalysisResult {
  analysisIssues: string[];
  recommendations: string[];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeIssueList(issues: unknown): string[] {
  if (Array.isArray(issues)) {
    return issues.filter((issue): issue is string => typeof issue === "string" && issue.length > 0);
  }

  if (typeof issues === "string" && issues.length > 0) {
    return [issues];
  }

  return [];
}

export function getRepositoryStatusIssues(module: Pick<ModuleInput, "url" | "hasGithubIssues" | "isArchived">): string[] {
  if (!isRepositoryType(module.url, "github")) {
    return [];
  }

  const issues: string[] = [];
  if (module.hasGithubIssues === false) {
    issues.push("Issues are not enabled in the GitHub repository. So users cannot report bugs. Please enable issues in your repo.");
  }

  if (module.isArchived === true) {
    issues.push("This GitHub repository is archived and read-only. It may no longer receive fixes or updates.");
  }

  return issues;
}

function mergeUniqueIssues(target: string[], issues: unknown): void {
  const existing = new Set(target);
  for (const issue of normalizeIssueList(issues)) {
    if (!existing.has(issue)) {
      target.push(issue);
      existing.add(issue);
    }
  }
}

async function runNpmCheckUpdates(moduleDir: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("npx", ["npm-check-updates", "--jsonUpgraded", "--cooldown", NCU_COOLDOWN], {
      cwd: moduleDir,
      timeout: 60_000
    });

    const output = String(stdout ?? "").trim();
    if (!output) {
      return [];
    }

    const parsed = JSON.parse(output) as Record<string, string>;
    return Object.entries(parsed).map(([dependency, targetVersion]) => `${dependency} -> ${targetVersion}`);
  }
  catch (error) {
    logger.warn(`npm-check-updates failed in ${moduleDir}: ${getErrorMessage(error)}`);
    return [];
  }
}

async function runDeprecatedCheck(moduleDir: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync("npx", ["ndc", "current"], {
      cwd: moduleDir,
      timeout: 60_000
    });

    const output = `${String(stdout ?? "")}${String(stderr ?? "")}`.trim();
    if (!output || output.includes("There are no deprecated dependencies.")) {
      return null;
    }

    const lines = output
      .split(/\r?\n/u)
      .map(line => line.trim())
      .filter(line => line.includes(":"));

    if (lines.length === 0) {
      return null;
    }

    return lines.join("\n");
  }
  catch (error) {
    logger.warn(`npm-deprecated-check failed in ${moduleDir}: ${getErrorMessage(error)}`);
    return null;
  }
}

export async function runEslintCheck(moduleDir: string, includeGeneralChecks = true): Promise<string[]> {
  const moduleOverrides = path.basename(path.resolve(moduleDir)).startsWith("MMM-Remote-Control")
    ? [{
        files: ["**/node_helper.js"],
        languageOptions: {
          globals: {
            Module: "writable"
          }
        }
      }]
    : [];
  const eslint = new ESLint({
    cwd: path.resolve(moduleDir),
    overrideConfigFile: fileURLToPath(new URL("../../eslint.testconfig.js", import.meta.url)),
    overrideConfig: moduleOverrides,
    allowInlineConfig: false,
    errorOnUnmatchedPattern: false,
    fix: false
  });
  const results = await eslint.lintFiles(["**/*.{js,mjs,cjs,yaml,yml}", "**/package.json"]);
  const issues: string[] = [];
  const generalIssues: string[] = [];
  for (const result of results) {
    const relativePath = path.relative(moduleDir, result.filePath);
    for (const message of result.messages) {
      if (message.ruleId === "eslintN/no-deprecated-api") {
        const rule = getRuleById("text-deprecated-node-api");
        if (rule) {
          issues.push(`${rule.category}: In \`${relativePath}:${message.line}:${message.column}\`: ${message.message}`);
        }
      }
      else if (message.ruleId?.startsWith("magicmirror/")) {
        const rule = message.messageId ? getRuleById(message.messageId) : null;
        if (rule) {
          issues.push(`${rule.category}: In \`${relativePath}:${message.line}:${message.column}\`: ${message.message}`);
        }
      }
      else if (includeGeneralChecks || message.fatal) {
        generalIssues.push(`ESLint: ${relativePath}: Line ${message.line}, Column ${message.column}: ${message.message} (rule: ${message.ruleId})`);
      }
    }
  }
  issues.push(...generalIssues);
  return issues;
}

async function applyDependencyIntegrations(moduleDir: string, issues: string[], config: ProcessModuleConfig): Promise<void> {
  const analysisConfig = config.analysisConfig ?? config.checkGroups ?? {};

  if (analysisConfig.deep === false) {
    return;
  }

  const packageJsonPath = path.join(moduleDir, "package.json");
  if (!fileExists(packageJsonPath)) {
    return;
  }

  if (issues.length >= 4) {
    return;
  }

  if (analysisConfig.ncu !== false) {
    const upgrades = await runNpmCheckUpdates(moduleDir);
    if (upgrades.length > 0) {
      const header = `Information: There are updates for ${upgrades.length} dependencie(s):`;
      const details = upgrades.map(entry => `   - ${entry}`).join("\n");
      mergeUniqueIssues(issues, [`${header}\n${details}`]);
    }
  }

  if (issues.length >= 3) {
    return;
  }

  if (analysisConfig.npmDeprecatedCheck !== false) {
    const deprecated = await runDeprecatedCheck(moduleDir);
    if (deprecated) {
      mergeUniqueIssues(issues, [deprecated]);
    }
  }

}

/**
 * @typedef {Object} ModuleInput
 * @property {string} name
 * @property {string} maintainer
 * @property {string} url
 * @property {string} [branch]
 * @property {string} [description]
 * @property {string} id
 * @property {number} [stars]
 * @property {string} [lastCommit]
 * @property {string} [license]
 * @property {boolean} [isArchived]
 * @property {boolean} [hasGithubIssues]
 * @property {string[]} [issues]
 */

/**
 * @typedef {Object} ProcessModuleConfig
 * @property {string} projectRoot
 * @property {string} modulesDir
 * @property {string} modulesTempDir
 * @property {string} imagesDir
 * @property {boolean} cacheEnabled
 * @property {string} [cachePath]
 * @property {number} [cacheSchemaVersion]
 * @property {string | null} [catalogueRevision]
 * @property {Object} [analysisConfig]
 * @property {boolean} [analysisConfig.fast]
 * @property {boolean} [analysisConfig.deep]
 * @property {boolean} [analysisConfig.eslint]
 * @property {boolean} [analysisConfig.ncu]
 * @property {boolean} [analysisConfig.npmDeprecatedCheck]
 * @property {Object} [checkGroups]
 * @property {boolean} [checkGroups.fast]
 * @property {boolean} [checkGroups.deep]
 * @property {boolean} [checkGroups.eslint]
 * @property {boolean} [checkGroups.ncu]
 * @property {boolean} [checkGroups.npmDeprecatedCheck]
 * @property {number} [timeoutMs]
 * @property {Object} [moduleLogger] - Per-module logger instance
 */

/**
 * @typedef {Object} ModuleResult
 * @property {string} name
 * @property {string} maintainer
 * @property {string} id
 * @property {string} url
 * @property {string} [description]
 * @property {'success'|'skipped'|'failed'} status
 * @property {string} [skippedReason]
 * @property {string} [failurePhase]
 * @property {string} [error]
 * @property {boolean} cloned
 * @property {string} [cloneDir]
 * @property {string} [branch]
 * @property {PackageJsonInfo} [packageJson]
 * @property {string} [image]
 * @property {string[]} [tags]
 * @property {string} [license]
 * @property {string[]} issues
 * @property {string[]} [recommendations]
 * @property {number} [stars]
 * @property {string} [lastCommit]
 * @property {boolean} [isArchived]
 * @property {boolean} [hasGithubIssues]
 * @property {number} processingTimeMs
 * @property {string} [cacheKey]
 * @property {boolean} fromCache
 */

/**
 * @typedef {Object} PackageJsonInfo
 * @property {string} path
 * @property {'parsed'|'missing'|'error'} status
 * @property {Object} [summary]
 * @property {string[]} [warnings]
 * @property {string} [error]
 */

/**
 * @param {ModuleInput} module
 * @param {ProcessModuleConfig} config
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function cloneModule(module: ModuleInput, config: ProcessModuleConfig): Promise<CloneResult> {
  const identifier = `${module.name}-----${module.maintainer}`;
  const tempPath = path.join(config.modulesTempDir, identifier);
  const finalPath = path.join(config.modulesDir, identifier);

  if (config.localOnly) {
    return { success: true };
  }

  const branch
    = typeof module.branch === "string" && module.branch.length > 0
      ? module.branch
      : null;

  try {
    if (config.moduleLogger) {
      await config.moduleLogger.info("clone", "Starting clone stage", {
        url: module.url,
        branch: branch || "default"
      });
    }

    // Optimization: Check if we can skip cloning based on lastCommit date
    if (module.lastCommit && await fileExists(finalPath)) {
      try {
        const localDateStr = await getCommitDate({ cwd: finalPath });
        if (localDateStr) {
          const localDate = new Date(localDateStr);
          const remoteDate = new Date(module.lastCommit);

          // If local repo is at least as new as the remote info we have, skip clone
          if (localDate.getTime() >= remoteDate.getTime() - 60000) {
            logger.debug(`Skipping clone for ${module.name}: Local repo is up to date`);
            if (config.moduleLogger) {
              await config.moduleLogger.info("clone", "Skipped - local repo is up to date", {
                localCommit: localDateStr,
                remoteCommit: module.lastCommit
              });
            }
            return { success: true };
          }
        }
      }
      catch (dateError) {
        logger.debug(`Could not verify local commit date for ${module.name}, proceeding with clone: ${getErrorMessage(dateError)}`);
        if (config.moduleLogger) {
          await config.moduleLogger.debug("clone", "Could not verify local commit date, proceeding with clone", {
            error: getErrorMessage(dateError)
          });
        }
      }
    }

    // Clone or update the repository
    await ensureRepository({
      repositoryUrl: module.url,
      directoryPath: tempPath,
      branch,
      depth: 1
    });

    if (config.moduleLogger) {
      await config.moduleLogger.info("clone", "Repository cloned successfully");
    }

    // Move from temp to final location
    await ensureDirectory(path.dirname(finalPath));
    if (await fileExists(finalPath)) {
      await rm(finalPath, { recursive: true, force: true });
    }
    await rename(tempPath, finalPath);

    if (config.moduleLogger) {
      await config.moduleLogger.info("clone", "Moved to final location", {
        path: finalPath
      });
    }

    return { success: true };
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Clone failed for ${module.name}: ${message}`);

    if (config.moduleLogger) {
      await config.moduleLogger.error("clone", `Clone failed: ${message}`, {
        error: message,
        stack: error instanceof Error ? error.stack : null
      });
    }

    // Clean up temp directory
    await rm(tempPath, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup errors
    });

    return { success: false, error: message };
  }
}

/**
 * @param {string} filename
 * @returns {boolean}
 */
function isImageFile(filename: string): boolean {
  return (/\.(bmp|gif|jpg|jpeg|png|webp)$/iu).test(filename);
}

/**
 * @param {string} moduleName
 * @param {string} moduleMaintainer
 * @param {ProcessModuleConfig} config
 * @returns {Promise<{targetImageName: string | null, issues: string[]}>}
 */
async function findAndResizeImage(moduleName: string, moduleMaintainer: string, config: ProcessModuleConfig): Promise<FindImageResult> {
  const sourceFolder = path.join(
    config.modulesDir,
    `${moduleName}-----${moduleMaintainer}`
  );

  try {
    const files = await fs.promises.readdir(sourceFolder, { recursive: true });
    files.sort();

    const issues: string[] = [];
    let firstScreenshotImage = null;
    let firstImage = null;

    for (const file of files) {
      if (isImageFile(file)) {
        const lowerFile = file.toLowerCase();
        if (
          lowerFile.includes("screenshot")
          || lowerFile.includes("example")
          || lowerFile.includes("sample")
          || lowerFile.includes("preview")
        ) {
          firstScreenshotImage = file;
          break;
        }
        else if (!firstImage) {
          firstImage = file;
        }
      }
    }

    const imageToProcess = firstScreenshotImage || firstImage;

    if (imageToProcess) {
      const targetImageName = createDeterministicImageName(
        moduleName,
        moduleMaintainer,
        "webp"
      );
      const sourcePath = path.join(sourceFolder, imageToProcess);
      const targetPath = path.join(config.imagesDir, targetImageName);

      try {
        await sharp(sourcePath)
          .resize(500, 600, {
            fit: sharp.fit.inside,
            withoutEnlargement: true
          })
          .webp({ quality: 85 })
          .toFile(targetPath);

        return { targetImageName, issues };
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        issues.push(`Error processing image "${imageToProcess}": ${message}`);
        return { targetImageName: null, issues };
      }
    }
    else {
      issues.push("No image found.");
      return { targetImageName: null, issues };
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      targetImageName: null,
      issues: [`Error reading module directory for images: ${message}`]
    };
  }
}

/**
 * @param {unknown} value
 * @returns {Record<string, string> | null}
 */
function sanitizeStringRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value).filter(([, val]) => typeof val === "string" && val.length > 0);
  if (entries.length === 0) {
    return null;
  }
  return Object.fromEntries(entries);
}

/**
 * @param {unknown} value
 * @returns {string[] | null}
 */
function sanitizeKeywordArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const keywords = value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      return "";
    })
    .filter(entry => entry.length > 0);

  return keywords.length > 0 ? keywords : null;
}

function buildPackageSummary(packageData: Record<string, unknown>): PackageSummary {
  const summary: PackageSummary = {};

  if (typeof packageData.name === "string" && packageData.name.length > 0) {
    summary.name = packageData.name;
  }

  if (
    typeof packageData.version === "string"
    && packageData.version.length > 0
  ) {
    summary.version = packageData.version;
  }

  if (
    typeof packageData.description === "string"
    && packageData.description.length > 0
  ) {
    summary.description = packageData.description;
  }

  const keywords = sanitizeKeywordArray(packageData.keywords);
  if (keywords) {
    summary.keywords = keywords;
  }

  if (
    typeof packageData.license === "string"
    && packageData.license.length > 0
  ) {
    summary.license = packageData.license;
  }

  const scripts = sanitizeStringRecord(packageData.scripts);
  if (scripts) {
    summary.scripts = scripts;
  }

  const dependencies = sanitizeStringRecord(packageData.dependencies);
  if (dependencies) {
    summary.dependencies = dependencies;
  }

  const devDependencies = sanitizeStringRecord(packageData.devDependencies);
  if (devDependencies) {
    summary.devDependencies = devDependencies;
  }

  const peerDependencies = sanitizeStringRecord(packageData.peerDependencies);
  if (peerDependencies) {
    summary.peerDependencies = peerDependencies;
  }

  const optionalDependencies = sanitizeStringRecord(packageData.optionalDependencies);
  if (optionalDependencies) {
    summary.optionalDependencies = optionalDependencies;
  }

  const engines = sanitizeStringRecord(packageData.engines);
  if (engines) {
    summary.engines = engines;
  }

  if (typeof packageData.type === "string" && packageData.type.length > 0) {
    summary.type = packageData.type;
  }

  return summary;
}

/**
 * @param {ModuleInput} module
 * @param {ProcessModuleConfig} config
 * @returns {Promise<PackageJsonInfo>}
 */
async function loadPackageManifest(module: ModuleInput, config: ProcessModuleConfig): Promise<PackageJsonInfo> {
  const relativePath = path.join(
    config.modulesDir,
    `${module.name}-----${module.maintainer}`,
    "package.json"
  );

  let raw;
  try {
    raw = await fs.promises.readFile(relativePath, "utf8");
  }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        path: relativePath,
        status: "missing",
        warnings: []
      };
    }

    return {
      path: relativePath,
      status: "error",
      warnings: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  }
  catch (error) {
    return {
      path: relativePath,
      status: "error",
      warnings: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }

  const warnings: string[] = [];
  const warnFn = (msg: string) => {
    if (!msg.includes("No README data")) {
      warnings.push(msg);
    }
  };

  try {
    normalizeData(parsed, warnFn);
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!warnings.includes(message)) {
      warnings.push(message);
    }
  }

  return {
    path: relativePath,
    status: "parsed",
    summary: buildPackageSummary(parsed),
    warnings
  };
}

/**
 * @param {string[]} keywords
 * @param {string[]} issues
 * @returns {string[] | null}
 */
function deriveTagsFromKeywords(keywords: string[], issues: string[]): string[] | null {
  const tagsToRemove = [
    "2",
    "mm",
    "mm2",
    "magic",
    "magicmirror",
    "magicmirror2",
    "magicmirror²",
    "magic mirror",
    "magic mirror 2",
    "magic-mirror",
    "magic mirror module",
    "magicmirror-module",
    "mirror",
    "mmm",
    "module",
    "nodejs",
    "smart",
    "smart mirror"
  ];

  const duplicates = keywords.filter((tag, index) => keywords.indexOf(tag) !== index);
  if (duplicates.length > 0) {
    issues.push(`There are duplicates in the keywords in your package.json: ${duplicates.join(", ")}`);
  }

  let processed = keywords
    .map((tag) => {
      const lowered = tag.toLowerCase();
      if (lowered === "smarthome") {
        issues.push("Please use 'smart home' instead of 'smarthome' as a keyword in your package.json.");
        return "smart home";
      }
      if (lowered === "sport") {
        return "sports";
      }
      return lowered;
    })
    .filter(tag => !tagsToRemove.includes(tag));

  if (
    processed.some(tag =>
      ["image", "images", "pictures", "livestream", "photos", "video"].includes(tag))
  ) {
    processed.push("media");
  }

  processed = [...new Set(processed)];

  if (processed.length === 0) {
    issues.push("There are no specific keywords in 'package.json'. We would use them as tags on the module list page. Add a few meaningful terms to the keywords in the package.json. Not just \"magicmirror\" or \"module\".");
    return null;
  }

  return processed;
}

/**
 * @param {ModuleInput} module
 * @param {ProcessModuleConfig} config
 * @returns {Promise<{packageJson: PackageJsonInfo, tags?: string[], image?: string, license?: string, enrichIssues: string[]}>}
 */
async function enrichModule(module: ModuleInput, config: ProcessModuleConfig): Promise<EnrichResult> {
  const enrichIssues: string[] = [];

  if (config.moduleLogger) {
    await config.moduleLogger.info("enrich", "Starting enrichment stage");
  }

  // Load package.json
  const packageJson = await loadPackageManifest(module, config);

  if (config.moduleLogger) {
    await config.moduleLogger.info("enrich", "Loaded package.json", {
      status: packageJson.status,
      hasKeywords: (packageJson.summary?.keywords?.length ?? 0) > 0
    });
  }

  let tags: string[] | undefined;
  let imageName: string | undefined;
  let effectiveLicense = module.license;
  let licenseStatus: "mismatch" | undefined;

  // Process package.json if parsed successfully
  if (packageJson.status === "parsed") {
    // Add warnings as issues
    for (const warning of packageJson.warnings || []) {
      enrichIssues.push(`\`package.json\` issue: ${warning}`);
    }

    // Derive tags from keywords
    const summaryKeywords = packageJson.summary?.keywords || [];
    if (summaryKeywords.length > 0) {
      const derivedTags = deriveTagsFromKeywords(summaryKeywords, enrichIssues);
      if (derivedTags && derivedTags.length > 0) {
        tags = derivedTags;
        if (config.moduleLogger) {
          await config.moduleLogger.info("enrich", "Derived tags from keywords", {
            tags: derivedTags
          });
        }
      }
    }
    else {
      enrichIssues.push("There are no keywords in 'package.json'. We would use them as tags on the module list page.");
    }

    // Check license consistency
    const packageLicense = packageJson.summary?.license;
    if (packageLicense && packageLicense !== "NOASSERTION") {
      if (!module.license) {
        effectiveLicense = packageLicense;
      }
      else if (!packageLicense.includes(module.license)) {
        enrichIssues.push(`Issue: The license in the package.json (${packageLicense}) doesn't match the license file (${module.license}).`);
        effectiveLicense = undefined;
        licenseStatus = "mismatch";
      }
    }
  }
  else if (packageJson.status === "missing") {
    // Special case for mmpm
    if (module.name === "mmpm") {
      // Mmpm doesn't have a package.json, but we add some keywords manually
      tags = ["package manager", "module installer"];
    }
    else {
      enrichIssues.push("There is no `package.json`. We need this file to gather information about the module for the module list page.");
    }
  }
  else if (packageJson.status === "error") {
    enrichIssues.push(`An error occurred while getting information from 'package.json': ${packageJson.error}`);
  }

  enrichIssues.push(...getRepositoryStatusIssues(module));

  // Process images only if we have a compatible license
  const useableLicenses = [
    "AGPL-3.0",
    "AGPL-3.0-or-later",
    "Apache-2.0",
    "BSD-3-Clause",
    "CC0-1.0",
    "GPL-2.0",
    "GPL-3.0",
    "GPL-3.0-only",
    "GPL-3.0-or-later",
    "ISC",
    "MIT",
    "MIT-Modern-Variant",
    "MPL-2.0",
    "LGPL-2.1",
    "LGPL-2.1-only",
    "Unlicense"
  ];

  if (effectiveLicense && useableLicenses.includes(effectiveLicense)) {
    if (config.moduleLogger) {
      await config.moduleLogger.info("enrich", "Processing image", {
        license: effectiveLicense
      });
    }

    const { targetImageName, issues: imageIssues } = await findAndResizeImage(
      module.name,
      module.maintainer,
      config
    );
    if (targetImageName) {
      imageName = targetImageName;
      if (config.moduleLogger) {
        await config.moduleLogger.info("enrich", "Image processed successfully", {
          imageName: targetImageName
        });
      }
    }
    enrichIssues.push(...imageIssues);
  }
  else if (effectiveLicense) {
    enrichIssues.push("No compatible or wrong license field in 'package.json' or LICENSE file. Without that, we can't use an image.");
    if (config.moduleLogger) {
      await config.moduleLogger.warn("enrich", "Incompatible license - skipping image", {
        license: effectiveLicense
      });
    }
  }

  if (config.moduleLogger) {
    await config.moduleLogger.info("enrich", "Enrichment complete", {
      tagsCount: tags?.length || 0,
      hasImage: Boolean(imageName),
      issuesCount: enrichIssues.length
    });
  }

  return {
    packageJson,
    tags,
    image: imageName,
    license: effectiveLicense,
    licenseStatus,
    enrichIssues
  };
}

/**
 * Stage 5: Analyze module for code quality issues, deprecated patterns, and best practices.
 * Runs comprehensive checks including deprecated APIs, typos, package validation, and README structure.
 *
 * @returns {{analysisIssues: string[], recommendations: string[]}}
 */
async function analyzeModule(module: ModuleInput, config: ProcessModuleConfig): Promise<AnalysisResult> {
  const cloneDir = path.join(
    config.modulesDir,
    `${module.name}-----${module.maintainer}`
  );

  try {
    // Get list of all files in the cloned directory, excluding .git and node_modules
    const getAllFiles = (dir: string, baseDir: string = dir, files: string[] = []): string[] => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(baseDir, fullPath);

          const pathSegments = relativePath.split(path.sep);
          const isGitDir = pathSegments.includes(".git");
          const isNodeModulesDir = pathSegments.includes("node_modules");

          if (!isGitDir && !isNodeModulesDir) {
            if (entry.isDirectory()) {
              getAllFiles(fullPath, baseDir, files);
            } else {
              files.push(fullPath);
            }
          }
        }
      } catch {
        // Silently ignore read errors
      }
      return files;
    };

    const files = getAllFiles(cloneDir);
    if (files.length === 0) {
      return {
        analysisIssues: ["Error: Unable to read module files for analysis"],
        recommendations: []
      };
    }

    const analysisResult = await performModuleAnalysis(
      cloneDir,
      module.name,
      module.url,
      files
    );

    return {
      analysisIssues: analysisResult.issues,
      recommendations: analysisResult.recommendations
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      analysisIssues: [`Analysis error: ${message}`],
      recommendations: []
    };
  }
}

/**
 * Process a single module through all stages:
 * 1. Clone repository (Stage 3)
 * 2. Enrich with package.json and images (Stage 4)
 * 3. Analyze and run checks (Stage 5 - placeholder)
 *
 * @param {ModuleInput} module
 * @param {ProcessModuleConfig} config
 * @returns {Promise<ModuleResult>}
 */
export async function processModule(module: ModuleInput, config: ProcessModuleConfig): Promise<ModuleResult> {
  const startTime = Date.now();
  const allIssues = normalizeIssueList(module.issues);
  const cacheKey = config.cacheEnabled && !config.localOnly
    ? buildModuleAnalysisCacheKey({
      module,
      moduleRevision: module.lastCommit,
      catalogueRevision: config.catalogueRevision,
      checkGroups: config.analysisConfig ?? config.checkGroups
    })
    : null;
  const cacheMetadata = cacheKey ? { cacheKey } : {};

  logger.info(`Processing ${module.name} by ${module.maintainer}`);

  if (config.moduleLogger) {
    await config.moduleLogger.info("start", "Module processing started", {
      name: module.name,
      maintainer: module.maintainer,
      url: module.url
    });
  }

  // Stage 3: Clone
  if (config.localOnly && !await fs.promises.stat(path.join(config.modulesDir, `${module.name}-----${module.maintainer}`)).then(info => info.isDirectory()).catch(() => false)) {
    if (config.moduleLogger) {
      await config.moduleLogger.info("end", "Skipped - no local clone available");
      await config.moduleLogger.close();
    }
    return {
      ...module,
      status: "skipped",
      skippedReason: "No local clone available",
      cloned: false,
      issues: allIssues,
      processingTimeMs: Date.now() - startTime,
      fromCache: false
    };
  }

  const cloneResult = await cloneModule(module, config);
  if (!cloneResult.success) {
    const processingTime = Date.now() - startTime;

    if (config.moduleLogger) {
      await config.moduleLogger.error("end", "Module processing failed at clone stage", {
        processingTimeMs: processingTime,
        error: cloneResult.error
      });
      await config.moduleLogger.close();
    }

    return {
      name: module.name,
      maintainer: module.maintainer,
      id: module.id,
      url: module.url,
      description: module.description,
      status: "failed",
      failurePhase: "clone",
      error: cloneResult.error,
      cloned: false,
      issues: allIssues,
      processingTimeMs: processingTime,
      ...cacheMetadata,
      fromCache: false
    };
  }

  const cloneDir = path.join(
    config.modulesDir,
    `${module.name}-----${module.maintainer}`
  );

  // Stage 4: Enrich
  let enrichResult;
  try {
    enrichResult = await enrichModule(module, config);
    mergeUniqueIssues(allIssues, enrichResult.enrichIssues);
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const processingTime = Date.now() - startTime;

    if (config.moduleLogger) {
      await config.moduleLogger.error("end", "Module processing failed at enrich stage", {
        processingTimeMs: processingTime,
        error: message,
        stack: error instanceof Error ? error.stack : null
      });
      await config.moduleLogger.close();
    }

    return {
      name: module.name,
      maintainer: module.maintainer,
      id: module.id,
      url: module.url,
      description: module.description,
      status: "failed",
      failurePhase: "enrich",
      error: message,
      cloned: true,
      cloneDir,
      issues: allIssues,
      processingTimeMs: processingTime,
      ...cacheMetadata,
      fromCache: false
    };
  }

  // Stage 5: Analyze
  let analysisResult;
  try {
    if (config.moduleLogger) {
      await config.moduleLogger.info("analyze", "Starting analysis stage");
    }

    analysisResult = module.outdated && !config.localOnly
      ? { analysisIssues: [], recommendations: [] }
      : await analyzeModule(module, config);
    // Merge analysis issues into the issues list
    mergeUniqueIssues(allIssues, analysisResult.analysisIssues);

    // Add recommendations separately if any
    mergeUniqueIssues(allIssues, analysisResult.recommendations);

    if (!module.outdated || config.localOnly) {
      const analysisConfig = config.analysisConfig ?? config.checkGroups ?? {};
      const eslintIssues = await runEslintCheck(cloneDir, analysisConfig.eslint !== false && analysisConfig.deep !== false);
      mergeUniqueIssues(allIssues, eslintIssues);
    }

    if (!module.outdated) {
      await applyDependencyIntegrations(cloneDir, allIssues, config);
    }

    if (config.moduleLogger) {
      await config.moduleLogger.info("analyze", "Analysis complete", {
        issuesCount: analysisResult.analysisIssues?.length || 0,
        recommendationsCount: analysisResult.recommendations?.length || 0
      });
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (config.moduleLogger) {
      await config.moduleLogger.error("end", "Module processing failed at analyze stage", {
        processingTimeMs: Date.now() - startTime,
        error: message,
        stack: error instanceof Error ? error.stack : null
      });
      await config.moduleLogger.close();
    }

    return {
      name: module.name,
      maintainer: module.maintainer,
      id: module.id,
      url: module.url,
      description: module.description,
      status: "failed",
      failurePhase: "analyze",
      error: message,
      cloned: true,
      cloneDir,
      packageJson: enrichResult.packageJson,
      tags: enrichResult.tags,
      image: enrichResult.image,
      license: enrichResult.license,
      licenseStatus: enrichResult.licenseStatus,
      issues: allIssues,
      processingTimeMs: Date.now() - startTime,
      ...cacheMetadata,
      fromCache: false
    };
  }

  const processingTime = Date.now() - startTime;

  if (config.moduleLogger) {
    await config.moduleLogger.info("end", "Module processing completed successfully", {
      processingTimeMs: processingTime,
      totalIssues: allIssues.length,
      status: "success"
    });
    await config.moduleLogger.close();
  }

  return {
    name: module.name,
    maintainer: module.maintainer,
    id: module.id,
    url: module.url,
    description: module.description,
    status: "success",
    cloned: true,
    cloneDir,
    branch: module.branch,
    packageJson: enrichResult.packageJson,
    tags: enrichResult.tags,
    image: enrichResult.image,
    license: enrichResult.license,
    licenseStatus: enrichResult.licenseStatus,
    issues: allIssues,
    recommendations: analysisResult.recommendations,
    stars: module.stars,
    lastCommit: module.lastCommit,
    isArchived: module.isArchived,
    hasGithubIssues: module.hasGithubIssues,
    processingTimeMs: processingTime,
    ...cacheMetadata,
    fromCache: false
  };
}
