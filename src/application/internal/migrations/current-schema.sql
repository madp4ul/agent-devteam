-- table activation_contexts on activation_contexts
CREATE TABLE activation_contexts (
      activation_id TEXT PRIMARY KEY REFERENCES activations(id) ON DELETE CASCADE,
      context_json TEXT NOT NULL
    );

-- table activation_dispatch_claims on activation_dispatch_claims
CREATE TABLE activation_dispatch_claims (
      attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
      activation_id TEXT NOT NULL UNIQUE REFERENCES activations(id) ON DELETE CASCADE,
      claimed_at TEXT NOT NULL
    );

-- table activation_startup_failures on activation_startup_failures
CREATE TABLE activation_startup_failures (
      activation_id TEXT PRIMARY KEY REFERENCES activations(id) ON DELETE CASCADE,
      occurred_at TEXT NOT NULL,
      boundary TEXT NOT NULL,
      diagnostic TEXT NOT NULL,
      resolved_at TEXT
    );

-- table activations on activations
CREATE TABLE "activations" (
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

-- table activity_ledger on activity_ledger
CREATE TABLE "activity_ledger" (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN (
          'task.created', 'task.edited', 'task.moved', 'comment.pinned', 'comment.unpinned',
          'relationship.created', 'relationship.removed', 'relationship.satisfied', 'relationship.resume-agent-changed',
          'attention.created', 'attention.resolved', 'activation.created', 'activation.dismissed',
          'attempt.started', 'attempt.completed', 'automation.suspended', 'automation.resumed',
          'conversation.continued', 'conversation.retired', 'task.archived', 'task.unarchived', 'stall.detected', 'stall.recovery-skipped', 'stall.recovery-exhausted', 'runtime.waiting', 'runtime.recovered', 'runtime.waiting-stopped', 'runtime.waiting-ended'
        )),
        actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'agent', 'framework')),
        actor_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        details_json TEXT NOT NULL
      );

-- table agent_conversation_messages on agent_conversation_messages
CREATE TABLE agent_conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      actor_kind TEXT NOT NULL CHECK (actor_kind = 'user'),
      actor_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );

-- table agent_conversations on agent_conversations
CREATE TABLE agent_conversations (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      owning_agent_id TEXT NOT NULL REFERENCES agents(id),
      owning_agent_name_snapshot TEXT NOT NULL,
      generated_label TEXT NOT NULL,
      originating_activation_id TEXT NOT NULL UNIQUE REFERENCES activations(id) ON DELETE CASCADE,
      current_thread_id TEXT,
      created_at TEXT NOT NULL,
      latest_activity_at TEXT NOT NULL,
      latest_activity_sequence INTEGER NOT NULL,
      delivered_description TEXT,
      delivered_comment_sequence INTEGER NOT NULL DEFAULT 0,
      delivered_activity_sequence INTEGER NOT NULL DEFAULT 0
      ,retired_at TEXT
      ,retirement_reason TEXT
      ,retirement_actor_id TEXT
      ,replaces_conversation_id TEXT REFERENCES agent_conversations(id)
      ,replacement_reason TEXT
      ,archived_cost_json TEXT
    , delivered_pin_ids_json TEXT NOT NULL DEFAULT '[]');

-- table agents on agents
CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      summary TEXT NOT NULL,
      instructions_path TEXT NOT NULL,
      instructions_content TEXT NOT NULL,
      model TEXT,
      reasoning_effort TEXT,
      applied INTEGER NOT NULL CHECK (applied IN (0, 1))
    , allowances_json TEXT NOT NULL DEFAULT '[]');

-- table attempt_transcripts on attempt_transcripts
CREATE TABLE attempt_transcripts (
      attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
      items_json TEXT NOT NULL,
      usage_json TEXT,
      reported_usage_json TEXT
    );

