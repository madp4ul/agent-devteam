import { createHmac, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { historyCounts, type HistoryCheckpoint, type TaskHistoryQuery, type TaskHistoryQueryResult,
  type TaskHistoryRecord } from "../history-contract.ts";
import type { TaskActivityView } from "../task-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";

interface Position { at: string; kind: number; sequence: number }
interface Cursor {
  version: 1;
  taskId: string;
  upper: HistoryCheckpoint;
  before?: Position;
  checkpoint?: HistoryCheckpoint;
  older?: HistoryCheckpoint;
  retained?: { conversationId: string; threadId: string; agentId: string };
}
interface StoredRecord { position: Position; record: TaskHistoryRecord; retained: boolean }

/** A read projection over immutable records. Cursors are signed positions, not reading receipts. */
export class TaskHistoryStore {
  readonly #database: DatabaseSync;
  readonly #secret: string;
  constructor(database: CoordinationDatabase) {
    this.#database = database.connection;
    this.#secret = (this.#database.prepare("SELECT secret FROM history_cursor_identity WHERE singleton = 1")
      .get() as { secret: string }).secret;
  }

  watermark(taskId: string): HistoryCheckpoint {
    return {
      comments: (this.#database.prepare("SELECT COALESCE(MAX(sequence), 0) AS value FROM task_comments WHERE task_id = ?")
        .get(taskId) as { value: number }).value,
      activity: (this.#database.prepare("SELECT COALESCE(MAX(sequence), 0) AS value FROM activity_ledger WHERE task_id = ?")
        .get(taskId) as { value: number }).value,
    };
  }

  query(query: TaskHistoryQuery): TaskHistoryQueryResult {
    const targetWords = query.targetWords ?? 2000;
    if (!Number.isSafeInteger(targetWords) || targetWords < 1) return { available: false, reason: "invalid-target-words" };
    const cursor = query.cursor === undefined
      ? { version: 1 as const, taskId: query.taskId, upper: this.watermark(query.taskId) }
      : this.decode(query.cursor, query.taskId);
    if (cursor === undefined) return { available: false, reason: "invalid-cursor" };
    return this.page(cursor, targetWords);
  }

  activationPage(taskId: string, checkpoint?: HistoryCheckpoint, retained?: Cursor["retained"]): TaskHistoryQueryResult {
    return this.page({ version: 1, taskId, upper: this.watermark(taskId),
      ...(checkpoint === undefined ? {} : { checkpoint }), ...(retained === undefined ? {} : { retained }) }, 2000);
  }

  private page(cursor: Cursor, targetWords: number): TaskHistoryQueryResult {
    const all = this.read(cursor);
    const interval = cursor.checkpoint === undefined ? all : all.filter((entry) => this.isUpdate(entry, cursor.checkpoint!));
    const candidates = interval.filter(({ position }) =>
      (cursor.older === undefined || position.sequence <= (position.kind === 0 ? cursor.older.comments : cursor.older.activity))
      && (cursor.before === undefined || comparePosition(position, cursor.before) < 0));
    const selected: StoredRecord[] = [];
    let words = 0;
    for (const entry of candidates.toReversed()) {
      if (words >= targetWords) break;
      selected.push(entry); words += historyCounts([entry.record]).words;
    }
    selected.reverse();
    const remaining = candidates.slice(0, candidates.length - selected.length);
    const checkpointReached = cursor.checkpoint !== undefined && remaining.length === 0;
    const before = selected[0]?.position ?? cursor.before;
    const older = checkpointReached ? all.filter(({ position }) =>
      position.sequence <= (position.kind === 0 ? cursor.checkpoint!.comments : cursor.checkpoint!.activity)) : [];
    const next = remaining.length > 0
      ? { ...cursor, ...(before === undefined ? {} : { before }) }
      : checkpointReached && older.length > 0
        ? { version: 1 as const, taskId: cursor.taskId, upper: cursor.upper, older: cursor.checkpoint! }
        : undefined;
    return { available: true, history: {
      records: selected.map(({ record }) => record), returned: historyCounts(selected.map(({ record }) => record)),
      remaining: historyCounts(remaining.map(({ record }) => record)), total: historyCounts(interval.map(({ record }) => record)),
      nextCursor: next === undefined ? null : this.encode(next),
      projection: cursor.checkpoint === undefined ? "history" : "activation-updates",
      ...(checkpointReached ? { checkpointReached: true as const } : {}),
      ...(checkpointReached ? { boundary: next === undefined ? "End of this activation's updates. No earlier history remains."
        : "End of this activation's updates. Continuing will retrieve earlier history." } : {}),
      ...(checkpointReached && next !== undefined ? { continuation: "older-history" as const } : {}),
    } };
  }

  private isUpdate(entry: StoredRecord, checkpoint: HistoryCheckpoint): boolean {
    return entry.position.sequence > (entry.position.kind === 0 ? checkpoint.comments : checkpoint.activity)
      && entry.record.type !== "comment.pinned" && entry.record.type !== "comment.unpinned" && !entry.retained;
  }

  private read(cursor: Cursor): StoredRecord[] {
    const comments = this.#database.prepare(`SELECT sequence, id, body, actor_kind, actor_id, occurred_at,
      origin_task_id, origin_task_title, attempt_id FROM task_comments WHERE task_id = ? AND sequence <= ?`)
      .all(cursor.taskId, cursor.upper.comments) as Array<{ sequence: number; id: string; body: string; actor_kind: "user" | "agent";
        actor_id: string; occurred_at: string; origin_task_id: string | null; origin_task_title: string | null; attempt_id: string | null }>;
    const activity = this.#database.prepare(`SELECT activity.sequence, activity.id, activity.type, activity.actor_kind,
      activity.actor_id, activity.occurred_at, activity.details_json, attempt.outcome_kind, attempt.outcome_summary
      FROM activity_ledger activity LEFT JOIN attempts attempt ON activity.type = 'attempt.completed'
        AND attempt.id = json_extract(activity.details_json, '$.attemptId')
      WHERE activity.task_id = ? AND activity.sequence <= ? AND activity.type NOT IN ('activation.created', 'attempt.started')`)
      .all(cursor.taskId, cursor.upper.activity) as Array<{ sequence: number; id: string; type: TaskActivityView["type"];
        actor_kind: TaskActivityView["actor"]["kind"]; actor_id: string; occurred_at: string; details_json: string;
        outcome_kind: string | null; outcome_summary: string | null }>;
    const retainedAttempts = cursor.retained === undefined ? new Set<string>() : new Set((this.#database.prepare(
      `SELECT attempt.id FROM attempts attempt JOIN activations activation ON activation.id = attempt.activation_id
       WHERE activation.conversation_id = ? AND attempt.thread_id = ?`).all(cursor.retained.conversationId, cursor.retained.threadId) as Array<{ id: string }>).map(({ id }) => id));
    return [
      ...comments.map((row): StoredRecord => ({ position: { at: row.occurred_at, kind: 0, sequence: row.sequence },
        retained: row.actor_kind === "agent" && row.actor_id === cursor.retained?.agentId && retainedAttempts.has(row.attempt_id ?? ""),
        record: { id: row.id, type: "comment", at: row.occurred_at, author: { kind: row.actor_kind, id: row.actor_id,
          ...(row.origin_task_id !== null && row.origin_task_id !== cursor.taskId ? { originTask: {
            id: row.origin_task_id, title: row.origin_task_title ?? row.origin_task_id } } : {}) }, body: row.body } })),
      ...activity.map((row): StoredRecord => {
        const { attemptId: _attemptId, originTaskId, originTaskTitle, ...details } = JSON.parse(row.details_json) as Record<string, string>;
        return { position: { at: row.occurred_at, kind: 1, sequence: row.sequence }, retained: false,
          record: { id: row.id, type: row.type, at: row.occurred_at,
            author: { kind: row.actor_kind, id: row.actor_id, ...(originTaskId && originTaskId !== cursor.taskId
              ? { originTask: { id: originTaskId, title: originTaskTitle ?? originTaskId } } : {}) },
            details: row.type === "attempt.completed" ? { ...details,
              ...(_attemptId === undefined ? {} : { attemptId: _attemptId }),
              ...(row.outcome_kind === null ? {} : { outcome: row.outcome_kind }),
              ...(row.outcome_summary === null ? {} : { summary: row.outcome_summary }) } : details } };
      }),
    ].sort((a, b) => comparePosition(a.position, b.position));
  }

  private encode(cursor: Cursor): string {
    const payload = Buffer.from(JSON.stringify(cursor)).toString("base64url");
    return `${payload}.${createHmac("sha256", this.#secret).update(payload).digest("base64url")}`;
  }
  private decode(value: string, taskId: string): Cursor | undefined {
    try {
      const [payload, signature, extra] = value.split(".");
      if (!payload || !signature || extra !== undefined) return undefined;
      const expected = createHmac("sha256", this.#secret).update(payload).digest();
      const actual = Buffer.from(signature, "base64url");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
      const cursor = JSON.parse(Buffer.from(payload, "base64url").toString()) as Cursor;
      return cursor.version === 1 && cursor.taskId === taskId ? cursor : undefined;
    } catch { return undefined; }
  }
}

function comparePosition(a: Position, b: Position): number {
  return a.at.localeCompare(b.at) || a.kind - b.kind || a.sequence - b.sequence;
}
