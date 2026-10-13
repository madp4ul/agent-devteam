import type { DatabaseSync } from "node:sqlite";

/** Indexed browser groups and sources; authored evidence remains in its original tables. */
export const taskTimelineMigration = {
  id: "0011_task_timeline",
  apply(database: DatabaseSync): void {
    database.exec(`
      CREATE TABLE task_timeline_records (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        id TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        source_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );
      CREATE INDEX task_timeline_position ON task_timeline_records(task_id, occurred_at DESC, sequence DESC);
      CREATE INDEX task_timeline_task_sequence ON task_timeline_records(task_id, sequence);
      CREATE INDEX task_timeline_record_source ON task_timeline_records(task_id, source_id);
      CREATE TABLE task_timeline_sources (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        id TEXT NOT NULL UNIQUE,
        record_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );
      CREATE INDEX task_timeline_source_position ON task_timeline_sources(task_id, record_id, occurred_at DESC, sequence DESC);
      CREATE TABLE task_movement_metadata (
        sequence INTEGER PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        id TEXT NOT NULL UNIQUE,
        record_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        actor_kind TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        details_json TEXT NOT NULL
      );
      CREATE INDEX task_movement_task_sequence ON task_movement_metadata(task_id, sequence);
      CREATE INDEX task_comments_current_pins ON task_comments(task_id, pinned, sequence);
      INSERT INTO task_timeline_records(task_id, id, kind, source_id, occurred_at)
        SELECT activation.task_id, 'attempt-' || attempt.id, 'attempt', attempt.id, attempt.started_at
        FROM attempts attempt JOIN activations activation ON activation.id = attempt.activation_id
        WHERE NOT EXISTS (SELECT 1 FROM activation_dispatch_claims claim WHERE claim.attempt_id = attempt.id);
      CREATE TRIGGER task_timeline_attempt AFTER INSERT ON attempts
        WHEN NOT EXISTS (SELECT 1 FROM activation_dispatch_claims claim WHERE claim.attempt_id = NEW.id) BEGIN
        INSERT OR IGNORE INTO task_timeline_records(task_id, id, kind, source_id, occurred_at)
          SELECT task_id, 'attempt-' || NEW.id, 'attempt', NEW.id, NEW.started_at FROM activations WHERE id = NEW.activation_id;
      END;
      CREATE TRIGGER task_timeline_attempt_published AFTER DELETE ON activation_dispatch_claims BEGIN
        INSERT OR IGNORE INTO task_timeline_records(task_id, id, kind, source_id, occurred_at)
          SELECT activation.task_id, 'attempt-' || attempt.id, 'attempt', attempt.id, attempt.started_at
          FROM attempts attempt JOIN activations activation ON activation.id = attempt.activation_id WHERE attempt.id = OLD.attempt_id;
      END;
      CREATE TRIGGER task_timeline_attempt_claim AFTER INSERT ON activation_dispatch_claims BEGIN
        DELETE FROM task_timeline_records WHERE id = 'attempt-' || NEW.attempt_id;
      END;
      CREATE TRIGGER task_timeline_attempt_delete AFTER DELETE ON attempts BEGIN
        DELETE FROM task_timeline_records WHERE id = 'attempt-' || OLD.id;
      END;
      CREATE VIEW task_timeline_comment_positions AS
        SELECT comment.task_id, comment.id, comment.occurred_at,
          CASE WHEN EXISTS (SELECT 1 FROM attempts attempt JOIN activations activation ON activation.id = attempt.activation_id
            WHERE attempt.id = comment.attempt_id AND activation.task_id = comment.task_id)
          THEN 'attempt-' || comment.attempt_id ELSE 'comment-' || comment.id END AS record_id
        FROM task_comments comment;
      INSERT INTO task_timeline_sources(task_id, id, record_id, kind, occurred_at)
        SELECT task_id, id, record_id, 'comment', occurred_at FROM task_timeline_comment_positions;
      INSERT INTO task_timeline_records(task_id, id, kind, source_id, occurred_at)
        SELECT task_id, record_id, 'comment', id, occurred_at FROM task_timeline_comment_positions WHERE record_id = 'comment-' || id;
      CREATE TRIGGER task_timeline_comment AFTER INSERT ON task_comments BEGIN
        INSERT INTO task_timeline_sources(task_id, id, record_id, kind, occurred_at)
          SELECT task_id, id, record_id, 'comment', occurred_at FROM task_timeline_comment_positions WHERE id = NEW.id;
        INSERT OR IGNORE INTO task_timeline_records(task_id, id, kind, source_id, occurred_at)
          SELECT task_id, record_id, 'comment', id, occurred_at FROM task_timeline_comment_positions WHERE id = NEW.id AND record_id = 'comment-' || id;
      END;
      CREATE VIEW task_timeline_activity_positions AS
        SELECT activity.task_id, activity.id, activity.occurred_at,
          CASE WHEN EXISTS (SELECT 1 FROM attempts attempt JOIN activations activation ON activation.id = attempt.activation_id
            WHERE attempt.id = json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.attemptId') AND activation.task_id = activity.task_id)
          THEN 'attempt-' || json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.attemptId') ELSE 'activity-' || activity.id END AS record_id
        FROM activity_ledger activity WHERE activity.type NOT IN ('activation.created', 'attempt.started', 'attempt.completed', 'attention.created');
      INSERT INTO task_timeline_sources(task_id, id, record_id, kind, occurred_at)
        SELECT task_id, id, record_id, 'activity', occurred_at FROM task_timeline_activity_positions;
      INSERT INTO task_timeline_records(task_id, id, kind, source_id, occurred_at)
        SELECT task_id, record_id, 'activity', id, occurred_at FROM task_timeline_activity_positions WHERE record_id = 'activity-' || id;
      CREATE TRIGGER task_timeline_activity AFTER INSERT ON activity_ledger BEGIN
        INSERT INTO task_timeline_sources(task_id, id, record_id, kind, occurred_at)
          SELECT task_id, id, record_id, 'activity', occurred_at FROM task_timeline_activity_positions WHERE id = NEW.id;
        INSERT OR IGNORE INTO task_timeline_records(task_id, id, kind, source_id, occurred_at)
          SELECT task_id, record_id, 'activity', id, occurred_at FROM task_timeline_activity_positions WHERE id = NEW.id AND record_id = 'activity-' || id;
      END;
      CREATE VIEW task_movement_projection AS
        SELECT activity.sequence, activity.task_id, activity.id, position.record_id, activity.occurred_at, activity.actor_kind, activity.actor_id,
          json_object('fromColumnId', json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.fromColumnId'),
            'toColumnId', json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.toColumnId'),
            'fromColumnName', coalesce(json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.fromColumnName'), json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.fromColumnId')),
            'toColumnName', coalesce(json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.toColumnName'), json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.toColumnId')),
            'actorName', coalesce(json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.actorName'), activity.actor_id)) AS details_json
        FROM activity_ledger activity JOIN task_timeline_activity_positions position ON position.id = activity.id WHERE activity.type = 'task.moved';
      INSERT INTO task_movement_metadata SELECT * FROM task_movement_projection;
      CREATE TRIGGER task_movement_insert AFTER INSERT ON activity_ledger WHEN NEW.type = 'task.moved' BEGIN
        INSERT INTO task_movement_metadata SELECT * FROM task_movement_projection WHERE id = NEW.id;
      END;
      INSERT INTO task_timeline_records(task_id, id, kind, source_id, occurred_at)
        SELECT activation.task_id, 'startup-failure-' || failure.activation_id, 'startup-failure', failure.activation_id, failure.occurred_at
        FROM activation_startup_failures failure JOIN activations activation ON activation.id = failure.activation_id;
      CREATE TRIGGER task_timeline_startup AFTER INSERT ON activation_startup_failures BEGIN
        INSERT INTO task_timeline_records(task_id, id, kind, source_id, occurred_at)
          SELECT task_id, 'startup-failure-' || NEW.activation_id, 'startup-failure', NEW.activation_id, NEW.occurred_at FROM activations WHERE id = NEW.activation_id;
      END;
      CREATE TRIGGER task_timeline_startup_update AFTER UPDATE ON activation_startup_failures BEGIN
        UPDATE task_timeline_records SET occurred_at = NEW.occurred_at WHERE id = 'startup-failure-' || NEW.activation_id;
      END;
    `);
  },
} as const;
