import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fstatSync, lstatSync, mkdtempSync, openSync, readSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { setTimeout } from "node:timers/promises";

import { coordinationMigrations } from "./migrations/registry.ts";
import { readExpectedCoordinationSchema, verifyCoordinationSchema } from "./coordination-schema-snapshot.ts";
import { reportStartupProgress, type StartupProgressObserver } from "../startup-contract.ts";

export interface CoordinationMigration {
  readonly id: string;
  readonly foreignKeys?: "disabled";
  apply(database: DatabaseSync): void;
}

export interface CoordinationDatabaseOpenOptions {
  startupProgress?: StartupProgressObserver;
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

  static async open(path: string, startupProgress?: StartupProgressObserver): Promise<CoordinationDatabase> {
    return CoordinationDatabase.openWithOptions(path, startupProgress === undefined ? {} : { startupProgress });
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
    const direct = existed ? await tryOpenCurrentDatabase(path, migrations, options.startupProgress) : undefined;
    const applied = direct !== undefined ? migrations.map(({ id }) => id)
      : existed ? inspectExistingMigrationHistory(path, migrations, options.startupProgress) : [];
    const pending = migrations.slice(applied.length);
    const schemaAndHealthVerificationSteps = 3; // Schema, integrity, foreign keys.
    const verifiedBackupSteps = 4; // Copy, integrity, foreign keys, migration history.
    let remainingSteps = schemaAndHealthVerificationSteps + pending.length
      + (existed && pending.length > 0 ? verifiedBackupSteps : 0);
    const progress = (phase: string): void => {
      reportStartupProgress(options.startupProgress, { phase, remainingSteps: remainingSteps-- });
    };
    progress("Opening coordination database");
    const connection = direct ?? new DatabaseSync(path);
    let recoveryBackupPath: string | undefined;
    try {
      connection.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000");
      if (pending.length === 0) {
        verifyCurrentDatabase(
          connection,
          options.expectedSchemaIsComplete ?? ((database) => currentSchemaIsComplete(database, options.expectedSchema)),
          path,
          undefined,
          progress,
        );
        if (direct !== undefined) connection.exec("COMMIT");
        return new CoordinationDatabase(connection);
      }

      if (existed) {
        recoveryBackupPath = (options.backupPath ?? createMigrationBackupPath)(path);
        try {
          progress("Creating pre-upgrade recovery backup");
          if (options.createBackup !== undefined) {
            await options.createBackup(connection, recoveryBackupPath);
          } else {
            await createOnlineBackup(connection, recoveryBackupPath, (detail) => {
              reportStartupProgress(options.startupProgress, {
                phase: "Creating pre-upgrade recovery backup", remainingSteps: remainingSteps + 1, detail,
              });
            });
          }
          verifyRecoveryBackup(recoveryBackupPath, applied, progress);
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
        progress,
      );
      return new CoordinationDatabase(connection);
    } catch (error) {
      if (direct !== undefined && connection.isTransaction) connection.exec("ROLLBACK");
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
  progress?: (phase: string) => void,
): void {
  const foreignKeysDisabled = pending.some(({ foreignKeys }) => foreignKeys === "disabled");
  if (foreignKeysDisabled) database.exec("PRAGMA foreign_keys = OFF");
  database.exec("BEGIN IMMEDIATE");
  let migrationId: string | undefined;
  try {
    for (const [offset, migration] of pending.entries()) {
      migrationId = migration.id;
      progress?.(`Applying migration ${migration.id}`);
      migration.apply(database);
      database.prepare(
        "INSERT INTO coordination_migrations (position, migration_id) VALUES (?, ?)",
      ).run(appliedCount + offset + 1, migration.id);
    }
    migrationId = undefined;
    verifyCurrentDatabase(database, expectedSchemaIsComplete, databasePath, recoveryBackupPath, progress);
    database.exec("COMMIT");
    if (foreignKeysDisabled) database.exec("PRAGMA foreign_keys = ON");
  } catch (error) {
    rollback(database, error);
    if (foreignKeysDisabled) database.exec("PRAGMA foreign_keys = ON");
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
  progress?: (phase: string) => void,
): void {
  try {
    progress?.("Checking database schema");
    if (!expectedSchemaIsComplete(database)) {
      throw new Error("The database does not contain the complete expected current schema.");
    }
    verifySqliteHealth(database, progress, "database");
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

function verifySqliteHealth(database: DatabaseSync, progress?: (phase: string) => void, subject = "database"): void {
  progress?.(`Checking ${subject} integrity`);
  const integrity = database.prepare("PRAGMA integrity_check").all() as Array<{ integrity_check: string }>;
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
    throw new Error(`SQLite integrity_check failed: ${integrity.map(Object.values).flat().join(", ")}`);
  }
  progress?.(`Checking ${subject} foreign keys`);
  const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyViolations.length > 0) {
    throw new Error(`SQLite foreign_key_check found ${foreignKeyViolations.length} violation(s).`);
  }
}

async function createOnlineBackup(source: DatabaseSync, destination: string, progress: (detail: string) => void): Promise<void> {
  let lastReport = -Infinity;
  await backup(source, destination, {
    progress: ({ remainingPages, totalPages }) => {
      if (remainingPages !== 0 && performance.now() - lastReport < 1000) return;
      lastReport = performance.now();
      progress(`Copied ${totalPages - remainingPages} / ${totalPages} database pages`);
    },
  });
}

function verifyRecoveryBackup(path: string, expectedHistory: readonly string[], progress?: (phase: string) => void): void {
  const verification = new DatabaseSync(path, { readOnly: true });
  try {
    verification.exec("PRAGMA foreign_keys = ON; PRAGMA query_only = ON");
    verifySqliteHealth(verification, progress, "recovery backup");
    progress?.("Checking recovery backup migration history");
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

/**
 * Keep rollback-mode SQLite locks continuous from read-only compatibility
 * inspection through verification on the returned writable transaction.
 * Ineligible/pre-read recovery uses the disposable-copy path. Contention and
 * ambiguity after a protected read refuse rather than release into an unsafe copy.
 */
async function tryOpenCurrentDatabase(
  path: string,
  migrations: readonly CoordinationMigration[],
  progress?: StartupProgressObserver,
): Promise<DatabaseSync | undefined> {
  const deadline = performance.now() + 5000; // Preserve the normal SQLite busy allowance.
  let contention: unknown;
  for (;;) {
    try {
      const connection = tryOpenCurrentDatabaseOnce(path, migrations, progress);
      if (connection !== undefined || contention === undefined) return connection;
      // After observed contention, even a newly present sidecar must not route
      // us into an unfrozen copy. Recheck from scratch, or fail within the bound.
    } catch (error) {
      if (!isSqliteBusy(error)) throw error;
      contention = error;
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0) {
      throw startupError("incompatible-history", path,
        "The coordination database is busy; retry startup after the other SQLite connection finishes. Retained files were left untouched.",
        undefined, undefined, contention);
    }
    reportStartupProgress(progress, { phase: "Waiting for database access" });
    // All connections/locks from the failed attempt closed in its finally.
    // Waiting with its SHARED lock would prevent the other writer committing.
    await setTimeout(Math.min(25, remaining));
  }
}

function tryOpenCurrentDatabaseOnce(
  path: string,
  migrations: readonly CoordinationMigration[],
  progress?: StartupProgressObserver,
): DatabaseSync | undefined {
  let inspection: DatabaseSync | undefined;
  let writable: DatabaseSync | undefined;
  let protectedRead = false;
  try {
    const identity = lstatSync(path);
    if (!identity.isFile() || !sqliteSidecarsAbsent(path)) return undefined;
    // Close this ordinary fd BEFORE SQLite takes locks: on POSIX, closing any
    // fd for this inode could otherwise release the process's SQLite locks.
    const input = openSync(path, "r");
    try {
      const file = fstatSync(input);
      const header = Buffer.alloc(20);
      if (file.dev !== identity.dev || file.ino !== identity.ino ||
        readSync(input, header, 0, header.length, 0) !== header.length ||
        header.toString("ascii", 0, 16) !== "SQLite format 3\0" || header[18] !== 1 || header[19] !== 1) return undefined;
    } finally { closeSync(input); }

    reportStartupProgress(progress, { phase: "Inspecting current migration history without copying" });
    inspection = new DatabaseSync(path, { readOnly: true });
    // Set before the first pager access. Even a race to WAL cannot create/map
    // or change SHM; EXCLUSIVE WAL uses a private index. Hot rollback recovery
    // cannot write through this read-only connection and falls back instead.
    inspection.exec("PRAGMA locking_mode = EXCLUSIVE; BEGIN");
    const applied = readAppliedMigrations(inspection);
    protectedRead = true;
    const mode = inspection.prepare("PRAGMA main.journal_mode").get() as { journal_mode: string };
    const currentIdentity = lstatSync(path);
    if (mode.journal_mode !== "delete" || !sqliteSidecarsAbsent(path) || !currentIdentity.isFile() ||
      currentIdentity.dev !== identity.dev || currentIdentity.ino !== identity.ino) {
      throw startupError("incompatible-history", path,
        "SQLite files changed during compatibility inspection; retry startup after external database activity finishes. Retained files were left untouched.");
    }
    if (applied.length !== migrations.length || applied.some((id, index) => id !== migrations[index]?.id)) return undefined;

    // The retained SHARED lock prevents any other SQLite connection from
    // committing or switching journal mode. RESERVED excludes another writer
    // before we release that lock. Never wait while holding up another writer.
    writable = new DatabaseSync(path);
    writable.exec("PRAGMA busy_timeout = 0; BEGIN IMMEDIATE");
    inspection.close();
    inspection = undefined;
    const result = writable;
    writable = undefined;
    return result;
  } catch (error) {
    if (error instanceof CoordinationDatabaseStartupError) throw error;
    if (isSqliteBusy(error)) throw error;
    if (protectedRead) {
      throw startupError("incompatible-history", path,
        "Could not safely finish locked compatibility inspection; retained files were left untouched.", undefined, undefined, error);
    }
    return undefined;
  } finally {
    writable?.close();
    inspection?.close();
  }
}

function isSqliteBusy(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { errcode?: number }).errcode;
  return code !== undefined && ((code & 0xff) === 5 || (code & 0xff) === 6);
}

function sqliteSidecarsAbsent(path: string): boolean {
  return ["-wal", "-shm", "-journal"].every((suffix) => {
    try { lstatSync(`${path}${suffix}`); return false; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
      throw error;
    }
  });
}

function inspectExistingMigrationHistory(
  path: string,
  migrations: readonly CoordinationMigration[],
  progress?: StartupProgressObserver,
): string[] {
  const inspectionDirectory = mkdtempSync(join(tmpdir(), "coordination-schema-inspection-"));
  const inspectionPath = join(inspectionDirectory, "coordination.sqlite3");
  let inspection: DatabaseSync | undefined;
  try {
    reportStartupProgress(progress, { phase: "Copying database for migration inspection" });
    copyInspectionFile(path, inspectionPath, progress);
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      if (existsSync(`${path}${suffix}`)) copyInspectionFile(`${path}${suffix}`, `${inspectionPath}${suffix}`, progress);
    }
    // A hot rollback journal must be recovered before SQLite can read the
    // schema. Recovery writes only this disposable copy, never retained state.
    reportStartupProgress(progress, { phase: "Inspecting migration history" });
    inspection = new DatabaseSync(inspectionPath);
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

/** Chunk only the disposable inspection copy; retained files remain read-only. */
function copyInspectionFile(source: string, destination: string, progress?: StartupProgressObserver): void {
  const input = openSync(source, "r");
  try {
    const { size, mode } = fstatSync(input);
    const output = openSync(destination, "w", mode);
    try {
      const buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
      let copied = 0;
      let lastReport = performance.now();
      for (;;) {
        const length = readSync(input, buffer);
        if (length === 0) break;
        let written = 0;
        while (written < length) written += writeSync(output, buffer, written, length - written);
        copied += length;
        if (copied === size || performance.now() - lastReport >= 1000) {
          lastReport = performance.now();
          reportStartupProgress(progress, {
            phase: "Copying database for migration inspection",
            detail: `${basename(source)}: copied ${copied} / ${size} bytes`,
          });
        }
      }
    } finally { closeSync(output); }
  } finally { closeSync(input); }
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
