import { useState, type ReactNode } from "react";
import type { ActivationView, ActiveRunView, AutomationView } from "../../application/browser-transport-contract.ts";
import { stopActivation } from "./api.ts";
import { errorMessage } from "./feedback.ts";

export function RuntimeWaitingSummary({ taskId, recovery, activeRun, automation, onChanged }: {
  taskId: string;
  recovery: Extract<NonNullable<ActivationView["recovery"]>, { state: "waiting" }>;
  activeRun?: ActiveRunView | undefined;
  automation?: AutomationView | undefined;
  onChanged(): Promise<void>;
}): ReactNode {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const current = activeRun?.activationId === recovery.activationId ? activeRun : undefined;
  const stopping = current?.stopRequested === true;
  const explanation = stopping ? "Stopping retries. No further retry will be dispatched for this activation."
    : current?.status === "termination-blocked" ? "Retry ended; termination verification is blocked."
    : current?.status === "cleaning-up" ? "Retry ended; verifying agent shutdown."
    : current?.interruptionRequested || current?.status === "interrupting" ? "Stopping the current attempt."
    : recovery.retrying ? "Retry in progress"
    : automation?.state === "paused" ? "Automation is paused. No retry will start until automation resumes."
    : automation?.state === "pausing" ? "Automation is pausing. No new retry will start until automation resumes."
    : automation?.state === "blocked" ? "Automation is unavailable. No retry is scheduled."
    : "Waiting for retry eligibility; dispatch also depends on automation and task availability.";
  const reason = { "connection-lost": "Connection lost", "service-unavailable": "Runtime service unavailable", "budget-exhausted": "Codex message budget exhausted" }[recovery.classification];
  return <section className="runtime-waiting-summary" aria-label="Runtime recovery">
    <div className="runtime-waiting-heading"><strong>{reason}</strong>
      <button type="button" className="secondary" disabled={pending || stopping} onClick={() => {
        setPending(true); setError(undefined);
        void stopActivation(taskId, recovery.activationId, crypto.randomUUID()).then(onChanged)
          .catch((caught) => setError(errorMessage(caught))).finally(() => setPending(false));
      }}>{pending || stopping ? "Stopping…" : "Stop retries"}</button></div>
    <p>{explanation}</p>
    <p>{recovery.retryCount} retries · {recovery.failureCount} failures</p>
    {!stopping && !recovery.retrying ? <p>Earliest retry eligibility: <time dateTime={recovery.dueAt}>{new Date(recovery.dueAt).toLocaleString()}</time> (not a scheduled start)</p> : null}
    <details><summary>Failure details</summary>
      <p>First failure ({new Date(recovery.firstAt).toLocaleString()}): {recovery.firstFailure}</p>
      <p>Latest failure ({new Date(recovery.latestAt).toLocaleString()}): {recovery.latestFailure}</p>
    </details>
    {error === undefined ? null : <p role="alert">{error}</p>}
  </section>;
}
