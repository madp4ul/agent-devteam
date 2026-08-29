CREATE VIEW task_activation_summary AS
SELECT task.id AS task_id, task.title, COUNT(activation.id) AS activation_count
FROM tasks task
LEFT JOIN activations activation ON activation.task_id = task.id
GROUP BY task.id, task.title;
--> statement-breakpoint
CREATE TRIGGER bump_task_revision_after_activation
AFTER INSERT ON activations
BEGIN
  UPDATE tasks SET revision = revision + 1 WHERE id = NEW.task_id;
END;
