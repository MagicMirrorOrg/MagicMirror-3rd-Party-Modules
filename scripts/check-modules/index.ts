#!/usr/bin/env node
// @ts-nocheck

import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { execFile } from "node:child_process";
import { setMaxListeners } from "node:events";
import { promisify } from "node:util";

import { ensureDirectory, writeJson } from "../shared/fs-utils.js";
import { createLogger } from "../shared/logger.js";
import {
  validateStageData,
  validateStageFile
} from "../lib/schemaValidator.js";
import {
  PACKAGE_JSON_RULES,
  PACKAGE_LOCK_RULES,
  TEXT_RULES,
  getRuleById
} from "./rule-registry.js";
import { loadCheckGroupConfig } from "./config.js";
import { buildRunSummaryMarkdown } from "./run-summary.js";
import {
  MISSING_DEPENDENCY_RULE_ID,
  detectUsedDependencies,
  extractDeclaredDependencyNames,
  findMissingDependencies,
  shouldAnalyzeFileForDependencyUsage
} from "./dependency-usage.js";
import {
  loadModuleCache,
  saveModuleCache,
  getCachedResult,
  setCachedResult,
  pruneCacheEntries
} from "./module-cache.js";

const execFileAsync = promisify(execFile);

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

const envOverrides = {
  projectRoot: process.env.CHECK_MODULES_PROJECT_ROOT,
  websiteDir: process.env.CHECK_MODULES_WEBSITE_DIR,
  dataDir: process.env.CHECK_MODULES_DATA_DIR,
  modulesDir: process.env.CHECK_MODULES_MODULES_DIR,
  resultPath: process.env.CHECK_MODULES_RESULT_PATH,
  stage4Path: process.env.CHECK_MODULES_STAGE4_PATH,
  modulesJsonPath: process.env.CHECK_MODULES_MODULES_JSON_PATH,
  modulesMinPath: process.env.CHECK_MODULES_MODULES_MIN_PATH,
  statsPath: process.env.CHECK_MODULES_STATS_PATH,
  runsDir: process.env.CHECK_MODULES_RUNS_DIR
};

const resolvedProjectRoot = envOverrides.projectRoot
  ? path.resolve(envOverrides.projectRoot)
  : path.resolve(currentDir, "..", "..");
const PROJECT_ROOT = resolvedProjectRoot;

const WEBSITE_DIR = envOverrides.websiteDir
  ? path.resolve(envOverrides.websiteDir)
  : path.join(PROJECT_ROOT, "website");
const DATA_DIR = envOverrides.dataDir
  ? path.resolve(envOverrides.dataDir)
  : path.join(WEBSITE_DIR, "data");
const MODULES_DIR = envOverrides.modulesDir
  ? path.resolve(envOverrides.modulesDir)
  : path.join(PROJECT_ROOT, "modules");
const RESULT_PATH = envOverrides.resultPath
  ? path.resolve(envOverrides.resultPath)
  : path.join(WEBSITE_DIR, "result.md");
const STAGE4_PATH = envOverrides.stage4Path
  ? path.resolve(envOverrides.stage4Path)
  : path.join(DATA_DIR, "modules.stage.4.json");
const MODULES_JSON_PATH = envOverrides.modulesJsonPath
  ? path.resolve(envOverrides.modulesJsonPath)
  : path.join(DATA_DIR, "modules.json");
const MODULES_MIN_PATH = envOverrides.modulesMinPath
  ? path.resolve(envOverrides.modulesMinPath)
  : path.join(DATA_DIR, "modules.min.json");
const STATS_PATH = envOverrides.statsPath
  ? path.resolve(envOverrides.statsPath)
  : path.join(DATA_DIR, "stats.json");
const MODULE_CACHE_PATH = path.join(DATA_DIR, "moduleCache.json");
const RUNS_ROOT = envOverrides.runsDir
  ? path.resolve(envOverrides.runsDir)
  : path.join(PROJECT_ROOT, ".pipeline-runs", "check-modules");

const baseLogger = createLogger();
const logger =
  typeof baseLogger.child === "function"
    ? baseLogger.child("check-modules")
    : baseLogger;

setMaxListeners(0);

if (typeof process.setMaxListeners === "function") {
  process.setMaxListeners(0);
}

function formatLocalIsoTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absMinutes / 60));
  const offsetRest = pad(absMinutes % 60);
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetRest}`;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const PROGRESS_BAR_WIDTH = 24;

function shouldUseInteractiveProgress(total) {
  if (total <= 0) {
    return false;
  }

  const stream = process.stderr;
  if (!stream || typeof stream.isTTY !== "boolean" || !stream.isTTY) {
    return false;
  }

  const disableFlag = process.env.CHECK_MODULES_DISABLE_PROGRESS;
  if (disableFlag && disableFlag.trim() === "1") {
    return false;
  }

  const override = process.env.CHECK_MODULES_PROGRESS;
  if (override && override.trim().toLowerCase() === "off") {
    return false;
  }

  return true;
}

function createProgressIndicator(total) {
  const interactive = shouldUseInteractiveProgress(total);
  const stream = process.stderr;
  let lastRendered = "";

  function render(processed) {
    if (!interactive) {
      return;
    }

    const safeProcessed = Math.min(Math.max(processed, 0), total);
    const percent = total === 0 ? 100 : Math.min(100, Math.floor((safeProcessed / total) * 100));
    const filledLength = Math.round((percent / 100) * PROGRESS_BAR_WIDTH);
    const filled = "█".repeat(filledLength);
    const empty = "░".repeat(Math.max(PROGRESS_BAR_WIDTH - filledLength, 0));
    const message = `Progress ${safeProcessed}/${total} ${filled}${empty} ${percent}%`;

    if (message === lastRendered) {
      return;
    }

    readline.clearLine(stream, 0);
    readline.cursorTo(stream, 0);
    stream.write(message);
    lastRendered = message;
  }

  return {
    tick(processed) {
      render(processed);
    },
    complete() {
      if (!interactive) {
        return;
      }
      render(total);
      stream.write("\n");
      lastRendered = "";
    },
    isInteractive: interactive
  };
}

function formatRunDirectoryId(date) {
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const milliseconds = pad(date.getMilliseconds(), 3);
  return `check-modules_${year}${month}${day}_${hours}${minutes}${seconds}${milliseconds}`;
}

async function prepareRunDirectory(startedAt) {
  const runDate = startedAt instanceof Date ? startedAt : new Date();
  await ensureDirectory(RUNS_ROOT);

  const baseId = formatRunDirectoryId(runDate);
  let runId = baseId;
  let runDirectory = path.join(RUNS_ROOT, runId);
  let attempt = 1;

  while (await pathExists(runDirectory)) {
    const suffix = String(attempt).padStart(2, "0");
    runId = `${baseId}_${suffix}`;
    runDirectory = path.join(RUNS_ROOT, runId);
    attempt += 1;
  }

  await ensureDirectory(runDirectory);

  return { runId, directory: runDirectory };
}

function buildArtifactLinks(runDirectory) {
  if (!runDirectory) {
    return [];
  }

  const entries = [
    { label: "result.md", path: path.relative(runDirectory, RESULT_PATH) },
    { label: "modules.json", path: path.relative(runDirectory, MODULES_JSON_PATH) },
    { label: "modules.min.json", path: path.relative(runDirectory, MODULES_MIN_PATH) },
    { label: "stats.json", path: path.relative(runDirectory, STATS_PATH) },
    { label: "modules.stage.4.json", path: path.relative(runDirectory, STAGE4_PATH) }
  ];

  return entries.filter((entry) => typeof entry.path === "string" && entry.path.length > 0);
}

async function writeRunSummaryFile({
  runId,
  runDirectory,
  startedAt,
  finishedAt,
  stats,
  config,
  configSources,
  disabledToggles,
  issueSummaries
}) {
  try {
    const artifactLinks = buildArtifactLinks(runDirectory);
    const markdown = buildRunSummaryMarkdown({
      runId,
      startedAt,
      finishedAt,
      stats,
      config,
      configSources,
      disabledToggles,
      artifactLinks,
      issueSummaries
    });

    const summaryPath = path.join(runDirectory, "summary.md");
    await writeFile(summaryPath, `${markdown}\n`, "utf8");

    const metadata = {
      runId,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      disabledToggles,
      artifactLinks,
      totals: {
        modulesAnalyzed: stats?.moduleCounter ?? 0,
        modulesWithIssues: stats?.modulesWithIssuesCounter ?? 0,
        issuesDetected: stats?.issueCounter ?? 0
      }
    };

    const metadataPath = path.join(runDirectory, "summary.json");
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

    return summaryPath;
  } catch (error) {
    logger.warn(
      `Unable to persist run summary: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

function addIssue(issues, message) {
  if (!issues.includes(message)) {
    issues.push(message);
  }
}

function formatRuleIssue(rule, fileName, matchedPattern) {
  const pattern =
    matchedPattern ??
    rule?.primaryPattern ??
    (Array.isArray(rule?.patterns) && rule.patterns.length > 0
      ? rule.patterns[0]
      : rule?.pattern ?? "unknown pattern");
  return `${rule.category}: Found \`${pattern}\` in file \`${fileName}\`: ${rule.description}`;
}

function findMatchingPattern(rule, content) {
  if (!rule || !Array.isArray(rule.patterns)) {
    return null;
  }
  return rule.patterns.find((pattern) => content.includes(pattern)) ?? null;
}

function normalizeIssuesInput(issues) {
  if (Array.isArray(issues)) {
    return issues.slice();
  }
  if (typeof issues === "string" && issues.length > 0) {
    return [issues];
  }
  return [];
}

function getRepositoryHost(moduleUrl) {
  if (typeof moduleUrl !== "string") {
    return "unknown";
  }

  try {
    const firstSegment = moduleUrl.split(".")[0];
    const segments = firstSegment.split("/");
    return segments[2] ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function getLastCommitDate(module, moduleDir) {
  // Optimization: If we already have a valid lastCommit from Stage 2/3 (e.g. via API), use it.
  // This avoids running 'git log' which fails if the repo wasn't cloned (skipped).
  if (module.lastCommit) {
    const lastCommitDate = new Date(module.lastCommit);
    if (!Number.isNaN(lastCommitDate.getTime())) {
      const now = new Date();
      const diffDays =
        (now.getTime() - lastCommitDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > 365 * 2) {
        module.defaultSortWeight += 1;
      }
      return;
    }
  }

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "-1", "--format=%aI"],
      { cwd: moduleDir }
    );
    const stamp = stdout.toString().trim();
    if (stamp.length > 0) {
      module.lastCommit = stamp;
      const lastCommitDate = new Date(stamp);
      if (!Number.isNaN(lastCommitDate.getTime())) {
        const now = new Date();
        const diffDays =
          (now.getTime() - lastCommitDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 365 * 2) {
          module.defaultSortWeight += 1;
        }
      }
    }
  } catch (error) {
    // If git log fails (e.g. repo not cloned), and we don't have a lastCommit, we just log a warning.
    // But if we had a lastCommit, we returned early above.
    logger.warn(
      `Unable to read last commit date for ${module.name}: ${error instanceof Error ? error.message : error}`
    );
  }
}

const README_MODULES_FALSE_POSITIVES = new Set([
  "MMM-pages",
  "MMM-WebSpeechTTS"
]);
const README_CONFIG_FALSE_POSITIVES = new Set(["MMM-CalendarExt2"]);
const README_TRAILING_COMMA_FALSE_POSITIVES = new Set([
  "MMM-MealieMenu",
  "MMM-Remote-Control"
]);
const README_INSTALL_BLOCK_FALSE_POSITIVES = new Set([
  "MMM-CalendarExt3",
  "MMM-Remote-Control"
]);
const README_UPDATE_BLOCK_FALSE_POSITIVES = new Set([
  "MMM-CalendarExt3"
]);
const MISSING_DEPENDENCY_EXCEPTIONS = new Set([
  "electron",
  "pm2"
]);

