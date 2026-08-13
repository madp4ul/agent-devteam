import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type {
  ActivationView,
  DismissStaleActivationCommand,
  DismissStaleActivationResult,
  ActivationRecoveryCommand,
  ActivationRecoveryAction,
  ActivationRecoveryResult,
  ContinuePermissionBlockedActivationCommand,
  AddTaskCommentCommand,
  AddTaskCommentResult,
  Actor,
  BoardMutationResult,
  CreateTaskCommand,
  CreateChildTaskCommand,
  CreateTaskRelationshipCommand,
  RemoveTaskRelationshipCommand,
  RemoveTaskRelationshipResult,
  EditTaskCommand,
  MoveTaskCommand,
  MoveTaskResult,
  InertMoveTaskResult,
  MarkUserMentionAddressedCommand,
  MarkUserMentionAddressedResult,
  TaskAttentionView,
  TaskActivityView,
  TaskRelationshipView,
  TaskRelationshipMutationResult,
  TaskView,
} from "../coordination-contract.ts";
import { findParticipantMentions } from "../participant-mentions.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { TaskProjectionStore } from "./task-projection-store.ts";
import type { CommandResponseStore } from "./command-response-store.ts";
import { taskCreationAllowed } from "./task-creation-policy.ts";

export class TaskCommandStore {
  readonly #owner: CoordinationDatabase;
  readonly #database: DatabaseSync;
  readonly #projections: TaskProjectionStore;
  readonly #commandResponses: CommandResponseStore;

  constructor(
    database: CoordinationDatabase,
    projections: TaskProjectionStore,
    commandResponses: CommandResponseStore,
  ) {
    this.#owner = database;
    this.#database = database.connection;
    this.#projections = projections;
    this.#commandResponses = commandResponses;
  }

