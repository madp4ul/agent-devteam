import { CoordinationDatabase } from "./coordination-database.ts";
import { TaskCommandStore } from "./task-command-store.ts";
import { TaskProjectionStore } from "./task-projection-store.ts";
import { ProcessStateStore } from "./process-state-store.ts";
import { AutomationStateStore } from "./automation-state-store.ts";
import { CommandResponseStore } from "./command-response-store.ts";

export interface CoordinationPersistence {
  process: ProcessStateStore;
  taskCommands: TaskCommandStore;
  taskProjections: TaskProjectionStore;
  automation: AutomationStateStore;
  close(): void;
}

export function openCoordinationPersistence(path: string): CoordinationPersistence {
  const database = CoordinationDatabase.open(path);
  const taskProjections = new TaskProjectionStore(database);
  const commandResponses = new CommandResponseStore(database);
  return {
    process: new ProcessStateStore(database),
    taskCommands: new TaskCommandStore(database, taskProjections, commandResponses),
    taskProjections,
    automation: new AutomationStateStore(database, taskProjections, commandResponses),
    close: () => database.close(),
  };
}
