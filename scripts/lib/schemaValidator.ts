import type { ErrorObject, ValidateFunction } from "ajv";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const schemaDirectory = path.resolve(currentDir, "../../dist/schemas");
const require = createRequire(import.meta.url);
const Ajv = require("ajv") as typeof import("ajv").default;
const addFormats = require("ajv-formats") as typeof import("ajv-formats").default;

const STAGE_SCHEMAS = {
  "modules.final": "modules.final.schema.json",
  "modules.min": "modules.min.schema.json",
  stats: "stats.schema.json"
};

type StageId = keyof typeof STAGE_SCHEMAS;

export class SchemaValidationError extends Error {
  errors?: ErrorObject[];
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const compiledValidators = new Map<StageId, ValidateFunction>();

function getValidator(stageId: string): ValidateFunction {
  if (!(stageId in STAGE_SCHEMAS)) {
    throw new Error(`No schema registered for stage "${stageId}".`);
  }

  const normalizedStageId = stageId as StageId;

  if (!compiledValidators.has(normalizedStageId)) {
    const schemaPath = path.join(schemaDirectory, STAGE_SCHEMAS[normalizedStageId]);
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    const validate = ajv.compile(schema);
    compiledValidators.set(normalizedStageId, validate);
  }

  const validator = compiledValidators.get(normalizedStageId);
  if (!validator) {
    throw new Error(`Could not compile schema validator for stage "${stageId}".`);
  }

  return validator;
}

function getModuleContext(error: ErrorObject, data: unknown): string {
  const match = /^\/modules\/(\d+)(?:\/([^/]+))?$/u.exec(error.instancePath);
  if (!match || !data || typeof data !== "object" || !("modules" in data)) {
    return "";
  }

  const modules = (data as { modules?: unknown }).modules;
  const index = Number(match[1]);
  if (!Array.isArray(modules)) {
    return "";
  }

  const module = modules[index];
  if (!module || typeof module !== "object") {
    return "";
  }

  const record = module as Record<string, unknown>;
  const details = [`module[${index}]`];
  for (const key of ["name", "id"]) {
    if (typeof record[key] === "string") {
      details.push(`${key}=${JSON.stringify(record[key])}`);
    }
  }

  const field = match[2]?.replace(/~1/gu, "/").replace(/~0/gu, "~");
  if (field && Object.hasOwn(record, field)) {
    details.push(`${field}=${JSON.stringify(record[field])}`);
  }

  return ` (${details.join(", ")})`;
}

function formatErrors(errors: ErrorObject[], data?: unknown): string {
  return errors
    .map((error) => {
      const dataPath = error.instancePath || error.schemaPath;
      return `${dataPath}: ${error.message}${getModuleContext(error, data)}`;
    })
    .join("\n");
}

export function validateStageData(stageId: string, data: unknown): true {
  const validate = getValidator(stageId);
  const valid = validate(data);

  if (!valid) {
    const message = formatErrors(validate.errors ?? [], data);
    const error = new SchemaValidationError(`Schema validation failed for ${stageId}:\n${message}`);
    error.errors = validate.errors ?? undefined;
    throw error;
  }

  return true;
}

export async function validateStageFile(stageId: string, filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  const data = JSON.parse(raw);
  validateStageData(stageId, data);
  return data;
}

export async function cliValidateStage(stageId: string, filePath: string): Promise<number> {
  try {
    await validateStageFile(stageId, filePath);
    return 0;
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lines = [
      `Schema validation failed for ${stageId} at ${filePath}.`,
      message
    ];

    console.error(lines.join("\n"));
    return 1;
  }
}

export function assertStageOrExit(stageId: string, filePath: string): void {
  cliValidateStage(stageId, filePath).then((code) => {
    if (code !== 0) {
      process.exit(code);
    }
  });
}
