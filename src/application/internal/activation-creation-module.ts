import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { ActivationView } from "../automation-contract.ts";
import type { ActivityJournal } from "./activity-journal.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";

type OrdinaryActivationReason = Exclude<ActivationView["reason"]["type"], "user-follow-up">;

export class ActivationCreationModule {
  readonly #database: DatabaseSync;
  readonly #activityJournal: ActivityJournal;

  constructor(database: CoordinationDatabase, activityJournal: ActivityJournal) {
    this.#database = database.connection;
    this.#activityJournal = activityJournal;
  }

  createOrdinary(input: {
    taskId: string;
    targetAgentId: string;
    reasonType: OrdinaryActivationReason;
    sourceEventId: string;
    occurredAt: string;
  }): string {
    const profile = this.#database
      .prepare("SELECT name, model, reasoning_effort FROM agents WHERE id = ? AND applied = 1")
      .get(input.targetAgentId) as {
        name: string;
        model: string | null;
        reasoning_effort: ActivationView["reasoningEffort"];
      };
    const activationId = randomUUID();
    const currentConversation = this.#database
      .prepare(
        `SELECT id FROM agent_conversations
         WHERE task_id = ? AND owning_agent_id = ? AND retired_at IS NULL`,
      )
      .get(input.taskId, input.targetAgentId) as { id: string } | undefined;
    const conversationId = currentConversation?.id ?? randomUUID();
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
        input.taskId,
        input.targetAgentId,
        input.reasonType,
        input.sourceEventId,
        input.occurredAt,
        profile.model,
        profile.reasoning_effort,
      );
    if (currentConversation === undefined) {
      const retiredConversation = this.#database.prepare(
        `SELECT id, retirement_reason FROM agent_conversations
         WHERE task_id = ? AND owning_agent_id = ? AND retired_at IS NOT NULL
         ORDER BY retired_at DESC, rowid DESC LIMIT 1`,
      ).get(input.taskId, input.targetAgentId) as {
        id: string;
        retirement_reason: string;
      } | undefined;
      this.#database
        .prepare(
          `INSERT INTO agent_conversations
            (id, task_id, owning_agent_id, owning_agent_name_snapshot, generated_label,
             originating_activation_id, created_at, latest_activity_at, latest_activity_sequence,
             replaces_conversation_id, replacement_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?,
             (SELECT COALESCE(MAX(sequence), 0) FROM activity_ledger), ?, ?)`,
        )
        .run(
          conversationId,
          input.taskId,
          input.targetAgentId,
          profile.name,
          this.generatedConversationLabel(input.taskId, input.reasonType, input.sourceEventId),
          activationId,
          input.occurredAt,
          input.occurredAt,
          retiredConversation?.id ?? null,
          retiredConversation?.retirement_reason ?? null,
        );
    }
    this.#database
      .prepare("UPDATE activations SET conversation_id = ? WHERE id = ?")
      .run(conversationId, activationId);
    this.#activityJournal.append(
      input.taskId,
      "activation.created",
      { kind: "framework", id: "coordination" },
      {
        activationId,
        targetAgentId: input.targetAgentId,
        reasonType: input.reasonType,
        sourceEventId: input.sourceEventId,
      },
      input.occurredAt,
    );
    this.#database.prepare(
      `UPDATE agent_conversations
       SET latest_activity_at = ?,
           latest_activity_sequence = (SELECT COALESCE(MAX(sequence), 0) FROM activity_ledger)
       WHERE id = ?`,
    ).run(input.occurredAt, conversationId);
    return activationId;
  }

  createFollowUp(input: {
    taskId: string;
    conversationId: string;
    sourceEventId: string;
    continuationMessage: string;
    occurredAt: string;
  }): string {
    const conversation = this.#database.prepare(
      `SELECT conversation.owning_agent_id, agent.model, agent.reasoning_effort
       FROM agent_conversations conversation
       JOIN agents agent ON agent.id = conversation.owning_agent_id
       WHERE conversation.id = ? AND conversation.task_id = ?`,
    ).get(input.conversationId, input.taskId) as {
      owning_agent_id: string;
      model: string | null;
      reasoning_effort: ActivationView["reasoningEffort"];
    } | undefined;
    if (conversation === undefined) {
      throw new Error(`Conversation ${input.conversationId} cannot create an activation`);
    }
    const activationId = randomUUID();
    this.#database.prepare(
      `INSERT INTO activations
        (id, task_id, target_agent_id, reason_type, source_event_id, status, created_at,
         model, reasoning_effort, continuation_message, definition_version, conversation_id)
       VALUES (?, ?, ?, 'user-follow-up', ?, 'queued', ?, ?, ?, ?,
         (SELECT definition_version FROM runtime WHERE singleton = 1), ?)`,
    ).run(
      activationId,
      input.taskId,
      conversation.owning_agent_id,
      input.sourceEventId,
      input.occurredAt,
      conversation.model,
      conversation.reasoning_effort,
      input.continuationMessage,
      input.conversationId,
    );
    return activationId;
  }

  private generatedConversationLabel(
    taskId: string,
    reasonType: OrdinaryActivationReason,
    sourceEventId: string,
  ): string {
    const task = this.#database.prepare("SELECT title FROM tasks WHERE id = ?")
      .get(taskId) as { title: string };
    const sourceComment = reasonType === "agent-mention"
      ? this.#database.prepare("SELECT body FROM task_comments WHERE id = ? AND task_id = ?")
          .get(sourceEventId, taskId) as { body: string } | undefined
      : undefined;
    const preview = (sourceComment?.body ?? task.title).replace(/\s+/g, " ").trim();
    return preview.length <= 80 ? preview : `${preview.slice(0, 79).trimEnd()}…`;
  }
}
