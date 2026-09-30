import type { DatabaseSync } from "node:sqlite";

export const crossTaskCommentProvenanceMigration = {
  id: "0004_cross_task_comment_provenance",
  apply(database: DatabaseSync): void {
    database.exec(`
      ALTER TABLE task_comments ADD COLUMN origin_task_id TEXT;
      ALTER TABLE task_comments ADD COLUMN origin_task_title TEXT;
      UPDATE task_comments SET
        origin_task_id = (
          SELECT activation.task_id FROM attempts attempt
          JOIN activations activation ON activation.id = attempt.activation_id
          WHERE attempt.id = task_comments.attempt_id
            AND activation.target_agent_id = task_comments.actor_id
        )
      WHERE actor_kind = 'agent';
      UPDATE task_comments SET origin_task_title = (
        SELECT title FROM tasks WHERE id = task_comments.origin_task_id
      );
      ALTER TABLE command_responses ADD COLUMN request_json TEXT;
    `);
  },
} as const;
