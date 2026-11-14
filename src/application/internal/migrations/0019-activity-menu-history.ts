import type { CoordinationMigration } from "../coordination-database.ts";

export const activityMenuHistoryMigration: CoordinationMigration = {
  id: "0019_activity_menu_history",
  apply(database) {
    database.exec(`CREATE TABLE activity_menu_history (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('preparation', 'run')),
      task_id TEXT NOT NULL,
      task_title TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('preparing', 'prepared', 'completed', 'failed', 'interrupted')),
      summary TEXT NOT NULL,
      dismissed INTEGER NOT NULL DEFAULT 0 CHECK (dismissed IN (0, 1))
    );
    CREATE INDEX activity_menu_kind_sequence ON activity_menu_history(kind, sequence DESC);
    CREATE INDEX activity_menu_visible ON activity_menu_history(kind, sequence DESC) WHERE dismissed = 0;
    CREATE INDEX activity_menu_summary ON activity_menu_history(kind, dismissed, finished_at, sequence);
    INSERT INTO activity_menu_history (id, kind, task_id, task_title, agent_id, started_at, finished_at, status, summary)
      SELECT attempt.id, 'run', task.id, task.title, activation.target_agent_id, attempt.started_at, attempt.completed_at,
        CASE WHEN attempt.outcome_kind = 'interrupted' THEN 'interrupted' ELSE attempt.status END,
        substr(COALESCE(attempt.outcome_summary, ''), 1, 2000)
      FROM (SELECT * FROM attempts WHERE status != 'running' AND provisional_probe = 0
        ORDER BY completed_at DESC, rowid DESC LIMIT 30) attempt
      JOIN activations activation ON activation.id = attempt.activation_id
      JOIN tasks task ON task.id = activation.task_id
      ORDER BY attempt.completed_at, attempt.id;`);
  },
};
