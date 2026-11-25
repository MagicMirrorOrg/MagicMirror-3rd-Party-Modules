import { fork } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { createLogger } from "../shared/logger.ts";
import type { ModuleInput, ModuleResult } from "./module-types.ts";
import {
  isWorkerMessage,
  type ProgressEvent,
  type WorkerMessage,
  type WorkerProcessConfig
} from "./worker-protocol.ts";

interface WorkerPoolConfig {
  taskTimeoutMs?: number;
  workerCount?: number;
}

interface WorkerSlot {
  id: number;
  process: ChildProcess;
  task: ModuleInput | null;
  timer: NodeJS.Timeout | null;
}

const logger = createLogger({ name: "orchestrator" });
const currentDir = dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = join(currentDir, "worker.ts");

function failedResult(module: ModuleInput, error: string): ModuleResult {
  return {
    ...module,
    status: "failed",
    failurePhase: "processing",
    error,
    cloned: false,
    processingTimeMs: 0,
    fromCache: false,
    issues: []
  };
}

export class WorkerPool {
  private config: Required<WorkerPoolConfig>;
  private completionReject: ((error: Error) => void) | null = null;
  private completionResolve: (() => void) | null = null;
  private pending = 0;
  private progressCallback: ((event: ProgressEvent) => void) | null = null;
  private queue: ModuleInput[] = [];
  private results: ModuleResult[] = [];
  private shuttingDown = false;
  private taskConfig: WorkerProcessConfig | null = null;
  private workers = new Map<number, WorkerSlot>();

  constructor(config: WorkerPoolConfig = {}) {
    this.config = {
      workerCount: config.workerCount || Math.max(1, cpus().length - 1),
      taskTimeoutMs: config.taskTimeoutMs || 360_000
    };
  }

  onProgress(callback: (event: ProgressEvent) => void): void {
    this.progressCallback = callback;
  }

  private completeTask(worker: WorkerSlot, result: ModuleResult): void {
    if (!worker.task) {
      return;
    }
    if (worker.timer) {
      clearTimeout(worker.timer);
      worker.timer = null;
    }
    worker.task = null;
    this.recordResult(worker, result);
    this.assignNext(worker);
    this.finishIfComplete();
  }

  private recordResult(worker: WorkerSlot, result: ModuleResult): void {
    this.results.push(result);
    this.pending -= 1;
    this.progressCallback?.({
      type: "module",
      workerId: worker.id,
      moduleId: `${result.name}-----${result.maintainer}`,
      status: result.status,
      fromCache: result.fromCache,
      ...(result.error ? { error: result.error } : {})
    });
  }

  private finishIfComplete(): void {
    if (this.pending !== 0) {
      return;
    }
    const resolve = this.completionResolve;
    this.completionResolve = null;
    this.completionReject = null;
    resolve?.();
  }

  private assignNext(worker: WorkerSlot): void {
    if (this.shuttingDown || !this.taskConfig || worker.task) {
      return;
    }
    const module = this.queue.shift();
    if (!module) {
      return;
    }

    worker.task = module;
    worker.timer = setTimeout(() => {
      const currentTask = worker.task;
      if (!currentTask) {
        return;
      }
      worker.task = null;
      worker.timer = null;
      worker.process.kill();
      this.recordResult(worker, failedResult(currentTask, `Worker ${worker.id} timed out processing ${currentTask.name}`));
      this.finishIfComplete();
      if (this.queue.length > 0 && !this.shuttingDown) {
        void this.replaceWorker(worker.id);
      }
    }, this.config.taskTimeoutMs);
    worker.process.send({
      type: "task",
      payload: { module, config: this.taskConfig }
    });
  }

  private async replaceWorker(workerId: number): Promise<void> {
    this.workers.delete(workerId);
    try {
      const replacement = await this.spawnWorker(workerId);
      this.assignNext(replacement);
    }
    catch (error) {
      this.completionReject?.(error instanceof Error ? error : new Error(String(error)));
      this.completionResolve = null;
      this.completionReject = null;
    }
  }

