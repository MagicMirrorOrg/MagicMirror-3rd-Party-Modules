import { readdir, rm } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_LOG_RETENTION = 20;

function parseRetention(value: string | undefined): number {
  if (!value) {
    return DEFAULT_LOG_RETENTION;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_LOG_RETENTION;
}

export async function pruneModuleLogs(
  projectRoot: string,
  retention = parseRetention(process.env.PIPELINE_LOG_RETENTION)
): Promise<number> {
  const logsDirectory = path.join(projectRoot, "logs");
  let entries;
  try {
    entries = await readdir(logsDirectory, { withFileTypes: true });
  }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }

  const runDirectories = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((left, right) => right.localeCompare(left));
  const staleDirectories = runDirectories.slice(retention);

  await Promise.all(staleDirectories.map(directory => rm(path.join(logsDirectory, directory), {
    recursive: true,
    force: true
  })));
  return staleDirectories.length;
}
