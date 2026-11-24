#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { validateArtifactSet, type ArtifactDefinition } from "./lib/validate-artifacts.ts";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const RELEASE_ARTIFACTS: ArtifactDefinition[] = [
  { stageId: "issues", relativePath: "website/data/issues.json" },
  { stageId: "modules.final", relativePath: "website/data/modules.json" },
  { stageId: "modules.min", relativePath: "website/data/modules.min.json" },
  { stageId: "stats", relativePath: "website/data/stats.json" }
];

async function main() {
  const valid = await validateArtifactSet({
    artifacts: RELEASE_ARTIFACTS,
    failureMessage: "Release artifact validation failed. Inspect the errors above and address the offending files before publishing a new package.",
    projectRoot: PROJECT_ROOT,
    successMessage: "All release artifacts validated successfully."
  });

  if (!valid) {
    process.exit(1);
  }
}

main();
