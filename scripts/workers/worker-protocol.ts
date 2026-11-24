import type { ModuleInput, ModuleResult, ProcessModuleConfig } from "./module-types.ts";

export interface WorkerProcessConfig extends ProcessModuleConfig {
  runId: string;
}

export interface WorkerBatch {
  batchId: number;
  config: WorkerProcessConfig;
  modules: ModuleInput[];
}

export interface WorkerProgressPayload {
  batchId: number;
  fromCache?: boolean;
  moduleId: string;
  status: string;
}

export interface BatchErrorInfo {
  error: string;
  moduleId: string;
  phase: string;
  stack?: string;
}

export interface BatchCompletePayload {
  batchId: number;
  durationMs: number;
  errors: BatchErrorInfo[];
  processedAt: string;
  results: ModuleResult[];
}

export type WorkerMessage =
  | { payload: BatchCompletePayload; type: "complete" }
  | { payload: WorkerBatch; type: "batch" }
  | { payload: WorkerProgressPayload; type: "progress" }
  | { payload: { error: string; stack?: string }; type: "error" }
  | { payload: { pid: number }; type: "ready" }
  | { payload?: undefined; type: "shutdown" };

export interface ProgressEvent {
  batchId?: number;
  completed?: number;
  durationMs?: number;
  fromCache?: boolean;
  moduleId?: string;
  status?: string;
  total?: number;
  type: "batch-complete" | "module";
  workerId?: number;
}

export function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }
  return value.type === "batch"
    || value.type === "complete"
    || value.type === "error"
    || value.type === "progress"
    || value.type === "ready"
    || value.type === "shutdown";
}
