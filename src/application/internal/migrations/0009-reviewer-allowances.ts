import type { CoordinationMigration } from "../coordination-database.ts";

export const reviewerAllowancesMigration: CoordinationMigration = {
  id: "0009_reviewer_allowances",
  apply(database) {
    database.exec(`
      ALTER TABLE agents ADD COLUMN allowances_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE attempts ADD COLUMN reviewer_allowances_json TEXT;
    `);
  },
};
