import type { CoordinationMigration } from "../coordination-database.ts";

export const archivalTaskMenuHistoryMigration: CoordinationMigration = {
  id: "0020_archival_task_menu_history",
  apply(database) {
    database.exec(`ALTER TABLE archival_operation_tasks ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
      ALTER TABLE archival_operation_tasks ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0 CHECK (dismissed IN (0, 1));
      ALTER TABLE archival_operation_tasks ADD COLUMN history_sequence INTEGER;
      UPDATE archival_operation_tasks SET updated_at = (SELECT updated_at FROM archival_operations WHERE id = operation_id),
        dismissed = CASE WHEN state IN ('archived', 'failed', 'interrupted')
          THEN (SELECT dismissed FROM archival_operations WHERE id = operation_id) ELSE 0 END,
        history_sequence = CASE WHEN state IN ('archived', 'failed', 'interrupted') THEN rowid ELSE NULL END;
      CREATE UNIQUE INDEX archival_task_history_sequence ON archival_operation_tasks(history_sequence) WHERE history_sequence IS NOT NULL;
      CREATE INDEX archival_task_menu_history ON archival_operation_tasks(history_sequence DESC)
        WHERE dismissed = 0 AND state IN ('archived', 'failed', 'interrupted');
      CREATE INDEX archival_task_menu_active ON archival_operation_tasks(operation_id, position)
        WHERE state IN ('queued', 'running');`);
  },
};
