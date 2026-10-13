import type { CoordinationMigration } from "../coordination-database.ts";

export const runtimeRecoveryMigration: CoordinationMigration = {
  id: "0012_runtime_recovery",
  foreignKeys: "disabled",
  apply(database) {
    // Preserve the released views/triggers while widening the journal's event vocabulary.
    const dependents = database.prepare("SELECT type, name, sql FROM sqlite_master WHERE type IN ('view', 'trigger') AND sql IS NOT NULL ORDER BY rowid")
      .all() as Array<{ type: "view" | "trigger"; name: string; sql: string }>;
    const indexes = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'activity_ledger' AND sql IS NOT NULL")
      .all() as Array<{ sql: string }>;
    const original = (database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'activity_ledger'").get() as { sql: string }).sql;
    const sequence = (database.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'activity_ledger'").get() as { seq: number } | undefined)?.seq ?? 0;
    const next = original.replace(/^CREATE TABLE (?:"activity_ledger"|activity_ledger)/u, "CREATE TABLE activity_ledger_next")
      .replace("'stall.recovery-exhausted'", "'stall.recovery-exhausted', 'runtime.waiting', 'runtime.recovered', 'runtime.waiting-stopped', 'runtime.waiting-ended'");
    if (next === original || !next.includes("'runtime.waiting'")) throw new Error("Released activity schema cannot be widened safely");
    for (const entry of dependents.toReversed()) database.exec(`DROP ${entry.type.toUpperCase()} "${entry.name.replaceAll('"', '""')}"`);
    database.exec(`${next}; INSERT INTO activity_ledger_next SELECT * FROM activity_ledger;
      DROP TABLE activity_ledger; ALTER TABLE activity_ledger_next RENAME TO activity_ledger;`);
    database.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'activity_ledger'").run(sequence);
    for (const index of indexes) database.exec(index.sql);
    for (const entry of dependents.filter((entry) => entry.type === "view")) database.exec(entry.sql);
    for (const entry of dependents.filter((entry) => entry.type === "trigger")) database.exec(entry.sql);
    database.exec(`
      CREATE TABLE runtime_recovery_episodes (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        activation_id TEXT NOT NULL REFERENCES activations(id) ON DELETE CASCADE,
        classification TEXT NOT NULL CHECK (classification IN ('connection-lost', 'service-unavailable', 'budget-exhausted')),
        state TEXT NOT NULL CHECK (state IN ('waiting', 'recovered', 'stopped', 'ordinary')),
        first_failure TEXT NOT NULL,
        latest_failure TEXT NOT NULL,
        first_at TEXT NOT NULL,
        latest_at TEXT NOT NULL,
        next_eligible_at TEXT NOT NULL,
        failure_count INTEGER NOT NULL DEFAULT 1,
        retry_count INTEGER NOT NULL DEFAULT 0,
        samples_json TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE UNIQUE INDEX runtime_recovery_active_activation ON runtime_recovery_episodes(activation_id) WHERE state = 'waiting';
      CREATE INDEX runtime_recovery_activation ON runtime_recovery_episodes(activation_id, sequence);
      ALTER TABLE attempts ADD COLUMN recovery_episode_id TEXT REFERENCES runtime_recovery_episodes(id);
      ALTER TABLE attempts ADD COLUMN runtime_failure_class TEXT;
      ALTER TABLE attempts ADD COLUMN runtime_failure_json TEXT;
      ALTER TABLE attempts ADD COLUMN provisional_probe INTEGER NOT NULL DEFAULT 0 CHECK (provisional_probe IN (0, 1));
    `);
  },
};
