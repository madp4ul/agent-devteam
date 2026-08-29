import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { backup, DatabaseSync } from "node:sqlite";

import type { MigrationEvidence } from "./model.ts";
import { rawV1Schema, rawV2Migration } from "./raw-sql.ts";

const breakpoint = "--> statement-breakpoint";

export async function runRawMigration(): Promise<MigrationEvidence> {
  return runMigrationComparison("project-owned SQL", rawV1Schema, rawV2Migration, {
    generatedStatements: 0,
    customStatements: 12,
    notes: [
      "All DDL, data transform, trigger recreation, and schema identity are project-owned.",
      "No generated schema snapshot or migration journal is required.",
    ],
  });
}

export async function runDrizzleMigration(): Promise<MigrationEvidence> {
  const prototypeRoot = new URL("../", import.meta.url);
  const initialGenerated = await readFile(new URL("drizzle-modeled/0000_v1.sql", prototypeRoot), "utf8");
  const initialCustom = await readFile(new URL("drizzle-modeled/0001_v1-custom-objects.sql", prototypeRoot), "utf8");
  const upgradeGenerated = await readFile(new URL("drizzle-modeled/0002_v2.sql", prototypeRoot), "utf8");
  const upgradeCustom = await readFile(new URL("drizzle-modeled/0003_v2-data-and-objects.sql", prototypeRoot), "utf8");
  const originalGenerated = await readFile(new URL("drizzle-modeled/0002_v2.original-generated.sql", prototypeRoot), "utf8");
  const initial = `${initialGenerated}${breakpoint}\n${initialCustom}\nPRAGMA user_version = 1;`;
  const upgrade = `${upgradeGenerated}${breakpoint}\n${upgradeCustom}\nPRAGMA user_version = 2;`;
  const originalGeneratedFailure = observeOriginalGeneratedFailure(initial, originalGenerated);
  return runMigrationComparison("Drizzle Kit artifacts", initial, upgrade, {
    generatedStatements: statements(upgradeGenerated).length - 2,
    customStatements: statements(upgradeCustom).length + 3,
    originalGeneratedFailure,
    notes: [
      "Kit generated the table rebuild, foreign-key change, index recreation, and added column.",
      "The original generated table rebuild failed against its own modeled dependent view; reviewed DROP/CREATE VIEW statements were added around it.",
      "The data backfill, trigger recreation, released identity, backup, verification, and startup classification remain custom.",
      "The generated PRAGMA foreign_keys toggles execute inside the application transaction and therefore cannot be treated as the safety envelope.",
    ],
  });
}

async function runMigrationComparison(
  approach: MigrationEvidence["approach"],
  initialSql: string,
  upgradeSql: string,
  counts: Pick<MigrationEvidence, "generatedStatements" | "customStatements" | "notes"> &
    Pick<Partial<MigrationEvidence>, "originalGeneratedFailure">,
): Promise<MigrationEvidence> {
  const directory = await mkdtemp(join(tmpdir(), "PROTOTYPE-WIPE-ME-drizzle-migration-"));
  const sourcePath = join(directory, "source.sqlite3");
  const backupPath = join(directory, "verified-backup.sqlite3");
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(sourcePath);
    database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON");
    executeStatements(database, initialSql);
    database.prepare(
      "INSERT INTO tasks (id, title, active, metadata_json) VALUES (?, ?, ?, ?)",
    ).run("task-1", "Retained task", 1, JSON.stringify({ priority: "high" }));
    database.prepare(
      "INSERT INTO activations VALUES (?, ?, 'completed', ?)",
    ).run("activation-1", "task-1", JSON.stringify({ retained: true }));

    await backup(database, backupPath);
    const backupDatabase = new DatabaseSync(backupPath, { readOnly: true });
    const backupIntegrity = integrity(backupDatabase);
    const retainedBackupTask = backupDatabase.prepare(
      "SELECT id FROM tasks WHERE id = 'task-1'",
    ).get();
    backupDatabase.close();
    if (retainedBackupTask === undefined) throw new Error("Backup omitted committed WAL data");

    migrateKnownReleasedDatabase(database, upgradeSql);
    const task = database.prepare(
      "SELECT id, category, revision FROM tasks WHERE id = 'task-1'",
    ).get() as { id: string; category: string; revision: number };
    database.prepare(
      "INSERT INTO activations VALUES (?, ?, 'queued', ?)",
    ).run("activation-2", "task-1", JSON.stringify({ afterMigration: true }));
    const revisionAfterTrigger = (database.prepare(
      "SELECT revision FROM tasks WHERE id = 'task-1'",
    ).get() as { revision: number }).revision;
    const viewCount = (database.prepare(
      "SELECT activation_count FROM task_activation_summary LIMIT 1",
    ).get() as { activation_count: number }).activation_count;
    const activationCount = (database.prepare(
      "SELECT COUNT(*) AS count FROM activations WHERE task_id = 'task-1'",
    ).get() as { count: number }).count;
    const sourceIntegrity = integrity(database);
    const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all().length;
    database.close();
    database = undefined;

    const future = new DatabaseSync(":memory:");
    future.exec("PRAGMA user_version = 99");
    let unknownFutureRefused = false;
    try {
      migrateKnownReleasedDatabase(future, upgradeSql);
    } catch {
      unknownFutureRefused = true;
    } finally {
      future.close();
    }
    const rollbackPreserved = verifyInjectedFailureRollsBack(initialSql, upgradeSql);

    return {
      approach,
      upgradedTask: { ...task, revision: revisionAfterTrigger },
      activationCount,
      backupIntegrity,
      sourceIntegrity,
      foreignKeyViolations,
      unknownFutureRefused,
      rollbackPreserved,
      triggerPreserved: revisionAfterTrigger === task.revision + 1,
      viewPreserved: viewCount === 2,
      ...counts,
    };
  } finally {
    if (database?.isOpen) database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

function verifyInjectedFailureRollsBack(initialSql: string, upgradeSql: string): boolean {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    executeStatements(database, initialSql);
    database.prepare(
      "INSERT INTO tasks (id, title, active, metadata_json) VALUES (?, ?, ?, ?)",
    ).run("rollback-task", "Rollback fixture", 1, JSON.stringify({ priority: "normal" }));
    database.exec("BEGIN IMMEDIATE");
    try {
      executeStatements(database, `${upgradeSql}${breakpoint}\nSELECT * FROM deliberately_missing_table`);
      database.exec("COMMIT");
      return false;
    } catch {
      database.exec("ROLLBACK");
    }
    const version = (database.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    const category = database.prepare(
      "SELECT 1 FROM pragma_table_info('tasks') WHERE name = 'category'",
    ).get();
    const task = database.prepare("SELECT id FROM tasks WHERE id = 'rollback-task'").get();
    return version === 1 && category === undefined && task !== undefined && integrity(database) === "ok";
  } finally {
    database.close();
  }
}

function observeOriginalGeneratedFailure(initialSql: string, originalUpgradeSql: string): string {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    executeStatements(database, initialSql);
    database.exec("BEGIN IMMEDIATE");
    try {
      executeStatements(database, originalUpgradeSql);
      database.exec("COMMIT");
      return "none";
    } catch (error) {
      database.exec("ROLLBACK");
      return error instanceof Error ? error.message : String(error);
    }
  } finally {
    database.close();
  }
}

function migrateKnownReleasedDatabase(database: DatabaseSync, upgradeSql: string): void {
  const version = (database.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (version > 2) throw new Error(`Unknown future schema ${version}`);
  if (version !== 1) throw new Error(`Expected released schema 1, received ${version}`);
  database.exec("BEGIN IMMEDIATE");
  try {
    executeStatements(database, upgradeSql);
    if (integrity(database) !== "ok") throw new Error("Post-migration integrity failed");
    if (database.prepare("PRAGMA foreign_key_check").all().length > 0) {
      throw new Error("Post-migration foreign key check failed");
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function executeStatements(database: DatabaseSync, source: string): void {
  for (const statement of statements(source)) database.exec(statement);
}

function statements(source: string): string[] {
  return source.split(breakpoint).map((statement) => statement.trim()).filter(Boolean);
}

function integrity(database: DatabaseSync): string {
  return (database.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
}
