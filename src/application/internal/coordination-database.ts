import { DatabaseSync } from "node:sqlite";

export class CoordinationDatabase {
  readonly connection: DatabaseSync;

  private constructor(connection: DatabaseSync) {
    this.connection = connection;
  }

  static open(path: string): CoordinationDatabase {
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
    CREATE TABLE IF NOT EXISTS activity_ledger (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (
        type IN (
          'task.created',
          'task.edited',
          'task.moved',
          'attention.created',
          'attention.resolved',
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
    CREATE TABLE IF NOT EXISTS activations (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      target_agent_id TEXT NOT NULL REFERENCES agents(id),
      reason_type TEXT NOT NULL CHECK (reason_type IN ('column-entry', 'agent-mention')),
      source_event_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_workspaces (
      task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
      path TEXT NOT NULL UNIQUE,
      starting_ref TEXT NOT NULL,
      commit_id TEXT NOT NULL
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
      thread_id TEXT
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
  `);
}
