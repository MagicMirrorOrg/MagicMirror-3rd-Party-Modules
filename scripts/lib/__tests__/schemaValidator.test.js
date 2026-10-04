import assert from "node:assert/strict";
import { test } from "node:test";
import { validateStageData } from "../schemaValidator.ts";

test("schema validation identifies modules with invalid URL fields", () => {
  const data = {
    modules: [{
      name: "MMM-MyAgenda",
      id: "[hearter20176/MMM-MyAgenda",
      category: "Development",
      url: "https://github.com/[hearter20176/MMM-MyAgenda",
      maintainer: "hearter20176",
      maintainerURL: "https://github.com/[hearter20176",
      description: "Agenda",
      issues: false,
      defaultSortWeight: 1,
      lastCommit: "2026-10-04T00:00:00Z"
    }]
  };

  assert.throws(() => validateStageData("modules.final", data), (error) => {
    assert.match(error.message, /module\[0\].*name="MMM-MyAgenda"/u);
    assert.match(error.message, /url="https:\/\/github\.com\/\[hearter20176\/MMM-MyAgenda"/u);
    assert.match(error.message, /maintainerURL="https:\/\/github\.com\/\[hearter20176"/u);
    return true;
  });
});
