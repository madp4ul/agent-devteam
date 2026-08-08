import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type {
  ActivationView,
  AddTaskCommentCommand,
  AddTaskCommentResult,
  Actor,
  BoardMutationResult,
  CreateTaskCommand,
  EditTaskCommand,
  MoveTaskCommand,
  MarkUserMentionAddressedCommand,
  MarkUserMentionAddressedResult,
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
export class CoordinationTaskStore {
  readonly #owner: CoordinationDatabase;
  readonly #database: DatabaseSync;

  constructor(database: CoordinationDatabase) {
    this.#owner = database;
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

  readUnresolvedAttention(taskId: string): TaskAttentionView[] {
    return this.#database
      .prepare(
        `SELECT id, type, source_event_id, created_at
         FROM attention_reasons
         WHERE task_id = ? AND resolved_at IS NULL
         ORDER BY rowid`,
      )
      .all(taskId)
      .map((row) => {
        const typed = row as {
          id: string;
          type: TaskAttentionView["type"];
          source_event_id: string | null;
          created_at: string;
        };
        return {
          id: typed.id,
          type: typed.type,
          sourceEventId: typed.source_event_id,
          createdAt: typed.created_at,
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

  private readBlockingTaskIds(taskId: string): string[] {
    return (
      this.#database
        .prepare(
          `SELECT relationship.target_task_id
           FROM task_relationships relationship
           JOIN tasks blocker ON blocker.id = relationship.target_task_id
           WHERE relationship.type = 'dependency'
             AND relationship.source_task_id = ?
             AND blocker.column_id <> 'completion'
           ORDER BY relationship.rowid`,
        )
        .all(taskId) as Array<{ target_task_id: string }>
    ).map((row) => row.target_task_id);
  }

  createTask(command: CreateTaskCommand): BoardMutationResult {
    return this.transaction(() => {
      const prior = this.readStoredResponse<BoardMutationResult>(
        "create-task",
        command.idempotencyKey,
      );
      if (prior !== undefined) return prior;
      if (command.title.trim().length === 0) {
        return { accepted: false, reason: "empty-title" };
      }
      if (command.description.trim().length === 0) {
        return { accepted: false, reason: "empty-description" };
      }
      const destination = this.#database
        .prepare("SELECT 1 FROM columns WHERE board_id = ? AND id = ? AND applied = 1")
        .get(command.boardId, command.columnId);
      if (destination === undefined) {
        return { accepted: false, reason: "invalid-destination" };
      }

      const sequence = this.#database.prepare("INSERT INTO task_numbers DEFAULT VALUES").run();
      const taskSequence = Number(sequence.lastInsertRowid);
      const taskId = `T-${String(taskSequence).padStart(4, "0")}`;
      this.#database
        .prepare(
          "INSERT INTO tasks (id, sequence, board_id, column_id, title, description, revision) VALUES (?, ?, ?, ?, ?, ?, 1)",
        )
        .run(
          taskId,
          taskSequence,
          command.boardId,
          command.columnId,
          command.title,
          command.description,
        );
      const sourceEventId = this.appendActivity(
        taskId,
        "task.created",
        command.actor,
        { boardId: command.boardId, columnId: command.columnId },
      );
      this.createColumnEntryActivation(taskId, command.boardId, command.columnId, sourceEventId);
      const task = this.readTask(taskId);
      if (task === undefined) throw new Error("Created task could not be read back");
      const result: BoardMutationResult = { accepted: true, task };
      this.storeCommandResponse("create-task", command.idempotencyKey, result);
      return result;
    });
  }

  editTask(command: EditTaskCommand): BoardMutationResult {
    return this.transaction(() => {
      const commandType = `edit-task:${command.taskId}`;
      const prior = this.readStoredResponse<BoardMutationResult>(commandType, command.idempotencyKey);
      if (prior !== undefined) return prior;
      const currentTask = this.readTask(command.taskId);
      if (currentTask === undefined) return { accepted: false, reason: "not-found" };
      if (currentTask.revision !== command.expectedRevision) {
        return { accepted: false, reason: "revision-conflict", currentTask };
      }
      if (command.title.trim().length === 0) {
        return { accepted: false, reason: "empty-title" };
      }
      if (command.description.trim().length === 0) {
        return { accepted: false, reason: "empty-description" };
      }
      this.#database
        .prepare(
          `UPDATE tasks
           SET title = ?, description = ?, revision = revision + 1
           WHERE id = ?`,
        )
        .run(command.title.trim(), command.description.trim(), command.taskId);
      this.appendActivity(
        command.taskId,
        "task.edited",
        command.actor,
        {},
      );
      const task = this.readTask(command.taskId);
      if (task === undefined) throw new Error("Edited task could not be read back");
      const result: BoardMutationResult = { accepted: true, task };
      this.storeCommandResponse(commandType, command.idempotencyKey, result);
      return result;
    });
  }

  moveTask(command: MoveTaskCommand): BoardMutationResult {
    return this.transaction(() => {
      const commandType = `move-task:${command.taskId}`;
      const prior = this.readStoredResponse<BoardMutationResult>(commandType, command.idempotencyKey);
      if (prior !== undefined) return prior;
      const currentTask = this.readTask(command.taskId);
      if (currentTask === undefined) return { accepted: false, reason: "not-found" };
      if (currentTask.revision !== command.expectedRevision) {
        return { accepted: false, reason: "revision-conflict", currentTask };
      }
      if (currentTask.columnId === command.destinationColumnId) {
        return { accepted: false, reason: "invalid-destination" };
      }
      const destination = this.#database
        .prepare("SELECT 1 FROM columns WHERE board_id = ? AND id = ? AND applied = 1")
        .get(currentTask.boardId, command.destinationColumnId);
      if (destination === undefined) {
        return { accepted: false, reason: "invalid-destination" };
      }

      this.#database
        .prepare("UPDATE tasks SET column_id = ?, revision = revision + 1 WHERE id = ?")
        .run(command.destinationColumnId, command.taskId);
      const sourceEventId = this.appendActivity(
        command.taskId,
        "task.moved",
        command.actor,
        {
          fromColumnId: currentTask.columnId,
          toColumnId: command.destinationColumnId,
        },
      );
      this.createColumnEntryActivation(
        command.taskId,
        currentTask.boardId,
        command.destinationColumnId,
        sourceEventId,
      );
      const task = this.readTask(command.taskId);
      if (task === undefined) throw new Error("Moved task could not be read back");
      const result: BoardMutationResult = { accepted: true, task };
      this.storeCommandResponse(commandType, command.idempotencyKey, result);
      return result;
    });
  }

  addTaskComment(command: AddTaskCommentCommand): AddTaskCommentResult {
    return this.transaction(() => {
      const commandType = `add-task-comment:${command.taskId}`;
      const prior = this.readStoredResponse<AddTaskCommentResult>(
        commandType,
        command.idempotencyKey,
      );
      if (prior !== undefined) return prior;
      const task = this.readTask(command.taskId);
      if (task === undefined) return { accepted: false, reason: "not-found" };
      if (command.body.trim().length === 0) {
        return { accepted: false, reason: "empty-comment" };
      }
      const comment = {
        id: randomUUID(),
        body: command.body,
        actor: command.actor,
        occurredAt: new Date().toISOString(),
      };
      this.#database
        .prepare(
          `INSERT INTO task_comments
            (id, task_id, body, actor_kind, actor_id, occurred_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          comment.id,
          command.taskId,
          comment.body,
          comment.actor.kind,
          comment.actor.id,
          comment.occurredAt,
        );
      const mentions = this.readMentionTargets(comment.body);
      this.createMentionActivations(command.taskId, comment.id, mentions.agentIds);
      this.createUserMentionAttention(
        command.taskId,
        comment.id,
        mentions.user,
        comment.occurredAt,
      );
      const updated = this.readTask(command.taskId);
      if (updated === undefined) throw new Error("Commented task could not be read back");
      const result: AddTaskCommentResult = { accepted: true, task: updated, comment };
      this.#database
        .prepare("INSERT INTO command_responses VALUES (?, ?, ?)")
        .run(commandType, command.idempotencyKey, JSON.stringify(result));
      return result;
    });
  }

  markUserMentionAddressed(
    command: MarkUserMentionAddressedCommand,
  ): MarkUserMentionAddressedResult {
    return this.transaction(() => {
      const commandType = "mark-user-mention-addressed";
      const prior = this.readStoredResponse<MarkUserMentionAddressedResult>(
        commandType,
        command.idempotencyKey,
      );
      if (prior !== undefined) return prior;
      const reason = this.#database
        .prepare("SELECT task_id, type, resolved_at FROM attention_reasons WHERE id = ?")
        .get(command.attentionReasonId) as
        | { task_id: string; type: TaskAttentionView["type"]; resolved_at: string | null }
        | undefined;
      let result: MarkUserMentionAddressedResult;
      if (reason === undefined) result = { accepted: false, reason: "not-found" };
      else if (reason.type !== "user-mention") {
        result = { accepted: false, reason: "wrong-reason-type" };
      } else if (reason.resolved_at !== null) {
        result = { accepted: false, reason: "already-resolved" };
      } else {
        const resolvedAt = new Date().toISOString();
        this.#database
          .prepare("UPDATE attention_reasons SET resolved_at = ? WHERE id = ?")
          .run(resolvedAt, command.attentionReasonId);
        this.appendActivity(
          reason.task_id,
          "attention.resolved",
          command.actor,
          { attentionReasonId: command.attentionReasonId, reasonType: "user-mention" },
          resolvedAt,
        );
        result = { accepted: true, attentionReasonId: command.attentionReasonId, resolvedAt };
      }
      this.#database
        .prepare("INSERT INTO command_responses VALUES (?, ?, ?)")
        .run(commandType, command.idempotencyKey, JSON.stringify(result));
      return result;
    });
  }


  private transaction<Result>(operation: () => Result): Result {
    return this.#owner.transaction(operation);
  }

  private appendActivity(
    taskId: string,
    type: TaskActivityView["type"],
    actor: TaskActivityView["actor"],
    details: Record<string, string>,
    occurredAt = new Date().toISOString(),
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

  private createColumnEntryActivation(
    taskId: string,
    boardId: string,
    columnId: string,
    sourceEventId: string,
  ): void {
    const destination = this.#database
      .prepare(
        `SELECT watching_agent_id
         FROM columns
         WHERE board_id = ? AND id = ? AND applied = 1`,
      )
      .get(boardId, columnId) as { watching_agent_id: string | null } | undefined;
    if (destination?.watching_agent_id === null || destination === undefined) return;
    const activationId = randomUUID();
    const occurredAt = new Date().toISOString();
    this.#database
      .prepare(
        `INSERT INTO activations
          (id, task_id, target_agent_id, reason_type, source_event_id, status, created_at)
         VALUES (?, ?, ?, 'column-entry', ?, 'queued', ?)`,
      )
      .run(
        activationId,
        taskId,
        destination.watching_agent_id,
        sourceEventId,
        occurredAt,
      );
    this.appendActivity(
      taskId,
      "activation.created",
      { kind: "framework", id: "coordination" },
      {
        activationId,
        targetAgentId: destination.watching_agent_id,
        reasonType: "column-entry",
        sourceEventId,
      },
      occurredAt,
    );
  }

  private readMentionTargets(body: string): { agentIds: string[]; user: boolean } {
    const declaredAgents = new Set(
      (this.#database
        .prepare("SELECT id FROM agents WHERE applied = 1")
        .all() as Array<{ id: string }>).map((agent) => agent.id),
    );
    const mentionedAgents: string[] = [];
    const seen = new Set<string>();
    let user = false;
    for (const match of body.matchAll(/(?:^|[^\w@])@([A-Za-z0-9][A-Za-z0-9_-]*)/g)) {
      const participantId = match[1];
      if (participantId === "user") {
        user = true;
      } else if (
        participantId !== undefined &&
        declaredAgents.has(participantId) &&
        !seen.has(participantId)
      ) {
        seen.add(participantId);
        mentionedAgents.push(participantId);
      }
    }
    return { agentIds: mentionedAgents, user };
  }

  private createMentionActivations(
    taskId: string,
    commentId: string,
    mentionedAgents: string[],
  ): void {
    const mapped = this.#database
      .prepare(
        `SELECT 1
         FROM tasks task
         JOIN boards board ON board.id = task.board_id AND board.applied = 1
         JOIN columns column
           ON column.board_id = task.board_id
          AND column.id = task.column_id
          AND column.applied = 1
         WHERE task.id = ?`,
      )
      .get(taskId);
    if (mapped === undefined) return;
    const occurredAt = new Date().toISOString();
    for (const targetAgentId of mentionedAgents) {
      const activationId = randomUUID();
      this.#database
        .prepare(
          `INSERT INTO activations
            (id, task_id, target_agent_id, reason_type, source_event_id, status, created_at)
           VALUES (?, ?, ?, 'agent-mention', ?, 'queued', ?)`,
        )
        .run(activationId, taskId, targetAgentId, commentId, occurredAt);
      this.appendActivity(
        taskId,
        "activation.created",
        { kind: "framework", id: "coordination" },
        { activationId, targetAgentId, reasonType: "agent-mention", sourceEventId: commentId },
        occurredAt,
      );
    }
  }

  private createUserMentionAttention(
    taskId: string,
    commentId: string,
    mentioned: boolean,
    createdAt: string,
  ): void {
    if (!mentioned) return;
    const attentionReasonId = randomUUID();
    this.#database
      .prepare(
        `INSERT INTO attention_reasons
          (id, task_id, type, source_event_id, created_at, resolved_at)
         VALUES (?, ?, 'user-mention', ?, ?, NULL)`,
      )
      .run(attentionReasonId, taskId, commentId, createdAt);
    this.appendActivity(
      taskId,
      "attention.created",
      { kind: "framework", id: "coordination" },
      { attentionReasonId, reasonType: "user-mention", sourceEventId: commentId },
      createdAt,
    );
  }

  private readActivations(taskId: string): ActivationView[] {
    const rows = this.#database
      .prepare(
        `SELECT id, target_agent_id, reason_type, source_event_id, status
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
      }>;
    return rows.map((row) => ({
      id: row.id,
      targetAgentId: row.target_agent_id,
      status: row.status,
      reason: { type: row.reason_type, sourceEventId: row.source_event_id },
      attempts: this.readAttempts(row.id),
      startupFailure: this.readActivationStartupFailure(row.id),
    }));
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
                outcome_status, outcome_summary, thread_id
         FROM attempts
         WHERE activation_id = ?
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
        thread_id: string | null;
      }>;
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      workspacePath: row.workspace_path,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      outcome:
        row.outcome_status === null
          ? null
          : { status: row.outcome_status, summary: row.outcome_summary ?? "" },
      threadId: row.thread_id,
    }));
  }

  readAttemptTranscriptReference(attemptId: string): { threadId: string | null } | undefined {
    return this.#database
      .prepare("SELECT thread_id AS threadId FROM attempts WHERE id = ?")
      .get(attemptId) as { threadId: string | null } | undefined;
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

  private readStoredResponse<Result>(commandType: string, idempotencyKey: string): Result | undefined {
    const row = this.#database
      .prepare(
        "SELECT response_json FROM command_responses WHERE command_type = ? AND idempotency_key = ?",
      )
      .get(commandType, idempotencyKey) as { response_json: string } | undefined;
    return row === undefined ? undefined : (JSON.parse(row.response_json) as Result);
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

  private storeCommandResponse(
    commandType: string,
    idempotencyKey: string,
    result: BoardMutationResult,
  ): void {
    this.#database
      .prepare("INSERT INTO command_responses VALUES (?, ?, ?)")
      .run(commandType, idempotencyKey, JSON.stringify(result));
  }
}