-- table attempts on attempts
CREATE TABLE attempts (
      id TEXT PRIMARY KEY,
      activation_id TEXT NOT NULL REFERENCES activations(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
      workspace_path TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      outcome_status TEXT CHECK (outcome_status IN ('completed', 'failed')),
      outcome_summary TEXT,
      thread_id TEXT,
      model TEXT,
      reasoning_effort TEXT,
      pricing_json TEXT,
      context_window_usage_json TEXT,
      outcome_kind TEXT
      ,thread_continuity TEXT CHECK (thread_continuity IS NULL OR thread_continuity = 'replaced')
    , reviewer_allowances_json TEXT, recovery_episode_id TEXT REFERENCES runtime_recovery_episodes(id), runtime_failure_class TEXT, runtime_failure_json TEXT, provisional_probe INTEGER NOT NULL DEFAULT 0 CHECK (provisional_probe IN (0, 1)));

-- table attention_reasons on attention_reasons
CREATE TABLE "attention_reasons" (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('user-mention', 'failed-run', 'stall-recovery-exhausted')),
      source_event_id TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

-- table boards on boards
CREATE TABLE boards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      guidance TEXT NOT NULL,
      position INTEGER NOT NULL UNIQUE,
      applied INTEGER NOT NULL CHECK (applied IN (0, 1))
    );

-- table columns on columns
CREATE TABLE columns (
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

-- table command_responses on command_responses
CREATE TABLE command_responses (
      command_type TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      response_json TEXT NOT NULL, request_json TEXT,
      PRIMARY KEY (command_type, idempotency_key)
    );

-- table conversation_attachments on conversation_attachments
CREATE TABLE conversation_attachments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL REFERENCES agent_conversation_messages(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
      position INTEGER NOT NULL CHECK (position >= 0),
      UNIQUE (message_id, position)
    );

-- table conversation_history_items on conversation_history_items
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

-- table coordination_migrations on coordination_migrations
CREATE TABLE coordination_migrations (
      position INTEGER PRIMARY KEY CHECK (position > 0),
      migration_id TEXT NOT NULL UNIQUE
    );

-- table history_cursor_identity on history_cursor_identity
CREATE TABLE history_cursor_identity (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), secret TEXT NOT NULL);

-- table model_pricing on model_pricing
CREATE TABLE model_pricing (
      model TEXT PRIMARY KEY,
      input_usd_per_million REAL NOT NULL CHECK (input_usd_per_million >= 0),
      cached_input_usd_per_million REAL NOT NULL CHECK (cached_input_usd_per_million >= 0),
      cache_write_input_usd_per_million REAL NOT NULL CHECK (cache_write_input_usd_per_million >= 0),
      output_usd_per_million REAL NOT NULL CHECK (output_usd_per_million >= 0)
    );

-- table notification_column_subscriptions on notification_column_subscriptions
CREATE TABLE notification_column_subscriptions (
      board_id TEXT NOT NULL,
      column_id TEXT NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      PRIMARY KEY (board_id, column_id),
      FOREIGN KEY (board_id, column_id) REFERENCES columns(board_id, id) ON DELETE CASCADE
    );

