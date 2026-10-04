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
          'conversation.continued', 'conversation.retired', 'task.archived', 'task.unarchived', 'stall.detected', 'stall.recovery-skipped', 'stall.recovery-exhausted'
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
    );

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
    );

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

-- index task_attachments_by_task on task_attachments
CREATE INDEX task_attachments_by_task
        ON task_attachments(task_id);

-- index task_comments_by_task_sequence on task_comments
CREATE INDEX task_comments_by_task_sequence
        ON task_comments(task_id, sequence);

-- index task_relationships_by_source on task_relationships
CREATE INDEX task_relationships_by_source
        ON task_relationships(source_task_id);

-- index task_relationships_by_target on task_relationships
CREATE INDEX task_relationships_by_target
        ON task_relationships(target_task_id);

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

-- view mapped_tasks on mapped_tasks
CREATE VIEW mapped_tasks AS
      SELECT task.id
      FROM tasks task
      JOIN boards board ON board.id = task.board_id AND board.applied = 1
      JOIN columns column
        ON column.board_id = task.board_id AND column.id = task.column_id AND column.applied = 1
      WHERE task.archived_at IS NULL;
