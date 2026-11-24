import { mkdtemp, rm, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { checkConfigSchema } from "../config-schema-check.ts";
import { join } from "node:path";
import { test } from "node:test";
import { tmpdir } from "node:os";

async function createModule(context) {
  const moduleDir = await mkdtemp(join(tmpdir(), "config-schema-test-"));
  context.after(() => rm(moduleDir, { recursive: true, force: true }));
  return moduleDir;
}

test("validates config schemas using their declared JSON Schema draft", async (context) => {
  const moduleDir = await createModule(context);
  await writeFile(join(moduleDir, "config.schema.json"), JSON.stringify({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      apiUrl: { type: "string", format: "uri" }
    }
  }));

  assert.deepEqual(await checkConfigSchema(moduleDir, 10), []);
});

test("reports invalid config schemas even when the module already has many issues", async (context) => {
  const moduleDir = await createModule(context);
  await writeFile(join(moduleDir, "config.schema.json"), JSON.stringify({
    type: "object",
    required: "stationId"
  }));

  const issues = await checkConfigSchema(moduleDir, 10);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, "Warning");
  assert.ok(issues[0].message.startsWith("Invalid config.schema.json:"));
});

test("recommends a missing config schema only below the issue budget", async (context) => {
  const moduleDir = await createModule(context);

  assert.deepEqual(await checkConfigSchema(moduleDir, 3), [{
    category: "Recommendation",
    message: "Add a `config.schema.json` to provide configuration validation and editor support.",
    severity: "warning"
  }]);
  assert.deepEqual(await checkConfigSchema(moduleDir, 4), []);
});
