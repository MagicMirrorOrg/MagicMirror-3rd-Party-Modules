import { ensureDirectory, fileExists } from "../../scripts/shared/fs-utils.ts";
import { ensureRepository, getCommitDate } from "../../scripts/shared/git.ts";
import { createLogger } from "../../scripts/shared/logger.ts";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import type { CloneResult, ModuleInput, ProcessModuleConfig } from "./module-types.ts";

const logger = createLogger({ name: "module-clone" });

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function cloneModule(module: ModuleInput, config: ProcessModuleConfig): Promise<CloneResult> {
  const identifier = `${module.name}-----${module.maintainer}`;
  const tempPath = path.join(config.modulesTempDir, identifier);
  const finalPath = path.join(config.modulesDir, identifier);
  if (config.localOnly) {
    return { success: true };
  }

  const branch = typeof module.branch === "string" && module.branch.length > 0 ? module.branch : null;
  try {
    if (config.moduleLogger) {
      await config.moduleLogger.info("clone", "Starting clone stage", { url: module.url, branch: branch || "default" });
    }

    if (module.lastCommit && await fileExists(finalPath)) {
      try {
        const localDateStr = await getCommitDate({ cwd: finalPath });
        if (localDateStr && new Date(localDateStr).getTime() >= new Date(module.lastCommit).getTime() - 60_000) {
          logger.debug(`Skipping clone for ${module.name}: Local repo is up to date`);
          if (config.moduleLogger) {
            await config.moduleLogger.info("clone", "Skipped - local repo is up to date", {
              localCommit: localDateStr,
              remoteCommit: module.lastCommit
            });
          }
          return { success: true };
        }
      }
      catch (error) {
        logger.debug(`Could not verify local commit date for ${module.name}, proceeding with clone: ${getErrorMessage(error)}`);
        if (config.moduleLogger) {
          await config.moduleLogger.debug("clone", "Could not verify local commit date, proceeding with clone", { error: getErrorMessage(error) });
        }
      }
    }

    await ensureRepository({ repositoryUrl: module.url, directoryPath: tempPath, branch, depth: 1 });
    if (config.moduleLogger) {
      await config.moduleLogger.info("clone", "Repository cloned successfully");
    }

    await ensureDirectory(path.dirname(finalPath));
    if (await fileExists(finalPath)) {
      await rm(finalPath, { recursive: true, force: true });
    }
    await rename(tempPath, finalPath);
    if (config.moduleLogger) {
      await config.moduleLogger.info("clone", "Moved to final location", { path: finalPath });
    }
    return { success: true };
  }
  catch (error) {
    const message = getErrorMessage(error);
    logger.error(`Clone failed for ${module.name}: ${message}`);
    if (config.moduleLogger) {
      await config.moduleLogger.error("clone", `Clone failed: ${message}`, {
        error: message,
        stack: error instanceof Error ? error.stack : null
      });
    }
    await rm(tempPath, { recursive: true, force: true }).catch(() => undefined);
    return { success: false, error: message };
  }
}
