import type { DatabaseSync } from "node:sqlite";

export const relationshipResumeOwnersMigration = {
  id: "0003_relationship_resume_owners",
  foreignKeys: "disabled",
  apply(database: DatabaseSync): void {
    database.exec(`
      ALTER TABLE task_relationships
        ADD COLUMN resume_agent_id TEXT REFERENCES agents(id);

      CREATE TABLE activations_next (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        target_agent_id TEXT NOT NULL REFERENCES agents(id),
        reason_type TEXT NOT NULL CHECK (reason_type IN ('column-entry', 'agent-mention', 'relationship-satisfied', 'relationship-changed', 'user-follow-up')),
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
        continuation_message TEXT,
        definition_version TEXT NOT NULL,
        stale INTEGER NOT NULL DEFAULT 0 CHECK (stale IN (0, 1)),
        conversation_id TEXT
      );
      INSERT INTO activations_next
      SELECT sequence, id, task_id, target_agent_id,
             CASE reason_type WHEN 'blockers-cleared' THEN 'relationship-changed' ELSE reason_type END,
             source_event_id, status, created_at, model, reasoning_effort, retry_due_at,
             retry_cycle_start, failure_kind, failure_summary, resolution,
             continuation_message, definition_version, stale, conversation_id
      FROM activations;
      DROP TABLE activations;
      ALTER TABLE activations_next RENAME TO activations;
      CREATE UNIQUE INDEX one_running_activation_per_task
        ON activations(task_id) WHERE status = 'running';
      CREATE INDEX activations_by_task_sequence ON activations(task_id, sequence);
      CREATE TRIGGER activations_start_in_task_order
        BEFORE UPDATE OF status ON activations
        WHEN NEW.status = 'running'
         AND EXISTS (
           SELECT 1 FROM activations earlier
           WHERE earlier.task_id = NEW.task_id
             AND earlier.sequence < NEW.sequence
             AND earlier.status <> 'completed'
         )
        BEGIN
          SELECT RAISE(ABORT, 'activation-order-conflict');
        END;

      CREATE TABLE activity_ledger_next (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (
          type IN (
            'task.created', 'task.edited', 'task.moved',
            'relationship.created', 'relationship.removed',
            'relationship.satisfied', 'relationship.resume-agent-changed',
            'attention.created', 'attention.resolved',
            'activation.created', 'activation.dismissed',
            'attempt.started', 'attempt.completed',
            'automation.suspended', 'automation.resumed',
            'conversation.continued', 'conversation.retired',
            'task.archived', 'task.unarchived'
          )
        ),
        actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'agent', 'framework')),
        actor_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        details_json TEXT NOT NULL
      );
      INSERT INTO activity_ledger_next SELECT * FROM activity_ledger;
      DROP TABLE activity_ledger;
      ALTER TABLE activity_ledger_next RENAME TO activity_ledger;
      CREATE INDEX activity_ledger_by_task_sequence
        ON activity_ledger(task_id, sequence);
    `);
  },
} as const;
