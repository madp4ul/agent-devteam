-- Immutable representative data for released migration 0001_initial_released_schema.
-- Add a new fixture for a future released schema; never rewrite this fixture to
-- resemble a later release.
BEGIN IMMEDIATE;
INSERT INTO agents VALUES ('released-agent', 'Released Agent', 'Preserve state', 'Fixture agent', 'released.md', 'Preserve retained state.', 'gpt-test', 'high', 0);
INSERT INTO task_numbers(number) VALUES (1), (2);
INSERT INTO tasks(id, sequence, board_id, column_id, title, description, revision) VALUES
  ('released-task', 1, 'delivery', 'backlog', 'Retained released task', 'Representative retained description', 1),
  ('released-related', 2, 'delivery', 'backlog', 'Retained related task', 'Relationship target', 1);
INSERT INTO task_starting_refs VALUES ('released-task', 'main');
INSERT INTO task_workspaces VALUES ('released-task', 'D:/retained/workspace', 'main', '0123456789abcdef');
INSERT INTO activity_ledger(id, task_id, type, actor_kind, actor_id, occurred_at, details_json)
  VALUES ('released-activity', 'released-task', 'task.created', 'user', 'user', '2026-01-01T00:00:00.000Z', '{}');
INSERT INTO activations(id, task_id, target_agent_id, reason_type, source_event_id, status, created_at, definition_version)
  SELECT 'released-activation', 'released-task', 'released-agent', 'column-entry', 'released-activity', 'completed', '2026-01-01T00:01:00.000Z', definition_version FROM runtime;
INSERT INTO activation_contexts VALUES ('released-activation', '{"fixture":true}');
INSERT INTO agent_conversations(id, task_id, owning_agent_id, owning_agent_name_snapshot, generated_label, originating_activation_id, current_thread_id, created_at, latest_activity_at, latest_activity_sequence, delivered_description, delivered_comment_sequence, delivered_activity_sequence)
  VALUES ('released-conversation', 'released-task', 'released-agent', 'Released Agent', 'Released conversation', 'released-activation', 'thread-released', '2026-01-01T00:01:00.000Z', '2026-01-01T00:03:00.000Z', 1, 'Representative retained description', 1, 1);
UPDATE activations SET conversation_id = 'released-conversation' WHERE id = 'released-activation';
INSERT INTO agent_conversation_messages VALUES ('released-message', 'released-conversation', 'released-task', 'Retained follow-up', 'user', 'user', '2026-01-01T00:02:00.000Z');
INSERT INTO conversation_attachments VALUES ('released-conversation-attachment', 'released-task', 'released-conversation', 'released-message', 'evidence.txt', 'text/plain', 17, 0);
INSERT INTO attempts(id, activation_id, status, workspace_path, started_at, completed_at, outcome_status, outcome_summary, thread_id, model, reasoning_effort, pricing_json, context_window_usage_json, outcome_kind)
  VALUES ('released-attempt', 'released-activation', 'completed', 'D:/retained/workspace', '2026-01-01T00:01:00.000Z', '2026-01-01T00:03:00.000Z', 'completed', 'Retained result', 'thread-released', 'gpt-test', 'high', '{"currency":"USD","amount":0.25}', '{"usedTokens":100,"contextWindowTokens":1000,"usedPercent":10}', 'completed');
INSERT INTO attempt_transcripts VALUES ('released-attempt', '[{"kind":"message","role":"agent","text":"Retained transcript"}]', '{"inputTokens":10}', '{"inputTokens":10}');
INSERT INTO task_comments(id, task_id, body, actor_kind, actor_id, occurred_at, attempt_id)
  VALUES ('released-comment', 'released-task', 'Retained comment', 'agent', 'released-agent', '2026-01-01T00:03:00.000Z', 'released-attempt');
INSERT INTO task_relationships VALUES ('released-relationship', 'dependency', 'released-task', 'released-related');
INSERT INTO task_attachments VALUES ('released-task-attachment', 'released-task', 'brief.md', 'text/markdown', 42);
COMMIT;
