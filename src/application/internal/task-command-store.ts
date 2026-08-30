import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type {
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
  TaskRelationshipView,
  TaskRelationshipMutationResult,
  TaskView,
} from "../task-contract.ts";
import { findParticipantMentions } from "../participant-mentions.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { TaskProjectionStore } from "./task-projection-store.ts";
import type { IdempotentCommandExecutor } from "./idempotent-command-executor.ts";
import { taskCreationAllowed } from "./task-creation-policy.ts";
import type { NotificationStore } from "./notification-store.ts";
import type { ActivityJournal } from "./activity-journal.ts";
import type { AttentionRecorder } from "./attention-recorder.ts";
import type { ActivationCreationModule } from "./activation-creation-module.ts";

export class TaskCommandStore {
  readonly #database: DatabaseSync;
  readonly #projections: TaskProjectionStore;
  readonly #idempotentCommands: IdempotentCommandExecutor;
  readonly #notifications: NotificationStore;
  readonly #activityJournal: ActivityJournal;
  readonly #attentionRecorder: AttentionRecorder;
  readonly #activationCreation: ActivationCreationModule;

  constructor(
    database: CoordinationDatabase,
    projections: TaskProjectionStore,
    idempotentCommands: IdempotentCommandExecutor,
    notifications: NotificationStore,
    activityJournal: ActivityJournal,
    attentionRecorder: AttentionRecorder,
    activationCreation: ActivationCreationModule,
  ) {
    this.#database = database.connection;
    this.#projections = projections;
    this.#idempotentCommands = idempotentCommands;
    this.#notifications = notifications;
    this.#activityJournal = activityJournal;
    this.#attentionRecorder = attentionRecorder;
    this.#activationCreation = activationCreation;
  }

