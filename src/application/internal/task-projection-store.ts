import type { DatabaseSync } from "node:sqlite";

import type {
  ActivationView,
  Actor,
  AttemptView,
  NeedsAttentionTaskView,
  RuntimeStartupBoundary,
  TaskAttachmentView,
  TaskAttentionView,
  TaskActivityView,
  TaskOverviewView,
  TaskRelationshipView,
  TaskView,
} from "../coordination-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";

export interface StoredTaskOverview {
  sequence: number;
  task: TaskOverviewView;
}

export class TaskProjectionStore {
  readonly #database: DatabaseSync;

  constructor(database: CoordinationDatabase) {
    this.#database = database.connection;
  }

  readTask(taskId: string): TaskView | undefined {
    const row = this.#database
      .prepare(
        "SELECT id, title, description, board_id, column_id, revision FROM tasks WHERE id = ?",
      )
      .get(taskId) as
      | {
          id: string;
          title: string;
          description: string;
          board_id: string;
          column_id: string;
          revision: number;
        }
      | undefined;
    if (row === undefined) return undefined;
    const activity = this.#database
      .prepare(
        `SELECT id, type, actor_kind, actor_id, occurred_at, details_json
         FROM activity_ledger
         WHERE task_id = ?
         ORDER BY sequence`,
      )
      .all(taskId) as Array<{
      id: string;
      type: TaskActivityView["type"];
      actor_kind: TaskActivityView["actor"]["kind"];
      actor_id: string;
      occurred_at: string;
      details_json: string;
    }>;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      boardId: row.board_id,
      columnId: row.column_id,
      revision: row.revision,
      comments: this.readTaskComments(taskId),
      relationships: this.readTaskRelationships(taskId),
      activity: activity.map((event) => ({
        id: event.id,
        type: event.type,
        actor:
          event.actor_kind === "framework"
            ? { kind: "framework", id: "coordination" }
            : { kind: event.actor_kind, id: event.actor_id },
        occurredAt: event.occurred_at,
        details: JSON.parse(event.details_json) as Record<string, string>,
      })),
      activations: this.readActivations(taskId),
    };
  }

  readTasksInColumn(boardId: string, columnId: string): TaskView[] {
    const rows = this.#database
      .prepare("SELECT id FROM tasks WHERE board_id = ? AND column_id = ? ORDER BY id")
      .all(boardId, columnId) as Array<{ id: string }>;
    return rows.flatMap((row) => {
      const task = this.readTask(row.id);
      return task === undefined ? [] : [task];
    });
  }

  readTaskOverviewRecords(boardId: string, columnIds: string[]): StoredTaskOverview[] {
    const placeholders = columnIds.map(() => "?").join(", ");
    const rows = this.#database
      .prepare(
        `SELECT t.id, t.sequence, t.title, t.board_id, t.column_id, t.revision,
                c.name AS column_name,
                SUM(CASE WHEN a.status = 'queued' THEN 1 ELSE 0 END) AS queued_count,
                SUM(CASE WHEN a.status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
                SUM(CASE WHEN a.status = 'running' THEN 1 ELSE 0 END) AS running_count,
                MAX(CASE WHEN a.status = 'running' THEN a.target_agent_id END) AS active_agent_id
         FROM tasks t
         JOIN columns c ON c.board_id = t.board_id AND c.id = t.column_id
         LEFT JOIN activations a ON a.task_id = t.id
         WHERE t.board_id = ? AND t.column_id IN (${placeholders})
         GROUP BY t.id, t.sequence, t.title, t.board_id, t.column_id, t.revision, c.name
         ORDER BY t.sequence`,
      )
      .all(boardId, ...columnIds) as Array<{
      id: string;
      sequence: number;
      title: string;
      board_id: string;
      column_id: string;
      revision: number;
      column_name: string;
      queued_count: number;
      failed_count: number;
      running_count: number;
      active_agent_id: string | null;
    }>;
    return rows.map((row) => {
      const blockerTaskIds = this.readBlockingTaskIds(row.id);
      const startupFailure = this.readLatestUnresolvedStartupFailure(row.id);
      return {
        sequence: row.sequence,
        task: {
          id: row.id,
          title: row.title,
          boardId: row.board_id,
          column: { id: row.column_id, name: row.column_name },
          revision: row.revision,
          blocking: { blocked: blockerTaskIds.length > 0, blockerTaskIds },
          relationships: this.readTaskRelationships(row.id),
          unresolvedAttention: this.readUnresolvedAttention(row.id),
          ...(startupFailure === undefined ? {} : { startupFailure }),
          run: {
            status:
              row.running_count > 0
                ? "running"
                : row.failed_count > 0
                  ? "failed"
                  : row.queued_count > 0
                    ? "queued"
                    : "idle",
            activeAgentId: row.active_agent_id,
            queuedActivationCount: row.queued_count,
            failedActivationCount: row.failed_count,
          },
        },
      };
    });
  }

  readUnresolvedAttention(taskId: string): TaskAttentionView[] {
    return this.#database
      .prepare(
        `SELECT attention.id, attention.type, attention.source_event_id,
                attention.created_at, activation.failure_kind,
                activation.failure_summary
         FROM attention_reasons attention
         LEFT JOIN activations activation ON activation.id = attention.source_event_id
         WHERE attention.task_id = ? AND attention.resolved_at IS NULL
         ORDER BY attention.rowid`,
      )
      .all(taskId)
      .map((row) => {
        const typed = row as {
          id: string;
          type: TaskAttentionView["type"];
          source_event_id: string | null;
          created_at: string;
          failure_kind: "technical" | "permission" | null;
          failure_summary: string | null;
        };
        return {
          id: typed.id,
          type: typed.type,
          sourceEventId: typed.source_event_id,
          createdAt: typed.created_at,
          ...(typed.type !== "failed-run" || typed.failure_summary === null
            ? {}
            : { recovery: typed.failure_kind === "permission"
              ? {
                  kind: "permission-block",
                  summary: typed.failure_summary,
                  actions: ["continue"],
                  explanation:
                    "Automatic retry is unavailable for permission blocks. Complete the required action or change Codex policy, then Continue.",
                }
              : {
                  kind: "technical-failure",
                  summary: typed.failure_summary,
                  actions: ["retry", "dismiss"],
                } }),
        };
      });
  }

  readNeedsAttention(): NeedsAttentionTaskView[] {
    const tasks = this.#database
      .prepare(
        `SELECT DISTINCT task.id, task.title, task.board_id, board.name AS board_name,
                         task.column_id, task.sequence
         FROM attention_reasons attention
         JOIN tasks task ON task.id = attention.task_id
         JOIN boards board ON board.id = task.board_id
         WHERE attention.resolved_at IS NULL
         ORDER BY task.sequence`,
      )
      .all() as Array<{
        id: string;
        title: string;
        board_id: string;
        board_name: string;
        column_id: string;
      }>;
    return tasks.map((task) => ({
      task: {
        id: task.id,
        title: task.title,
        boardId: task.board_id,
        boardName: task.board_name,
        columnId: task.column_id,
      },
      reasons: this.readUnresolvedAttention(task.id),
    }));
  }

  readTaskAttachments(taskId: string): TaskAttachmentView[] {
    return (
      this.#database
        .prepare(
          `SELECT id, file_name, media_type, size_bytes
           FROM task_attachments
           WHERE task_id = ?
           ORDER BY rowid`,
        )
        .all(taskId) as Array<{
        id: string;
        file_name: string;
        media_type: string;
        size_bytes: number;
      }>
    ).map((attachment) => ({
      id: attachment.id,
      fileName: attachment.file_name,
      mediaType: attachment.media_type,
      sizeBytes: attachment.size_bytes,
    }));
  }

  readBlockingTaskIds(taskId: string): string[] {
    return (
      this.#database
        .prepare(
          `SELECT relationship.target_task_id
           FROM task_relationships relationship
           JOIN tasks blocker ON blocker.id = relationship.target_task_id
           WHERE relationship.type IN ('dependency', 'parent-child')
             AND relationship.source_task_id = ?
             AND blocker.column_id <> 'completion'
           ORDER BY relationship.rowid`,
        )
        .all(taskId) as Array<{ target_task_id: string }>
    ).map((row) => row.target_task_id);
  }

  readTaskStartingRef(taskId: string): string | undefined {
    const row = this.#database
      .prepare("SELECT starting_ref FROM task_starting_refs WHERE task_id = ?")
      .get(taskId) as { starting_ref: string } | undefined;
    return row?.starting_ref;
  }

  readAttemptTranscriptReference(attemptId: string): { threadId: string | null } | undefined {
    return this.#database
      .prepare("SELECT thread_id AS threadId FROM attempts WHERE id = ?")
      .get(attemptId) as { threadId: string | null } | undefined;
  }

  isTaskAutomationSuspended(taskId: string): boolean {
    const row = this.#database
      .prepare("SELECT automation_suspended FROM tasks WHERE id = ?")
      .get(taskId) as { automation_suspended: number } | undefined;
    return row?.automation_suspended === 1;
  }

  readSourceEvent(id: string): TaskActivityView | TaskView["comments"][number] | undefined {
    const row = this.#database
      .prepare(
        `SELECT id, type, actor_kind, actor_id, occurred_at, details_json
         FROM activity_ledger
         WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          type: "task.created" | "task.moved";
          actor_kind: Actor["kind"];
          actor_id: string;
          occurred_at: string;
          details_json: string;
        }
      | undefined;
    if (row !== undefined) {
      return {
        id: row.id,
        type: row.type,
        actor: { kind: row.actor_kind, id: row.actor_id },
        occurredAt: row.occurred_at,
        details: JSON.parse(row.details_json) as Record<string, string>,
      };
    }
    const comment = this.#database
      .prepare(
        `SELECT id, body, actor_kind, actor_id, occurred_at
         FROM task_comments
         WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          body: string;
          actor_kind: Actor["kind"];
          actor_id: string;
          occurred_at: string;
        }
      | undefined;
    return comment === undefined
      ? undefined
      : {
          id: comment.id,
          body: comment.body,
          actor: { kind: comment.actor_kind, id: comment.actor_id },
          occurredAt: comment.occurred_at,
        };
  }

  private readLatestUnresolvedStartupFailure(
    taskId: string,
  ): TaskOverviewView["startupFailure"] {
    const row = this.#database
      .prepare(
        `SELECT failure.activation_id, failure.occurred_at, failure.boundary,
                failure.diagnostic, failure.resolved_at
         FROM activation_startup_failures failure
         JOIN activations activation ON activation.id = failure.activation_id
         WHERE activation.task_id = ? AND failure.resolved_at IS NULL
         ORDER BY failure.occurred_at DESC
         LIMIT 1`,
      )
      .get(taskId) as
      | {
          activation_id: string;
          occurred_at: string;
          boundary: RuntimeStartupBoundary;
          diagnostic: string;
          resolved_at: string | null;
        }
      | undefined;
    return row === undefined
      ? undefined
      : {
          activationId: row.activation_id,
          occurredAt: row.occurred_at,
          boundary: row.boundary,
          diagnostic: row.diagnostic,
          resolvedAt: row.resolved_at,
        };
  }

  private readTaskRelationships(taskId: string): TaskRelationshipView[] {
    return (
      this.#database
        .prepare(
          `SELECT id, type, source_task_id, target_task_id
           FROM task_relationships
           WHERE source_task_id = ? OR target_task_id = ?
           ORDER BY rowid`,
        )
        .all(taskId, taskId) as Array<{
        id: string;
        type: TaskRelationshipView["type"];
        source_task_id: string;
        target_task_id: string;
      }>
    ).map((relationship) => ({
      id: relationship.id,
      type: relationship.type,
      sourceTaskId: relationship.source_task_id,
      targetTaskId: relationship.target_task_id,
    }));
  }

  private readActivations(taskId: string): ActivationView[] {
    const rows = this.#database
      .prepare(
        `SELECT id, target_agent_id, reason_type, source_event_id, status,
                model, reasoning_effort, retry_due_at, retry_cycle_start,
                failure_kind, failure_summary, resolution
         FROM activations
         WHERE task_id = ?
         ORDER BY sequence`,
      )
      .all(taskId) as Array<{
        id: string;
        target_agent_id: string;
        reason_type: ActivationView["reason"]["type"];
        source_event_id: string;
        status: ActivationView["status"];
        model: string | null;
        reasoning_effort: ActivationView["reasoningEffort"];
        retry_due_at: string | null;
        retry_cycle_start: number;
        failure_kind: "technical" | "permission" | null;
        failure_summary: string | null;
        resolution: "dismissed" | null;
      }>;
    return rows.map((row) => {
      const attempts = this.readAttempts(row.id);
      return {
        id: row.id,
        targetAgentId: row.target_agent_id,
        status: row.resolution === "dismissed" ? "dismissed" : row.status,
        reason: { type: row.reason_type, sourceEventId: row.source_event_id },
        attempts,
        startupFailure: this.readActivationStartupFailure(row.id),
        recovery: row.retry_due_at === null
          ? row.status !== "failed" || row.failure_summary === null
            ? null
            : {
                state: row.failure_kind === "permission" ? "permission-blocked" : "awaiting-retry",
                summary: row.failure_summary,
              }
          : {
              state: "scheduled",
              nextAttempt: attempts.length + 1,
              dueAt: row.retry_due_at,
            },
        model: row.model,
        reasoningEffort: row.reasoning_effort,
      } satisfies ActivationView;
    });
  }

  private readActivationStartupFailure(
    activationId: string,
  ): ActivationView["startupFailure"] {
    const row = this.#database
      .prepare(
        `SELECT occurred_at, boundary, diagnostic, resolved_at
         FROM activation_startup_failures
         WHERE activation_id = ?`,
      )
      .get(activationId) as
      | {
          occurred_at: string;
          boundary: RuntimeStartupBoundary;
          diagnostic: string;
          resolved_at: string | null;
        }
      | undefined;
    return row === undefined
      ? null
      : {
          occurredAt: row.occurred_at,
          boundary: row.boundary,
          diagnostic: row.diagnostic,
          resolvedAt: row.resolved_at,
        };
  }

  private readAttempts(activationId: string): ActivationView["attempts"] {
    const rows = this.#database
      .prepare(
        `SELECT id, status, workspace_path, started_at, completed_at,
                outcome_status, outcome_summary, outcome_kind, thread_id, model, reasoning_effort
         FROM attempts
         WHERE activation_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM activation_dispatch_claims claim
             WHERE claim.attempt_id = attempts.id
           )
         ORDER BY rowid`,
      )
      .all(activationId) as Array<{
        id: string;
        status: "running" | "completed" | "failed";
        workspace_path: string;
        started_at: string;
        completed_at: string | null;
        outcome_status: "completed" | "failed" | null;
        outcome_summary: string | null;
        outcome_kind: "completed" | "failed" | "permission" | "interrupted" | null;
        thread_id: string | null;
        model: string | null;
        reasoning_effort: AttemptView["reasoningEffort"];
      }>;
    return rows.map((row) => ({
      id: row.id,
      status: row.outcome_kind === "interrupted" ? "interrupted" : row.status,
      workspacePath: row.workspace_path,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      outcome:
        row.outcome_status === null
          ? null
          : {
              status: row.outcome_kind === "permission"
                ? "permission-blocked"
                : row.outcome_kind === "interrupted"
                  ? "user-interrupted"
                  : row.outcome_status,
              summary: row.outcome_summary ?? "",
            },
      threadId: row.thread_id,
      model: row.model,
      reasoningEffort: row.reasoning_effort,
    }));
  }

  private readTaskComments(taskId: string): TaskView["comments"] {
    const rows = this.#database
      .prepare(
        `SELECT id, body, actor_kind, actor_id, occurred_at
         FROM task_comments
         WHERE task_id = ?
         ORDER BY sequence`,
      )
      .all(taskId) as Array<{
      id: string;
      body: string;
      actor_kind: Actor["kind"];
      actor_id: string;
      occurred_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      body: row.body,
      actor: { kind: row.actor_kind, id: row.actor_id },
      occurredAt: row.occurred_at,
    }));
  }
}
