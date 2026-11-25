# Check Modules Fixture Repositories

This directory contains curated module snapshots and synthetic examples for module checks. The catalogue fixture generator uses `fixtures/modules.seed.json` and `fixtures/modules.metadata.json`; it does not run analysis on these directories.

## Layout

```text
fixtures/
  modules/
    baseline-<name>/
    synthetic-<scenario>/
    ...
```

- `baseline-*` snapshots contain selected files from real third-party modules.
- `synthetic-*` repositories are purpose-built to exercise individual rules or heuristics that have no reliable real-world coverage.

Current baselines:

- `baseline-mmm-01zm`
- `baseline-mmm-airquality`
- `baseline-mmm-admin-interface`
- `baseline-mmm-actual`

Each fixture directory contains:

- The module source code and metadata (`package.json`, Markdown files, workflows, etc.).
- A `FIXTURE.md` file describing the intent of the repository, the rules it should trigger, and pointers back to the rule registry IDs.

## Authoring guidelines

1. Keep fixtures as small as possible by excluding binaries, large screenshots, and unrelated documentation.
2. Prefer synthetic fixtures when the real module is unstable or likely to change upstream.
3. When mirroring a real module, record the upstream commit SHA in `FIXTURE.md`.
4. Record the expected findings in `FIXTURE.md` and update `docs/pipeline/check-modules-reference.md` when coverage changes.

## Maintenance

- When refreshing a snapshot, record the commit actually used. `node --run fixtures -- update-shas` queries current upstream HEADs but does not refresh the snapshot files.
