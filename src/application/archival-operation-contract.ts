import type { ArchiveTaskResult, WorkspaceCleanupFailure } from "./task-contract.ts";

export type ArchivalTarget = { kind: "task"; taskId: string } | { kind: "completion"; boardId: string };
export type ArchivalFailure = {
  reason: Exclude<ArchiveTaskResult, { accepted: true }>["reason"] | "interrupted" | "unexpected-archive-error";
  removedWorktrees?: string[];
  cleanupFailure?: WorkspaceCleanupFailure;
  diagnostic?: string;
};
export interface ArchivalOperationTask {
  taskId: string;
  title: string;
  state: "queued" | "running" | "archived" | "failed" | "interrupted";
  failure?: ArchivalFailure;
}
export interface ArchivalOperation {
  id: string;
  target: ArchivalTarget;
  label: string;
  state: "queued" | "running" | "completed" | "interrupted";
  updatedAt: string;
  feedbackDismissed?: boolean;
  tasks: ArchivalOperationTask[];
}

export type StartArchivalOperationResult =
  | { accepted: true; operation: ArchivalOperation }
  | { accepted: false; reason: "not-found" | "configuration-error" | "shutdown-in-progress" | "idempotency-conflict" | "archive-in-progress" };
