import type { DatabaseSync } from "node:sqlite";

// Creation and lifecycle receipts survive expiry: replaying them must not create
// another task, repeat archival, or revive an archived task through an old retry.
const durableReceiptKinds = new Set([
  "create-task", "create-child-task", "archive-task", "unarchive-task", "archive-completed-tasks",
]);

/** Called inside the archival transaction, or an exclusive offline maintenance transaction. */
export function forgetTaskCommandResponses(database: DatabaseSync, taskIds: ReadonlySet<string>): number {
  // Read only keys through the covering primary-key index. Loading response_json
  // here would scan gigabytes of historical snapshots on every task archival.
  const keys = database.prepare("SELECT DISTINCT command_type FROM command_responses ORDER BY command_type")
    .all() as Array<{ command_type: string }>;
  const remove = database.prepare("DELETE FROM command_responses WHERE command_type = ?");
  let removed = 0;
  for (const { command_type: key } of keys) {
    const owner = commandOwner(key);
    if (owner !== undefined && !durableReceiptKinds.has(owner.kind) && taskIds.has(owner.taskId)) {
      removed += Number(remove.run(key).changes);
    }
  }
  return removed;
}

function commandOwner(key: string): { kind: string; taskId: string } | undefined {
  if (!key.startsWith("[")) {
    const [kind, taskId] = key.split(":");
    return kind && taskId ? { kind, taskId } : undefined;
  }
  try {
    const identity: unknown = JSON.parse(key);
    if (!Array.isArray(identity) || typeof identity[0] !== "string") return undefined;
    const [kind, caller, scope] = identity as unknown[];
    // Cross-task commands belong to their caller's task, not the destination.
    const taskId = Array.isArray(scope) ? scope[0] : Array.isArray(caller) ? caller[2] : undefined;
    return typeof taskId === "string" && taskId.length > 0 ? { kind: kind as string, taskId } : undefined;
  } catch {
    // Unknown keys and unscoped receipts have no proven owner; retain them.
    return undefined;
  }
}
