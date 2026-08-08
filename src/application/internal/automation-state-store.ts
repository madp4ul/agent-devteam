import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type {
  ActivationView,
  AgentRunAgent,
  AgentRunOutcome,
  RuntimeStartupBoundary,
  RuntimeStartupDiagnostic,
  TaskActivityView,
  TaskWorkspaceView,
  TaskView,
} from "../coordination-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { CoordinationTaskStore } from "./coordination-store.ts";

export interface RunnableActivation {
  activation: ActivationView;
  task: TaskView;
  agent: AgentRunAgent;
  sourceEvent: TaskActivityView | TaskView["comments"][number];
}

export class AutomationStateStore {
  readonly #owner: CoordinationDatabase;
  readonly #database: DatabaseSync;
  readonly #tasks: CoordinationTaskStore;

  constructor(database: CoordinationDatabase, tasks: CoordinationTaskStore) {
    this.#owner = database;
    this.#database = database.connection;
    this.#tasks = tasks;
  }

  readNextRunnableActivation(): RunnableActivation | undefined {
    const row = this.#database
      .prepare(
        `SELECT a.id, a.task_id, a.target_agent_id, a.source_event_id,
                a.model, a.reasoning_effort
         FROM activations a
         WHERE a.status = 'queued'
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
      .get() as
      | {
          id: string;
          task_id: string;
          target_agent_id: string;
          source_event_id: string;
          model: string | null;
          reasoning_effort: NonNullable<AgentRunAgent["reasoningEffort"]> | null;
        }
      | undefined;
    if (row === undefined) return undefined;
    const task = this.#tasks.readTask(row.task_id);
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
    const sourceEvent = this.#tasks.readSourceEvent(row.source_event_id);
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
    };
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

  saveTaskWorkspace(taskId: string, workspace: TaskWorkspaceView): void {
    this.#database
      .prepare(
        `INSERT INTO task_workspaces (task_id, path, starting_ref, commit_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run(taskId, workspace.path, workspace.startingRef, workspace.commit);
  }

  startAttempt(
    activationId: string,
    workspacePath: string,
    agent: AgentRunAgent,
  ): { id: string; number: number; runStartActivityId: string } {
    return this.#owner.transaction(() => {
      const activation = this.#database
        .prepare(
          `SELECT task_id, target_agent_id
           FROM activations
           WHERE id = ? AND status = 'queued'`,
        )
        .get(activationId) as
        | { task_id: string; target_agent_id: string }
        | undefined;
      if (activation === undefined) throw new Error(`Activation ${activationId} is not runnable`);
      const attemptId = randomUUID();
      const priorAttempts = this.#database
        .prepare("SELECT COUNT(*) AS count FROM attempts WHERE activation_id = ?")
        .get(activationId) as { count: number };
      const occurredAt = new Date().toISOString();
      this.#database
        .prepare("UPDATE activations SET status = 'running' WHERE id = ?")
        .run(activationId);
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
          occurredAt,
          agent.model ?? null,
          agent.reasoningEffort ?? null,
        );
      const runStartActivityId = this.appendActivity(
        activation.task_id,
        "attempt.started",
        { kind: "agent", id: activation.target_agent_id },
        { activationId, attemptId },
        occurredAt,
      );
      return { id: attemptId, number: priorAttempts.count + 1, runStartActivityId };
    });
  }

  recordActivationStartupFailure(
    activationId: string,
    boundary: RuntimeStartupBoundary,
    diagnostic: string,
  ): RuntimeStartupDiagnostic {
    return this.#owner.transaction(() => {
      const activation = this.#database
        .prepare("SELECT task_id FROM activations WHERE id = ? AND status = 'queued'")
        .get(activationId) as { task_id: string } | undefined;
      if (activation === undefined) throw new Error(`Activation ${activationId} is not queued`);
      const occurredAt = new Date().toISOString();
      this.#database
        .prepare("UPDATE activations SET status = 'failed' WHERE id = ?")
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

  completeAttempt(attemptId: string, outcome: AgentRunOutcome): void {
    this.#owner.transaction(() => {
      const attempt = this.#database
        .prepare(
          `SELECT attempt.activation_id, a.task_id, a.target_agent_id
           FROM attempts attempt
           JOIN activations a ON a.id = attempt.activation_id
           WHERE attempt.id = ? AND attempt.status = 'running'`,
        )
        .get(attemptId) as
        | { activation_id: string; task_id: string; target_agent_id: string }
        | undefined;
      if (attempt === undefined) throw new Error(`Attempt ${attemptId} is not running`);
      const occurredAt = new Date().toISOString();
      this.#database
        .prepare(
          `UPDATE attempts
           SET status = ?, completed_at = ?, outcome_status = ?, outcome_summary = ?,
               thread_id = COALESCE(?, thread_id)
           WHERE id = ?`,
        )
        .run(
          outcome.status,
          occurredAt,
          outcome.status,
          outcome.summary,
          outcome.threadId ?? null,
          attemptId,
        );
      this.#database
        .prepare("UPDATE activations SET status = ? WHERE id = ?")
        .run(outcome.status, attempt.activation_id);
      this.appendActivity(
        attempt.task_id,
        "attempt.completed",
        { kind: "agent", id: attempt.target_agent_id },
        { activationId: attempt.activation_id, attemptId },
        occurredAt,
      );
    });
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