-- table notification_occurrences on notification_occurrences
CREATE TABLE "notification_occurrences" (
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

-- table notification_policy on notification_policy
CREATE TABLE notification_policy (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      user_mention_enabled INTEGER NOT NULL CHECK (user_mention_enabled IN (0, 1)),
      failed_run_enabled INTEGER NOT NULL CHECK (failed_run_enabled IN (0, 1))
    );

-- table pending_conversation_uploads on pending_conversation_uploads
CREATE TABLE pending_conversation_uploads (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
      created_at TEXT NOT NULL
    );

-- table runtime on runtime
CREATE TABLE runtime (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      process_name TEXT NOT NULL,
      definition_version TEXT NOT NULL,
      automation_state TEXT NOT NULL CHECK (automation_state IN ('paused', 'running')),
      impact_previous_version TEXT
    );

-- table runtime_recovery_episodes on runtime_recovery_episodes
CREATE TABLE runtime_recovery_episodes (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        activation_id TEXT NOT NULL REFERENCES activations(id) ON DELETE CASCADE,
        classification TEXT NOT NULL CHECK (classification IN ('connection-lost', 'service-unavailable', 'budget-exhausted')),
        state TEXT NOT NULL CHECK (state IN ('waiting', 'recovered', 'stopped', 'ordinary')),
        first_failure TEXT NOT NULL,
        latest_failure TEXT NOT NULL,
        first_at TEXT NOT NULL,
        latest_at TEXT NOT NULL,
        next_eligible_at TEXT NOT NULL,
        failure_count INTEGER NOT NULL DEFAULT 1,
        retry_count INTEGER NOT NULL DEFAULT 0,
        samples_json TEXT NOT NULL,
        resolved_at TEXT
      );

-- table stall_recovery_activations on stall_recovery_activations
CREATE TABLE stall_recovery_activations (
        activation_id TEXT PRIMARY KEY REFERENCES activations(id) ON DELETE CASCADE,
        recovery_number INTEGER NOT NULL CHECK (recovery_number BETWEEN 1 AND 3),
        dispatched INTEGER NOT NULL DEFAULT 0 CHECK (dispatched IN (0, 1))
      );

-- table task_attachments on task_attachments
CREATE TABLE task_attachments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0)
    );

-- table task_comments on task_comments
CREATE TABLE task_comments (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'agent')),
      actor_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      attempt_id TEXT REFERENCES attempts(id) ON DELETE SET NULL
    , origin_task_id TEXT, origin_task_title TEXT, pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)));

-- table task_movement_metadata on task_movement_metadata
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

-- table task_numbers on task_numbers
CREATE TABLE task_numbers (
      number INTEGER PRIMARY KEY AUTOINCREMENT
    );

-- table task_relationships on task_relationships
CREATE TABLE task_relationships (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('parent-child', 'dependency')),
      source_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      target_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, resume_agent_id TEXT REFERENCES agents(id),
      CHECK (source_task_id <> target_task_id)
    );

-- table task_stall_recovery on task_stall_recovery
CREATE TABLE task_stall_recovery (
        task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
        recovery_count INTEGER NOT NULL DEFAULT 0 CHECK (recovery_count BETWEEN 0 AND 3),
        grace_until TEXT
      );

-- table task_starting_refs on task_starting_refs
CREATE TABLE task_starting_refs (
      task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
      starting_ref TEXT NOT NULL
    );

-- table task_timeline_records on task_timeline_records
CREATE TABLE task_timeline_records (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        id TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        source_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );

-- table task_timeline_sources on task_timeline_sources
CREATE TABLE task_timeline_sources (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        id TEXT NOT NULL UNIQUE,
        record_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );

-- table task_workspaces on task_workspaces
CREATE TABLE task_workspaces (
      task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
      path TEXT NOT NULL UNIQUE,
      starting_ref TEXT NOT NULL,
      commit_id TEXT NOT NULL
    );

-- table tasks on tasks
CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      sequence INTEGER NOT NULL UNIQUE,
      board_id TEXT NOT NULL,
      column_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      archived_at TEXT,
      archival_pending INTEGER NOT NULL DEFAULT 0 CHECK (archival_pending IN (0, 1)),
      archival_actor_id TEXT,
      archival_idempotency_key TEXT,
      automation_suspended INTEGER NOT NULL DEFAULT 0,
      suspended_activation_id TEXT,
      FOREIGN KEY (board_id, column_id) REFERENCES columns(board_id, id)
    );

-- index activations_by_task_sequence on activations
CREATE INDEX activations_by_task_sequence ON activations(task_id, sequence);

-- index activity_ledger_by_task_sequence on activity_ledger
CREATE INDEX activity_ledger_by_task_sequence ON activity_ledger(task_id, sequence);

-- index attempts_by_activation on attempts
CREATE INDEX attempts_by_activation
        ON attempts(activation_id);

-- index attention_reasons_by_task_resolution on attention_reasons
CREATE INDEX attention_reasons_by_task_resolution
        ON attention_reasons(task_id, resolved_at);

-- index conversation_activation_status on activations
CREATE INDEX conversation_activation_status ON activations(conversation_id, status, sequence);

-- index conversation_attempt_status on attempts
CREATE INDEX conversation_attempt_status ON attempts(activation_id, status);

-- index conversation_history_activation on conversation_history_items
CREATE INDEX conversation_history_activation ON conversation_history_items(conversation_id, activation_id, position);

-- index conversation_history_attempt on conversation_history_items
CREATE INDEX conversation_history_attempt ON conversation_history_items(conversation_id, attempt_id, position);

-- index conversation_history_position on conversation_history_items
CREATE UNIQUE INDEX conversation_history_position ON conversation_history_items(conversation_id, position);

-- index conversation_history_source on conversation_history_items
CREATE INDEX conversation_history_source ON conversation_history_items(conversation_id, source_id, position);

-- index conversation_history_watermark on conversation_history_items
CREATE INDEX conversation_history_watermark ON conversation_history_items(conversation_id, sequence);

-- index one_current_agent_conversation_per_task_agent on agent_conversations
CREATE UNIQUE INDEX one_current_agent_conversation_per_task_agent
      ON agent_conversations(task_id, owning_agent_id)
      WHERE retired_at IS NULL;

-- index one_relationship_of_each_type on task_relationships
CREATE UNIQUE INDEX one_relationship_of_each_type
      ON task_relationships(type, source_task_id, target_task_id);

-- index one_running_activation_per_task on activations
CREATE UNIQUE INDEX one_running_activation_per_task
        ON activations(task_id) WHERE status = 'running';

-- index runtime_recovery_activation on runtime_recovery_episodes
CREATE INDEX runtime_recovery_activation ON runtime_recovery_episodes(activation_id, sequence);

-- index runtime_recovery_active_activation on runtime_recovery_episodes
CREATE UNIQUE INDEX runtime_recovery_active_activation ON runtime_recovery_episodes(activation_id) WHERE state = 'waiting';

-- index task_attachments_by_task on task_attachments
CREATE INDEX task_attachments_by_task
        ON task_attachments(task_id);

-- index task_comments_by_task_sequence on task_comments
CREATE INDEX task_comments_by_task_sequence
        ON task_comments(task_id, sequence);

-- index task_comments_current_pins on task_comments
CREATE INDEX task_comments_current_pins ON task_comments(task_id, pinned, sequence);

-- index task_movement_task_sequence on task_movement_metadata
CREATE INDEX task_movement_task_sequence ON task_movement_metadata(task_id, sequence);

-- index task_relationships_by_source on task_relationships
CREATE INDEX task_relationships_by_source
        ON task_relationships(source_task_id);

-- index task_relationships_by_target on task_relationships
CREATE INDEX task_relationships_by_target
        ON task_relationships(target_task_id);

-- index task_timeline_position on task_timeline_records
CREATE INDEX task_timeline_position ON task_timeline_records(task_id, occurred_at DESC, sequence DESC);

-- index task_timeline_record_source on task_timeline_records
CREATE INDEX task_timeline_record_source ON task_timeline_records(task_id, source_id);

-- index task_timeline_source_position on task_timeline_sources
CREATE INDEX task_timeline_source_position ON task_timeline_sources(task_id, record_id, occurred_at DESC, sequence DESC);

-- index task_timeline_task_sequence on task_timeline_records
CREATE INDEX task_timeline_task_sequence ON task_timeline_records(task_id, sequence);

-- trigger activations_start_in_task_order on activations
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

-- trigger addressed_attention_grants_stall_grace on attention_reasons
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

-- trigger attention_resets_stall on attention_reasons
CREATE TRIGGER attention_resets_stall
        AFTER INSERT ON attention_reasons
        BEGIN
          UPDATE task_stall_recovery SET recovery_count = 0 WHERE task_id = NEW.task_id;
        END;

-- trigger conversation_history_activation_bind on activations
CREATE TRIGGER conversation_history_activation_bind AFTER UPDATE OF conversation_id ON activations WHEN OLD.conversation_id IS NULL AND NEW.conversation_id IS NOT NULL BEGIN
        INSERT INTO conversation_history_items(id, conversation_id, position, kind, activation_id, source_id)
          SELECT 'cause:' || NEW.id, NEW.conversation_id, position || '|00000000000000000000|0', 'cause', NEW.id, NEW.source_event_id
          FROM conversation_history_activation_positions WHERE id = NEW.id;
      END;

-- trigger conversation_history_activation_insert on activations
CREATE TRIGGER conversation_history_activation_insert AFTER INSERT ON activations WHEN NEW.conversation_id IS NOT NULL BEGIN
        INSERT INTO conversation_history_items(id, conversation_id, position, kind, activation_id, source_id)
          SELECT 'cause:' || NEW.id, NEW.conversation_id, position || '|00000000000000000000|0', 'cause', NEW.id, NEW.source_event_id
          FROM conversation_history_activation_positions WHERE id = NEW.id;
      END;

-- trigger conversation_history_continuity on attempts
CREATE TRIGGER conversation_history_continuity AFTER UPDATE OF thread_continuity ON attempts WHEN NEW.thread_continuity = 'replaced' BEGIN
        INSERT OR IGNORE INTO conversation_history_items(id, conversation_id, position, kind, activation_id, attempt_id)
          SELECT 'continuity:' || NEW.id, conversation_id, position || '|' || printf('%020d', NEW.rowid) || '|1', 'continuity-loss', NEW.activation_id, NEW.id
          FROM conversation_history_activation_positions WHERE id = NEW.activation_id AND conversation_id IS NOT NULL;
      END;

-- trigger conversation_history_message_delete on agent_conversation_messages
CREATE TRIGGER conversation_history_message_delete AFTER DELETE ON agent_conversation_messages BEGIN
        DELETE FROM conversation_history_items WHERE conversation_id = OLD.conversation_id AND source_id = OLD.id AND kind = 'cause';
      END;

-- trigger conversation_history_resume on activity_ledger
CREATE TRIGGER conversation_history_resume AFTER INSERT ON activity_ledger WHEN NEW.type = 'automation.resumed' BEGIN
        INSERT INTO conversation_history_items(id, conversation_id, position, kind, activation_id, source_id)
          SELECT 'resume:' || id, conversation_id, position, 'resume', activation_id, id FROM conversation_history_resume_positions WHERE id = NEW.id AND conversation_id IS NOT NULL;
      END;

-- trigger conversation_history_retirement on agent_conversations
CREATE TRIGGER conversation_history_retirement AFTER UPDATE OF retired_at ON agent_conversations WHEN OLD.retired_at IS NULL AND NEW.retired_at IS NOT NULL BEGIN
        INSERT INTO conversation_history_items(id, conversation_id, position, kind) VALUES ('retirement:' || NEW.id, NEW.id, NEW.retired_at || '|00000000000000000000|0', 'retirement');
      END;

-- trigger conversation_history_transcript_delete on attempt_transcripts
CREATE TRIGGER conversation_history_transcript_delete AFTER DELETE ON attempt_transcripts BEGIN
        DELETE FROM conversation_history_items WHERE attempt_id = OLD.attempt_id AND kind = 'item';
      END;

-- trigger conversation_history_transcript_insert on attempt_transcripts
CREATE TRIGGER conversation_history_transcript_insert AFTER INSERT ON attempt_transcripts BEGIN
        INSERT INTO conversation_history_items(id, conversation_id, position, kind, activation_id, attempt_id, item_json)
          SELECT 'item:' || attempt.id || ':' || item.key, positions.conversation_id,
            positions.position || '|' || printf('%020d', attempt.rowid) || '|2|' || printf('%020d', item.key),
            'item', attempt.activation_id, attempt.id, item.value
          FROM attempts attempt JOIN conversation_history_activation_positions positions ON positions.id = attempt.activation_id,
          json_each(NEW.items_json) item WHERE attempt.id = NEW.attempt_id AND positions.conversation_id IS NOT NULL
          ON CONFLICT(id) DO UPDATE SET item_json = excluded.item_json;
      END;

