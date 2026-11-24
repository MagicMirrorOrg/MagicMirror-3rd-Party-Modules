/**
 * Worker pool orchestrator
 *
 * Manages a pool of worker processes for parallel module processing.
 */

import { dirname, join } from "node:path";
import { cpus } from "node:os";
import { createLogger } from "../shared/logger.ts";
import { fileURLToPath } from "node:url";
import { fork } from "node:child_process";
import type { ChildProcess } from "node:child_process";

interface WorkerPoolConfig {
  batchSize?: number;
  batchTimeoutMs?: number;
  moduleTimeoutMs?: number;
  workerCount?: number;
}

interface WorkerModule {
  [key: string]: unknown;
}

interface WorkerBatch {
  batchId: number;
  config?: Record<string, unknown>;
  modules: WorkerModule[];
}

interface WorkerMessage {
  payload?: Record<string, unknown>;
  type: string;
}

interface WorkerInfo {
  batchTimeout: NodeJS.Timeout | null;
  currentBatchId: number | null;
  id: number;
  lastHeartbeat: Date;
  modulesProcessed: number;
  process: ChildProcess;
  status: "busy" | "crashed" | "idle";
}

interface BatchResult {
  batchId: number;
  durationMs: number;
  results: WorkerModule[];
}

interface ProgressEvent {
  [key: string]: unknown;
  type: string;
  workerId?: number;
}

const logger = createLogger({ name: "orchestrator" });
const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const WORKER_SCRIPT = join(currentDir, "worker.ts");

/**
 * @typedef {Object} WorkerPoolConfig
 * @property {number} workerCount - Number of workers (default: CPU count - 1)
 * @property {number} batchSize - Modules per batch (default: 50)
 * @property {number} moduleTimeoutMs - Timeout per module (default: 60000)
 * @property {number} batchTimeoutMs - Timeout per batch (default: 1800000)
 */

/**
 * @typedef {Object} WorkerInfo
 * @property {number} id
 * @property {ChildProcess} process
 * @property {string} status - 'idle' | 'busy' | 'crashed'
 * @property {number|null} currentBatchId
 * @property {number} modulesProcessed
 * @property {Date} lastHeartbeat
 */

/**
 * Distribute modules into batches
 * @param {Array} modules
 * @param {number} batchSize
 * @returns {Array<{batchId: number, modules: Array}>}
 */
function distributeBatches(modules: WorkerModule[], batchSize: number): WorkerBatch[] {
  const batches: WorkerBatch[] = [];

  for (let index = 0; index < modules.length; index += batchSize) {
    batches.push({
      batchId: batches.length,
      modules: modules.slice(index, index + batchSize)
    });
  }

  return batches;
}

/**
 * Worker Pool Manager
 */
export class WorkerPool {
  private batchQueue: WorkerBatch[];
  private completedBatches: number;
  private config: Required<WorkerPoolConfig>;
  private completionReject: ((error: Error) => void) | null;
  private completionResolve: (() => void) | null;
  private progressCallback: ((event: ProgressEvent) => void) | null;
  private results: BatchResult[];
  private totalBatches: number;
  private workers: Map<number, WorkerInfo>;

  /**
   * @param {WorkerPoolConfig} config
   */
  constructor(config: WorkerPoolConfig = {}) {
    this.config = {
      workerCount: config.workerCount || Math.max(1, cpus().length - 1),
      batchSize: config.batchSize || 50,
      moduleTimeoutMs: config.moduleTimeoutMs || 60000,
      batchTimeoutMs: config.batchTimeoutMs || 1800000
    };

    this.workers = new Map();
    this.completionResolve = null;
    this.completionReject = null;
    this.batchQueue = [];
    this.results = [];
    this.totalBatches = 0;
    this.completedBatches = 0;
    this.progressCallback = null;
  }

  /**
   * Set progress callback for UI updates
   * @param {Function} callback
   */
  onProgress(callback: (event: ProgressEvent) => void): void {
    this.progressCallback = callback;
  }