  createTask(command: CreateTaskCommand): BoardMutationResult {
    return this.#idempotentCommands.execute({
      kind: "create-task",
      idempotencyKey: command.idempotencyKey,
    }, () => {
      const rejection = this.taskCreationRejection(command);
      if (rejection !== undefined) return rejection;

      const task = this.insertTask(command, {});
      return { accepted: true, task };
    }, (result) => result.accepted);
  }

  createChildTask(command: CreateChildTaskCommand): BoardMutationResult {
    return this.#idempotentCommands.execute({
      kind: "create-child-task",
      idempotencyKey: command.idempotencyKey,
    }, () => {
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
      return { accepted: true, task: updated };
    }, (result) => result.accepted);
  }

  editTask(command: EditTaskCommand): BoardMutationResult {
    return this.#idempotentCommands.execute({
      kind: "edit-task",
      scope: [command.taskId],
      idempotencyKey: command.idempotencyKey,
    }, () => {
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
      this.#activityJournal.append(
        command.taskId,
        "task.edited",
        command.actor,
        {},
      );
      const task = this.#projections.readTask(command.taskId);
      if (task === undefined) throw new Error("Edited task could not be read back");
      return { accepted: true, task };
    }, (result) => result.accepted);
  }

  moveTask(command: MoveTaskCommand): MoveTaskResult {
    return this.#idempotentCommands.execute({
      kind: "move-task",
      scope: [command.taskId],
      idempotencyKey: command.idempotencyKey,
    }, () => {
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
      const sourceEventId = this.#activityJournal.append(
        command.taskId,
        "task.moved",
        command.actor,
        {
          fromColumnId: currentTask.columnId,
          toColumnId: command.destinationColumnId,
          ...(attemptId === undefined ? {} : { attemptId }),
        },
      );
      this.#notifications.recordColumnEntry(
        command.taskId,
        currentTask.boardId,
        command.destinationColumnId,
        sourceEventId,
        command.actor,
      );
      this.createColumnEntryActivation(
        command.taskId,
        currentTask.boardId,
        command.destinationColumnId,
        sourceEventId,
        attemptId,
      );
      for (const relationship of relationshipsSatisfied) {
        const relationshipEventId = this.#activityJournal.append(
          relationship.source_task_id,
          "relationship.satisfied",
          { kind: "framework", id: "coordination" },
          this.relationshipActivityDetails(relationship, "source", command.taskId),
        );
        this.#activityJournal.append(
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
      return {
        accepted: true,
        task,
        transition: {
          taskId: task.id,
          fromColumnId: currentTask.columnId,
          toColumnId: command.destinationColumnId,
        },
      };
    }, (result) => result.accepted);
  }

  resolveInertMove(command: MoveTaskCommand): InertMoveTaskResult | MoveTaskResult | undefined {
    return this.#idempotentCommands.execute({
      kind: "move-task",
      scope: [command.taskId],
      idempotencyKey: command.idempotencyKey,
    }, () => {
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
      return {
        accepted: true,
        outcome: "already-in-column",
        task: currentTask,
        transition: {
          taskId: currentTask.id,
          fromColumnId: currentTask.columnId,
          toColumnId: currentTask.columnId,
        },
      };
    }, (result) => result !== undefined);
  }

  createTaskRelationship(command: CreateTaskRelationshipCommand): TaskRelationshipMutationResult {
    return this.#idempotentCommands.execute({
      kind: "create-task-relationship",
      idempotencyKey: command.idempotencyKey,
    }, () => {
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
      return result;
    });
  }

  removeTaskRelationship(command: RemoveTaskRelationshipCommand): RemoveTaskRelationshipResult {
    return this.#idempotentCommands.execute({
      kind: "remove-task-relationship",
      idempotencyKey: command.idempotencyKey,
    }, () => {
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
          const sourceEventId = this.#activityJournal.append(
            row.source_task_id,
            "relationship.removed",
            command.actor,
            this.relationshipActivityDetails(relationship, "source", row.target_task_id),
            occurredAt,
          );
          this.#activityJournal.append(
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
      return result;
    });
  }

  addTaskComment(command: AddTaskCommentCommand): AddTaskCommentResult {
    return this.#idempotentCommands.execute({
      kind: "add-task-comment",
      scope: [command.taskId],
      idempotencyKey: command.idempotencyKey,
    }, () => {
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
        command.actor,
        comment.occurredAt,
      );
      const updated = this.#projections.readTask(command.taskId);
      if (updated === undefined) throw new Error("Commented task could not be read back");
      return { accepted: true, task: updated, comment };
    }, (result) => result.accepted);
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
    return this.#idempotentCommands.execute({
      kind: "mark-user-mention-addressed",
      idempotencyKey: command.idempotencyKey,
    }, () => {
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
        this.#activityJournal.append(
          reason.task_id,
          "attention.resolved",
          command.actor,
          { attentionReasonId: command.attentionReasonId, reasonType: "user-mention" },
          resolvedAt,
        );
        result = { accepted: true, attentionReasonId: command.attentionReasonId, resolvedAt };
      }
      return result;
    });
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
    const sourceEventId = this.#activityJournal.append(taskId, "task.created", command.actor, {
      boardId: command.boardId,
      columnId: command.columnId,
      ...activityDetails,
      ...(startingRef === undefined ? {} : { startingRef }),
    });
    this.#notifications.recordColumnEntry(
      taskId,
      command.boardId,
      command.columnId,
      sourceEventId,
      command.actor,
    );
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
    this.#activityJournal.append(sourceTaskId, "relationship.created", actor, this.relationshipActivityDetails(
      relationship,
      "source",
      targetTaskId,
      {
      ...(sourceAttemptId === undefined ? {} : { attemptId: sourceAttemptId }),
      },
    ));
    this.#activityJournal.append(targetTaskId, "relationship.created", actor, this.relationshipActivityDetails(
      relationship,
      "target",
      sourceTaskId,
    ));
    return relationship;
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
    this.#activationCreation.createOrdinary({
      taskId,
      targetAgentId: destination.watching_agent_id,
      reasonType: "column-entry",
      sourceEventId,
      occurredAt,
    });
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
    this.#activationCreation.createOrdinary({
      taskId,
      targetAgentId: task.watching_agent_id,
      reasonType: "blockers-cleared",
      sourceEventId,
      occurredAt,
    });
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
      this.#activationCreation.createOrdinary({
        taskId,
        targetAgentId,
        reasonType: "agent-mention",
        sourceEventId: commentId,
        occurredAt,
      });
    }
  }

  private createUserMentionAttention(
    taskId: string,
    commentId: string,
    mentioned: boolean,
    actor: Actor,
    createdAt: string,
  ): void {
    if (!mentioned || actor.kind !== "agent") return;
    this.#attentionRecorder.record(
      "user-mention",
      taskId,
      commentId,
      createdAt,
    );
  }

}
