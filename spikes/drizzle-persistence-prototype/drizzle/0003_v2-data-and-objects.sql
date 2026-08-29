UPDATE tasks
SET category = CASE
  WHEN json_extract(metadata_json, '$.priority') = 'high' THEN 'urgent'
  ELSE 'general'
END;
--> statement-breakpoint
CREATE TRIGGER bump_task_revision_after_activation
AFTER INSERT ON activations
BEGIN
  UPDATE tasks SET revision = revision + 1 WHERE id = NEW.task_id;
END;
