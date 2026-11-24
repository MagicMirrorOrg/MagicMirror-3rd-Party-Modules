#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { PIPELINE_ID, PIPELINE_STAGES, type PipelineStage } from "./pipeline.ts";
import { createLogger, createStageProgressLogger } from "../shared/logger.ts";
import type { LogFormat, StageProgressLogger } from "../shared/logger.ts";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { runAggregateCatalogue } from "../aggregate-catalogue.ts";
import { runCollectMetadata } from "../collect-metadata/index.ts";
import { runGenerateResultMarkdown } from "../generate-result-markdown.ts";
import { runParallelProcessing, writeSkippedModulesFile } from "../parallel-processing.ts";
import { validateStageFile } from "../lib/schemaValidator.ts";

type PipelineExecutionError = Error & {
  stage?: PipelineStage;
  stepNumber?: number;
  totalStages?: number;
};

interface DirectPipelineState {
  modules?: unknown[];
  processedModules?: unknown[];
  stats?: unknown;
}

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const PROJECT_ROOT = resolve(currentDir, "..", "..");

function createArtifactValidator() {
  return async (stage: PipelineStage, logger?: StageProgressLogger): Promise<void> => {
    for (const artifact of stage.outputs ?? []) {
      if (!artifact.schemaId) {
        continue;
      }

      try {
        await validateStageFile(artifact.schemaId, resolve(PROJECT_ROOT, artifact.path));
        if (logger?.format === "json") {
          logger.info(`Validated ${artifact.id}`, {
            event: "artifact_validated",
            artifactId: artifact.id,
            schemaId: artifact.schemaId,
            path: artifact.path
          });
        }
        else {
          console.log(`   ↳ validated ${artifact.id} against ${artifact.schemaId}`);
        }
      }
      catch (error) {
        if (error instanceof Error) {
          error.message = `Stage "${stage.id}" produced invalid artifact "${artifact.id}" (${artifact.path}):\n${error.message}`;
        }
        throw error;
      }
    }
  };
}

function formatStageDuration(durationMs: number): string {
  const seconds = durationMs / 1000;
  return seconds >= 1 ? `${seconds.toFixed(1)}s` : `${durationMs}ms`;
}

async function runStagesDirectly(
  stages: readonly PipelineStage[],
  {
    logger,
    projectRoot,
    validateArtifacts
  }: {
    logger: ReturnType<typeof createStageProgressLogger>;
    projectRoot: string;
    validateArtifacts: ReturnType<typeof createArtifactValidator>;
  }
): Promise<void> {
  const state: DirectPipelineState = {};

  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    const stepNumber = index + 1;
    const total = stages.length;
    const startedAt = Date.now();

    logger.start(stage, { stepNumber, total });

    try {
      switch (stage.id) {
        case "collect-metadata": {
          const result = await runCollectMetadata();
          state.modules = result.modules;
          break;
        }
        case "parallel-processing": {
          if (!state.modules) {
            throw new Error("parallel-processing requires collect-metadata output");
          }

          const result = await runParallelProcessing({
            modules: state.modules as never,
            projectRoot,
            runLogger: logger
          });
          state.processedModules = result.processedModules;
          await writeSkippedModulesFile(result.results, projectRoot);
          break;
        }
        case "aggregate-catalogue": {
          if (!state.processedModules) {
            throw new Error("aggregate-catalogue requires parallel-processing output");
          }

          const result = await runAggregateCatalogue({
            processedModules: state.processedModules as never,
            projectRoot,
            runLogger: logger
          });
          state.stats = result.stats;
          break;
        }
        case "generate-result-markdown": {
          if (!state.processedModules || !state.stats) {
            throw new Error("generate-result-markdown requires aggregate-catalogue output");
          }

          await runGenerateResultMarkdown({
            processedModules: state.processedModules,
            projectRoot,
            runLogger: logger,
            stats: state.stats as never
          });
          break;
        }
        default:
          throw new Error(`Unsupported direct pipeline stage "${stage.id}".`);
      }

      await validateArtifacts(stage, logger);
    }
    catch (error) {
      logger.fail(stage, { stepNumber, total, error });

      if (error instanceof Error) {
        const pipelineError = error as PipelineExecutionError;
        pipelineError.stage = stage;
        pipelineError.stepNumber = stepNumber;
        pipelineError.totalStages = total;
      }

      throw error;
    }

    const durationMs = Date.now() - startedAt;
    logger.succeed(stage, {
      stepNumber,
      total,
      durationMs,
      formattedDuration: formatStageDuration(durationMs)
    });
  }
}

async function runPipeline(): Promise<void> {
  const logFormat = process.env.LOG_FORMAT ?? "text";
  const baseLogger = createLogger({ name: "pipeline", format: logFormat as LogFormat });
  const stageLogger = createStageProgressLogger(baseLogger);
  const validateArtifacts = createArtifactValidator();

  if (logFormat !== "json") {
    console.log(`Running pipeline "${PIPELINE_ID}"\n`);
  }

  try {
    await runStagesDirectly(PIPELINE_STAGES, {
      logger: stageLogger,
      projectRoot: PROJECT_ROOT,
      validateArtifacts
    });

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
  catch (error) {
    if (logFormat === "json") {
      baseLogger.error(`Pipeline execution failed: ${error instanceof Error ? error.message : error}`, {
        event: "pipeline_fail",
        pipelineId: PIPELINE_ID,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    throw error;
  }
}

export async function main(): Promise<void> {
  try {
    await runPipeline();
  }
  catch (error) {
    console.error(`\nPipeline execution failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${currentFile}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
