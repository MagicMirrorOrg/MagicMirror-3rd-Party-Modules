import { describe, it, mock } from "node:test";
import { fetchRepositoryData, normalizeRepositoryData } from "../api.ts";
import assert from "node:assert";
import { enrichModules } from "../enrich.ts";
import process from "node:process";

describe("repository-api/api", () => {
  it("fetches the latest Codeberg commit through the commits list endpoint", async () => {
    const repositoryUrl = "https://codeberg.org/drdisgust/MMM-NCTtimes";
    const commitDate = "2022-08-07T11:24:59Z";
    const requestedUrls = [];
    const httpClient = {
      getJson: (url) => {
        requestedUrls.push(url);
        if (url === "https://codeberg.org/api/v1/repos/drdisgust/MMM-NCTtimes") {
          return {
            status: 200,
            ok: true,
            data: { default_branch: "main" }
          };
        }
        return {
          status: 200,
          ok: true,
          data: [{ commit: { author: { date: commitDate } } }]
        };
      }
    };

    const result = await fetchRepositoryData({ url: repositoryUrl }, httpClient, {});

    assert.deepStrictEqual(requestedUrls, [
      "https://codeberg.org/api/v1/repos/drdisgust/MMM-NCTtimes",
      "https://codeberg.org/api/v1/repos/drdisgust/MMM-NCTtimes/commits?sha=main&limit=1"
    ]);
    assert.strictEqual(normalizeRepositoryData(result.data, result.branchData, result.repoType).lastCommit, commitDate);
  });

  it("exposes GitHub subscriber count as watchersCount", () => {
    const normalized = normalizeRepositoryData({
      stargazers_count: 12,
      subscribers_count: 0,
      has_issues: true,
      archived: false,
      defaultBranchRef: { target: { committedDate: "2026-01-01T00:00:00.000Z" } }
    }, null, "github");

    assert.strictEqual(normalized.watchersCount, 0);
    assert.strictEqual(normalized.stars, 12);
  });

  it("keeps a non-zero GitHub subscriber count intact", () => {
    const normalized = normalizeRepositoryData({
      stargazers_count: 12,
      subscribers_count: 7,
      has_issues: true,
      archived: false,
      defaultBranchRef: { target: { committedDate: "2026-01-01T00:00:00.000Z" } }
    }, null, "github");

    assert.strictEqual(normalized.watchersCount, 7);
  });

  it("does not infer watchersCount when subscribers_count is missing", () => {
    const normalized = normalizeRepositoryData({
      stargazers_count: 12,
      has_issues: true,
      archived: false,
      defaultBranchRef: { target: { committedDate: "2026-01-01T00:00:00.000Z" } }
    }, null, "github");

    assert.strictEqual(typeof normalized.watchersCount, "undefined");
  });

  it("uses GraphQL watchers totalCount when subscribers_count is missing", () => {
    const normalized = normalizeRepositoryData({
      stargazers_count: 12,
      watchers: { totalCount: 4 },
      has_issues: true,
      archived: false,
      defaultBranchRef: { target: { committedDate: "2026-01-01T00:00:00.000Z" } }
    }, null, "github");

    assert.strictEqual(normalized.watchersCount, 4);
  });

  it("preserves previous metadata after a rate limit and on a partial cache hit", async () => {
    const previousToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    try {
      const module = { name: "MMM-Test", url: "https://github.com/example/MMM-Test" };
      const previous = { ...module, stars: 42, license: "MIT", hasGithubIssues: true, isArchived: true, lastCommit: "2025-01-01" };
      const previousModules = new Map([[module.url, previous]]);
      const cache = new Map();
      const options = {
        client: {
          getJson: () => ({ ok: false, status: 403, data: {} }),
          getText: url => url.endsWith("commits.atom")
            ? { ok: true, data: "<updated>2026-01-01</updated>" }
            : { ok: false, data: "" }
        },
        forceRefresh: false,
        logger: { debug: mock.fn(), error: mock.fn(), info: mock.fn(), warn: mock.fn() },
        repositoryCache: {
          get: key => cache.has(key) ? { value: cache.get(key) } : null,
          set: (key, value) => cache.set(key, value)
        }
      };

      for (let run = 0; run < 2; run += 1) {
        const [result] = await enrichModules([module], previousModules, options);
        assert.strictEqual(result.stars, 42);
        assert.strictEqual(result.license, "MIT");
        assert.strictEqual(result.hasGithubIssues, true);
        assert.strictEqual(result.isArchived, true);
        assert.strictEqual(result.lastCommit, "2026-01-01");
      }

      cache.set("example/MMM-Test", { stars: 0 });
      const [result] = await enrichModules([module], previousModules, options);
      assert.strictEqual(result.stars, 0);
    }
    finally {
      if (typeof previousToken === "string") {
        process.env.GITHUB_TOKEN = previousToken;
      }
      else {
        delete process.env.GITHUB_TOKEN;
      }
    }
  });
});
