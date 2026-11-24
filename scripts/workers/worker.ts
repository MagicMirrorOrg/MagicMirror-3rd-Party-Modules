#!/usr/bin/env node

import process from "node:process";
import { getErrorMessage } from "../shared/errors.ts";
import { createLogger } from "../shared/logger.ts";
import { createModuleLogger } from "./module-logger.ts";
import { processModule } from "./process-module.ts";
import type { ModuleResult } from "./module-types.ts";
import { isWorkerMessage, type WorkerMessage, type WorkerTask } from "./worker-protocol.ts";

const logger = createLogger({ name: "worker" });

function sendMessage(message: WorkerMessage): void {
  process.send?.(message);
}

async function runTask(task: WorkerTask): Promise<void> {
  const { config, module } = task;
  const moduleId = `${module.name}-----${module.maintainer}`;
  const startedAt = Date.now();
  let moduleLogger: Awaited<ReturnType<typeof createModuleLogger>> | null = null;
  let result: ModuleResult;

  sendMessage({
    type: "progress",
    payload: { moduleId, status: "started" }
  });

  try {
    moduleLogger = await createModuleLogger({
      projectRoot: config.projectRoot,
      runId: config.runId,
      moduleId,
      workerId: process.pid
    });
    result = await processModule(module, { ...config, moduleLogger });
  }
  catch (error) {
    const message = getErrorMessage(error);
    logger.error(`Failed to process ${module.name}:`, error);
    if (moduleLogger) {
      await moduleLogger.error("process", message, {
        error: message,
        stack: error instanceof Error ? error.stack : undefined
      });
    }
    result = {
      ...module,
      status: "failed",
      failurePhase: "processing",
      error: message,
      cloned: false,
      issues: [],
      processingTimeMs: Date.now() - startedAt,
      fromCache: false
    };
  }
  finally {
    await moduleLogger?.close();
  }

  sendMessage({
    type: "result",
    payload: { result }
  });
}

if (!process.send) {
  console.error("This script must be run as a child process");
  process.exit(1);
}

logger.info(`Worker started (PID: ${process.pid})`);
let busy = false;
process.on("message", async (value: unknown) => {
  if (!isWorkerMessage(value)) {
    return;
  }
  if (value.type === "shutdown") {
    process.exit(0);
  }
  if (value.type !== "task") {
    return;
  }
  if (busy) {
    logger.error(`Worker ${process.pid} received a task while busy`);
    return;
  }
  busy = true;
  await runTask(value.payload);
  busy = false;
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
sendMessage({ type: "ready", payload: { pid: process.pid } });
