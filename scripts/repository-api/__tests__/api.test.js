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
});

describe("repository-api batch retries", () => {
  for (const scenario of [
    { name: "empty response", failure: null, sizes: [40, 20, 20], fallbackCount: 0 },
    { name: "terminated request", failure: new Error("terminated"), sizes: [40, 20, 20], fallbackCount: 0 },
    { name: "HTML success response", failure: new Error("Failed to parse JSON from https://api.github.com/graphql (HTTP 200): invalid JSON"), sizes: [40, 20, 20], fallbackCount: 0 },
    { name: "HTML server error", failure: new Error("Failed to parse JSON from https://api.github.com/graphql (HTTP 502): invalid JSON"), sizes: [40, 20, 20], fallbackCount: 0 },
    { name: "HTML authentication error", failure: new Error("Failed to parse JSON from https://api.github.com/graphql (HTTP 403): invalid JSON"), sizes: [40], fallbackCount: 40 },
    { name: "HTML rate limit response", failure: new Error("Failed to parse JSON from https://api.github.com/graphql (HTTP 429): invalid JSON"), sizes: [40], fallbackCount: 40 },
    { name: "persistent empty responses", failure: null, alwaysFail: true, sizes: [40, 20, 20], fallbackCount: 40 }
  ]) {
    it(`handles GraphQL ${scenario.name} with bounded retries`, async () => {
      const previousToken = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = "test-token";
      try {
        const modules = Array.from({ length: 40 }, (unused, index) => ({
          name: `MMM-Test-${index}`,
          url: `https://github.com/example/MMM-Test-${index}`
        }));
        const sizes = [];
        const logger = { debug: mock.fn(), error: mock.fn(), info: mock.fn(), warn: mock.fn() };
        let restCalls = 0;
        const result = await enrichModules(modules, new Map(), {
          client: {
            getJson: (url, options) => {
              if (url.endsWith("/graphql")) {
                const aliases = [...JSON.parse(options.body).query.matchAll(/(repo\d+): repository\(/gu)];
                sizes.push(aliases.length);
                if (scenario.alwaysFail || aliases.length === 40) {
                  if (scenario.failure) {
                    throw scenario.failure;
                  }
                  return { ok: true, status: 200, data: null };
                }
                return { ok: true, status: 200, data: { data: Object.fromEntries(aliases.map(match => [match[1], { stargazerCount: 7 }])) } };
              }
              restCalls += 1;
              return { ok: true, status: 200, data: { default_branch: "main", stargazers_count: 7 } };
            }
          },
          forceRefresh: true,
          logger,
          repositoryCache: { get: () => null, set: mock.fn() }
        });

        assert.deepStrictEqual(sizes, scenario.sizes);
        assert.strictEqual(result.length, 40);
        assert.ok(result.every(module => module.stars === 7));
        assert.strictEqual(restCalls, scenario.fallbackCount * 2);
        const diagnostics = logger.info.mock.calls.find(call => call.arguments[0] === "GitHub batch diagnostics").arguments[1];
        assert.strictEqual(diagnostics.individualFallbackAttempts, scenario.fallbackCount);
        assert.strictEqual(diagnostics.individualFallbackSuccesses, scenario.fallbackCount);
        assert.strictEqual(diagnostics.splitRetries, (scenario.sizes.length - 1) / 2);
        assert.strictEqual(logger.info.mock.calls.filter(call => call.arguments[0].startsWith("Recovered ")).length, 0);
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
  }
});

describe("repository-api fallback", () => {
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
