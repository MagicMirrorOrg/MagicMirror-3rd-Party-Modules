# Deterministic Pipeline Outputs

Stable output formatting makes generated data easier to compare and review. It does not make live pipeline runs fully reproducible: repository metadata, timestamps, failures, and other external inputs can change between runs.

## JSON Output

`stringifyDeterministic()` in `scripts/shared/deterministic-output.ts` sorts object keys recursively and preserves array order. The catalogue writer uses it for `issues.json`, `modules.json`, `modules.min.json`, and `stats.json`. The full catalogue and statistics use two-space indentation; the minified catalogue and issues use compact JSON.

The helper returns JSON without a trailing newline. `writeJson()` in `scripts/shared/fs-utils.ts` adds one, but not every output uses that writer. Do not assume all generated JSON files have the same whitespace or newline conventions.

The container workflow restores the previous four published JSON files from a separate GitHub Actions cache before building, and saves the new files after a successful build. Full and test runs use separate cache scopes. The previous catalogue supports change detection and metadata fallback; if the cache is unavailable, the run starts without a previous catalogue. Unchanged outputs retain their previous update timestamp.

## Screenshot Names

The worker converts selected screenshots to WebP and names them `<moduleName>---<maintainer>.webp`. The name is independent of the source image filename. Downstream consumers should use the image path from `modules.json` rather than constructing filenames themselves.

## Regression Checks

Run the golden artifact check after changing published output:

```bash
node --run fixtures -- golden-check
```

The check compares sanitized output with the snapshots in `fixtures/golden/`. Volatile fields are normalized or excluded, and `skipped_modules.json` is not covered. Review intentional output changes before updating snapshots with `node --run fixtures -- golden-update`.

See the [Contributing Guide](CONTRIBUTING.md#golden-artifacts-regression-testing) for the update workflow and its limitations.
