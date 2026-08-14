import type { DatabaseSync } from "node:sqlite";

import type {
  Actor,
  NotificationOccurrenceBatch,
  NotificationPolicyView,
  UpdateNotificationPolicyCommand,
  UpdateNotificationPolicyResult,
} from "../coordination-contract.ts";
import { randomUUID } from "node:crypto";
import type { CoordinationDatabase } from "./coordination-database.ts";

export class NotificationStore {
  readonly #owner: CoordinationDatabase;
  readonly #database: DatabaseSync;

  constructor(database: CoordinationDatabase) {
    this.#owner = database;
    this.#database = database.connection;
  }

  readPolicy(): NotificationPolicyView {
    const settings = this.#database.prepare(
      "SELECT enabled, user_mention_enabled, failed_run_enabled FROM notification_policy WHERE singleton = 1",
    ).get() as { enabled: number; user_mention_enabled: number; failed_run_enabled: number };
    const boards = this.#database.prepare(
      "SELECT id, name FROM boards WHERE applied = 1 ORDER BY position",
    ).all() as Array<{ id: string; name: string }>;
    const columns = this.#database.prepare(
      `SELECT column.id, column.name, subscription.enabled
       FROM columns column
       JOIN notification_column_subscriptions subscription
         ON subscription.board_id = column.board_id AND subscription.column_id = column.id
       WHERE column.board_id = ? AND column.applied = 1
       ORDER BY column.position`,
    );
    return {
      enabled: settings.enabled === 1,
      causes: {
        userMention: settings.user_mention_enabled === 1,
        failedRun: settings.failed_run_enabled === 1,
      },
      boards: boards.map((board) => ({
        ...board,
        columns: (columns.all(board.id) as Array<{ id: string; name: string; enabled: number }>)
          .map((column) => ({ ...column, enabled: column.enabled === 1 })),
      })),
    };
  }

  updatePolicy(command: UpdateNotificationPolicyCommand): UpdateNotificationPolicyResult {
    return this.#owner.transaction(() => {
      const { change } = command;
      if (change.type === "global") {
        this.#database.prepare("UPDATE notification_policy SET enabled = ? WHERE singleton = 1")
          .run(change.enabled ? 1 : 0);
      } else if (change.type === "cause") {
        const column = change.cause === "user-mention" ? "user_mention_enabled" : "failed_run_enabled";
        this.#database.prepare(`UPDATE notification_policy SET ${column} = ? WHERE singleton = 1`)
          .run(change.enabled ? 1 : 0);
      } else {
        const result = this.#database.prepare(
          `UPDATE notification_column_subscriptions SET enabled = ?
           WHERE board_id = ? AND column_id = ?`,
        ).run(change.enabled ? 1 : 0, change.boardId, change.columnId);
        if (result.changes !== 1) {
          return { accepted: false, reason: "not-found", policy: this.readPolicy() };
        }
      }
      return { accepted: true, policy: this.readPolicy() };
    });
  }

  readOccurrences(afterSequence?: number): NotificationOccurrenceBatch {
    const cursor = Number((this.#database.prepare(
      "SELECT COALESCE(MAX(sequence), 0) AS cursor FROM notification_occurrences",
    ).get() as { cursor: number }).cursor);
    if (afterSequence === undefined) return { cursor, occurrences: [] };
    const rows = this.#database.prepare(
      `SELECT sequence, id, type, task_id, task_title, board_id, board_name,
              column_id, column_name, attention_reason_id, occurred_at
       FROM notification_occurrences WHERE sequence > ? ORDER BY sequence`,
    ).all(afterSequence) as Array<{
      sequence: number; id: string; type: "user-mention" | "failed-run" | "column-entry";
      task_id: string; task_title: string; board_id: string; board_name: string;
      column_id: string | null; column_name: string | null;
      attention_reason_id: string | null; occurred_at: string;
    }>;
    return {
      cursor,
      occurrences: rows.map((row) => ({
        id: row.id,
        type: row.type,
        occurredAt: row.occurred_at,
        task: {
          id: row.task_id, title: row.task_title,
          boardId: row.board_id, boardName: row.board_name,
        },
        ...(row.column_id === null || row.column_name === null ? {} : {
          destination: {
            boardId: row.board_id, boardName: row.board_name,
            columnId: row.column_id, columnName: row.column_name,
          },
        }),
        ...(row.attention_reason_id === null ? {} : { attentionReasonId: row.attention_reason_id }),
      })),
    };
  }

  recordColumnEntry(
    taskId: string,
    boardId: string,
    columnId: string,
    sourceEventId: string,
    actor: Actor,
    occurredAt = new Date().toISOString(),
  ): void {
    if (actor.kind !== "agent") return;
    const eligible = this.#database.prepare(
      `SELECT 1 FROM notification_policy policy
       JOIN notification_column_subscriptions subscription
         ON subscription.board_id = ? AND subscription.column_id = ?
       WHERE policy.singleton = 1 AND policy.enabled = 1 AND subscription.enabled = 1`,
    ).get(boardId, columnId);
    if (eligible === undefined) return;
    this.insertOccurrence("column-entry", taskId, sourceEventId, occurredAt, columnId);
  }

  recordAttention(
    type: "user-mention" | "failed-run",
    taskId: string,
    attentionReasonId: string,
    sourceEventId: string,
    occurredAt: string,
  ): void {
    const causeColumn = type === "user-mention" ? "user_mention_enabled" : "failed_run_enabled";
    const eligible = this.#database.prepare(
      `SELECT 1 FROM notification_policy
       WHERE singleton = 1 AND enabled = 1 AND ${causeColumn} = 1`,
    ).get();
    if (eligible === undefined) return;
    this.insertOccurrence(type, taskId, sourceEventId, occurredAt, undefined, attentionReasonId);
  }

  private insertOccurrence(
    type: "user-mention" | "failed-run" | "column-entry",
    taskId: string,
    sourceEventId: string,
    occurredAt: string,
    columnId?: string,
    attentionReasonId?: string,
  ): void {
    const snapshot = this.#database.prepare(
      `SELECT task.title AS task_title, task.board_id, board.name AS board_name,
              column.id AS column_id, column.name AS column_name
       FROM tasks task JOIN boards board ON board.id = task.board_id
       LEFT JOIN columns column ON column.board_id = task.board_id AND column.id = ?
       WHERE task.id = ?`,
    ).get(columnId ?? null, taskId) as {
      task_title: string; board_id: string; board_name: string;
      column_id: string | null; column_name: string | null;
    };
    this.#database.prepare(
      `INSERT INTO notification_occurrences
        (id, type, task_id, task_title, board_id, board_name, column_id, column_name,
         attention_reason_id, source_event_id, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(), type, taskId, snapshot.task_title, snapshot.board_id, snapshot.board_name,
      snapshot.column_id, snapshot.column_name, attentionReasonId ?? null, sourceEventId, occurredAt,
    );
  }
}
