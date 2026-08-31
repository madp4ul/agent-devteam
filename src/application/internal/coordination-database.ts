import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { coordinationMigrations } from "./migrations/registry.ts";

export class CoordinationDatabase {
  readonly connection: DatabaseSync;

  private constructor(connection: DatabaseSync) {
    this.connection = connection;
  }

  static open(path: string): CoordinationDatabase {
    assertExistingDatabaseHasReleasedHistory(path);
    const connection = new DatabaseSync(path);
    try {
      applyCoordinationMigrations(connection);
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

function applyCoordinationMigrations(database: DatabaseSync): void {
  database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000");
  const applied = readAppliedMigrations(database);
  const expectedPrefix = coordinationMigrations.slice(0, applied.length).map(({ id }) => id);
  if (
    applied.length > coordinationMigrations.length ||
    applied.some((id, index) => id !== expectedPrefix[index])
  ) {
    throw new Error(
      `Unsupported coordination migration history: expected an exact prefix of ${coordinationMigrations.map(({ id }) => id).join(", ")}.`,
    );
  }
  const pending = coordinationMigrations.slice(applied.length);
  if (pending.length === 0) {
    if (!currentSchemaIsComplete(database)) {
      throw new Error("Released coordination database does not match its recorded migration history.");
    }
    return;
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const [offset, migration] of pending.entries()) {
      migration.apply(database);
      database.prepare(
        "INSERT INTO coordination_migrations (position, migration_id) VALUES (?, ?)",
      ).run(applied.length + offset + 1, migration.id);
    }
    if (!currentSchemaIsComplete(database)) {
      throw new Error("Released coordination migration did not produce the complete expected schema.");
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function currentSchemaIsComplete(database: DatabaseSync): boolean {
  const requiredTables = [
    "runtime",
    "agents",
    "model_pricing",
    "boards",
    "columns",
    "task_numbers",
    "tasks",
    "activity_ledger",
    "activations",
    "agent_conversations",
    "activation_contexts",
    "agent_conversation_messages",
    "pending_conversation_uploads",
    "conversation_attachments",
    "task_workspaces",
    "task_starting_refs",
    "attempts",
    "attempt_transcripts",
    "activation_dispatch_claims",
    "activation_startup_failures",
    "task_comments",
    "task_relationships",
    "attention_reasons",
    "task_attachments",
    "command_responses",
    "notification_policy",
    "notification_column_subscriptions",
    "notification_occurrences",
  ];
  const tables = new Set(
    (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
      .map(({ name }) => name),
  );
  if (requiredTables.some((table) => !tables.has(table))) return false;
  const mappedTasksView = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = 'mapped_tasks'")
    .get();
  if (mappedTasksView === undefined) return false;
  const inspectableTasksView = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = 'agent_inspectable_tasks'")
    .get();
  if (inspectableTasksView === undefined) return false;
  const runtimeColumns = new Set(
    (database.prepare("PRAGMA table_info(runtime)").all() as Array<{ name: string }>).map(({ name }) => name),
  );
  const taskColumns = new Set(
    (database.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>).map(({ name }) => name),
  );
  const activationColumns = new Set(
    (database.prepare("PRAGMA table_info(activations)").all() as Array<{ name: string }>).map(({ name }) => name),
  );
  const conversationColumns = new Set(
    (database.prepare("PRAGMA table_info(agent_conversations)").all() as Array<{ name: string }>)
      .map(({ name }) => name),
  );
  const attemptColumns = new Set(
    (database.prepare("PRAGMA table_info(attempts)").all() as Array<{ name: string }>).map(({ name }) => name),
  );
  const commentColumns = new Set(
    (database.prepare("PRAGMA table_info(task_comments)").all() as Array<{ name: string }>).map(({ name }) => name),
  );
  const transcriptColumns = new Set(
    (database.prepare("PRAGMA table_info(attempt_transcripts)").all() as Array<{ name: string }>)
      .map(({ name }) => name),
  );
  const activityTable = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'activity_ledger'")
    .get() as { sql: string } | undefined;
  return runtimeColumns.has("impact_previous_version") &&
    taskColumns.has("automation_suspended") &&
    taskColumns.has("suspended_activation_id") &&
    taskColumns.has("archived_at") &&
    taskColumns.has("archival_pending") &&
    taskColumns.has("archival_actor_id") &&
    taskColumns.has("archival_idempotency_key") &&
    activationColumns.has("continuation_message") &&
    activationColumns.has("retry_cycle_start") &&
    activationColumns.has("definition_version") &&
    activationColumns.has("stale") &&
    activationColumns.has("conversation_id") &&
    conversationColumns.has("owning_agent_name_snapshot") &&
    conversationColumns.has("generated_label") &&
    conversationColumns.has("originating_activation_id") &&
    conversationColumns.has("current_thread_id") &&
    conversationColumns.has("latest_activity_at") &&
    conversationColumns.has("latest_activity_sequence") &&
    conversationColumns.has("delivered_description") &&
    conversationColumns.has("delivered_comment_sequence") &&
    conversationColumns.has("delivered_activity_sequence") &&
    conversationColumns.has("retired_at") &&
    conversationColumns.has("retirement_reason") &&
    conversationColumns.has("retirement_actor_id") &&
    conversationColumns.has("replaces_conversation_id") &&
    conversationColumns.has("replacement_reason") &&
    conversationColumns.has("archived_cost_json") &&
    attemptColumns.has("outcome_kind") &&
    attemptColumns.has("thread_continuity") &&
    attemptColumns.has("pricing_json") &&
    attemptColumns.has("context_window_usage_json") &&
    transcriptColumns.has("usage_json") &&
    transcriptColumns.has("reported_usage_json") &&
    commentColumns.has("attempt_id") &&
    activityTable?.sql.includes("task.archived") === true &&
    activityTable.sql.includes("conversation.continued") === true &&
    activityTable.sql.includes("conversation.retired") === true &&
    activityTable.sql.includes("activation.dismissed") === true &&
    activityTable.sql.includes("relationship.removed") === true;
}

function assertExistingDatabaseHasReleasedHistory(path: string): void {
  if (path === ":memory:" || !existsSync(path)) return;
  const inspectionDirectory = mkdtempSync(join(tmpdir(), "coordination-schema-inspection-"));
  const inspectionPath = join(inspectionDirectory, "coordination.sqlite3");
  let inspection: DatabaseSync | undefined;
  try {
    copyFileSync(path, inspectionPath);
    for (const suffix of ["-wal", "-shm"]) {
      if (existsSync(`${path}${suffix}`)) copyFileSync(`${path}${suffix}`, `${inspectionPath}${suffix}`);
    }
    inspection = new DatabaseSync(inspectionPath, { readOnly: true });
    inspection.exec("PRAGMA busy_timeout = 5000");
    const ledger = inspection.prepare(
      "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'coordination_migrations'",
    ).get();
    if (ledger === undefined) {
      throw new Error(
        "Unsupported pre-release coordination database: no released migration ledger is present. The database was left untouched.",
      );
    }
    const applied = readAppliedMigrations(inspection);
    const registry = coordinationMigrations.map(({ id }) => id);
    if (
      applied.length === 0 ||
      applied.length > registry.length ||
      applied.some((id, index) => id !== registry[index])
    ) {
      throw new Error(
        `Unsupported coordination migration history: expected a non-empty exact prefix of ${registry.join(", ")}. The database was left untouched.`,
      );
    }
  } finally {
    inspection?.close();
    rmSync(inspectionDirectory, { recursive: true, force: true });
  }
}

function readAppliedMigrations(database: DatabaseSync): string[] {
  const ledger = database.prepare(
    "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'coordination_migrations'",
  ).get();
  if (ledger === undefined) return [];
  const rows = database.prepare(
    "SELECT position, migration_id FROM coordination_migrations ORDER BY position",
  ).all() as Array<{ position: number; migration_id: string }>;
  if (rows.some(({ position }, index) => position !== index + 1)) {
    throw new Error("Malformed coordination migration history: positions must be contiguous from 1.");
  }
  return rows.map(({ migration_id }) => migration_id);
}
