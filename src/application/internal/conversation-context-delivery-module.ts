import type { DatabaseSync } from "node:sqlite";

import type { ActivationContextView } from "../runtime-contract.ts";
import type { TaskView } from "../task-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";

export class ConversationContextDeliveryModule {
  readonly #owner: CoordinationDatabase;
  readonly #database: DatabaseSync;

  constructor(database: CoordinationDatabase) {
    this.#owner = database;
    this.#database = database.connection;
  }

  composeAndRecordActivationContext(activationId: string, task: TaskView): ActivationContextView {
    return this.#owner.transaction(() => {
      const stored = this.#database
        .prepare("SELECT context_json FROM activation_contexts WHERE activation_id = ?")
        .get(activationId) as { context_json: string } | undefined;
      if (stored !== undefined) return JSON.parse(stored.context_json) as ActivationContextView;

      const conversation = this.#database.prepare(
        `SELECT conversation.id, conversation.originating_activation_id,
                conversation.delivered_description,
                conversation.delivered_comment_sequence,
                conversation.delivered_activity_sequence,
                activation.source_event_id
         FROM activations activation
         JOIN agent_conversations conversation ON conversation.id = activation.conversation_id
         WHERE activation.id = ?`,
      ).get(activationId) as {
        id: string;
        originating_activation_id: string;
        delivered_description: string | null;
        delivered_comment_sequence: number;
        delivered_activity_sequence: number;
        source_event_id: string;
      } | undefined;
      if (conversation === undefined) {
        throw new Error(`Activation ${activationId} has no conversation context`);
      }

      const initial = conversation.originating_activation_id === activationId;
      const commentRows = this.#database.prepare(
        `SELECT sequence, id FROM task_comments
         WHERE task_id = ? AND (? = 1 OR sequence > ?)
         ORDER BY sequence`,
      ).all(task.id, initial ? 1 : 0, conversation.delivered_comment_sequence) as Array<{
        sequence: number;
        id: string;
      }>;
      const activityRows = this.#database.prepare(
        `SELECT sequence, id FROM activity_ledger
         WHERE task_id = ? AND (? = 1 OR sequence > ?)
         ORDER BY sequence`,
      ).all(task.id, initial ? 1 : 0, conversation.delivered_activity_sequence) as Array<{
        sequence: number;
        id: string;
      }>;
      const commentIds = new Set(commentRows.map(({ id }) => id));
      const activityIds = new Set(activityRows.map(({ id }) => id));
      const sourceInCurrentContext =
        commentIds.has(conversation.source_event_id) || activityIds.has(conversation.source_event_id);
      const sourceDeliveredPreviously = !sourceInCurrentContext && (
        this.#database.prepare(
          `SELECT 1 FROM task_comments
           WHERE task_id = ? AND id = ? AND sequence <= ?`,
        ).get(task.id, conversation.source_event_id, conversation.delivered_comment_sequence) !== undefined ||
        this.#database.prepare(
          `SELECT 1 FROM activity_ledger
           WHERE task_id = ? AND id = ? AND sequence <= ?`,
        ).get(task.id, conversation.source_event_id, conversation.delivered_activity_sequence) !== undefined
      );
      const context: ActivationContextView = {
        kind: initial ? "initial" : "resumed",
        ...(initial || conversation.delivered_description !== task.description
          ? { description: task.description }
          : {}),
        comments: task.comments.filter(({ id }) => commentIds.has(id)),
        activity: task.activity.filter(({ id }) => activityIds.has(id)),
        sourceDelivery: sourceInCurrentContext
          ? "current-context"
          : sourceDeliveredPreviously
            ? "conversation-history"
            : "activation-only",
      };
      this.#database.prepare(
        "INSERT INTO activation_contexts (activation_id, context_json) VALUES (?, ?)",
      ).run(activationId, JSON.stringify(context));
      this.#database.prepare(
        `UPDATE agent_conversations
         SET delivered_description = ?,
             delivered_comment_sequence = ?,
             delivered_activity_sequence = ?
         WHERE id = ?`,
      ).run(
        task.description,
        commentRows.at(-1)?.sequence ?? conversation.delivered_comment_sequence,
        activityRows.at(-1)?.sequence ?? conversation.delivered_activity_sequence,
        conversation.id,
      );
      return context;
    });
  }
}
