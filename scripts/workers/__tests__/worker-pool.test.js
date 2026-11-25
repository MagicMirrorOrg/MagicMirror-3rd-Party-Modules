import { EventEmitter } from "node:events";
import { WorkerPool } from "../worker-pool.ts";
import assert from "node:assert/strict";
import test from "node:test";

const moduleInput = {
  id: "owner/module",
  issues: [],
  maintainer: "owner",
  name: "module",
  url: "https://github.com/owner/module"
};

const moduleConfig = {
  runId: "test-run",
  projectRoot: "/tmp/project",
  modulesDir: "/tmp/project/modules",
  modulesTempDir: "/tmp/project/modules_temp",
  imagesDir: "/tmp/project/website/images",
  cacheEnabled: false
};

function installFakeWorker(pool, onTask) {
  pool.spawnWorker = (id) => {
    const process = new EventEmitter();
    process.exitCode = null;
    process.signalCode = null;
    process.kill = () => null;
    process.send = (message) => {
      if (message.type === "shutdown") {
        process.exitCode = 0;
        queueMicrotask(() => process.emit("exit", 0));
      }
      else if (message.type === "task") {
        onTask({ pool, process, worker, message });
      }
    };
    const worker = { id, process, task: null, timer: null };
    pool.workers.set(id, worker);
    return Promise.resolve(worker);
  };
}

test("WorkerPool returns one result per module task", async () => {
  const pool = new WorkerPool({ workerCount: 1, taskTimeoutMs: 100 });
  installFakeWorker(pool, ({ pool: activePool, worker, message }) => {
    queueMicrotask(() => activePool.handleMessage(worker, {
      type: "result",
      payload: {
        result: {
          ...message.payload.module,
          cloned: true,
          fromCache: false,
          processingTimeMs: 1,
          status: "success"
        }
      }
    }));
  });

  const results = await pool.processModules([moduleInput], moduleConfig);

  assert.equal(results.length, 1);
  assert.equal(results[0].status, "success");
  assert.equal(pool.pending, 0);
  assert.equal(pool.workers.size, 0);
});

test("WorkerPool turns a task timeout into a module failure", async () => {
  const pool = new WorkerPool({ workerCount: 1, taskTimeoutMs: 10 });
  installFakeWorker(pool, () => null);

  const results = await pool.processModules([moduleInput], moduleConfig);

  assert.equal(results.length, 1);
  assert.equal(results[0].status, "failed");
  assert.match(results[0].error, /timed out/u);
  assert.equal(pool.pending, 0);
});

test("WorkerPool defaults to a six-minute task timeout", () => {
  const pool = new WorkerPool({ workerCount: 1 });
  assert.equal(pool.config.taskTimeoutMs, 360_000);
});

test("WorkerPool shutdown clears task timers", async () => {
  const pool = new WorkerPool({ workerCount: 1, taskTimeoutMs: 10_000 });
  installFakeWorker(pool, () => null);
  const worker = await pool.spawnWorker(0);
  worker.task = moduleInput;
  worker.timer = setTimeout(() => null, 10_000);

  await pool.shutdown();

  assert.equal(worker.timer, null);
  assert.equal(pool.workers.size, 0);
});
