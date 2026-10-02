import type { DatabaseSync } from "node:sqlite";

export const sharedCommentPinsMigration = {
  id: "0005_shared_comment_pins",
  apply(database: DatabaseSync): void {
    database.exec(`
      ALTER TABLE task_comments ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1));
      CREATE TABLE activity_ledger_next (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN (
          'task.created', 'task.edited', 'task.moved', 'comment.pinned', 'comment.unpinned',
          'relationship.created', 'relationship.removed', 'relationship.satisfied', 'relationship.resume-agent-changed',
          'attention.created', 'attention.resolved', 'activation.created', 'activation.dismissed',
          'attempt.started', 'attempt.completed', 'automation.suspended', 'automation.resumed',
          'conversation.continued', 'conversation.retired', 'task.archived', 'task.unarchived'
        )),
        actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'agent', 'framework')),
        actor_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        details_json TEXT NOT NULL
      );
      INSERT INTO activity_ledger_next SELECT * FROM activity_ledger;
      DROP TABLE activity_ledger;
      ALTER TABLE activity_ledger_next RENAME TO activity_ledger;
      CREATE INDEX activity_ledger_by_task_sequence ON activity_ledger(task_id, sequence);
    `);
  },
} as const;
