import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type {
  ActiveRunView,
  ActivationView,
  Actor,
  AgentRunAgent,
  AgentRunOutcome,
  AttemptTranscriptItem,
  RuntimeStartupBoundary,
  RuntimeStartupDiagnostic,
  TaskActivityView,
  TaskWorkspaceView,
  TaskView,
} from "../coordination-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { TaskProjectionStore } from "./task-projection-store.ts";
import type { CommandResponseStore } from "./command-response-store.ts";

export interface RunnableActivation {
  activation: ActivationView;
  task: TaskView;
  agent: AgentRunAgent;
  sourceEvent: TaskActivityView | TaskView["comments"][number];
  continuationMessage: string | null;
}

export class AutomationStateStore {
  readonly #owner: CoordinationDatabase;
  readonly #database: DatabaseSync;
  readonly #taskProjections: TaskProjectionStore;
  readonly #commandResponses: CommandResponseStore;

  constructor(
    database: CoordinationDatabase,
    taskProjections: TaskProjectionStore,
    commandResponses: CommandResponseStore,
  ) {
    this.#owner = database;
    this.#database = database.connection;
    this.#taskProjections = taskProjections;
    this.#commandResponses = commandResponses;
  }

  recoverInterruptedAttempts(now = new Date()): number {
    return this.#owner.transaction(() => {
      const interrupted = this.#database
        .prepare(
          `SELECT attempt.id, attempt.activation_id, activation.task_id,
                  activation.target_agent_id, activation.retry_cycle_start,
                  (SELECT COUNT(*) FROM attempts counted
                   WHERE counted.activation_id = activation.id) AS attempt_count
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
          attempt_count: number;
        }>;
      for (const attempt of interrupted) {
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
        const cycleAttempt = attempt.attempt_count - attempt.retry_cycle_start;
        if (cycleAttempt < 3) {
          this.#database
            .prepare(
              `UPDATE activations
               SET status = 'queued', retry_due_at = ?,
                   failure_kind = 'technical', failure_summary = ?
               WHERE id = ?`,
            )
            .run(
              retryDueAt(now, cycleAttempt),
              summary,
              attempt.activation_id,
            );
        } else {
          this.#database
            .prepare(
              `UPDATE activations
               SET status = 'failed', retry_due_at = NULL,
                   failure_kind = 'technical', failure_summary = ?
               WHERE id = ?`,
            )
            .run(summary, attempt.activation_id);
          this.createFailureAttention(attempt.task_id, attempt.activation_id, occurredAt);
        }
        this.appendActivity(
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

  readNextRunnableActivation(now: string): RunnableActivation | undefined {
    const row = this.#database
      .prepare(
        `SELECT a.id, a.task_id, a.target_agent_id, a.source_event_id,
                a.model, a.reasoning_effort, a.continuation_message
         FROM activations a
         JOIN tasks task ON task.id = a.task_id
         JOIN mapped_tasks mapped ON mapped.id = task.id
         JOIN agents agent ON agent.id = a.target_agent_id AND agent.applied = 1
         WHERE a.status = 'queued'
           AND a.stale = 0
           AND task.automation_suspended = 0
           AND (a.retry_due_at IS NULL OR a.retry_due_at <= ?)
           AND NOT EXISTS (
             SELECT 1
             FROM task_relationships relationship
             JOIN tasks blocker ON blocker.id = relationship.target_task_id
             WHERE relationship.type IN ('dependency', 'parent-child')
               AND relationship.source_task_id = a.task_id
               AND blocker.column_id <> 'completion'
           )
           AND NOT EXISTS (
             SELECT 1
             FROM activations earlier
             WHERE earlier.task_id = a.task_id
               AND earlier.sequence < a.sequence
               AND earlier.status <> 'completed'
           )
         ORDER BY a.sequence
         LIMIT 1`,
      )
      .get(now) as
      | {
          id: string;
          task_id: string;
          target_agent_id: string;
          source_event_id: string;
          model: string | null;
          reasoning_effort: NonNullable<AgentRunAgent["reasoningEffort"]> | null;
          continuation_message: string | null;
        }
      | undefined;
    if (row === undefined) return undefined;
    const task = this.#taskProjections.readTask(row.task_id);
    const activation = task?.activations.find((candidate) => candidate.id === row.id);
    const agentRow = this.#database
      .prepare(
        `SELECT id, name, role, summary, instructions_content
         FROM agents
         WHERE id = ?`,
      )
      .get(row.target_agent_id) as
      | {
          id: string;
          name: string;
          role: string;
          summary: string;
          instructions_content: string;
        }
      | undefined;
    const sourceEvent = this.#taskProjections.readSourceEvent(row.source_event_id);
    if (
      task === undefined ||
      activation === undefined ||
      agentRow === undefined ||
      sourceEvent === undefined
    ) {
      throw new Error(`Activation ${row.id} has incomplete durable provenance`);
    }
    return {
      activation,
      task,
      agent: {
        id: agentRow.id,
        name: agentRow.name,
        role: agentRow.role,
        summary: agentRow.summary,
        instructions: agentRow.instructions_content,
        ...(row.model === null ? {} : { model: row.model }),
        ...(row.reasoning_effort === null
          ? {}
          : { reasoningEffort: row.reasoning_effort }),
      },
      sourceEvent,
      continuationMessage: row.continuation_message,
    };
  }

  readNextRetryDueAt(now: string): string | undefined {
    const row = this.#database
      .prepare(
        `SELECT MIN(a.retry_due_at) AS retry_due_at
         FROM activations a
         WHERE a.status = 'queued' AND a.retry_due_at > ?
           AND NOT EXISTS (
             SELECT 1 FROM activations earlier
             WHERE earlier.task_id = a.task_id
               AND earlier.sequence < a.sequence
               AND earlier.status <> 'completed'
           )`,
      )
      .get(now) as { retry_due_at: string | null };
    return row.retry_due_at ?? undefined;
  }

  readTaskWorkspace(taskId: string): TaskWorkspaceView | undefined {
    const row = this.#database
      .prepare(
        `SELECT path, starting_ref, commit_id
         FROM task_workspaces
         WHERE task_id = ?`,
      )
      .get(taskId) as
      | { path: string; starting_ref: string; commit_id: string }
      | undefined;
    return row === undefined
      ? undefined
      : { path: row.path, startingRef: row.starting_ref, commit: row.commit_id };
  }

  readTaskWorkspaces(): Array<{ taskId: string; workspace: TaskWorkspaceView }> {
    const rows = this.#database
      .prepare(
        `SELECT task_id, path, starting_ref, commit_id
         FROM task_workspaces
         ORDER BY task_id`,
      )
      .all() as Array<{
        task_id: string;
        path: string;
        starting_ref: string;
        commit_id: string;
      }>;
    return rows.map((row) => ({
      taskId: row.task_id,
      workspace: { path: row.path, startingRef: row.starting_ref, commit: row.commit_id },
    }));
  }

  saveTaskWorkspace(taskId: string, workspace: TaskWorkspaceView): void {
    this.#database
      .prepare(
        `INSERT INTO task_workspaces (task_id, path, starting_ref, commit_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run(taskId, workspace.path, workspace.startingRef, workspace.commit);
  }

  tryClaimActivation(
    activationId: string,
    workspacePath: string,
    agent: AgentRunAgent,
  ): { id: string; number: number } | undefined {
    return this.#owner.transaction(() => {
      const result = this.#database
        .prepare(
          `UPDATE activations
           SET status = 'running', retry_due_at = NULL, continuation_message = NULL
           WHERE id = ? AND status = 'queued'`,
        )
        .run(activationId);
      if (result.changes !== 1) return undefined;
      const priorAttempts = this.#database
        .prepare("SELECT COUNT(*) AS count FROM attempts WHERE activation_id = ?")
        .get(activationId) as { count: number };
      const attemptId = randomUUID();
      this.#database
        .prepare(
          `INSERT INTO attempts
            (id, activation_id, status, workspace_path, started_at, model, reasoning_effort)
           VALUES (?, ?, 'running', ?, ?, ?, ?)`,
        )
        .run(
          attemptId,
          activationId,
          workspacePath,
          new Date().toISOString(),
          agent.model ?? null,
          agent.reasoningEffort ?? null,
        );
      this.#database
        .prepare(
          `INSERT INTO activation_dispatch_claims (attempt_id, activation_id, claimed_at)
           VALUES (?, ?, ?)`,
        )
        .run(attemptId, activationId, new Date().toISOString());
      return { id: attemptId, number: priorAttempts.count + 1 };
    });
  }

