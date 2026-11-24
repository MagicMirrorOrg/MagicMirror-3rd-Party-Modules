import {
  PACKAGE_JSON_RULES,
  PACKAGE_LOCK_RULES,
  PIPELINE_CHECK_STAGE_IDS,
  RULES_BY_STAGE,
  RULE_REGISTRY,
  TEXT_RULES,
  getRulesForStage
} from "../rule-registry.ts";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { updateRuleInventory } from "../generate-rule-docs.js";

const DEFAULT_STAGE = PIPELINE_CHECK_STAGE_IDS.MODERN;

test("documented rule inventory matches the registry", async () => {
  const markdown = await readFile(new URL("../../../docs/pipeline/check-modules-reference.md", import.meta.url), "utf8");
  assert.equal(markdown, await updateRuleInventory(markdown), "Run node --run docs:rules to update the rule inventory");
});

test("rule inventory regeneration repairs drift and requires unique markers", async () => {
  const markdown = await readFile(new URL("../../../docs/pipeline/check-modules-reference.md", import.meta.url), "utf8");
  const stale = markdown.replace(RULE_REGISTRY[0].id, "stale-rule");
  assert.notEqual(stale, markdown);
  assert.equal(await updateRuleInventory(stale), markdown);
  await assert.rejects(updateRuleInventory(`${markdown}\n<!-- rule-inventory:start -->`), /exactly one/u);
});

test("every rule declares at least one stage", () => {
  for (const rule of RULE_REGISTRY) {
    assert.ok(Array.isArray(rule.stages), `Rule ${rule.id} should expose stages array.`);
    assert.notEqual(rule.stages.length, 0, `Rule ${rule.id} should target at least one stage.`);
  }
});

test("stage subsets expose rules by stage id", () => {
  const defaultRules = getRulesForStage(DEFAULT_STAGE);

  assert.ok(Array.isArray(defaultRules));
  assert.ok(defaultRules.every(rule => rule.stages.includes(DEFAULT_STAGE)), "Default stage rules should reference modern stage id");
});

test("stage map includes exported subsets", () => {
  assert.equal(RULES_BY_STAGE[DEFAULT_STAGE], getRulesForStage(DEFAULT_STAGE));
});

test("text/package rules filtered to modern stage", () => {
  for (const rule of TEXT_RULES) {
    assert.ok(rule.stages.includes(DEFAULT_STAGE), `Text rule ${rule.id} should apply to modern stage.`);
  }
  for (const rule of PACKAGE_JSON_RULES) {
    assert.ok(rule.stages.includes(DEFAULT_STAGE), `package.json rule ${rule.id} should apply to modern stage.`);
  }
  for (const rule of PACKAGE_LOCK_RULES) {
    assert.ok(rule.stages.includes(DEFAULT_STAGE), `package-lock rule ${rule.id} should apply to modern stage.`);
  }
});

test("unknown stage returns an empty array", () => {
  const result = getRulesForStage("unknown-stage");
  assert.deepEqual(result, [], "Unknown stage should return frozen empty array");
  assert.ok(Object.isFrozen(result), "Empty result should be frozen");
});
