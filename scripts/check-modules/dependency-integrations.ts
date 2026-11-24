import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { getErrorMessage } from "../shared/errors.ts";
import { fileExists } from "../shared/fs-utils.ts";
import { createLogger } from "../shared/logger.ts";
import { createIssue, ISSUE_POLICY, mergeUniqueIssues, type Issue } from "./issue.ts";

export const NCU_COOLDOWN = "7d";

interface DependencyAnalysisConfig {
  deep?: boolean;
  ncu?: boolean;
  npmDeprecatedCheck?: boolean;
}

interface DependencyIntegrationConfig {
  analysisConfig?: DependencyAnalysisConfig;
}

const execFileAsync = promisify(execFile);
const logger = createLogger({ name: "dependency-integrations" });

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
    return lines.length > 0 ? lines.join("\n") : null;
  }
  catch (error) {
    logger.warn(`npm-deprecated-check failed in ${moduleDir}: ${getErrorMessage(error)}`);
    return null;
  }
}

export async function applyDependencyIntegrations(moduleDir: string, issues: Issue[], config: DependencyIntegrationConfig): Promise<void> {
  const analysisConfig = config.analysisConfig ?? {};
  if (analysisConfig.deep === false || !fileExists(path.join(moduleDir, "package.json")) || issues.length >= ISSUE_POLICY.maxBeforeDependencyChecks) {
    return;
  }

  if (analysisConfig.ncu !== false) {
    const upgrades = await runNpmCheckUpdates(moduleDir);
    if (upgrades.length > 0) {
      const details = upgrades.map(entry => `   - ${entry}`).join("\n");
      mergeUniqueIssues(issues, [createIssue("Information", `There are updates for ${upgrades.length} dependencie(s):\n${details}`)]);
    }
  }

  if (issues.length < ISSUE_POLICY.maxBeforeDeprecatedCheck && analysisConfig.npmDeprecatedCheck !== false) {
    const deprecated = await runDeprecatedCheck(moduleDir);
    if (deprecated) {
      mergeUniqueIssues(issues, [createIssue(undefined, deprecated)]);
    }
  }
}
