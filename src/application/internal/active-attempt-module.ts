import { classifyRuntimeFailure } from "../runtime-failure.ts";
import { RuntimeRecoveryStore } from "./runtime-recovery-store.ts";
import type { DatabaseSync } from "node:sqlite";

import type {
  ActiveRunView,
} from "../automation-contract.ts";
import type {
  AgentRunAgent,
  AgentRunOutcome,
  ReviewerPolicyConfiguration,
  ReviewerAllowanceEvidence,
  AttemptTranscriptItem,
  AttemptContextWindowUsage,
  AttemptTokenUsage,
} from "../runtime-contract.ts";
import type { ProcessModelPricingDefinition } from "./process-definition.ts";
import type {
  Actor,
} from "../task-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { IdempotentCommandExecutor } from "./idempotent-command-executor.ts";
import type { ActivityJournal } from "./activity-journal.ts";
import type { AttentionRecorder } from "./attention-recorder.ts";
import type { AttemptEvidenceModule } from "./attempt-evidence-module.ts";

interface AttemptSettlementEvidence {
  transcript?: AttemptTranscriptItem[];
  usage?: AttemptTokenUsage;
  contextWindowUsage?: AttemptContextWindowUsage;
  pricing?: ProcessModelPricingDefinition;
  resumedThreadId?: string;
}

interface SettleAttempt extends AttemptSettlementEvidence {
  attemptId: string;
  outcome: AgentRunOutcome;
  now: Date;
}

interface InterruptAttempt extends AttemptSettlementEvidence {
  attemptId: string;
  now: Date;
  actor: Actor & { kind: "user" };
  idempotencyKey: string;
}

export class ActiveAttemptModule {
  readonly #owner: CoordinationDatabase;
  readonly #database: DatabaseSync;
  readonly #idempotentCommands: IdempotentCommandExecutor;
  readonly #activityJournal: ActivityJournal;
  readonly #attentionRecorder: AttentionRecorder;
  readonly #recovery: RuntimeRecoveryStore;
  readonly #attemptEvidence: AttemptEvidenceModule;

  constructor(
    database: CoordinationDatabase,
    idempotentCommands: IdempotentCommandExecutor,
    activityJournal: ActivityJournal,
    attentionRecorder: AttentionRecorder,
    attemptEvidence: AttemptEvidenceModule,
  ) {
    this.#owner = database;
    this.#database = database.connection;
    this.#idempotentCommands = idempotentCommands;
    this.#activityJournal = activityJournal;
    this.#attentionRecorder = attentionRecorder;
    this.#attemptEvidence = attemptEvidence;
    this.#recovery = new RuntimeRecoveryStore(this.#database, activityJournal);
  }

