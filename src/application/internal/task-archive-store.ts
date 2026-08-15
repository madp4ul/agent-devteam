import type { DatabaseSync } from "node:sqlite";

import type {
  Actor,
  ArchiveTaskCommand,
  ArchiveTaskResult,
  UnarchiveTaskResult,
} from "../coordination-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { TaskProjectionStore } from "./task-projection-store.ts";
import type { IdempotentCommandExecutor } from "./idempotent-command-executor.ts";
import type { ActivityJournal } from "./activity-journal.ts";

export class TaskArchiveStore {
  readonly #owner: CoordinationDatabase;
  readonly #database: DatabaseSync;
  readonly #projections: TaskProjectionStore;
  readonly #idempotentCommands: IdempotentCommandExecutor;
  readonly #activityJournal: ActivityJournal;

  constructor(
    database: CoordinationDatabase,
    projections: TaskProjectionStore,
    idempotentCommands: IdempotentCommandExecutor,
    activityJournal: ActivityJournal,
  ) {
    this.#owner = database;
    this.#database = database.connection;
    this.#projections = projections;
    this.#idempotentCommands = idempotentCommands;
    this.#activityJournal = activityJournal;
  }

  claim(
    command: ArchiveTaskCommand,
    eligibility: "any-idle-task" | "completed-only",
  ):
    | { claimed: true }
    | { claimed: false; result: ArchiveTaskResult } {
    return this.#owner.transaction(() => {
      const commandType = `archive-task:${command.taskId}`;
      const prior = this.#idempotentCommands.replay<ArchiveTaskResult>(
        commandType,
        command.idempotencyKey,
      );
      if (prior !== undefined) return { claimed: false, result: prior };
      const task = this.#database.prepare(
        `SELECT column_id, archived_at, archival_pending, automation_suspended
         FROM tasks WHERE id = ?`,
      ).get(command.taskId) as {
        column_id: string;
        archived_at: string | null;
        archival_pending: number;
        automation_suspended: number;
      } | undefined;
      const rejection = task === undefined
        ? { accepted: false as const, reason: "not-found" as const }
        : task.archived_at !== null
          ? { accepted: false as const, reason: "already-archived" as const }
          : task.archival_pending === 1
            ? { accepted: false as const, reason: "archive-in-progress" as const }
            : eligibility === "completed-only" && task.column_id !== "completion"
              ? { accepted: false as const, reason: "not-completed" as const }
              : task.automation_suspended === 1
                ? { accepted: false as const, reason: "automation-suspended" as const }
                : this.hasPendingActivationWork(command.taskId)
                  ? { accepted: false as const, reason: "activation-work-pending" as const }
                  : undefined;
      if (rejection !== undefined) {
        this.#idempotentCommands.retain(commandType, command.idempotencyKey, rejection);
        return { claimed: false, result: rejection };
      }
      this.#database.prepare(
        `UPDATE tasks
         SET archival_pending = 1, archival_actor_id = ?, archival_idempotency_key = ?
         WHERE id = ?`,
      ).run(command.actor.id, command.idempotencyKey, command.taskId);
      return { claimed: true };
    });
  }

  completedTaskIds(boardId: string): string[] {
    return (this.#database.prepare(
      `SELECT id FROM tasks
       WHERE board_id = ? AND column_id = 'completion' AND archived_at IS NULL
       ORDER BY sequence`,
    ).all(boardId) as Array<{ id: string }>).map(({ id }) => id);
  }

  cancelClaim(
    command: ArchiveTaskCommand,
    result: Exclude<ArchiveTaskResult, { accepted: true }>,
  ): void {
    this.#owner.transaction(() => {
      this.#database.prepare(
        `UPDATE tasks
         SET archival_pending = 0, archival_actor_id = NULL, archival_idempotency_key = NULL
         WHERE id = ? AND archived_at IS NULL`,
      ).run(command.taskId);
      this.#idempotentCommands.retain(
        `archive-task:${command.taskId}`,
        command.idempotencyKey,
        result,
      );
    });
  }

  readInterruptedClaims(): Array<{
    taskId: string;
    actor: Actor & { kind: "user" };
    idempotencyKey: string;
  }> {
    return (this.#database.prepare(
      `SELECT id, archival_actor_id, archival_idempotency_key
       FROM tasks WHERE archival_pending = 1 ORDER BY sequence`,
    ).all() as Array<{
      id: string;
      archival_actor_id: string;
      archival_idempotency_key: string;
    }>).map((row) => ({
      taskId: row.id,
      actor: { kind: "user", id: row.archival_actor_id },
      idempotencyKey: row.archival_idempotency_key,
    }));
  }

  releaseInterruptedClaim(taskId: string): void {
    this.#database.prepare(
      `UPDATE tasks
       SET archival_pending = 0, archival_actor_id = NULL, archival_idempotency_key = NULL
       WHERE id = ? AND archived_at IS NULL`,
    ).run(taskId);
  }

  readBulkCommand<Result>(boardId: string, idempotencyKey: string): Result | undefined {
    return this.#idempotentCommands.replay<Result>(`archive-completed-tasks:${boardId}`, idempotencyKey);
  }

  rememberBulkCommand(boardId: string, idempotencyKey: string, result: unknown): void {
    this.#idempotentCommands.retain(`archive-completed-tasks:${boardId}`, idempotencyKey, result);
  }

  archive(
    taskId: string,
    actor: Actor,
    idempotencyKey: string,
  ): Extract<ArchiveTaskResult, { accepted: true }> {
    return this.#owner.transaction(() => {
      const occurredAt = new Date().toISOString();
      this.#database.prepare("DELETE FROM attempt_transcripts WHERE attempt_id IN (SELECT attempt.id FROM attempts attempt JOIN activations activation ON activation.id = attempt.activation_id WHERE activation.task_id = ?)").run(taskId);
      this.#database.prepare("DELETE FROM agent_conversation_messages WHERE task_id = ?").run(taskId);
      this.#idempotentCommands.forgetByCommandTypePrefix(
        `continue-agent-conversation:${taskId}:`,
      );
      this.#database.prepare("DELETE FROM task_workspaces WHERE task_id = ?").run(taskId);
      this.#database.prepare("DELETE FROM task_starting_refs WHERE task_id = ?").run(taskId);
      const marked = this.#database.prepare(
        `UPDATE tasks
         SET archived_at = ?, archival_pending = 0, archival_actor_id = NULL,
             archival_idempotency_key = NULL, revision = revision + 1
         WHERE id = ? AND archival_pending = 1`,
      ).run(occurredAt, taskId);
      if (marked.changes !== 1) throw new Error("Task archival claim was lost before completion");
      this.#activityJournal.append(taskId, "task.archived", actor, {}, occurredAt);
      const task = this.#projections.readTask(taskId);
      if (task === undefined) throw new Error("Archived task could not be read back");
      const result = { accepted: true as const, task };
      this.#idempotentCommands.retain(`archive-task:${taskId}`, idempotencyKey, result);
      return result;
    });
  }

  unarchive(taskId: string, actor: Actor, idempotencyKey: string): UnarchiveTaskResult {
    return this.#idempotentCommands.execute(`unarchive-task:${taskId}`, idempotencyKey, () => {
      const row = this.#database.prepare("SELECT archived_at FROM tasks WHERE id = ?").get(taskId) as { archived_at: string | null } | undefined;
      if (row === undefined) {
        return { accepted: false as const, reason: "not-found" as const };
      }
      if (row.archived_at === null) {
        return { accepted: false as const, reason: "not-archived" as const };
      }
      const occurredAt = new Date().toISOString();
      this.#database.prepare("UPDATE tasks SET archived_at = NULL, revision = revision + 1 WHERE id = ?").run(taskId);
      this.#activityJournal.append(taskId, "task.unarchived", actor, {}, occurredAt);
      const task = this.#projections.readTask(taskId);
      if (task === undefined) throw new Error("Unarchived task could not be read back");
      return { accepted: true as const, task };
    });
  }

  private hasPendingActivationWork(taskId: string): boolean {
    return this.#database.prepare(
      `SELECT 1 FROM activations
       WHERE task_id = ? AND status <> 'completed'
       LIMIT 1`,
    ).get(taskId) !== undefined;
  }
}
