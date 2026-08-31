import {
  CoordinationDatabase,
  type CoordinationDatabaseOpenOptions,
} from "./coordination-database.ts";
import { TaskCommandStore } from "./task-command-store.ts";
import { TaskProjectionStore } from "./task-projection-store.ts";
import { ProcessStateStore } from "./process-state-store.ts";
import { ActiveAttemptModule } from "./active-attempt-module.ts";
import { IdempotentCommandExecutor } from "./idempotent-command-executor.ts";
import { TaskArchiveStore } from "./task-archive-store.ts";
import { NotificationStore } from "./notification-store.ts";
import { ActivityJournal } from "./activity-journal.ts";
import { AttentionRecorder } from "./attention-recorder.ts";
import { ConversationProjectionModule } from "./conversation-projection-module.ts";
import { ConversationCommandModule } from "./conversation-command-module.ts";
import { ConversationContextDeliveryModule } from "./conversation-context-delivery-module.ts";
import { ActivationCreationModule } from "./activation-creation-module.ts";
import { ConversationAttachmentStore } from "./conversation-attachment-store.ts";
import { ActivationResolutionModule } from "./activation-resolution-module.ts";
import type { AttemptTranscriptAccess } from "../runtime-contract.ts";
import { AttemptEvidenceModule } from "./attempt-evidence-module.ts";
import { ActivationSchedulingModule } from "./activation-scheduling-module.ts";

export interface CoordinationPersistence {
  process: ProcessStateStore;
  activationScheduling: ActivationSchedulingModule;
  activationResolutions: ActivationResolutionModule;
  taskCommands: TaskCommandStore;
  taskProjections: TaskProjectionStore;
  conversationProjections: ConversationProjectionModule;
  conversationCommands: ConversationCommandModule;
  conversationAttachments: ConversationAttachmentStore;
  conversationContextDelivery: ConversationContextDeliveryModule;
  activeAttempts: ActiveAttemptModule;
  taskArchive: TaskArchiveStore;
  notifications: NotificationStore;
  close(): void;
}

export async function openCoordinationPersistence(
  path: string,
  transcriptAccess?: AttemptTranscriptAccess,
): Promise<CoordinationPersistence> {
  const database = await CoordinationDatabase.open(path);
  return composeCoordinationPersistence(database, path, transcriptAccess);
}

/** @internal Test harness for migration startup scenarios not yet in the production registry. */
export async function openCoordinationPersistenceForMigrationTest(
  path: string,
  databaseOptions: CoordinationDatabaseOpenOptions,
  transcriptAccess?: AttemptTranscriptAccess,
): Promise<CoordinationPersistence> {
  const database = await CoordinationDatabase.openForMigrationTest(path, databaseOptions);
  return composeCoordinationPersistence(database, path, transcriptAccess);
}

export function openEphemeralCoordinationPersistence(
  transcriptAccess?: AttemptTranscriptAccess,
): CoordinationPersistence {
  return composeCoordinationPersistence(
    CoordinationDatabase.openEphemeral(),
    ":memory:",
    transcriptAccess,
  );
}

function composeCoordinationPersistence(
  database: CoordinationDatabase,
  path: string,
  transcriptAccess?: AttemptTranscriptAccess,
): CoordinationPersistence {
  const conversationAttachments = new ConversationAttachmentStore(database, path);
  const taskProjections = new TaskProjectionStore(database);
  const idempotentCommands = new IdempotentCommandExecutor(database);
  const notifications = new NotificationStore(database);
  const activityJournal = new ActivityJournal(database.connection);
  const activationCreation = new ActivationCreationModule(database, activityJournal);
  const attentionRecorder = new AttentionRecorder(
    database.connection,
    activityJournal,
    notifications,
  );
  const attemptEvidence = new AttemptEvidenceModule(database);
  const activationResolutions = new ActivationResolutionModule(
    database,
    idempotentCommands,
    activityJournal,
  );
  const conversationProjections = new ConversationProjectionModule(
    database,
    taskProjections,
    conversationAttachments,
    transcriptAccess,
  );
  const conversationCommands = new ConversationCommandModule(
    database,
    idempotentCommands,
    activityJournal,
    activationCreation,
    conversationAttachments,
  );
  const activationScheduling = new ActivationSchedulingModule(
    database,
    taskProjections,
    conversationProjections,
    activityJournal,
    attentionRecorder,
  );
  return {
    process: new ProcessStateStore(database),
    activationScheduling,
    activationResolutions,
    taskCommands: new TaskCommandStore(
      database,
      taskProjections,
      idempotentCommands,
      notifications,
      activityJournal,
      attentionRecorder,
      activationCreation,
    ),
    taskProjections,
    conversationProjections,
    conversationCommands,
    conversationAttachments,
    conversationContextDelivery: new ConversationContextDeliveryModule(database),
    activeAttempts: new ActiveAttemptModule(
      database,
      idempotentCommands,
      activityJournal,
      attentionRecorder,
      attemptEvidence,
    ),
    taskArchive: new TaskArchiveStore(
      database,
      taskProjections,
      idempotentCommands,
      activityJournal,
      conversationAttachments,
      conversationProjections,
    ),
    notifications,
    close: () => {
      conversationAttachments.close();
      database.close();
    },
  };
}