  private handleMessage(worker: WorkerSlot, message: WorkerMessage): void {
    if (message.type === "result") {
      this.completeTask(worker, message.payload.result);
    }
    else if (message.type === "progress") {
      this.progressCallback?.({
        type: "module",
        workerId: worker.id,
        ...message.payload
      });
    }
  }

  private spawnWorker(workerId: number): Promise<WorkerSlot> {
    return new Promise((resolve, reject) => {
      const child = fork(WORKER_SCRIPT, [], {
        stdio: ["inherit", "inherit", "inherit", "ipc"],
        execArgv: [...process.execArgv, "--disable-warning=ESLintIgnoreWarning"]
      });
      const worker: WorkerSlot = { id: workerId, process: child, task: null, timer: null };
      let ready = false;
      const startupTimer = setTimeout(() => {
        if (!ready) {
          child.kill();
          reject(new Error(`Worker ${workerId} startup timeout`));
        }
      }, 10_000);

      child.on("message", (value: unknown) => {
        if (!isWorkerMessage(value)) {
          return;
        }
        if (value.type === "ready") {
          ready = true;
          clearTimeout(startupTimer);
          this.workers.set(workerId, worker);
          logger.info(`Worker ${workerId} ready (PID: ${value.payload.pid})`);
          resolve(worker);
          return;
        }
        this.handleMessage(worker, value);
      });
      child.once("error", (error) => {
        clearTimeout(startupTimer);
        reject(error);
      });
      child.once("exit", (code, signal) => {
        clearTimeout(startupTimer);
        this.workers.delete(workerId);
        if (this.shuttingDown || !worker.task) {
          return;
        }
        const failedTask = worker.task;
        worker.task = null;
        if (worker.timer) {
          clearTimeout(worker.timer);
          worker.timer = null;
        }
        const exitReason = code === null ? `signal ${signal ?? "unknown"}` : `code ${code}`;
        this.recordResult(worker, failedResult(failedTask, `Worker ${workerId} exited with ${exitReason}`));
        this.finishIfComplete();
        if (this.queue.length > 0 && !this.shuttingDown) {
          void this.replaceWorker(workerId);
        }
      });
    });
  }

  async processModules(modules: ModuleInput[], moduleConfig: WorkerProcessConfig): Promise<ModuleResult[]> {
    if (modules.length === 0) {
      return [];
    }

    this.queue = [...modules];
    this.results = [];
    this.pending = modules.length;
    this.taskConfig = moduleConfig;
    this.shuttingDown = false;
    const workerCount = Math.min(this.config.workerCount, modules.length);
    logger.info(`Starting worker pool: ${workerCount} workers, ${modules.length} modules`);

    try {
      const workers = await Promise.all(Array.from({ length: workerCount }, (_, index) => this.spawnWorker(index)));
      const completion = new Promise<void>((resolve, reject) => {
        this.completionResolve = resolve;
        this.completionReject = reject;
      });
      for (const worker of workers) {
        this.assignNext(worker);
      }
      await completion;
      return this.results;
    }
    finally {
      await this.shutdown();
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    const workers = [...this.workers.values()];
    for (const worker of workers) {
      if (worker.timer) {
        clearTimeout(worker.timer);
        worker.timer = null;
      }
      worker.process.send({ type: "shutdown" });
    }
    await Promise.all(workers.map(worker => new Promise<void>((resolve) => {
      if (worker.process.exitCode !== null || worker.process.signalCode !== null) {
        resolve();
        return;
      }
      const forceKill = setTimeout(() => {
        worker.process.kill();
        resolve();
      }, 5_000);
      worker.process.once("exit", () => {
        clearTimeout(forceKill);
        resolve();
      });
    })));
    this.workers.clear();
  }
}
