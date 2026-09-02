import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describeCoordinationSchema } from "../src/application/internal/coordination-schema-snapshot.ts";
import { coordinationMigrations } from "../src/application/internal/migrations/registry.ts";

// Explicit authoring tool: execute only the registry, without requiring its
// not-yet-reviewed output to match the previous checked-in expectations.
const database = new DatabaseSync(":memory:");
try {
  database.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE");
  for (const [index, migration] of coordinationMigrations.entries()) {
    migration.apply(database);
    database.prepare("INSERT INTO coordination_migrations (position, migration_id) VALUES (?, ?)")
      .run(index + 1, migration.id);
  }
  database.exec("COMMIT");
  const snapshot = describeCoordinationSchema(database);
  await writeFile(
    join(import.meta.dirname, "../src/application/internal/migrations/current-schema.sql"),
    snapshot,
  );
} finally {
  database.close();
}
