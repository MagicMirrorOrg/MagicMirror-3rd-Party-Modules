import { buildResultMarkdown, collectIssueSummaries } from "../result-markdown.ts";
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("result-markdown", () => {
  it("collects issue summaries from processed modules", () => {
    const summaries = collectIssueSummaries([
      {
        name: "MMM-Example",
        maintainer: "Alice",
        url: "https://github.com/example/MMM-Example",
        issues: ["Issue one", "Issue two"]
      },
      {
        name: "MMM-Clean",
        maintainer: "Bob",
        issues: []
      },
      {
        name: "MMM-Boolean",
        maintainer: "Carol",
        issues: true
      },
      {
        name: "MMM-Quiet",
        maintainer: "Dana",
        url: "https://github.com/example/MMM-Quiet",
        watchersCount: 0
      },
      {
        name: "MMM-NotGitHub",
        maintainer: "Erin",
        url: "https://gitlab.com/example/MMM-NotGitHub",
        watchersCount: 0
      },
      {
        name: "MMM-Outdated",
        maintainer: "Frank",
        outdated: "This module is marked as outdated in the official module list.",
        issues: ["Developer hint that should be hidden"]
      }
    ]);

    assert.deepStrictEqual(summaries, [
      {
        name: "MMM-Example",
        maintainer: "Alice",
        url: "https://github.com/example/MMM-Example",
        issues: [
          { message: "Issue one", severity: "warning" },
          { message: "Issue two", severity: "warning" }
        ]
      },
      {
        name: "MMM-Quiet",
        maintainer: "Dana",
        url: "https://github.com/example/MMM-Quiet",
        issues: [{
          message: "GitHub reports 0 subscribers (Watch); maintainer notifications may be missed.",
          severity: "warning"
        }]
      }
    ]);
  });

  it("renders markdown with stats timestamp and issue details", () => {
    const markdown = buildResultMarkdown(
      {
        issueCounter: 2,
        lastUpdate: "2026-03-22T05:08:24.251Z",
        maintainer: { Alice: 1 },
        moduleCounter: 1,
        modulesWithIssuesCounter: 1,
        repositoryHoster: { github: 1 }
      },
      [
        {
          name: "MMM-Example",
          maintainer: "Alice",
          url: "https://github.com/example/MMM-Example",
          issues: ["Issue one", "Issue two"]
        }
      ]
    );

    assert.ok(markdown.includes("Last update: 2026-03-22T05:08:24.251Z"));
    assert.ok(markdown.includes("## General notes"));
    assert.ok(markdown.includes("### [MMM-Example by Alice](https://github.com/example/MMM-Example)"));
    assert.ok(markdown.includes("1. Issue one"));
    assert.ok(markdown.includes("2. Issue two"));
  });
});
