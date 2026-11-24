import { buildResultMarkdown, collectIssueSummaries } from "./check-modules/result-markdown.ts";
import { createLogger } from "./shared/logger.ts";
import { ensureDirectory, readJson } from "./shared/fs-utils.ts";
import type { ProcessedModule, CatalogueStats } from "./shared/module-catalogue-output.ts";
import { dirname, resolve } from "node:path";
import { writeFile } from "node:fs/promises";

interface ResultMarkdownLogger {
  info: (message: string, data?: unknown) => void;
}

interface GenerateResultMarkdownOptions {
  projectRoot?: string;
  resultPath?: string;
  runLogger?: ResultMarkdownLogger;
  processedModules?: ProcessedModule[];
  stats?: CatalogueStats;
}

const logger = createLogger({ name: "generate-result-markdown" });
const PROJECT_ROOT = resolve(process.cwd());

export async function runGenerateResultMarkdown({
  projectRoot = PROJECT_ROOT,
  resultPath,
  runLogger = logger,
  processedModules,
  stats
}: GenerateResultMarkdownOptions = {}): Promise<{ issueCount: number; outputPath: string }> {
  if (!Array.isArray(processedModules)) {
    throw new TypeError("runGenerateResultMarkdown requires processedModules from the in-memory pipeline handoff");
  }

  const outputPath = resultPath ?? resolve(projectRoot, "website", "result.md");
  const resolvedStats = stats
    ?? await readJson<CatalogueStats>(resolve(projectRoot, "website", "data", "stats.json"));
  const summaries = collectIssueSummaries(processedModules);
  const markdown = buildResultMarkdown(resolvedStats, summaries);

  await ensureDirectory(dirname(outputPath));
  await writeFile(outputPath, markdown, "utf8");
  runLogger.info(`Generated result markdown at ${outputPath}`);

  return {
    issueCount: summaries.length,
    outputPath
  };
}