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

export interface AttemptTokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
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
  resumeThreadId?: string;
  attempt: AttemptContextView;
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
  | { available: true; threadId: string; items: AttemptTranscriptItem[]; usage?: AttemptTokenUsage }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" | "unavailable" };
