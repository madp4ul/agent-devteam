import { initialReleasedMigration } from "./0001-initial-released-schema.ts";
import { boundTaskDetailLookupsMigration } from "./0002-bound-task-detail-lookups.ts";

export const coordinationMigrations = [
  initialReleasedMigration,
  boundTaskDetailLookupsMigration,
] as const;