-- trigger conversation_history_transcript_update on attempt_transcripts
CREATE TRIGGER conversation_history_transcript_update AFTER UPDATE OF items_json ON attempt_transcripts BEGIN
        INSERT INTO conversation_history_items(id, conversation_id, position, kind, activation_id, attempt_id, item_json)
          SELECT 'item:' || attempt.id || ':' || item.key, positions.conversation_id,
            positions.position || '|' || printf('%020d', attempt.rowid) || '|2|' || printf('%020d', item.key),
            'item', attempt.activation_id, attempt.id, item.value
          FROM attempts attempt JOIN conversation_history_activation_positions positions ON positions.id = attempt.activation_id,
          json_each(NEW.items_json) item WHERE attempt.id = NEW.attempt_id AND positions.conversation_id IS NOT NULL
          ON CONFLICT(id) DO UPDATE SET item_json = excluded.item_json;
      END;

-- trigger dismissed_activation_grants_stall_grace on activity_ledger
CREATE TRIGGER dismissed_activation_grants_stall_grace
        AFTER INSERT ON activity_ledger WHEN NEW.type = 'activation.dismissed'
        BEGIN
          INSERT INTO task_stall_recovery (task_id, grace_until)
          VALUES (NEW.task_id, strftime('%Y-%m-%dT%H:%M:%fZ', NEW.occurred_at, '+60 seconds'))
          ON CONFLICT(task_id) DO UPDATE SET grace_until = excluded.grace_until;
        END;

-- trigger regular_activation_resets_stall on activations
CREATE TRIGGER regular_activation_resets_stall
        AFTER INSERT ON activations WHEN NEW.reason_type <> 'stall-recovery'
        BEGIN
          UPDATE task_stall_recovery SET recovery_count = 0 WHERE task_id = NEW.task_id;
        END;

-- trigger reopened_target_resets_stall on tasks
CREATE TRIGGER reopened_target_resets_stall
        AFTER UPDATE OF column_id ON tasks
        WHEN OLD.column_id = 'completion' AND NEW.column_id <> 'completion'
        BEGIN
          UPDATE task_stall_recovery SET recovery_count = 0 WHERE task_id IN (
            SELECT source_task_id FROM task_relationships WHERE target_task_id = NEW.id
          );
        END;

-- trigger task_movement_insert on activity_ledger
CREATE TRIGGER task_movement_insert AFTER INSERT ON activity_ledger WHEN NEW.type = 'task.moved' BEGIN
        INSERT INTO task_movement_metadata SELECT * FROM task_movement_projection WHERE id = NEW.id;
      END;

-- trigger task_timeline_activity on activity_ledger
CREATE TRIGGER task_timeline_activity AFTER INSERT ON activity_ledger BEGIN
        INSERT INTO task_timeline_sources(task_id, id, record_id, kind, occurred_at)
          SELECT task_id, id, record_id, 'activity', occurred_at FROM task_timeline_activity_positions WHERE id = NEW.id;
        INSERT OR IGNORE INTO task_timeline_records(task_id, id, kind, source_id, occurred_at)
          SELECT task_id, record_id, 'activity', id, occurred_at FROM task_timeline_activity_positions WHERE id = NEW.id AND record_id = 'activity-' || id;
      END;

-- trigger task_timeline_attempt on attempts
CREATE TRIGGER task_timeline_attempt AFTER INSERT ON attempts
        WHEN NOT EXISTS (SELECT 1 FROM activation_dispatch_claims claim WHERE claim.attempt_id = NEW.id) BEGIN
        INSERT OR IGNORE INTO task_timeline_records(task_id, id, kind, source_id, occurred_at)
          SELECT task_id, 'attempt-' || NEW.id, 'attempt', NEW.id, NEW.started_at FROM activations WHERE id = NEW.activation_id;
      END;