const README_INSTALL_SECTION_TOKENS = Object.freeze([
  "install",
  "installation"
]);
const README_UPDATE_SECTION_TOKENS = Object.freeze([
  "update",
  "updates",
  "updating"
]);
const README_COMMAND_LANG_ALIASES = new Set([
  "bash",
  "sh",
  "shell",
  "zsh"
]);
const README_COMMAND_LINE_PATTERN = /^(?:\s*(?:#|<!--).*)|(?:\s*(?:\$\s*)?(?:bash|cd|chmod|cp|curl|docker|docker-compose|git|ln|make|mv|node|npm|npx|pnpm|pip|pip3|pm2|python|python3|rm|sudo|tar|unzip|wget|yarn)\b)/u;

function normalizeReadmeHeading(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function extractReadmeSection(content, tokens) {
  if (typeof content !== "string" || content.length === 0) {
    return { found: false, content: "" };
  }

  const lines = content.split(/\r?\n/u);
  const normalizedTokens = tokens.map((token) => normalizeReadmeHeading(token)).filter((token) => token.length > 0);
  let collecting = false;
  let found = false;
  const sectionLines = [];

  for (const line of lines) {
  const headingMatch = line.match(/^#{2,6}\s+(.+?)\s*$/u);
    if (headingMatch) {
      if (collecting) {
        break;
      }

      const normalizedHeading = normalizeReadmeHeading(headingMatch[1]);
      if (
        normalizedTokens.some(
          (token) => normalizedHeading === token || normalizedHeading.includes(token)
        )
      ) {
        collecting = true;
        found = true;
        continue;
      }
    }

    if (collecting) {
      sectionLines.push(line);
    }
  }

  return { found, content: sectionLines.join("\n").trim() };
}

function sectionHasCopyableCommandBlock(sectionContent) {
  if (typeof sectionContent !== "string" || sectionContent.length === 0) {
    return false;
  }

  const codeBlockPattern = /```([^\n]*)\n([\s\S]*?)```/gu;
  let match;

  while ((match = codeBlockPattern.exec(sectionContent)) !== null) {
    const language = (match[1] ?? "").trim().toLowerCase();
    const body = (match[2] ?? "").trim();

    if (body.length === 0) {
      continue;
    }

    if (README_COMMAND_LANG_ALIASES.has(language)) {
      return true;
    }

    const lines = body
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      continue;
    }

    if (lines.some((line) => README_COMMAND_LINE_PATTERN.test(line))) {
      return true;
    }
  }

  return false;
}

async function collectEntries(rootDir) {
  const results = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const dir = stack.pop();
    let dirEntries = [];
    try {
      dirEntries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      logger.warn(
        `Failed to read directory ${dir}: ${error instanceof Error ? error.message : error}`
      );
      continue;
    }

    dirEntries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of dirEntries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath);
      const segments = relativePath.split(path.sep);

      if (segments.includes(".git")) {
        continue;
      }

      results.push({ entry, fullPath });

      if (entry.isDirectory()) {
        stack.push(fullPath);
      }
    }
  }

  return results;
}

function pathHasNodeModules(relativePath) {
  return relativePath.split(path.sep).includes("node_modules");
}

function countNodeModulesSegments(relativePath) {
  return relativePath
    .split(path.sep)
    .filter((segment) => segment === "node_modules").length;
}

async function readTextSafely(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    logger.debug(
      `Skipping file ${filePath}: ${error instanceof Error ? error.message : error}`
    );
    return null;
  }
}

async function getBranchListing(moduleDir) {
  try {
    const { stdout } = await execFileAsync("git", ["branch"], {
      cwd: moduleDir
    });
    return stdout.toString();
  } catch (error) {
    logger.warn(
      `Failed to read branches for ${moduleDir}: ${error instanceof Error ? error.message : error}`
    );
    return "";
  }
}

async function runNpmCheckUpdates(moduleDir) {
  try {
    const { stdout } = await execFileAsync("npx", ["npm-check-updates"], {
      cwd: moduleDir
    });

    // Parse the formatted output lines that contain "→"
    const lines = stdout
      .split(/\r?\n/u)
      .filter((line) => line.includes("→"))
      .map((line) => line.trim());

    return lines;
  } catch (error) {
    logger.warn(
      `npm-check-updates failed in ${moduleDir}: ${error instanceof Error ? error.message : error}`
    );
    return [];
  }
}

async function runDeprecatedCheck(moduleDir) {
  try {
    const { stdout, stderr } = await execFileAsync("npx", ["ndc", "current"], {
      cwd: moduleDir,
      timeout: 60_000
    });

    const output = `${stdout ?? ""}${stderr ?? ""}`.trim();
    if (output.includes("There are no deprecated dependencies.")) {
      return null;
    }

    const lines = output
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.includes(":"));
    if (lines.length === 0) {
      return null;
    }
    return lines.join("\n");
  } catch (error) {
    logger.warn(
      `npm-deprecated-check failed in ${moduleDir}: ${error instanceof Error ? error.message : error}`
    );
    return null;
  }
}

