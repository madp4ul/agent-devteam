import type { TaskCommandSummary } from "../task-contract.ts";

const taskCommands = new Set(["create-task", "create-child-task", "edit-task", "move-task", "add-task-comment", "archive-task", "unarchive-task"]);
const relationshipCommands = new Set(["create-task-relationship", "remove-task-relationship", "edit-task-relationship-resume-agent"]);
const boardRejections = ["not-found", "invalid-destination", "completion-is-not-starting-column", "active-resource-claims", "invalid-starting-ref", "workspace-preparing", "workspace-already-provisioned", "archived-task", "unmapped-task-user-only", "empty-title", "empty-description", "resume-agent-not-found", "no-changes", "idempotency-conflict", "revision-conflict"];
const rejections: Record<string, readonly string[]> = {
  "create-task": boardRejections, "create-child-task": boardRejections, "edit-task": boardRejections, "move-task": boardRejections,
  "add-task-comment": ["not-found", "archived-task", "empty-comment", "idempotency-conflict"],
  "create-task-relationship": ["not-found", "archived-task", "self-relationship", "duplicate-relationship", "circular-relationship", "resume-agent-not-found", "idempotency-conflict"],
  "remove-task-relationship": ["not-found", "archived-task", "relationship-conflict", "idempotency-conflict"],
  "edit-task-relationship-resume-agent": ["not-found", "archived-task", "relationship-conflict", "relationship-satisfied", "resume-agent-not-found", "idempotency-conflict"],
  "archive-task": ["not-found", "already-archived", "archive-in-progress", "not-completed", "active-resource-claims", "waiting-relationships", "activation-work-pending", "automation-suspended", "workspace-dirty", "workspace-commit-not-durable", "workspace-registration-invalid", "workspace-ownership-untrusted", "workspace-nested-worktrees", "workspace-locked", "workspace-removal-failed", "workspace-cleanup-failed", "runtime-unavailable"],
  "unarchive-task": ["not-found", "not-archived"],
};

export function commandResultKind(commandType: string): string {
  if (commandType.startsWith("[")) {
    try { const value: unknown = JSON.parse(commandType); return Array.isArray(value) && typeof value[0] === "string" ? value[0] : ""; }
    catch { return ""; }
  }
  return commandType.split(":")[0]!;
}

export function hasCompactTaskResult(commandType: string): boolean {
  const kind = commandResultKind(commandType);
  return taskCommands.has(kind) || relationshipCommands.has(kind);
}

export type HistoricalCommandResultConversion = { supported: true; result: unknown } | { supported: false; reason: string };

/** Frozen V1 historical mapping used by released migrations. Never hydrates mutable state. */
export function convertHistoricalCommandResultV1(commandType: string, value: unknown): HistoricalCommandResultConversion {
  const kind = commandResultKind(commandType);
  const unsupported = (): HistoricalCommandResultConversion => ({ supported: false, reason: `Unsupported or incomplete historical ${kind || "unknown"} command result` });
  if (!hasCompactTaskResult(commandType) || !record(value) || typeof value.accepted !== "boolean") return unsupported();
  if (!value.accepted) {
    if (typeof value.reason !== "string" ||
        (value.reason !== "configuration-error" && !rejections[kind]?.includes(value.reason))) return unsupported();
    if (value.reason === "configuration-error" && !Array.isArray(value.diagnostics)) return unsupported();
    if (value.reason === "revision-conflict") {
      const currentTask = summary(value.currentTask);
      if (!currentTask || Object.keys(value).some((key) => !["accepted", "reason", "currentTask"].includes(key))) return unsupported();
      return { supported: true, result: { accepted: false, reason: value.reason, currentTask } };
    }
    // Failure diagnostics and other retained rejection facts remain exact. An
    // unexpected task-shaped field cannot silently retain a rich snapshot.
    if (Object.keys(value).some((key) => !["accepted", "reason", "diagnostics"].includes(key))) return unsupported();
    return { supported: true, result: value };
  }
  if (relationshipCommands.has(kind)) {
    const sourceTask = summary(value.sourceTask), targetTask = summary(value.targetTask);
    const relationship = value.relationship;
    if (!sourceTask || !targetTask || !record(relationship) || !strings(relationship, ["id", "sourceTaskId", "targetTaskId"]) ||
        (relationship.type !== "parent-child" && relationship.type !== "dependency") ||
        !(relationship.resumeAgentId === null || typeof relationship.resumeAgentId === "string") ||
        Object.keys(value).some((key) => !["accepted", "relationship", "sourceTask", "targetTask"].includes(key))) return unsupported();
    return { supported: true, result: { accepted: true, relationship, sourceTask, targetTask } };
  }
  const task = summary(value.task);
  if (!task) return unsupported();
  const allowed = ["accepted", "task"];
  const result: Record<string, unknown> = { accepted: true, task };
  if (kind === "move-task") {
    if (!record(value.transition) || !strings(value.transition, ["taskId", "fromColumnId", "toColumnId"])) return unsupported();
    allowed.push("transition", "outcome"); result.transition = value.transition;
    if (value.outcome !== undefined) {
      if (value.outcome !== "already-in-column") return unsupported();
      result.outcome = value.outcome;
    }
  }
  if (kind === "add-task-comment") {
    if (!record(value.comment) || !strings(value.comment, ["id", "body", "occurredAt"]) || !record(value.comment.actor) || !strings(value.comment.actor, ["kind", "id"]) ||
        (value.comment.actor.kind !== "user" && value.comment.actor.kind !== "agent")) return unsupported();
    allowed.push("comment"); result.comment = value.comment;
  }
  return Object.keys(value).some((key) => !allowed.includes(key)) ? unsupported() : { supported: true, result };
}

export const convertHistoricalCommandResult = convertHistoricalCommandResultV1;

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function strings(value: Record<string, unknown>, keys: string[]): boolean { return keys.every((key) => typeof value[key] === "string"); }
function summary(value: unknown): TaskCommandSummary | undefined {
  if (!record(value) || !strings(value, ["id", "title", "boardId", "columnId"]) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 ||
      (value.archived !== undefined && value.archived !== true)) return undefined;
  return { id: value.id as string, title: value.title as string, boardId: value.boardId as string, columnId: value.columnId as string, revision: value.revision as number,
    ...(value.archived === true ? { archived: true } : {}) };
}
