import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { ActivityJournal } from "./activity-journal.ts";
import type { NotificationStore } from "./notification-store.ts";

type AttentionCause = "user-mention" | "failed-run";

export class AttentionRecorder {
  readonly #database: DatabaseSync;
  readonly #activityJournal: ActivityJournal;
  readonly #notifications: NotificationStore;

  constructor(
    database: DatabaseSync,
    activityJournal: ActivityJournal,
    notifications: NotificationStore,
  ) {
    this.#database = database;
    this.#activityJournal = activityJournal;
    this.#notifications = notifications;
  }

  record(
    type: AttentionCause,
    taskId: string,
    sourceEventId: string,
    occurredAt: string,
  ): string {
    const attentionReasonId = randomUUID();
    this.#database
      .prepare(
        `INSERT INTO attention_reasons
          (id, task_id, type, source_event_id, created_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(attentionReasonId, taskId, type, sourceEventId, occurredAt);
    this.#activityJournal.append(
      taskId,
      "attention.created",
      { kind: "framework", id: "coordination" },
      { attentionReasonId, reasonType: type, sourceEventId },
      occurredAt,
    );
    this.#notifications.recordAttention(
      type,
      taskId,
      attentionReasonId,
      sourceEventId,
      occurredAt,
    );
    return attentionReasonId;
  }
}
