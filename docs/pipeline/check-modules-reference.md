# Check Modules Reference

_Last updated: April 16, 2026_

This page consolidates the material that previously lived in early planning documents. It should stay up to date as we evolve the check-modules pipeline and the curated fixture set.

## Check group configuration

The Stage 5 runner reads `scripts/check-modules/check-groups.config.json` to decide which groups execute. All toggles ship enabled; set individual entries to `false` to skip that category. Personal overrides belong in `check-groups.config.local.json` (same directory) so local tweaks stay out of version control.

| Toggle                            | Default | Controls                                                                                                                                          |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groups.fast`                     | `true`  | Registry-backed text and `package-lock.json` pattern scanning.                                                                                    |
| `groups.deep`                     | `true`  | Repository heuristics (README/license/dependabot checks) plus dependency helpers. Disabling this also suppresses the optional integrations below. |
| `integrations.npmCheckUpdates`    | `true`  | Runs `npm-check-updates` when the helper budget allows.                                                                                           |
| `integrations.npmDeprecatedCheck` | `true`  | Executes `npm-deprecated-check` to surface deprecated dependencies.                                                                               |
| `integrations.eslint`             | `true`  | Includes general ESLint findings. The built-in MagicMirror rules always run, independently of this toggle and the dependency-helper budget.       |

> The runner logs whenever overrides are applied so CI output records which groups were disabled.

## Rule inventory

These are the rule IDs currently implemented by the TypeScript checker. Keep this table synchronized with the rule registry schema when adding or modifying checks.

> Schema reference: see [`check-modules-rule-registry.schema.json`](check-modules-rule-registry.schema.json) for the JSON layout the stage expects.

### Text scanning rules

| Rule ID                        | Pattern                           | Category       | Notes                       |
| ------------------------------ | --------------------------------- | -------------- | --------------------------- |
| text-typo-magic-mirror         | `Magic Mirror`                    | Typo           | Should be `MagicMirror²`.   |
| text-typo-magicmirror2         | `MagicMirror2`                    | Typo           | Should be `MagicMirror²`.   |
| text-typo-magicmirror-brackets | `[MagicMirror]`                   | Typo           | Should be `[MagicMirror²]`. |
| text-typo-html-sub2            | `<sub>2</sub>`                    | Typo           | Replace with `²`.           |
| text-deprecated-omxplayer      | `omxplayer`                       | Deprecated     | Suggest `mplayer` or `vlc`. |
| text-recommend-npm-run         | `npm run`                         | Recommendation | Prefer `node --run`.        |
| text-recommend-jshint          | `jshint`                          | Recommendation | Suggest ESLint.             |
| text-outdated-michmich         | `MichMich/MagicMirror`            | Outdated       | Update org name.            |
| text-outdated-husky            | `/_/husky.sh`                     | Outdated       | Husky v9 change.            |
| text-deprecated-openweathermap | `api.openweathermap.org/data/2.5` | Deprecated     | Upgrade to API 3.0.         |
| text-recommend-cdn-cdnjs       | `https://cdnjs.cloudflare.com`    | Recommendation | Prefer local npm package.   |
| text-recommend-cdn-jsdelivr    | `https://cdn.jsdelivr.net`        | Recommendation | Prefer local npm package.   |
| text-recommend-eslint-dot      | `eslint .` / `eslint --fix .`     | Recommendation | Drop trailing dot.          |
| text-recommend-git-checkout    | `git checkout`                    | Recommendation | Switch to `git switch`.     |

### Central ESLint checks

`eslint.testconfig.js` selects all ESLint rules for module repositories. It
registers the local `MAGICMIRROR_PLUGIN` from
`scripts/check-modules/javascript-check.ts` alongside the general JavaScript,
import, and package.json rules. The worker runs this configuration once per
module using the ESLint API, with the module directory as its working directory.
It explicitly selects this trusted configuration and disables inline ESLint
configuration; repository-owned configuration files are never executed.

The pass checks `.js`, `.mjs`, `.cjs`, `.yaml`, `.yml`, and `package.json` files.
Minified `.min.js` files, `node_modules`, and `.git` are excluded. TypeScript files
are not included.
The worker only reports findings and never applies fixes. Parsing failures are
reported rather than silently hiding checks that could not run.
Package files use strict JSON syntax: comments, trailing commas, and unquoted
keys are reported as parsing failures before package rules run, without stopping
the JavaScript checks for the module.

