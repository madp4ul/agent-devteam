import type { CoordinationMigration } from "../coordination-database.ts";

/** Browser history is an indexed projection; original attempt evidence remains intact. */
export const conversationHistoryItemsMigration: CoordinationMigration = {
  id: "0010_conversation_history_items",
  apply(database) {
    database.exec(`
      CREATE TABLE conversation_history_items (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
        position TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('cause', 'item', 'continuity-loss', 'resume', 'retirement')),
        activation_id TEXT REFERENCES activations(id) ON DELETE CASCADE,
        attempt_id TEXT REFERENCES attempts(id) ON DELETE CASCADE,
        source_id TEXT,
        item_json TEXT
      );
      CREATE UNIQUE INDEX conversation_history_position ON conversation_history_items(conversation_id, position);
      CREATE INDEX conversation_history_attempt ON conversation_history_items(conversation_id, attempt_id, position);
      CREATE INDEX conversation_history_source ON conversation_history_items(conversation_id, source_id, position);
      CREATE INDEX conversation_history_activation ON conversation_history_items(conversation_id, activation_id, position);
      CREATE INDEX conversation_history_watermark ON conversation_history_items(conversation_id, sequence);
      CREATE INDEX conversation_attempt_status ON attempts(activation_id, status);
      CREATE INDEX conversation_activation_status ON activations(conversation_id, status, sequence);
      CREATE VIEW conversation_history_activation_positions AS
        SELECT activation.id, activation.conversation_id,
          coalesce(message.occurred_at, comment.occurred_at, activity.occurred_at, activation.created_at)
          || '|' || printf('%020d', activation.sequence) AS position
        FROM activations activation
        LEFT JOIN agent_conversation_messages message ON message.id = activation.source_event_id AND activation.reason_type = 'user-follow-up'
        LEFT JOIN task_comments comment ON comment.id = activation.source_event_id AND activation.reason_type <> 'user-follow-up'
        LEFT JOIN activity_ledger activity ON activity.id = activation.source_event_id AND activation.reason_type <> 'user-follow-up';
      INSERT INTO conversation_history_items(id, conversation_id, position, kind, activation_id, source_id)
        SELECT 'cause:' || activation.id, activation.conversation_id, positions.position || '|00000000000000000000|0', 'cause', activation.id, activation.source_event_id
        FROM activations activation JOIN conversation_history_activation_positions positions ON positions.id = activation.id
        WHERE activation.conversation_id IS NOT NULL AND (activation.reason_type <> 'user-follow-up'
          OR EXISTS (SELECT 1 FROM agent_conversation_messages message WHERE message.id = activation.source_event_id));
      CREATE TRIGGER conversation_history_activation_insert AFTER INSERT ON activations WHEN NEW.conversation_id IS NOT NULL BEGIN
        INSERT INTO conversation_history_items(id, conversation_id, position, kind, activation_id, source_id)
          SELECT 'cause:' || NEW.id, NEW.conversation_id, position || '|00000000000000000000|0', 'cause', NEW.id, NEW.source_event_id
          FROM conversation_history_activation_positions WHERE id = NEW.id;
      END;
      CREATE TRIGGER conversation_history_activation_bind AFTER UPDATE OF conversation_id ON activations WHEN OLD.conversation_id IS NULL AND NEW.conversation_id IS NOT NULL BEGIN
        INSERT INTO conversation_history_items(id, conversation_id, position, kind, activation_id, source_id)
          SELECT 'cause:' || NEW.id, NEW.conversation_id, position || '|00000000000000000000|0', 'cause', NEW.id, NEW.source_event_id
          FROM conversation_history_activation_positions WHERE id = NEW.id;
      END;
      INSERT INTO conversation_history_items(id, conversation_id, position, kind, activation_id, attempt_id, item_json)
        SELECT 'item:' || attempt.id || ':' || item.key, positions.conversation_id,
          positions.position || '|' || printf('%020d', attempt.rowid) || '|2|' || printf('%020d', item.key),
          'item', attempt.activation_id, attempt.id, item.value
        FROM attempt_transcripts transcript JOIN attempts attempt ON attempt.id = transcript.attempt_id
        JOIN conversation_history_activation_positions positions ON positions.id = attempt.activation_id,
        json_each(transcript.items_json) item WHERE positions.conversation_id IS NOT NULL;
      CREATE TRIGGER conversation_history_transcript_insert AFTER INSERT ON attempt_transcripts BEGIN
        INSERT INTO conversation_history_items(id, conversation_id, position, kind, activation_id, attempt_id, item_json)
          SELECT 'item:' || attempt.id || ':' || item.key, positions.conversation_id,
            positions.position || '|' || printf('%020d', attempt.rowid) || '|2|' || printf('%020d', item.key),
            'item', attempt.activation_id, attempt.id, item.value
          FROM attempts attempt JOIN conversation_history_activation_positions positions ON positions.id = attempt.activation_id,
          json_each(NEW.items_json) item WHERE attempt.id = NEW.attempt_id AND positions.conversation_id IS NOT NULL
          ON CONFLICT(id) DO UPDATE SET item_json = excluded.item_json;
      END;
      CREATE TRIGGER conversation_history_transcript_update AFTER UPDATE OF items_json ON attempt_transcripts BEGIN
        INSERT INTO conversation_history_items(id, conversation_id, position, kind, activation_id, attempt_id, item_json)
          SELECT 'item:' || attempt.id || ':' || item.key, positions.conversation_id,
            positions.position || '|' || printf('%020d', attempt.rowid) || '|2|' || printf('%020d', item.key),
            'item', attempt.activation_id, attempt.id, item.value
          FROM attempts attempt JOIN conversation_history_activation_positions positions ON positions.id = attempt.activation_id,
          json_each(NEW.items_json) item WHERE attempt.id = NEW.attempt_id AND positions.conversation_id IS NOT NULL
          ON CONFLICT(id) DO UPDATE SET item_json = excluded.item_json;
      END;
      CREATE TRIGGER conversation_history_transcript_delete AFTER DELETE ON attempt_transcripts BEGIN
        DELETE FROM conversation_history_items WHERE attempt_id = OLD.attempt_id AND kind = 'item';
      END;
      CREATE TRIGGER conversation_history_message_delete AFTER DELETE ON agent_conversation_messages BEGIN
        DELETE FROM conversation_history_items WHERE conversation_id = OLD.conversation_id AND source_id = OLD.id AND kind = 'cause';
      END;
      INSERT INTO conversation_history_items(id, conversation_id, position, kind, activation_id, attempt_id)
        SELECT 'continuity:' || attempt.id, positions.conversation_id,
          positions.position || '|' || printf('%020d', attempt.rowid) || '|1', 'continuity-loss', attempt.activation_id, attempt.id
        FROM attempts attempt JOIN conversation_history_activation_positions positions ON positions.id = attempt.activation_id
        WHERE attempt.thread_continuity = 'replaced' AND positions.conversation_id IS NOT NULL;
      CREATE TRIGGER conversation_history_continuity AFTER UPDATE OF thread_continuity ON attempts WHEN NEW.thread_continuity = 'replaced' BEGIN
        INSERT OR IGNORE INTO conversation_history_items(id, conversation_id, position, kind, activation_id, attempt_id)
          SELECT 'continuity:' || NEW.id, conversation_id, position || '|' || printf('%020d', NEW.rowid) || '|1', 'continuity-loss', NEW.activation_id, NEW.id
          FROM conversation_history_activation_positions WHERE id = NEW.activation_id AND conversation_id IS NOT NULL;
      END;
      CREATE VIEW conversation_history_resume_positions AS
        SELECT activity.id, positions.conversation_id, activation.id AS activation_id,
          positions.position || '|' || printf('%020d', coalesce(
            (SELECT attempt.rowid FROM attempts attempt WHERE attempt.id = coalesce(json_extract(activity.details_json, '$.interruptedAttemptId'),
              (SELECT json_extract(suspension.details_json, '$.attemptId') FROM activity_ledger suspension
               WHERE suspension.task_id = activity.task_id AND suspension.type = 'automation.suspended'
                 AND json_extract(suspension.details_json, '$.activationId') = activation.id AND suspension.sequence < activity.sequence
               ORDER BY suspension.sequence DESC LIMIT 1))),
            (SELECT attempt.rowid FROM attempts attempt WHERE attempt.activation_id = activation.id AND attempt.outcome_kind = 'interrupted' AND attempt.completed_at <= activity.occurred_at ORDER BY attempt.rowid DESC LIMIT 1), 0))
          || '|3|' || printf('%020d', activity.sequence) AS position
        FROM activity_ledger activity JOIN activations activation ON activation.id = json_extract(activity.details_json, '$.activationId')
        JOIN conversation_history_activation_positions positions ON positions.id = activation.id
        WHERE activity.type = 'automation.resumed' AND coalesce(json_extract(activity.details_json, '$.resolution'), '') <> 'dismissed';
      INSERT INTO conversation_history_items(id, conversation_id, position, kind, activation_id, source_id)
        SELECT 'resume:' || id, conversation_id, position, 'resume', activation_id, id FROM conversation_history_resume_positions WHERE conversation_id IS NOT NULL;
      CREATE TRIGGER conversation_history_resume AFTER INSERT ON activity_ledger WHEN NEW.type = 'automation.resumed' BEGIN
        INSERT INTO conversation_history_items(id, conversation_id, position, kind, activation_id, source_id)
          SELECT 'resume:' || id, conversation_id, position, 'resume', activation_id, id FROM conversation_history_resume_positions WHERE id = NEW.id AND conversation_id IS NOT NULL;
      END;
      INSERT INTO conversation_history_items(id, conversation_id, position, kind)
        SELECT 'retirement:' || id, id, retired_at || '|00000000000000000000|0', 'retirement' FROM agent_conversations WHERE retired_at IS NOT NULL;
      CREATE TRIGGER conversation_history_retirement AFTER UPDATE OF retired_at ON agent_conversations WHEN OLD.retired_at IS NULL AND NEW.retired_at IS NOT NULL BEGIN
        INSERT INTO conversation_history_items(id, conversation_id, position, kind) VALUES ('retirement:' || NEW.id, NEW.id, NEW.retired_at || '|00000000000000000000|0', 'retirement');
      END;
    `);
  },
};
