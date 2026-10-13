import { createHmac, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ConversationHistoryPage, ConversationHistoryQuery } from "../conversation-contract.ts";

export interface ConversationHistoryRow {
  id: string;
  position: string;
  kind: "cause" | "item" | "resume" | "retirement" | "continuity-loss";
  activation_id: string | null;
  attempt_id: string | null;
  source_id: string | null;
  item_json: string | null;
}
interface Cursor {
  version: 1;
  conversationId: string;
  upper: number;
  position: string;
  direction: "older" | "newer" | "refresh" | "ending";
  size: number;
}

/** Select metadata and individual item payloads before any source hydration. */
export class ConversationHistoryPages {
  readonly #database: DatabaseSync;
  readonly #secret: string;
  constructor(database: DatabaseSync) {
    this.#database = database;
    this.#secret = (database.prepare("SELECT secret FROM history_cursor_identity WHERE singleton = 1").get() as { secret: string }).secret;
  }

  read(conversationId: string, query: ConversationHistoryQuery): { rows: ConversationHistoryRow[]; page: ConversationHistoryPage } | undefined {
    const cursor = query.cursor === undefined ? undefined : this.#decode(query.cursor, conversationId);
    if (query.cursor !== undefined && cursor === undefined) return undefined;
    const size = query.pageSize ?? cursor?.size ?? 50;
    if (!Number.isSafeInteger(size) || size < 1 || size > 150) return undefined;
    const targets = [query.attemptId, query.messageId, query.activationId].filter((value) => value !== undefined);
    if (targets.length > 1 || (cursor !== undefined && targets.length > 0)) return undefined;
    const upper = cursor?.direction !== "refresh" && cursor !== undefined ? cursor.upper :
      (this.#database.prepare("SELECT coalesce(max(sequence), 0) AS value FROM conversation_history_items WHERE conversation_id = ?").get(conversationId) as { value: number }).value;
    let position = cursor?.position;
    let direction = cursor?.direction ?? "older";
    if (targets.length > 0) {
      const field = query.attemptId !== undefined ? "attempt_id" : query.messageId !== undefined ? "source_id" : "activation_id";
      let target = this.#database.prepare(`SELECT position, activation_id FROM conversation_history_items WHERE conversation_id = ? AND ${field} = ? ORDER BY position LIMIT 1`)
        .get(conversationId, targets[0]!) as { position: string; activation_id: string } | undefined;
      if (target === undefined && query.attemptId !== undefined) target = this.#database.prepare(`SELECT history.position, history.activation_id
        FROM attempts attempt JOIN activations activation ON activation.id = attempt.activation_id
        JOIN conversation_history_items history ON history.id = 'cause:' || activation.id
        WHERE attempt.id = ? AND activation.conversation_id = ?`).get(query.attemptId, conversationId) as typeof target;
      if (target === undefined) return undefined;
      if (query.attemptId !== undefined) {
        // Include the owning cause when adjacent; a later retry starts at its own evidence.
        const cause = this.#database.prepare("SELECT position FROM conversation_history_items WHERE conversation_id = ? AND id = ?").get(conversationId, `cause:${target.activation_id}`) as { position: string } | undefined;
        if (cause !== undefined && !this.#database.prepare("SELECT 1 FROM conversation_history_items WHERE conversation_id = ? AND position > ? AND position < ? LIMIT 1").get(conversationId, cause.position, target.position)) target = { ...target, position: cause.position };
      }
      position = target.position;
      direction = "refresh";
    }
    const descending = direction === "older" || direction === "ending";
    const operator = direction === "older" ? "<" : direction === "ending" ? "<=" : direction === "newer" ? ">" : ">=";
    const rows = this.#database.prepare(`SELECT id, position, kind, activation_id, attempt_id, source_id, item_json
      FROM conversation_history_items INDEXED BY conversation_history_position WHERE conversation_id = ? AND sequence <= ?
      ${position === undefined ? "" : `AND position ${operator} ?`}
      ORDER BY position ${descending ? "DESC" : "ASC"} LIMIT ?`)
      .all(conversationId, upper, ...(position === undefined ? [] : [position]), size) as unknown as ConversationHistoryRow[];
    if (descending) rows.reverse();
    const first = rows[0]?.position ?? position ?? "";
    const last = rows.at(-1)?.position ?? position ?? "";
    const has = (operator: string, at: string): boolean => this.#database.prepare(`SELECT 1 FROM conversation_history_items INDEXED BY conversation_history_position WHERE conversation_id = ? AND sequence <= ? AND position ${operator} ? LIMIT 1`).get(conversationId, upper, at) !== undefined;
    const encode = (direction: Cursor["direction"], at: string): string => this.#encode({ version: 1, conversationId, upper, position: at, direction, size });
    const hasNewer = has(">", last);
    return { rows, page: {
      recordIds: rows.map(({ id }) => id),
      olderCursor: has("<", first) ? encode("older", first) : null,
      newerCursor: hasNewer ? encode("newer", last) : null,
      refreshCursor: encode("refresh", first),
      endingCursor: encode("ending", last),
      atLatest: !hasNewer,
    } };
  }

  #encode(cursor: Cursor): string {
    const payload = Buffer.from(JSON.stringify(cursor)).toString("base64url");
    return `${payload}.${createHmac("sha256", this.#secret).update(payload).digest("base64url")}`;
  }
  #decode(value: string, conversationId: string): Cursor | undefined {
    if (value.length > 4096) return undefined;
    try {
      const [payload, signature, extra] = value.split(".");
      if (!payload || !signature || extra !== undefined) return undefined;
      const actual = Buffer.from(signature, "base64url");
      const expected = createHmac("sha256", this.#secret).update(payload).digest();
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
      const cursor = JSON.parse(Buffer.from(payload, "base64url").toString()) as Cursor;
      return cursor.version === 1 && cursor.conversationId === conversationId && Number.isSafeInteger(cursor.upper) && cursor.upper >= 0 && typeof cursor.position === "string" && ["older", "newer", "refresh", "ending"].includes(cursor.direction) ? cursor : undefined;
    } catch { return undefined; }
  }
}
