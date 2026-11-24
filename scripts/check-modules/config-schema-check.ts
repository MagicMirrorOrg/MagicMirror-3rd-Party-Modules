import { createIssue, type Issue } from "./issue.ts";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AnySchema, ErrorObject } from "ajv";

const require = createRequire(import.meta.url);
const Ajv = require("ajv") as typeof import("ajv").default;
const Ajv2019 = require("ajv/dist/2019").default as typeof import("ajv").default;
const Ajv2020 = require("ajv/dist/2020").default as typeof import("ajv").default;
const addFormats = require("ajv-formats") as typeof import("ajv-formats").default;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.replace(/\s+/gu, " ").trim() : String(error);
}

export async function checkConfigSchema(moduleDir: string, previousIssueCount: number): Promise<Issue[]> {
  const schemaPath = path.join(moduleDir, "config.schema.json");
  let contents: string;

  try {
    contents = await readFile(schemaPath, "utf8");
  }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return previousIssueCount < 4
        ? [createIssue("Recommendation", "Add a `config.schema.json` to provide configuration validation and editor support.")]
        : [];
    }
    return [createIssue("Warning", `Could not read config.schema.json: ${getErrorMessage(error)}`)];
  }

  try {
    const schema = JSON.parse(contents) as AnySchema;
    const schemaId = schema && typeof schema === "object" && typeof schema.$schema === "string" ? schema.$schema : "";
    const AjvForSchema = schemaId.includes("2020-12")
      ? Ajv2020
      : schemaId.includes("2019-09")
        ? Ajv2019
        : Ajv;
    const ajv = new AjvForSchema({ allErrors: true, strict: false });
    addFormats(ajv);
    ajv.compile(schema);
    return [];
  }
  catch (error) {
    const details = error && typeof error === "object" && "errors" in error && Array.isArray(error.errors)
      ? (error.errors as ErrorObject[]).map(entry => entry.message).filter(Boolean).join("; ")
      : getErrorMessage(error);
    return [createIssue("Warning", `Invalid config.schema.json: ${details}`)];
  }
}