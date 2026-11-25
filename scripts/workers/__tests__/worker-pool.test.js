import { mkdtemp, rm } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { WorkerPool } from "../worker-pool.ts";
import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

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
  const events = [];
  pool.onProgress(event => events.push(event));
  installFakeWorker(pool, () => null);

  const results = await pool.processModules([moduleInput], moduleConfig);

  assert.equal(results.length, 1);
  assert.equal(results[0].status, "failed");
  assert.match(results[0].error, /timed out/u);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "failed");
  assert.equal(events[0].moduleId, "module-----owner");
  assert.match(events[0].error, /timed out/u);
  assert.equal(pool.pending, 0);
});

test("WorkerPool continues queued work after a timeout", async () => {
  const pool = new WorkerPool({ workerCount: 1, taskTimeoutMs: 20 });
  const events = [];
  pool.onProgress(event => events.push(event));
  let taskCount = 0;
  installFakeWorker(pool, ({ pool: activePool, worker, message }) => {
    taskCount += 1;
    if (taskCount === 2) {
      queueMicrotask(() => activePool.handleMessage(worker, {
        type: "result",
        payload: { result: { ...message.payload.module, status: "success", fromCache: false } }
      }));
    }
  });

  const results = await pool.processModules([moduleInput, { ...moduleInput, name: "next" }], moduleConfig);
  assert.deepEqual(results.map(result => result.status), ["failed", "success"]);
  assert.deepEqual(events.map(event => event.status), ["failed", "success"]);
  assert.match(events[0].error, /timed out/u);
  assert.equal(pool.pending, 0);
});

test("WorkerPool reports unexpected worker exits", { timeout: 5000 }, async (context) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-exit-test-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));
  const pool = new WorkerPool({ workerCount: 1, taskTimeoutMs: 2000 });
  const events = [];
  pool.onProgress((event) => {
    events.push(event);
    if (event.status === "started") {
      pool.workers.get(event.workerId).process.kill("SIGKILL");
    }
  });

  const results = await pool.processModules([moduleInput], { ...moduleConfig, projectRoot });
  assert.equal(results[0].status, "failed");
  const failure = events.find(event => event.status === "failed");
  assert.equal(failure.moduleId, "module-----owner");
  assert.match(failure.error, /exited with signal SIGKILL/u);
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
