import { useEffect, useState } from "react";
import type { ArchivalOperation, ArchivalTarget } from "../../application/archival-operation-contract.ts";
import { ApiError, readArchivalOperation, readArchivalOperations, startArchivalOperation } from "./api.ts";
import { useLatestRefresh, usePolling } from "./live-refresh.ts";

const wait = () => new Promise<void>((resolve) => window.setTimeout(resolve, 350));
const terminal = (operation: ArchivalOperation) => operation.state === "completed" || operation.state === "interrupted";

export function useArchivalOperations(taskId?: string) {
  const [operations, setOperations] = useState<ArchivalOperation[]>([]);
  const refresh = useLatestRefresh(() => readArchivalOperations(taskId, true), (next) => {
    setOperations((current) => current.length === next.length && current.every((operation, index) => {
      const candidate = next[index];
      return operation.id === candidate?.id && operation.updatedAt === candidate.updatedAt &&
        operation.feedbackDismissed === candidate.feedbackDismissed;
    }) ? current : next);
  });
  useEffect(() => { void refresh().catch(() => {}); }, [refresh]);
  usePolling(refresh, 700, () => {});
  return operations;
}

export function archivalRequestIdentity(target: string): string {
  try {
    const key = `archival-request:${target}`;
    const prior = sessionStorage.getItem(key);
    if (prior) return prior;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch { return crypto.randomUUID(); }
}

export function forgetArchivalRequest(target: string): void {
  try { sessionStorage.removeItem(`archival-request:${target}`); } catch { /* Storage can be unavailable. */ }
}

export async function submitArchival(target: ArchivalTarget, id: string, discard = false, token?: string): Promise<ArchivalOperation> {
  try {
    return (await startArchivalOperation(target, id, discard, token)).operation;
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) throw error;
    let operation: ArchivalOperation | undefined;
    try { operation = await readArchivalOperation(id); }
    catch { throw new Error("Archival acceptance is unknown. Check operation feedback before submitting again.", { cause: error }); }
    if (operation) return operation;
    // A response can race the lookup. Submit the same identity, never a new deletion command.
    return (await startArchivalOperation(target, id, discard, token)).operation;
  }
}

export async function waitForArchival(operation: ArchivalOperation): Promise<ArchivalOperation> {
  while (!terminal(operation)) {
    await wait();
    let current: ArchivalOperation | undefined;
    try { current = await readArchivalOperation(operation.id); }
    catch { throw new Error("Archival was accepted. Its outcome is currently unavailable; check operation feedback before retrying."); }
    if (!current) throw new Error("Archival was accepted, but its operation record is unavailable.");
    operation = current;
  }
  return operation;
}

/** A terminal failure already retained in the archival menu, rather than a transport rejection. */
export class ArchivalOutcomeError extends ApiError {}

export async function archiveTaskWithProgress(taskId: string, id: string, discard = false, token?: string): Promise<void> {
  const operation = await waitForArchival(await submitArchival({ kind: "task", taskId }, id, discard, token));
  const task = operation.tasks[0];
  if (task?.state !== "archived") throw new ArchivalOutcomeError(409, task?.failure ?? { reason: "interrupted" });
}
