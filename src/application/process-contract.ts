import type { AgentRunAgent } from "./runtime-contract.ts";

/** Process-definition, startup, and collaborator facts used by process-aware callers. */
export interface ProcessDiagnostic {
  file: string;
  line: number;
  column: number;
  invalidValue: unknown;
  rule: string;
  consequence: string;
  correction?: string;
}

export interface ProcessColumnView {
  id: string;
  name: string;
  watchingAgentId: string | null;
  frameworkOwned: boolean;
  taskCreationAllowed: boolean;
}

export interface ProcessBoardView {
  id: string;
  name: string;
  guidance: string;
  columns: ProcessColumnView[];
}

export interface BoardSummaryColumnView {
  id: string;
  name: string;
  watchingAgent: (Pick<AgentRunAgent, "id" | "name" | "summary"> & { token: string }) | null;
  frameworkOwned: boolean;
  taskCreationAllowed: boolean;
  taskCount: number;
}

export interface BoardSummaryView {
  id: string;
  name: string;
  columns: BoardSummaryColumnView[];
}

export interface ProcessDefinitionImpact {
  previousVersion: string;
  currentVersion: string;
  unmappedTasks: Array<{
    taskId: string;
    title: string;
    boardId: string;
    boardName: string;
    columnId: string;
    columnName: string;
  }>;
  staleActivations: Array<{
    activationId: string;
    taskId: string;
    targetAgentId: string;
    priorStatus: "queued" | "failed";
    targetAvailable: boolean;
    taskMapped: boolean;
  }>;
}

export interface CollaboratorView {
  id: string;
  name: string;
  summary: string;
}

export interface PausedStartup {
  mode: "paused";
  processName: string;
  processDefinitionVersion: string;
  automation: { state: "paused"; attemptsMayStart: false };
  boards: ProcessBoardView[];
  processImpact?: ProcessDefinitionImpact;
}

export interface ConfigurationErrorStartup {
  mode: "configuration-error";
  diagnostics: ProcessDiagnostic[];
  automation: { state: "blocked"; attemptsMayStart: false };
}

export type StartupView = PausedStartup | ConfigurationErrorStartup;

export type ProcessValidationResult =
  | { valid: true; processDefinitionVersion: string }
  | { valid: false; diagnostics: ProcessDiagnostic[] };

export type BoardSummariesQueryResult =
  | { available: true; boards: BoardSummaryView[] }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

export type CollaboratorsQueryResult =
  | { available: true; collaborators: CollaboratorView[] }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };
