import { CoordinationDatabase } from "./coordination-database.ts";
import { TaskCommandStore } from "./task-command-store.ts";
import { TaskProjectionStore } from "./task-projection-store.ts";
import { ProcessStateStore } from "./process-state-store.ts";
import { AutomationStateStore } from "./automation-state-store.ts";
import { CommandResponseStore } from "./command-response-store.ts";
import { TaskArchiveStore } from "./task-archive-store.ts";
import { NotificationStore } from "./notification-store.ts";
import { ActivityJournal } from "./activity-journal.ts";
import { AttentionRecorder } from "./attention-recorder.ts";

export interface CoordinationPersistence {
  process: ProcessStateStore;
  taskCommands: TaskCommandStore;
  taskProjections: TaskProjectionStore;
  automation: AutomationStateStore;
  taskArchive: TaskArchiveStore;
  notifications: NotificationStore;
  close(): void;
}

export function openCoordinationPersistence(path: string): CoordinationPersistence {
  const database = CoordinationDatabase.open(path);
  const taskProjections = new TaskProjectionStore(database);
  const commandResponses = new CommandResponseStore(database);
  const notifications = new NotificationStore(database);
  const activityJournal = new ActivityJournal(database.connection);
  const attentionRecorder = new AttentionRecorder(
    database.connection,
    activityJournal,
    notifications,
  );
  return {
    process: new ProcessStateStore(database),
    taskCommands: new TaskCommandStore(
      database,
      taskProjections,
      commandResponses,
      notifications,
      activityJournal,
      attentionRecorder,
    ),
    taskProjections,
    automation: new AutomationStateStore(
      database,
      taskProjections,
      commandResponses,
      activityJournal,
      attentionRecorder,
    ),
    taskArchive: new TaskArchiveStore(database, taskProjections, commandResponses, activityJournal),
    notifications,
    close: () => database.close(),
  };
}
