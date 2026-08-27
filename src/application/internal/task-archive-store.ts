import type { DatabaseSync } from "node:sqlite";

import type {
  Actor,
  ArchiveTaskCommand,
  ArchiveTaskResult,
  UnarchiveTaskResult,
} from "../task-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { TaskProjectionStore } from "./task-projection-store.ts";
import type { IdempotentCommandExecutor } from "./idempotent-command-executor.ts";
import type { ActivityJournal } from "./activity-journal.ts";
import type { ConversationAttachmentStore } from "./conversation-attachment-store.ts";
import type { ConversationProjectionModule } from "./conversation-projection-module.ts";
import type { AttemptTokenUsage } from "../runtime-contract.ts";
import type { ProcessModelPricingDefinition } from "./process-definition.ts";
import type { ArchivedConversationCostSnapshot } from "./archived-conversation-cost.ts";

export class TaskArchiveStore {
  readonly #owner: CoordinationDatabase;
  readonly #database: DatabaseSync;
  readonly #projections: TaskProjectionStore;
  readonly #idempotentCommands: IdempotentCommandExecutor;
  readonly #activityJournal: ActivityJournal;
  readonly #conversationAttachments: ConversationAttachmentStore;
  readonly #conversationProjections: ConversationProjectionModule;

  constructor(
    database: CoordinationDatabase,
    projections: TaskProjectionStore,
    idempotentCommands: IdempotentCommandExecutor,
    activityJournal: ActivityJournal,
    conversationAttachments: ConversationAttachmentStore,
    conversationProjections: ConversationProjectionModule,
  ) {
    this.#owner = database;
    this.#database = database.connection;
    this.#projections = projections;
    this.#idempotentCommands = idempotentCommands;
    this.#activityJournal = activityJournal;
    this.#conversationAttachments = conversationAttachments;
    this.#conversationProjections = conversationProjections;
  }

  claim(
    command: ArchiveTaskCommand,
    eligibility: "any-idle-task" | "completed-only",
  ):
    | { claimed: true }
    | { claimed: false; result: ArchiveTaskResult } {
    return this.#owner.transaction(() => {
      const commandIdentity = {
        kind: "archive-task" as const,
        scope: [command.taskId] as const,
        idempotencyKey: command.idempotencyKey,
      };
      const prior = this.#idempotentCommands.replay<ArchiveTaskResult>(commandIdentity);
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
        this.#idempotentCommands.retain(commandIdentity, rejection);
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
      this.#idempotentCommands.retain({
        kind: "archive-task",
        scope: [command.taskId],
        idempotencyKey: command.idempotencyKey,
      }, result);
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
    return this.#idempotentCommands.replay<Result>({
      kind: "archive-completed-tasks",
      scope: [boardId],
      idempotencyKey,
    });
  }

  rememberBulkCommand(boardId: string, idempotencyKey: string, result: unknown): void {
    this.#idempotentCommands.retain({
      kind: "archive-completed-tasks",
      scope: [boardId],
      idempotencyKey,
    }, result);
  }

  archive(
    taskId: string,
    actor: Actor,
    idempotencyKey: string,
  ): Extract<ArchiveTaskResult, { accepted: true }> {
    const deletion = this.#conversationAttachments.stageTaskContentDeletion(taskId);
    let result: Extract<ArchiveTaskResult, { accepted: true }>;
    try {
      result = this.#owner.transaction(() => {
        const occurredAt = new Date().toISOString();
        this.snapshotConversationCosts(taskId);
        this.#database.prepare(
          "DELETE FROM attempt_transcripts WHERE attempt_id IN (SELECT attempt.id FROM attempts attempt JOIN activations activation ON activation.id = attempt.activation_id WHERE activation.task_id = ?)",
        ).run(taskId);
        this.#database.prepare("DELETE FROM agent_conversation_messages WHERE task_id = ?").run(taskId);
        this.#idempotentCommands.forgetScope({
          kind: "continue-agent-conversation",
          scope: [taskId],
        });
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
        this.#idempotentCommands.retain({
          kind: "archive-task",
          scope: [taskId],
          idempotencyKey,
        }, result);
        return result;
      });
    } catch (error) {
      deletion.rollback();
      throw error;
    }
    deletion.commit();
    return result;
  }

  unarchive(taskId: string, actor: Actor, idempotencyKey: string): UnarchiveTaskResult {
    return this.#idempotentCommands.execute({
      kind: "unarchive-task",
      scope: [taskId],
      idempotencyKey,
    }, () => {
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

  private snapshotConversationCosts(taskId: string): void {
    const conversations = this.#database.prepare(
      `SELECT id FROM agent_conversations WHERE task_id = ? ORDER BY id`,
    ).all(taskId) as Array<{ id: string }>;
    const update = this.#database.prepare(
      `UPDATE agent_conversations
       SET archived_cost_json = ?
       WHERE id = ?`,
    );
    for (const { id } of conversations) {
      const latestAttempt = this.#database.prepare(
        `SELECT MAX(attempt.rowid) AS rowid
         FROM activations activation
         JOIN attempts attempt ON attempt.activation_id = activation.id
         WHERE activation.conversation_id = ?`,
      ).get(id) as { rowid: number | null };
      const snapshot: ArchivedConversationCostSnapshot = {
        throughAttemptRowId: latestAttempt.rowid ?? 0,
        cost: this.#conversationProjections.readConversationCostEstimate(id),
        threadUsageCheckpoints: this.readThreadUsageCheckpoints(id),
      };
      update.run(JSON.stringify(snapshot), id);
    }
  }

  private readThreadUsageCheckpoints(
    conversationId: string,
  ): ArchivedConversationCostSnapshot["threadUsageCheckpoints"] {
    const archived = this.#database.prepare(
      `SELECT archived_cost_json FROM agent_conversations WHERE id = ?`,
    ).get(conversationId) as { archived_cost_json: string | null } | undefined;
    const prior = archived?.archived_cost_json === null || archived?.archived_cost_json === undefined
      ? undefined
      : JSON.parse(archived.archived_cost_json) as ArchivedConversationCostSnapshot;
    const rows = this.#database.prepare(
      `SELECT attempt.thread_id, attempt.pricing_json, transcript.reported_usage_json
       FROM activations activation
       JOIN attempts attempt ON attempt.activation_id = activation.id
       JOIN attempt_transcripts transcript ON transcript.attempt_id = attempt.id
       WHERE activation.conversation_id = ?
         AND attempt.thread_id IS NOT NULL
         AND transcript.reported_usage_json IS NOT NULL
       ORDER BY attempt.rowid`,
    ).all(conversationId) as Array<{
      thread_id: string;
      pricing_json: string | null;
      reported_usage_json: string;
    }>;
    const latestByThread = new Map(
      (prior?.threadUsageCheckpoints ?? []).map((checkpoint) => [checkpoint.threadId, checkpoint]),
    );
    for (const row of rows) {
      latestByThread.set(row.thread_id, {
        threadId: row.thread_id,
        reportedUsage: JSON.parse(row.reported_usage_json) as AttemptTokenUsage,
        ...(row.pricing_json === null ? {} : {
          pricing: JSON.parse(row.pricing_json) as ProcessModelPricingDefinition,
        }),
      });
    }
    return [...latestByThread.values()];
  }

  private hasPendingActivationWork(taskId: string): boolean {
    return this.#database.prepare(
      `SELECT 1 FROM activations
       WHERE task_id = ? AND status <> 'completed'
       LIMIT 1`,
    ).get(taskId) !== undefined;
  }
}