  recordTranscriptItem(attemptId: string, ordinal: number, item: AttemptTranscriptItem): void {
    if (!Number.isSafeInteger(ordinal) || ordinal < 0) throw new Error("Invalid transcript ordinal");
    this.#owner.transaction(() => {
      if (!meaningfulTranscriptItem(item)) {
        const probe = this.#database.prepare("SELECT provisional_probe FROM attempts WHERE id = ?").get(attemptId) as { provisional_probe: number } | undefined;
        if (probe?.provisional_probe === 1) return;
      }
      this.#activityJournal.promoteProbe(attemptId, new Date().toISOString());
      this.#database.prepare(`INSERT INTO conversation_history_items(id, conversation_id, position, kind, activation_id, attempt_id, item_json)
        SELECT 'item:' || attempt.id || ':' || printf('%d', ?), positions.conversation_id,
          positions.position || '|' || printf('%020d', attempt.rowid) || '|2|' || printf('%020d', ?),
          'item', attempt.activation_id, attempt.id, ?
        FROM attempts attempt JOIN conversation_history_activation_positions positions ON positions.id = attempt.activation_id
        WHERE attempt.id = ? AND attempt.status = 'running' AND positions.conversation_id IS NOT NULL
        ON CONFLICT(id) DO UPDATE SET item_json = excluded.item_json`)
        .run(ordinal, ordinal, JSON.stringify(item), attemptId);
    });
  }

  recoverInterruptedAttempts(now = new Date()): number {
    return this.#owner.transaction(() => {
      const interrupted = this.#database
        .prepare(
          `SELECT attempt.id, attempt.activation_id, activation.task_id,
                  activation.target_agent_id, activation.retry_cycle_start, attempt.provisional_probe
           FROM attempts attempt
           JOIN activations activation ON activation.id = attempt.activation_id
           WHERE attempt.status = 'running' AND activation.status = 'running'
           ORDER BY attempt.rowid`,
        )
        .all() as Array<{
          id: string;
          activation_id: string;
          task_id: string;
          target_agent_id: string;
          retry_cycle_start: number;
          provisional_probe: number;
        }>;
      for (const attempt of interrupted) {
        const waiting = this.#recovery.readWaiting(attempt.activation_id);
        if (attempt.provisional_probe === 1 && waiting) {
          this.#database.prepare("DELETE FROM attempts WHERE id = ?").run(attempt.id);
          const dueAt = new Date(Math.max(Date.parse(waiting.dueAt), now.getTime() + 60_000)).toISOString();
          this.#database.prepare("UPDATE runtime_recovery_episodes SET next_eligible_at = ? WHERE id = ?").run(dueAt, waiting.episodeId);
          this.#database.prepare("UPDATE activations SET status = 'queued', retry_due_at = ? WHERE id = ?").run(dueAt, attempt.activation_id);
          continue;
        }
        this.#recovery.finishWithinTransaction(attempt.activation_id, "ordinary", now);
        const occurredAt = now.toISOString();
        const summary = "The previous host stopped while this attempt was active.";
        this.#database
          .prepare(
            `UPDATE attempts
             SET status = 'failed', completed_at = ?, outcome_status = 'failed', outcome_summary = ?
             WHERE id = ?`,
          )
          .run(occurredAt, summary, attempt.id);
        this.#database
          .prepare("DELETE FROM activation_dispatch_claims WHERE attempt_id = ?")
          .run(attempt.id);
        this.settleTechnicalFailure(
          attempt.activation_id,
          attempt.task_id,
          attempt.retry_cycle_start,
          summary,
          now,
        );
        this.#activityJournal.append(
          attempt.task_id,
          "attempt.completed",
          { kind: "framework", id: "coordination" },
          {
            activationId: attempt.activation_id,
            attemptId: attempt.id,
            interruption: "host-stopped",
          },
          occurredAt,
        );
      }
      return interrupted.length;
    });
  }

  interrupt(input: InterruptAttempt): void {
    this.#owner.transaction(() => {
      const attempt = this.#database
        .prepare(
          `SELECT attempt.activation_id, attempt.thread_id,
                  activation.task_id, activation.target_agent_id
           FROM attempts attempt
           JOIN activations activation ON activation.id = attempt.activation_id
           WHERE attempt.id = ? AND attempt.status = 'running'
             AND activation.status = 'running'`,
        )
        .get(input.attemptId) as
        | {
            activation_id: string;
            thread_id: string | null;
            task_id: string;
            target_agent_id: string;
          }
        | undefined;
      if (attempt === undefined) throw new Error(`Attempt ${input.attemptId} is not running`);
      this.#attemptEvidence.recordWithinSettlement({
        attemptId: input.attemptId,
        ...(input.transcript === undefined ? {} : { transcript: input.transcript }),
        ...(input.usage === undefined ? {} : { reportedUsage: input.usage }),
        ...(input.pricing === undefined ? {} : { pricing: input.pricing }),
        ...(input.resumedThreadId === undefined ? {} : { resumedThreadId: input.resumedThreadId }),
        ...(attempt.thread_id === null ? {} : { completedThreadId: attempt.thread_id }),
      });
      const occurredAt = input.now.toISOString();
      const summary = "The user interrupted this attempt.";
      this.#activityJournal.promoteProbe(input.attemptId, occurredAt);
      this.#recovery.finishWithinTransaction(attempt.activation_id, "stopped", input.now);
      this.#database
        .prepare(
          `UPDATE attempts
           SET status = 'failed', completed_at = ?, outcome_status = 'failed',
               outcome_summary = ?, outcome_kind = 'interrupted', context_window_usage_json = ?
           WHERE id = ?`,
        )
        .run(
          occurredAt,
          summary,
          serializedContextWindowUsage(input.contextWindowUsage),
          input.attemptId,
        );
      this.#database
        .prepare(
          `UPDATE activations
           SET status = 'queued', retry_due_at = NULL,
               failure_kind = NULL, failure_summary = NULL
           WHERE id = ?`,
        )
        .run(attempt.activation_id);
      this.#database
        .prepare(
          `UPDATE tasks
           SET automation_suspended = 1, suspended_activation_id = ?
           WHERE id = ?`,
        )
        .run(attempt.activation_id, attempt.task_id);
      this.#activityJournal.append(
        attempt.task_id,
        "attempt.completed",
        input.actor,
        { activationId: attempt.activation_id, attemptId: input.attemptId, interruption: "user" },
        occurredAt,
      );
      this.#activityJournal.append(
        attempt.task_id,
        "automation.suspended",
        input.actor,
        { activationId: attempt.activation_id, attemptId: input.attemptId },
        occurredAt,
      );
      this.#idempotentCommands.retain({
        kind: "interrupt-task",
        idempotencyKey: input.idempotencyKey,
      }, {
        taskId: attempt.task_id,
      });
    });
  }

  readRunningAttemptScope(attemptId: string): {
    taskId: string;
    agent: AgentRunAgent;
    boardId: string;
  } | undefined {
    const row = this.#database.prepare(
      `SELECT activation.task_id, activation.target_agent_id,
              task.board_id, agent.name, agent.role, agent.summary, agent.instructions_content
       FROM attempts attempt
       JOIN activations activation ON activation.id = attempt.activation_id
       JOIN tasks task ON task.id = activation.task_id
       JOIN agents agent ON agent.id = activation.target_agent_id AND agent.applied = 1
       WHERE attempt.id = ? AND attempt.status = 'running' AND activation.status = 'running'`,
    ).get(attemptId) as {
      task_id: string;
      target_agent_id: string;
      board_id: string;
      name: string;
      role: string;
      summary: string;
      instructions_content: string;
    } | undefined;
    return row === undefined ? undefined : {
      taskId: row.task_id,
      boardId: row.board_id,
      agent: {
        id: row.target_agent_id,
        name: row.name,
        role: row.role,
        summary: row.summary,
        instructions: row.instructions_content,
      },
    };
  }

  readInterruptedCommand(idempotencyKey: string): { taskId: string } | undefined {
    return this.#idempotentCommands.replay({ kind: "interrupt-task", idempotencyKey });
  }

  readActiveRuns(): ActiveRunView[] {
    const rows = this.#database.prepare(
      `SELECT attempt.id AS attempt_id, task.id AS task_id, task.title AS task_title,
              board.id AS board_id, board.name AS board_name,
              column.id AS column_id, column.name AS column_name,
              activation.target_agent_id, attempt.started_at
       FROM attempts attempt
       JOIN activations activation ON activation.id = attempt.activation_id
       JOIN tasks task ON task.id = activation.task_id
       JOIN boards board ON board.id = task.board_id
       JOIN columns column ON column.board_id = task.board_id AND column.id = task.column_id
       WHERE attempt.status = 'running' AND activation.status = 'running'
       ORDER BY attempt.rowid`,
    ).all() as Array<{
      attempt_id: string;
      task_id: string;
      task_title: string;
      board_id: string;
      board_name: string;
      column_id: string;
      column_name: string;
      target_agent_id: string;
      started_at: string;
    }>;
    return rows.map((row) => ({
      attemptId: row.attempt_id,
      taskId: row.task_id,
      taskTitle: row.task_title,
      boardId: row.board_id,
      boardName: row.board_name,
      columnId: row.column_id,
      columnName: row.column_name,
      agentId: row.target_agent_id,
      status: "running",
      startedAt: row.started_at,
    }));
  }

  recordThreadStarted(attemptId: string, threadId: string): void {
    this.#owner.transaction(() => {
      const scope = this.#database.prepare(`SELECT attempt.provisional_probe, conversation.current_thread_id FROM attempts attempt
        JOIN activations activation ON activation.id = attempt.activation_id
        LEFT JOIN agent_conversations conversation ON conversation.id = activation.conversation_id WHERE attempt.id = ?`).get(attemptId) as
        { provisional_probe: number; current_thread_id: string | null } | undefined;
      if (scope?.provisional_probe === 1 && scope.current_thread_id !== threadId) this.#activityJournal.promoteProbe(attemptId, new Date().toISOString());
      const result = this.#database
        .prepare("UPDATE attempts SET thread_id = ? WHERE id = ? AND status = 'running'")
        .run(threadId, attemptId);
      if (result.changes !== 1) throw new Error(`Attempt ${attemptId} is not running`);
      if (scope?.provisional_probe === 1 && scope.current_thread_id === threadId) return;
      const activity = this.#database
        .prepare(
          `SELECT id, details_json
           FROM activity_ledger
           WHERE type = 'attempt.started'
             AND json_extract(details_json, '$.attemptId') = ?`,
        )
        .get(attemptId) as { id: string; details_json: string } | undefined;
      if (activity === undefined) {
        throw new Error(`Run-start activity for attempt ${attemptId} is missing`);
      }
      const details = JSON.parse(activity.details_json) as Record<string, string>;
      this.#database
        .prepare("UPDATE activity_ledger SET details_json = ? WHERE id = ?")
        .run(JSON.stringify({ ...details, threadId }), activity.id);
      this.updateConversationActivity(attemptId, new Date().toISOString(), threadId);
    });
  }

  recordReviewerPolicyConfigured(attemptId: string, configuration: ReviewerPolicyConfiguration): void {
    this.#owner.transaction(() => {
      const row = this.#database.prepare(
        "SELECT reviewer_allowances_json FROM attempts WHERE id = ? AND status = 'running'",
      ).get(attemptId) as { reviewer_allowances_json: string | null } | undefined;
      if (row?.reviewer_allowances_json == null) return;
      const prior = JSON.parse(row.reviewer_allowances_json) as ReviewerAllowanceEvidence;
      this.#database.prepare("UPDATE attempts SET reviewer_allowances_json = ? WHERE id = ?")
        .run(JSON.stringify({
          ...prior,
          status: configuration.status,
          reason: configuration.reason,
          ...(configuration.policyHash === undefined ? {} : { policyHash: configuration.policyHash }),
          ...(configuration.templateHash === undefined ? {} : { templateHash: configuration.templateHash }),
          configurations: [...(prior.configurations ?? []), configuration],
        }), attemptId);
    });
  }

  settle(input: SettleAttempt): void {
    this.#owner.transaction(() => {
      const attempt = this.#database
        .prepare(
          `SELECT attempt.activation_id, attempt.thread_id,
                  a.task_id, a.target_agent_id,
                  a.retry_cycle_start, attempt.provisional_probe
           FROM attempts attempt
           JOIN activations a ON a.id = attempt.activation_id
           WHERE attempt.id = ? AND attempt.status = 'running'`,
        )
        .get(input.attemptId) as
        | {
            activation_id: string;
            thread_id: string | null;
            task_id: string;
            target_agent_id: string;
            retry_cycle_start: number;
            provisional_probe: number;
          }
        | undefined;
      if (attempt === undefined) throw new Error(`Attempt ${input.attemptId} is not running`);
      const transient = input.outcome.status === "failed" ? classifyRuntimeFailure(input.outcome.summary, input.outcome.failure, input.now) : undefined;
      const usageEvidence = { attemptId: input.attemptId,
        ...(input.usage === undefined ? {} : { reportedUsage: input.usage }),
        ...(input.resumedThreadId === undefined ? {} : { resumedThreadId: input.resumedThreadId }),
        ...(input.outcome.threadId === undefined && attempt.thread_id === null ? {} : { completedThreadId: input.outcome.threadId ?? attempt.thread_id! }) };
      const meaningful = input.transcript?.some(meaningfulTranscriptItem) ||
        this.#attemptEvidence.hasMeaningfulUsage(usageEvidence) || input.contextWindowUsage !== undefined ||
        input.outcome.threadContinuity !== undefined || (input.outcome.threadId !== undefined && input.outcome.threadId !== input.resumedThreadId);
      if (attempt.provisional_probe === 1 && transient && !meaningful) {
        this.#database.prepare("DELETE FROM attempts WHERE id = ?").run(input.attemptId);
        this.#recovery.recordFailureWithinTransaction(attempt.activation_id, transient, input.now);
        return;
      }
      this.#activityJournal.promoteProbe(input.attemptId, input.now.toISOString());
      if (transient) this.#database.prepare("UPDATE attempts SET runtime_failure_class = ?, runtime_failure_json = ? WHERE id = ?")
        .run(transient.kind, JSON.stringify(input.outcome.failure ?? {}), input.attemptId);
      else this.#recovery.finishWithinTransaction(attempt.activation_id, input.outcome.status === "completed" ? "recovered" : "ordinary", input.now);
      this.#attemptEvidence.recordWithinSettlement({
        attemptId: input.attemptId,
        ...(input.transcript === undefined ? {} : { transcript: input.transcript }),
        ...(input.usage === undefined ? {} : { reportedUsage: input.usage }),
        ...(input.pricing === undefined ? {} : { pricing: input.pricing }),
        ...(input.resumedThreadId === undefined ? {} : { resumedThreadId: input.resumedThreadId }),
        ...(input.outcome.threadId === undefined && attempt.thread_id === null
          ? {}
          : { completedThreadId: input.outcome.threadId ?? attempt.thread_id! }),
      });
      const occurredAt = input.now.toISOString();
      const persistedStatus = input.outcome.status === "completed" ? "completed" : "failed";
      const outcomeKind = input.outcome.status === "permission-blocked" ? "permission" : input.outcome.status;
      this.#database
        .prepare(
          `UPDATE attempts
           SET status = ?, completed_at = ?, outcome_status = ?, outcome_summary = ?,
               thread_id = COALESCE(?, thread_id), outcome_kind = ?, thread_continuity = ?,
               context_window_usage_json = ?
           WHERE id = ?`,
        )
        .run(
          persistedStatus,
          occurredAt,
          persistedStatus,
          input.outcome.summary,
          input.outcome.threadId ?? null,
          outcomeKind,
          input.outcome.threadContinuity ?? null,
          serializedContextWindowUsage(input.contextWindowUsage),
          input.attemptId,
        );
      if (input.outcome.status === "completed") {
        this.#database
          .prepare(
            `UPDATE activations
             SET status = 'completed', retry_due_at = NULL,
                 failure_kind = NULL, failure_summary = NULL
             WHERE id = ?`,
          )
          .run(attempt.activation_id);
      } else if (input.outcome.status === "permission-blocked") {
        this.#database
          .prepare(
            `UPDATE activations
             SET status = 'failed', retry_due_at = NULL,
                 failure_kind = 'permission', failure_summary = ?
             WHERE id = ?`,
          )
          .run(input.outcome.summary, attempt.activation_id);
        this.createFailureAttention(attempt.task_id, attempt.activation_id, occurredAt);
      } else if (transient) {
        this.#recovery.recordFailureWithinTransaction(attempt.activation_id, transient, input.now);
      } else {
        this.settleTechnicalFailure(
          attempt.activation_id,
          attempt.task_id,
          attempt.retry_cycle_start,
          input.outcome.summary,
          input.now,
        );
      }
      this.#activityJournal.append(
        attempt.task_id,
        "attempt.completed",
        { kind: "agent", id: attempt.target_agent_id },
        { activationId: attempt.activation_id, attemptId: input.attemptId },
        occurredAt,
      );
      if (input.outcome.threadId !== undefined) {
        this.updateConversationActivity(input.attemptId, occurredAt, input.outcome.threadId);
      } else {
        this.updateConversationActivity(input.attemptId, occurredAt);
      }
    });
  }

  private updateConversationActivity(attemptId: string, occurredAt: string, threadId?: string): void {
    this.#database.prepare(
      `UPDATE agent_conversations
       SET current_thread_id = COALESCE(?, current_thread_id),
           latest_activity_at = ?,
           latest_activity_sequence = (SELECT COALESCE(MAX(sequence), 0) FROM activity_ledger)
       WHERE id = (
         SELECT activation.conversation_id
         FROM attempts attempt
         JOIN activations activation ON activation.id = attempt.activation_id
         WHERE attempt.id = ?
       )`,
    ).run(threadId ?? null, occurredAt, attemptId);
  }

  private createFailureAttention(taskId: string, activationId: string, occurredAt: string): void {
    this.#attentionRecorder.record(
      "failed-run",
      taskId,
      activationId,
      occurredAt,
    );
  }

  private settleTechnicalFailure(
    activationId: string,
    taskId: string,
    retryCycleStart: number,
    summary: string,
    now: Date,
  ): void {
    const attempts = this.#database
      .prepare("SELECT COUNT(*) AS count FROM (SELECT runtime_failure_class FROM attempts WHERE activation_id = ? ORDER BY rowid LIMIT -1 OFFSET ?) WHERE runtime_failure_class IS NULL")
      .get(activationId, retryCycleStart) as { count: number };
    const cycleAttempt = attempts.count;
    if (cycleAttempt < 3) {
      this.#database
        .prepare(
          `UPDATE activations
           SET status = 'queued', retry_due_at = ?,
               failure_kind = 'technical', failure_summary = ?
           WHERE id = ?`,
        )
        .run(retryDueAt(now, cycleAttempt), summary, activationId);
      return;
    }
    this.#database
      .prepare(
        `UPDATE activations
         SET status = 'failed', retry_due_at = NULL,
             failure_kind = 'technical', failure_summary = ?
         WHERE id = ?`,
      )
      .run(summary, activationId);
    this.createFailureAttention(taskId, activationId, now.toISOString());
  }

}

function serializedContextWindowUsage(usage: AttemptContextWindowUsage | undefined): string | null {
  return usage === undefined ? null : JSON.stringify(usage);
}

function meaningfulTranscriptItem(item: AttemptTranscriptItem): boolean {
  return item.kind !== "diagnostic" && (item.kind !== "message" || item.text.trim().length > 0);
}

function retryDueAt(now: Date, cycleAttempt: number): string {
  const backoffMs = Math.min(5_000 * (2 ** (cycleAttempt - 1)), 30_000);
  return new Date(now.getTime() + backoffMs).toISOString();
}
