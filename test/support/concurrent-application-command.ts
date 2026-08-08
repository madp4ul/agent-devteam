import { parentPort, workerData } from "node:worker_threads";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import {
  READY_COUNT_INDEX,
  RELEASE_INDEX,
  type ConcurrentApplicationOperation,
} from "./concurrent-application-operation.ts";

const input = workerData as {
  processDefinitionPath: string;
  databasePath: string;
  barrier: SharedArrayBuffer;
  operation: ConcurrentApplicationOperation;
};
const application = await CoordinationApplication.start({
  processDefinitionPath: input.processDefinitionPath,
  databasePath: input.databasePath,
});
const barrier = new Int32Array(input.barrier);
Atomics.add(barrier, READY_COUNT_INDEX, 1);
Atomics.notify(barrier, READY_COUNT_INDEX);
Atomics.wait(barrier, RELEASE_INDEX, 0);
try {
  const result = execute(input.operation);
  parentPort?.postMessage({ type: "result", result });
} finally {
  application.close();
}

function execute(operation: ConcurrentApplicationOperation) {
  switch (operation.method) {
    case "moveTask":
      return application.moveTask(operation.command);
    case "editTask":
      return application.editTask(operation.command);
    case "addTaskComment":
      return application.addTaskComment(operation.command);
    case "createTaskRelationship":
      return application.createTaskRelationship(operation.command);
  }
}
