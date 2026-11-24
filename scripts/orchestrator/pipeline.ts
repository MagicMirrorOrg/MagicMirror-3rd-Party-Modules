export const PIPELINE_ID = "full-refresh-parallel";

export interface PipelineArtifact {
  id: string;
  path: string;
  schemaId?: string;
}

export interface PipelineStage {
  id: PipelineStageId;
  name: string;
  outputs?: PipelineArtifact[];
}

export type PipelineStageId =
  | "collect-metadata"
  | "parallel-processing"
  | "aggregate-catalogue"
  | "generate-result-markdown";

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  {
    id: "collect-metadata",
    name: "Collect Metadata"
  },
  {
    id: "parallel-processing",
    name: "Parallel module processing"
  },
  {
    id: "aggregate-catalogue",
    name: "Aggregate catalogue outputs",
    outputs: [
      {
        id: "modules-json",
        path: "website/data/modules.json",
        schemaId: "modules.final"
      },
      {
        id: "modules-json-min",
        path: "website/data/modules.min.schema.json",
        schemaId: "modules.min"
      },
      {
        id: "stats-json",
        path: "website/data/stats.json",
        schemaId: "stats"
      }
    ]
  },
  {
    id: "generate-result-markdown",
    name: "Generate result markdown"
  }
];
