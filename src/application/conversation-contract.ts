import type { ActivationView } from "./automation-contract.ts";
import type { ProcessDiagnostic } from "./process-contract.ts";
import type { AttemptContextWindowUsage, EstimatedTokenCost, AttemptTokenUsage, AttemptTranscriptItem, TokenCostBreakdown } from "./runtime-contract.ts";
import type { Actor, TaskActivityView, TaskCommentView } from "./task-contract.ts";

/** Conversation index, detail, message, transcript, and continuation facts. */
export type AgentConversationTranscriptView =
  | { available: true; items: AttemptTranscriptItem[]; usage?: AttemptTokenUsage; costEstimate?: EstimatedTokenCost; costBreakdown?: TokenCostBreakdown }
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
  costEstimate?: EstimatedTokenCost;
  costBreakdown?: TokenCostBreakdown;
  hasUnpricedSettledRuns: boolean;
  costPending: boolean;
  contextWindowUsage?: AttemptContextWindowUsage;
  retirement: AgentConversationRetirementView | null;
  replacesConversationId: string | null;
  replacementReason: string | null;
  retirementAvailability:
    | { available: true }
    | { available: false; reason: "already-retired" | "task-archived" | "activation-work-pending" };
  continuation:
    | { available: true }
    | { available: false; reason: "task-archived" | "owning-agent-unavailable" | "thread-unavailable" };
  history: AgentConversationHistoryEntry[];
}

export type AgentConversationHistoryEntry =
  | {
      kind: "activation";
      activationId: string;
      status: ActivationView["status"];
      attemptIds: string[];
      occurredAt: string;
      reason: ActivationView["reason"];
      source: { kind: "activity"; activity: TaskActivityView } | { kind: "comment"; comment: TaskCommentView };
    }
  | { kind: "message"; activationId: string; status: ActivationView["status"]; attemptIds: string[]; message: AgentConversationMessageView }
  | { kind: "item"; activationId: string; attemptId: string; item: AttemptTranscriptItem }
  | { kind: "retirement"; retirement: AgentConversationRetirementView }
  | { kind: "continuity-loss"; occurredAt: string; reason: string };

export type AgentConversationQueryResult =
  | { available: true; conversation: AgentConversationView }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };

export interface AgentConversationIndexEntry {
  id: string;
  owningAgent: AgentConversationView["owningAgent"];
  label: string;
  latestActivityAt: string;
  costEstimate?: EstimatedTokenCost;
  costBreakdown?: TokenCostBreakdown;
  hasUnpricedSettledRuns: boolean;
  costPending: boolean;
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
  attachments: ConversationAttachmentView[];
}

export interface ConversationAttachmentView {
  id: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
}

export interface PendingConversationUploadView extends ConversationAttachmentView {
  conversationId: string;
}

export interface CreateConversationUploadCommand {
  taskId: string;
  conversationId: string;
  fileName: string;
  mediaType: string;
  content: AsyncIterable<Uint8Array>;
}

export type CreateConversationUploadResult =
  | { accepted: true; upload: PendingConversationUploadView }
  | { accepted: false; reason: "not-found" | "task-archived" | "file-too-large" | "attachment-limit-exceeded" | "storage-failed" };

export interface ReadConversationAttachmentCommand {
  taskId: string;
  conversationId: string;
  attachmentId: string;
}

export type ReadConversationAttachmentResult =
  | { available: true; attachment: ConversationAttachmentView; content: AsyncIterable<Uint8Array> }
  | { available: false; reason: "not-found" };

export type TaskConversationIndexQueryResult =
  | { available: true; conversations: AgentConversationIndexEntry[] }
  | { available: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
  | { available: false; reason: "not-found" };

export interface ContinueAgentConversationCommand {
  taskId: string;
  conversationId: string;
  body: string;
  attachmentIds?: string[];
  actor: Actor & { kind: "user" };
  idempotencyKey: string;
}

export type ContinueAgentConversationResult =
  | { accepted: true; message: AgentConversationMessageView; activationId: string }
  | { accepted: false; reason: "not-found" | "empty-message" | "invalid-attachments" | "attachment-limit-exceeded" | "task-archived" | "owning-agent-unavailable" | "thread-unavailable" }
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
