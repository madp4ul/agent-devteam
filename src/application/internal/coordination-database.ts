import { DatabaseSync } from "node:sqlite";

const ACTIVATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS activations (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    target_agent_id TEXT NOT NULL REFERENCES agents(id),
    reason_type TEXT NOT NULL CHECK (reason_type IN ('column-entry')),
    source_activity_id TEXT NOT NULL UNIQUE REFERENCES activity_ledger(id),
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    created_at TEXT NOT NULL
  );
`;

const ATTEMPTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    activation_id TEXT NOT NULL REFERENCES activations(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    workspace_path TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    outcome_status TEXT CHECK (outcome_status IN ('completed', 'failed')),
    outcome_summary TEXT,
    thread_id TEXT
  );
`;

export function openCoordinationDatabase(path: string): DatabaseSync {
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS runtime (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      process_name TEXT NOT NULL,
      definition_version TEXT NOT NULL,
      automation_state TEXT NOT NULL CHECK (automation_state IN ('paused', 'running'))
    );
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      summary TEXT NOT NULL,
      instructions_path TEXT NOT NULL,
      instructions_content TEXT NOT NULL,
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
      FOREIGN KEY (board_id, column_id) REFERENCES columns(board_id, id)
    );
    CREATE TABLE IF NOT EXISTS task_activity (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('task.created', 'task.moved')),
      actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'agent')),
      actor_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL
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
          'activation.created',
          'attempt.started',
          'attempt.completed'
        )
      ),
      actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'agent', 'framework')),
      actor_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      details_json TEXT NOT NULL
    );
    ${ACTIVATIONS_TABLE_SQL}
    CREATE TABLE IF NOT EXISTS task_workspaces (
      task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
      path TEXT NOT NULL UNIQUE,
      starting_ref TEXT NOT NULL,
      commit_id TEXT NOT NULL
    );
    ${ATTEMPTS_TABLE_SQL}
    CREATE TABLE IF NOT EXISTS task_comments (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'agent')),
      actor_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL
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
  `);
  migrateTaskSequence(database);
  migrateFailedRunOutcomes(database);
  migrateAttemptThreadId(database);
  migrateTranscriptOwnership(database);
  migrateActivityLedger(database);
  migrateTaskEditedActivity(database);
  return database;
}

function migrateTaskEditedActivity(database: DatabaseSync): void {
  const schema = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'activity_ledger'")
    .get() as { sql: string };
  if (schema.sql.includes("'task.edited'")) return;
  database.exec("PRAGMA foreign_keys = OFF");
  try {
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE activity_ledger_with_task_edits (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (
          type IN (
            'task.created',
            'task.edited',
            'task.moved',
            'activation.created',
            'attempt.started',
            'attempt.completed'
          )
        ),
        actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'agent', 'framework')),
        actor_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        details_json TEXT NOT NULL
      );
      INSERT INTO activity_ledger_with_task_edits
        SELECT sequence, id, task_id, type, actor_kind, actor_id, occurred_at, details_json
        FROM activity_ledger;
      DROP TABLE activity_ledger;
      ALTER TABLE activity_ledger_with_task_edits RENAME TO activity_ledger;
      COMMIT;
    `);
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateTaskSequence(database: DatabaseSync): void {
  const taskColumns = database.prepare("PRAGMA table_info(tasks)").all() as Array<{
    name: string;
  }>;
  if (taskColumns.some((column) => column.name === "sequence")) return;
  database.exec("ALTER TABLE tasks ADD COLUMN sequence INTEGER");
  database.exec("UPDATE tasks SET sequence = CAST(SUBSTR(id, 3) AS INTEGER)");
  database.exec("CREATE UNIQUE INDEX tasks_sequence_unique ON tasks(sequence)");
}

function migrateFailedRunOutcomes(database: DatabaseSync): void {
  const activationSchema = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'activations'")
    .get() as { sql: string };
  if (activationSchema.sql.includes("'failed'")) return;
  const attemptColumns = database.prepare("PRAGMA table_info(attempts)").all() as Array<{
    name: string;
  }>;
  const threadIdProjection = attemptColumns.some((column) => column.name === "thread_id")
    ? "thread_id"
    : "NULL";
  database.exec("PRAGMA foreign_keys = OFF");
  try {
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE attempts RENAME TO attempts_before_failed_outcomes;
      ALTER TABLE activations RENAME TO activations_before_failed_outcomes;
      ${ACTIVATIONS_TABLE_SQL}
      ${ATTEMPTS_TABLE_SQL}
      INSERT INTO activations
        SELECT sequence, id, task_id, target_agent_id, reason_type,
               source_activity_id, status, created_at
        FROM activations_before_failed_outcomes;
      INSERT INTO attempts
        SELECT id, activation_id, status, workspace_path, started_at,
               completed_at, outcome_status, outcome_summary, ${threadIdProjection}
        FROM attempts_before_failed_outcomes;
      DROP TABLE attempts_before_failed_outcomes;
      DROP TABLE activations_before_failed_outcomes;
      COMMIT;
    `);
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateAttemptThreadId(database: DatabaseSync): void {
  const attemptColumns = database.prepare("PRAGMA table_info(attempts)").all() as Array<{
    name: string;
  }>;
  if (!attemptColumns.some((column) => column.name === "thread_id")) {
    database.exec("ALTER TABLE attempts ADD COLUMN thread_id TEXT");
  }
}

function migrateTranscriptOwnership(database: DatabaseSync): void {
  const attemptColumns = database.prepare("PRAGMA table_info(attempts)").all() as Array<{
    name: string;
  }>;
  if (attemptColumns.some((column) => column.name === "transcript_json")) {
    database.exec("ALTER TABLE attempts DROP COLUMN transcript_json");
  }
}

function migrateActivityLedger(database: DatabaseSync): void {
  database.exec(`
    INSERT OR IGNORE INTO activity_ledger
      (id, task_id, type, actor_kind, actor_id, occurred_at, details_json)
    SELECT id, task_id, type, actor_kind, actor_id, occurred_at, '{}'
    FROM task_activity
    ORDER BY rowid;
  `);
}
