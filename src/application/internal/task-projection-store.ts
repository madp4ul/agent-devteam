import type { DatabaseSync } from "node:sqlite";

import type { ActivationView } from "../automation-contract.ts";
import type {
  AttemptTranscriptItem,
  AttemptTokenUsage,
  EstimatedTokenCost,
  AttemptView,
  RuntimeStartupBoundary,
} from "../runtime-contract.ts";
import type {
  Actor,
  NeedsAttentionTaskView,
  TaskAttachmentView,
  TaskAttentionView,
  TaskActivityView,
  TaskOverviewView,
  TaskRelationshipView,
  TaskView,
} from "../task-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";

export interface StoredTaskOverview {
  sequence: number;
  columnEntrySequence: number;
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
        "SELECT id, title, description, board_id, column_id, revision, archived_at FROM tasks WHERE id = ?",
      )
      .get(taskId) as
      | {
          id: string;
          title: string;
          description: string;
          board_id: string;
          column_id: string;
          revision: number;
          archived_at: string | null;
        }
      | undefined;
    if (row === undefined) return undefined;
    const activity = this.#database
      .prepare(
        `SELECT activity.id, activity.type, activity.actor_kind, activity.actor_id,
                activity.occurred_at, activity.details_json,
                CASE WHEN activity.type = 'conversation.continued' THEN (
                  SELECT message.body
                  FROM agent_conversation_messages message
                  WHERE message.id = json_extract(activity.details_json, '$.messageId')
                ) ELSE NULL END AS conversation_message_body
         FROM activity_ledger activity
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
      conversation_message_body: string | null;
    }>;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      boardId: row.board_id,
      columnId: row.column_id,
      revision: row.revision,
      ...(row.archived_at === null ? {} : { archived: true as const }),
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
        details: {
          ...(JSON.parse(event.details_json) as Record<string, string>),
          ...(event.conversation_message_body === null
            ? {}
            : { messageBody: event.conversation_message_body }),
        },
      })),
      activations: this.readTaskActivations(taskId),
    };
  }

  readTasksInColumn(boardId: string, columnId: string): TaskView[] {
    const rows = this.#database
      .prepare("SELECT id FROM tasks WHERE board_id = ? AND column_id = ? AND archived_at IS NULL ORDER BY id")
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
                t.automation_suspended, t.archived_at,
                COALESCE((
                  SELECT entry.sequence
                  FROM activity_ledger entry
                  WHERE entry.task_id = t.id
                    AND (
                      (entry.type = 'task.created'
                        AND json_extract(entry.details_json, '$.columnId') = t.column_id)
                      OR (entry.type = 'task.moved'
                        AND json_extract(entry.details_json, '$.toColumnId') = t.column_id)
                    )
                  ORDER BY entry.sequence DESC
                  LIMIT 1
                ), t.sequence) AS column_entry_sequence,
                c.name AS column_name,
                SUM(CASE WHEN a.status = 'queued' THEN 1 ELSE 0 END) AS queued_count,
                SUM(CASE WHEN a.status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
                SUM(CASE WHEN a.status = 'running' THEN 1 ELSE 0 END) AS running_count,
                MAX(CASE WHEN a.status = 'running' THEN a.target_agent_id END) AS active_agent_id
         FROM tasks t
         JOIN columns c ON c.board_id = t.board_id AND c.id = t.column_id
         LEFT JOIN activations a ON a.task_id = t.id
         WHERE t.board_id = ? AND t.column_id IN (${placeholders}) AND t.archived_at IS NULL
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
      automation_suspended: number;
      archived_at: string | null;
      column_entry_sequence: number;
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
        columnEntrySequence: row.column_entry_sequence,
        task: {
          id: row.id,
          title: row.title,
          boardId: row.board_id,
          column: { id: row.column_id, name: row.column_name },
          revision: row.revision,
          blocking: { blocked: blockerTaskIds.length > 0, blockerTaskIds },
          relationships: this.readTaskRelationships(row.id),
          unresolvedAttention: this.readUnresolvedAttention(row.id),
          automationSuspended: row.automation_suspended === 1,
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

  readArchivedTaskOverviewRecords(): StoredTaskOverview[] {
    const rows = this.#database.prepare(
      `SELECT board_id, column_id FROM tasks WHERE archived_at IS NOT NULL
       GROUP BY board_id, column_id ORDER BY MIN(sequence)`,
    ).all() as Array<{ board_id: string; column_id: string }>;
    return rows
      .flatMap(({ board_id, column_id }) =>
        this.readTaskOverviewRecordsIncludingArchived(board_id, column_id))
      .sort((left, right) => left.sequence - right.sequence);
  }

  isAttemptArchived(attemptId: string): boolean {
    return this.#database.prepare(
      `SELECT 1 FROM attempts attempt
       JOIN activations activation ON activation.id = attempt.activation_id
       JOIN tasks task ON task.id = activation.task_id
       WHERE attempt.id = ? AND task.archived_at IS NOT NULL`,
    ).get(attemptId) !== undefined;
  }

  private readTaskOverviewRecordsIncludingArchived(boardId: string, columnId: string): StoredTaskOverview[] {
    const rows = this.#database.prepare(
      `SELECT id, sequence FROM tasks
       WHERE board_id = ? AND column_id = ? AND archived_at IS NOT NULL ORDER BY sequence`,
    ).all(boardId, columnId) as Array<{ id: string; sequence: number }>;
    return rows.flatMap(({ id, sequence }) => {
      const task = this.readTask(id);
      if (task === undefined) return [];
      const column = this.#database.prepare(
        "SELECT name FROM columns WHERE board_id = ? AND id = ?",
      ).get(boardId, columnId) as { name: string } | undefined;
      if (column === undefined) return [];
      const blockerTaskIds = this.readBlockingTaskIds(id);
      return [{ sequence, columnEntrySequence: sequence, task: {
        id: task.id,
        title: task.title,
        boardId: task.boardId,
        column: { id: task.columnId, name: column.name },
        revision: task.revision,
        archived: true,
        blocking: { blocked: blockerTaskIds.length > 0, blockerTaskIds },
        relationships: task.relationships,
        unresolvedAttention: this.readUnresolvedAttention(id),
        automationSuspended: this.isTaskAutomationSuspended(id),
        run: { status: "idle", activeAgentId: null, queuedActivationCount: 0, failedActivationCount: 0 },
      }}];
    });
  }

  readUnresolvedAttention(taskId: string): TaskAttentionView[] {
    const recorded = this.#database
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
      .map((row): TaskAttentionView => {
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
                    "Automatic retry is unavailable for permission blocks. Describe the exact retry you authorize, the managed policy you changed, or the operation you completed externally, then Continue. Auto-review can still deny the retry; continuation does not bypass policy.",
                }
              : {
                  kind: "technical-failure",
                  summary: typed.failure_summary,
                  actions: ["retry", "dismiss"],
                } }),
        };
      });
    const suspension = this.#database
      .prepare(
        `SELECT activity.id AS activity_id, activity.occurred_at
         FROM tasks task
         JOIN activity_ledger activity ON activity.id = (
           SELECT latest.id
           FROM activity_ledger latest
           WHERE latest.task_id = task.id AND latest.type = 'automation.suspended'
           ORDER BY latest.sequence DESC
           LIMIT 1
         )
         WHERE task.id = ? AND task.automation_suspended = 1`,
      )
      .get(taskId) as
      | { activity_id: string; occurred_at: string }
      | undefined;
    if (suspension === undefined) return recorded;
    const suspensionReason: TaskAttentionView = {
      id: `automation-suspended:${suspension.activity_id}`,
      type: "automation-suspended",
      sourceEventId: suspension.activity_id,
      createdAt: suspension.occurred_at,
    };
    return [...recorded, suspensionReason]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  readNeedsAttention(): NeedsAttentionTaskView[] {
    const tasks = this.#database
      .prepare(
        `SELECT task.id, task.title, task.board_id, board.name AS board_name,
                task.column_id, task.sequence
         FROM tasks task
         JOIN boards board ON board.id = task.board_id
         WHERE task.archived_at IS NULL AND (
              task.automation_suspended = 1
            OR EXISTS (
              SELECT 1
              FROM attention_reasons attention
              WHERE attention.task_id = task.id AND attention.resolved_at IS NULL
            ))
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

  readPersistedAttemptTranscript(attemptId: string):
    | { items: AttemptTranscriptItem[]; usage?: AttemptTokenUsage; costEstimate?: EstimatedTokenCost }
    | undefined {
    const row = this.#database
      .prepare("SELECT items_json, usage_json FROM attempt_transcripts WHERE attempt_id = ?")
      .get(attemptId) as { items_json: string; usage_json: string | null } | undefined;
    if (row === undefined) return undefined;
    if (row.usage_json === null) {
      return { items: JSON.parse(row.items_json) as AttemptTranscriptItem[] };
    }
    const persisted = JSON.parse(row.usage_json) as AttemptTokenUsage & {
      estimatedCostUsd?: number;
    };
    const { estimatedCostUsd, ...usage } = persisted;
    return {
      items: JSON.parse(row.items_json) as AttemptTranscriptItem[],
      usage,
      ...(estimatedCostUsd === undefined
        ? {}
        : { costEstimate: { currency: "USD", amount: estimatedCostUsd } }),
    };
  }

  isTaskAutomationSuspended(taskId: string): boolean {
    const row = this.#database
      .prepare("SELECT automation_suspended FROM tasks WHERE id = ?")
      .get(taskId) as { automation_suspended: number } | undefined;
    return row?.automation_suspended === 1;
  }

  isTaskArchivalPending(taskId: string): boolean {
    const row = this.#database
      .prepare("SELECT archival_pending FROM tasks WHERE id = ?")
      .get(taskId) as { archival_pending: number } | undefined;
    return row?.archival_pending === 1;
  }

  isTaskMapped(taskId: string): boolean {
    return this.#database.prepare("SELECT 1 FROM mapped_tasks WHERE id = ?").get(taskId) !== undefined;
  }

  isTaskInspectableByAgent(taskId: string): boolean {
    return this.#database.prepare("SELECT 1 FROM agent_inspectable_tasks WHERE id = ?")
      .get(taskId) !== undefined;
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
        `SELECT id, body, actor_kind, actor_id, occurred_at, attempt_id
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
          attempt_id: string | null;
        }
      | undefined;
    return comment === undefined
      ? undefined
      : {
          id: comment.id,
          body: comment.body,
          actor: { kind: comment.actor_kind, id: comment.actor_id },
          occurredAt: comment.occurred_at,
          ...(comment.attempt_id === null ? {} : { attemptId: comment.attempt_id }),
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

  readTaskActivations(taskId: string): ActivationView[] {
    const taskState = this.#database.prepare(
      `SELECT automation_suspended, suspended_activation_id
       FROM tasks WHERE id = ?`,
    ).get(taskId) as {
      automation_suspended: number;
      suspended_activation_id: string | null;
    };
    const rows = this.#database
      .prepare(
        `SELECT id, conversation_id, target_agent_id, reason_type, source_event_id, status,
                model, reasoning_effort, retry_due_at, retry_cycle_start,
                failure_kind, failure_summary, resolution, stale
         FROM activations
         WHERE task_id = ?
         ORDER BY sequence`,
      )
      .all(taskId) as Array<{
        id: string;
        conversation_id: string | null;
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
        stale: number;
      }>;
    return rows.map((row) => {
      const attempts = this.readActivationAttempts(row.id);
      const dismissible = row.status === "queued" && row.resolution === null &&
        row.stale === 0 && (attempts.length === 0 || (
          taskState.automation_suspended === 1 &&
          taskState.suspended_activation_id === row.id
        ));
      return {
        id: row.id,
        conversationId: row.conversation_id,
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
        stale: row.stale === 1,
        dismissal: dismissible
          ? { mayStartNext: this.dismissalMayStartNext(taskId, row.id) }
          : null,
      } satisfies ActivationView;
    });
  }

  private dismissalMayStartNext(taskId: string, dismissedActivationId: string): boolean {
    const row = this.#database.prepare(
      `SELECT 1
       FROM activations selected
       JOIN tasks task ON task.id = selected.task_id
       JOIN activations candidate ON candidate.task_id = selected.task_id
       JOIN mapped_tasks mapped ON mapped.id = task.id
       JOIN agents agent ON agent.id = candidate.target_agent_id AND agent.applied = 1
       JOIN runtime ON runtime.singleton = 1 AND runtime.automation_state = 'running'
       WHERE selected.task_id = ?
         AND selected.id = ?
         AND (task.automation_suspended = 0 OR task.suspended_activation_id = selected.id)
         AND NOT EXISTS (
           SELECT 1 FROM activations before_selected
           WHERE before_selected.task_id = selected.task_id
             AND before_selected.sequence < selected.sequence
             AND before_selected.status <> 'completed'
         )
         AND candidate.status = 'queued'
         AND candidate.id <> selected.id
         AND candidate.stale = 0
         AND (candidate.retry_due_at IS NULL OR candidate.retry_due_at <= ?)
         AND NOT EXISTS (
           SELECT 1
           FROM task_relationships relationship
           JOIN tasks blocker ON blocker.id = relationship.target_task_id
           WHERE relationship.type IN ('dependency', 'parent-child')
             AND relationship.source_task_id = candidate.task_id
             AND blocker.column_id <> 'completion'
         )
         AND NOT EXISTS (
           SELECT 1 FROM activations earlier
           WHERE earlier.task_id = candidate.task_id
             AND earlier.sequence < candidate.sequence
             AND earlier.id <> selected.id
             AND earlier.status <> 'completed'
         )
       ORDER BY candidate.sequence
       LIMIT 1`,
    ).get(taskId, dismissedActivationId, new Date().toISOString());
    return row !== undefined;
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

  readActivationAttempts(activationId: string): ActivationView["attempts"] {
    const rows = this.#database
      .prepare(
        `SELECT id, status, workspace_path, started_at, completed_at,
                outcome_status, outcome_summary, outcome_kind, thread_id, model, reasoning_effort,
                thread_continuity
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
        thread_continuity: "replaced" | null;
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
      ...(row.thread_continuity === null ? {} : { threadContinuity: row.thread_continuity }),
      model: row.model,
      reasoningEffort: row.reasoning_effort,
    }));
  }

  private readTaskComments(taskId: string): TaskView["comments"] {
    const rows = this.#database
      .prepare(
        `SELECT id, body, actor_kind, actor_id, occurred_at, attempt_id
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
      attempt_id: string | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      body: row.body,
      actor: { kind: row.actor_kind, id: row.actor_id },
      occurredAt: row.occurred_at,
      ...(row.attempt_id === null ? {} : { attemptId: row.attempt_id }),
    }));
  }
}
