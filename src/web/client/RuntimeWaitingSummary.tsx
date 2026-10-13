import { useState, type ReactNode } from "react";
import type { ActivationView } from "../../application/browser-transport-contract.ts";
import { ApiError, readTask, dismissActivation, interruptTask } from "./api.ts";
import { errorMessage } from "./feedback.ts";

export function RuntimeWaitingSummary({ taskId, recovery, onChanged }: {
  taskId: string;
  recovery: Extract<NonNullable<ActivationView["recovery"]>, { state: "waiting" }>;
  onChanged(): Promise<void>;
}): ReactNode {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const reason = { "connection-lost": "Connection lost", "service-unavailable": "Runtime service unavailable", "budget-exhausted": "Codex message budget exhausted" }[recovery.classification];
  return <section className="runtime-waiting-summary" aria-label="Runtime recovery">
    <div className="runtime-waiting-heading"><strong>{reason}</strong>
      <button type="button" className="secondary" disabled={pending} onClick={() => {
        setPending(true); setError(undefined);
        void (async () => {
          // Try dismissal first, then a scoped interruption if dispatch won the race.
          // A conflicting response is followed by an authoritative refresh; it never targets another activation.
          for (let retry = 0; ; retry++) {
            const current = (await readTask(taskId)).task.activations.find((activation) => activation.id === recovery.activationId);
            if (!current || current.status === "completed" || current.status === "dismissed" || current.status === "failed") break;
            try { await dismissActivation(recovery.activationId, crypto.randomUUID()); break; }
            catch (caught) { if (!(caught instanceof ApiError) || caught.status !== 409 || retry >= 4) throw caught; }
            try { await interruptTask(taskId, crypto.randomUUID(), recovery.activationId); }
            catch (caught) {
              if (!(caught instanceof ApiError) || caught.status !== 409 || retry >= 4) throw caught;
            }
          }
          await onChanged();
        })().catch((caught) => setError(errorMessage(caught))).finally(() => setPending(false));
      }}>{pending ? "Stopping…" : "Stop retries"}</button></div>
    <p>{recovery.retrying ? "Retry in progress" : "Waiting to retry"} · {recovery.retryCount} retries · {recovery.failureCount} failures</p>
    <p>Next eligible: <time dateTime={recovery.dueAt}>{new Date(recovery.dueAt).toLocaleString()}</time></p>
    <details><summary>Failure details</summary>
      <p>First failure ({new Date(recovery.firstAt).toLocaleString()}): {recovery.firstFailure}</p>
      <p>Latest failure ({new Date(recovery.latestAt).toLocaleString()}): {recovery.latestFailure}</p>
    </details>
    {error === undefined ? null : <p role="alert">{error}</p>}
  </section>;
}
