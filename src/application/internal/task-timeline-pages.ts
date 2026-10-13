import { createHmac, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { TimelinePage, TimelineQuery, TimelineQueryResult, TimelineRecord, MovementMapQueryResult } from "../timeline-contract.ts";
import type { TaskProjectionStore } from "./task-projection-store.ts";

interface Position { occurred_at: string; sequence: number }
interface Row extends Position { id: string; kind: TimelineRecord["kind"]; source_id: string }
interface Cursor { version: 1; taskId: string; watermark: number; direction: "older" | "newer" | "refresh" | "content"; position?: Position; recordId?: string; targetSource?: string }

/** Browser-only indexed selections. Hydration happens after SQL has bounded the window. */
export class TaskTimelinePages {
  readonly #db: DatabaseSync;
  readonly #projections: TaskProjectionStore;
  readonly #secret: string;
  constructor(db: DatabaseSync, projections: TaskProjectionStore) {
    this.#db = db;
    this.#projections = projections;
    this.#secret = (db.prepare("SELECT secret FROM history_cursor_identity WHERE singleton = 1").get() as { secret: string }).secret;
  }

  query(taskId: string, query: TimelineQuery = {}): TimelineQueryResult {
    if (this.#db.prepare("SELECT 1 FROM tasks WHERE id = ?").get(taskId) === undefined) return { available: false, reason: "not-found" };
    const limit = query.pageSize ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 150) return { available: false, reason: "invalid-page" };
    let cursor: Cursor | undefined = query.cursor === undefined ? { version: 1, taskId, watermark: this.watermark(taskId), direction: "refresh" } : this.decode(query.cursor, taskId);
    if (cursor === undefined) return { available: false, reason: "invalid-page" };
    if (cursor.direction === "content") return this.contentPage(cursor, limit);
    if (query.refresh) cursor = { ...cursor, watermark: this.watermark(taskId) };
    let target: Row | undefined;
    if (query.sourceId !== undefined) {
      target = this.resolveSource(taskId, query.sourceId);
      if (!target) return { available: false, reason: "not-found" };
      cursor = { ...cursor, watermark: this.watermark(taskId), direction: "refresh", position: target, targetSource: query.sourceId };
    }
    const newer = cursor.direction === "newer";
    const operator = newer ? ">" : cursor.direction === "refresh" ? "<=" : "<";
    const rows = this.#db.prepare(`SELECT * FROM task_timeline_records INDEXED BY task_timeline_position
      WHERE task_id = ? AND sequence <= ? ${cursor.position === undefined ? "" : `AND (occurred_at, sequence) ${operator} (?, ?)`}
      ORDER BY occurred_at ${newer ? "ASC" : "DESC"}, sequence ${newer ? "ASC" : "DESC"} LIMIT ?`)
      .all(taskId, cursor.watermark, ...(cursor.position === undefined ? [] : [cursor.position.occurred_at, cursor.position.sequence]), limit) as unknown as Row[];
    if (newer) rows.reverse();
    const records = rows.map((row) => ({ ...this.hydrate(taskId, row, (target?.id ?? rows[0]?.id) === row.id ? query.sourceId ?? cursor.targetSource : undefined), sequence: row.sequence }));
    const first = rows[0]; const last = rows.at(-1);
    const base: Cursor = { version: 1, taskId, watermark: cursor.watermark, direction: "older" };
    const count = (condition = "", position?: Position): number => (this.#db.prepare(`SELECT count(*) AS total FROM task_timeline_records WHERE task_id = ? AND sequence <= ? ${condition}`)
      .get(taskId, cursor!.watermark, ...(position === undefined ? [] : [position.occurred_at, position.sequence])) as { total: number }).total;
    const total = count();
    const start = first ? count("AND (occurred_at, sequence) > (?, ?)", first) : 0;
    const page: TimelinePage = {
      records, total, start,
      olderCursor: last && count("AND (occurred_at, sequence) < (?, ?)", last) > 0 ? this.encode({ ...base, position: last }) : null,
      newerCursor: first && start > 0 ? this.encode({ ...base, direction: "newer", position: first }) : null,
      refreshCursor: this.encode({ ...base, direction: "refresh", ...(first === undefined ? {} : { position: first }), ...(cursor.targetSource === undefined ? {} : { targetSource: cursor.targetSource }) }),
      ...this.disclosure(taskId, records),
    };
    return { available: true, page };
  }

  movementMap(taskId: string, after = 0): MovementMapQueryResult {
    if (!Number.isSafeInteger(after) || after < 0) return { available: false, reason: "invalid-page" };
    if (!this.#db.prepare("SELECT 1 FROM tasks WHERE id = ?").get(taskId)) return { available: false, reason: "not-found" };
    const rows = this.#db.prepare("SELECT * FROM task_movement_metadata WHERE task_id = ? AND sequence > ? ORDER BY sequence DESC")
      .all(taskId, after) as Array<{ sequence: number; id: string; record_id: string; occurred_at: string; actor_kind: "user" | "agent"; actor_id: string; details_json: string }>;
    const summary = this.movementSummary(taskId);
    const cursor = (this.#db.prepare("SELECT coalesce(max(sequence), 0) AS value FROM task_movement_metadata WHERE task_id = ?").get(taskId) as { value: number }).value;
    return { available: true, map: { movements: rows.map((row) => ({ id: row.id, type: "task.moved", sequence: row.sequence, recordId: row.record_id,
      occurredAt: row.occurred_at, actor: { kind: row.actor_kind, id: row.actor_id }, details: JSON.parse(row.details_json) as Record<string, string> })), cursor, total: summary.total } };
  }

  movementSummary(taskId: string): { total: number; latestSourceId?: string } {
    const total = (this.#db.prepare("SELECT count(*) AS value FROM task_movement_metadata WHERE task_id = ?").get(taskId) as { value: number }).value;
    const latest = this.#db.prepare("SELECT id FROM task_movement_metadata WHERE task_id = ? ORDER BY sequence DESC LIMIT 1").get(taskId) as { id: string } | undefined;
    return { total, ...(latest === undefined ? {} : { latestSourceId: latest.id }) };
  }

  private watermark(taskId: string): number {
    return (this.#db.prepare("SELECT coalesce(max(sequence), 0) AS value FROM task_timeline_records WHERE task_id = ?").get(taskId) as { value: number }).value;
  }
  private resolveSource(taskId: string, sourceId: string): Row | undefined {
    const source = this.#db.prepare("SELECT record_id FROM task_timeline_sources WHERE task_id = ? AND id = ?").get(taskId, sourceId) as { record_id: string } | undefined;
    const root = source ? this.#db.prepare("SELECT * FROM task_timeline_records WHERE task_id = ? AND id = ?").get(taskId, source.record_id)
      : this.#db.prepare("SELECT * FROM task_timeline_records WHERE task_id = ? AND source_id = ? LIMIT 1").get(taskId, sourceId);
    if (root) return root as unknown as Row;
    // Attention and trigger identities can point to an activation or a folded lifecycle event.
    const event = this.#db.prepare("SELECT details_json FROM activity_ledger WHERE task_id = ? AND id = ?").get(taskId, sourceId) as { details_json: string } | undefined;
    const details = event ? JSON.parse(event.details_json) as Record<string, string> : {};
    const attemptId = details.attemptId ?? (this.#db.prepare("SELECT id FROM attempts WHERE activation_id = ? ORDER BY rowid DESC LIMIT 1").get(details.activationId ?? sourceId) as { id: string } | undefined)?.id;
    return attemptId ? this.#db.prepare("SELECT * FROM task_timeline_records WHERE task_id = ? AND source_id = ? LIMIT 1").get(taskId, attemptId) as unknown as Row | undefined : undefined;
  }
  private disclosure(taskId: string, records: TimelineRecord[]): Pick<TimelinePage, "relatedTasks" | "inspectableSources"> {
    const comments = records.flatMap((record) => record.kind === "comment" ? [record.comment] : record.kind === "attempt" ? record.content.flatMap((entry) => entry.kind === "comment" ? [entry.comment] : []) : []);
    const activity = records.flatMap((record) => record.kind === "activity" ? [record.activity] : record.kind === "attempt" ? record.content.flatMap((entry) => entry.kind === "activity" ? [entry.activity] : []) : []);
    const ids = [...new Set(activity.flatMap((entry) => entry.details.relatedTaskId ? [entry.details.relatedTaskId] : []))];
    const references = new Map(this.#projections.readTaskReferences(ids).map((task) => [task.id, task]));
    const inspectable = this.#projections.isTaskInspectableByAgent(taskId) || (this.#db.prepare("SELECT archived_at FROM tasks WHERE id = ?").get(taskId) as { archived_at: string | null }).archived_at !== null;
    return { relatedTasks: ids.map((id) => {
      const task = references.get(id);
      return task ? { id, title: task.title, available: true, completed: task.column.id === "completion", archived: task.archived } : { id, available: false };
    }), inspectableSources: { commentIds: inspectable ? comments.map(({ id }) => id) : [], activityIds: inspectable ? activity.map(({ id }) => id) : [] } };
  }
  private hydrate(taskId: string, row: Row, sourceId?: string): TimelineRecord {
    if (row.kind === "comment") return { key: row.id, kind: "comment", occurredAt: row.occurred_at, comment: this.#projections.readTimelineComment(row.source_id)! };
    if (row.kind === "activity") return { key: row.id, kind: "activity", occurredAt: row.occurred_at, activity: this.#projections.readTimelineActivity(row.source_id)! };
    const activationId = row.kind === "attempt" ? (this.#db.prepare("SELECT activation_id FROM attempts WHERE id = ?").get(row.source_id) as { activation_id: string }).activation_id : row.source_id;
    const activation = this.#projections.readTaskActivations(taskId, activationId, false)[0]!;
    if (row.kind === "startup-failure") return { key: row.id, kind: row.kind, occurredAt: row.occurred_at, activation, failure: activation.startupFailure! };
    const attempt = this.#projections.readTimelineAttempt(row.source_id)!;
    const number = (this.#db.prepare("SELECT count(*) AS value FROM attempts WHERE activation_id = ? AND rowid <= (SELECT rowid FROM attempts WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM activation_dispatch_claims claim WHERE claim.attempt_id = attempts.id)")
      .get(activationId, attempt.id) as { value: number }).value;
    const previous = this.#db.prepare("SELECT id FROM attempts WHERE activation_id = ? AND rowid < (SELECT rowid FROM attempts WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM activation_dispatch_claims claim WHERE claim.attempt_id = attempts.id) ORDER BY rowid DESC LIMIT 1")
      .get(activationId, attempt.id) as { id: string } | undefined;
    const content = this.readContent({ version: 1, taskId, watermark: 0, direction: "content", recordId: row.id }, 50, sourceId);
    return { key: row.id, kind: "attempt", occurredAt: row.occurred_at, activation, attempt, number,
      previousAttempt: previous ? this.#projections.readTimelineAttempt(previous.id)! : null, content: content.items, contentPage: { olderCursor: content.cursor, total: content.total, ...(sourceId === undefined ? {} : { sourceId }) } };
  }
  private readContent(cursor: Cursor, limit: number, sourceId?: string) {
    const watermark = cursor.watermark || (this.#db.prepare("SELECT coalesce(max(sequence), 0) AS value FROM task_timeline_sources WHERE task_id = ? AND record_id = ?").get(cursor.taskId, cursor.recordId!) as { value: number }).value;
    const position = sourceId === undefined ? cursor.position : this.#db.prepare("SELECT occurred_at, sequence FROM task_timeline_sources WHERE task_id = ? AND record_id = ? AND id = ?")
      .get(cursor.taskId, cursor.recordId!, sourceId) as Position | undefined;
    const rows = this.#db.prepare(`SELECT * FROM task_timeline_sources WHERE task_id = ? AND record_id = ? AND sequence <= ?
      ${position === undefined ? "" : `AND (occurred_at, sequence) ${sourceId === undefined ? "<" : "<="} (?, ?)`} ORDER BY occurred_at DESC, sequence DESC LIMIT ?`)
      .all(cursor.taskId, cursor.recordId!, watermark, ...(position === undefined ? [] : [position.occurred_at, position.sequence]), limit + 1) as unknown as Array<Position & { id: string; kind: "comment" | "activity" }>;
    const hasMore = rows.length > limit; rows.splice(limit);
    const items = rows.map((source) => source.kind === "comment"
      ? { kind: "comment" as const, sequence: source.sequence, occurredAt: source.occurred_at, comment: this.#projections.readTimelineComment(source.id)! }
      : { kind: "activity" as const, sequence: source.sequence, occurredAt: source.occurred_at, activity: this.#projections.readTimelineActivity(source.id)! });
    const total = (this.#db.prepare("SELECT count(*) AS value FROM task_timeline_sources WHERE task_id = ? AND record_id = ?").get(cursor.taskId, cursor.recordId!) as { value: number }).value;
    return { items, total, cursor: hasMore ? this.encode({ ...cursor, watermark, position: rows.at(-1)! }) : null };
  }
  private contentPage(cursor: Cursor, limit: number): TimelineQueryResult {
    const row = this.#db.prepare("SELECT * FROM task_timeline_records WHERE task_id = ? AND id = ?").get(cursor.taskId, cursor.recordId!) as Row | undefined;
    if (!row || row.kind !== "attempt") return { available: false, reason: "invalid-page" };
    const record = { ...this.hydrate(cursor.taskId, row), sequence: row.sequence } as Extract<TimelineRecord, { kind: "attempt" }>;
    const content = this.readContent(cursor, limit);
    return { available: true, page: { records: [{ ...record, content: content.items, contentPage: { olderCursor: content.cursor, total: content.total, ...(content.items[0] === undefined ? {} : { sourceId: content.items[0].kind === "comment" ? content.items[0].comment.id : content.items[0].activity.id }) } }],
      olderCursor: null, newerCursor: null, refreshCursor: this.encode(cursor), total: 1, start: 0, ...this.disclosure(cursor.taskId, [{ ...record, content: content.items }]) } };
  }
  private encode(cursor: Cursor): string {
    const payload = Buffer.from(JSON.stringify(cursor)).toString("base64url");
    return `${payload}.${createHmac("sha256", this.#secret).update(payload).digest("base64url")}`;
  }
  private decode(value: string, taskId: string): Cursor | undefined {
    try {
      const [payload, signature, extra] = value.split(".");
      if (!payload || !signature || extra) return undefined;
      const expected = createHmac("sha256", this.#secret).update(payload).digest(); const actual = Buffer.from(signature, "base64url");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
      const cursor = JSON.parse(Buffer.from(payload, "base64url").toString()) as Cursor;
      return cursor.version === 1 && cursor.taskId === taskId ? cursor : undefined;
    } catch { return undefined; }
  }
}
