#!/usr/bin/env node
import {
  sanitizeFinalModules,
  sanitizeGitHubData,
  sanitizeStats,
  stableStringify
} from "./sanitizers.ts";
import { getErrorMessage } from "../shared/errors.ts";
import { fileURLToPath } from "node:url";

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

type GoldenArtifactName = "modules.final" | "stats" | "gitHubData";

type GoldenSanitizer = (input: unknown) => unknown;

interface GoldenArtifact {
  name: GoldenArtifactName;
  sanitize: GoldenSanitizer;
  source: string;
  target: string;
}

function sanitizeUnknownArray(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

function sanitizeUnknownFinalModules(input: unknown): { [key: string]: unknown } {
  return input !== null && typeof input === "object"
    ? sanitizeFinalModules(input as never)
    : sanitizeFinalModules(undefined);
}

function sanitizeUnknownStats(input: unknown): { [key: string]: unknown } {
  return input !== null && typeof input === "object"
    ? sanitizeStats(input as never)
    : sanitizeStats(undefined);
}

function sanitizeUnknownGitHubData(input: unknown): { lastUpdate: string; repositories: unknown[] } {
  return input !== null && typeof input === "object"
    ? sanitizeGitHubData(input as never)
    : sanitizeGitHubData(undefined);
}

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const repoRoot = path.resolve(currentDirPath, "..", "..");

const mode = (process.argv[2] ?? "check").toLowerCase();
if (!["check", "update"].includes(mode)) {
  console.error(`Invalid mode "${mode}". Use "check" or "update".`);
  process.exit(1);
}

function readJson(filePath: string): unknown {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  }
  catch (error) {
    throw new Error(`Unable to read JSON from ${filePath}: ${getErrorMessage(error)}`, { cause: error });
  }
}

const artifacts: GoldenArtifact[] = [
  {
    name: "modules.final",
    source: path.join(repoRoot, "website/data/modules.json"),
    target: path.join(repoRoot, "fixtures/golden/modules.json"),
    sanitize: sanitizeUnknownFinalModules
  },
  {
    name: "stats",
    source: path.join(repoRoot, "website/data/stats.json"),
    target: path.join(repoRoot, "fixtures/golden/stats.json"),
    sanitize: sanitizeUnknownStats
  },
  {
    name: "gitHubData",
    source: path.join(repoRoot, "website/data/gitHubData.json"),
    target: path.join(repoRoot, "fixtures/golden/gitHubData.json"),
    sanitize: sanitizeUnknownGitHubData
  }

  /*
   * Note: skipped_modules.json is intentionally excluded from golden artifacts
   * as it's non-deterministic and depends on current repository availability
   */
];

function processArtifact(artifact: GoldenArtifact): string | null {
  const { name, source, target, sanitize } = artifact;

  if (!fs.existsSync(source)) {
    return `Source artifact missing: ${source}`;
  }

  const input = readJson(source);
  const sanitized = sanitize(input);
  const serialized = stableStringify(sanitized);

  if (mode === "update") {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, serialized, "utf8");
    console.log(`Updated golden artifact for ${name}`);
    return null;
  }

  if (!fs.existsSync(target)) {
    return `Golden artifact missing for ${name}. Run node --run fixtures -- golden-update.`;
  }

  const expectedRaw = fs.readFileSync(target, "utf8");
  if (expectedRaw !== serialized) {
    return `Mismatch detected for ${name}.`;
  }

  return null;
}

const discrepancies = artifacts
  .map(artifact => processArtifact(artifact))
  .filter((message): message is string => Boolean(message));

if (mode === "check") {
  if (discrepancies.length > 0) {
    console.error("\nGolden artifact verification failed:\n");
    for (const message of discrepancies) {
      console.error(` • ${message}`);
    }
    console.error("\nRun \"node --run fixtures -- golden-update\" and commit the refreshed artifacts if the changes are expected.");
    process.exit(1);
  }
  console.log("Golden artifacts match the current pipeline outputs.");
}