The following local rules run even without a package.json file, when dependency
helpers exceed their issue budget, or when general ESLint or deep checks are
disabled. General ESLint findings remain grouped under `ESLint issues` and are
included when both general ESLint and deep checks are enabled, without an issue
budget or package.json requirement. The `eslintN/prefer-node-protocol`
recommendation uses this group and follows the same toggles. The text/README
analyzer no longer invokes ESLint separately.

| Local rule                        | Purpose                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `magicmirror/prefer-native-fetch` | Recommend native fetch instead of legacy HTTP clients.                                           |
| `magicmirror/no-xmlhttprequest`   | Recommend fetch when JavaScript constructs `XMLHttpRequest`.                                     |
| `eslintN/no-deprecated-api`       | Detect deprecated Node.js APIs using `eslint-plugin-n`; findings stay categorized as Deprecated. |
| `magicmirror/no-deprecated-apis`  | Detect Date.getYear() and legacy fs access constants not covered by the plugin.                  |
| `magicmirror/workflow-yaml`       | Check GitHub Actions majors and deprecated Node.js matrix versions in YAML.                      |

The HTTP import rule detects static imports, re-exports, literal dynamic imports, and
`require()` calls without a local binding, including package subpaths. Comments, ordinary
strings, README mentions, and dependency declarations are not import findings.
No HTTP client migration fixes are offered because replacing a client can require
changes to response and error handling. The Node protocol rule preserves its
upstream autofix capability, but the worker does not apply it.
The XMLHttpRequest rule reports constructor calls in JavaScript, including
`window`, `self`, and `globalThis` constructors. It ignores comments, strings,
locally shadowed constructors, and README examples.
Workflow YAML is parsed by `eslint-plugin-yml`. The workflow rule reports numeric
`actions/checkout` and `actions/setup-node` tags below their configured major
versions, and Node.js versions below its configured major only in job matrices or
`actions/setup-node` inputs. Branch references, SHA pins, current and newer major
tags, and unrelated YAML fields are ignored.

The existing registry IDs are retained with scope `module-analysis`; they no
longer participate in text scanning. Reports preserve their categories and
guidance and include the package name, relative file path, line, and column.

| Registry ID                     | Package           | Category       |
| ------------------------------- | ----------------- | -------------- |
| text-deprecated-request         | `request`         | Deprecated     |
| text-deprecated-request-promise | `request-promise` | Deprecated     |
| text-deprecated-native-request  | `native-request`  | Deprecated     |
| text-recommend-node-fetch       | `node-fetch`      | Recommendation |
| text-recommend-require-fetch    | `fetch`           | Recommendation |
| text-recommend-axios            | `axios`           | Recommendation |

### `package.json` rules

The legacy dependency and script rules below use structured `package.json`
parsing in the module analyzer, not substring scanning or an ESLint adapter.
Dependency declarations are checked in `dependencies`, `devDependencies`,
`peerDependencies`, and `optionalDependencies`; the Husky check inspects values
under top-level `scripts`. Package names in descriptions, keywords, or unrelated
metadata do not trigger findings. Reports preserve registry IDs and categories
and include the relative package path, but not line and column.

The package names handled by the analyzer are allowed in ESLint's general
`depend/ban-dependencies` rule to avoid duplicate reports. Other dependency
recommendations remain enabled. The separate missing-dependency usage scan is
unchanged.

| Rule ID                                  | Dependency or script                             | Category       | Notes                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pkg-deprecated-electron-rebuild          | `electron-rebuild`                               | Deprecated     | Use `@electron/rebuild`.                                                                                                                                                      |
| pkg-deprecated-eslint-config-airbnb      | Airbnb ESLint presets                            | Deprecated     | Covers `eslint-config-airbnb`, `-base`, `-typescript`, and `-typescript-base`. Seek modern configuration.                                                                     |
| pkg-recommend-eslint-plugin-json         | `eslint-plugin-json` / `eslint-plugin-jsonc`     | Recommendation | Suggest `@eslint/json`.                                                                                                                                                       |
| pkg-deprecated-grunt                     | `grunt`                                          | Deprecated     | Tool largely unmaintained.                                                                                                                                                    |
| pkg-outdated-husky-install               | `husky install`                                  | Outdated       | Husky v9 no longer needs it.                                                                                                                                                  |
| pkg-recommend-needle                     | `needle`                                         | Recommendation | Suggest fetch.                                                                                                                                                                |
| pkg-missing-dependency                   | _n/a (detected via usage scan)_                  | Recommendation | Flags modules that import third-party packages without declaring them in `package.json` (built-ins and the default allowlist `express`, `node_helper`, `logger` are ignored). |
| pkg-deprecated-rollup-banner             | `rollup-plugin-banner` / `rollup-plugin-banner2` | Deprecated     | Replace with built-in banner.                                                                                                                                                 |
| pkg-deprecated-stylelint-config-prettier | `stylelint-config-prettier` / `-scss`            | Deprecated     | Remove in newer Stylelint setups.                                                                                                                                             |

### `package-lock.json` rules

| Rule ID            | Pattern                | Category   | Notes                    |
| ------------------ | ---------------------- | ---------- | ------------------------ |
| lock-deprecated-v1 | `"lockfileVersion": 1` | Deprecated | Encourage upgrade to v3. |
| lock-deprecated-v2 | `"lockfileVersion": 2` | Deprecated | Encourage upgrade to v3. |

### File system heuristics & helpers

- `detect-node_modules-dir`: flags first-level `node_modules` directories under module root.
- `detect-jquery-local-copy`: warns when a local `jquery.js` copy is bundled.
- `detect-missing-update-section`: ensures README files include `## Update`.
- `detect-update-command-block`: ensures the README update section contains a copyable fenced shell command block.
- `detect-missing-install-section`: ensures README files include `## Install`.
- `detect-install-command-block`: ensures the README install section contains a copyable fenced shell command block.
- `dependency-deprecation-helper`: runs `npm-deprecated-check` and aggregates results.
- `eslint-helper`: executes ESLint with the curated configuration to produce findings.

## Fixture coverage

The curated fixture repositories live in `fixtures/modules/`. Keep this table in sync when you add or update fixtures so we maintain coverage for every rule.

### Fixture catalog

