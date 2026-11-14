/** Compact project-wide menu history. These records never drive execution. */
export interface ActivityMenuEntry {
  id: string;
  kind: "preparation" | "run";
  taskId: string;
  taskTitle: string;
  agentId: string;
  agentName?: string;
  startedAt: string;
  finishedAt: string | null;
  status: "preparing" | "prepared" | "completed" | "failed" | "interrupted";
  summary: string;
}

export interface ActivityMenuHistory { preparations: ActivityMenuEntry[]; runs: ActivityMenuEntry[]; preparationCursor?: number | null }

export interface ActivityMenuOverview {
  revision: string;
  preparations: { active: number; history: number };
  archives: { active: number; history: number };
}

export interface ArchivalMenuTask {
  id: string;
  operationId: string;
  taskId: string;
  title: string;
  state: import("./archival-operation-contract.ts").ArchivalOperationTask["state"];
  updatedAt: string;
  failure?: import("./archival-operation-contract.ts").ArchivalFailure;
}

export interface ArchivalMenuPage {
  entries: ArchivalMenuTask[];
  cursor: number | null;
}