  /**
   * Spawn a worker process
   * @param {number} workerId
   * @returns {Promise<WorkerInfo>}
   */
  spawnWorker(workerId: number): Promise<WorkerInfo> {
    return new Promise((resolve, reject) => {
      const workerProcess = fork(WORKER_SCRIPT, [], {
        stdio: ["inherit", "inherit", "inherit", "ipc"]
      });

      const workerInfo: WorkerInfo = {
        batchTimeout: null,
        id: workerId,
        process: workerProcess,
        status: "idle",
        currentBatchId: null,
        modulesProcessed: 0,
        lastHeartbeat: new Date()
      };

      // Handle worker messages
      workerProcess.on("message", (message) => {
        this.handleWorkerMessage(workerId, message as WorkerMessage);
      });

      // Handle worker errors
      workerProcess.on("error", (error) => {
        logger.error(`Worker ${workerId} error:`, error);
        workerInfo.status = "crashed";
      });

      // Handle worker exit
      workerProcess.on("exit", (code) => {
        if (code !== 0) {
          logger.error(`Worker ${workerId} exited with code ${code}`);
          workerInfo.status = "crashed";

          // Re-queue batch if worker crashed while processing
          if (workerInfo.currentBatchId !== null) {
            const batch = this.findBatch(workerInfo.currentBatchId);
            if (batch) {
              logger.warn(`Re-queuing batch ${batch.batchId} after worker crash`);
              this.batchQueue.unshift(batch);
            }
          }
        }
        this.workers.delete(workerId);
      });

      // Wait for ready signal
      const readyHandler = (message: WorkerMessage) => {
        if (message.type === "ready") {
          workerProcess.off("message", readyHandler);
          this.workers.set(workerId, workerInfo);
          logger.info(`Worker ${workerId} ready (PID: ${message.payload?.pid})`);
          resolve(workerInfo);
        }
      };
      workerProcess.on("message", readyHandler);

      // Timeout for worker startup
      setTimeout(() => {
        if (workerInfo.status === "idle") {
          reject(new Error(`Worker ${workerId} startup timeout`));
        }
      }, 10000);
    });
  }

  /**
   * Handle message from worker
   * @param {number} workerId
   * @param {Object} message
   */
  handleWorkerMessage(workerId: number, message: WorkerMessage): void {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return;
    }

    worker.lastHeartbeat = new Date();

