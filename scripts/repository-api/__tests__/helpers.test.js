import { describe, it } from "node:test";
import { getRepositoryId, getRepositoryType, isRepositoryType } from "../helpers.ts";
import assert from "node:assert";

describe("repository-api/helpers", () => {
  it("detects supported repository hosts by exact hostname", () => {
    assert.strictEqual(getRepositoryType("https://github.com/user/MMM-Test"), "github");
    assert.strictEqual(getRepositoryType("https://gitlab.com/group/MMM-Test"), "gitlab");
    assert.strictEqual(getRepositoryType("https://bitbucket.org/team/MMM-Test"), "bitbucket");
    assert.strictEqual(getRepositoryType("https://codeberg.org/user/MMM-Test"), "codeberg");
  });

  it("rejects deceptive hostnames that only contain the trusted domain as a substring", () => {
    assert.strictEqual(getRepositoryType("https://github.com.evil.example/user/MMM-Test"), "unknown");
    assert.strictEqual(getRepositoryType("https://evil.example/github.com/user/MMM-Test"), "unknown");
    assert.strictEqual(isRepositoryType("https://github.com.evil.example/user/MMM-Test", "github"), false);
  });

  it("extracts repository ids from normalized repository urls", () => {
    assert.strictEqual(getRepositoryId("git+https://github.com/user/MMM-Test.git"), "user/MMM-Test");
    assert.strictEqual(getRepositoryId("https://github.com/user/MMM-Test/"), "user/MMM-Test");
  });
});
