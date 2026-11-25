import {
  MODULE_ANALYSIS_CACHE_SCHEMA_VERSION,
  buildModuleAnalysisCacheContract,
  buildModuleAnalysisCacheKey,
  createModuleAnalysisCache,
  getProjectRevision
} from "../../shared/module-analysis-cache.ts";
import { equal, ok } from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { tmpdir } from "node:os";

async function createTempFilePath(prefix = "module-analysis-cache-test-") {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return join(dir, "moduleCache.json");
}

test("getProjectRevision uses a valid supplied revision when Git is unavailable", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "module-analysis-no-git-"));
  const previousRevision = process.env.PIPELINE_CATALOGUE_REVISION;
  try {
    process.env.PIPELINE_CATALOGUE_REVISION = "a".repeat(40);
    equal(await getProjectRevision(projectRoot), "a".repeat(40));
    process.env.PIPELINE_CATALOGUE_REVISION = "dev";
    equal(await getProjectRevision(projectRoot), null);
  }
  finally {
    if (typeof previousRevision === "string") {
      process.env.PIPELINE_CATALOGUE_REVISION = previousRevision;
    }
    else {
      delete process.env.PIPELINE_CATALOGUE_REVISION;
    }
  }
});

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

test("analysis cache keys change when analysis inputs change", () => {
  const module = { id: "owner/repo", name: "MMM-Test", maintainer: "owner", url: "https://github.com/owner/repo", lastCommit: "commit", issues: [] };
  const cacheKey = buildModuleAnalysisCacheKey({ module, catalogueRevision: "catalogue" });
  for (const change of [{ name: "MMM-New" }, { maintainer: "other" }, { license: "MIT" }, { outdated: "old" }, { isArchived: true }, { hasGithubIssues: false }, { issues: ["new issue"] }]) {
    ok(buildModuleAnalysisCacheKey({ module: { ...module, ...change }, catalogueRevision: "catalogue" }) !== cacheKey);
  }
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

test("analysis cache entries expire after three days", async () => {
  let now = Date.parse("2026-01-01T00:00:00Z");
  const cache = createModuleAnalysisCache({ filePath: await createTempFilePath(), now: () => now });
  await cache.load();
  cache.set("analysis-key", { status: "success" });
  now += 3 * 24 * 60 * 60 * 1000;
  equal(cache.get("analysis-key"), null);
});
