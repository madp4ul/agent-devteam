import { CoordinationDatabase } from "./coordination-database.ts";
import { TaskCommandStore } from "./task-command-store.ts";
import { TaskProjectionStore } from "./task-projection-store.ts";
import { ProcessStateStore } from "./process-state-store.ts";
import { AutomationStateStore } from "./automation-state-store.ts";
import { IdempotentCommandExecutor } from "./idempotent-command-executor.ts";
import { TaskArchiveStore } from "./task-archive-store.ts";
import { NotificationStore } from "./notification-store.ts";
import { ActivityJournal } from "./activity-journal.ts";
import { AttentionRecorder } from "./attention-recorder.ts";
import { ConversationProjectionModule } from "./conversation-projection-module.ts";
import { ConversationCommandModule } from "./conversation-command-module.ts";
import { ConversationContextDeliveryModule } from "./conversation-context-delivery-module.ts";
import type { AttemptTranscriptAccess } from "../runtime-contract.ts";

export interface CoordinationPersistence {
  process: ProcessStateStore;
  taskCommands: TaskCommandStore;
  taskProjections: TaskProjectionStore;
  conversationProjections: ConversationProjectionModule;
  conversationCommands: ConversationCommandModule;
  conversationContextDelivery: ConversationContextDeliveryModule;
  automation: AutomationStateStore;
  taskArchive: TaskArchiveStore;
  notifications: NotificationStore;
  close(): void;
}

export function openCoordinationPersistence(
  path: string,
  transcriptAccess?: AttemptTranscriptAccess,
): CoordinationPersistence {
  const database = CoordinationDatabase.open(path);
  const taskProjections = new TaskProjectionStore(database);
  const idempotentCommands = new IdempotentCommandExecutor(database);
  const notifications = new NotificationStore(database);
  const activityJournal = new ActivityJournal(database.connection);
  const attentionRecorder = new AttentionRecorder(
    database.connection,
    activityJournal,
    notifications,
  );
  const conversationProjections = new ConversationProjectionModule(
    database,
    taskProjections,
    transcriptAccess,
  );
  const conversationCommands = new ConversationCommandModule(
    database,
    idempotentCommands,
    activityJournal,
  );
  return {
    process: new ProcessStateStore(database),
    taskCommands: new TaskCommandStore(
      database,
      taskProjections,
      idempotentCommands,
      notifications,
      activityJournal,
      attentionRecorder,
    ),
    taskProjections,
    conversationProjections,
    conversationCommands,
    conversationContextDelivery: new ConversationContextDeliveryModule(database),
    automation: new AutomationStateStore(
      database,
      taskProjections,
      conversationProjections,
      idempotentCommands,
      activityJournal,
      attentionRecorder,
    ),
    taskArchive: new TaskArchiveStore(database, taskProjections, idempotentCommands, activityJournal),
    notifications,
    close: () => database.close(),
  };
}
