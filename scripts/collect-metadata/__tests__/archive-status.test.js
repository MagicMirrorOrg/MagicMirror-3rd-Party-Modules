import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectArchivedRepositoryPage } from "../../repository-api/enrich.ts";

describe("GitHub archive status", () => {
  it("detects GitHub's archived repository banner", () => {
    assert.strictEqual(
      detectArchivedRepositoryPage("This repository was archived by the owner on Aug 21, 2026. It is now read-only."),
      true
    );
  });

  it("does not mark an active repository as archived", () => {
    assert.strictEqual(detectArchivedRepositoryPage("This repository is active."), false);
  });
});
