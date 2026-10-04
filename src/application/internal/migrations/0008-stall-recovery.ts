import type { DatabaseSync } from "node:sqlite";

export const stallRecoveryMigration = {
  id: "0008_stall_recovery",
  foreignKeys: "disabled",
  apply(database: DatabaseSync): void {
    const sequences = database.prepare(`SELECT name, seq FROM sqlite_sequence
      WHERE name IN ('activations', 'activity_ledger', 'notification_occurrences')`).all() as
      Array<{ name: string; seq: number }>;
    database.exec(`
CREATE TABLE activations_next (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        target_agent_id TEXT NOT NULL REFERENCES agents(id),
        reason_type TEXT NOT NULL CHECK (reason_type IN ('column-entry', 'agent-mention', 'relationship-satisfied', 'relationship-changed', 'user-follow-up', 'stall-recovery')),
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

INSERT INTO activations_next SELECT * FROM activations;
DROP TABLE activations;
ALTER TABLE activations_next RENAME TO activations;

CREATE INDEX activations_by_task_sequence ON activations(task_id, sequence);

CREATE UNIQUE INDEX one_running_activation_per_task
        ON activations(task_id) WHERE status = 'running';

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
        type TEXT NOT NULL CHECK (type IN (
          'task.created', 'task.edited', 'task.moved', 'comment.pinned', 'comment.unpinned',
          'relationship.created', 'relationship.removed', 'relationship.satisfied', 'relationship.resume-agent-changed',
          'attention.created', 'attention.resolved', 'activation.created', 'activation.dismissed',
          'attempt.started', 'attempt.completed', 'automation.suspended', 'automation.resumed',
          'conversation.continued', 'conversation.retired', 'task.archived', 'task.unarchived', 'stall.detected', 'stall.recovery-skipped', 'stall.recovery-exhausted'
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

CREATE TABLE attention_reasons_next (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('user-mention', 'failed-run', 'stall-recovery-exhausted')),
      source_event_id TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

INSERT INTO attention_reasons_next SELECT * FROM attention_reasons;
DROP TABLE attention_reasons;
ALTER TABLE attention_reasons_next RENAME TO attention_reasons;

CREATE INDEX attention_reasons_by_task_resolution
        ON attention_reasons(task_id, resolved_at);

CREATE TABLE notification_occurrences_next (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('user-mention', 'failed-run', 'column-entry', 'stall-recovery-exhausted')),
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

INSERT INTO notification_occurrences_next SELECT * FROM notification_occurrences;
DROP TABLE notification_occurrences;
ALTER TABLE notification_occurrences_next RENAME TO notification_occurrences;

      CREATE TABLE task_stall_recovery (
        task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
        recovery_count INTEGER NOT NULL DEFAULT 0 CHECK (recovery_count BETWEEN 0 AND 3),
        grace_until TEXT
      );
      CREATE TABLE stall_recovery_activations (
        activation_id TEXT PRIMARY KEY REFERENCES activations(id) ON DELETE CASCADE,
        recovery_number INTEGER NOT NULL CHECK (recovery_number BETWEEN 1 AND 3),
        dispatched INTEGER NOT NULL DEFAULT 0 CHECK (dispatched IN (0, 1))
      );

      -- These effects belong to the same transaction as the continuation promise.
      -- They cannot be lost when a concurrent recovery attempt settles later.
      CREATE TRIGGER regular_activation_resets_stall
        AFTER INSERT ON activations WHEN NEW.reason_type <> 'stall-recovery'
        BEGIN
          UPDATE task_stall_recovery SET recovery_count = 0 WHERE task_id = NEW.task_id;
        END;
      CREATE TRIGGER attention_resets_stall
        AFTER INSERT ON attention_reasons
        BEGIN
          UPDATE task_stall_recovery SET recovery_count = 0 WHERE task_id = NEW.task_id;
        END;
      CREATE TRIGGER waiting_relationship_resets_stall
        AFTER INSERT ON task_relationships
        WHEN (SELECT column_id FROM tasks WHERE id = NEW.target_task_id) <> 'completion'
        BEGIN
          UPDATE task_stall_recovery SET recovery_count = 0 WHERE task_id = NEW.source_task_id;
        END;
      CREATE TRIGGER user_owned_move_resets_stall
        AFTER UPDATE OF column_id ON tasks
        WHEN NEW.column_id = 'completion' OR EXISTS (
          SELECT 1 FROM columns WHERE board_id = NEW.board_id AND id = NEW.column_id
            AND watching_agent_id IS NULL
        )
        BEGIN
          UPDATE task_stall_recovery SET recovery_count = 0 WHERE task_id = NEW.id;
        END;
      CREATE TRIGGER reopened_target_resets_stall
        AFTER UPDATE OF column_id ON tasks
        WHEN OLD.column_id = 'completion' AND NEW.column_id <> 'completion'
        BEGIN
          UPDATE task_stall_recovery SET recovery_count = 0 WHERE task_id IN (
            SELECT source_task_id FROM task_relationships WHERE target_task_id = NEW.id
          );
        END;
      CREATE TRIGGER unwatched_column_resets_stall
        AFTER UPDATE OF watching_agent_id ON columns
        WHEN OLD.watching_agent_id IS NOT NULL AND NEW.watching_agent_id IS NULL
        BEGIN
          UPDATE task_stall_recovery SET recovery_count = 0 WHERE task_id IN (
            SELECT id FROM tasks WHERE board_id = NEW.board_id AND column_id = NEW.id
          );
        END;
      CREATE TRIGGER addressed_attention_grants_stall_grace
        AFTER UPDATE OF resolved_at ON attention_reasons
        WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM attention_reasons
            WHERE task_id = NEW.task_id AND resolved_at IS NULL)
        BEGIN
          INSERT INTO task_stall_recovery (task_id, grace_until)
          VALUES (NEW.task_id, strftime('%Y-%m-%dT%H:%M:%fZ', NEW.resolved_at, '+60 seconds'))
          ON CONFLICT(task_id) DO UPDATE SET grace_until = excluded.grace_until;
        END;
      CREATE TRIGGER dismissed_activation_grants_stall_grace
        AFTER INSERT ON activity_ledger WHEN NEW.type = 'activation.dismissed'
        BEGIN
          INSERT INTO task_stall_recovery (task_id, grace_until)
          VALUES (NEW.task_id, strftime('%Y-%m-%dT%H:%M:%fZ', NEW.occurred_at, '+60 seconds'))
          ON CONFLICT(task_id) DO UPDATE SET grace_until = excluded.grace_until;
        END;
    `);
    for (const sequence of sequences) {
      database.prepare("DELETE FROM sqlite_sequence WHERE name = ?").run(sequence.name);
      database.prepare("INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)").run(sequence.name, sequence.seq);
    }
  },
} as const;