| Fixture slug                        | Type            | Primary coverage                                         | Rule IDs                                                                                                                                                                                                                                                               | Status | Notes                                                                              |
| ----------------------------------- | --------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `baseline-mmm-01zm`                 | Real (snapshot) | Smoke test, zero findings                                | _None_                                                                                                                                                                                                                                                                 | Ready  | Snapshot stored under `fixtures/modules/baseline-mmm-01zm` (`1bfc72e`).            |
| `baseline-mmm-airquality`           | Real (snapshot) | Regression guard (weather module)                        | _None_                                                                                                                                                                                                                                                                 | Ready  | Snapshot stored under `fixtures/modules/baseline-mmm-airquality` (`2641834`).      |
| `baseline-mmm-admin-interface`      | Real (snapshot) | README heuristics                                        | `detect-missing-install-section`, `detect-missing-update-section`, duplicate keywords                                                                                                                                                                                  | Ready  | Snapshot stored under `fixtures/modules/baseline-mmm-admin-interface` (`df92c75`). |
| `baseline-mmm-actual`               | Real (snapshot) | License mismatches + npm metadata                        | License mismatch, invalid SPDX license                                                                                                                                                                                                                                 | Ready  | Snapshot stored under `fixtures/modules/baseline-mmm-actual` (`2a561a9`).          |
| `synthetic-deprecated-node-api`     | Synthetic       | Legacy Node API usage                                    | `text-deprecated-new-buffer`, `text-deprecated-fs-*`, `text-deprecated-getYear`, `text-deprecated-node-version`, `text-recommend-actions-checkout`, `text-recommend-actions-setup-node`                                                                                | Ready  | Located under `fixtures/modules/synthetic-deprecated-node-api`.                    |
| `synthetic-deprecated-http-clients` | Synthetic       | Request/axios deprecations                               | `text-deprecated-request*`, `text-recommend-axios`, `text-recommend-node-fetch`, `text-recommend-require-fetch`, `text-recommend-http-module`, `text-recommend-https-module`                                                                                           | Ready  | Located under `fixtures/modules/synthetic-deprecated-http-clients`.                |
| `synthetic-network-apis`            | Synthetic       | CDN/OpenWeather recommendations                          | `text-recommend-cdn-*`, `text-deprecated-openweathermap`                                                                                                                                                                                                               | Ready  | Located under `fixtures/modules/synthetic-network-apis`.                           |
| `synthetic-typo-branding`           | Synthetic       | MagicMirror typos                                        | `text-typo-*`, `text-outdated-michmich`                                                                                                                                                                                                                                | Ready  | Located under `fixtures/modules/synthetic-typo-branding`.                          |
| `synthetic-github-actions`          | Synthetic       | Actions upgrade recommendations                          | `text-recommend-actions-checkout`, `text-recommend-actions-setup-node`                                                                                                                                                                                                 | Ready  | Located under `fixtures/modules/synthetic-github-actions`.                         |
| `synthetic-npm-metadata`            | Synthetic       | Deprecated npm packages                                  | `pkg-deprecated-electron-rebuild`, `pkg-deprecated-eslint-config-airbnb`, `pkg-recommend-eslint-plugin-json`, `pkg-deprecated-grunt`, `pkg-outdated-husky-install`, `pkg-recommend-needle`, `pkg-deprecated-rollup-banner`, `pkg-deprecated-stylelint-config-prettier` | Ready  | Located under `fixtures/modules/synthetic-npm-metadata`.                           |
| `synthetic-lockfile`                | Synthetic       | Legacy lockfile versions                                 | `lock-deprecated-v1`, `lock-deprecated-v2`                                                                                                                                                                                                                             | Ready  | Located under `fixtures/modules/synthetic-lockfile`.                               |
| `synthetic-readme-heuristics`       | Synthetic       | README structure, command blocks, node_modules detection | `detect-missing-install-section`, `detect-install-command-block`, `detect-missing-update-section`, `detect-update-command-block`, `detect-node_modules-dir`                                                                                                            | Ready  | Located under `fixtures/modules/synthetic-readme-heuristics`.                      |
| `synthetic-jquery-local`            | Synthetic       | Local jQuery copy                                        | `detect-jquery-local-copy`                                                                                                                                                                                                                                             | Ready  | Located under `fixtures/modules/synthetic-jquery-local`.                           |
| `synthetic-eslint-helper`           | Synthetic       | ESLint integration                                       | `eslint-helper`                                                                                                                                                                                                                                                        | Ready  | Located under `fixtures/modules/synthetic-eslint-helper`.                          |
| `synthetic-deprecation-helper`      | Synthetic       | npm deprecated packages via helper                       | `dependency-deprecation-helper`                                                                                                                                                                                                                                        | Ready  | Located under `fixtures/modules/synthetic-deprecation-helper`.                     |

### Coverage matrix

| Category                       | Fixtures                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Text scanning – Deprecated     | `synthetic-deprecated-node-api`, `synthetic-deprecated-http-clients`, `synthetic-network-apis` |
| Text scanning – Recommendation | `synthetic-deprecated-http-clients`, `synthetic-network-apis`, `synthetic-github-actions`      |
| Text scanning – Typo/Outdated  | `synthetic-typo-branding`, `synthetic-deprecated-node-api`                                     |
| `package.json` checks          | `synthetic-npm-metadata`, `synthetic-deprecation-helper`                                       |
| `package-lock` checks          | `synthetic-lockfile`                                                                           |
| File-system heuristics         | `baseline-mmm-admin-interface`, `synthetic-readme-heuristics`, `synthetic-jquery-local`        |
| External helpers               | `synthetic-eslint-helper`, `synthetic-deprecation-helper`, `baseline-mmm-actual`               |
| Baseline controls              | `baseline-mmm-01zm`, `baseline-mmm-airquality`                                                 |

**Maintenance checklist**

- Keep each fixture’s `FIXTURE.md` updated with triggered rule IDs and upstream commit references.
- When adding a fixture, update the table above and regenerate `fixtures/data/` via `node --run fixtures -- generate`.
- Trim binaries and large assets before committing fixture snapshots.

## Housekeeping

- Update this page whenever you add or modify check-modules rules or fixtures.
