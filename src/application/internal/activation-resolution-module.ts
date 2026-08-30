import type { DatabaseSync } from "node:sqlite";

import type {
  ActivationRecoveryAction,
  ActivationRecoveryCommand,
  ActivationRecoveryResult,
  ActivationView,
  ContinueInterruptedTaskCommand,
  ContinueInterruptedTaskResult,
  ContinuePermissionBlockedActivationCommand,
  DismissActivationCommand,
  DismissActivationResult,
  DismissStaleActivationCommand,
  DismissStaleActivationResult,
} from "../automation-contract.ts";
import type { Actor } from "../task-contract.ts";
import type { ActivityJournal } from "./activity-journal.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { IdempotentCommandExecutor } from "./idempotent-command-executor.ts";

export class ActivationResolutionModule {
  readonly #database: DatabaseSync;
  readonly #idempotentCommands: IdempotentCommandExecutor;
  readonly #activityJournal: ActivityJournal;

  constructor(
    database: CoordinationDatabase,
    idempotentCommands: IdempotentCommandExecutor,
    activityJournal: ActivityJournal,
  ) {
    this.#database = database.connection;
    this.#idempotentCommands = idempotentCommands;
    this.#activityJournal = activityJournal;
  }

  dismissActivation(command: DismissActivationCommand): DismissActivationResult {
    return this.#idempotentCommands.execute({
      kind: "dismiss-activation",
      idempotencyKey: command.idempotencyKey,
    }, () => {
      const activation = this.#database.prepare(
        `SELECT activation.task_id, activation.target_agent_id,
                activation.reason_type, activation.source_event_id, activation.status,
                activation.resolution, activation.stale,
                task.automation_suspended, task.suspended_activation_id,
                (SELECT COUNT(*) FROM attempts attempt
                 WHERE attempt.activation_id = activation.id) AS attempt_count
         FROM activations activation
         JOIN tasks task ON task.id = activation.task_id
         WHERE activation.id = ?`,
      ).get(command.activationId) as
        | {
            task_id: string;
            target_agent_id: string;
            reason_type: string;
            source_event_id: string;
            status: ActivationView["status"];
            resolution: string | null;
            stale: number;
            automation_suspended: number;
            suspended_activation_id: string | null;
            attempt_count: number;
          }
        | undefined;
      let result: DismissActivationResult;
      if (activation === undefined) {
        result = { accepted: false, reason: "not-found" };
      } else {
        const dismissesUntouchedQueueEntry = activation.attempt_count === 0;
        const dismissesInterruptedHead = activation.automation_suspended === 1 &&
          activation.suspended_activation_id === command.activationId;
        const dismissible = activation.status === "queued" &&
          activation.resolution === null &&
          activation.stale === 0 &&
          (dismissesUntouchedQueueEntry || dismissesInterruptedHead);
        if (!dismissible) {
          result = { accepted: false, reason: "not-dismissible" };
        } else {
          const occurredAt = new Date().toISOString();
          this.#database.prepare(
            `UPDATE activations
             SET status = 'completed', resolution = 'dismissed',
                 retry_due_at = NULL, failure_kind = NULL, failure_summary = NULL
             WHERE id = ?`,
          ).run(command.activationId);
          const clearedSuspension = this.#database.prepare(
            `UPDATE tasks
             SET automation_suspended = 0, suspended_activation_id = NULL
             WHERE id = ? AND automation_suspended = 1
               AND suspended_activation_id = ?`,
          ).run(activation.task_id, command.activationId).changes === 1;
          this.appendActivationDismissedActivity(activation.task_id, command.actor, {
            activationId: command.activationId,
            targetAgentId: activation.target_agent_id,
            reasonType: activation.reason_type,
            sourceEventId: activation.source_event_id,
            clearedSuspension,
          }, occurredAt);
          result = { accepted: true, activationId: command.activationId };
        }
      }
      return result;
    });
  }

  dismissStaleActivation(
    command: DismissStaleActivationCommand,
  ): DismissStaleActivationResult {
    return this.#idempotentCommands.execute({
      kind: "dismiss-stale-activation",
      idempotencyKey: command.idempotencyKey,
    }, () => {
      const activation = this.#database.prepare(
        `SELECT activation.stale, activation.resolution, activation.task_id,
                activation.target_agent_id, activation.reason_type,
                activation.source_event_id
         FROM activations activation
         WHERE activation.id = ?`,
      ).get(command.activationId) as
        | {
            stale: number;
            resolution: string | null;
            task_id: string;
            target_agent_id: string;
            reason_type: string;
            source_event_id: string;
          }
        | undefined;
      let result: DismissStaleActivationResult;
      if (activation === undefined) result = { accepted: false, reason: "not-found" };
      else if (activation.stale !== 1 || activation.resolution !== null) {
        result = { accepted: false, reason: "not-stale" };
      } else {
        const resolvedAt = new Date().toISOString();
        this.#database.prepare(
          `UPDATE activations
           SET status = 'completed', resolution = 'dismissed', stale = 0,
               retry_due_at = NULL, failure_kind = NULL, failure_summary = NULL
           WHERE id = ?`,
        ).run(command.activationId);
        const attentionReasons = this.#database.prepare(
          `SELECT id FROM attention_reasons
           WHERE source_event_id = ? AND resolved_at IS NULL
           ORDER BY rowid`,
        ).all(command.activationId) as Array<{ id: string }>;
        const resolveAttention = this.#database.prepare(
          "UPDATE attention_reasons SET resolved_at = ? WHERE id = ?",
        );
        for (const reason of attentionReasons) {
          resolveAttention.run(resolvedAt, reason.id);
          this.#activityJournal.append(
            activation.task_id,
            "attention.resolved",
            command.actor,
            { attentionReasonId: reason.id },
            resolvedAt,
          );
        }
        const suspension = this.#database.prepare(
          `UPDATE tasks
           SET automation_suspended = 0, suspended_activation_id = NULL
           WHERE id = ? AND suspended_activation_id = ?`,
        ).run(activation.task_id, command.activationId);
        if (suspension.changes === 1) {
          this.#activityJournal.append(
            activation.task_id,
            "automation.resumed",
            command.actor,
            { activationId: command.activationId, resolution: "dismissed" },
            resolvedAt,
          );
        }
        this.appendActivationDismissedActivity(activation.task_id, command.actor, {
          activationId: command.activationId,
          targetAgentId: activation.target_agent_id,
          reasonType: activation.reason_type,
          sourceEventId: activation.source_event_id,
          clearedSuspension: suspension.changes === 1,
        }, resolvedAt);
        result = { accepted: true, activationId: command.activationId };
      }
      return result;
    });
  }

  retryFailedActivation(command: ActivationRecoveryCommand): ActivationRecoveryResult {
    return this.recoverActivation("retry", command, "technical");
  }

  dismissFailedActivation(command: ActivationRecoveryCommand): ActivationRecoveryResult {
    return this.recoverActivation("dismiss", command, "technical");
  }

  continuePermissionBlockedActivation(
    command: ContinuePermissionBlockedActivationCommand,
  ): ActivationRecoveryResult {
    const message = command.message.trim();
    if (message.length === 0) return { accepted: false, reason: "message-required" };
    return this.recoverActivation("continue", command, "permission", message);
  }

  continueInterruptedTask(
    command: ContinueInterruptedTaskCommand,
  ): ContinueInterruptedTaskResult {
    return this.#idempotentCommands.execute({
      kind: "continue-interrupted-task",
      idempotencyKey: command.idempotencyKey,
    }, () => {
      const row = this.#database
        .prepare(
          `SELECT automation_suspended, suspended_activation_id
           FROM tasks
           WHERE id = ?`,
        )
        .get(command.taskId) as
        | { automation_suspended: number; suspended_activation_id: string | null }
        | undefined;
      if (row === undefined) return { accepted: false as const, reason: "not-found" as const };
      if (row.automation_suspended !== 1 || row.suspended_activation_id === null) {
        return { accepted: false as const, reason: "not-suspended" as const };
      }
      const continuationMessage = command.message.trim().length === 0
        ? null
        : command.message.trim();
      this.#database
        .prepare("UPDATE activations SET continuation_message = ? WHERE id = ?")
        .run(continuationMessage, row.suspended_activation_id);
      this.#database
        .prepare(
          `UPDATE tasks
           SET automation_suspended = 0, suspended_activation_id = NULL
           WHERE id = ?`,
        )
        .run(command.taskId);
      const occurredAt = new Date().toISOString();
      this.#activityJournal.append(
        command.taskId,
        "automation.resumed",
        command.actor,
        { activationId: row.suspended_activation_id },
        occurredAt,
      );
      return { accepted: true as const, activationId: row.suspended_activation_id };
    }, (result) => result.accepted);
  }

  private recoverActivation(
    action: ActivationRecoveryAction,
    command: ActivationRecoveryCommand,
    expectedFailureKind: "technical" | "permission",
    continuationMessage: string | null = null,
  ): ActivationRecoveryResult {
    return this.#idempotentCommands.execute({
      kind: `${action}-failed-activation`,
      idempotencyKey: command.idempotencyKey,
    }, () => {
      const reason = this.#database
        .prepare(
          `SELECT attention.task_id, attention.resolved_at,
                  activation.id AS activation_id, activation.status,
                  activation.failure_kind, activation.target_agent_id,
                  activation.reason_type, activation.source_event_id
           FROM attention_reasons attention
           LEFT JOIN activations activation ON activation.id = attention.source_event_id
           WHERE attention.id = ? AND attention.type = 'failed-run'`,
        )
        .get(command.attentionReasonId) as
        | {
            task_id: string;
            resolved_at: string | null;
            activation_id: string | null;
            status: ActivationView["status"] | null;
            failure_kind: "technical" | "permission" | null;
            target_agent_id: string | null;
            reason_type: string | null;
            source_event_id: string | null;
          }
        | undefined;
      let result: ActivationRecoveryResult;
      if (reason === undefined || reason.activation_id === null) {
        result = { accepted: false, reason: "not-found" };
      } else if (reason.resolved_at !== null) {
        result = { accepted: false, reason: "already-resolved" };
      } else if (reason.status !== "failed" || reason.failure_kind !== expectedFailureKind) {
        result = { accepted: false, reason: "wrong-recovery-type" };
      } else {
        const resolvedAt = new Date().toISOString();
        this.#database
          .prepare("UPDATE attention_reasons SET resolved_at = ? WHERE id = ?")
          .run(resolvedAt, command.attentionReasonId);
        this.#database
          .prepare(
            `UPDATE activation_startup_failures
             SET resolved_at = ?
             WHERE activation_id = ? AND resolved_at IS NULL`,
          )
          .run(resolvedAt, reason.activation_id);
        if (action === "dismiss") {
          this.#database
            .prepare(
              `UPDATE activations
               SET status = 'completed', resolution = 'dismissed',
                   failure_kind = NULL, failure_summary = NULL, retry_due_at = NULL
               WHERE id = ?`,
            )
            .run(reason.activation_id);
          this.appendActivationDismissedActivity(reason.task_id, command.actor, {
            activationId: reason.activation_id,
            targetAgentId: reason.target_agent_id!,
            reasonType: reason.reason_type!,
            sourceEventId: reason.source_event_id!,
            clearedSuspension: false,
          }, resolvedAt);
        } else {
          const attempts = this.#database
            .prepare("SELECT COUNT(*) AS count FROM attempts WHERE activation_id = ?")
            .get(reason.activation_id) as { count: number };
          this.#database
            .prepare(
              `UPDATE activations
               SET status = 'queued', retry_cycle_start = ?, retry_due_at = NULL,
                   failure_kind = NULL, failure_summary = NULL, resolution = NULL,
                   continuation_message = ?
               WHERE id = ?`,
            )
            .run(attempts.count, continuationMessage, reason.activation_id);
        }
        this.#activityJournal.append(
          reason.task_id,
          "attention.resolved",
          command.actor,
          {
            attentionReasonId: command.attentionReasonId,
            reasonType: "failed-run",
            recoveryAction: action,
          },
          resolvedAt,
        );
        result = { accepted: true, activationId: reason.activation_id, resolvedAt };
      }
      return result;
    });
  }

  private appendActivationDismissedActivity(
    taskId: string,
    actor: Actor & { kind: "user" },
    dismissal: {
      activationId: string;
      targetAgentId: string;
      reasonType: string;
      sourceEventId: string;
      clearedSuspension: boolean;
    },
    occurredAt: string,
  ): void {
    this.#activityJournal.append(taskId, "activation.dismissed", actor, {
      activationId: dismissal.activationId,
      targetAgentId: dismissal.targetAgentId,
      reasonType: dismissal.reasonType,
      sourceEventId: dismissal.sourceEventId,
      ...(dismissal.clearedSuspension ? { clearedSuspension: "true" } : {}),
    }, occurredAt);
  }
}
