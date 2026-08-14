import { CoordinationDatabase } from "./coordination-database.ts";
import { TaskCommandStore } from "./task-command-store.ts";
import { TaskProjectionStore } from "./task-projection-store.ts";
import { ProcessStateStore } from "./process-state-store.ts";
import { AutomationStateStore } from "./automation-state-store.ts";
import { CommandResponseStore } from "./command-response-store.ts";
import { TaskArchiveStore } from "./task-archive-store.ts";
import { NotificationStore } from "./notification-store.ts";

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
  return {
    process: new ProcessStateStore(database),
    taskCommands: new TaskCommandStore(database, taskProjections, commandResponses, notifications),
    taskProjections,
    automation: new AutomationStateStore(database, taskProjections, commandResponses, notifications),
    taskArchive: new TaskArchiveStore(database, taskProjections, commandResponses),
    notifications,
    close: () => database.close(),
  };
}