async function runEslintCheck(moduleDir) {
  try {
    const result = await execFileAsync(
      "npx",
      [
        "eslint",
        "--format",
        "json",
        "--config",
        "eslint.testconfig.js",
        moduleDir
      ],
      {
        cwd: PROJECT_ROOT,
        timeout: 120_000
      }
    );

    const stdout = result.stdout;
    if (!stdout) {
      return [];
    }

    const parsed = JSON.parse(stdout);
    const issues = [];
    for (const entry of parsed) {
      const relPath = entry.filePath
        ?.split(moduleDir)?.[1]
        ?.replace(/^\/+/, "");
      for (const message of entry.messages ?? []) {
        if (
          message &&
          typeof message.message === "string" &&
          !message.message.includes("Definition for rule")
        ) {
          const location = `${relPath ?? entry.filePath}: Line ${message.line}, Column ${message.column}`;
          issues.push(
            `${location}: ${message.message} (rule: ${message.ruleId})`
          );
        }
      }
    }
    return issues;
  } catch (error) {
    // ESLint returns non-zero exit code when it finds errors, but we still want the output
    if (error && typeof error === "object" && "stdout" in error) {
      try {
        const stdout = error.stdout;
        if (!stdout) {
          return [];
        }

        const parsed = JSON.parse(stdout);
        const issues = [];
        for (const entry of parsed) {
          const relPath = entry.filePath
            ?.split(moduleDir)?.[1]
            ?.replace(/^\/+/, "");
          for (const message of entry.messages ?? []) {
            if (
              message &&
              typeof message.message === "string" &&
              !message.message.includes("Definition for rule")
            ) {
              const location = `${relPath ?? entry.filePath}: Line ${message.line}, Column ${message.column}`;
              issues.push(
                `${location}: ${message.message} (rule: ${message.ruleId})`
              );
            }
          }
        }
        return issues;
      } catch (_parseError) {
        logger.warn(
          `ESLint check failed in ${moduleDir}: ${error instanceof Error ? error.message : error}`
        );
        return [];
      }
    }

    logger.warn(
      `ESLint check failed in ${moduleDir}: ${error instanceof Error ? error.message : error}`
    );
    return [];
  }
}

async function checkWorkflowOptimization({ moduleDir, issues, config }) {
  if (!config?.groups?.deep) {
    return;
  }

  const integrationToggles = config.integrations ?? {};
  const shouldRunSlimify = integrationToggles.ghSlimify !== false;

  if (!shouldRunSlimify) {
    return;
  }

  const workflowDir = path.join(moduleDir, ".github", "workflows");
  if (!(await pathExists(workflowDir))) {
    return;
  }

  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["slimify", "--skip-duration", "--all"],
      { cwd: moduleDir, timeout: 10000 }
    );

    // Parse output to check if there are any eligible jobs
    const lines = stdout.split("\n");

    // Count safe and attention jobs separately
    const safeMatch = lines.find((line) => line.includes("✅") && line.includes("can be safely migrated"));
    const attentionMatch = lines.find((line) => line.includes("⚠️") && line.includes("can be migrated but require attention"));

    let safeCount = 0;
    let attentionCount = 0;

    if (safeMatch) {
      const match = safeMatch.match(/(\d+)\s+job\(s\)\s+can be safely migrated/);
      if (match) safeCount = parseInt(match[1], 10);
    }

    if (attentionMatch) {
      const match = attentionMatch.match(/(\d+)\s+job\(s\)\s+can be migrated but require attention/);
      if (match) attentionCount = parseInt(match[1], 10);
    }

    const totalEligible = safeCount + attentionCount;

    if (totalEligible > 0) {
      let message = "Recommendation: ";

      if (safeCount > 0 && attentionCount > 0) {
        const safePlural = safeCount > 1 ? "s" : "";
        const attentionPlural = attentionCount > 1 ? "s" : "";
        message += `${safeCount} GitHub Actions job${safePlural} can safely migrate to \`ubuntu-slim\`, and ${attentionCount} job${attentionPlural} may require additional setup.`;
      } else if (safeCount > 0) {
        const plural = safeCount > 1 ? "s" : "";
        message += `${safeCount} GitHub Actions job${plural} can safely migrate to \`ubuntu-slim\`.`;
      } else if (attentionCount > 0) {
        const plural = attentionCount > 1 ? "s" : "";
        message += `${attentionCount} GitHub Actions job${plural} could potentially use \`ubuntu-slim\` but may require additional setup.`;
      }

      message += " Run \`gh slimify --all\` in the repository for details. ([gh-slimify extension](https://github.com/fchimpan/gh-slimify))";
      addIssue(issues, message);
    }
  } catch (error) {
    // Silently skip if gh slimify is not installed or fails
    // This is an optional optimization check
  }
}

async function applyDependencyHelpers({ moduleDir, issues, hasPackageJson, config }) {
  if (!config?.groups?.deep) {
    return;
  }

  const integrationToggles = config.integrations ?? {};
  const shouldRunNpmCheckUpdates = integrationToggles.npmCheckUpdates !== false;
  const shouldRunDeprecatedCheck =
    integrationToggles.npmDeprecatedCheck !== false;
  const shouldRunEslint = integrationToggles.eslint !== false;

  if (!hasPackageJson) {
    return;
  }

  const packageJsonPath = path.join(moduleDir, "package.json");
  if (!(await pathExists(packageJsonPath))) {
    return;
  }

  if (issues.length >= 4) {
    return;
  }

  if (shouldRunNpmCheckUpdates) {
    const upgrades = await runNpmCheckUpdates(moduleDir);
    if (upgrades.length > 0) {
      const header = `Information: There are updates for ${upgrades.length} dependencie(s):`;
      const details = upgrades.map((entry) => `   - ${entry}`).join("\n");
      addIssue(issues, `${header}\n${details}`);
    }
  }

  if (issues.length >= 3) {
    return;
  }

  if (shouldRunDeprecatedCheck) {
    const deprecated = await runDeprecatedCheck(moduleDir);
    if (deprecated) {
      addIssue(issues, deprecated);
    }
  }

  if (issues.length >= 3) {
    return;
  }

  if (shouldRunEslint) {
    const eslintIssues = await runEslintCheck(moduleDir);
    if (eslintIssues.length > 0) {
      const body = eslintIssues.map((item) => `   - ${item}`).join("\n");
      addIssue(issues, `ESLint issues:\n${body}`);
    }
  }
}

