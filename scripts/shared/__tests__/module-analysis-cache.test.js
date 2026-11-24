import {
  MODULE_ANALYSIS_CACHE_SCHEMA_VERSION,
  buildModuleAnalysisCacheContract,
  buildModuleAnalysisCacheKey,
  createModuleAnalysisCache
} from "../../shared/module-analysis-cache.ts";
import { equal, ok } from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { tmpdir } from "node:os";

async function createTempFilePath(prefix = "module-analysis-cache-test-") {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return join(dir, "moduleCache.json");
}

test("buildModuleAnalysisCacheKey returns a deterministic contract key", () => {
  const module = {
    id: "owner/repo",
    url: "https://github.com/owner/repo",
    branch: "main",
    lastCommit: "2026-03-19T13:16:31.658Z"
  };

  const left = buildModuleAnalysisCacheKey({
    module,
    catalogueRevision: "abc123",
    analysisConfig: { deep: true, ncu: false, eslint: true, npmDeprecatedCheck: true }
  });
  const right = buildModuleAnalysisCacheKey({
    module: {
      url: "https://github.com/owner/repo",
      lastCommit: "2026-03-19T13:16:31.658Z",
      id: "owner/repo",
      branch: "main"
    },
    catalogueRevision: "abc123",
    analysisConfig: { eslint: true, deep: true, ncu: false, npmDeprecatedCheck: true }
  });

  equal(left, right);
  ok(left?.includes(`"schemaVersion":${MODULE_ANALYSIS_CACHE_SCHEMA_VERSION}`));
  ok(left?.includes("\"catalogueRevision\":\"abc123\""));
});

test("buildModuleAnalysisCacheContract returns null without complete freshness signals", () => {
  const contract = buildModuleAnalysisCacheContract({
    module: {
      id: "owner/repo",
      url: "https://github.com/owner/repo"
    },
    analysisConfig: { deep: true }
  });

  equal(contract, null);
});

test("createModuleAnalysisCache persists the module cache schema version", async () => {
  const filePath = await createTempFilePath();
  const cache = createModuleAnalysisCache({ filePath });

  await cache.load();
  cache.set("analysis-key", { status: "success" });
  await cache.flush();

  const contents = JSON.parse(await readFile(filePath, "utf8"));
  equal(contents.version, MODULE_ANALYSIS_CACHE_SCHEMA_VERSION);
  ok(contents.entries["analysis-key"]);
});
