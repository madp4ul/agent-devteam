import { CoordinationDatabase } from "./coordination-database.ts";
import { CoordinationTaskStore } from "./coordination-store.ts";
import { ProcessStateStore } from "./process-state-store.ts";
import { AutomationStateStore } from "./automation-state-store.ts";

export interface CoordinationPersistence {
  process: ProcessStateStore;
  tasks: CoordinationTaskStore;
  automation: AutomationStateStore;
  close(): void;
}

export function openCoordinationPersistence(path: string): CoordinationPersistence {
  const database = CoordinationDatabase.open(path);
  const tasks = new CoordinationTaskStore(database);
  return {
    process: new ProcessStateStore(database),
    tasks,
    automation: new AutomationStateStore(database, tasks),
    close: () => database.close(),
  };
}
