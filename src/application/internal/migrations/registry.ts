import { initialReleasedMigration } from "./0001-initial-released-schema.ts";
import { boundTaskDetailLookupsMigration } from "./0002-bound-task-detail-lookups.ts";
import { relationshipResumeOwnersMigration } from "./0003-relationship-resume-owners.ts";
import { crossTaskCommentProvenanceMigration } from "./0004-cross-task-comment-provenance.ts";
import { sharedCommentPinsMigration } from "./0005-shared-comment-pins.ts";
import { historyCursorSigningMigration } from "./0006-history-cursor-signing.ts";
import { conversationPinCheckpointsMigration } from "./0007-conversation-pin-checkpoints.ts";
import { stallRecoveryMigration } from "./0008-stall-recovery.ts";
import { reviewerAllowancesMigration } from "./0009-reviewer-allowances.ts";
import { conversationHistoryItemsMigration } from "./0010-conversation-history-items.ts";
import { taskTimelineMigration } from "./0011-task-timeline.ts";
import { runtimeRecoveryMigration } from "./0012-runtime-recovery.ts";
import { canonicalHumanIdentityMigration } from "./0013-canonical-human-identity.ts";

export const coordinationMigrations = [
  initialReleasedMigration,
  boundTaskDetailLookupsMigration,
  relationshipResumeOwnersMigration,
  crossTaskCommentProvenanceMigration,
  sharedCommentPinsMigration,
  historyCursorSigningMigration,
  conversationPinCheckpointsMigration,
  stallRecoveryMigration,
  reviewerAllowancesMigration,
  conversationHistoryItemsMigration,
  taskTimelineMigration,
  runtimeRecoveryMigration,
  canonicalHumanIdentityMigration,
] as const;
