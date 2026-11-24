import { EventEmitter } from "node:events";
import { WorkerPool } from "../worker-pool.ts";
import assert from "node:assert/strict";
import test from "node:test";

function createWorkerProcess() {
  const process = new EventEmitter();
  process.send = (message) => {
    if (message.type === "shutdown") {
      process.emit("exit", 0);
    }
  };
  process.kill = () => null;
  return process;
}

function createWorker(pool, batchId = 0) {
  const worker = {
    batchTimeout: null,
    currentBatchId: batchId,
    id: 0,
    lastHeartbeat: new Date(),
    modulesProcessed: 0,
    process: createWorkerProcess(),
    status: "busy"
  };
  pool.workers.set(worker.id, worker);
  return worker;
}

test("WorkerPool resolves when the final batch completes", async () => {
  const pool = new WorkerPool({ batchTimeoutMs: 50 });
  pool.totalBatches = 1;
  const worker = createWorker(pool);

  const completion = pool.waitForCompletion();
  pool.handleBatchComplete(worker.id, {
    batchId: 0,
    durationMs: 1,
    results: [{ id: "module" }]
  });

  await completion;
  assert.equal(pool.completedBatches, 1);
  assert.equal(worker.status, "idle");
  assert.equal(worker.batchTimeout, null);
});

test("WorkerPool rejects when a batch exceeds its timeout", async () => {
  const pool = new WorkerPool({ batchTimeoutMs: 10 });
  pool.totalBatches = 1;
  const worker = createWorker(pool);
  pool.batchQueue = [{ batchId: 0, modules: [] }];
  pool.assignBatch(worker);

  await assert.rejects(pool.waitForCompletion(), /timed out processing batch 0/u);
});

test("WorkerPool shutdown clears active batch timers", async () => {
  const pool = new WorkerPool({ batchTimeoutMs: 10_000 });
  const worker = createWorker(pool);
  worker.batchTimeout = setTimeout(() => null, 10_000);

  await pool.shutdown();

  assert.equal(worker.batchTimeout, null);
  assert.equal(pool.workers.size, 0);
});
