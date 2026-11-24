import { buildModuleAnalysisCacheKey } from "../../scripts/shared/module-analysis-cache.ts";
import { formatIssue, normalizeIssues, type Issue } from "../../scripts/check-modules/issue.ts";
import { createLogger } from "../../scripts/shared/logger.ts";
import fs from "node:fs";
import path from "node:path";
import { analyzeModule } from "./module-analysis.ts";
import { cloneModule } from "./module-clone.ts";
import { enrichModule } from "./module-enrichment.ts";
import type { ModuleInput, ModuleResult, ProcessModuleConfig } from "./module-types.ts";

const logger = createLogger({ name: "worker" });

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeIssueList(issues: unknown): Issue[] {
  return normalizeIssues(issues);
}

function mergeUniqueIssues(target: Issue[], issues: unknown): void {
  const existing = new Set(target.map(formatIssue));
  for (const issue of normalizeIssueList(issues)) {
    const renderedIssue = formatIssue(issue);
    if (!existing.has(renderedIssue)) {
      target.push(issue);
      existing.add(renderedIssue);
    }
  }
}

/**
 * Process a single module through the clone, enrichment, and analysis phases.
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

    analysisResult = await analyzeModule(module, config, allIssues);

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
