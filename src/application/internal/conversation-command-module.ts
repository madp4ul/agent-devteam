import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type {
  ContinueAgentConversationCommand,
  ContinueAgentConversationResult,
  RetireAgentConversationCommand,
  RetireAgentConversationResult,
} from "../conversation-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { IdempotentCommandExecutor } from "./idempotent-command-executor.ts";
import type { ActivityJournal } from "./activity-journal.ts";
import type { ActivationCreationModule } from "./activation-creation-module.ts";

export class ConversationCommandModule {
  readonly #database: DatabaseSync;
  readonly #idempotentCommands: IdempotentCommandExecutor;
  readonly #activityJournal: ActivityJournal;
  readonly #activationCreation: ActivationCreationModule;

  constructor(
    database: CoordinationDatabase,
    idempotentCommands: IdempotentCommandExecutor,
    activityJournal: ActivityJournal,
    activationCreation: ActivationCreationModule,
  ) {
    this.#database = database.connection;
    this.#idempotentCommands = idempotentCommands;
    this.#activityJournal = activityJournal;
    this.#activationCreation = activationCreation;
  }

  continue(command: ContinueAgentConversationCommand): ContinueAgentConversationResult {
    return this.#idempotentCommands.execute({
      kind: "continue-agent-conversation",
      scope: [command.taskId, command.conversationId],
      idempotencyKey: command.idempotencyKey,
    }, () => {
      if (command.body.trim().length === 0) return { accepted: false, reason: "empty-message" };
      const conversation = this.#database.prepare(
        `SELECT conversation.owning_agent_id, conversation.current_thread_id,
                task.archived_at, agent.applied AS agent_applied
         FROM agent_conversations conversation
         JOIN tasks task ON task.id = conversation.task_id
         LEFT JOIN agents agent ON agent.id = conversation.owning_agent_id
         WHERE conversation.id = ? AND conversation.task_id = ?`,
      ).get(command.conversationId, command.taskId) as {
        owning_agent_id: string;
        current_thread_id: string | null;
        archived_at: string | null;
        agent_applied: number | null;
      } | undefined;
      if (conversation === undefined) return { accepted: false, reason: "not-found" };
      if (conversation.archived_at !== null) return { accepted: false, reason: "task-archived" };
      if (conversation.agent_applied !== 1) return { accepted: false, reason: "owning-agent-unavailable" };
      if (conversation.current_thread_id === null) return { accepted: false, reason: "thread-unavailable" };

      const occurredAt = new Date().toISOString();
      const message = {
        id: randomUUID(),
        conversationId: command.conversationId,
        body: command.body,
        actor: command.actor,
        occurredAt,
      };
      this.#database.prepare(
        `INSERT INTO agent_conversation_messages
          (id, conversation_id, task_id, body, actor_kind, actor_id, occurred_at)
         VALUES (?, ?, ?, ?, 'user', ?, ?)`,
      ).run(message.id, message.conversationId, command.taskId, message.body, command.actor.id, occurredAt);

      const activationId = this.#activationCreation.createFollowUp({
        taskId: command.taskId,
        conversationId: command.conversationId,
        sourceEventId: message.id,
        continuationMessage: command.body,
        occurredAt,
      });
      this.#activityJournal.append(command.taskId, "conversation.continued", command.actor, {
        conversationId: command.conversationId,
        messageId: message.id,
        activationId,
        targetAgentId: conversation.owning_agent_id,
      }, occurredAt);
      this.#database.prepare(
        `UPDATE agent_conversations
         SET latest_activity_at = ?,
             latest_activity_sequence = (SELECT COALESCE(MAX(sequence), 0) FROM activity_ledger)
         WHERE id = ?`,
      ).run(occurredAt, command.conversationId);
      return { accepted: true as const, message, activationId };
    }, (result) => result.accepted);
  }

  retire(command: RetireAgentConversationCommand): RetireAgentConversationResult {
    return this.#idempotentCommands.execute({
      kind: "retire-agent-conversation",
      scope: [command.taskId, command.conversationId],
      idempotencyKey: command.idempotencyKey,
    }, () => {
      if (command.reason.trim().length === 0) return { accepted: false, reason: "empty-reason" };
      const conversation = this.#database.prepare(
        `SELECT conversation.owning_agent_id, conversation.retired_at, task.archived_at
         FROM agent_conversations conversation
         JOIN tasks task ON task.id = conversation.task_id
         WHERE conversation.id = ? AND conversation.task_id = ?`,
      ).get(command.conversationId, command.taskId) as {
        owning_agent_id: string;
        retired_at: string | null;
        archived_at: string | null;
      } | undefined;
      if (conversation === undefined) return { accepted: false, reason: "not-found" };
      if (conversation.retired_at !== null) return { accepted: false, reason: "not-current-conversation" };
      if (conversation.archived_at !== null) return { accepted: false, reason: "task-archived" };
      const unfinished = this.#database.prepare(
        `SELECT 1 FROM activations
         WHERE task_id = ? AND target_agent_id = ? AND status <> 'completed'
         LIMIT 1`,
      ).get(command.taskId, conversation.owning_agent_id);
      if (unfinished !== undefined) return { accepted: false, reason: "activation-work-pending" };

      const occurredAt = new Date().toISOString();
      this.#activityJournal.append(command.taskId, "conversation.retired", command.actor, {
        conversationId: command.conversationId,
        targetAgentId: conversation.owning_agent_id,
        reason: command.reason,
      }, occurredAt);
      this.#database.prepare(
        `UPDATE agent_conversations
         SET retired_at = ?, retirement_reason = ?, retirement_actor_id = ?,
             latest_activity_at = ?,
             latest_activity_sequence = (SELECT COALESCE(MAX(sequence), 0) FROM activity_ledger)
         WHERE id = ?`,
      ).run(occurredAt, command.reason, command.actor.id, occurredAt, command.conversationId);
      return {
        accepted: true as const,
        retirement: { reason: command.reason, actor: command.actor, occurredAt },
      };
    }, (result) => result.accepted);
  }
}
