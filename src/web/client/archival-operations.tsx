import { useCallback, useEffect, useState } from "react";
import type { ArchivalOperation, ArchivalTarget } from "../../application/archival-operation-contract.ts";
import { ApiError, dismissArchivalOperation, readArchivalOperation, readArchivalOperations, startArchivalOperation } from "./api.ts";
import { errorMessage } from "./feedback.ts";
import { useLatestRefresh, usePolling } from "./live-refresh.ts";

const wait = () => new Promise<void>((resolve) => window.setTimeout(resolve, 350));
const terminal = (operation: ArchivalOperation) => operation.state === "completed" || operation.state === "interrupted";

export function useArchivalOperations(taskId?: string) {
  const [operations, setOperations] = useState<ArchivalOperation[]>([]);
  const refresh = useLatestRefresh(() => readArchivalOperations(taskId), (next) => {
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

export async function archiveTaskWithProgress(taskId: string, id: string, discard = false, token?: string): Promise<void> {
  const operation = await waitForArchival(await submitArchival({ kind: "task", taskId }, id, discard, token));
  const task = operation.tasks[0];
  if (task?.state !== "archived") throw new ApiError(409, task?.failure ?? { reason: "interrupted" });
}

export function useArchivalFeedback(operations: ArchivalOperation[], taskId?: string) {
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { return JSON.parse(sessionStorage.getItem("archival-feedback-dismissed") ?? "[]") as string[]; }
    catch { return []; }
  });
  const dismiss = useCallback((id: string) => {
    if (!operations.some((operation) => operation.id === id)) return;
    void dismissArchivalOperation(id).catch(() => {});
    setDismissed((current) => {
      const next = [...current, id].slice(-200);
      try { sessionStorage.setItem("archival-feedback-dismissed", JSON.stringify(next)); } catch { /* Session-only dismissal still applies. */ }
      return next;
    });
  }, [operations]);
  const items = operations.filter((operation) => !operation.feedbackDismissed && !dismissed.includes(operation.id) && (taskId === undefined ||
    (operation.target.kind === "task" && operation.target.taskId === taskId) || operation.tasks.some((task) => task.taskId === taskId)))
    .map((operation) => {
      const archived = operation.tasks.filter((task) => task.state === "archived").length;
      const failed = operation.tasks.filter((task) => task.state === "failed" || task.state === "interrupted").length;
      const active = operation.state === "queued" ? "Queued" : "Archiving";
      return {
        id: operation.id, target: `Archive · ${operation.label}`, occurredAt: operation.updatedAt,
        role: (failed > 0 ? "alert" : "status") as "alert" | "status",
        text: terminal(operation)
          ? `${operation.state === "interrupted" ? "Archival interrupted. " : ""}Archived ${archived} of ${operation.tasks.length} ${operation.target.kind === "completion" ? "completed " : ""}task(s).${failed ? ` ${failed} could not be archived.` : ""}`
          : `${active} · ${archived + failed} of ${operation.tasks.length} processed`,
        content: operation.tasks.length === 0 || (terminal(operation) && failed === 0) ? undefined : <ul className="archive-failures" aria-label="Archival task outcomes">
          {operation.tasks.filter((task) => !terminal(operation) || task.failure !== undefined).map((task) => <li key={task.taskId}>
            <a href={`/tasks/${encodeURIComponent(task.taskId)}`}>{task.taskId} — {task.title}</a>
            {` · ${task.failure ? errorMessage(new ApiError(409, task.failure)) : task.state === "running" ? "Inspecting or removing workspace" : task.state}`}
          </li>)}
        </ul>,
      };
    });
  return { items, dismiss };
}
