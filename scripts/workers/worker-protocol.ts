import type { ModuleInput, ModuleResult, ProcessModuleConfig } from "./module-types.ts";

export interface WorkerProcessConfig extends ProcessModuleConfig {
  runId: string;
}

export interface WorkerTask {
  config: WorkerProcessConfig;
  module: ModuleInput;
}

export interface WorkerTaskResult {
  result: ModuleResult;
}

export type WorkerMessage =
  | { payload: WorkerTask; type: "task" }
  | { payload: WorkerTaskResult; type: "result" }
  | { payload: { moduleId: string; status: string }; type: "progress" }
  | { payload: { pid: number }; type: "ready" }
  | { payload?: undefined; type: "shutdown" };

export interface ProgressEvent {
  fromCache?: boolean;
  moduleId: string;
  status: string;
  type: "module";
  workerId: number;
}

export function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }
  return value.type === "task"
    || value.type === "result"
    || value.type === "progress"
    || value.type === "ready"
    || value.type === "shutdown";
}
