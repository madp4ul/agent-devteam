import type { ModelReasoningEffort } from "@openai/codex-sdk";

export interface StartApplicationOptions {
  processDefinitionPath: string;
  databasePath: string;
  runtimeDispatch?: RuntimeDispatchOptions;
  transcriptAccess?: AttemptTranscriptAccess;
  runtimeDiagnostic?(diagnostic: RuntimeStartupDiagnostic): void;
  automationClock?: AutomationClock;
}

export interface AutomationClock {
  now(): Date;
  waitUntil(instant: string): Promise<void>;
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

export interface Actor {
  kind: "user" | "agent";
  id: string;
}

export interface TaskActivityView {
  id: string;
  type:
    | "task.created"
    | "task.edited"
    | "task.moved"
    | "relationship.created"
    | "relationship.removed"
    | "relationship.satisfied"
    | "attention.created"
    | "attention.resolved"
    | "activation.created"
    | "attempt.started"
    | "attempt.completed"
    | "automation.suspended"
    | "automation.resumed"
    | "task.archived"
    | "task.unarchived";
  actor: Actor | { kind: "framework"; id: "coordination" };
  occurredAt: string;
  details: Record<string, string>;
}

export interface ActivationReasonView {
  type: "column-entry" | "agent-mention" | "blockers-cleared";
  sourceEventId: string;
}

export interface AgentExecutionProfile {
  model: string | null;
  reasoningEffort: ModelReasoningEffort | null;
}

export interface AttemptView extends AgentExecutionProfile {
  id: string;
  status: "running" | "completed" | "failed" | "interrupted";
  workspacePath: string;
  startedAt: string;
  completedAt: string | null;
  outcome: AttemptOutcomeView | null;
  threadId: string | null;
}

export type RuntimeStartupBoundary =
  | "repository-access"
  | "starting-ref-resolution"
  | "workspace-preparation"
  | "worktree-registration"
  | "workspace-state-persistence";

export interface ActivationStartupFailureView {
  occurredAt: string;
  boundary: RuntimeStartupBoundary;
  diagnostic: string;
  resolvedAt: string | null;
}

export interface RuntimeStartupDiagnostic extends ActivationStartupFailureView {
  taskId: string;
  activationId: string;
}

export type AttemptTranscriptItem =
  | { id?: string; kind: "message"; role: "agent"; text: string }
  | {
      id?: string;
      kind: "tool";
      name: string;
      status: string;
      summary: string;
      output?: string;
    }
  | { id?: string; kind: "diagnostic"; text: string };

export interface ActivationView extends AgentExecutionProfile {
  id: string;
  targetAgentId: string;
  status: "queued" | "running" | "completed" | "failed" | "dismissed";
  reason: ActivationReasonView;
  attempts: AttemptView[];
  startupFailure: ActivationStartupFailureView | null;
  recovery:
    | { state: "scheduled"; nextAttempt: number; dueAt: string }
    | { state: "awaiting-retry" | "permission-blocked"; summary: string }
    | null;
  stale: boolean;
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

export interface AgentRunAgent {
  id: string;
  name: string;
  role: string;
  summary: string;
  instructions: string;
  model?: string;
  reasoningEffort?: ModelReasoningEffort;
}

export interface TaskWorkspaceView {
  path: string;
  startingRef: string;
  commit: string;
}

export interface TaskWorkspaceGitStateView {
  head:
    | { kind: "branch"; name: string; shortHash: string }
    | { kind: "detached"; shortHash: string };
  history:
    | { kind: "progress"; commitsSinceTaskStart: number }
    | { kind: "diverged" };
  changes: {
    additions: number;
    deletions: number;
    stagedFiles: number;
    unstagedFiles: number;
    untrackedFiles: number;
  };
}

export interface AgentRunRequest {
  activationId: string;
  attemptId: string;
  agent: AgentRunAgent;
  process: {
    name: string;
    guidance: string;
    definitionVersion: string;
  };
  board: ProcessBoardView;
  collaborators: Array<Pick<AgentRunAgent, "id" | "name" | "role" | "summary">>;
  reason: ActivationReasonView;
  sourceEvent: TaskActivityView | TaskCommentView;
  task: TaskView;
  workspace: TaskWorkspaceView;
  resumeThreadId?: string;
  attempt: AttemptContextView;
}

export interface AgentRunOutcome {
  status: "completed" | "failed" | "permission-blocked";
  summary: string;
  threadId?: string;
}

export type AttemptOutcomeView = AgentRunOutcome | {
  status: "user-interrupted";
  summary: string;
  threadId?: string;
};

export interface AttemptContextView {
  number: number;
  precedingOutcome: AttemptOutcomeView | null;
  thread: "fresh" | "resumed" | "replaced";
  continuationMessage: string | null;
  fullCompositionReason?: "process-rebased";
}

export interface TaskCommentView {
  id: string;
  body: string;
  actor: Actor;
  occurredAt: string;
  attemptId?: string;
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
  archived?: true;
  blocking: { blocked: boolean; blockerTaskIds: string[] };
  relationships: TaskRelationshipView[];
  unresolvedAttention: TaskAttentionView[];
  automationSuspended: boolean;
  startupFailure?: ActivationStartupFailureView & { activationId: string };
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
  order?: "task-sequence" | "recent-column-entry";
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
  archived?: true;
  comments: TaskCommentView[];
  relationships: TaskRelationshipView[];
  blocking: TaskOverviewView["blocking"];
  run: TaskOverviewView["run"];
  unresolvedAttention: TaskAttentionView[];
  currentActivation: ({ targetAgentId: string } & AgentExecutionProfile) | null;
  automationSuspended: boolean;
  onDemand: { activity: true; attachments: true };
}

export interface UserTaskInspectionView extends TaskInspectionView {
  workspace: TaskWorkspaceView | null;
}

export interface TaskAttentionView {
  id: string;
  type: "user-mention" | "failed-run" | "automation-suspended";
  sourceEventId: string | null;
  createdAt: string;
  recovery?:
    | {
        kind: "technical-failure" | "permission-block";
        summary: string;
        actions: ActivationRecoveryAction[];
        explanation?: string;
      }
    ;
}

export type ActivationRecoveryAction = "retry" | "dismiss" | "continue";

export interface NeedsAttentionTaskView {
  task: {
    id: string;
    title: string;
    boardId: string;
    boardName: string;
    columnId: string;
  };
  reasons: TaskAttentionView[];
}

export type NeedsAttentionQueryResult =
  | { available: true; tasks: NeedsAttentionTaskView[] }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

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
  run(
    request: AgentRunRequest,
    lifecycle: AgentRunLifecycle,
    signal?: AbortSignal,
  ): Promise<AgentRunOutcome>;
}

export interface AttemptTranscriptAccess {
  read(attemptId: string): Promise<AttemptTranscriptItem[] | null>;
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
  archived?: true;
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
  processImpact?: ProcessDefinitionImpact;
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
  | { state: "pausing"; attemptsMayStart: false }
  | { state: "running"; attemptsMayStart: true }
  | { state: "blocked"; attemptsMayStart: false };

export interface ActiveRunView {
  attemptId: string;
  taskId: string;
  taskTitle: string;
  boardId: string;
  boardName: string;
  columnId: string;
  columnName: string;
  agentId: string;
  status: "running" | "interrupting";
  startedAt: string;
}

export type ResumeAutomationResult =
  | { accepted: true; automation: Extract<AutomationView, { state: "running" }> }
  | {
      accepted: false;
      reason: "configuration-error";
      diagnostics: ProcessDiagnostic[];
    }
  | { accepted: false; reason: "runtime-unavailable" }
  | { accepted: false; reason: "process-change-approval-required" }
  | { accepted: false; reason: "pause-draining" }
  | { accepted: false; reason: "runtime-start-failed"; diagnostic: string };

export interface DismissStaleActivationCommand {
  activationId: string;
  actor: Actor & { kind: "user" };
  idempotencyKey: string;
}

export type DismissStaleActivationResult =
  | { accepted: true; activationId: string }
  | { accepted: false; reason: "not-found" | "not-stale" };

export type PauseAutomationResult = {
  accepted: true;
  automation: Extract<AutomationView, { state: "pausing" | "paused" }>;
};

export interface InterruptTaskCommand {
  taskId: string;
  actor: Actor & { kind: "user" };
  idempotencyKey: string;
}

export type InterruptTaskResult =
  | { accepted: true; state: "interrupting" | "interrupted"; confirmed: Promise<void> }
  | { accepted: false; reason: "not-found" | "not-running" | "already-interrupting" };

export interface ContinueInterruptedTaskCommand {
  taskId: string;
  message: string;
  actor: Actor & { kind: "user" };
  idempotencyKey: string;
}

export type ContinueInterruptedTaskResult =
  | { accepted: true; activationId: string }
  | { accepted: false; reason: "not-found" | "not-suspended" };

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

export type ArchivedTaskOverviewsQueryResult =
  | { available: true; tasks: TaskOverviewView[] }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

export type TaskInspectionQueryResult =
  | { available: true; task: TaskInspectionView }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };

export type UserTaskInspectionQueryResult =
  | { available: true; task: UserTaskInspectionView }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };

export type TaskWorkspaceGitStateQueryResult =
  | { available: true; state: TaskWorkspaceGitStateView }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" | "workspace-not-provisioned" | "git-status-unavailable" };

export type TaskActivityQueryResult =
  | { available: true; activity: TaskActivityView[] }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };

export type TaskAttachmentsQueryResult =
  | { available: true; attachments: TaskAttachmentView[] }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };

export type AttemptTranscriptQueryResult =
  | { available: true; threadId: string; items: AttemptTranscriptItem[] }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" | "unavailable" };

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

export interface CreateChildTaskCommand extends CreateTaskCommand {
  parentTaskId: string;
  startingRef?: string;
  attemptId?: string;
}

export interface MoveTaskCommand {
  taskId: string;
  destinationColumnId: string;
  expectedRevision: number;
  actor: Actor;
  attemptId?: string;
  idempotencyKey: string;
}

export interface CreateTaskRelationshipCommand {
  type: "parent-child" | "dependency";
  sourceTaskId: string;
  targetTaskId: string;
  actor: Actor;
  attemptId?: string;
  idempotencyKey: string;
}

export interface RemoveTaskRelationshipCommand {
  taskId: string;
  relationshipId: string;
  actor: Actor & { kind: "user" };
  idempotencyKey: string;
}

