import { checkConfigSchema } from "../check-modules/config-schema-check.ts";
import { applyDependencyIntegrations } from "../check-modules/dependency-integrations.ts";
import { runEslintCheck } from "../check-modules/eslint-check.ts";
import { createIssue, formatIssue, normalizeIssues, type Issue } from "../check-modules/issue.ts";
import { analyzeModule as performModuleAnalysis } from "../check-modules/module-analyzer.ts";
import fs from "node:fs";
import path from "node:path";
import type { AnalysisResult, ModuleInput, ProcessModuleConfig } from "./module-types.ts";

function getModuleFiles(directory: string, baseDirectory = directory, files: string[] = []): string[] {
  try {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(baseDirectory, fullPath);
      const pathSegments = relativePath.split(path.sep);
      if (pathSegments.includes(".git") || pathSegments.includes("node_modules")) {
        continue;
      }
      if (entry.isDirectory()) {
        getModuleFiles(fullPath, baseDirectory, files);
      }
      else {
        files.push(fullPath);
      }
    }
  }
  catch {
    return files;
  }
  return files;
}

function mergeUniqueIssues(target: Issue[], values: unknown): void {
  const existing = new Set(target.map(formatIssue));
  for (const issue of normalizeIssues(values)) {
    const rendered = formatIssue(issue);
    if (!existing.has(rendered)) {
      target.push(issue);
      existing.add(rendered);
    }
  }
}

async function runModuleAnalyzer(module: ModuleInput, config: ProcessModuleConfig): Promise<AnalysisResult> {
  const cloneDir = path.join(config.modulesDir, `${module.name}-----${module.maintainer}`);
  try {
    const files = getModuleFiles(cloneDir);
    if (files.length === 0) {
      return {
        analysisIssues: [createIssue("Error", "Unable to read module files for analysis")],
        recommendations: []
      };
    }
    const result = await performModuleAnalysis(cloneDir, module.name, module.url, files);
    return { analysisIssues: result.issues, recommendations: result.recommendations };
  }
  catch (error) {
    return {
      analysisIssues: [createIssue(undefined, `Analysis error: ${error instanceof Error ? error.message : String(error)}`, { severity: "error" })],
      recommendations: []
    };
  }
}

export async function analyzeModule(module: ModuleInput, config: ProcessModuleConfig, allIssues: Issue[]): Promise<AnalysisResult> {
  const cloneDir = path.join(config.modulesDir, `${module.name}-----${module.maintainer}`);
  const result = module.outdated && !config.localOnly
    ? { analysisIssues: [], recommendations: [] }
    : await runModuleAnalyzer(module, config);

  mergeUniqueIssues(allIssues, result.analysisIssues);
  mergeUniqueIssues(allIssues, result.recommendations);

  if (!module.outdated || config.localOnly) {
    const analysisConfig = config.analysisConfig ?? config.checkGroups ?? {};
    mergeUniqueIssues(allIssues, await runEslintCheck(cloneDir, analysisConfig.eslint !== false && analysisConfig.deep !== false));
    mergeUniqueIssues(allIssues, await checkConfigSchema(cloneDir, allIssues.length));
  }
  if (!module.outdated) {
    await applyDependencyIntegrations(cloneDir, allIssues, config);
  }
  return result;
}
