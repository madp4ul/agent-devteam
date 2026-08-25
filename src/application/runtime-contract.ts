import type { ModelReasoningEffort } from "@openai/codex-sdk";

import type { AutomationClock, ActivationReasonView } from "./automation-contract.ts";
import type { AgentConversationMessageView } from "./conversation-contract.ts";
import type { ProcessBoardView, ProcessDiagnostic } from "./process-contract.ts";
import type { TaskActivityView, TaskCommentView, TaskView, TaskWorkspaceView } from "./task-contract.ts";

/** Agent-runtime dispatch, lifecycle, transcript, and attempt facts. */
export interface StartApplicationOptions {
  processDefinitionPath: string;
  databasePath: string;
  runtimeDispatch?: RuntimeDispatchOptions;
  transcriptAccess?: AttemptTranscriptAccess;
  runtimeDiagnostic?(diagnostic: RuntimeStartupDiagnostic): void;
  automationClock?: AutomationClock;
}

export interface RuntimeDispatchOptions {
  projectRepositoryPath: string;
  taskWorkspaceRoot: string;
  agentRuntime: AgentRuntime;
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
  threadContinuity?: "replaced";
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

export interface CoordinationTaskIdentity {
  id?: string;
  title?: string;
}

export const coordinationToolNames = [
  "summarize_boards",
  "list_tasks",
  "list_archived_tasks",
  "inspect_task",
  "list_task_activity",
  "list_task_attachments",
  "list_collaborators",
  "inspect_current_task",
  "inspect_operating_context",
  "add_comment",
  "move_current_task",
  "create_child_task",
  "add_dependency",
  "report_permission_block",
] as const;

export type CoordinationToolName = typeof coordinationToolNames[number];

export type CoordinationTranscriptStatus = "running" | "succeeded" | "failed" | "rejected";

export type CoordinationTranscriptDiagnostic =
  | { kind: "rejection"; message: string }
  | { kind: "failure"; message: string };

export interface CoordinationTranscriptEvidence {
  rawStatus?: string;
  arguments?: unknown;
  result?: unknown;
  error?: unknown;
}

export type CoordinationTranscriptPresentation =
  | {
      kind: "coordination-task-move";
      fromColumnId?: string;
      toColumnId?: string;
    }
  | {
      kind: "coordination-comment";
      body?: string;
      commentId?: string;
    }
  | {
      kind: "coordination-child-task";
      task: CoordinationTaskIdentity;
      columnId?: string;
    }
  | {
      kind: "coordination-dependency";
      sourceTask: CoordinationTaskIdentity & { id: string };
      targetTask: CoordinationTaskIdentity;
    }
  | {
      kind: "coordination-permission-block";
      reason?: string;
    }
  | {
      kind: "coordination-inspection";
      scope: "operating-context";
      attemptId: string;
      taskId?: string;
      processName?: string;
      boardId?: string;
      boardName?: string;
      owningAgentName?: string;
    }
  | {
      kind: "coordination-inspection";
      scope: "board-summaries";
      boards: Array<{ id: string; name?: string }>;
    }
  | {
      kind: "coordination-inspection";
      scope: "tasks";
      board?: { id: string; name?: string };
      columns: Array<{ id: string; name?: string }>;
    }
  | {
      kind: "coordination-inspection";
      scope: "archived-tasks";
      taskCount?: number;
    }
  | {
      kind: "coordination-inspection";
      scope: "task" | "task-activity" | "task-attachments";
      taskId?: string;
      taskTitle?: string;
    }
  | {
      kind: "coordination-inspection";
      scope: "collaborators";
      collaboratorCount?: number;
    }
  | {
      kind: "coordination-inspection";
      scope: "current-task";
      taskTitle?: string;
      boardId?: string;
      columnId?: string;
      columnName?: string;
    };

export type AttemptTranscriptItem =
  | { id?: string; kind: "message"; role: "agent"; text: string }
  | {
      id?: string;
      kind: "command";
      command: string;
      status: string;
      output?: string;
    }
  | {
      id?: string;
      kind: "mcp";
      server: string;
      tool: string;
      status: "running" | "succeeded" | "failed" | "rejected";
      rawStatus?: string;
      summary?: string;
      arguments?: unknown;
      result?: unknown;
      error?: unknown;
    }
  | {
      id?: string;
      kind: "coordination";
      tool: CoordinationToolName;
      status: CoordinationTranscriptStatus;
      summary?: string;
      presentation: CoordinationTranscriptPresentation;
      diagnostic?: CoordinationTranscriptDiagnostic;
      evidence: CoordinationTranscriptEvidence;
    }
  | {
      id?: string;
      kind: "tool";
      name: string;
      status: string;
      summary: string;
      output?: string;
    }
  | { id?: string; kind: "diagnostic"; text: string };

export interface AttemptTokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export interface EstimatedTokenCost {
  currency: "USD";
  amount: number;
}

export type TokenCostCategory = "input" | "cachedInput" | "cacheWriteInput" | "output";

export interface TokenCostBreakdown {
  categories: Array<{
    category: TokenCostCategory;
    tokens: number;
    usdPerMillionTokens: number;
  }>;
  reasoningOutputTokens: number;
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

export interface AgentRunRequest {
  activationId: string;
  attemptId: string;
  agent: AgentRunAgent;
  process: { name: string; guidance: string; definitionVersion: string };
  board: ProcessBoardView;
  collaborators: Array<Pick<AgentRunAgent, "id" | "name" | "role" | "summary">>;
  reason: ActivationReasonView;
  sourceEvent: TaskActivityView | TaskCommentView | AgentConversationMessageView;
  task: TaskView;
  workspace: TaskWorkspaceView;
  activationContext: ActivationContextView;
  attachments?: AgentRunAttachment[];
  resumeThreadId?: string;
  attempt: AttemptContextView;
}

export interface AgentRunAttachment {
  id: string;
  messageId: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  path: string;
  currentMessage: boolean;
}

export interface ActivationContextView {
  kind: "initial" | "resumed";
  description?: string;
  comments: TaskCommentView[];
  activity: TaskActivityView[];
  sourceDelivery: "current-context" | "conversation-history" | "activation-only";
  replacementReason?: string;
}

export interface AgentRunOutcome {
  status: "completed" | "failed" | "permission-blocked";
  summary: string;
  threadId?: string;
  threadContinuity?: "replaced";
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

export interface AgentRuntime {
  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle, signal?: AbortSignal): Promise<AgentRunOutcome>;
}

export interface AttemptTranscriptAccess {
  read(attemptId: string): Promise<AttemptTranscriptItem[] | null>;
  readUsage?(attemptId: string): Promise<AttemptTokenUsage | null>;
}

export interface AgentRunLifecycle {
  started(threadId?: string): void;
}

export interface OperatingContextView {
  attemptId: string;
  taskId: string;
  frameworkInstructions: string;
  process: { name: string; guidance: string; definitionVersion: string };
  board: ProcessBoardView;
  owningAgent: AgentRunAgent;
  participants: Array<Pick<AgentRunAgent, "id" | "name" | "role" | "summary">>;
}

export type OperatingContextQueryResult =
  | { available: true; context: OperatingContextView }
  | { available: false; reason: "invalid-attempt-scope" | "configuration-error"; diagnostics?: ProcessDiagnostic[] };

export type AttemptTranscriptQueryResult =
  | { available: true; threadId: string; items: AttemptTranscriptItem[]; usage?: AttemptTokenUsage; costEstimate?: EstimatedTokenCost; costBreakdown?: TokenCostBreakdown }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" | "unavailable" };
