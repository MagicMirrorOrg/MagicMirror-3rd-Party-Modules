import { ISSUE_POLICY, createIssue, formatIssue, isIssue, mergeUniqueIssues, normalizeIssues, shouldRecommendMissingConfigSchema } from "../issue.ts";
import assert from "node:assert/strict";
import test from "node:test";

test("creates structured issues without embedding category in the message", () => {
  const issue = createIssue("Recommendation", "Add a schema.", { ruleId: "schema-missing" });

  assert.deepEqual(issue, {
    category: "Recommendation",
    message: "Add a schema.",
    ruleId: "schema-missing",
    severity: "warning"
  });
  assert.equal(formatIssue(issue), "Recommendation: Add a schema.");
});

test("deduplicates structured and legacy issues by rendered text", () => {
  const target = [createIssue("Warning", "Duplicate")];
  mergeUniqueIssues(target, [
    "Warning: Duplicate",
    createIssue("Recommendation", "Keep")
  ]);

  assert.equal(target.length, 2);
  assert.equal(target[1].category, "Recommendation");
});

test("exposes the shared issue budget policy", () => {
  assert.equal(shouldRecommendMissingConfigSchema(ISSUE_POLICY.maxBeforeDependencyChecks - 1), true);
  assert.equal(shouldRecommendMissingConfigSchema(ISSUE_POLICY.maxBeforeDependencyChecks), false);
});

test("normalizes legacy issue strings for cache and input compatibility", () => {
  const issues = normalizeIssues([
    "Warning: Invalid config schema.",
    "Repository issues are disabled."
  ]);

  assert.ok(issues.every(isIssue));
  assert.deepEqual(issues, [
    { category: "Warning", message: "Invalid config schema.", severity: "warning" },
    { message: "Repository issues are disabled.", severity: "warning" }
  ]);
});
