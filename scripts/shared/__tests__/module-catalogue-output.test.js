import { deepEqual, equal, ok } from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { writePublishedCatalogueOutputs } from "../module-catalogue-output.ts";

async function createProjectRoot(prefix = "module-catalogue-output-test-") {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(root, "website", "data"), { recursive: true });
  return root;
}

function createProcessedModule(overrides = {}) {
  return {
    category: "Test",
    id: "owner/module-a",
    issues: [],
    maintainer: "Owner",
    name: "module-a",
    url: "https://github.com/owner/module-a",
    ...overrides
  };
}

test("writePublishedCatalogueOutputs writes outputs on first publish and reports additions", async () => {
  const projectRoot = await createProjectRoot();
  const issue = {
    category: "Recommendation",
    message: "Add a changelog.",
    ruleId: "module-changelog",
    severity: "warning"
  };
  const processedModules = [createProcessedModule({ issues: [issue] })];

  const result = await writePublishedCatalogueOutputs(processedModules, projectRoot);
  const issues = JSON.parse(await readFile(result.issuesJsonPath, "utf-8"));

  equal(result.wroteOutputs, true);
  ok(result.changeSummary);
  equal(result.changeSummary.hasChanges, true);
  equal(result.changeSummary.addedCount, 1);
  equal(result.changeSummary.changedCount, 0);
  equal(result.changeSummary.removedCount, 0);
  equal(result.changeSummary.unchangedCount, 0);
  deepEqual(issues["owner/module-a"], [issue]);
});

test("writePublishedCatalogueOutputs skips writes when modules are unchanged", async () => {
  const projectRoot = await createProjectRoot();
  const processedModules = [createProcessedModule()];

  const firstResult = await writePublishedCatalogueOutputs(processedModules, projectRoot);
  equal(firstResult.wroteOutputs, true);

  const firstStats = await readFile(firstResult.statsPath, "utf-8");
  const secondResult = await writePublishedCatalogueOutputs(processedModules, projectRoot);
  const secondStats = await readFile(secondResult.statsPath, "utf-8");

  equal(secondResult.wroteOutputs, false);
  ok(secondResult.changeSummary);
  equal(secondResult.changeSummary.hasChanges, false);
  equal(secondResult.changeSummary.addedCount, 0);
  equal(secondResult.changeSummary.changedCount, 0);
  equal(secondResult.changeSummary.removedCount, 0);
  equal(secondResult.changeSummary.unchangedCount, 1);
  equal(secondStats, firstStats);
});

test("writePublishedCatalogueOutputs writes issue-only changes", async () => {
  const projectRoot = await createProjectRoot();
  const initialModules = [createProcessedModule({
    issues: [{ message: "First issue", severity: "warning" }]
  })];
  const updatedModules = [createProcessedModule({
    issues: [{ message: "Updated issue", severity: "warning" }]
  })];

  await writePublishedCatalogueOutputs(initialModules, projectRoot);
  const result = await writePublishedCatalogueOutputs(updatedModules, projectRoot);
  const issues = JSON.parse(await readFile(result.issuesJsonPath, "utf-8"));

  equal(result.wroteOutputs, true);
  deepEqual(issues["owner/module-a"], updatedModules[0].issues);
});

test("writePublishedCatalogueOutputs writes outputs and reports changed modules", async () => {
  const projectRoot = await createProjectRoot();
  const initialModules = [createProcessedModule({ stars: 5 })];
  const updatedModules = [createProcessedModule({ stars: 10 })];

  await writePublishedCatalogueOutputs(initialModules, projectRoot);
  const result = await writePublishedCatalogueOutputs(updatedModules, projectRoot);

  equal(result.wroteOutputs, true);
  ok(result.changeSummary);
  equal(result.changeSummary.hasChanges, true);
  equal(result.changeSummary.addedCount, 0);
  equal(result.changeSummary.changedCount, 1);
  equal(result.changeSummary.removedCount, 0);
  equal(result.changeSummary.unchangedCount, 0);

  deepEqual(result.outputPaths, {
    issuesJsonPath: result.issuesJsonPath,
    modulesJsonPath: result.modulesJsonPath,
    modulesMinPath: result.modulesMinPath,
    statsPath: result.statsPath
  });
});