  releaseDispatchClaim(
    attemptId: string,
    activationId: string,
    continuationMessage: string | null,
  ): void {
    this.#owner.transaction(() => {
      this.#database
        .prepare("DELETE FROM attempts WHERE id = ? AND activation_id = ?")
        .run(attemptId, activationId);
      this.#database
        .prepare(
          `UPDATE activations
           SET status = 'queued', continuation_message = ?
           WHERE id = ? AND status = 'running'`,
        )
        .run(continuationMessage, activationId);
    });
  }

  interruptAttempt(
    attemptId: string,
    now: Date,
    actor: Actor & { kind: "user" },
    idempotencyKey: string,
    transcript?: AttemptTranscriptItem[],
  ): void {
    this.#owner.transaction(() => {
      const attempt = this.#database
        .prepare(
          `SELECT attempt.activation_id, activation.task_id, activation.target_agent_id
           FROM attempts attempt
           JOIN activations activation ON activation.id = attempt.activation_id
           WHERE attempt.id = ? AND attempt.status = 'running'
             AND activation.status = 'running'`,
        )
        .get(attemptId) as
        | { activation_id: string; task_id: string; target_agent_id: string }
        | undefined;
      if (attempt === undefined) throw new Error(`Attempt ${attemptId} is not running`);
      if (transcript !== undefined) this.persistAttemptTranscript(attemptId, transcript);
      const occurredAt = now.toISOString();
      const summary = "The user interrupted this attempt.";
      this.#database
        .prepare(
          `UPDATE attempts
           SET status = 'failed', completed_at = ?, outcome_status = 'failed',
               outcome_summary = ?, outcome_kind = 'interrupted'
           WHERE id = ?`,
        )
        .run(occurredAt, summary, attemptId);
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
      this.appendActivity(
        attempt.task_id,
        "attempt.completed",
        actor,
        { activationId: attempt.activation_id, attemptId, interruption: "user" },
        occurredAt,
      );
      this.appendActivity(
        attempt.task_id,
        "automation.suspended",
        actor,
        { activationId: attempt.activation_id, attemptId },
        occurredAt,
      );
      this.#commandResponses.write("interrupt-task", idempotencyKey, {
        taskId: attempt.task_id,
      });
    });
  }

  continueInterruptedTask(
    taskId: string,
    message: string,
    idempotencyKey: string,
    actor: Actor & { kind: "user" },
  ): string | undefined {
    return this.#owner.transaction(() => {
      const replay = this.#commandResponses.read<{ activationId: string }>(
        "continue-interrupted-task",
        idempotencyKey,
      );
      if (replay !== undefined) return replay.activationId;
      const row = this.#database
        .prepare(
          `SELECT suspended_activation_id
           FROM tasks
           WHERE id = ? AND automation_suspended = 1`,
        )
        .get(taskId) as { suspended_activation_id: string | null } | undefined;
      if (row?.suspended_activation_id === null || row === undefined) return undefined;
      const continuationMessage = message.trim().length === 0
        ? "Reassess the current task and workspace state before proceeding."
        : message.trim();
      this.#database
        .prepare("UPDATE activations SET continuation_message = ? WHERE id = ?")
        .run(continuationMessage, row.suspended_activation_id);
      this.#database
        .prepare(
          `UPDATE tasks
           SET automation_suspended = 0, suspended_activation_id = NULL
           WHERE id = ?`,
        )
        .run(taskId);
      const occurredAt = new Date().toISOString();
      this.appendActivity(
        taskId,
        "automation.resumed",
        actor,
        { activationId: row.suspended_activation_id },
        occurredAt,
      );
      this.#commandResponses.write(
        "continue-interrupted-task",
        idempotencyKey,
        { activationId: row.suspended_activation_id },
      );
      return row.suspended_activation_id;
    });
  }

  readInterruptedCommand(idempotencyKey: string): { taskId: string } | undefined {
    return this.#commandResponses.read("interrupt-task", idempotencyKey);
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

  startAttempt(attemptId: string): { runStartActivityId: string } {
    return this.#owner.transaction(() => {
      const activation = this.#database
        .prepare(
          `SELECT activation.id, activation.task_id, activation.target_agent_id
           FROM attempts attempt
           JOIN activations activation ON activation.id = attempt.activation_id
           JOIN activation_dispatch_claims claim ON claim.attempt_id = attempt.id
           WHERE attempt.id = ? AND attempt.status = 'running'
             AND activation.status = 'running'`,
        )
        .get(attemptId) as
        | { id: string; task_id: string; target_agent_id: string }
        | undefined;
      if (activation === undefined) throw new Error(`Attempt ${attemptId} is not starting`);
      const occurredAt = new Date().toISOString();
      this.#database
        .prepare("UPDATE attempts SET started_at = ? WHERE id = ?")
        .run(occurredAt, attemptId);
      const runStartActivityId = this.appendActivity(
        activation.task_id,
        "attempt.started",
        { kind: "agent", id: activation.target_agent_id },
        { activationId: activation.id, attemptId },
        occurredAt,
      );
      this.#database
        .prepare("DELETE FROM activation_dispatch_claims WHERE attempt_id = ?")
        .run(attemptId);
      return { runStartActivityId };
    });
  }

  recordActivationStartupFailure(
    activationId: string,
    boundary: RuntimeStartupBoundary,
    diagnostic: string,
  ): RuntimeStartupDiagnostic {
    return this.#owner.transaction(() => {
      const activation = this.#database
        .prepare("SELECT task_id FROM activations WHERE id = ? AND status = 'running'")
        .get(activationId) as { task_id: string } | undefined;
      if (activation === undefined) throw new Error(`Activation ${activationId} is not starting`);
      const occurredAt = new Date().toISOString();
      this.#database
        .prepare(
          `UPDATE activations
           SET status = 'failed', failure_kind = 'technical', failure_summary = ?
           WHERE id = ?`,
        )
        .run(diagnostic, activationId);
      this.#database
        .prepare(
          `DELETE FROM attempts
           WHERE activation_id = ?
             AND id IN (SELECT attempt_id FROM activation_dispatch_claims)`,
        )
        .run(activationId);
      this.#database
        .prepare(
          `INSERT INTO activation_startup_failures
            (activation_id, occurred_at, boundary, diagnostic, resolved_at)
           VALUES (?, ?, ?, ?, NULL)`,
        )
        .run(activationId, occurredAt, boundary, diagnostic);
      const attentionReasonId = randomUUID();
      this.#database
        .prepare(
          `INSERT INTO attention_reasons
            (id, task_id, type, source_event_id, created_at, resolved_at)
           VALUES (?, ?, 'failed-run', ?, ?, NULL)`,
        )
        .run(attentionReasonId, activation.task_id, activationId, occurredAt);
      this.appendActivity(
        activation.task_id,
        "attention.created",
        { kind: "framework", id: "coordination" },
        { attentionReasonId, reasonType: "failed-run", sourceEventId: activationId },
        occurredAt,
      );
      return {
        taskId: activation.task_id,
        activationId,
        occurredAt,
        boundary,
        diagnostic,
        resolvedAt: null,
      };
    });
  }

  recordAttemptThreadId(attemptId: string, runStartActivityId: string, threadId: string): void {
    this.#owner.transaction(() => {
      const result = this.#database
        .prepare("UPDATE attempts SET thread_id = ? WHERE id = ? AND status = 'running'")
        .run(threadId, attemptId);
      if (result.changes !== 1) throw new Error(`Attempt ${attemptId} is not running`);
      const activity = this.#database
        .prepare(
          `SELECT details_json
           FROM activity_ledger
           WHERE id = ? AND type = 'attempt.started'`,
        )
        .get(runStartActivityId) as { details_json: string } | undefined;
      if (activity === undefined) {
        throw new Error(`Run-start activity ${runStartActivityId} is missing`);
      }
      const details = JSON.parse(activity.details_json) as Record<string, string>;
      this.#database
        .prepare("UPDATE activity_ledger SET details_json = ? WHERE id = ?")
        .run(JSON.stringify({ ...details, threadId }), runStartActivityId);
    });
  }

  completeAttempt(
    attemptId: string,
    outcome: AgentRunOutcome,
    now: Date,
    automaticRetry = true,
    transcript?: AttemptTranscriptItem[],
  ): void {
    this.#owner.transaction(() => {
      const attempt = this.#database
        .prepare(
          `SELECT attempt.activation_id, a.task_id, a.target_agent_id,
                  a.retry_cycle_start
           FROM attempts attempt
           JOIN activations a ON a.id = attempt.activation_id
           WHERE attempt.id = ? AND attempt.status = 'running'`,
        )
        .get(attemptId) as
        | {
            activation_id: string;
            task_id: string;
            target_agent_id: string;
            retry_cycle_start: number;
          }
        | undefined;
      if (attempt === undefined) throw new Error(`Attempt ${attemptId} is not running`);
      if (transcript !== undefined) this.persistAttemptTranscript(attemptId, transcript);
      const occurredAt = now.toISOString();
      const persistedStatus = outcome.status === "completed" ? "completed" : "failed";
      const outcomeKind = outcome.status === "permission-blocked" ? "permission" : outcome.status;
      this.#database
        .prepare(
          `UPDATE attempts
           SET status = ?, completed_at = ?, outcome_status = ?, outcome_summary = ?,
               thread_id = COALESCE(?, thread_id), outcome_kind = ?
           WHERE id = ?`,
        )
        .run(
          persistedStatus,
          occurredAt,
          persistedStatus,
          outcome.summary,
          outcome.threadId ?? null,
          outcomeKind,
          attemptId,
        );
      if (outcome.status === "completed") {
        this.#database
          .prepare(
            `UPDATE activations
             SET status = 'completed', retry_due_at = NULL,
                 failure_kind = NULL, failure_summary = NULL
             WHERE id = ?`,
          )
          .run(attempt.activation_id);
      } else if (outcome.status === "permission-blocked") {
        this.#database
          .prepare(
            `UPDATE activations
             SET status = 'failed', retry_due_at = NULL,
                 failure_kind = 'permission', failure_summary = ?
             WHERE id = ?`,
          )
          .run(outcome.summary, attempt.activation_id);
        this.createFailureAttention(attempt.task_id, attempt.activation_id, occurredAt);
      } else if (!automaticRetry) {
        this.#database
          .prepare(
            `UPDATE activations
             SET status = 'failed', retry_due_at = NULL,
                 failure_kind = 'technical', failure_summary = ?
             WHERE id = ?`,
          )
          .run(outcome.summary, attempt.activation_id);
      } else {
        const attempts = this.#database
          .prepare("SELECT COUNT(*) AS count FROM attempts WHERE activation_id = ?")
          .get(attempt.activation_id) as { count: number };
        const cycleAttempt = attempts.count - attempt.retry_cycle_start;
        if (cycleAttempt < 3) {
          this.#database
            .prepare(
              `UPDATE activations
               SET status = 'queued', retry_due_at = ?,
                   failure_kind = 'technical', failure_summary = ?
               WHERE id = ?`,
            )
            .run(retryDueAt(now, cycleAttempt), outcome.summary, attempt.activation_id);
        } else {
          this.#database
            .prepare(
              `UPDATE activations
               SET status = 'failed', retry_due_at = NULL,
                   failure_kind = 'technical', failure_summary = ?
               WHERE id = ?`,
            )
            .run(outcome.summary, attempt.activation_id);
          this.createFailureAttention(attempt.task_id, attempt.activation_id, occurredAt);
        }
      }
      this.appendActivity(
        attempt.task_id,
        "attempt.completed",
        { kind: "agent", id: attempt.target_agent_id },
        { activationId: attempt.activation_id, attemptId },
        occurredAt,
      );
    });
  }

  private persistAttemptTranscript(attemptId: string, transcript: AttemptTranscriptItem[]): void {
    this.#database
      .prepare(
        `INSERT INTO attempt_transcripts (attempt_id, items_json)
         VALUES (?, ?)
         ON CONFLICT(attempt_id) DO UPDATE SET items_json = excluded.items_json`,
      )
      .run(attemptId, JSON.stringify(transcript));
  }

  private createFailureAttention(taskId: string, activationId: string, occurredAt: string): void {
    const attentionReasonId = randomUUID();
    this.#database
      .prepare(
        `INSERT INTO attention_reasons
          (id, task_id, type, source_event_id, created_at, resolved_at)
         VALUES (?, ?, 'failed-run', ?, ?, NULL)`,
      )
      .run(attentionReasonId, taskId, activationId, occurredAt);
    this.appendActivity(
      taskId,
      "attention.created",
      { kind: "framework", id: "coordination" },
      { attentionReasonId, reasonType: "failed-run", sourceEventId: activationId },
      occurredAt,
    );
  }

  private appendActivity(
    taskId: string,
    type: TaskActivityView["type"],
    actor: TaskActivityView["actor"],
    details: Record<string, string>,
    occurredAt: string,
  ): string {
    const id = randomUUID();
    this.#database
      .prepare(
        `INSERT INTO activity_ledger
          (id, task_id, type, actor_kind, actor_id, occurred_at, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, taskId, type, actor.kind, actor.id, occurredAt, JSON.stringify(details));
    return id;
  }
}

function retryDueAt(now: Date, cycleAttempt: number): string {
  const backoffMs = Math.min(5_000 * (2 ** (cycleAttempt - 1)), 30_000);
  return new Date(now.getTime() + backoffMs).toISOString();
}
