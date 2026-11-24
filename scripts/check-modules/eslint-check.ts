import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createIssue, type Issue } from "./issue.ts";
import { getRuleById } from "./rule-registry.ts";

export async function runEslintCheck(moduleDir: string, includeGeneralChecks = true): Promise<Issue[]> {
  const moduleOverrides = path.basename(path.resolve(moduleDir)).startsWith("MMM-Remote-Control")
    ? [{
        files: ["**/node_helper.js"],
        languageOptions: {
          globals: {
            Module: "writable"
          }
        }
      }]
    : [];
  const eslint = new ESLint({
    cwd: path.resolve(moduleDir),
    overrideConfigFile: fileURLToPath(new URL("../../eslint.testconfig.js", import.meta.url)),
    overrideConfig: moduleOverrides,
    allowInlineConfig: false,
    errorOnUnmatchedPattern: false,
    fix: false
  });
  const results = await eslint.lintFiles(["**/*.{js,mjs,cjs,yaml,yml}", "**/package.json"]);
  const issues: Issue[] = [];
  const generalIssues: Issue[] = [];

  for (const result of results) {
    const relativePath = path.relative(moduleDir, result.filePath);
    for (const message of result.messages) {
      const location = `In \`${relativePath}:${message.line}:${message.column}\`:`;
      if (message.ruleId === "eslintN/no-deprecated-api") {
        const ruleId = "text-deprecated-node-api";
        const rule = getRuleById(ruleId);
        if (rule) {
          issues.push(createIssue(rule.category, `${location} ${message.message}`, {
            ruleId,
            severity: rule.severity
          }));
        }
      }
      else if (message.ruleId?.startsWith("magicmirror/")) {
        const rule = message.messageId ? getRuleById(message.messageId) : null;
        if (rule) {
          issues.push(createIssue(rule.category, `${location} ${message.message}`, {
            ruleId: rule.id,
            severity: rule.severity
          }));
        }
      }
      else if (includeGeneralChecks || message.fatal) {
        generalIssues.push(createIssue("ESLint", `${relativePath}: Line ${message.line}, Column ${message.column}: ${message.message} (rule: ${message.ruleId})`, {
          ruleId: message.ruleId ?? undefined,
          severity: message.fatal || message.severity === 2 ? "error" : "warning"
        }));
      }
    }
  }

  issues.push(...generalIssues);
  return issues;
}
