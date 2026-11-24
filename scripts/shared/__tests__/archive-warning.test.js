import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getRepositoryStatusIssues } from "../../check-modules/repository-status-check.ts";

describe("repository status issues", () => {
  it("reports archived GitHub repositories", () => {
    const issues = getRepositoryStatusIssues({
      id: "SVendittelli/MMM-fitbit",
      isArchived: true,
      url: "https://github.com/SVendittelli/MMM-fitbit"
    });

    assert.deepStrictEqual(issues, [{
      message: "This GitHub repository is archived and read-only. It may no longer receive fixes or updates.",
      severity: "warning"
    }]);
  });

  it("does not report archive status for active repositories", () => {
    const issues = getRepositoryStatusIssues({
      id: "example/MMM-example",
      isArchived: false,
      url: "https://github.com/example/MMM-example"
    });

    assert.deepStrictEqual(issues, []);
  });
});
