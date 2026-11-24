# Pipeline Orchestrator Reference

_Last updated: 2026-11-23_

The orchestrator executes the single supported `full-refresh-parallel` pipeline through four in-process stage functions. CLI options are parsed once at this entry point; stage modules do not read process arguments.

## Supported entry points

```bash
node --run all
node scripts/orchestrator/index.ts
```

`npm run all` is the canonical full refresh and the only supported pipeline entry point.

## Pipeline

1. `collect-metadata`: collect and enrich module metadata.
2. `parallel-processing`: clone, enrich, and analyze modules with the worker pool.
3. `aggregate-catalogue`: write catalogue, issue, and statistics outputs.
4. `generate-result-markdown`: render the human-readable result.

Stage state is handed off in memory. Schemas from `dist/schemas/` are validated immediately after catalogue outputs are written.

## Execution behavior

- Stages run sequentially and stop on the first failure.
- Stage start, duration, and failure are logged through the shared logger.
- `aggregate-catalogue` validates `modules.json`, `modules.min.json`, and `stats.json` with AJV.
- Module-level parallelism remains inside `parallel-processing`.

## Options & flags

### Recheck existing clones

```bash
npm run all -- --local-only
```

This reruns the module checks against existing directories in `modules/` without
cloning, pulling, or fetching repositories. Missing clones are skipped. The
metadata stage reads the previous `website/data/modules.json` catalogue instead
of fetching the Wiki or repository APIs; a non-empty previous catalogue is
required. Modules absent from that catalogue are not discovered by this mode.

The analysis cache is disabled automatically, so `--no-cache` is not necessary.
Even modules marked outdated are analyzed. Old check findings are discarded,
while repository metadata such as stars and commit dates remains unchanged.
The usual catalogue, images, statistics, and `website/result.md` outputs are
regenerated. This is not a strictly offline mode: checks that query npm may
still use the network.

Run `npm run all -- --local-only` to recheck existing clones and regenerate all published reports.

### Full and local runs

- `node --run all`: run all four stages.
- `node --run all -- --local-only`: use existing clones and skip metadata refresh for discovery.
- `--workers=<number>`: override the worker count.
- `--batch-size=<number>`: override worker batch size.
- `--no-cache`: force fresh module processing.
- `PIPELINE_LOG_RETENTION=<number>`: keep the newest module-log runs; default is 20.
- `LOG_FORMAT=json`: emit structured JSON logs.

There is no partial-stage CLI. The four stage functions are invoked by the orchestrator.

## Failure handling

The orchestrator stops at the first failed stage, records the failing stage on the thrown error, and exits non-zero. API and HTTP retry behavior remains local to the underlying clients rather than being configured as a pipeline-wide retry.
