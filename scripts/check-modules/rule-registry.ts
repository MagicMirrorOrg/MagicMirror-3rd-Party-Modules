import { WORKFLOW_VERSION_POLICY } from "./workflow-version-policy.ts";

type RuleSeverity = "info" | "warning" | "error";
type RuleCategory = "Deprecated" | "Outdated" | "Typo" | "Recommendation";
type RuleScope = "text" | "package-json" | "package-lock" | "module-structure" | "module-analysis";

interface RuleCategoryInfo {
  defaultSeverity: RuleSeverity;
  description: string;
  title: string;
}

interface RuleDefinition {
  autoFixable?: boolean;
  category: RuleCategory;
  description?: string;
  documentation?: string | null;
  examples?: string[];
  id: string;
  pattern?: string;
  patterns?: string[];
  scope: RuleScope;
  severity?: RuleSeverity;
  stages?: string | string[];
}

interface RuleRecord {
  autoFixable: boolean;
  category: RuleCategory;
  description: string;
  id: string;
  patterns: readonly string[];
  primaryPattern: string;
  references: Readonly<{
    documentation: string | null;
    examples: readonly string[];
  }>;
  scope: RuleScope;
  severity: RuleSeverity;
  stages: readonly string[];
}

const RULE_SEVERITIES = Object.freeze(["info", "warning", "error"] as const);
const RULE_CATEGORY_METADATA: Readonly<Record<RuleCategory, RuleCategoryInfo>> = Object.freeze({
  Deprecated: Object.freeze({
    title: "Deprecated usage",
    description:
      "APIs or practices that have been superseded and should be updated soon.",
    defaultSeverity: "warning"
  }),
  Outdated: Object.freeze({
    title: "Outdated guidance",
    description:
      "References that still work but point to stale repositories, scripts, or tooling.",
    defaultSeverity: "info"
  }),
  Typo: Object.freeze({
    title: "Typos & wording",
    description: "Branding or documentation typos that should be corrected.",
    defaultSeverity: "info"
  }),
  Recommendation: Object.freeze({
    title: "Modernization hint",
    description: "Suggestions that improve quality of life but are not mandatory.",
    defaultSeverity: "info"
  })
});

const PIPELINE_CHECK_STAGE_IDS = Object.freeze({
  MODERN: "check-modules"
});

const DEFAULT_STAGE_ID = PIPELINE_CHECK_STAGE_IDS.MODERN;

function normalizePatterns(rawPatterns: string | string[] | undefined, id: string): readonly string[] {
  if (Array.isArray(rawPatterns)) {
    const normalized = rawPatterns
      .filter(pattern => typeof pattern === "string" && pattern.length > 0)
      .map(pattern => pattern);
    if (normalized.length > 0) {
      return Object.freeze(normalized);
    }
  }

  if (typeof rawPatterns === "string" && rawPatterns.length > 0) {
    return Object.freeze([rawPatterns]);
  }

  throw new Error(`Rule ${id} must declare at least one pattern.`);
}

function resolveSeverity(definition: RuleDefinition): RuleSeverity {
  if (typeof definition.severity === "string") {
    if (!RULE_SEVERITIES.includes(definition.severity)) {
      throw new Error(`Rule ${definition.id} references unknown severity '${definition.severity}'.`);
    }
    return definition.severity;
  }

  const categoryMetadata = RULE_CATEGORY_METADATA[definition.category];
  return categoryMetadata?.defaultSeverity ?? "info";
}

function normalizeStages(rawStages: string | string[] | undefined, id: string): readonly string[] {
  if (Array.isArray(rawStages)) {
    const normalized = Array.from(new Set(rawStages.filter(stage => typeof stage === "string" && stage.length > 0)));
    if (normalized.length > 0) {
      return Object.freeze(normalized);
    }
  }

  if (typeof rawStages === "string" && rawStages.length > 0) {
    return Object.freeze([rawStages]);
  }

  throw new Error(`Rule ${id} must declare at least one stage.`);
}

function createRule(definition: RuleDefinition): Readonly<RuleRecord> {
  if (!definition?.id) {
    throw new Error("Rule definition missing id.");
  }

  if (!definition.scope) {
    throw new Error(`Rule ${definition.id} must declare a scope.`);
  }

  if (!RULE_CATEGORY_METADATA[definition.category]) {
    throw new Error(`Rule ${definition.id} references unknown category '${definition.category}'.`);
  }

  const patterns = normalizePatterns(
    definition.patterns ?? definition.pattern,
    definition.id
  );
  const severity = resolveSeverity(definition);
  const stages = normalizeStages(
    definition.stages ?? DEFAULT_STAGE_ID,
    definition.id
  );

  return Object.freeze({
    id: definition.id,
    scope: definition.scope,
    patterns,
    primaryPattern: patterns[0],
    category: definition.category,
    description: definition.description ?? "",
    stages,
    severity,
    autoFixable: Boolean(definition.autoFixable),
    references: Object.freeze({
      documentation: definition.documentation ?? null,
      examples: Object.freeze(definition.examples ?? [])
    })
  });
}

