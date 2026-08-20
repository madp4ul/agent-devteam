import type { ActivationRecoveryAction, ActivationView } from "./automation-contract.ts";
import type { ProcessBoardView, ProcessColumnView, ProcessDiagnostic } from "./process-contract.ts";
import type { ActivationStartupFailureView, AgentExecutionProfile } from "./runtime-contract.ts";

/** Task state, projections, relationships, workspaces, commands, and results. */
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
    | "activation.dismissed"
    | "attempt.started"
    | "attempt.completed"
    | "automation.suspended"
    | "automation.resumed"
    | "conversation.continued"
    | "task.archived"
    | "task.unarchived";
  actor: Actor | { kind: "framework"; id: "coordination" };
  occurredAt: string;
  details: Record<string, string>;
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
  currentActivation: ({
    id: string;
    targetAgentId: string;
    state: "queued" | "running" | "failed" | "interrupted";
  } & AgentExecutionProfile) | null;
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
  recovery?: {
    kind: "technical-failure" | "permission-block";
    summary: string;
    actions: ActivationRecoveryAction[];
    explanation?: string;
  };
}

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

export type BoardsQueryResult =
  | { available: true; boards: BoardView[] }
  | { available: false; diagnostics: ProcessDiagnostic[] };

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
  | { accepted: false; reason: "not-found" | "already-archived" | "archive-in-progress" | "not-completed" | "activation-work-pending" | "automation-suspended" | "workspace-dirty" | "workspace-commit-not-durable" | "workspace-registration-invalid" | "workspace-ownership-untrusted" | "workspace-locked" | "workspace-removal-failed" | "workspace-cleanup-failed" | "runtime-unavailable" }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

export type UnarchiveTaskResult =
  | { accepted: true; task: TaskView }
  | { accepted: false; reason: "not-found" | "not-archived" }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

export type ArchiveCompletedTasksResult =
  | {
      accepted: true;
      archivedTaskIds: string[];
      rejected: Array<{ taskId: string; reason: Exclude<ArchiveTaskResult, { accepted: true }>["reason"] }>;
    }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

export type BoardMutationResult =
  | { accepted: true; task: TaskView }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { accepted: false; reason: "not-found" | "invalid-destination" | "completion-is-not-starting-column" | "invalid-starting-ref" | "archived-task" | "unmapped-task-user-only" | "empty-title" | "empty-description" }
  | { accepted: false; reason: "revision-conflict"; currentTask: TaskView };

export type MoveTaskResult =
  | { accepted: true; task: TaskView; transition: { taskId: string; fromColumnId: string; toColumnId: string } }
  | Exclude<BoardMutationResult, { accepted: true }>;

export type InertMoveTaskResult = {
  accepted: true;
  outcome: "already-in-column";
  task: TaskView;
  transition: { taskId: string; fromColumnId: string; toColumnId: string };
};

export type TaskRelationshipMutationResult =
  | { accepted: true; relationship: TaskRelationshipView; sourceTask: TaskView; targetTask: TaskView }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { accepted: false; reason: "not-found" | "archived-task" | "self-relationship" | "duplicate-relationship" };

export type RemoveTaskRelationshipResult =
  | { accepted: true; relationship: TaskRelationshipView; sourceTask: TaskView; targetTask: TaskView; clearedFinalBlocker: boolean }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { accepted: false; reason: "not-found" | "archived-task" | "relationship-conflict" };

export type AddTaskCommentResult =
  | { accepted: true; task: TaskView; comment: TaskCommentView }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { accepted: false; reason: "not-found" | "archived-task" | "empty-comment" };

export type MarkUserMentionAddressedResult =
  | { accepted: true; attentionReasonId: string; resolvedAt: string }
  | { accepted: false; reason: "not-found" | "wrong-reason-type" | "already-resolved" }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };
