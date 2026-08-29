import { DatabaseSync } from "node:sqlite";

import type { SliceEvidence, TaskInput, TaskOverview, TaskView } from "./model.ts";

interface RawTaskRow {
  id: string;
  title: string;
  active: number;
  metadata_json: string;
  revision: number;
}

interface RawOverviewRow {
  task_id: string;
  title: string;
  priority: string;
  activation_count: number;
  running_activation_id: string | null;
}

export const rawV1Schema = `
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  metadata_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE activations (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed')),
  payload_json TEXT NOT NULL
);
CREATE UNIQUE INDEX one_running_activation_per_task
  ON activations(task_id) WHERE status = 'running';
CREATE VIEW task_activation_summary AS
SELECT task.id AS task_id, task.title, COUNT(activation.id) AS activation_count
FROM tasks task
LEFT JOIN activations activation ON activation.task_id = task.id
GROUP BY task.id, task.title;
CREATE TRIGGER bump_task_revision_after_activation
AFTER INSERT ON activations
BEGIN
  UPDATE tasks SET revision = revision + 1 WHERE id = NEW.task_id;
END;
PRAGMA user_version = 1;
`;

export const rawV2Migration = `
ALTER TABLE tasks ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
UPDATE tasks
SET category = CASE
  WHEN json_extract(metadata_json, '$.priority') = 'high' THEN 'urgent'
  ELSE 'general'
END;
DROP VIEW task_activation_summary;
DROP TRIGGER bump_task_revision_after_activation;
CREATE TABLE activations_new (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed')),
  payload_json TEXT NOT NULL
);
INSERT INTO activations_new SELECT id, task_id, status, payload_json FROM activations;
DROP TABLE activations;
ALTER TABLE activations_new RENAME TO activations;
CREATE UNIQUE INDEX one_running_activation_per_task
  ON activations(task_id) WHERE status = 'running';
CREATE VIEW task_activation_summary AS
SELECT task.id AS task_id, task.title, COUNT(activation.id) AS activation_count
FROM tasks task
LEFT JOIN activations activation ON activation.task_id = task.id
GROUP BY task.id, task.title;
CREATE TRIGGER bump_task_revision_after_activation
AFTER INSERT ON activations
BEGIN
  UPDATE tasks SET revision = revision + 1 WHERE id = NEW.task_id;
END;
PRAGMA user_version = 2;
`;

const projectionSql = `
SELECT task.id AS task_id,
       task.title,
       json_extract(task.metadata_json, '$.priority') AS priority,
       COUNT(activation.id) AS activation_count,
       MAX(CASE WHEN activation.status = 'running' THEN activation.id END) AS running_activation_id
FROM tasks task
LEFT JOIN activations activation ON activation.task_id = task.id
GROUP BY task.id, task.title, task.metadata_json
ORDER BY task.id`;

export function runRawSlice(): SliceEvidence {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(rawV1Schema);
  const input: TaskInput = {
    id: "task-1",
    title: "Prototype persistence",
    active: true,
    metadata: { priority: "high" },
  };
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(
      "INSERT INTO tasks (id, title, active, metadata_json) VALUES (?, ?, ?, ?)",
    ).run(input.id, input.title, input.active ? 1 : 0, JSON.stringify(input.metadata));
    database.prepare(
      "UPDATE tasks SET title = ?, revision = revision + 1 WHERE id = ? AND revision = ?",
    ).run("Prototype persistence updated", input.id, 1);
    database.prepare(
      "INSERT INTO activations VALUES (?, ?, 'running', ?)",
    ).run("activation-1", input.id, JSON.stringify({ reason: "column-entry" }));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  const routine = decodeTask(database.prepare(
    "SELECT id, title, active, metadata_json, revision FROM tasks WHERE id = ?",
  ).get(input.id));
  const projection = database.prepare(projectionSql).all().map(decodeOverview);
  database.close();
  return {
    approach: "project-owned SQL",
    routine,
    projection,
    emittedSql: projectionSql.trim(),
    transactionVisible: true,
    handwrittenResultAssertions: 2,
    uncheckedSqlTypeHints: 0,
    runtimeDecoders: ["row shape", "JSON metadata", "SQLite integer boolean"],
  };
}

function decodeTask(value: unknown): TaskView {
  const row = value as RawTaskRow;
  if (typeof row?.id !== "string" || typeof row.title !== "string" ||
      typeof row.active !== "number" || typeof row.metadata_json !== "string" ||
      typeof row.revision !== "number") throw new Error("Unexpected raw task row");
  return {
    id: row.id,
    title: row.title,
    active: row.active === 1,
    metadata: JSON.parse(row.metadata_json) as TaskInput["metadata"],
    revision: row.revision,
  };
}

function decodeOverview(value: unknown): TaskOverview {
  const row = value as RawOverviewRow;
  if (typeof row?.task_id !== "string" || typeof row.title !== "string" ||
      typeof row.priority !== "string" || typeof row.activation_count !== "number" ||
      !(typeof row.running_activation_id === "string" || row.running_activation_id === null)) {
    throw new Error("Unexpected raw overview row");
  }
  return {
    taskId: row.task_id,
    title: row.title,
    priority: row.priority,
    activationCount: row.activation_count,
    runningActivationId: row.running_activation_id,
  };
}