const RULE_DEFINITIONS: RuleDefinition[] = [
  {
    id: "text-deprecated-node-api",
    scope: "module-analysis",
    patterns: ["eslint-plugin-n/no-deprecated-api"],
    category: "Deprecated",
    description: "Replace deprecated Node.js APIs with their supported alternatives."
  },
  {
    id: "text-deprecated-fs-F_OK",
    scope: "module-analysis",
    patterns: ["fs.F_OK"],
    category: "Deprecated",
    description: "Replace it with `fs.constants.F_OK`."
  },
  {
    id: "text-deprecated-fs-R_OK",
    scope: "module-analysis",
    patterns: ["fs.R_OK"],
    category: "Deprecated",
    description: "Replace it with `fs.constants.R_OK`."
  },
  {
    id: "text-deprecated-fs-W_OK",
    scope: "module-analysis",
    patterns: ["fs.W_OK"],
    category: "Deprecated",
    description: "Replace it with `fs.constants.W_OK`."
  },
  {
    id: "text-deprecated-fs-X_OK",
    scope: "module-analysis",
    patterns: ["fs.X_OK"],
    category: "Deprecated",
    description: "Replace it with `fs.constants.X_OK`."
  },
  {
    id: "text-typo-magic-mirror",
    scope: "text",
    patterns: ["Magic Mirror"],
    category: "Typo",
    description: "Replace it with `MagicMirror²`."
  },
  {
    id: "text-typo-magicmirror2",
    scope: "text",
    patterns: ["MagicMirror2"],
    category: "Typo",
    description: "Replace it with `MagicMirror²`."
  },
  {
    id: "text-typo-magicmirror-brackets",
    scope: "text",
    patterns: ["[MagicMirror]"],
    category: "Typo",
    description: "Replace it with `[MagicMirror²]`."
  },
  {
    id: "text-typo-html-sub2",
    scope: "text",
    patterns: ["<sub>2</sub>"],
    category: "Typo",
    description: "Replace it with `²`."
  },
  {
    id: "text-deprecated-request",
    scope: "module-analysis",
    patterns: ["require(\"request\")", "require('request')"],
    category: "Deprecated",
    description:
      "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    id: "text-deprecated-request-promise",
    scope: "module-analysis",
    patterns: ["require(\"request-promise\")", "require('request-promise')"],
    category: "Deprecated",
    description:
      "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    id: "text-deprecated-native-request",
    scope: "module-analysis",
    patterns: ["require(\"native-request\")"],
    category: "Deprecated",
    description:
      "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    id: "text-recommend-http-module",
    scope: "module-analysis",
    patterns: ["require(\"http\")", "require('http')"],
    category: "Recommendation",
    description: "Replace `http` with the scoped import `node:http`."
  },
  {
    id: "text-recommend-https-module",
    scope: "module-analysis",
    patterns: ["require(\"https\")", "require('https')"],
    category: "Recommendation",
    description: "Replace `https` with the scoped import `node:https`."
  },
  {
    id: "text-recommend-node-fetch",
    scope: "module-analysis",
    patterns: ["'node-fetch'", "\"node-fetch\""],
    category: "Recommendation",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    id: "text-recommend-require-fetch",
    scope: "module-analysis",
    patterns: ["require(\"fetch\")", "require('fetch')"],
    category: "Recommendation",
    description: "Use the global fetch API instead of requiring a shim."
  },
  {
    id: "text-recommend-axios",
    scope: "module-analysis",
    patterns: ["axios"],
    category: "Recommendation",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    id: "text-deprecated-omxplayer",
    scope: "text",
    patterns: ["omxplayer"],
    category: "Deprecated",
    description:
      "Replace OMXPlayer usage with maintained alternatives such as mplayer or VLC."
  },
  {
    id: "text-recommend-xmlhttprequest",
    scope: "module-analysis",
    patterns: ["XMLHttpRequest"],
    category: "Recommendation",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    id: "text-recommend-actions-checkout",
    scope: "module-analysis",
    patterns: [`actions/checkout@vN where N < ${WORKFLOW_VERSION_POLICY.actions["actions/checkout"].currentMajor}`],
    category: "Recommendation",
    description: `Upgrade workflows to use actions/checkout@v${WORKFLOW_VERSION_POLICY.actions["actions/checkout"].currentMajor}.`
  },
  {
    id: "text-recommend-actions-setup-node",
    scope: "module-analysis",
    patterns: [`actions/setup-node@vN where N < ${WORKFLOW_VERSION_POLICY.actions["actions/setup-node"].currentMajor}`],
    category: "Recommendation",
    description: `Upgrade workflows to use actions/setup-node@v${WORKFLOW_VERSION_POLICY.actions["actions/setup-node"].currentMajor}.`
  },
  {
    id: "text-deprecated-node-version",
    scope: "module-analysis",
    patterns: [`node-version below v${WORKFLOW_VERSION_POLICY.node.currentMajor}`],
    category: "Deprecated",
    description: `Update CI workflows to target Node.js v${WORKFLOW_VERSION_POLICY.node.currentMajor} or newer.`
  },
  {
    id: "text-recommend-npm-run",
    scope: "text",
    patterns: ["npm run"],
    category: "Recommendation",
    description: "Prefer `node --run` over invoking npm run directly."
  },
  {
    id: "text-recommend-jshint",
    scope: "text",
    patterns: ["jshint"],
    category: "Recommendation",
    description: "Suggest migrating from JSHint to ESLint."
  },
  {
    id: "text-deprecated-getYear",
    scope: "module-analysis",
    patterns: ["getYear()"],
    category: "Deprecated",
    description: "Replace `getYear()` with `getFullYear()`."
  },
  {
    id: "text-outdated-michmich",
    scope: "text",
    patterns: ["MichMich/MagicMirror"],
    category: "Outdated",
    description: "Replace it by `MagicMirrorOrg/MagicMirror`."
  },
  {
    id: "text-outdated-husky",
    scope: "text",
    patterns: ["/_/husky.sh"],
    category: "Outdated",
    description: "Modern Husky setups do not require sourcing husky.sh."
  },
  {
    id: "text-deprecated-electron-rebuild-command",
    scope: "text",
    patterns: ["npm install electron-rebuild"],
    category: "Deprecated",
    description: "Install `@electron/rebuild` instead of the deprecated package."
  },
  {
    id: "text-deprecated-openweathermap",
    scope: "text",
    patterns: ["api.openweathermap.org/data/2.5"],
    category: "Deprecated",
    description: "OpenWeather API 2.5 is deprecated - upgrade integrations to v3."
  },
  {
    id: "text-recommend-cdn-cdnjs",
    scope: "text",
    patterns: ["https://cdnjs.cloudflare.com"],
    category: "Recommendation",
    description: "Prefer bundling dependencies via npm instead of CDN references."
  },
  {
    id: "text-recommend-cdn-jsdelivr",
    scope: "text",
    patterns: ["https://cdn.jsdelivr.net"],
    category: "Recommendation",
    description: "Prefer bundling dependencies via npm instead of CDN references."
  },
  {
    id: "text-recommend-eslint-dot",
    scope: "text",
    patterns: ["eslint .", "eslint --fix ."],
    category: "Recommendation",
    description: "Drop the trailing '.' when invoking ESLint v9 or newer."
  },
  {
    id: "text-recommend-git-checkout",
    scope: "text",
    patterns: ["git checkout"],
    category: "Recommendation",
    description: "Replace it with `git switch`. It's not a drop-in replacement, so make sure to check the documentation."
  },
  {
    id: "pkg-deprecated-electron-rebuild",
    scope: "module-analysis",
    patterns: ["\"electron-rebuild\""],
    category: "Deprecated",
    description: "Use `@electron/rebuild` instead."
  },
  {
    id: "pkg-deprecated-eslint-config-airbnb",
    scope: "module-analysis",
    patterns: ["eslint-config-airbnb"],
    category: "Deprecated",
    description: "Replace the preset with a maintained ESLint configuration."
  },
  {
    id: "pkg-recommend-eslint-plugin-json",
    scope: "module-analysis",
    patterns: ["\"eslint-plugin-json\"", "\"eslint-plugin-jsonc\""],
    category: "Recommendation",
    description: "Suggest adopting `@eslint/json` for JSON linting."
  },
  {
    id: "pkg-deprecated-grunt",
    scope: "module-analysis",
    patterns: ["\"grunt\""],
    category: "Deprecated",
    description: "Grunt is effectively unmaintained. Move on to something modern."
  },
  {
    id: "pkg-outdated-husky-install",
    scope: "module-analysis",
    patterns: ["husky install"],
    category: "Outdated",
    description: "Husky v9 no longer needs manual install scripts."
  },
  {
    id: "pkg-recommend-needle",
    scope: "module-analysis",
    patterns: ["\"needle\""],
    category: "Recommendation",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js))."
  },
  {
    id: "pkg-deprecated-rollup-banner",
    scope: "module-analysis",
    patterns: ["rollup-plugin-banner"],
    category: "Deprecated",
    description: "Use Rollup's built-in banner support."
  },
  {
    id: "pkg-deprecated-stylelint-config-prettier",
    scope: "module-analysis",
    patterns: ["stylelint-config-prettier"],
    category: "Deprecated",
    description: "Remove `stylelint-config-prettier` in modern Stylelint setups."
  },
  {
    id: "lock-deprecated-v1",
    scope: "package-lock",
    patterns: ["\"lockfileVersion\": 1"],
    category: "Deprecated",
    description: "Run `npm update` to update to lockfileVersion 3."
  },
  {
    id: "lock-deprecated-v2",
    scope: "package-lock",
    patterns: ["\"lockfileVersion\": 2"],
    category: "Deprecated",
    description: "Run `npm update` to update to lockfileVersion 3."
  },
];