async function analyzeModule({ module, moduleDir, issues, config }) {
  const packageInfo = module.packageJson ?? null;
  const packageSummary =
    packageInfo && packageInfo.status === "parsed"
      ? packageInfo.summary ?? {}
      : null;
  const hasParsedPackageJson = packageSummary != null;
  const packageRawContent =
    packageInfo && packageInfo.status === "parsed" && typeof packageInfo.raw === "string"
      ? packageInfo.raw
      : null;
  const declaredDependencyNames = extractDeclaredDependencyNames(packageSummary);
  const usedDependencies = new Set();
  const dependencyUsage = new Map();

  const groups = config?.groups ?? {};
  const runFastChecks = groups.fast !== false;
  const runDeepChecks = groups.deep !== false;

  if (!runFastChecks && !runDeepChecks) {
    return;
  }

  const entries = await collectEntries(moduleDir);
  const allPathsString = runDeepChecks
    ? entries.map((entry) => entry.fullPath).join(" ")
    : "";

  for (const { entry, fullPath } of entries) {
    const relative = path.relative(moduleDir, fullPath);

    if (entry.isDirectory()) {
      if (
        runDeepChecks &&
        entry.name === "node_modules" &&
        countNodeModulesSegments(relative) === 1
      ) {
        addIssue(
          issues,
          "Found directory `node_modules`. This shouldn't be uploaded. Add `node_modules/`to `.gitignore`."
        );
      }
      continue;
    }

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (pathHasNodeModules(relative)) {
      continue;
    }

    const lowerRelative = relative.toLowerCase();
    const fileName = entry.name;

    if (lowerRelative.includes("package-lock.json")) {
      if (!runFastChecks) {
        continue;
      }
      const content = await readTextSafely(fullPath);
      if (!content) {
        continue;
      }
      for (const rule of PACKAGE_LOCK_RULES) {
        const match = findMatchingPattern(rule, content);
        if (match) {
          addIssue(issues, formatRuleIssue(rule, fileName, match));
        }
      }
      continue;
    }

    if (lowerRelative.includes("changelog")) {
      continue;
    }

    const isPackageJson = fileName === "package.json";
    let content = null;
    if (isPackageJson && packageRawContent && runFastChecks) {
      content = packageRawContent;
    } else {
      content = await readTextSafely(fullPath);
    }

    if (content == null) {
      continue;
    }

    if (runFastChecks && shouldAnalyzeFileForDependencyUsage(relative)) {
      const detectedDependencies = detectUsedDependencies(content);
      if (detectedDependencies.size > 0) {
        for (const dependencyName of detectedDependencies) {
          usedDependencies.add(dependencyName);
          if (!dependencyUsage.has(dependencyName)) {
            dependencyUsage.set(dependencyName, new Set());
          }
          dependencyUsage.get(dependencyName).add(relative);
        }
      }
    }

    if (
      runDeepChecks &&
      (fileName === "jquery.js" || fileName === "jquery.min.js")
    ) {
      addIssue(
        issues,
        `Recommendation: Found local copy of \`${fileName}\`. Instead of a local copy, it would be better to add jQuery to the dependencies in \`package.json\`.`
      );
      const versions = [
        "jQuery v3.7",
        "jQuery v3.8",
        "jQuery v3.9",
        "jQuery v4"
      ];
      if (!versions.some((needle) => content.includes(needle))) {
        addIssue(
          issues,
          `Outdated: Local jQuery file \`${fileName}\` seems to be outdated. jQuery v3.7 or higher is recommended.`
        );
      }
      continue;
    }

    if (runFastChecks) {
      for (const rule of TEXT_RULES) {
        const match = findMatchingPattern(rule, content);
        if (match) {
          addIssue(issues, formatRuleIssue(rule, fileName, match));
        }
      }

      if (isPackageJson) {
        for (const rule of PACKAGE_JSON_RULES) {
          const match = findMatchingPattern(rule, content);
          if (match) {
            addIssue(issues, formatRuleIssue(rule, fileName, match));
          }
        }
      }
    }

    if (
      runDeepChecks &&
      fileName.toLowerCase().includes("stylelint")
    ) {
      if (content.includes("prettier/prettier")) {
        addIssue(
          issues,
          `Recommendation: Found \`prettier/prettier\` in file \`${fileName}\`: Config would be cleaner using 'stylelint-prettier/recommended'. [See here](https://github.com/prettier/stylelint-prettier).`
        );
      }
    }

    if (
      runDeepChecks &&
      fileName === "README.md" &&
      path.dirname(fullPath) === moduleDir &&
      module.name !== "mmpm"
    ) {
      const installSection = extractReadmeSection(
        content,
        README_INSTALL_SECTION_TOKENS
      );
      const updateSection = extractReadmeSection(
        content,
        README_UPDATE_SECTION_TOKENS
      );

      if (!updateSection.found) {
        addIssue(
          issues,
          "Recommendation: The README seems not to have an update section (like `## Update`). Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Update-Instructions))."
        );
      } else if (
        !sectionHasCopyableCommandBlock(updateSection.content) &&
        !README_UPDATE_BLOCK_FALSE_POSITIVES.has(module.name)
      ) {
        addIssue(
          issues,
          "Recommendation: The README's update section should provide a copyable fenced command block (for example ```bash ...). Please add one so users can update the module quickly ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Update-Instructions))."
        );
      }

      if (!installSection.found) {
        addIssue(
          issues,
          "Recommendation: The README seems not to have an install section (like `## Installation`). Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Installation-Instructions))."
        );
      } else if (
        !sectionHasCopyableCommandBlock(installSection.content) &&
        !README_INSTALL_BLOCK_FALSE_POSITIVES.has(module.name)
      ) {
        addIssue(
          issues,
          "Recommendation: The README's install section should include a copyable fenced command block (for example ```bash ...). Please add one so the module can be installed with a single copy/paste ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Installation-Instructions))."
        );
      }

      const hasModulesArray = content.includes("modules: [");
      if (hasModulesArray && !README_MODULES_FALSE_POSITIVES.has(module.name)) {
        addIssue(
          issues,
          "Recommendation: The README seems to have a modules array (Found `modules: [`). This is usually not necessary. Please remove it if it is not needed ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Config-Instructions))."
        );
      }

      const configExampleRegex =
        /\{\s*[^{}]*config\s*:\s*\{[\s\S]*?\}[\s\S]*?\}/u;
      const hasConfigExample = configExampleRegex.test(content);
      if (
        !hasConfigExample &&
        !hasModulesArray &&
        !README_CONFIG_FALSE_POSITIVES.has(module.name)
      ) {
        addIssue(
          issues,
          "Recommendation: The README seems not to have a config example. Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Config-Instructions))."
        );
      }

      if (hasConfigExample) {
        const trailingCommaRegex =
          /\{\s*[^{}]*config\s*:\s*\{[\s\S]*?\}[\s\S]*?\},/u;
        if (
          !trailingCommaRegex.test(content) &&
          !README_TRAILING_COMMA_FALSE_POSITIVES.has(module.name)
        ) {
          addIssue(
            issues,
            "Recommendation: The README seems to have a config example without a trailing comma. Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Config-Instructions))."
          );
        }
      }

      if (!content.includes("git clone")) {
        addIssue(
          issues,
          "Recommendation: The README seems not to have clone instructions."
        );
      } else if (!content.includes(`git clone ${module.url}`)) {
        addIssue(
          issues,
          "Recommendation: The README seems to have incorrect clone instructions. Please check the URL."
        );
      }
    }
  }

  if (runFastChecks && usedDependencies.size > 0) {
    const missingDependencies = findMissingDependencies({
      usedDependencies,
      declaredDependencies: declaredDependencyNames
    });

    const filteredMissingDependencies = missingDependencies.filter(
      (dep) => !MISSING_DEPENDENCY_EXCEPTIONS.has(dep)
    );

    if (filteredMissingDependencies.length > 0 && module.name !== "mmpm") {
      const rule = getRuleById(MISSING_DEPENDENCY_RULE_ID);
      const dependencyList = filteredMissingDependencies
        .map((name) => {
          const files = dependencyUsage.get(name);
          if (!files || files.size === 0) {
            return `\`${name}\``;
          }
          const formattedFiles = Array.from(files)
            .sort()
            .map((file) => `\`${file}\``)
            .join(", ");
          return `\`${name}\` (used in ${formattedFiles})`;
        })
        .join(", ");
      const plural = filteredMissingDependencies.length > 1;
      const baseMessage = `The module imports ${dependencyList} but does not list ${plural ? "them" : "it"} in package.json.`;
      const recommendation = `${baseMessage} Add ${plural ? "these dependencies" : "this dependency"} to package.json so they can be installed automatically.`;
      const messagePrefix = rule?.category ?? "Recommendation";
      const suffix = rule?.description ? ` ${rule.description}` : "";
      addIssue(issues, `${messagePrefix}: ${recommendation}${suffix}`.trim());
    }
  }

  if (runDeepChecks) {
    if (!allPathsString.includes("LICENSE")) {
      addIssue(
        issues,
        "Warning: No LICENSE file ([example LICENSE file](https://github.com/KristjanESPERANTO/MMM-WebSpeechTTS/blob/main/LICENSE.md))."
      );
    }

    if (!allPathsString.includes("CHANGELOG")) {
      addIssue(
        issues,
        "Recommendation: There is no CHANGELOG file. It is recommended to add one ([example CHANGELOG file](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/CHANGELOG.md))."
      );
    }

    if (!allPathsString.includes("CODE_OF_CONDUCT")) {
      addIssue(
        issues,
        "Recommendation: There is no CODE_OF_CONDUCT file. It is recommended to add one ([example CODE_OF_CONDUCT file](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/CODE_OF_CONDUCT.md))."
      );
    }

    if (
      !allPathsString.includes("dependabot.yml") &&
      !allPathsString.includes("dependabot.yaml")
    ) {
      addIssue(
        issues,
        "Recommendation: There is no dependabot configuration file. It is recommended to add one ([example dependabot file](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/.github/dependabot.yaml))."
      );
    }

    if (allPathsString.includes("eslintrc")) {
      addIssue(issues, "Recommendation: Replace eslintrc by new flat config.");
    } else if (!allPathsString.includes("eslint.config")) {
      addIssue(
        issues,
        "Recommendation: No ESLint configuration was found. ESLint is very helpful, it is worth using it even for small projects ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/eslint.md))."
      );
    } else {
      if (packageSummary) {
        const packageDependencies =
          typeof packageSummary.dependencies === "object" &&
          packageSummary.dependencies
            ? packageSummary.dependencies
            : {};
        const packageDevDependencies =
          typeof packageSummary.devDependencies === "object" &&
          packageSummary.devDependencies
            ? packageSummary.devDependencies
            : {};

        const hasEslintDependency = Boolean(
          (typeof packageDependencies.eslint === "string" &&
            packageDependencies.eslint.length > 0) ||
            (typeof packageDevDependencies.eslint === "string" &&
              packageDevDependencies.eslint.length > 0)
        );

        if (!hasEslintDependency) {
          addIssue(
            issues,
            "Recommendation: ESLint is not in the dependencies or devDependencies. It is recommended to add it to one of them."
          );
        }

        const lintScript =
          typeof packageSummary.scripts?.lint === "string" &&
          packageSummary.scripts.lint.length > 0
            ? packageSummary.scripts.lint
            : null;

        if (!lintScript) {
          addIssue(
            issues,
            "Recommendation: No lint script found in package.json. It is recommended to add one."
          );
        } else if (!lintScript.includes("eslint")) {
          addIssue(
            issues,
            "Recommendation: The lint script in package.json does not contain `eslint`. It is recommended to add it."
          );
        }
      }

      let eslintConfigPath = path.join(moduleDir, "eslint.config.js");
      if (!(await pathExists(eslintConfigPath))) {
        eslintConfigPath = path.join(moduleDir, "eslint.config.mjs");
      }

      if (await pathExists(eslintConfigPath)) {
        const configContent = await readTextSafely(eslintConfigPath);
        if (configContent && !configContent.includes("defineConfig")) {
          addIssue(
            issues,
            `Recommendation: The ESLint configuration file \`${path.basename(eslintConfigPath)}\` does not contain \`defineConfig\`. It is recommended to use it.`
          );
        }
      }
    }

    const branchListing = await getBranchListing(moduleDir);
    if (!branchListing.includes("master")) {
      module.defaultSortWeight -= 1;
    }

    await checkWorkflowOptimization({ moduleDir, issues, config });

    await applyDependencyHelpers({
      moduleDir,
      issues,
      hasPackageJson: hasParsedPackageJson,
      config
    });
  }
}

