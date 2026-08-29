CREATE TRIGGER bump_task_revision_after_activation
AFTER INSERT ON activations
BEGIN
  UPDATE tasks SET revision = revision + 1 WHERE id = NEW.task_id;
END;
