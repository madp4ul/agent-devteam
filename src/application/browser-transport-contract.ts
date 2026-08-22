/** Shared serialized payload facts for the local browser and host adapters. */
export interface IdempotentBrowserRequest {
  idempotencyKey: string;
}

export type EmptyBrowserRequest = Record<string, never>;

export interface CreateTaskRequest extends IdempotentBrowserRequest {
  boardId: string;
  columnId: string;
  title: string;
  description: string;
}

export interface CreateChildTaskRequest extends CreateTaskRequest {
  startingRef?: string;
}

export interface EditTaskRequest extends IdempotentBrowserRequest {
  title: string;
  description: string;
  expectedRevision: number;
}

export interface MoveTaskRequest extends IdempotentBrowserRequest {
  destinationColumnId: string;
  expectedRevision: number;
}

export interface CreateTaskRelationshipRequest extends IdempotentBrowserRequest {
  type: "parent-child" | "dependency";
  targetTaskId: string;
}

export interface AddTaskCommentRequest extends IdempotentBrowserRequest {
  body: string;
}

export interface ContinueInterruptedTaskRequest extends IdempotentBrowserRequest {
  message: string;
}

export interface ContinueAgentConversationRequest extends IdempotentBrowserRequest {
  body: string;
}

export interface RetireAgentConversationRequest extends IdempotentBrowserRequest {
  reason: string;
}

export interface ArchiveTaskRequest extends IdempotentBrowserRequest {
  discardWorkspaceChanges?: true;
}

export interface ArchiveCompletedTasksRequest extends IdempotentBrowserRequest {
  boardId: string;
}

export interface ActivationRecoveryRequest extends IdempotentBrowserRequest {
  message?: string;
}

export type UpdateNotificationPolicyRequest = import("./notification-contract.ts")
  .UpdateNotificationPolicyCommand["change"];

export type {
  UserBoardColumnView,
  UserBoardProjection,
  UserBoardView,
} from "./user-board-contract.ts";
export type {
  UserRelatedTaskView,
  UserTimelineRelatedTaskView,
  UserTaskDetailQueryResult,
  UserTaskDetailView,
} from "./user-task-detail-contract.ts";
export type {
  ArchiveCompletedTasksResult,
  BoardMutationResult,
  BoardColumnView,
  TaskActivityView,
  TaskAttentionView,
  TaskCommentView,
  TaskOverviewView,
  TaskRelationshipView,
  TaskWorkspaceView,
  TaskWorkspaceGitStateView,
  UserTaskInspectionView,
} from "./task-contract.ts";
export type {
  ActiveRunView,
  ActivationView,
  ActivationRecoveryAction,
  AutomationView,
} from "./automation-contract.ts";
export type {
  AgentConversationIndexEntry,
  AgentConversationQueryResult,
  AgentConversationView,
  ContinueAgentConversationResult,
  RetireAgentConversationResult,
} from "./conversation-contract.ts";
export type {
  ActivationStartupFailureView,
  AttemptTokenUsage,
  AttemptView,
  AttemptTranscriptQueryResult,
} from "./runtime-contract.ts";
export type {
  CollaboratorView,
  ProcessColumnView,
} from "./process-contract.ts";
export type {
  NotificationOccurrenceBatch,
  NotificationPolicyView,
  UpdateNotificationPolicyCommand,
} from "./notification-contract.ts";