function applySortAdjustments(module, issuesCount) {
  module.defaultSortWeight += issuesCount;

  const stars = typeof module.stars === "number" ? module.stars : 0;
  module.defaultSortWeight -= Math.floor(stars / 20);

  if (stars < 3) {
    module.defaultSortWeight = Math.max(module.defaultSortWeight, 1);
  }

  // Add small extra weight to Kristjan's modules to avoid dominating top positions
  if (
    module.maintainer === "KristjanESPERANTO" &&
    module.name !== "MMM-EasyPix" &&
    module.name !== "MMM-Forum"
  ) {
    module.defaultSortWeight += 1;
  }
}

function buildMarkdown(stats, summaries) {
  const lines = [];
  lines.push("# Result of the module analysis", "");
  lines.push(`Last update: ${stats.lastUpdate}`, "");
  lines.push("## General notes", "");
  lines.push(
    "* This is an automated analysis of the modules. It is not perfect and can contain errors. If you have any questions or suggestions, please open an issue on GitHub."
  );
  lines.push(
    "* Some issues are opinionated recommendations. Please feel free to ignore them.",
    ""
  );
  lines.push("## Statistics", "");
  lines.push("|                      | number   |");
  lines.push("|:---------------------|:--------:|");
  lines.push(
    `| modules analyzed     | ${String(stats.moduleCounter).padStart(6, " ")}   |`
  );
  lines.push(
    `| maintainers          | ${String(Object.keys(stats.maintainer).length).padStart(6, " ")}   |`
  );
  lines.push(
    `| modules with issues  | ${String(stats.modulesWithIssuesCounter).padStart(6, " ")}   |`
  );
  lines.push(
    `| issues               | ${String(stats.issueCounter).padStart(6, " ")}   |`
  );

  for (const [hoster, count] of Object.entries(stats.repositoryHoster)) {
    lines.push(
      `| modules at ${hoster.padEnd(9, " ")} | ${String(count).padStart(6, " ")}   |`
    );
  }

  lines.push("", "## Modules with issues");

  for (const summary of summaries) {
    lines.push(
      "",
      `### [${summary.name} by ${summary.maintainer}](${summary.url})`,
      ""
    );
    summary.issues.forEach((issue, index) => {
      lines.push(`${index + 1}. ${issue}`);
    });
  }

  return `${lines.join("\n")}\n`;
}

async function writeOutputs({ data, stats, summaries }) {
  await ensureDirectory(DATA_DIR);
  await ensureDirectory(path.dirname(RESULT_PATH));

  const markdown = buildMarkdown(stats, summaries);
  await writeFile(RESULT_PATH, markdown, "utf8");

  await writeJson(MODULES_JSON_PATH, data, { pretty: 2 });
  await writeJson(MODULES_MIN_PATH, data, { pretty: 0 });
  await writeJson(STATS_PATH, stats, { pretty: 2 });

  await validateStageData("modules.final", data);
  await validateStageData("modules.min", data);
  await validateStageData("stats", stats);
}

async function main() {
  const stageData = await validateStageFile("modules.stage.4", STAGE4_PATH);
  const modules = Array.isArray(stageData.modules) ? stageData.modules : [];
  const totalModules = modules.length;

  logger.info(`Starting analysis for ${totalModules} modules...`);

  // Load module result cache for incremental checking
  const moduleCache = await loadModuleCache(MODULE_CACHE_PATH);
  const activeModuleIds = modules.map((m) => m.id);
  pruneCacheEntries(moduleCache, activeModuleIds);

  let cacheHits = 0;
  let cacheMisses = 0;

  const runStartedAt = new Date();
  let runContext = null;
  try {
    runContext = await prepareRunDirectory(runStartedAt);
  } catch (error) {
    logger.warn(
      `Unable to prepare run directory for summaries: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const progress = createProgressIndicator(totalModules);

  const { config: checkGroupConfig, sources: configSources, errors: configErrors } =
    await loadCheckGroupConfig({projectRoot: PROJECT_ROOT});

  if (Array.isArray(configErrors) && configErrors.length > 0) {
    for (const entry of configErrors) {
      const sourceLabel = typeof entry?.path === "string" ? entry.path : entry.kind;
      const message =
        entry?.error instanceof Error
          ? entry.error.message
          : String(entry?.error ?? "Unknown error");
      logger.warn(`Failed to load check group config from ${sourceLabel}: ${message}`);
    }
  }

  const disabledToggles = [];
  if (!checkGroupConfig.groups.fast) {
    disabledToggles.push("fast");
  }
  if (!checkGroupConfig.groups.deep) {
    disabledToggles.push("deep");
  }
  if (!checkGroupConfig.integrations.npmCheckUpdates) {
    disabledToggles.push("npmCheckUpdates");
  }
  if (!checkGroupConfig.integrations.npmDeprecatedCheck) {
    disabledToggles.push("npmDeprecatedCheck");
  }
  if (!checkGroupConfig.integrations.eslint) {
    disabledToggles.push("eslint");
  }

  if (disabledToggles.length > 0 && typeof logger.info === "function") {
    logger.info(`Check groups disabled for this run: ${disabledToggles.join(", ")}`);
  }

  const hasLocalOverrides = Array.isArray(configSources)
    ? configSources.some((entry) => entry?.kind === "local" && entry.applied)
    : false;
  if (hasLocalOverrides && typeof logger.info === "function") {
    logger.info("Applying overrides from check-groups.config.local.json");
  }

  const stats = {
    moduleCounter: 0,
    modulesWithImageCounter: 0,
    modulesWithIssuesCounter: 0,
    issueCounter: 0,
    lastUpdate: formatLocalIsoTimestamp(),
    repositoryHoster: {},
    maintainer: {}
  };

  const issueSummaries = [];

  for (let index = 0; index < modules.length; index += 1) {
    const module = modules[index];
    stats.moduleCounter += 1;

    if (module.image) {
      stats.modulesWithImageCounter += 1;
    }

    module.defaultSortWeight = 0;

    // Extract owner from module.id (format: "owner/repo") for directory lookup
    // The directory is named using the GitHub username from the id, not the maintainer display name
    const owner = module.id.split("/")[0];
    const moduleDir = path.join(
      MODULES_DIR,
      `${module.name}-----${owner}`
    );
    await getLastCommitDate(module, moduleDir);
    if (!module.lastCommit) {
      module.lastCommit = stats.lastUpdate;
    }

    let moduleIssues = normalizeIssuesInput(module.issues);
    module.issues = moduleIssues;

    const repoExists = await pathExists(moduleDir);
    let handledOutdated = false;
    const isOutdated = module.outdated || module.category === "Outdated Modules";

    if (!repoExists) {
      moduleIssues = [
        "Error: It appears that the repository could not be cloned. Check the URL."
      ];
      module.issues = moduleIssues;
    } else if (isOutdated) {
      // Outdated modules: add heavy weight, skip all checks
      module.defaultSortWeight += 900;
      stats.modulesWithIssuesCounter += 1;
      stats.issueCounter += 1;
      module.issues = true;
      handledOutdated = true;
    } else {
      // Try to use cached result for incremental checking
      const cachedResult = await getCachedResult(
        module, // Pass full module object (with id and url)
        moduleDir,
        PROJECT_ROOT,
        moduleCache
      );

      if (cachedResult) {
        // Cache hit! Reuse previous analysis
        cacheHits += 1;
        moduleIssues = Array.isArray(cachedResult.issues)
          ? cachedResult.issues.slice()
          : [];
        module.issues = moduleIssues;

        // Restore image flag from cache if available
        if (typeof cachedResult.hasImage === "boolean") {
          if (cachedResult.hasImage && !module.image) {
            stats.modulesWithImageCounter += 1;
          }
        }
      } else {
        // Cache miss - perform full analysis
        cacheMisses += 1;

        if (module.isArchived) {
          module.defaultSortWeight += 800;
          addIssue(
            moduleIssues,
            "Module is archived, but not marked as outdated in the official module list."
          );
        } else if (!module.name.startsWith("MMM-") && module.name !== "mmpm") {
          addIssue(
            moduleIssues,
            "Recommendation: Module name doesn't follow the recommended pattern (it doesn't start with `MMM-`). Consider renaming your module."
          );
        }

        // Check if main JS file exists with matching module name
        if (module.name !== "mmpm") {
          const mainJsPath = path.join(moduleDir, `${module.name}.js`);
          const mainJsExists = await pathExists(mainJsPath);
          if (!mainJsExists) {
            const rule = getRuleById("legacy-main-js-mismatch");
            if (rule) {
              addIssue(moduleIssues, rule.description);
            }
          }
        }

        await analyzeModule({
          module,
          moduleDir,
          issues: moduleIssues,
          config: checkGroupConfig
        });

        // Cache the result for next run
        await setCachedResult(
          module, // Pass full module object (with id and url)
          moduleDir,
          PROJECT_ROOT,
          {
            issues: moduleIssues.slice(),
            recommendations: [], // Could be extracted if needed
            hasImage: Boolean(module.image)
          },
          moduleCache
        );
      }
    }

    if (!handledOutdated) {
      const issueCount = moduleIssues.length;
      if (issueCount > 0) {
        stats.modulesWithIssuesCounter += 1;
        stats.issueCounter += issueCount;
        issueSummaries.push({
          name: module.name,
          maintainer: module.maintainer,
          url: module.url,
          issues: moduleIssues.slice()
        });
      }

      module.issues = issueCount > 0;
      applySortAdjustments(module, issueCount);
    }

    const hoster = getRepositoryHost(module.url);
    stats.repositoryHoster[hoster] = (stats.repositoryHoster[hoster] ?? 0) + 1;
    stats.maintainer[module.maintainer] =
      (stats.maintainer[module.maintainer] ?? 0) + 1;

    const processed = index + 1;
    progress.tick(processed);
    if (!progress.isInteractive && (processed === totalModules || processed % 25 === 0)) {
      logger.info(`Progress: ${processed}/${totalModules} modules processed`);
    }
  }

  progress.complete();

  stats.maintainer = Object.fromEntries(
    Object.entries(stats.maintainer).sort(([, a], [, b]) => b - a)
  );

  const sanitizedData = {
    ...stageData,
    modules: Array.isArray(stageData.modules)
      ? stageData.modules.map((entry) => {
        if (entry && typeof entry === "object") {
          const { packageJson: _packageJson, license, ...rest } = entry;
          // Only include license if it's a non-empty string (final schema requires string, not null)
          if (typeof license === "string" && license.length > 0) {
            return { ...rest, license };
          }
          return rest;
        }
        return entry;
      })
      : stageData.modules
  };

  await writeOutputs({ data: sanitizedData, stats, summaries: issueSummaries });

  // Save module cache for next run
  await saveModuleCache(MODULE_CACHE_PATH, moduleCache);

  const finishedAt = new Date();
  let summaryPath = null;
  if (runContext && runContext.directory) {
    summaryPath = await writeRunSummaryFile({
      runId: runContext.runId,
      runDirectory: runContext.directory,
      startedAt: runStartedAt,
      finishedAt,
      stats,
      config: checkGroupConfig,
      configSources,
      disabledToggles,
      issueSummaries
    });
  }

  logger.info(
    `${stats.moduleCounter} modules analyzed. For results see file result.md.`
  );

  // Report cache statistics
  const cacheTotal = cacheHits + cacheMisses;
  if (cacheTotal > 0) {
    const cacheHitRate = ((cacheHits / cacheTotal) * 100).toFixed(1);
    logger.info(
      `Incremental checking: ${cacheHits} cached (${cacheHitRate}%), ${cacheMisses} analyzed`
    );
  }

  if (summaryPath) {
    logger.info(
      `Run summary saved to ${path.relative(PROJECT_ROOT, summaryPath)}`
    );
  }
}

main().catch((error) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