  createTask(command: CreateTaskCommand): BoardMutationResult {
    return this.transaction(() => {
      const prior = this.#commandResponses.read<BoardMutationResult>(
        "create-task",
        command.idempotencyKey,
      );
      if (prior !== undefined) return prior;
      const rejection = this.taskCreationRejection(command);
      if (rejection !== undefined) return rejection;

      const task = this.insertTask(command, {});
      const result: BoardMutationResult = { accepted: true, task };
      this.#commandResponses.write("create-task", command.idempotencyKey, result);
      return result;
    });
  }

  createChildTask(command: CreateChildTaskCommand): BoardMutationResult {
    return this.transaction(() => {
      const prior = this.#commandResponses.read<BoardMutationResult>(
        "create-child-task",
        command.idempotencyKey,
      );
      if (prior !== undefined) return prior;
      const attemptId = this.validatedAgentAttemptId(command.parentTaskId, command);
      if (this.#projections.readTask(command.parentTaskId) === undefined) {
        return { accepted: false, reason: "not-found" };
      }
      if (this.taskIsReadOnly(this.#projections.readTask(command.parentTaskId)!)) {
        return { accepted: false, reason: "archived-task" };
      }
      const rejection = this.taskCreationRejection(command);
      if (rejection !== undefined) return rejection;
      if (command.startingRef !== undefined && command.startingRef.trim().length === 0) {
        return { accepted: false, reason: "invalid-starting-ref" };
      }

      const task = this.insertTask(
        command,
        { parentTaskId: command.parentTaskId },
        command.startingRef?.trim(),
      );
      this.insertRelationship("parent-child", command.parentTaskId, task.id, command.actor, attemptId);
      const updated = this.#projections.readTask(task.id);
      if (updated === undefined) throw new Error("Created child task could not be read back");
      const result: BoardMutationResult = { accepted: true, task: updated };
      this.#commandResponses.write("create-child-task", command.idempotencyKey, result);
      return result;
    });
  }

  editTask(command: EditTaskCommand): BoardMutationResult {
    return this.transaction(() => {
      const commandType = `edit-task:${command.taskId}`;
      const prior = this.#commandResponses.read<BoardMutationResult>(commandType, command.idempotencyKey);
      if (prior !== undefined) return prior;
      const currentTask = this.#projections.readTask(command.taskId);
      if (currentTask === undefined) return { accepted: false, reason: "not-found" };
      if (this.taskIsReadOnly(currentTask)) {
        return { accepted: false, reason: "archived-task" };
      }
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
      const task = this.#projections.readTask(command.taskId);
      if (task === undefined) throw new Error("Edited task could not be read back");
      const result: BoardMutationResult = { accepted: true, task };
      this.#commandResponses.write(commandType, command.idempotencyKey, result);
      return result;
    });
  }

  moveTask(command: MoveTaskCommand): MoveTaskResult {
    return this.transaction(() => {
      const commandType = `move-task:${command.taskId}`;
      const prior = this.#commandResponses.read<MoveTaskResult>(commandType, command.idempotencyKey);
      if (prior !== undefined) return prior;
      const currentTask = this.#projections.readTask(command.taskId);
      if (currentTask === undefined) return { accepted: false, reason: "not-found" };
      if (this.taskIsReadOnly(currentTask)) {
        return { accepted: false, reason: "archived-task" };
      }
      const attemptId = this.validatedAgentAttemptId(command.taskId, command);
      if (currentTask.revision !== command.expectedRevision) {
        return { accepted: false, reason: "revision-conflict", currentTask };
      }
      const mapped = this.#database.prepare("SELECT 1 FROM mapped_tasks WHERE id = ?")
        .get(command.taskId);
      if (command.actor.kind !== "user" && mapped === undefined) {
        return { accepted: false, reason: "unmapped-task-user-only" };
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

      const relationshipsSatisfied = command.destinationColumnId === "completion"
        ? (this.#database
            .prepare(
              `SELECT id, type, source_task_id
               FROM task_relationships
               WHERE type IN ('dependency', 'parent-child') AND target_task_id = ?`,
            )
            .all(command.taskId) as Array<{
              id: string;
              type: TaskRelationshipView["type"];
              source_task_id: string;
            }>)
        : [];
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
          ...(attemptId === undefined ? {} : { attemptId }),
        },
      );
      this.createColumnEntryActivation(
        command.taskId,
        currentTask.boardId,
        command.destinationColumnId,
        sourceEventId,
        attemptId,
      );
      for (const relationship of relationshipsSatisfied) {
        const relationshipEventId = this.appendActivity(
          relationship.source_task_id,
          "relationship.satisfied",
          { kind: "framework", id: "coordination" },
          this.relationshipActivityDetails(relationship, "source", command.taskId),
        );
        this.appendActivity(
          command.taskId,
          "relationship.satisfied",
          { kind: "framework", id: "coordination" },
          this.relationshipActivityDetails(relationship, "target", relationship.source_task_id),
        );
        if (this.#projections.readBlockingTaskIds(relationship.source_task_id).length === 0) {
          this.createBlockersClearedActivation(
            relationship.source_task_id,
            relationshipEventId,
          );
        }
      }
      const task = this.#projections.readTask(command.taskId);
      if (task === undefined) throw new Error("Moved task could not be read back");
      const result: MoveTaskResult = {
        accepted: true,
        task,
        transition: {
          taskId: task.id,
          fromColumnId: currentTask.columnId,
          toColumnId: command.destinationColumnId,
        },
      };
      this.#commandResponses.write(commandType, command.idempotencyKey, result);
      return result;
    });
  }

  resolveInertMove(command: MoveTaskCommand): InertMoveTaskResult | MoveTaskResult | undefined {
    return this.transaction(() => {
      const commandType = `move-task:${command.taskId}`;
      const prior = this.#commandResponses.read<InertMoveTaskResult | MoveTaskResult>(
        commandType,
        command.idempotencyKey,
      );
      if (prior !== undefined) return prior;
      const currentTask = this.#projections.readTask(command.taskId);
      if (
        currentTask === undefined ||
        currentTask.archived ||
        currentTask.revision !== command.expectedRevision ||
        currentTask.columnId !== command.destinationColumnId
      ) {
        return undefined;
      }
      this.validatedAgentAttemptId(command.taskId, command);
      const mapped = this.#database.prepare("SELECT 1 FROM mapped_tasks WHERE id = ?")
        .get(command.taskId);
      if (mapped === undefined) return undefined;
      const result: InertMoveTaskResult = {
        accepted: true,
        outcome: "already-in-column",
        task: currentTask,
        transition: {
          taskId: currentTask.id,
          fromColumnId: currentTask.columnId,
          toColumnId: currentTask.columnId,
        },
      };
      this.#commandResponses.write(commandType, command.idempotencyKey, result);
      return result;
    });
  }

  createTaskRelationship(command: CreateTaskRelationshipCommand): TaskRelationshipMutationResult {
    return this.transaction(() => {
      const commandType = "create-task-relationship";
      const prior = this.#commandResponses.read<TaskRelationshipMutationResult>(
        commandType,
        command.idempotencyKey,
      );
      if (prior !== undefined) return prior;
      const attemptId = this.validatedAgentAttemptId(command.sourceTaskId, command);
      const sourceTask = this.#projections.readTask(command.sourceTaskId);
      const targetTask = this.#projections.readTask(command.targetTaskId);
      let result: TaskRelationshipMutationResult;
      if (sourceTask === undefined || targetTask === undefined) {
        result = { accepted: false, reason: "not-found" };
      } else if (
        this.taskIsReadOnly(sourceTask) ||
        this.taskIsReadOnly(targetTask)
      ) {
        result = { accepted: false, reason: "archived-task" };
      } else if (command.sourceTaskId === command.targetTaskId) {
        result = { accepted: false, reason: "self-relationship" };
      } else {
        const duplicate = this.#database
          .prepare(
            `SELECT 1 FROM task_relationships
             WHERE type = ? AND source_task_id = ? AND target_task_id = ?`,
          )
          .get(command.type, command.sourceTaskId, command.targetTaskId);
        if (duplicate !== undefined) {
          result = { accepted: false, reason: "duplicate-relationship" };
        } else {
          const relationship = this.insertRelationship(
            command.type,
            command.sourceTaskId,
            command.targetTaskId,
            command.actor,
            attemptId,
          );
          result = {
            accepted: true,
            relationship,
            sourceTask: this.#projections.readTask(command.sourceTaskId)!,
            targetTask: this.#projections.readTask(command.targetTaskId)!,
          };
        }
      }
      this.#commandResponses.write(commandType, command.idempotencyKey, result);
      return result;
    });
  }

  removeTaskRelationship(command: RemoveTaskRelationshipCommand): RemoveTaskRelationshipResult {
    return this.transaction(() => {
      const commandType = "remove-task-relationship";
      const prior = this.#commandResponses.read<RemoveTaskRelationshipResult>(
        commandType,
        command.idempotencyKey,
      );
      if (prior !== undefined) return prior;
      const currentTask = this.#projections.readTask(command.taskId);
      let result: RemoveTaskRelationshipResult;
      if (currentTask === undefined) {
        result = { accepted: false, reason: "not-found" };
      } else if (this.taskIsReadOnly(currentTask)) {
        result = { accepted: false, reason: "archived-task" };
      } else {
        const row = this.#database
          .prepare(
            `SELECT relationship.id, relationship.type,
                    relationship.source_task_id, relationship.target_task_id,
                    target.column_id AS target_column_id
             FROM task_relationships relationship
             JOIN tasks target ON target.id = relationship.target_task_id
             WHERE relationship.id = ?
               AND (relationship.source_task_id = ? OR relationship.target_task_id = ?)`,
          )
          .get(command.relationshipId, command.taskId, command.taskId) as {
            id: string;
            type: TaskRelationshipView["type"];
            source_task_id: string;
            target_task_id: string;
            target_column_id: string;
          } | undefined;
        if (row === undefined) {
          result = { accepted: false, reason: "relationship-conflict" };
        } else {
          const relationship: TaskRelationshipView = {
            id: row.id,
            type: row.type,
            sourceTaskId: row.source_task_id,
            targetTaskId: row.target_task_id,
          };
          const clearedFinalBlocker = row.target_column_id !== "completion" &&
            this.#projections.readBlockingTaskIds(row.source_task_id).length === 1;
          this.#database.prepare("DELETE FROM task_relationships WHERE id = ?").run(row.id);
          const occurredAt = new Date().toISOString();
          const sourceEventId = this.appendActivity(
            row.source_task_id,
            "relationship.removed",
            command.actor,
            this.relationshipActivityDetails(relationship, "source", row.target_task_id),
            occurredAt,
          );
          this.appendActivity(
            row.target_task_id,
            "relationship.removed",
            command.actor,
            this.relationshipActivityDetails(relationship, "target", row.source_task_id),
            occurredAt,
          );
          if (clearedFinalBlocker) {
            this.createBlockersClearedActivation(row.source_task_id, sourceEventId);
          }
          result = {
            accepted: true,
            relationship,
            sourceTask: this.#projections.readTask(row.source_task_id)!,
            targetTask: this.#projections.readTask(row.target_task_id)!,
            clearedFinalBlocker,
          };
        }
      }
      this.#commandResponses.write(commandType, command.idempotencyKey, result);
      return result;
    });
  }

  addTaskComment(command: AddTaskCommentCommand): AddTaskCommentResult {
    return this.transaction(() => {
      const commandType = `add-task-comment:${command.taskId}`;
      const prior = this.#commandResponses.read<AddTaskCommentResult>(
        commandType,
        command.idempotencyKey,
      );
      if (prior !== undefined) return prior;
      const task = this.#projections.readTask(command.taskId);
      if (task === undefined) return { accepted: false, reason: "not-found" };
      if (this.taskIsReadOnly(task)) {
        return { accepted: false, reason: "archived-task" };
      }
      if (command.body.trim().length === 0) {
        return { accepted: false, reason: "empty-comment" };
      }
      const attemptId = this.validatedAgentAttemptId(command.taskId, command);
      const comment = {
        id: randomUUID(),
        body: command.body,
        actor: command.actor,
        occurredAt: new Date().toISOString(),
        ...(attemptId === undefined ? {} : { attemptId }),
      };
      this.#database
        .prepare(
          `INSERT INTO task_comments
            (id, task_id, body, actor_kind, actor_id, occurred_at, attempt_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          comment.id,
          command.taskId,
          comment.body,
          comment.actor.kind,
          comment.actor.id,
          comment.occurredAt,
          comment.attemptId ?? null,
        );
      const mentions = this.readMentionTargets(comment.body);
      this.createMentionActivations(command.taskId, comment.id, mentions.agentIds);
      this.createUserMentionAttention(
        command.taskId,
        comment.id,
        mentions.user,
        comment.occurredAt,
      );
      const updated = this.#projections.readTask(command.taskId);
      if (updated === undefined) throw new Error("Commented task could not be read back");
      const result: AddTaskCommentResult = { accepted: true, task: updated, comment };
      this.#commandResponses.write(commandType, command.idempotencyKey, result);
      return result;
    });
  }

  private assertAgentAttemptProvenance(taskId: string, agentId: string, attemptId: string): void {
    const attempt = this.#database
      .prepare(
        `SELECT 1
         FROM attempts attempt
         JOIN activations activation ON activation.id = attempt.activation_id
         WHERE attempt.id = ? AND activation.task_id = ?
           AND activation.target_agent_id = ? AND attempt.status = 'running'`,
      )
      .get(attemptId, taskId, agentId);
    if (attempt === undefined) throw new Error("Agent action attempt provenance is not current");
  }

  private validatedAgentAttemptId(
    taskId: string,
    command: { actor: Actor; attemptId?: string },
  ): string | undefined {
    const attemptId = command.actor.kind === "agent" ? command.attemptId : undefined;
    if (attemptId !== undefined) {
      this.assertAgentAttemptProvenance(taskId, command.actor.id, attemptId);
    }
    return attemptId;
  }

  private taskIsReadOnly(task: TaskView): boolean {
    return task.archived === true || this.#projections.isTaskArchivalPending(task.id);
  }

  markUserMentionAddressed(
    command: MarkUserMentionAddressedCommand,
  ): MarkUserMentionAddressedResult {
    return this.transaction(() => {
      const commandType = "mark-user-mention-addressed";
      const prior = this.#commandResponses.read<MarkUserMentionAddressedResult>(
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
      this.#commandResponses.write(commandType, command.idempotencyKey, result);
      return result;
    });
  }

  retryFailedActivation(command: ActivationRecoveryCommand): ActivationRecoveryResult {
    return this.recoverActivation("retry", command, "technical");
  }

  dismissFailedActivation(command: ActivationRecoveryCommand): ActivationRecoveryResult {
    return this.recoverActivation("dismiss", command, "technical");
  }

  dismissStaleActivation(
    command: DismissStaleActivationCommand,
  ): DismissStaleActivationResult {
    return this.transaction(() => {
      const prior = this.#commandResponses.read<DismissStaleActivationResult>(
        "dismiss-stale-activation",
        command.idempotencyKey,
      );
      if (prior !== undefined) return prior;
      const activation = this.#database.prepare(
        `SELECT activation.stale, activation.resolution, activation.task_id
         FROM activations activation
         WHERE activation.id = ?`,
      ).get(command.activationId) as
        | { stale: number; resolution: string | null; task_id: string }
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
          this.appendActivity(
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
          this.appendActivity(
            activation.task_id,
            "automation.resumed",
            command.actor,
            { activationId: command.activationId, resolution: "dismissed" },
            resolvedAt,
          );
        }
        result = { accepted: true, activationId: command.activationId };
      }
      this.#commandResponses.write("dismiss-stale-activation", command.idempotencyKey, result);
      return result;
    });
  }

  continuePermissionBlockedActivation(
    command: ContinuePermissionBlockedActivationCommand,
  ): ActivationRecoveryResult {
    const message = command.message.trim();
    if (message.length === 0) return { accepted: false, reason: "message-required" };
    return this.recoverActivation("continue", command, "permission", message);
  }

  private recoverActivation(
    action: ActivationRecoveryAction,
    command: ActivationRecoveryCommand,
    expectedFailureKind: "technical" | "permission",
    continuationMessage: string | null = null,
  ): ActivationRecoveryResult {
    return this.transaction(() => {
      const commandType = `${action}-failed-activation`;
      const prior = this.#commandResponses.read<ActivationRecoveryResult>(
        commandType,
        command.idempotencyKey,
      );
      if (prior !== undefined) return prior;
      const reason = this.#database
        .prepare(
          `SELECT attention.task_id, attention.resolved_at,
                  activation.id AS activation_id, activation.status,
                  activation.failure_kind
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
        this.appendActivity(
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
      this.#commandResponses.write(commandType, command.idempotencyKey, result);
      return result;
    });
  }


  private transaction<Result>(operation: () => Result): Result {
    return this.#owner.transaction(operation);
  }

  private insertTask(
    command: CreateTaskCommand,
    activityDetails: Record<string, string>,
    startingRef?: string,
  ): TaskView {
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
    if (startingRef !== undefined) {
      this.#database
        .prepare("INSERT INTO task_starting_refs (task_id, starting_ref) VALUES (?, ?)")
        .run(taskId, startingRef);
    }
    const sourceEventId = this.appendActivity(taskId, "task.created", command.actor, {
      boardId: command.boardId,
      columnId: command.columnId,
      ...activityDetails,
      ...(startingRef === undefined ? {} : { startingRef }),
    });
    this.createColumnEntryActivation(taskId, command.boardId, command.columnId, sourceEventId);
    const task = this.#projections.readTask(taskId);
    if (task === undefined) throw new Error("Created task could not be read back");
    return task;
  }

  private taskCreationRejection(command: CreateTaskCommand): BoardMutationResult | undefined {
    if (command.title.trim().length === 0) return { accepted: false, reason: "empty-title" };
    if (command.description.trim().length === 0) {
      return { accepted: false, reason: "empty-description" };
    }
    if (!taskCreationAllowed(command.columnId)) {
      return { accepted: false, reason: "completion-is-not-starting-column" };
    }
    const destination = this.#database
      .prepare("SELECT 1 FROM columns WHERE board_id = ? AND id = ? AND applied = 1")
      .get(command.boardId, command.columnId);
    return destination === undefined
      ? { accepted: false, reason: "invalid-destination" }
      : undefined;
  }

  private insertRelationship(
    type: TaskRelationshipView["type"],
    sourceTaskId: string,
    targetTaskId: string,
    actor: Actor,
    sourceAttemptId?: string,
  ): TaskRelationshipView {
    const relationship: TaskRelationshipView = {
      id: randomUUID(),
      type,
      sourceTaskId,
      targetTaskId,
    };
    this.#database
      .prepare("INSERT INTO task_relationships VALUES (?, ?, ?, ?)")
      .run(relationship.id, relationship.type, sourceTaskId, targetTaskId);
    this.appendActivity(sourceTaskId, "relationship.created", actor, this.relationshipActivityDetails(
      relationship,
      "source",
      targetTaskId,
      {
      ...(sourceAttemptId === undefined ? {} : { attemptId: sourceAttemptId }),
      },
    ));
    this.appendActivity(targetTaskId, "relationship.created", actor, this.relationshipActivityDetails(
      relationship,
      "target",
      sourceTaskId,
    ));
    return relationship;
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

  private relationshipActivityDetails(
    relationship: Pick<TaskRelationshipView, "id" | "type">,
    role: "source" | "target",
    relatedTaskId: string,
    additional: Record<string, string> = {},
  ): Record<string, string> {
    return {
      relationshipId: relationship.id,
      relationshipType: relationship.type,
      relationshipRole: role,
      relatedTaskId,
      ...additional,
    };
  }

  private createColumnEntryActivation(
    taskId: string,
    boardId: string,
    columnId: string,
    sourceEventId: string,
    currentAttemptId?: string,
  ): void {
    const destination = this.#database
      .prepare(
        `SELECT watching_agent_id
         FROM columns
         WHERE board_id = ? AND id = ? AND applied = 1`,
      )
      .get(boardId, columnId) as { watching_agent_id: string | null } | undefined;
    if (destination?.watching_agent_id === null || destination === undefined) return;
    const mentionedAgentIsClaimingResponsibility = currentAttemptId !== undefined && this.#database
      .prepare(
        `SELECT 1
         FROM attempts attempt
         JOIN activations activation ON activation.id = attempt.activation_id
         WHERE attempt.id = ? AND attempt.status = 'running'
           AND activation.reason_type = 'agent-mention'
           AND activation.target_agent_id = ?`,
      )
      .get(currentAttemptId, destination.watching_agent_id) !== undefined;
    if (mentionedAgentIsClaimingResponsibility) return;
    const occurredAt = new Date().toISOString();
    const activationId = this.queueActivation(
      taskId,
      destination.watching_agent_id,
      "column-entry",
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

  private createBlockersClearedActivation(taskId: string, sourceEventId: string): void {
    const task = this.#database
      .prepare(
        `SELECT task.board_id, task.column_id, column.watching_agent_id
         FROM tasks task
         JOIN columns column ON column.board_id = task.board_id AND column.id = task.column_id
         WHERE task.id = ? AND task.archived_at IS NULL
           AND task.archival_pending = 0 AND column.applied = 1`,
      )
      .get(taskId) as { watching_agent_id: string | null } | undefined;
    if (task?.watching_agent_id == null) return;
    const queuedColumnEntryAlreadyOwnsResponsibility = this.#database
      .prepare(
        `SELECT 1
         FROM activations activation
         WHERE activation.task_id = ?
           AND activation.target_agent_id = ?
           AND activation.reason_type = 'column-entry'
           AND activation.status = 'queued'
           AND activation.stale = 0
           AND NOT EXISTS (
             SELECT 1 FROM attempts attempt
             WHERE attempt.activation_id = activation.id
           )
         LIMIT 1`,
      )
      .get(taskId, task.watching_agent_id) !== undefined;
    if (queuedColumnEntryAlreadyOwnsResponsibility) return;
    const occurredAt = new Date().toISOString();
    const activationId = this.queueActivation(
      taskId,
      task.watching_agent_id,
      "blockers-cleared",
      sourceEventId,
      occurredAt,
    );
    this.appendActivity(
      taskId,
      "activation.created",
      { kind: "framework", id: "coordination" },
      {
        activationId,
        targetAgentId: task.watching_agent_id,
        reasonType: "blockers-cleared",
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
    for (const mention of findParticipantMentions(body)) {
      const participantId = mention.participantId;
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
      const activationId = this.queueActivation(
        taskId,
        targetAgentId,
        "agent-mention",
        commentId,
        occurredAt,
      );
      this.appendActivity(
        taskId,
        "activation.created",
        { kind: "framework", id: "coordination" },
        { activationId, targetAgentId, reasonType: "agent-mention", sourceEventId: commentId },
        occurredAt,
      );
    }
  }

  private queueActivation(
    taskId: string,
    targetAgentId: string,
    reasonType: ActivationView["reason"]["type"],
    sourceEventId: string,
    occurredAt: string,
  ): string {
    const profile = this.#database
      .prepare("SELECT model, reasoning_effort FROM agents WHERE id = ? AND applied = 1")
      .get(targetAgentId) as {
        model: string | null;
        reasoning_effort: ActivationView["reasoningEffort"];
      };
    const activationId = randomUUID();
    this.#database
      .prepare(
        `INSERT INTO activations
          (id, task_id, target_agent_id, reason_type, source_event_id, status, created_at,
           model, reasoning_effort, definition_version)
         VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?,
           (SELECT definition_version FROM runtime WHERE singleton = 1))`,
      )
      .run(
        activationId,
        taskId,
        targetAgentId,
        reasonType,
        sourceEventId,
        occurredAt,
        profile.model,
        profile.reasoning_effort,
      );
    return activationId;
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

}
