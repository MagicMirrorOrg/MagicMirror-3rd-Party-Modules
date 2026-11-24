#!/usr/bin/env node

import { parseArgs } from "node:util";
import process from "node:process";
import { resolve } from "node:path";
import { runAggregateCatalogue } from "../aggregate-catalogue.ts";
import { runCollectMetadata } from "../collect-metadata/index.ts";
import { runGenerateResultMarkdown } from "../generate-result-markdown.ts";
import { runParallelProcessing, writeSkippedModulesFile } from "../parallel-processing.ts";
import { validateStageFile } from "../lib/schemaValidator.ts";
import { createLogger, createStageProgressLogger, type LogFormat, type StageProgressLogger } from "../shared/logger.ts";

const PIPELINE_ID = "full-refresh-parallel";
const PROJECT_ROOT = resolve(process.cwd());
const TOTAL_STAGES = 4;

interface PipelineOptions {
  batchSize: number;
  cacheDisabled: boolean;
  localOnly: boolean;
  workerCount?: number;
}

interface StageDetails {
  id: string;
  name: string;
}

type PipelineExecutionError = Error & {
  stage?: StageDetails;
  stepNumber?: number;
  totalStages?: number;
};

function parsePositiveInteger(value: string | undefined, fallback: number, option: string): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${option} must be a positive integer.`);
  }
  return parsed;
}

export function parsePipelineOptions(args: string[] = process.argv.slice(2)): PipelineOptions {
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    options: {
      "batch-size": { type: "string" },
      "local-only": { type: "boolean" },
      "no-cache": { type: "boolean" },
      "workers": { type: "string" }
    }
  });
  const workerCount = values.workers ?? process.env.PIPELINE_WORKER_COUNT;
  return {
    batchSize: parsePositiveInteger(values["batch-size"], 50, "batch-size"),
    cacheDisabled: values["no-cache"] === true || process.env.PIPELINE_CACHE_DISABLED === "1",
    localOnly: values["local-only"] === true,
    workerCount: workerCount === undefined ? undefined : parsePositiveInteger(workerCount, 0, "workers")
  };
}

function formatStageDuration(durationMs: number): string {
  const seconds = durationMs / 1000;
  return seconds >= 1 ? `${seconds.toFixed(1)}s` : `${durationMs}ms`;
}

async function runStage<T>(
  stage: StageDetails,
  stepNumber: number,
  logger: StageProgressLogger,
  operation: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  logger.start(stage, { stepNumber, total: TOTAL_STAGES });
  try {
    const result = await operation();
    const durationMs = Date.now() - startedAt;
    logger.succeed(stage, {
      stepNumber,
      total: TOTAL_STAGES,
      durationMs,
      formattedDuration: formatStageDuration(durationMs)
    });
    return result;
  }
  catch (error) {
    logger.fail(stage, { stepNumber, total: TOTAL_STAGES, error });
    if (error instanceof Error) {
      const pipelineError = error as PipelineExecutionError;
      pipelineError.stage = stage;
      pipelineError.stepNumber = stepNumber;
      pipelineError.totalStages = TOTAL_STAGES;
    }
    throw error;
  }
}

async function validatePublishedOutput(id: string, path: string, schemaId: string, logger: StageProgressLogger): Promise<void> {
  try {
    await validateStageFile(schemaId, resolve(PROJECT_ROOT, path));
  }
  catch (error) {
    if (error instanceof Error) {
      error.message = `Stage "aggregate-catalogue" produced invalid artifact "${id}" (${path}):\n${error.message}`;
    }
    throw error;
  }
  if (logger.format === "json") {
    logger.info(`Validated ${id}`, { event: "artifact_validated", artifactId: id, schemaId, path });
  }
  else {
    console.log(`   ↳ validated ${id} against ${schemaId}`);
  }
}

export async function runPipeline(options: PipelineOptions): Promise<void> {
  const logFormat = process.env.LOG_FORMAT ?? "text";
  const baseLogger = createLogger({ name: "pipeline", format: logFormat as LogFormat });
  const logger = createStageProgressLogger(baseLogger);

  if (logFormat !== "json") {
    console.log(`Running pipeline "${PIPELINE_ID}"\n`);
  }

  const metadata = await runStage(
    { id: "collect-metadata", name: "Collect Metadata" },
    1,
    logger,
    () => runCollectMetadata({ localOnly: options.localOnly })
  );
  const processing = await runStage(
    { id: "parallel-processing", name: "Parallel module processing" },
    2,
    logger,
    async () => {
      const result = await runParallelProcessing({
        modules: metadata.modules,
        projectRoot: PROJECT_ROOT,
        runLogger: logger,
        workerCount: options.workerCount,
        batchSize: options.batchSize,
        cacheDisabled: options.cacheDisabled,
        localOnly: options.localOnly
      });
      await writeSkippedModulesFile(result.results, PROJECT_ROOT);
      return result;
    }
  );
  const aggregate = await runStage(
    { id: "aggregate-catalogue", name: "Aggregate catalogue outputs" },
    3,
    logger,
    async () => {
      const result = await runAggregateCatalogue({
        processedModules: processing.processedModules,
        projectRoot: PROJECT_ROOT,
        runLogger: logger
      });
      await validatePublishedOutput("issues-json", "website/data/issues.json", "issues", logger);
      await validatePublishedOutput("modules-json", "website/data/modules.json", "modules.final", logger);
      await validatePublishedOutput("modules-json-min", "website/data/modules.min.json", "modules.min", logger);
      await validatePublishedOutput("stats-json", "website/data/stats.json", "stats", logger);
      return result;
    }
  );
  await runStage(
    { id: "generate-result-markdown", name: "Generate result markdown" },
    4,
    logger,
    () => runGenerateResultMarkdown({
      processedModules: processing.processedModules,
      projectRoot: PROJECT_ROOT,
      runLogger: logger,
      stats: aggregate.stats
    })
  );

  if (logFormat === "json") {
    baseLogger.info(`Pipeline "${PIPELINE_ID}" completed successfully.`, {
      event: "pipeline_succeed",
      pipelineId: PIPELINE_ID
    });
  }
  else {
    console.log(`\nPipeline "${PIPELINE_ID}" completed successfully.`);
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  try {
    await runPipeline(parsePipelineOptions(args));
  }
  catch (error) {
    console.error(`\nPipeline execution failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}
