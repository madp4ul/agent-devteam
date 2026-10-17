import type { CoordinationMigration } from "../coordination-database.ts";

// Compatibility only: released browser writes used this obsolete human ID.
const legacyHumanId = "local-user";

export const canonicalHumanIdentityMigration: CoordinationMigration = {
  id: "0013_canonical_human_identity",
  apply(database) {
    for (const table of ["task_comments", "activity_ledger", "agent_conversation_messages", "task_movement_metadata"]) {
      database.prepare(`UPDATE ${table} SET actor_id = 'user' WHERE actor_kind = 'user' AND actor_id = ?`).run(legacyHumanId);
    }
    for (const [table, column] of [["tasks", "archival_actor_id"], ["agent_conversations", "retirement_actor_id"]]) {
      database.prepare(`UPDATE ${table} SET ${column} = 'user' WHERE ${column} = ?`).run(legacyHumanId);
    }
    for (const table of ["activity_ledger", "task_movement_metadata"]) {
      database.prepare(`UPDATE ${table} SET details_json = json_set(details_json, '$.actorName', 'user')
        WHERE actor_kind = 'user' AND json_extract(details_json, '$.actorName') = ?`).run(legacyHumanId);
    }
    const contexts = database.prepare("SELECT activation_id, context_json FROM activation_contexts").all() as Array<{ activation_id: string; context_json: string }>;
    const updateContext = database.prepare("UPDATE activation_contexts SET context_json = ? WHERE activation_id = ?");
    for (const row of contexts) {
      updateContext.run(normalizeSnapshot(row.context_json), row.activation_id);
    }
    const responses = database.prepare("SELECT command_type, idempotency_key, response_json FROM command_responses").all() as Array<{ command_type: string; idempotency_key: string; response_json: string }>;
    const updateResponse = database.prepare("UPDATE command_responses SET response_json = ? WHERE command_type = ? AND idempotency_key = ?");
    // Keep old retry keys as historical aliases. A canonical alias replays the
    // original success after upgrade, without executing the command again.
    const aliasResponse = database.prepare(`INSERT OR IGNORE INTO command_responses(command_type, idempotency_key, response_json, request_json)
      SELECT ?, idempotency_key, response_json, request_json FROM command_responses WHERE command_type = ? AND idempotency_key = ?`);
    for (const row of responses) {
      updateResponse.run(normalizeSnapshot(row.response_json), row.command_type, row.idempotency_key);
      if (!row.command_type.startsWith("[")) continue;
      const identity = JSON.parse(row.command_type) as unknown[];
      const caller = identity[1];
      if (Array.isArray(caller) && caller[0] === "user" && caller[1] === legacyHumanId) {
        caller[1] = "user";
        aliasResponse.run(JSON.stringify(identity), row.command_type, row.idempotency_key);
      }
    }
  },
};

/** Rewrite attribution only; record IDs, agent IDs and authored text are evidence. */
function normalizeSnapshot(json: string): string {
  return JSON.stringify(JSON.parse(json, (_key, value: unknown) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    if (record.kind === "user" && record.id === legacyHumanId) record.id = "user";
    const author = (record.actor ?? record.author) as { kind?: string } | undefined;
    if (author?.kind === "user" && typeof record.details === "object" && record.details !== null) {
      const details = record.details as Record<string, unknown>;
      if (details.actorName === legacyHumanId) details.actorName = "user";
    }
    return record;
  }));
}
