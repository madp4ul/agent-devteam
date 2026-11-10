import type { CoordinationMigration } from "../coordination-database.ts";

export const resourceClaimsMigration: CoordinationMigration = {
  id: "0017_resource_claims",
  foreignKeys: "disabled",
  apply(database) {
    const dependents = database.prepare("SELECT type, name, sql FROM sqlite_master WHERE type IN ('view', 'trigger') AND sql IS NOT NULL ORDER BY rowid").all() as Array<{ type: string; name: string; sql: string }>;
    for (const entry of dependents.toReversed()) database.exec(`DROP ${entry.type.toUpperCase()} "${entry.name.replaceAll('"', '""')}"`);
    for (const [table, marker, addition] of [
      ["activations", "'stall-recovery'", "'resource-granted'"],
      ["activity_ledger", "'runtime.waiting-ended'", "'resource.requested', 'resource.granted', 'resource.cancelled', 'resource.released'"],
    ]) {
      const original = (database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table!) as { sql: string }).sql;
      const indexes = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL").all(table!) as Array<{ sql: string }>;
      const sequence = (database.prepare("SELECT seq FROM sqlite_sequence WHERE name = ?").get(table!) as { seq: number } | undefined)?.seq ?? 0;
      const next = original.replace(/^CREATE TABLE (?:"[^"]+"|\w+)/u, `CREATE TABLE ${table}_next`).replace(marker!, `${marker}, ${addition}`);
      if (!original.includes(marker!)) throw new Error(`Cannot widen released ${table} schema`);
      database.exec(`${next}; INSERT INTO ${table}_next SELECT * FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${table}_next RENAME TO ${table};`);
      database.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = ?").run(sequence, table!);
      for (const index of indexes) database.exec(index.sql);
    }
    for (const entry of dependents.filter(e => e.type === "view")) database.exec(entry.sql);
    for (const entry of dependents.filter(e => e.type === "trigger")) database.exec(entry.sql);
    database.exec(`CREATE TABLE resource_claims (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      resource_id TEXT NOT NULL REFERENCES resources(id),
      task_id TEXT NOT NULL REFERENCES tasks(id),
      requesting_agent_id TEXT NOT NULL REFERENCES agents(id),
      status TEXT NOT NULL CHECK (status IN ('pending', 'held', 'released', 'cancelled')),
      requested_at TEXT NOT NULL,
      granted_at TEXT,
      closed_at TEXT
    );
    CREATE UNIQUE INDEX resource_active_task_claim ON resource_claims(task_id, resource_id) WHERE status IN ('pending', 'held');
    CREATE UNIQUE INDEX resource_single_holder ON resource_claims(resource_id) WHERE status = 'held';
    CREATE INDEX resource_claim_queue ON resource_claims(resource_id, status, sequence);
    CREATE TRIGGER pending_resource_resets_stall AFTER INSERT ON resource_claims WHEN NEW.status = 'pending'
      BEGIN UPDATE task_stall_recovery SET recovery_count = 0 WHERE task_id = NEW.task_id; END;`);
  },
};
