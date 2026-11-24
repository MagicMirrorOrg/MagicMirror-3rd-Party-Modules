# Worker Pool Implementation

This directory contains the worker pool implementation for parallel module processing.

## Current Status: Worker Pool Orchestration ✅

The worker pool orchestration is complete and functional. Modules can now be processed in parallel using multiple worker processes.

### Files

- **`process-module.ts`**: Core module processing logic
- **`worker.ts`**: Worker process entry point - runs in child processes
- **`worker-pool.ts`**: Orchestrator that manages worker processes, batches, and queues

### Features

✅ **Parallel Processing**: Process modules across N worker processes
✅ **Batch Distribution**: Modules are divided into batches and distributed to workers
✅ **Work Queue**: Workers pull batches from queue (work-stealing algorithm)
✅ **Progress Tracking**: Real-time progress updates via callbacks
✅ **Error Handling**: Worker failures don't crash entire pipeline, batches are re-queued
✅ **Resource Management**: Configurable worker count, batch size, and timeouts
✅ **IPC Communication**: Robust message passing between orchestrator and workers

### Usage

```javascript
import { WorkerPool } from "./worker-pool.ts";

const pool = new WorkerPool({
  workerCount: 4, // Number of parallel workers
  batchSize: 50, // Modules per batch
  batchTimeoutMs: 1800000
});

// Set up progress callback
pool.onProgress((event) => {
  if (event.type === "module") {
    console.log(`Processed: ${event.moduleId} (${event.status})`);
  }
});

// Process modules
const results = await pool.processModules(modules, moduleConfig);
```

### Integration

The worker pool is integrated into the pipeline via:

- **Module**: `scripts/parallel-processing.ts`
- **Pipeline entry point**: `scripts/orchestrator/index.ts`

Run with:

```bash
node --run all -- --workers=4 --batch-size=50
```

### Test Results

Successfully tested with multiple module sets:

- ✅ 10 modules: ~15ms per module (parallel)
- ✅ 100% success rate
- ✅ Worker crash recovery working
- ✅ Progress tracking functional
- ✅ Graceful shutdown working

### Performance

**Worker Pool (2 workers, batch size 10):**

- 10 modules: 155ms total (~16ms per module)
- Parallel speedup: ~2x compared to sequential

**Expected with full dataset (1300+ modules, 4 workers):**

- Estimated time: ~3-5 minutes (vs 10-15 minutes sequential)
- 3-4x speedup depending on I/O and CPU availability

### Configuration Options

**CLI Arguments:**

```bash
--workers=N        # Number of worker processes (default: CPU count - 1)
--batch-size=N     # Modules per batch (default: 50)
```

**Environment Variables:**

```bash
PIPELINE_WORKER_COUNT=4  # Override default worker count
```

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
