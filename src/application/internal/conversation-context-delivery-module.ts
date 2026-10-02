import type { DatabaseSync } from "node:sqlite";

import type { ActivationContextView } from "../runtime-contract.ts";
import type { TaskView } from "../task-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import { TaskHistoryStore } from "./task-history-store.ts";
import { historyCoverage } from "../history-contract.ts";

export class ConversationContextDeliveryModule {
  readonly #owner: CoordinationDatabase;
  readonly #database: DatabaseSync;
  readonly #history: TaskHistoryStore;

  constructor(database: CoordinationDatabase) {
    this.#owner = database;
    this.#database = database.connection;
    this.#history = new TaskHistoryStore(database);
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
                conversation.delivered_pin_ids_json,
                conversation.replacement_reason,
                conversation.owning_agent_id,
                conversation.current_thread_id,
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
        delivered_pin_ids_json: string;
        replacement_reason: string | null;
        owning_agent_id: string;
        current_thread_id: string | null;
        source_event_id: string;
      } | undefined;
      if (conversation === undefined) {
        throw new Error(`Activation ${activationId} has no conversation context`);
      }

      const initial = conversation.originating_activation_id === activationId;
      const upper = this.#history.watermark(task.id);
      const page = this.#history.activationPage(task.id, initial ? { comments: 0, activity: 0 } : {
        comments: conversation.delivered_comment_sequence, activity: conversation.delivered_activity_sequence,
      }, !initial && conversation.current_thread_id !== null ? {
        conversationId: conversation.id, threadId: conversation.current_thread_id, agentId: conversation.owning_agent_id,
      } : undefined);
      const fullPage = this.#history.query({ taskId: task.id });
      const recovery = this.#history.activationPage(task.id, { comments: 0, activity: 0 });
      if (!page.available || !fullPage.available || !recovery.available) throw new Error("Activation history could not be captured");
      const priorPins = new Set(JSON.parse(conversation.delivered_pin_ids_json) as string[]);
      const currentPins = task.comments.filter(({ pinned }) => pinned);
      const pinChanges = {
        pinned: initial ? currentPins : currentPins.filter(({ id }) => !priorPins.has(id)),
        unpinned: initial ? [] : [...priorPins].filter((id) => !currentPins.some((comment) => comment.id === id)),
      };
      const commentIds = new Set(page.history.records.filter(({ type }) => type === "comment").map(({ id }) => id));
      const activityIds = new Set(page.history.records.filter(({ type }) => type !== "comment").map(({ id }) => id));
      const sourceInCurrentContext =
        commentIds.has(conversation.source_event_id) || activityIds.has(conversation.source_event_id)
          || pinChanges.pinned.some(({ id }) => id === conversation.source_event_id);
      const context: ActivationContextView = {
        history: page.history,
        fullHistory: historyCoverage(fullPage.history.total, page.history.returned),
        pinChanges,
        replacement: { description: task.description, history: recovery.history, pinnedComments: currentPins },
        kind: initial ? "initial" : "resumed",
        ...(initial || conversation.delivered_description !== task.description
          ? { description: task.description }
          : {}),
        comments: task.comments.filter(({ id }) => commentIds.has(id)),
        activity: task.activity.filter(({ id }) => activityIds.has(id)),
        sourceDelivery: sourceInCurrentContext
          ? "current-context"
          : "activation-only",
        ...(initial && conversation.replacement_reason !== null
          ? { replacementReason: conversation.replacement_reason }
          : {}),
      };
      this.#database.prepare(
        "INSERT INTO activation_contexts (activation_id, context_json) VALUES (?, ?)",
      ).run(activationId, JSON.stringify(context));
      this.#database.prepare(
        `UPDATE agent_conversations
         SET delivered_description = ?,
             delivered_comment_sequence = ?,
             delivered_activity_sequence = ?,
             delivered_pin_ids_json = ?
         WHERE id = ?`,
      ).run(
        task.description,
        upper.comments,
        upper.activity,
        JSON.stringify(currentPins.map(({ id }) => id)),
        conversation.id,
      );
      return context;
    });
  }
}
