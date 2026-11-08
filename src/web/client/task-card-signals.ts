import type { TaskOverviewView } from "../../application/browser-transport-contract.ts";

/** The visible card signals also keep a collapsed board column discoverable. */
export function taskCardSignals(task: TaskOverviewView) {
  return {
    archived: task.archived === true,
    waiting: task.waitingOn.taskIds.length > 0,
    attention: task.unresolvedAttention.length > 0,
    queued: task.run.queuedActivationCount > 0,
    failed: task.run.failedActivationCount > 0,
    preparing: task.workspacePreparation !== undefined,
    active: task.workspacePreparation === undefined && task.run.activeAgentId !== null,
    startupFailure: task.startupFailure,
  };
}
