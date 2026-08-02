export interface StartApplicationOptions {
  processDefinitionPath: string;
  databasePath: string;
  runtimeDispatch?: RuntimeDispatchOptions;
}

export interface RuntimeDispatchOptions {
  projectRepositoryPath: string;
  taskWorkspaceRoot: string;
  agentRuntime: AgentRuntime;
}

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
  watchingAgent: Pick<AgentRunAgent, "id" | "name" | "summary"> | null;
  frameworkOwned: boolean;
  taskCount: number;
}

export interface BoardSummaryView {
  id: string;
  name: string;
  columns: BoardSummaryColumnView[];
}

export interface Actor {
  kind: "user" | "agent";
  id: string;
}

export interface TaskActivityView {
  id: string;
  type:
    | "task.created"
    | "task.moved"
    | "activation.created"
    | "attempt.started"
    | "attempt.completed";
  actor: Actor | { kind: "framework"; id: "coordination" };
  occurredAt: string;
  details: Record<string, string>;
}

export interface ActivationReasonView {
  type: "column-entry";
  sourceEventId: string;
}

export interface AttemptView {
  id: string;
  status: "running" | "completed" | "failed";
  workspacePath: string;
  startedAt: string;
  completedAt: string | null;
  outcome: AgentRunOutcome | null;
  threadId: string | null;
}

export interface ActivationView {
  id: string;
  targetAgentId: string;
  status: "queued" | "running" | "completed" | "failed";
  reason: ActivationReasonView;
  attempts: AttemptView[];
}

export interface AgentRunAgent {
  id: string;
  name: string;
  role: string;
  summary: string;
  instructions: string;
}

export interface TaskWorkspaceView {
  path: string;
  startingRef: string;
  commit: string;
}

export interface AgentRunRequest {
  activationId: string;
  agent: AgentRunAgent;
  process: {
    name: string;
    guidance: string;
    definitionVersion: string;
  };
  board: ProcessBoardView;
  collaborators: Array<Pick<AgentRunAgent, "id" | "name" | "role" | "summary">>;
  reason: ActivationReasonView;
  sourceEvent: TaskActivityView;
  task: TaskView;
  workspace: TaskWorkspaceView;
  attempt: AttemptContextView;
}

export interface AgentRunOutcome {
  status: "completed" | "failed";
  summary: string;
  threadId?: string;
}

export interface AttemptContextView {
  number: number;
  precedingOutcome: AgentRunOutcome | null;
  thread: "fresh";
  continuationMessage: string | null;
}

export interface TaskCommentView {
  id: string;
  body: string;
  actor: Actor;
  occurredAt: string;
}

export interface TaskRelationshipView {
  id: string;
  type: "parent-child" | "dependency";
  sourceTaskId: string;
  targetTaskId: string;
}

export interface TaskOverviewView {
  id: string;
  title: string;
  boardId: string;
  column: { id: string; name: string };
  revision: number;
  blocking: { blocked: boolean; blockerTaskIds: string[] };
  relationships: TaskRelationshipView[];
  run: {
    status: "idle" | "queued" | "running" | "failed";
    activeAgentId: string | null;
    queuedActivationCount: number;
    failedActivationCount: number;
  };
}

export interface TaskOverviewsQuery {
  boardId: string;
  columnIds: string[];
  pageSize?: number;
  cursor?: string;
}

export interface TaskInspectionView {
  id: string;
  title: string;
  description: string;
  boardId: string;
  column: { id: string; name: string };
  revision: number;
  comments: TaskCommentView[];
  relationships: TaskRelationshipView[];
  blocking: TaskOverviewView["blocking"];
  run: TaskOverviewView["run"];
  unresolvedAttention: TaskAttentionView[];
  onDemand: { activity: true; attachments: true };
}

export interface TaskAttentionView {
  id: string;
  type: "user-mention" | "failed-run";
}

export interface TaskAttachmentView {
  id: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
}

export interface CollaboratorView {
  id: string;
  name: string;
  summary: string;
}

