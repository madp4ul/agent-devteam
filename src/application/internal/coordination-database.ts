import { DatabaseSync } from "node:sqlite";
import { existsSync, rmSync } from "node:fs";

const currentSchemaVersion = 13;

export class CoordinationDatabase {
  readonly connection: DatabaseSync;

  private constructor(connection: DatabaseSync) {
    this.connection = connection;
  }

  static open(path: string): CoordinationDatabase {
    replaceIncompatibleDatabase(path);
    const connection = new DatabaseSync(path);
    initializeCurrentSchema(connection);
    return new CoordinationDatabase(connection);
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

function initializeCurrentSchema(database: DatabaseSync): void {
  database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000");
  const version = (
    database.prepare("PRAGMA user_version").get() as { user_version: number }
  ).user_version;
  if (version === currentSchemaVersion && currentSchemaIsComplete(database)) return;
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
    CREATE TABLE IF NOT EXISTS runtime (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      process_name TEXT NOT NULL,
      definition_version TEXT NOT NULL,
      automation_state TEXT NOT NULL CHECK (automation_state IN ('paused', 'running')),
      impact_previous_version TEXT
    );
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      summary TEXT NOT NULL,
      instructions_path TEXT NOT NULL,
      instructions_content TEXT NOT NULL,
      model TEXT,
      reasoning_effort TEXT,
      applied INTEGER NOT NULL CHECK (applied IN (0, 1))
    );
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      guidance TEXT NOT NULL,
      position INTEGER NOT NULL UNIQUE,
      applied INTEGER NOT NULL CHECK (applied IN (0, 1))
    );
    CREATE TABLE IF NOT EXISTS columns (
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      watching_agent_id TEXT REFERENCES agents(id),
      framework_owned INTEGER NOT NULL CHECK (framework_owned IN (0, 1)),
      applied INTEGER NOT NULL CHECK (applied IN (0, 1)),
      PRIMARY KEY (board_id, id),
      UNIQUE (board_id, position)
    );
    CREATE TABLE IF NOT EXISTS task_numbers (
      number INTEGER PRIMARY KEY AUTOINCREMENT
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      sequence INTEGER NOT NULL UNIQUE,
      board_id TEXT NOT NULL,
      column_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      archived_at TEXT,
      archival_pending INTEGER NOT NULL DEFAULT 0 CHECK (archival_pending IN (0, 1)),
      archival_actor_id TEXT,
      archival_idempotency_key TEXT,
      automation_suspended INTEGER NOT NULL DEFAULT 0,
      suspended_activation_id TEXT,
      FOREIGN KEY (board_id, column_id) REFERENCES columns(board_id, id)
    );
    CREATE TABLE IF NOT EXISTS activity_ledger (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (
        type IN (
          'task.created',
          'task.edited',
          'task.moved',
          'relationship.created',
          'relationship.removed',
          'relationship.satisfied',
          'attention.created',
          'attention.resolved',
          'activation.created',
          'activation.dismissed',
          'attempt.started',
          'attempt.completed',
          'automation.suspended',
          'automation.resumed',
          'task.archived',
          'task.unarchived'
        )
      ),
      actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'agent', 'framework')),
      actor_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      details_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activations (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      target_agent_id TEXT NOT NULL REFERENCES agents(id),
      reason_type TEXT NOT NULL CHECK (reason_type IN ('column-entry', 'agent-mention', 'blockers-cleared')),
      source_event_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
      created_at TEXT NOT NULL,
      model TEXT,
      reasoning_effort TEXT,
      retry_due_at TEXT,
      retry_cycle_start INTEGER NOT NULL DEFAULT 0,
      failure_kind TEXT,
      failure_summary TEXT,
      resolution TEXT,
      continuation_message TEXT
      ,definition_version TEXT NOT NULL
      ,stale INTEGER NOT NULL DEFAULT 0 CHECK (stale IN (0, 1))
    );
    CREATE TABLE IF NOT EXISTS task_workspaces (
      task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
      path TEXT NOT NULL UNIQUE,
      starting_ref TEXT NOT NULL,
      commit_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_starting_refs (
      task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
      starting_ref TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      activation_id TEXT NOT NULL REFERENCES activations(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
      workspace_path TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      outcome_status TEXT CHECK (outcome_status IN ('completed', 'failed')),
      outcome_summary TEXT,
      thread_id TEXT,
      model TEXT,
      reasoning_effort TEXT,
      outcome_kind TEXT
    );
    CREATE TABLE IF NOT EXISTS attempt_transcripts (
      attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
      items_json TEXT NOT NULL,
      usage_json TEXT,
      reported_usage_json TEXT
    );
    CREATE TABLE IF NOT EXISTS activation_dispatch_claims (
      attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
      activation_id TEXT NOT NULL UNIQUE REFERENCES activations(id) ON DELETE CASCADE,
      claimed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activation_startup_failures (
      activation_id TEXT PRIMARY KEY REFERENCES activations(id) ON DELETE CASCADE,
      occurred_at TEXT NOT NULL,
      boundary TEXT NOT NULL,
      diagnostic TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS task_comments (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'agent')),
      actor_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      attempt_id TEXT REFERENCES attempts(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS task_relationships (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('parent-child', 'dependency')),
      source_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      target_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      CHECK (source_task_id <> target_task_id)
    );
    CREATE TABLE IF NOT EXISTS attention_reasons (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('user-mention', 'failed-run')),
      source_event_id TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS task_attachments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0)
    );
    CREATE TABLE IF NOT EXISTS command_responses (
      command_type TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      response_json TEXT NOT NULL,
      PRIMARY KEY (command_type, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS notification_policy (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      user_mention_enabled INTEGER NOT NULL CHECK (user_mention_enabled IN (0, 1)),
      failed_run_enabled INTEGER NOT NULL CHECK (failed_run_enabled IN (0, 1))
    );
    INSERT OR IGNORE INTO notification_policy VALUES (1, 1, 1, 1);
    CREATE TABLE IF NOT EXISTS notification_column_subscriptions (
      board_id TEXT NOT NULL,
      column_id TEXT NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      PRIMARY KEY (board_id, column_id),
      FOREIGN KEY (board_id, column_id) REFERENCES columns(board_id, id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS notification_occurrences (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('user-mention', 'failed-run', 'column-entry')),
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      task_title TEXT NOT NULL,
      board_id TEXT NOT NULL,
      board_name TEXT NOT NULL,
      column_id TEXT,
      column_name TEXT,
      attention_reason_id TEXT REFERENCES attention_reasons(id) ON DELETE CASCADE,
      source_event_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );
    CREATE VIEW IF NOT EXISTS mapped_tasks AS
      SELECT task.id
      FROM tasks task
      JOIN boards board ON board.id = task.board_id AND board.applied = 1
      JOIN columns column
        ON column.board_id = task.board_id AND column.id = task.column_id AND column.applied = 1
      WHERE task.archived_at IS NULL;
    CREATE VIEW IF NOT EXISTS agent_inspectable_tasks AS
      SELECT task.id
      FROM tasks task
      JOIN boards board ON board.id = task.board_id
      JOIN columns column ON column.board_id = task.board_id AND column.id = task.column_id
      WHERE task.archived_at IS NULL
        AND ((board.applied = 1 AND column.applied = 1) OR task.column_id = 'completion');
    CREATE UNIQUE INDEX IF NOT EXISTS one_running_activation_per_task
      ON activations(task_id)
      WHERE status = 'running';
    CREATE UNIQUE INDEX IF NOT EXISTS one_relationship_of_each_type
      ON task_relationships(type, source_task_id, target_task_id);
    CREATE TRIGGER IF NOT EXISTS activations_start_in_task_order
      BEFORE UPDATE OF status ON activations
      WHEN NEW.status = 'running'
       AND EXISTS (
         SELECT 1
         FROM activations earlier
         WHERE earlier.task_id = NEW.task_id
           AND earlier.sequence < NEW.sequence
           AND earlier.status <> 'completed'
       )
      BEGIN
        SELECT RAISE(ABORT, 'activation-order-conflict');
      END;
    `);
    database.exec(`PRAGMA user_version = ${currentSchemaVersion}`);
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
    "boards",
    "columns",
    "task_numbers",
    "tasks",
    "activity_ledger",
    "activations",
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
    attemptColumns.has("outcome_kind") &&
    transcriptColumns.has("usage_json") &&
    transcriptColumns.has("reported_usage_json") &&
    commentColumns.has("attempt_id") &&
    activityTable?.sql.includes("task.archived") === true &&
    activityTable.sql.includes("activation.dismissed") === true &&
    activityTable.sql.includes("relationship.removed") === true;
}

function replaceIncompatibleDatabase(path: string): void {
  if (!existsSync(path)) return;
  const inspection = new DatabaseSync(path, { readOnly: true });
  let compatible: boolean;
  try {
    inspection.exec("PRAGMA busy_timeout = 5000");
    const version = (
      inspection.prepare("PRAGMA user_version").get() as { user_version: number }
    ).user_version;
    compatible = version === currentSchemaVersion && currentSchemaIsComplete(inspection);
  } finally {
    inspection.close();
  }
  if (compatible) return;
  rmSync(path, { force: true });
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
}
