import type { ActivationRecoveryAction, ActivationView } from "./automation-contract.ts";
import type { TaskHistoryPage } from "./history-contract.ts";
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
    | "comment.pinned"
    | "comment.unpinned"
    | "task.moved"
    | "relationship.created"
    | "relationship.removed"
    | "relationship.satisfied"
    | "relationship.resume-agent-changed"
    | "attention.created"
    | "attention.resolved"
    | "activation.created"
    | "activation.dismissed"
    | "attempt.started"
    | "attempt.completed"
    | "automation.suspended"
    | "automation.resumed"
    | "conversation.continued"
    | "conversation.retired"
    | "task.archived"
    | "task.unarchived";
  actor: Actor | { kind: "framework"; id: "coordination" };
  occurredAt: string;
  details: Record<string, string>;
}

export interface TaskCommentView {
  pinned?: true;
  id: string;
  body: string;
  actor: Actor;
  occurredAt: string;
  attemptId?: string;
  originTask?: { id: string; title: string };
}

export interface TaskRelationshipView {
  id: string;
  type: "parent-child" | "dependency";
  sourceTaskId: string;
  targetTaskId: string;
  resumeAgentId: string | null;
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
  waitingOn: { taskIds: string[] };
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
  history: TaskHistoryPage;
  pinnedComments: TaskCommentView[];
  id: string;
  title: string;
  description: string;
  boardId: string;
  column: { id: string; name: string };
  revision: number;
  archived?: true;
  relationships: (TaskRelationshipView & { sourceTaskTitle: string; targetTaskTitle: string })[];
  participants: TaskParticipantView[];
  waitingOn: TaskOverviewView["waitingOn"];
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

export interface TaskParticipantView {
  taskId: string;
  agentId: string;
  name: string;
  role: string;
  summary: string;
  watchedColumns: { id: string; name: string }[];
  execution: {
    running: boolean;
    queuedActivationCount: number;
    failedActivationCount: number;
    automationSuspended: boolean;
  };
}

export type TaskParticipantsQueryResult =
  | { available: true; participants: TaskParticipantView[] }
  | { available: false; reason: "not-found" }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

export interface UserTaskInspectionView extends Omit<TaskInspectionView, "history"> {
  comments: TaskCommentView[];
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
  | { available: true; tasks: TaskOverviewView[]; nextCursor?: string | null }
  | { available: false; reason: "invalid-page-size" | "invalid-cursor" }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

export type TaskInspectionQueryResult =
  | { available: true; task: TaskInspectionView }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" | "invalid-target-words" };

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
  | { available: true; attachments: TaskAttachmentView[]; nextCursor?: string | null }
  | { available: false; reason: "invalid-page-size" | "invalid-cursor" }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };

export interface CreateTaskCommand {
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  actor: Actor;
  attemptId?: string;
  /** Trusted caller scope, never a model-selected subject. */
  callerTaskId?: string;
  idempotencyKey: string;
}

export interface CreateChildTaskCommand extends CreateTaskCommand {
  parentTaskId: string;
  resumeAgentId: string;
  startingRef?: string;
  attemptId?: string;
}

export interface MoveTaskCommand {
  taskId: string;
  destinationColumnId: string;
  expectedRevision: number;
  actor: Actor;
  attemptId?: string;
  callerTaskId?: string;
  idempotencyKey: string;
}

export interface CreateTaskRelationshipCommand {
  type: "parent-child" | "dependency";
  sourceTaskId: string;
  targetTaskId: string;
  resumeAgentId: string;
  actor: Actor;
  attemptId?: string;
  callerTaskId?: string;
  idempotencyKey: string;
}

export interface RemoveTaskRelationshipCommand {
  taskId: string;
  relationshipId: string;
  actor: Actor;
  attemptId?: string;
  callerTaskId?: string;
  idempotencyKey: string;
}

export interface EditTaskRelationshipResumeAgentCommand {
  taskId: string;
  relationshipId: string;
  resumeAgentId: string;
  actor: Actor;
  attemptId?: string;
  callerTaskId?: string;
  idempotencyKey: string;
}

export interface EditTaskCommand {
  taskId: string;
  title?: string;
  description?: string;
  expectedRevision: number;
  actor: Actor;
  attemptId?: string;
  callerTaskId?: string;
  idempotencyKey: string;
}

export interface AddTaskCommentCommand {
  pinned?: boolean;
  taskId: string;
  body: string;
  actor: Actor;
  attemptId?: string;
  /** Authenticated scope, not an agent-selected destination or author field. */
  callerTaskId?: string;
  idempotencyKey: string;
}

export interface MarkUserMentionAddressedCommand {
  attentionReasonId: string;
  actor: Actor & { kind: "user" };
  idempotencyKey: string;
}

export interface SetTaskCommentPinCommand {
  taskId: string;
  commentId: string;
  pinned: boolean;
  actor: Actor;
  attemptId?: string;
  callerTaskId?: string;
  idempotencyKey: string;
}

export type SetTaskCommentPinResult =
  | { accepted: true; taskId: string; commentId: string; pinned: boolean; changed: boolean }
  | { accepted: false; reason: "not-found" | "archived-task" | "comment-not-found" | "idempotency-conflict" }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

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
  | { accepted: false; reason: "not-found" | "already-archived" | "archive-in-progress" | "not-completed" | "waiting-relationships" | "activation-work-pending" | "automation-suspended" | "workspace-dirty" | "workspace-commit-not-durable" | "workspace-registration-invalid" | "workspace-ownership-untrusted" | "workspace-locked" | "workspace-removal-failed" | "workspace-cleanup-failed" | "runtime-unavailable" }
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
  | { accepted: false; reason: "not-found" | "invalid-destination" | "completion-is-not-starting-column" | "invalid-starting-ref" | "archived-task" | "unmapped-task-user-only" | "empty-title" | "empty-description" | "resume-agent-not-found" | "no-changes" | "idempotency-conflict" }
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
  | { accepted: false; reason: "not-found" | "archived-task" | "self-relationship" | "duplicate-relationship" | "resume-agent-not-found" | "idempotency-conflict" };

export type EditTaskRelationshipResumeAgentResult =
  | { accepted: true; relationship: TaskRelationshipView; sourceTask: TaskView; targetTask: TaskView }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { accepted: false; reason: "not-found" | "archived-task" | "relationship-conflict" | "relationship-satisfied" | "resume-agent-not-found" | "idempotency-conflict" };

export type RemoveTaskRelationshipResult =
  | { accepted: true; relationship: TaskRelationshipView; sourceTask: TaskView; targetTask: TaskView }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { accepted: false; reason: "not-found" | "archived-task" | "relationship-conflict" | "idempotency-conflict" };

export type AddTaskCommentResult =
  | { accepted: true; task: TaskView; comment: TaskCommentView }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { accepted: false; reason: "not-found" | "archived-task" | "empty-comment" | "idempotency-conflict" };

export type MarkUserMentionAddressedResult =
  | { accepted: true; attentionReasonId: string; resolvedAt: string }
  | { accepted: false; reason: "not-found" | "wrong-reason-type" | "already-resolved" }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };
