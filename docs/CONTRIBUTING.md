# Contributing Guide

Welcome! This document bundles the day-to-day tasks contributors perform when working on the MagicMirror² module list. Use it as the single stop for local setup, pipeline execution, and schema validation.

## Local setup

### Prerequisites

- **Node.js**: Node.js 24.15.0 or later is required.
- **Git**: Ensure Git is installed and available in your path.

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules.git
cd MagicMirror-3rd-Party-Modules
npm install
```

## Running the pipeline

Use the canonical helper scripts from `package.json` or call the orchestrator directly:

| Scope              | Command                          | Purpose                                                   |
| ------------------ | -------------------------------- | --------------------------------------------------------- |
| Full canonical run | `node --run all`                 | Execute `full-refresh-parallel` end-to-end.               |
| Local recheck      | `node --run all -- --local-only` | Recheck existing clones and regenerate published reports. |

The `parallel-processing` stage is the expensive part of the run: it clones repositories, extracts metadata and screenshots, and performs the deeper checks that produce the analysis payload in memory. The follow-up `aggregate-catalogue` stage turns that payload into `modules.json`, `modules.min.json`, and `stats.json`.

### Orchestrator execution

The orchestrator is the only pipeline CLI. Use `node --run all` for the full refresh or `node scripts/orchestrator/index.ts` directly; stage modules are pure functions and are not standalone commands.

- **Worker count**: pass `--workers=<number>`.
- **Batch size**: pass `--batch-size=<number>`.
- **Cache bypass**: pass `--no-cache` to the processing stage.
- **Machine-readable logs**: set `LOG_FORMAT=json`.
- **Debug a small source list**: set `WIKI_FILE=path/to/3rd-Party-Modules.md` before the full run.

### Stage details

For canonical stage definitions, responsibilities, and data flow, use [docs/architecture.md](architecture.md) as the single source of truth. This avoids drift between contributor instructions and pipeline design docs.

#### `validate_release_artifacts.ts`

Validates the published catalogue (`modules.json`, `modules.min.json`, `stats.json`) against the JSON Schemas. The command is wired into release packaging and must pass before publishing.

### Testing specific modules

For focused manual runs, point the pipeline at a small local wiki snapshot instead of the full upstream page:

1. Copy [`website/test/3rd-Party-Modules.md`](../website/test/3rd-Party-Modules.md) or prepare your own markdown file in the same table format as the upstream MagicMirror wiki page.
2. Run `WIKI_FILE=path/to/3rd-Party-Modules.md node --run all`.
3. Inspect the generated files under [`website/data/`](../website/data/) just like a full run.

For regression testing, prefer the curated fixtures (`node --run fixtures -- generate`, `node --run fixtures -- validate`, `node --run fixtures -- golden-check`) over ad-hoc subsets.

## Release validation

Schema validation is part of the release gate. After you regenerate the website data, run:

```bash
node --run release:validate
```

The command checks the published artifacts (`modules.json`, `modules.min.json`, `stats.json`).

> ℹ️ **CI gate:** The same validation now runs automatically in GitHub Actions (`release-validation.yml`) on every push and pull request targeting `main`. Keep the command in your local workflow to catch schema regressions before CI fails.

### validate_release_artifacts.ts

This script powers the validation command above. Keep it in your release checklist—CI will block merges once the GitHub Action lands, and the CLI already fails the automated packaging run if validation breaks.

### When validation fails

1. Regenerate the curated fixtures to ensure the schemas match the current expectations:
   ```bash
   node --run fixtures -- generate
   node --run fixtures -- validate
   ```
2. Re-run the affected pipeline stages (or `node --run all`) to rebuild the real datasets.
3. Execute `node --run release:validate` again. Keep iterating until the exit code is zero.

Document regressions or schema updates in [`docs/architecture.md`](architecture.md) and [`docs/pipeline/orchestrator-cli-reference.md`](pipeline/orchestrator-cli-reference.md). For tricky cases, open an Issue so downstream consumers are aware of the contract change.

## Maintaining schemas

The checked-in schemas under `dist/schemas/` are the canonical validation artifacts. If the data contract changes, edit the affected schema there and run `node --run release:validate`.

## Running the container locally

To preview the published website bundle without running the full pipeline, use the prebuilt container image:

```bash
docker run --rm -p 8080:8080 ghcr.io/magicmirrororg/magicmirror-3rd-party-modules:main
```

Then open <http://localhost:8080> in a browser.

## Testing

Run all tests with:

```bash
npm test
```

### Unit tests

The shared utilities in `scripts/shared/` have unit tests using Node.js's built-in test runner. Run them with:

```bash
node --run test:unit
```

These tests verify core functionality like logging, rate limiting, and HTTP client behavior. When adding new utilities or modifying existing ones, update the tests in `scripts/shared/__tests__/`.

### Linting and formatting

The project enforces code quality through ESLint and Prettier:

```bash
node --run lint        # Check all files
node --run lint:fix    # Auto-fix issues
```

TypeScript files are included in ESLint checks via `typescript-eslint` v8+. Production scripts
are `.ts` format with type safety enforced via `node --run test:types`.

### Spelling

Spelling is checked with `cspell`:

```bash
node --run test:spelling
```

The repository pre-commit hook also runs this spelling check before each commit.

### Golden artifacts (regression testing)

Golden artifacts are reference outputs stored in `fixtures/golden/` that serve as snapshots for regression testing. They are a narrow contract guard for published artifacts, not a proof that the full pipeline is semantically correct.

The check intentionally compares sanitized, deterministic output only. Volatile live fields such as timestamps, stars, issue counters, and other environment-dependent values are normalized or excluded so the snapshot highlights contract drift instead of operational noise.

**Workflow when modifying pipeline code:**

1. **Run tests**: `node --run fixtures -- golden-check`
   - ✅ **Pass**: Your changes didn't affect outputs
   - ❌ **Fail**: Outputs changed - review required

2. **Review changes**: `git diff fixtures/golden/`
   - Are these changes expected and intentional?
   - Do they match your code changes?

3. **Update golden files** (only if changes are intentional): `node --run fixtures -- golden-update`
   - Updates reference outputs to match new behavior
   - Creates new baseline for future tests

4. **Commit**: Include golden files in your commit
   - Documents expected behavior change
   - Future tests compare against your new baseline

**When to update golden artifacts:**

- Stage schemas change (added/removed fields)
- Error handling improvements (e.g., new error categories)
- Sorting or formatting changes (e.g., deterministic outputs)
- Bug fixes that alter output structure
- New pipeline features that affect final artifacts

**What they test:**

- Published artifact shape stays stable after deterministic sanitization
- No accidental regressions in committed contract-level output
- Contract changes are explicit and reviewable in PRs

**What they do not test:**

- End-to-end semantic correctness of the full pipeline
- Live repository state, current stars, or other volatile upstream data
- Non-deterministic outputs such as `skipped_modules.json`

## Helpful references

- [`docs/architecture.md`](architecture.md) – current pipeline topology.
- [`docs/pipeline/orchestrator-cli-reference.md`](pipeline/orchestrator-cli-reference.md) – command reference for partial runs, diagnostics, and logs.
- [`fixtures/README.md`](../fixtures/README.md) – curated dataset and validation troubleshooting.

### Troubleshooting

#### Common Issues

**Linting Errors**

The project enforces strict linting rules. If your build fails due to linting:

1.  Run `node --run lint:fix` to automatically fix formatting and simple errors.
2.  Manually resolve any remaining issues reported by the linter.

**Schema Validation Failures**

If `node --run release:validate` fails:

1.  Check the error message to identify which file violates the schema.
2.  If you modified the schema, regenerate fixtures: `node --run fixtures -- generate`.
3.  If you modified code that generates data, ensure the output matches the schemas in `dist/schemas/`.

**Rate Limiting**

The pipeline makes many requests to GitHub/GitLab. If you hit rate limits:

- Ensure you have a valid `GITHUB_TOKEN` in your environment (though the pipeline tries to work without one, a token significantly increases limits).
- The built-in rate limiter handles backoff automatically, but extreme usage might still trigger temporary bans. Wait a few minutes and try again.