const RULE_REGISTRY = Object.freeze(RULE_DEFINITIONS.map(createRule)) as readonly Readonly<RuleRecord>[];

const RULES_BY_STAGE: Readonly<Record<string, readonly Readonly<RuleRecord>[]>> = (() => {
  const stageEntries = new Map<string, RuleRecord[]>();
  for (const rule of RULE_REGISTRY) {
    for (const stageId of rule.stages) {
      if (!stageEntries.has(stageId)) {
        stageEntries.set(stageId, []);
      }
      stageEntries.get(stageId)?.push(rule);
    }
  }

  const frozenEntries = Array.from(stageEntries.entries()).map(([stageId, rules]) => [stageId, Object.freeze(rules.slice())]);
  return Object.freeze(Object.fromEntries(frozenEntries));
})();

const EMPTY_RULE_LIST = Object.freeze([]) as readonly Readonly<RuleRecord>[];

const TEXT_RULES = Object.freeze(RULE_REGISTRY.filter(rule => rule.scope === "text" && rule.stages.includes(DEFAULT_STAGE_ID)));

const PACKAGE_JSON_RULES = Object.freeze(RULE_REGISTRY.filter(rule => rule.id.startsWith("pkg-") && rule.stages.includes(DEFAULT_STAGE_ID)));

