import type { CoordinationMigration } from "../coordination-database.ts";

export const archivalOperationsMigration: CoordinationMigration = {
  id: "0018_archival_operations",
  apply(database) {
    database.exec(`CREATE TABLE archival_operations (
      sequence INTEGER PRIMARY KEY,
      id TEXT NOT NULL UNIQUE,
      request_hash TEXT NOT NULL,
      target_key TEXT NOT NULL,
      target_json TEXT NOT NULL,
      label TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'interrupted')),
      attention INTEGER NOT NULL DEFAULT 0 CHECK (attention IN (0, 1)),
      dismissed INTEGER NOT NULL DEFAULT 0 CHECK (dismissed IN (0, 1)),
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX archival_operations_active_target ON archival_operations(target_key)
      WHERE state IN ('queued', 'running');
    CREATE INDEX archival_operations_feedback ON archival_operations(attention, state, sequence) WHERE dismissed = 0;
    CREATE TABLE archival_operation_tasks (
      operation_id TEXT NOT NULL REFERENCES archival_operations(id),
      position INTEGER NOT NULL,
      task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'archived', 'failed', 'interrupted')),
      failure_json TEXT,
      PRIMARY KEY (operation_id, task_id)
    );
    CREATE INDEX archival_operation_task_position ON archival_operation_tasks(operation_id, position);
    CREATE INDEX archival_operation_task_lookup ON archival_operation_tasks(task_id, operation_id);
    CREATE TABLE archival_operation_requests (
      id TEXT PRIMARY KEY,
      request_hash TEXT NOT NULL,
      operation_id TEXT NOT NULL REFERENCES archival_operations(id)
    );`);
  },
};
