import assert from "node:assert/strict";
import type { CoordinationApplication } from "../../src/application/coordination-application.ts";

/** Read task content/history through its authoritative application query seam. */
export function readTask(application: CoordinationApplication, taskId: string) {
  const result = application.queryTask(taskId);
  assert.ok(result.available, `Task ${taskId} must remain queryable`);
  return result.task;
}