const PACKAGE_DEPENDENCY_RULES = new Map([
  ["electron-rebuild", "pkg-deprecated-electron-rebuild"],
  ["eslint-config-airbnb", "pkg-deprecated-eslint-config-airbnb"],
  ["eslint-config-airbnb-base", "pkg-deprecated-eslint-config-airbnb"],
  ["eslint-config-airbnb-typescript", "pkg-deprecated-eslint-config-airbnb"],
  ["eslint-config-airbnb-typescript-base", "pkg-deprecated-eslint-config-airbnb"],
  ["eslint-plugin-json", "pkg-recommend-eslint-plugin-json"],
  ["eslint-plugin-jsonc", "pkg-recommend-eslint-plugin-json"],
  ["grunt", "pkg-deprecated-grunt"],
  ["needle", "pkg-recommend-needle"],
  ["rollup-plugin-banner", "pkg-deprecated-rollup-banner"],
  ["rollup-plugin-banner2", "pkg-deprecated-rollup-banner"],
  ["stylelint-config-prettier", "pkg-deprecated-stylelint-config-prettier"],
  ["stylelint-config-prettier-scss", "pkg-deprecated-stylelint-config-prettier"]
]);

const PACKAGE_LOCK_RULES = Object.freeze(RULE_REGISTRY.filter(rule => rule.scope === "package-lock" && rule.stages.includes(DEFAULT_STAGE_ID)));
const RULE_INDEX = new Map<string, Readonly<RuleRecord>>(RULE_REGISTRY.map(rule => [rule.id, rule]));

export {
  RULE_CATEGORY_METADATA,
  RULES_BY_STAGE,
  RULE_REGISTRY,
  RULE_SEVERITIES,
  PIPELINE_CHECK_STAGE_IDS,
  TEXT_RULES,
  PACKAGE_JSON_RULES,
  PACKAGE_DEPENDENCY_RULES,
  PACKAGE_LOCK_RULES
};
export function getRuleById(ruleId: string): Readonly<RuleRecord> | null {
  return RULE_INDEX.get(ruleId) ?? null;
}
export function getCategoryMetadata(category: string): RuleCategoryInfo | null {
  return category in RULE_CATEGORY_METADATA
    ? RULE_CATEGORY_METADATA[category as RuleCategory]
    : null;
}
export function getRulesForStage(stageId: string): readonly Readonly<RuleRecord>[] {
  if (typeof stageId !== "string" || stageId.length === 0) {
    return EMPTY_RULE_LIST;
  }
  return RULES_BY_STAGE[stageId] ?? EMPTY_RULE_LIST;
}