export interface EditTaskCommand {
  taskId: string;
  title: string;
  description: string;
  expectedRevision: number;
  actor: Actor;
  idempotencyKey: string;
}

export interface AddTaskCommentCommand {
  taskId: string;
  body: string;
  actor: Actor;
  attemptId?: string;
  idempotencyKey: string;
}

export interface MarkUserMentionAddressedCommand {
  attentionReasonId: string;
  actor: Actor & { kind: "user" };
  idempotencyKey: string;
}

export interface ArchiveTaskCommand {
  taskId: string;
  discardWorkspaceChanges?: true;
  actor: Actor & { kind: "user" };
  idempotencyKey: string;
}

export interface UnarchiveTaskCommand extends ArchiveTaskCommand {}

export interface ArchiveCompletedTasksCommand {
  boardId: string;
  actor: Actor & { kind: "user" };
  idempotencyKey: string;
}

export type ArchiveTaskResult =
  | { accepted: true; task: TaskView }
  | { accepted: false; reason: "not-found" | "already-archived" | "archive-in-progress" | "not-completed" | "activation-work-pending" | "automation-suspended" | "workspace-dirty" | "workspace-commit-not-durable" | "workspace-cleanup-failed" | "runtime-unavailable" }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

export type UnarchiveTaskResult =
  | { accepted: true; task: TaskView }
  | { accepted: false; reason: "not-found" | "not-archived" }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

export type ArchiveCompletedTasksResult =
  | {
      accepted: true;
      archivedTaskIds: string[];
      rejected: Array<{ taskId: string; reason: Exclude<ArchiveTaskResult, { accepted: true }>['reason'] }>;
    }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

export interface ActivationRecoveryCommand {
  attentionReasonId: string;
  actor: Actor & { kind: "user" };
  idempotencyKey: string;
}

export interface ContinuePermissionBlockedActivationCommand extends ActivationRecoveryCommand {
  message: string;
}

export type ActivationRecoveryResult =
  | { accepted: true; activationId: string; resolvedAt: string }
  | {
      accepted: false;
      reason: "not-found" | "wrong-recovery-type" | "already-resolved" | "message-required";
    }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

export type BoardMutationResult =
  | { accepted: true; task: TaskView }
  | {
      accepted: false;
      reason: "configuration-error";
      diagnostics: ProcessDiagnostic[];
    }
  | {
      accepted: false;
      reason:
        | "not-found"
        | "invalid-destination"
        | "completion-is-not-starting-column"
        | "invalid-starting-ref"
        | "archived-task"
        | "unmapped-task-user-only"
        | "empty-title"
        | "empty-description";
    }
  | { accepted: false; reason: "revision-conflict"; currentTask: TaskView };

export type MoveTaskResult =
  | {
      accepted: true;
      task: TaskView;
      transition: { taskId: string; fromColumnId: string; toColumnId: string };
    }
  | Exclude<BoardMutationResult, { accepted: true }>;

export type TaskRelationshipMutationResult =
  | { accepted: true; relationship: TaskRelationshipView; sourceTask: TaskView; targetTask: TaskView }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { accepted: false; reason: "not-found" | "archived-task" | "self-relationship" | "duplicate-relationship" };

export type RemoveTaskRelationshipResult =
  | {
      accepted: true;
      relationship: TaskRelationshipView;
      sourceTask: TaskView;
      targetTask: TaskView;
      clearedFinalBlocker: boolean;
    }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { accepted: false; reason: "not-found" | "archived-task" | "relationship-conflict" };

export type AddTaskCommentResult =
  | { accepted: true; task: TaskView; comment: TaskCommentView }
  | {
      accepted: false;
      reason: "configuration-error";
      diagnostics: ProcessDiagnostic[];
    }
  | { accepted: false; reason: "not-found" | "archived-task" | "empty-comment" };

export type MarkUserMentionAddressedResult =
  | { accepted: true; attentionReasonId: string; resolvedAt: string }
  | { accepted: false; reason: "not-found" | "wrong-reason-type" | "already-resolved" }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };
