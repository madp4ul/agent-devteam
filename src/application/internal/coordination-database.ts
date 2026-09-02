import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

import { coordinationMigrations } from "./migrations/registry.ts";
import { readExpectedCoordinationSchema, verifyCoordinationSchema } from "./coordination-schema-snapshot.ts";

export interface CoordinationMigration {
  readonly id: string;
  apply(database: DatabaseSync): void;
}

export interface CoordinationDatabaseOpenOptions {
  /** Test seam for exercising future chains without publishing fictitious migrations. */
  migrations?: readonly CoordinationMigration[];
  /** Test seams for deterministic backup paths and backup-failure injection. */
  createBackup?: (source: DatabaseSync, destination: string) => Promise<void>;
  backupPath?: (databasePath: string) => string;
  /** Test seam for post-migration verification failure. */
  expectedSchemaIsComplete?: (database: DatabaseSync) => boolean;
  /** Independently supplied review evidence for a synthetic future chain. */
  expectedSchema?: string;
}

export type CoordinationDatabaseStartupFailure =
  | "incompatible-history"
  | "backup-failure"
  | "migration-failure"
  | "verification-failure";

export class CoordinationDatabaseStartupError extends Error {
  readonly kind: CoordinationDatabaseStartupFailure;
  readonly databasePath: string;
  readonly migrationId: string | undefined;
  readonly recoveryBackupPath: string | undefined;

  constructor(
    kind: CoordinationDatabaseStartupFailure,
    message: string,
    databasePath: string,
    migrationId?: string,
    recoveryBackupPath?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CoordinationDatabaseStartupError";
    this.kind = kind;
    this.databasePath = databasePath;
    this.migrationId = migrationId;
    this.recoveryBackupPath = recoveryBackupPath;
  }
}

export class CoordinationDatabase {
  readonly connection: DatabaseSync;

  private constructor(connection: DatabaseSync) {
    this.connection = connection;
  }

  static async open(path: string): Promise<CoordinationDatabase> {
    return CoordinationDatabase.openWithOptions(path, {});
  }

  /** @internal Test harness for future-chain and failure-injection coverage. */
  static async openForMigrationTest(
    path: string,
    options: CoordinationDatabaseOpenOptions,
  ): Promise<CoordinationDatabase> {
    return CoordinationDatabase.openWithOptions(path, options);
  }

  private static async openWithOptions(
    path: string,
    options: CoordinationDatabaseOpenOptions,
  ): Promise<CoordinationDatabase> {
    const migrations = options.migrations ?? coordinationMigrations;
    assertMigrationRegistry(migrations);
    const existed = path !== ":memory:" && existsSync(path);
    const applied = existed ? inspectExistingMigrationHistory(path, migrations) : [];
    const connection = new DatabaseSync(path);
    let recoveryBackupPath: string | undefined;
    try {
      connection.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000");
      const pending = migrations.slice(applied.length);
      if (pending.length === 0) {
        verifyCurrentDatabase(
          connection,
          options.expectedSchemaIsComplete ?? ((database) => currentSchemaIsComplete(database, options.expectedSchema)),
          path,
        );
        return new CoordinationDatabase(connection);
      }

      if (existed) {
        recoveryBackupPath = (options.backupPath ?? createMigrationBackupPath)(path);
        try {
          await (options.createBackup ?? createOnlineBackup)(connection, recoveryBackupPath);
          verifyRecoveryBackup(recoveryBackupPath, applied);
        } catch (error) {
          rmSync(recoveryBackupPath, { force: true });
          recoveryBackupPath = undefined;
          throw startupError(
            "backup-failure",
            path,
            "Could not create and independently verify the pre-upgrade recovery backup.",
            undefined,
            undefined,
            error,
          );
        }
      }

      applyPendingMigrations(
        connection,
        path,
        applied.length,
        pending,
        options.expectedSchemaIsComplete ?? ((database) => currentSchemaIsComplete(database, options.expectedSchema)),
        recoveryBackupPath,
      );
      return new CoordinationDatabase(connection);
    } catch (error) {
      connection.close();
      if (error instanceof CoordinationDatabaseStartupError) throw error;
      throw startupError(
        "migration-failure",
        path,
        "The released coordination migration sequence failed.",
        undefined,
        recoveryBackupPath,
        error,
      );
    }
  }

  /** Diagnostic shell only: do not re-run the failed snapshot gate to report it. */
  static openConfigurationError(): CoordinationDatabase {
    const connection = new DatabaseSync(":memory:");
    try {
      connection.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000");
      applyPendingMigrations(
        connection,
        ":memory:",
        0,
        coordinationMigrations,
        () => true,
      );
      return new CoordinationDatabase(connection);
    } catch (error) {
      connection.close();
      throw error;
    }
  }

  transaction<Result>(operation: () => Result): Result {
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.connection.exec("COMMIT");
      return result;
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.connection.close();
  }
}

function applyPendingMigrations(
  database: DatabaseSync,
  databasePath: string,
  appliedCount: number,
  pending: readonly CoordinationMigration[],
  expectedSchemaIsComplete: (database: DatabaseSync) => boolean,
  recoveryBackupPath?: string,
): void {
  database.exec("BEGIN IMMEDIATE");
  let migrationId: string | undefined;
  try {
    for (const [offset, migration] of pending.entries()) {
      migrationId = migration.id;
      migration.apply(database);
      database.prepare(
        "INSERT INTO coordination_migrations (position, migration_id) VALUES (?, ?)",
      ).run(appliedCount + offset + 1, migration.id);
    }
    migrationId = undefined;
    verifyCurrentDatabase(database, expectedSchemaIsComplete, databasePath, recoveryBackupPath);
    database.exec("COMMIT");
  } catch (error) {
    rollback(database, error);
    if (error instanceof CoordinationDatabaseStartupError) throw error;
    throw startupError(
      "migration-failure",
      databasePath,
      `Released coordination migration ${migrationId ?? "sequence"} failed; the complete pending sequence was rolled back.`,
      migrationId,
      recoveryBackupPath,
      error,
    );
  }
}

function verifyCurrentDatabase(
  database: DatabaseSync,
  expectedSchemaIsComplete: (database: DatabaseSync) => boolean,
  databasePath: string,
  recoveryBackupPath?: string,
): void {
  try {
    if (!expectedSchemaIsComplete(database)) {
      throw new Error("The database does not contain the complete expected current schema.");
    }
    verifySqliteHealth(database);
  } catch (error) {
    throw startupError(
      "verification-failure",
      databasePath,
      "Post-migration schema, integrity, or foreign-key verification failed.",
      undefined,
      recoveryBackupPath,
      error,
    );
  }
}

function verifySqliteHealth(database: DatabaseSync): void {
  const integrity = database.prepare("PRAGMA integrity_check").all() as Array<{ integrity_check: string }>;
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
    throw new Error(`SQLite integrity_check failed: ${integrity.map(Object.values).flat().join(", ")}`);
  }
  const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyViolations.length > 0) {
    throw new Error(`SQLite foreign_key_check found ${foreignKeyViolations.length} violation(s).`);
  }
}

async function createOnlineBackup(source: DatabaseSync, destination: string): Promise<void> {
  await backup(source, destination);
}

function verifyRecoveryBackup(path: string, expectedHistory: readonly string[]): void {
  const verification = new DatabaseSync(path, { readOnly: true });
  try {
    verification.exec("PRAGMA foreign_keys = ON; PRAGMA query_only = ON");
    verifySqliteHealth(verification);
    const actualHistory = readAppliedMigrations(verification);
    if (
      actualHistory.length !== expectedHistory.length ||
      actualHistory.some((id, index) => id !== expectedHistory[index])
    ) {
      throw new Error("The recovery backup does not contain the complete pre-upgrade migration history.");
    }
  } finally {
    verification.close();
  }
}

function createMigrationBackupPath(databasePath: string): string {
  const suffix = `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}`;
  return join(dirname(databasePath), `${basename(databasePath)}.pre-migration-${suffix}.sqlite3`);
}

function inspectExistingMigrationHistory(
  path: string,
  migrations: readonly CoordinationMigration[],
): string[] {
  const inspectionDirectory = mkdtempSync(join(tmpdir(), "coordination-schema-inspection-"));
  const inspectionPath = join(inspectionDirectory, "coordination.sqlite3");
  let inspection: DatabaseSync | undefined;
  try {
    copyFileSync(path, inspectionPath);
    for (const suffix of ["-wal", "-shm"]) {
      if (existsSync(`${path}${suffix}`)) copyFileSync(`${path}${suffix}`, `${inspectionPath}${suffix}`);
    }
    inspection = new DatabaseSync(inspectionPath, { readOnly: true });
    inspection.exec("PRAGMA busy_timeout = 5000; PRAGMA query_only = ON");
    const ledger = inspection.prepare(
      "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'coordination_migrations'",
    ).get();
    if (ledger === undefined) {
      throw new Error("No released migration ledger is present.");
    }
    const applied = readAppliedMigrations(inspection);
    const registry = migrations.map(({ id }) => id);
    if (
      applied.length === 0 ||
      applied.length > registry.length ||
      applied.some((id, index) => id !== registry[index])
    ) {
      throw new Error(`Expected a non-empty exact prefix of ${registry.join(", ")}.`);
    }
    return applied;
  } catch (error) {
    throw startupError(
      "incompatible-history",
      path,
      "Unsupported or malformed coordination migration history; the database and SQLite sidecars were left untouched.",
      undefined,
      undefined,
      error,
    );
  } finally {
    inspection?.close();
    rmSync(inspectionDirectory, { recursive: true, force: true });
  }
}

function assertMigrationRegistry(migrations: readonly CoordinationMigration[]): void {
  if (
    migrations.length === 0 ||
    migrations.some(({ id }) => id.length === 0) ||
    new Set(migrations.map(({ id }) => id)).size !== migrations.length
  ) {
    throw new Error("The coordination migration registry must contain unique, non-empty immutable IDs.");
  }
}

function rollback(database: DatabaseSync, originalError: unknown): void {
  try {
    database.exec("ROLLBACK");
  } catch (rollbackError) {
    throw new AggregateError([originalError, rollbackError], "Migration and rollback both failed.");
  }
}

function startupError(
  kind: CoordinationDatabaseStartupFailure,
  databasePath: string,
  message: string,
  migrationId?: string,
  recoveryBackupPath?: string,
  cause?: unknown,
): CoordinationDatabaseStartupError {
  const detail = cause instanceof Error ? ` ${cause.message}` : cause === undefined ? "" : ` ${String(cause)}`;
  return new CoordinationDatabaseStartupError(
    kind,
    `${message}${detail}`,
    databasePath,
    migrationId,
    recoveryBackupPath,
    cause === undefined ? undefined : { cause },
  );
}

function currentSchemaIsComplete(database: DatabaseSync, expected?: string): boolean {
  return verifyCoordinationSchema(database, expected ?? readExpectedCoordinationSchema());
}

function readAppliedMigrations(database: DatabaseSync): string[] {
  const ledger = database.prepare(
    "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'coordination_migrations'",
  ).get();
  if (ledger === undefined) return [];
  const rows = database.prepare(
    "SELECT position, migration_id FROM coordination_migrations ORDER BY position",
  ).all() as Array<{ position: number; migration_id: string }>;
  if (
    rows.some(({ position, migration_id }, index) =>
      !Number.isInteger(position) || position !== index + 1 ||
      typeof migration_id !== "string" || migration_id.length === 0
    )
  ) {
    throw new Error("Malformed coordination migration history: positions and IDs must form a contiguous ordered ledger.");
  }
  return rows.map(({ migration_id }) => migration_id);
}
