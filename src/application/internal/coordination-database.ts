import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

import { coordinationMigrations } from "./migrations/registry.ts";

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
          options.expectedSchemaIsComplete ?? currentSchemaIsComplete,
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
        options.expectedSchemaIsComplete ?? currentSchemaIsComplete,
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

  static openEphemeral(): CoordinationDatabase {
    const connection = new DatabaseSync(":memory:");
    try {
      connection.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000");
      applyPendingMigrations(
        connection,
        ":memory:",
        0,
        coordinationMigrations,
        currentSchemaIsComplete,
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

function currentSchemaIsComplete(database: DatabaseSync): boolean {
  const requiredTables = [
    "runtime", "agents", "model_pricing", "boards", "columns", "task_numbers", "tasks",
    "activity_ledger", "activations", "agent_conversations", "activation_contexts",
    "agent_conversation_messages", "pending_conversation_uploads", "conversation_attachments",
    "task_workspaces", "task_starting_refs", "attempts", "attempt_transcripts",
    "activation_dispatch_claims", "activation_startup_failures", "task_comments",
    "task_relationships", "attention_reasons", "task_attachments", "command_responses",
    "notification_policy", "notification_column_subscriptions", "notification_occurrences",
  ];
  const tables = new Set(
    (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
      .map(({ name }) => name),
  );
  if (requiredTables.some((table) => !tables.has(table))) return false;
  if (database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = 'mapped_tasks'").get() === undefined) return false;
  if (database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = 'agent_inspectable_tasks'").get() === undefined) return false;
  const columns = (table: string) => new Set(
    (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(({ name }) => name),
  );
  const runtimeColumns = columns("runtime");
  const taskColumns = columns("tasks");
  const activationColumns = columns("activations");
  const conversationColumns = columns("agent_conversations");
  const attemptColumns = columns("attempts");
  const commentColumns = columns("task_comments");
  const transcriptColumns = columns("attempt_transcripts");
  const activityTable = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'activity_ledger'")
    .get() as { sql: string } | undefined;
  return runtimeColumns.has("impact_previous_version") &&
    ["automation_suspended", "suspended_activation_id", "archived_at", "archival_pending", "archival_actor_id", "archival_idempotency_key"].every((name) => taskColumns.has(name)) &&
    ["continuation_message", "retry_cycle_start", "definition_version", "stale", "conversation_id"].every((name) => activationColumns.has(name)) &&
    ["owning_agent_name_snapshot", "generated_label", "originating_activation_id", "current_thread_id", "latest_activity_at", "latest_activity_sequence", "delivered_description", "delivered_comment_sequence", "delivered_activity_sequence", "retired_at", "retirement_reason", "retirement_actor_id", "replaces_conversation_id", "replacement_reason", "archived_cost_json"].every((name) => conversationColumns.has(name)) &&
    ["outcome_kind", "thread_continuity", "pricing_json", "context_window_usage_json"].every((name) => attemptColumns.has(name)) &&
    ["usage_json", "reported_usage_json"].every((name) => transcriptColumns.has(name)) &&
    commentColumns.has("attempt_id") &&
    ["task.archived", "conversation.continued", "conversation.retired", "activation.dismissed", "relationship.removed"].every((value) => activityTable?.sql.includes(value) === true);
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
