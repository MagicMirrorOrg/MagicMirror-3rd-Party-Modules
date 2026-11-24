# Check Modules Reference

This page describes the module checks and curated fixture set.

## Check configuration

The pipeline enables the module analyzer, curated ESLint rules, general ESLint checks, `npm-check-updates`, and `npm-deprecated-check` by default. These are passed internally as one `analysisConfig` object.

The worker does not read a local config file. Programmatic callers can disable deep dependency integrations, general ESLint findings, or either dependency helper through `analysisConfig`; curated MagicMirror ESLint rules still run.

## Rule inventory

The table below is generated from `scripts/check-modules/rule-registry.ts`. After changing the registry, run `node --run docs:rules`; the unit tests check that this inventory remains current. Scope identifies how each rule is implemented, including package rules implemented by the module analyzer.

<!-- rule-inventory:start -->

| Rule ID                                    | Scope           | Patterns                                                                          | Category       | Description                                                                                                                                                                                                                                              |
| ------------------------------------------ | --------------- | --------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text-deprecated-node-api`                 | module-analysis | <code>eslint-plugin-n/no-deprecated-api</code>                                    | Deprecated     | Replace deprecated Node.js APIs with their supported alternatives.                                                                                                                                                                                       |
| `text-deprecated-fs-F_OK`                  | module-analysis | <code>fs.F_OK</code>                                                              | Deprecated     | Replace it with `fs.constants.F_OK`.                                                                                                                                                                                                                     |
| `text-deprecated-fs-R_OK`                  | module-analysis | <code>fs.R_OK</code>                                                              | Deprecated     | Replace it with `fs.constants.R_OK`.                                                                                                                                                                                                                     |
| `text-deprecated-fs-W_OK`                  | module-analysis | <code>fs.W_OK</code>                                                              | Deprecated     | Replace it with `fs.constants.W_OK`.                                                                                                                                                                                                                     |
| `text-deprecated-fs-X_OK`                  | module-analysis | <code>fs.X_OK</code>                                                              | Deprecated     | Replace it with `fs.constants.X_OK`.                                                                                                                                                                                                                     |
| `text-typo-magic-mirror`                   | text            | <code>Magic Mirror</code>                                                         | Typo           | Replace it with `MagicMirror²`.                                                                                                                                                                                                                          |
| `text-typo-magicmirror2`                   | text            | <code>MagicMirror2</code>                                                         | Typo           | Replace it with `MagicMirror²`.                                                                                                                                                                                                                          |
| `text-typo-magicmirror-brackets`           | text            | <code>&#91;MagicMirror&#93;</code>                                                | Typo           | Replace it with `[MagicMirror²]`.                                                                                                                                                                                                                        |
| `text-typo-html-sub2`                      | text            | <code>&lt;sub&gt;2&lt;/sub&gt;</code>                                             | Typo           | Replace it with `²`.                                                                                                                                                                                                                                     |
| `text-deprecated-request`                  | module-analysis | <code>require("request")</code> / <code>require('request')</code>                 | Deprecated     | Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)). |
| `text-deprecated-request-promise`          | module-analysis | <code>require("request-promise")</code> / <code>require('request-promise')</code> | Deprecated     | Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)). |
| `text-deprecated-native-request`           | module-analysis | <code>require("native-request")</code>                                            | Deprecated     | Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)). |
| `text-recommend-http-module`               | module-analysis | <code>require("http")</code> / <code>require('http')</code>                       | Recommendation | Replace `http` with the scoped import `node:http`.                                                                                                                                                                                                       |
| `text-recommend-https-module`              | module-analysis | <code>require("https")</code> / <code>require('https')</code>                     | Recommendation | Replace `https` with the scoped import `node:https`.                                                                                                                                                                                                     |
| `text-recommend-node-fetch`                | module-analysis | <code>'node-fetch'</code> / <code>"node-fetch"</code>                             | Recommendation | Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)). |
| `text-recommend-require-fetch`             | module-analysis | <code>require("fetch")</code> / <code>require('fetch')</code>                     | Recommendation | Use the global fetch API instead of requiring a shim.                                                                                                                                                                                                    |
| `text-recommend-axios`                     | module-analysis | <code>axios</code>                                                                | Recommendation | Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)). |
| `text-deprecated-omxplayer`                | text            | <code>omxplayer</code>                                                            | Deprecated     | Replace OMXPlayer usage with maintained alternatives such as mplayer or VLC.                                                                                                                                                                             |
| `text-recommend-xmlhttprequest`            | module-analysis | <code>XMLHttpRequest</code>                                                       | Recommendation | Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)). |
| `text-recommend-actions-checkout`          | module-analysis | <code>actions/checkout@vN where N &lt; 7</code>                                   | Recommendation | Upgrade workflows to use actions/checkout@v7.                                                                                                                                                                                                            |
| `text-recommend-actions-setup-node`        | module-analysis | <code>actions/setup-node@vN where N &lt; 7</code>                                 | Recommendation | Upgrade workflows to use actions/setup-node@v7.                                                                                                                                                                                                          |
| `text-deprecated-node-version`             | module-analysis | <code>node-version below v22</code>                                               | Deprecated     | Update CI workflows to target Node.js v22 or newer.                                                                                                                                                                                                      |
| `text-recommend-npm-run`                   | text            | <code>npm run</code>                                                              | Recommendation | Prefer `node --run` over invoking npm run directly.                                                                                                                                                                                                      |
| `text-recommend-jshint`                    | text            | <code>jshint</code>                                                               | Recommendation | Suggest migrating from JSHint to ESLint.                                                                                                                                                                                                                 |
| `text-deprecated-getYear`                  | module-analysis | <code>getYear()</code>                                                            | Deprecated     | Replace `getYear()` with `getFullYear()`.                                                                                                                                                                                                                |
| `text-outdated-michmich`                   | text            | <code>MichMich/MagicMirror</code>                                                 | Outdated       | Replace it by `MagicMirrorOrg/MagicMirror`.                                                                                                                                                                                                              |
| `text-outdated-husky`                      | text            | <code>/_/husky.sh</code>                                                          | Outdated       | Modern Husky setups do not require sourcing husky.sh.                                                                                                                                                                                                    |
| `text-deprecated-electron-rebuild-command` | text            | <code>npm install electron-rebuild</code>                                         | Deprecated     | Install `@electron/rebuild` instead of the deprecated package.                                                                                                                                                                                           |
| `text-deprecated-openweathermap`           | text            | <code>api.openweathermap.org/data/2.5</code>                                      | Deprecated     | OpenWeather API 2.5 is deprecated - upgrade integrations to v3.                                                                                                                                                                                          |
| `text-recommend-cdn-cdnjs`                 | text            | <code>https://cdnjs.cloudflare.com</code>                                         | Recommendation | Prefer bundling dependencies via npm instead of CDN references.                                                                                                                                                                                          |
| `text-recommend-cdn-jsdelivr`              | text            | <code>https://cdn.jsdelivr.net</code>                                             | Recommendation | Prefer bundling dependencies via npm instead of CDN references.                                                                                                                                                                                          |
| `text-recommend-eslint-dot`                | text            | <code>eslint .</code> / <code>eslint --fix .</code>                               | Recommendation | Drop the trailing '.' when invoking ESLint v9 or newer.                                                                                                                                                                                                  |
| `text-recommend-git-checkout`              | text            | <code>git checkout</code>                                                         | Recommendation | Replace it with `git switch`. It's not a drop-in replacement, so make sure to check the documentation.                                                                                                                                                   |
| `pkg-deprecated-electron-rebuild`          | module-analysis | <code>"electron-rebuild"</code>                                                   | Deprecated     | Use `@electron/rebuild` instead.                                                                                                                                                                                                                         |
| `pkg-deprecated-eslint-config-airbnb`      | module-analysis | <code>eslint-config-airbnb</code>                                                 | Deprecated     | Replace the preset with a maintained ESLint configuration.                                                                                                                                                                                               |
| `pkg-recommend-eslint-plugin-json`         | module-analysis | <code>"eslint-plugin-json"</code> / <code>"eslint-plugin-jsonc"</code>            | Recommendation | Suggest adopting `@eslint/json` for JSON linting.                                                                                                                                                                                                        |
| `pkg-deprecated-grunt`                     | module-analysis | <code>"grunt"</code>                                                              | Deprecated     | Grunt is effectively unmaintained. Move on to something modern.                                                                                                                                                                                          |
| `pkg-outdated-husky-install`               | module-analysis | <code>husky install</code>                                                        | Outdated       | Husky v9 no longer needs manual install scripts.                                                                                                                                                                                                         |
| `pkg-recommend-needle`                     | module-analysis | <code>"needle"</code>                                                             | Recommendation | Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)). |
| `pkg-deprecated-rollup-banner`             | module-analysis | <code>rollup-plugin-banner</code>                                                 | Deprecated     | Use Rollup's built-in banner support.                                                                                                                                                                                                                    |
| `pkg-deprecated-stylelint-config-prettier` | module-analysis | <code>stylelint-config-prettier</code>                                            | Deprecated     | Remove `stylelint-config-prettier` in modern Stylelint setups.                                                                                                                                                                                           |
| `lock-deprecated-v1`                       | package-lock    | <code>"lockfileVersion": 1</code>                                                 | Deprecated     | Run `npm update` to update to lockfileVersion 3.                                                                                                                                                                                                         |
| `lock-deprecated-v2`                       | package-lock    | <code>"lockfileVersion": 2</code>                                                 | Deprecated     | Run `npm update` to update to lockfileVersion 3.                                                                                                                                                                                                         |

<!-- rule-inventory:end -->

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
disabled. General ESLint findings are individual issues in the `ESLint` category and are
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
recommendations remain enabled.

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
