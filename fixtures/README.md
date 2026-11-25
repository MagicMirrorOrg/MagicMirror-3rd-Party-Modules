# Pipeline fixture dataset

This directory contains a small, curated dataset of seven modules for validating published catalogue schemas. It covers a mix of scenarios:

- Happy-path module with tags and an image (`MMM-01ZM`).
- Module missing keywords and screenshots (`MMM-AC-aseag`).
- Module with a single tag and rich screenshot metadata (`MMM-AccuWeatherForecastDeluxe`).
- Module whose license metadata triggers multiple warnings (`MMM-Actual`).
- Module lacking a `package.json` and image (`MMM-AddressBook`).
- Outdated module with quirky keyword formatting (`MMM-Admin-Interface`).
- Weather module with a clean profile (`MMM-AirQuality`).

## Files

- `modules.seed.json` – snapshot of the wiki-derived module list (stage 1 input).
- `modules.metadata.json` – supplemental details pulled from later pipeline stages; the fixture generator uses this to emulate enrichment.
- `data/` - committed fixture outputs for published artifacts (`modules.json`, `modules.min.json`, and `stats.json`).
- [`modules/`](modules/README.md) - curated module snapshots and synthetic examples, separate from the catalogue fixture generator.

## Regenerating the fixtures

Run the generator whenever you update the seed list, tweak metadata, or adjust schema-relevant fields:

```bash
node --run fixtures -- generate
```

The command rewrites `modules.json`, `modules.min.json`, and `stats.json` under `fixtures/data/`. Keep these files version-controlled so schema tests stay reproducible.

The generator performs a few important normalization steps while writing the fixtures:

- Maintainer URLs are backfilled when the wiki snapshot omits them (derived from the repository origin + owner).
- The module list is sorted by `id` so downstream diffs stay stable.
- The minified catalogue mirrors the production build (`modules.min.json`), while the full catalogue and stats remain pretty-printed for readability.

After regenerating, validate the fixtures:

```bash
node --run fixtures -- validate
```

This validation is also part of `npm test`, so CI will fail if the fixture outputs no longer match their schemas.

## When to refresh

- A stage schema gains or removes fields.
- You change `modules.seed.json` (added/removed sample modules or descriptions).
- You update `modules.metadata.json` with new mocked stars, tags, or warnings.
- The real pipeline introduces new derived fields you want reflected in the fixtures.
- Maintainer URLs are cleaned up in the source data or the heuristics for deriving them change.
- The downstream website contract (`modules.json`, `modules.min.json`, `stats.json`) gains or removes fields.

## Troubleshooting validation failures

When either the fixture set or the release artifacts fail schema validation, follow this checklist:

1. **Regenerate the fixtures** – run `node --run fixtures -- generate` followed by `node --run fixtures -- validate` to ensure the curated dataset reflects the latest contract.
2. **Re-run the full pipeline** – execute `node --run all` (or your preferred targets) to recreate the website outputs, then execute `node --run release:validate`.
3. **Inspect schema coverage** – if the data remains invalid, adjust the relevant schema under `dist/schemas/` and re-run the pipeline so the output matches the contract.
4. **Escalate breaking changes** – when a consumer requires a contract change, document it in the roadmap and coordinate before relaxing or tightening schemas.
