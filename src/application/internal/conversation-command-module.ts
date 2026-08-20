import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { ActivationView } from "../automation-contract.ts";
import type {
  ContinueAgentConversationCommand,
  ContinueAgentConversationResult,
} from "../conversation-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { IdempotentCommandExecutor } from "./idempotent-command-executor.ts";
import type { ActivityJournal } from "./activity-journal.ts";

export class ConversationCommandModule {
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

  continue(command: ContinueAgentConversationCommand): ContinueAgentConversationResult {
    return this.#idempotentCommands.execute({
      kind: "continue-agent-conversation",
      scope: [command.taskId, command.conversationId],
      idempotencyKey: command.idempotencyKey,
    }, () => {
      if (command.body.trim().length === 0) return { accepted: false, reason: "empty-message" };
      const conversation = this.#database.prepare(
        `SELECT conversation.owning_agent_id, conversation.current_thread_id,
                task.archived_at, agent.applied AS agent_applied,
                agent.model, agent.reasoning_effort
         FROM agent_conversations conversation
         JOIN tasks task ON task.id = conversation.task_id
         LEFT JOIN agents agent ON agent.id = conversation.owning_agent_id
         WHERE conversation.id = ? AND conversation.task_id = ?`,
      ).get(command.conversationId, command.taskId) as {
        owning_agent_id: string;
        current_thread_id: string | null;
        archived_at: string | null;
        agent_applied: number | null;
        model: string | null;
        reasoning_effort: ActivationView["reasoningEffort"];
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

      const activationId = randomUUID();
      this.#database.prepare(
        `INSERT INTO activations
          (id, task_id, target_agent_id, reason_type, source_event_id, status, created_at,
           model, reasoning_effort, continuation_message, definition_version, conversation_id)
         VALUES (?, ?, ?, 'user-follow-up', ?, 'queued', ?, ?, ?, ?,
           (SELECT definition_version FROM runtime WHERE singleton = 1), ?)`,
      ).run(
        activationId,
        command.taskId,
        conversation.owning_agent_id,
        message.id,
        occurredAt,
        conversation.model,
        conversation.reasoning_effort,
        command.body,
        command.conversationId,
      );
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
}