-- trigger task_timeline_attempt_claim on activation_dispatch_claims
CREATE TRIGGER task_timeline_attempt_claim AFTER INSERT ON activation_dispatch_claims BEGIN
        DELETE FROM task_timeline_records WHERE id = 'attempt-' || NEW.attempt_id;
      END;

-- trigger task_timeline_attempt_delete on attempts
CREATE TRIGGER task_timeline_attempt_delete AFTER DELETE ON attempts BEGIN
        DELETE FROM task_timeline_records WHERE id = 'attempt-' || OLD.id;
      END;

-- trigger task_timeline_attempt_published on activation_dispatch_claims
CREATE TRIGGER task_timeline_attempt_published AFTER DELETE ON activation_dispatch_claims BEGIN
        INSERT OR IGNORE INTO task_timeline_records(task_id, id, kind, source_id, occurred_at)
          SELECT activation.task_id, 'attempt-' || attempt.id, 'attempt', attempt.id, attempt.started_at
          FROM attempts attempt JOIN activations activation ON activation.id = attempt.activation_id WHERE attempt.id = OLD.attempt_id;
      END;

-- trigger task_timeline_comment on task_comments
CREATE TRIGGER task_timeline_comment AFTER INSERT ON task_comments BEGIN
        INSERT INTO task_timeline_sources(task_id, id, record_id, kind, occurred_at)
          SELECT task_id, id, record_id, 'comment', occurred_at FROM task_timeline_comment_positions WHERE id = NEW.id;
        INSERT OR IGNORE INTO task_timeline_records(task_id, id, kind, source_id, occurred_at)
          SELECT task_id, record_id, 'comment', id, occurred_at FROM task_timeline_comment_positions WHERE id = NEW.id AND record_id = 'comment-' || id;
      END;

-- trigger task_timeline_startup on activation_startup_failures
CREATE TRIGGER task_timeline_startup AFTER INSERT ON activation_startup_failures BEGIN
        INSERT INTO task_timeline_records(task_id, id, kind, source_id, occurred_at)
          SELECT task_id, 'startup-failure-' || NEW.activation_id, 'startup-failure', NEW.activation_id, NEW.occurred_at FROM activations WHERE id = NEW.activation_id;
      END;

-- trigger task_timeline_startup_update on activation_startup_failures
CREATE TRIGGER task_timeline_startup_update AFTER UPDATE ON activation_startup_failures BEGIN
        UPDATE task_timeline_records SET occurred_at = NEW.occurred_at WHERE id = 'startup-failure-' || NEW.activation_id;
      END;

-- trigger unwatched_column_resets_stall on columns
CREATE TRIGGER unwatched_column_resets_stall
        AFTER UPDATE OF watching_agent_id ON columns
        WHEN OLD.watching_agent_id IS NOT NULL AND NEW.watching_agent_id IS NULL
        BEGIN
          UPDATE task_stall_recovery SET recovery_count = 0 WHERE task_id IN (
            SELECT id FROM tasks WHERE board_id = NEW.board_id AND column_id = NEW.id
          );
        END;

-- trigger user_owned_move_resets_stall on tasks
CREATE TRIGGER user_owned_move_resets_stall
        AFTER UPDATE OF column_id ON tasks
        WHEN NEW.column_id = 'completion' OR EXISTS (
          SELECT 1 FROM columns WHERE board_id = NEW.board_id AND id = NEW.column_id
            AND watching_agent_id IS NULL
        )
        BEGIN
          UPDATE task_stall_recovery SET recovery_count = 0 WHERE task_id = NEW.id;
        END;

-- trigger waiting_relationship_resets_stall on task_relationships
CREATE TRIGGER waiting_relationship_resets_stall
        AFTER INSERT ON task_relationships
        WHEN (SELECT column_id FROM tasks WHERE id = NEW.target_task_id) <> 'completion'
        BEGIN
          UPDATE task_stall_recovery SET recovery_count = 0 WHERE task_id = NEW.source_task_id;
        END;

-- view agent_inspectable_tasks on agent_inspectable_tasks
CREATE VIEW agent_inspectable_tasks AS
      SELECT task.id
      FROM tasks task
      JOIN boards board ON board.id = task.board_id
      JOIN columns column ON column.board_id = task.board_id AND column.id = task.column_id
      WHERE task.archived_at IS NULL
        AND ((board.applied = 1 AND column.applied = 1) OR task.column_id = 'completion');

-- view conversation_history_activation_positions on conversation_history_activation_positions
CREATE VIEW conversation_history_activation_positions AS
        SELECT activation.id, activation.conversation_id,
          coalesce(message.occurred_at, comment.occurred_at, activity.occurred_at, activation.created_at)
          || '|' || printf('%020d', activation.sequence) AS position
        FROM activations activation
        LEFT JOIN agent_conversation_messages message ON message.id = activation.source_event_id AND activation.reason_type = 'user-follow-up'
        LEFT JOIN task_comments comment ON comment.id = activation.source_event_id AND activation.reason_type <> 'user-follow-up'
        LEFT JOIN activity_ledger activity ON activity.id = activation.source_event_id AND activation.reason_type <> 'user-follow-up';

-- view conversation_history_resume_positions on conversation_history_resume_positions
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

-- view mapped_tasks on mapped_tasks
CREATE VIEW mapped_tasks AS
      SELECT task.id
      FROM tasks task
      JOIN boards board ON board.id = task.board_id AND board.applied = 1
      JOIN columns column
        ON column.board_id = task.board_id AND column.id = task.column_id AND column.applied = 1
      WHERE task.archived_at IS NULL;

-- view task_movement_projection on task_movement_projection
CREATE VIEW task_movement_projection AS
        SELECT activity.sequence, activity.task_id, activity.id, position.record_id, activity.occurred_at, activity.actor_kind, activity.actor_id,
          json_object('fromColumnId', json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.fromColumnId'),
            'toColumnId', json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.toColumnId'),
            'fromColumnName', coalesce(json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.fromColumnName'), json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.fromColumnId')),
            'toColumnName', coalesce(json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.toColumnName'), json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.toColumnId')),
            'actorName', coalesce(json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.actorName'), activity.actor_id)) AS details_json
        FROM activity_ledger activity JOIN task_timeline_activity_positions position ON position.id = activity.id WHERE activity.type = 'task.moved';

-- view task_timeline_activity_positions on task_timeline_activity_positions
CREATE VIEW task_timeline_activity_positions AS
        SELECT activity.task_id, activity.id, activity.occurred_at,
          CASE WHEN EXISTS (SELECT 1 FROM attempts attempt JOIN activations activation ON activation.id = attempt.activation_id
            WHERE attempt.id = json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.attemptId') AND activation.task_id = activity.task_id)
          THEN 'attempt-' || json_extract(CASE WHEN json_valid(activity.details_json) THEN activity.details_json ELSE '{}' END, '$.attemptId') ELSE 'activity-' || activity.id END AS record_id
        FROM activity_ledger activity WHERE activity.type NOT IN ('activation.created', 'attempt.started', 'attempt.completed', 'attention.created');

-- view task_timeline_comment_positions on task_timeline_comment_positions
CREATE VIEW task_timeline_comment_positions AS
        SELECT comment.task_id, comment.id, comment.occurred_at,
          CASE WHEN EXISTS (SELECT 1 FROM attempts attempt JOIN activations activation ON activation.id = attempt.activation_id
            WHERE attempt.id = comment.attempt_id AND activation.task_id = comment.task_id)
          THEN 'attempt-' || comment.attempt_id ELSE 'comment-' || comment.id END AS record_id
        FROM task_comments comment;
