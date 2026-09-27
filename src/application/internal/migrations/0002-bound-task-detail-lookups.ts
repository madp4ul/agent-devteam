import type { DatabaseSync } from "node:sqlite";

export const boundTaskDetailLookupsMigration = {
  id: "0002_bound_task_detail_lookups",
  apply(database: DatabaseSync): void {
    database.exec(`
      CREATE INDEX activity_ledger_by_task_sequence
        ON activity_ledger(task_id, sequence);
      CREATE INDEX task_comments_by_task_sequence
        ON task_comments(task_id, sequence);
      CREATE INDEX activations_by_task_sequence
        ON activations(task_id, sequence);
      CREATE INDEX attempts_by_activation
        ON attempts(activation_id);
      CREATE INDEX task_relationships_by_source
        ON task_relationships(source_task_id);
      CREATE INDEX task_relationships_by_target
        ON task_relationships(target_task_id);
      CREATE INDEX attention_reasons_by_task_resolution
        ON attention_reasons(task_id, resolved_at);
      CREATE INDEX task_attachments_by_task
        ON task_attachments(task_id);
    `);
  },
} as const;
