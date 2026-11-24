import { createIssue, formatIssue, isIssue, normalizeIssues } from "../issue.ts";
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
