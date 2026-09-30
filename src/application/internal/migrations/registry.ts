import { initialReleasedMigration } from "./0001-initial-released-schema.ts";
import { boundTaskDetailLookupsMigration } from "./0002-bound-task-detail-lookups.ts";
import { relationshipResumeOwnersMigration } from "./0003-relationship-resume-owners.ts";
import { crossTaskCommentProvenanceMigration } from "./0004-cross-task-comment-provenance.ts";

export const coordinationMigrations = [
  initialReleasedMigration,
  boundTaskDetailLookupsMigration,
  relationshipResumeOwnersMigration,
  crossTaskCommentProvenanceMigration,
] as const;
