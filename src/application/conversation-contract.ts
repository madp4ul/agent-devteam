import type { ActivationView } from "./automation-contract.ts";
import type { ProcessDiagnostic } from "./process-contract.ts";
import type { AttemptTokenUsage, AttemptTranscriptItem, AttemptView } from "./runtime-contract.ts";
import type { Actor } from "./task-contract.ts";

/** Conversation index, detail, message, transcript, and continuation facts. */
export type AgentConversationTranscriptView =
  | { available: true; items: AttemptTranscriptItem[]; usage?: AttemptTokenUsage }
  | { available: false };

export interface AgentConversationView {
  id: string;
  taskId: string;
  originatingActivationId: string;
  originatingActivation: ActivationView;
  owningAgent: {
    id: string;
    name: string;
    historicalName: string;
    present: boolean;
  };
  currentThreadId: string | null;
  createdAt: string;
  latestActivityAt: string;
  retirement: AgentConversationRetirementView | null;
  replacesConversationId: string | null;
  replacementReason: string | null;
  retirementAvailability:
    | { available: true }
    | { available: false; reason: "already-retired" | "task-archived" | "activation-work-pending" };
  continuation:
    | { available: true }
    | { available: false; reason: "task-archived" | "owning-agent-unavailable" | "thread-unavailable" };
  messages: AgentConversationMessageView[];
  runs: Array<{
    activationId: string;
    sourceMessageId?: string;
    attempt: AttemptView;
    transcript: AgentConversationTranscriptView;
  }>;
}

export type AgentConversationQueryResult =
  | { available: true; conversation: AgentConversationView }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };

export interface AgentConversationIndexEntry {
  id: string;
  owningAgent: AgentConversationView["owningAgent"];
  label: string;
  latestActivityAt: string;
  status: "running" | "needs-attention" | null;
  continuation: AgentConversationView["continuation"];
  retired: boolean;
}

export interface AgentConversationRetirementView {
  reason: string;
  actor: Actor & { kind: "user" };
  occurredAt: string;
}

export interface AgentConversationMessageView {
  id: string;
  conversationId: string;
  body: string;
  actor: Actor & { kind: "user" };
  occurredAt: string;
}

export type TaskConversationIndexQueryResult =
  | { available: true; conversations: AgentConversationIndexEntry[] }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };

export interface ContinueAgentConversationCommand {
  taskId: string;
  conversationId: string;
  body: string;
  actor: Actor & { kind: "user" };
  idempotencyKey: string;
}

export type ContinueAgentConversationResult =
  | { accepted: true; message: AgentConversationMessageView; activationId: string }
  | { accepted: false; reason: "not-found" | "empty-message" | "task-archived" | "owning-agent-unavailable" | "thread-unavailable" }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

export interface RetireAgentConversationCommand {
  taskId: string;
  conversationId: string;
  reason: string;
  actor: Actor & { kind: "user" };
  idempotencyKey: string;
}

export type RetireAgentConversationResult =
  | { accepted: true; retirement: AgentConversationRetirementView }
  | { accepted: false; reason: "not-found" | "empty-reason" | "not-current-conversation" | "task-archived" | "activation-work-pending" }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };
