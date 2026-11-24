#!/usr/bin/env node
/**
 * Worker process entry point
 *
 * This script runs in a child process and processes batches of modules.
 * Communicates with parent orchestrator via IPC messages.
 */

import type { Issue } from "../check-modules/issue.ts";
import { createLogger } from "../shared/logger.ts";
import { createModuleLogger } from "./module-logger.ts";
import process from "node:process";
import { processModule } from "./process-module.ts";

interface WorkerModule {
  id: string;
  maintainer: string;
  name: string;
  url: string;
  [key: string]: unknown;
}

interface WorkerConfig {
  projectRoot: string;
  runId?: string;
  [key: string]: unknown;
}

interface ModuleBatch {
  batchId: number;
  config: WorkerConfig;
  modules: WorkerModule[];
}

interface WorkerProgressPayload {
  batchId: number;
  fromCache?: boolean;
  moduleId: string;
  status: string;
}

interface BatchResultItem extends WorkerModule {
  cloned: boolean;
  error?: string;
  fromCache: boolean;
  issues: Issue[];
  processingTimeMs: number;
  status: string;
}

interface BatchErrorInfo {
  error: string;
  moduleId: string;
  phase: string;
  stack?: string;
}

interface BatchCompletePayload {
  batchId: number;
  durationMs: number;
  errors: BatchErrorInfo[];
  processedAt: string;
  results: BatchResultItem[];
}

type WorkerMessage =
  | { payload: ModuleBatch; type: "batch" }
  | { payload: { pid: number }; type: "ready" }
  | { payload: WorkerProgressPayload; type: "progress" }
  | { payload: BatchCompletePayload; type: "complete" }
  | { payload: { error: string; stack?: string }; type: "error" }
  | { payload?: undefined; type: "shutdown" };

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const logger = createLogger({ name: "worker" });

/**
 * @typedef {Object} ModuleBatch
 * @property {number} batchId
 * @property {Array} modules
 * @property {Object} config
 */

/**
 * @typedef {Object} WorkerMessage
 * @property {string} type - Message type: 'batch', 'shutdown'
 * @property {*} payload
 */

/**
 * Send message to parent process
 * @param {Object} message
 */
function sendMessage(message: WorkerMessage): void {
  if (process.send) {
    process.send(message);
  }
  else {
    logger.error("Cannot send message: not running as child process");
  }
}

/**
 * Process a batch of modules
 * @param {ModuleBatch} batch
 * @returns {Promise<Object>}
 */
async function processBatch(batch: ModuleBatch): Promise<BatchCompletePayload> {
  const { batchId, modules, config } = batch;
  const startTime = Date.now();
  const results: BatchResultItem[] = [];
  const errors: BatchErrorInfo[] = [];

  logger.info(`Worker processing batch ${batchId} with ${modules.length} modules`);

  // Get runId from config or generate one
  const runId = config.runId || new Date().toISOString().replace(/:/gu, "-").replace(/\..+/u, "");

  for (const module of modules) {
    let moduleLogger: Awaited<ReturnType<typeof createModuleLogger>> | null = null;

    try {
      // Create per-module logger
      const moduleId = `${module.name}-----${module.maintainer}`;
      try {
        moduleLogger = await createModuleLogger({
          projectRoot: config.projectRoot,
          runId,
          moduleId,
          workerId: process.pid
        });
      }
      catch (loggerError) {
        logger.warn(`Failed to create module logger for ${module.name}:`, loggerError);
        // Continue without module logger
      }

      // Send progress event
      sendMessage({
        type: "progress",
        payload: {
          batchId,
          moduleId,
          status: "started"
        }
      });

      // Process the module with logger
      let result: BatchResultItem;
      try {
        result = await processModule(module, {
          ...config,
          moduleLogger
        } as Parameters<typeof processModule>[1]) as BatchResultItem;
      }
      catch (processError) {
        logger.error(`processModule failed for ${module.name}:`, processError);

        // Log error if logger is available
        if (moduleLogger) {
          await moduleLogger.error("process", `Processing failed: ${getErrorMessage(processError)}`, {
            error: getErrorMessage(processError),
            stack: processError instanceof Error ? processError.stack : undefined
          });
          await moduleLogger.close();
        }

        // Create a failed result instead of crashing
        result = {
          name: module.name,
          maintainer: module.maintainer,
          id: module.id || moduleId,
          url: module.url,
          status: "failed",
          error: getErrorMessage(processError),
          cloned: false,
          issues: [],
          processingTimeMs: 0,
          fromCache: false
        };
      }
      results.push(result);

      // Send completion event
      sendMessage({
        type: "progress",
        payload: {
          batchId,
          moduleId,
          status: result.status,
          fromCache: result.fromCache
        }
      });
    }
    catch (error) {
      const moduleId = `${module.name}-----${module.maintainer}`;
      const errorInfo: BatchErrorInfo = {
        moduleId,
        phase: "unknown",
        error: getErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined
      };
      errors.push(errorInfo);
      logger.error(`Failed to process ${module.name}:`, error);

      // Log to module logger if available
      if (moduleLogger) {
        try {
          await moduleLogger.error("error", `Unexpected error: ${getErrorMessage(error)}`, {
            error: getErrorMessage(error),
            stack: error instanceof Error ? error.stack : undefined
          });
          await moduleLogger.close();
        }
        catch {
          // Ignore logger errors at this point
        }
      }

      // Add failed result
      results.push({
        name: module.name,
        maintainer: module.maintainer,
        id: module.id,
        url: module.url,
        status: "failed",
        error: getErrorMessage(error),
        cloned: false,
        issues: [],
        processingTimeMs: 0,
        fromCache: false
      });
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    batchId,
    processedAt: new Date().toISOString(),
    durationMs,
    results,
    errors
  };
}

/**
 * Main worker loop
 */
function workerMain(): Promise<void> {
  logger.info(`Worker started (PID: ${process.pid})`);

  // Listen for messages from parent
  process.on("message", async (message: WorkerMessage) => {
    const { type, payload } = message;

    try {
      switch (type) {
        case "batch": {
          const result = await processBatch(payload);
          sendMessage({ type: "complete", payload: result });
          break;
        }

        case "shutdown": {
          logger.info("Worker received shutdown signal");
          process.exit(0);
        }
        // Falls through - unreachable after process.exit

        default: {
          logger.warn(`Unknown message type: ${type}`);
          break;
        }
      }
    }
    catch (error) {
      logger.error("Worker error:", error);
      sendMessage({
        type: "error",
        payload: {
          error: getErrorMessage(error),
          stack: error instanceof Error ? error.stack : undefined
        }
      });
    }
  });

  // Send ready signal
  sendMessage({ type: "ready", payload: { pid: process.pid } });

  // Keep process alive
  process.on("SIGTERM", () => {
    logger.info("Worker received SIGTERM");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    logger.info("Worker received SIGINT");
    process.exit(0);
  });

  return Promise.resolve();
}

// Start worker if run as child process
if (process.send) {
  workerMain().catch((error) => {
    logger.error("Fatal worker error:", error);
    process.exit(1);
  });
}
else {
  console.error("This script must be run as a child process");
  process.exit(1);
}