    switch (message.type) {
      case "progress":
        if (this.progressCallback) {
          this.progressCallback({
            type: "module",
            workerId,
            ...(message.payload ?? {})
          });
        }
        break;

      case "complete":
        this.handleBatchComplete(workerId, message.payload as unknown as BatchResult);
        break;

      case "error":
        logger.error(`Worker ${workerId} reported error:`, message.payload);
        break;
    }
  }

  /**
   * Handle batch completion
   * @param {number} workerId
   * @param {Object} result
   */
  handleBatchComplete(workerId: number, result: BatchResult): void {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return;
    }

    this.results.push(result);
    this.completedBatches += 1;
    worker.status = "idle";
    if (worker.batchTimeout) {
      clearTimeout(worker.batchTimeout);
      worker.batchTimeout = null;
    }
    worker.currentBatchId = null;
    worker.modulesProcessed += result.results.length;

    logger.info(
      `Batch ${result.batchId} complete (${result.results.length} modules, ${result.durationMs}ms)`
    );

    if (this.progressCallback) {
      this.progressCallback({
        type: "batch-complete",
        batchId: result.batchId,
        completed: this.completedBatches,
        total: this.totalBatches,
        durationMs: result.durationMs
      });
    }

    if (this.completedBatches >= this.totalBatches) {
      const resolve = this.completionResolve;
      this.completionResolve = null;
      this.completionReject = null;
      resolve?.();
    }

    // Assign next batch if available
    this.assignBatch(worker);
  }

  /**
   * Assign next batch to worker
   * @param {WorkerInfo} worker
   */
  assignBatch(worker: WorkerInfo): void {
    if (this.batchQueue.length === 0) {
      return;
    }

    const batch = this.batchQueue.shift();
    if (!batch) {
      return;
    }
    worker.status = "busy";
    worker.currentBatchId = batch.batchId;
    worker.batchTimeout = setTimeout(() => {
      if (worker.status !== "busy" || worker.currentBatchId !== batch.batchId) {
        return;
      }

      const reject = this.completionReject;
      this.completionResolve = null;
      this.completionReject = null;
      reject?.(new Error(`Worker ${worker.id} timed out processing batch ${batch.batchId}`));
    }, this.config.batchTimeoutMs);

    logger.info(`Assigning batch ${batch.batchId} to worker ${worker.id}`);

    worker.process.send({
      type: "batch",
      payload: batch
    });
  }

  /**
   * Find batch by ID
   * @param {number} batchId
   * @returns {Object|null}
   */
  findBatch(batchId: number): WorkerBatch | null {
    return this.batchQueue.find(b => b.batchId === batchId) || null;
  }

  /**
   * Process modules using worker pool
   * @param {Array} modules
   * @param {Object} moduleConfig
   * @returns {Promise<Array>}
   */
  async processModules(modules: WorkerModule[], moduleConfig: Record<string, unknown>): Promise<WorkerModule[]> {
    // Create batches
    const batches = distributeBatches(modules, this.config.batchSize);
    this.totalBatches = batches.length;
    this.completionResolve = null;
    this.completionReject = null;
    this.batchQueue = batches.map(batch => ({
      ...batch,
      config: moduleConfig
    }));

    logger.info(
      `Starting worker pool: ${this.config.workerCount} workers, ${batches.length} batches`
    );

    // Spawn workers
    const workerPromises = [];
    for (let workerIndex = 0; workerIndex < this.config.workerCount; workerIndex += 1) {
      workerPromises.push(this.spawnWorker(workerIndex));
    }

    const workers = await Promise.all(workerPromises);

    // Assign initial batches
    workers.forEach(worker => this.assignBatch(worker));

    // Wait for all batches to complete
    try {
      await this.waitForCompletion();
    }
    finally {
      // Always shut down workers, including after a batch timeout.
      await this.shutdown();
    }

    // Aggregate and return results
    return this.aggregateResults();
  }

  /**
   * Wait for all batches to complete
   * @returns {Promise<void>}
   */
  waitForCompletion(): Promise<void> {
    if (this.completedBatches >= this.totalBatches) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      this.completionResolve = resolve;
      this.completionReject = reject;
    });
  }

  /**
   * Shutdown all workers
   * @returns {Promise<void>}
   */
  async shutdown() {
    logger.info("Shutting down workers...");

    const shutdownPromises = [];
    for (const worker of this.workers.values()) {
      if (worker.batchTimeout) {
        clearTimeout(worker.batchTimeout);
        worker.batchTimeout = null;
      }
      const promise = new Promise<void>((resolve) => {
        let settled = false;
        const forceKillTimeout = setTimeout(() => {
          worker.process.kill();
          if (!settled) {
            settled = true;
            resolve();
          }
        }, 5000);
        worker.process.once("exit", () => {
          if (!settled) {
            settled = true;
            clearTimeout(forceKillTimeout);
            resolve();
          }
        });
        worker.process.send({ type: "shutdown" });
      });
      shutdownPromises.push(promise);
    }

    await Promise.all(shutdownPromises);
    this.workers.clear();
  }

  /**
   * Aggregate results from all batches
   * @returns {Array}
   */
  aggregateResults(): WorkerModule[] {
    const allResults: WorkerModule[] = [];

    for (const batchResult of this.results) {
      allResults.push(...batchResult.results);
    }

    logger.info(`Processed ${allResults.length} modules total`);

    return allResults;
  }
}
