# Worker Pool

The worker pool provides process isolation for parallel module analysis. The parent process dispatches one module at a time to each child process; `process-module.ts` remains unchanged inside the child.

## Files

- **`worker.ts`**: Child-process entry point and single-task executor
- **`worker-pool.ts`**: Worker lifecycle, task queue, timeout handling, and crash recovery
- **`worker-protocol.ts`**: Typed IPC messages
- **`process-module.ts`**: Clone, enrichment, and analysis phases

## Behavior

- Each child receives one module task at a time.
- A timeout or crash becomes a failed result for that module only.
- A child with queued work is replaced after a crash.
- Results are reported back to `parallel-processing.ts` and merged by module ID.
- Worker count is configurable; the task timeout is 60 seconds by default.

```javascript
import { WorkerPool } from "./worker-pool.ts";

const pool = new WorkerPool({
  workerCount: 4,
  taskTimeoutMs: 60_000
});

pool.onProgress((event) => {
  console.log(`Processed: ${event.moduleId} (${event.status})`);
});

const results = await pool.processModules(modules, moduleConfig);
```

Run through the canonical entry point:

```bash
node --run all -- --workers=4
```

`PIPELINE_WORKER_COUNT` can set the default worker count.

### Architecture

See [../docs/architecture.md](../../docs/architecture.md) for the canonical pipeline architecture.

### Module Processing Flow

```text
┌─────────────────────────────────────────────────────────────┐
│                   processModule()                            │
│                                                              │
│  Input: ModuleInput (from in-memory metadata payload)        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Phase 1: Clone Repository                            │   │
│  │  - Check if repo is up-to-date (skip if cached)     │   │
│  │  - Clone or update repository                        │   │
│  │  - Move from temp to final location                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Phase 2: Enrich Metadata                             │   │
│  │  - Load package.json                                 │   │
│  │  - Derive tags from keywords                         │   │
│  │  - Find and resize screenshot                        │   │
│  │  - Validate license                                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Phase 3: Analyze                                     │   │
│  │  - Fast checks + deep heuristics                     │   │
│  │  - Optional ESLint / npm-check-updates integrations  │   │
│  │  - Dependency and README rule evaluation             │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  Output: ModuleResult                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Design Decisions

### Per-Module Logging ✅

Each module gets its own log file with detailed processing information:

**Log Structure:**

```text
logs/
  {runId}/              # e.g., 2026-02-04T10-30-45
    modules/
      MMM-Module-----Author.worker-12345.log
      MMM-OtherModule-----Dev.worker-12346.log
```

**Features:**

- Organized by run timestamp for historical tracking
- Includes worker PID in filename for debugging
- Structured log entries with phase, level, message, and optional data
- Auto-flush on errors and when buffer reaches 100 entries
- Closed automatically when module processing completes

**Log Format:**

```text
[2026-02-04T10:30:45.123Z] [INFO] [clone] Starting clone stage {"url":"...","branch":"master"}
[2026-02-04T10:30:47.456Z] [INFO] [clone] Repository cloned successfully
[2026-02-04T10:30:47.500Z] [INFO] [enrich] Starting enrichment stage
[2026-02-04T10:30:48.100Z] [INFO] [end] Module processing completed successfully {"processingTimeMs":2977}
```

**Usage:**

The logger is automatically created for each module and passed via config. No manual setup required in module processing code.

### Single Module Processing Function

Instead of calling separate stage scripts, `processModule()` executes all stages inline:

**Advantages:**

- Simpler error handling (try-catch around each phase)
- No intermediate file I/O
- Easy to add progress tracking
- Natural for parallel execution

**Trade-offs:**

- Need to ensure memory doesn't grow unbounded

### Clone Optimization

The worker checks if a local repository is up-to-date before cloning:

```typescript
if (module.lastCommit && repoExists(finalPath)) {
  const localCommit = await getCommitDate({ cwd: finalPath });
  if (localDate >= remoteDate) {
    // Skip clone
  }
}
```

This significantly speeds up incremental runs.

### Error Isolation

Each phase wraps its logic in try-catch and returns early on failure:

```typescript
const cloneResult = await cloneModule(module, config);
if (!cloneResult.success) {
  return { status: "failed", failurePhase: "clone", error: cloneResult.error };
}
```

This ensures failures in one phase don't affect the worker's ability to process other modules.

## Performance Notes

Current single-worker performance (based on testing):

- **Clone:** ~2-5 seconds per module (if not cached)
- **Enrich:** ~0.5-1 second per module
- **Total:** ~3-6 seconds per module

Expected multi-worker performance:

- With 4 workers: 4x throughput
- Estimated full run: ~10-15 minutes for ~800 modules
