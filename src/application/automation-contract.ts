import type { ProcessDiagnostic } from "./process-contract.ts";
import type { AgentExecutionProfile, ActivationStartupFailureView, AttemptView } from "./runtime-contract.ts";
import type { Actor } from "./task-contract.ts";

/** Automation lifecycle, activation, interruption, and recovery facts. */
export interface AutomationClock {
  now(): Date;
  waitUntil(instant: string): Promise<void>;
}

export interface ActivationReasonView {
  type: "column-entry" | "agent-mention" | "blockers-cleared" | "user-follow-up";
  sourceEventId: string;
}

export interface ActivationView extends AgentExecutionProfile {
  id: string;
  conversationId: string | null;
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
  dismissal?: { mayStartNext: boolean } | null;
}

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
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] }
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

export interface DismissActivationCommand {
  activationId: string;
  actor: Actor & { kind: "user" };
  idempotencyKey: string;
}

export type DismissActivationResult =
  | { accepted: true; activationId: string }
  | { accepted: false; reason: "not-found" | "not-dismissible" }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };

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

export type ActivationRecoveryAction = "retry" | "dismiss" | "continue";

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
  | { accepted: false; reason: "not-found" | "wrong-recovery-type" | "already-resolved" | "message-required" }
  | { accepted: false; reason: "configuration-error"; diagnostics: ProcessDiagnostic[] };
