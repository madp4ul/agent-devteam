import { initialReleasedMigration } from "./0001-initial-released-schema.ts";
import { boundTaskDetailLookupsMigration } from "./0002-bound-task-detail-lookups.ts";
import { relationshipResumeOwnersMigration } from "./0003-relationship-resume-owners.ts";
import { crossTaskCommentProvenanceMigration } from "./0004-cross-task-comment-provenance.ts";
import { sharedCommentPinsMigration } from "./0005-shared-comment-pins.ts";
import { historyCursorSigningMigration } from "./0006-history-cursor-signing.ts";
import { conversationPinCheckpointsMigration } from "./0007-conversation-pin-checkpoints.ts";

export const coordinationMigrations = [
  initialReleasedMigration,
  boundTaskDetailLookupsMigration,
  relationshipResumeOwnersMigration,
  crossTaskCommentProvenanceMigration,
  sharedCommentPinsMigration,
  historyCursorSigningMigration,
  conversationPinCheckpointsMigration,
] as const;
