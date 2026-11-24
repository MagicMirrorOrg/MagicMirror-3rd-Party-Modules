import { createLogger } from "./shared/logger.ts";
import { resolve } from "node:path";
import { writePublishedCatalogueOutputs, type CatalogueStats, type ProcessedModule } from "./shared/module-catalogue-output.ts";

interface OutputPaths {
  modulesJsonPath: string;
  modulesMinPath: string;
  statsPath: string;
}

interface ChangeSummary {
  addedCount: number;
  changedCount: number;
  hasChanges: boolean;
  removedCount: number;
  unchangedCount: number;
}

interface OutputResult {
  changeSummary?: ChangeSummary | null;
  modulesJsonPath?: string;
  modulesMinPath?: string;
  outputPaths?: OutputPaths | null;
  stats?: CatalogueStats;
  statsPath?: string;
  wroteOutputs?: boolean;
}

interface NormalizedOutputDetails {
  changeSummary: ChangeSummary | null;
  outputPaths: OutputPaths | null;
  stats?: CatalogueStats;
  wroteOutputs: boolean;
}

interface AggregateLogger {
  error: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
}

type OutputWriter = (processedModules: ProcessedModule[], projectRoot: string) => Promise<OutputResult | OutputPaths> | OutputResult | OutputPaths;

interface RunAggregateCatalogueOptions {
  outputWriter?: OutputWriter | null;
  projectRoot?: string;
  runLogger?: AggregateLogger;
  processedModules: ProcessedModule[];
}

export interface AggregateCatalogueResult {
  changeSummary: ChangeSummary | null;
  outputPaths: OutputPaths | null;
  processedModulesCount: number;
  stats?: CatalogueStats;
  wroteOutputs: boolean;
}

const logger = createLogger({ name: "aggregate-catalogue" });
const PROJECT_ROOT = resolve(process.cwd());

function normalizeOutputDetails(outputResult: OutputResult | OutputPaths | null): NormalizedOutputDetails {
  if (!outputResult || typeof outputResult !== "object") {
    return {
      changeSummary: null,
      outputPaths: null,
      wroteOutputs: true
    };
  }

  const result = outputResult as OutputResult;
  const outputPaths = result.outputPaths
    ?? (result.modulesJsonPath && result.modulesMinPath && result.statsPath
      ? {
        modulesJsonPath: result.modulesJsonPath,
        modulesMinPath: result.modulesMinPath,
        statsPath: result.statsPath
      }
      : null);

  return {
    changeSummary: result.changeSummary ?? null,
    outputPaths,
    stats: result.stats,
    wroteOutputs: typeof result.wroteOutputs === "boolean" ? result.wroteOutputs : true
  };
}

export async function runAggregateCatalogue({
  processedModules,
  projectRoot = PROJECT_ROOT,
  outputWriter = writePublishedCatalogueOutputs,
  runLogger = logger
}: RunAggregateCatalogueOptions): Promise<AggregateCatalogueResult> {
  if (!Array.isArray(processedModules)) {
    throw new TypeError("runAggregateCatalogue requires processedModules from the in-memory pipeline handoff");
  }

  const outputResult = outputWriter
    ? await outputWriter(processedModules, projectRoot)
    : null;

  const outputDetails = normalizeOutputDetails(outputResult);

  if (outputDetails.changeSummary) {
    const {
      addedCount,
      changedCount,
      hasChanges,
      removedCount,
      unchangedCount
    } = outputDetails.changeSummary;

    runLogger.info(
      `Diff summary: +${addedCount} ~${changedCount} -${removedCount} =${unchangedCount}`
    );

    if (!hasChanges && !outputDetails.wroteOutputs) {
      runLogger.info("No module-level changes detected; reusing existing published outputs");
    }
  }

  runLogger.info(`Aggregated ${processedModules.length} module(s) into published catalogue outputs`);
  return {
    changeSummary: outputDetails.changeSummary,
    outputPaths: outputDetails.outputPaths,
    processedModulesCount: processedModules.length,
    stats: outputDetails.stats,
    wroteOutputs: outputDetails.wroteOutputs
  };
}