export interface AgentRuntime {
  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome>;
}

export interface AgentRunLifecycle {
  started(threadId?: string): void;
}

export interface TaskView {
  id: string;
  title: string;
  description: string;
  boardId: string;
  columnId: string;
  revision: number;
  comments: TaskCommentView[];
  relationships: TaskRelationshipView[];
  activity: TaskActivityView[];
  activations: ActivationView[];
}

export interface BoardColumnView extends ProcessColumnView {
  tasks: TaskView[];
}

export interface BoardView extends Omit<ProcessBoardView, "columns"> {
  columns: BoardColumnView[];
}

export interface PausedStartup {
  mode: "paused";
  processName: string;
  processDefinitionVersion: string;
  automation: {
    state: "paused";
    attemptsMayStart: false;
  };
  boards: ProcessBoardView[];
}

export interface ConfigurationErrorStartup {
  mode: "configuration-error";
  diagnostics: ProcessDiagnostic[];
  automation: {
    state: "blocked";
    attemptsMayStart: false;
  };
}

export type StartupView = PausedStartup | ConfigurationErrorStartup;

export type ProcessValidationResult =
  | { valid: true; processDefinitionVersion: string }
  | { valid: false; diagnostics: ProcessDiagnostic[] };

export type AutomationView =
  | { state: "paused"; attemptsMayStart: false }
  | { state: "running"; attemptsMayStart: true }
  | { state: "blocked"; attemptsMayStart: false };

export type ResumeAutomationResult =
  | { accepted: true; automation: Extract<AutomationView, { state: "running" }> }
  | {
      accepted: false;
      reason: "configuration-error";
      diagnostics: ProcessDiagnostic[];
    }
  | { accepted: false; reason: "runtime-unavailable" }
  | { accepted: false; reason: "runtime-start-failed"; diagnostic: string };

export type BoardsQueryResult =
  | { available: true; boards: BoardView[] }
  | { available: false; diagnostics: ProcessDiagnostic[] };

export type BoardSummariesQueryResult =
  | { available: true; boards: BoardSummaryView[] }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

export type TaskQueryResult =
  | { available: true; task: TaskView; board: BoardView }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };

export type TaskOverviewsQueryResult =
  | { available: true; tasks: TaskOverviewView[]; nextCursor: string | null }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | {
      available: false;
      reason:
        | "board-not-found"
        | "columns-required"
        | "duplicate-column"
        | "invalid-page-size"
        | "invalid-cursor";
    }
  | { available: false; reason: "column-not-found"; columnId: string };

export type TaskInspectionQueryResult =
  | { available: true; task: TaskInspectionView }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };

export type TaskActivityQueryResult =
  | { available: true; activity: TaskActivityView[] }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };

export type TaskAttachmentsQueryResult =
  | { available: true; attachments: TaskAttachmentView[] }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };

export type CollaboratorsQueryResult =
  | { available: true; collaborators: CollaboratorView[] }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

export interface CreateTaskCommand {
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  actor: Actor;
  idempotencyKey: string;
}

export interface MoveTaskCommand {
  taskId: string;
  destinationColumnId: string;
  expectedRevision: number;
  actor: Actor;
  idempotencyKey: string;
}

export interface AddTaskCommentCommand {
  taskId: string;
  body: string;
  actor: Actor;
  idempotencyKey: string;
}

export type BoardMutationResult =
  | { accepted: true; task: TaskView }
  | {
      accepted: false;
      reason: "configuration-error";
      diagnostics: ProcessDiagnostic[];
    }
  | { accepted: false; reason: "not-found" | "invalid-destination" }
  | { accepted: false; reason: "revision-conflict"; currentTask: TaskView };

export type AddTaskCommentResult =
  | { accepted: true; task: TaskView; comment: TaskCommentView }
  | {
      accepted: false;
      reason: "configuration-error";
      diagnostics: ProcessDiagnostic[];
    }
  | { accepted: false; reason: "not-found" | "empty-comment" };
