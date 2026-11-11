import { useState, type ReactNode } from "react";
import type { ActiveRunView } from "../../application/automation-contract.ts";
import { retryTaskTermination } from "./api.ts";
import { errorMessage } from "./feedback.ts";

export function runStatusLabel(run: ActiveRunView): string {
  if (run.status === "termination-blocked") return "Termination verification blocked";
  if (run.status === "cleaning-up") return "Verifying agent shutdown";
  if (run.stopRequested) return "Stopping retries";
  if (run.status === "interrupting" || run.interruptionRequested) return run.executionStarted === false ? "Stopping startup" : "Stopping agent";
  if (run.status === "starting" || run.executionStarted === false) return "Starting agent";
  return "Running";
}

export function RunCleanup({ run, onChanged }: { run: ActiveRunView | undefined; onChanged(): Promise<void> }): ReactNode {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  if (!run || (run.status !== "cleaning-up" && run.status !== "termination-blocked")) return null;
  return <section className="runtime-waiting-summary" aria-label="Run cleanup">
    <strong>{runStatusLabel(run)}</strong>
    <p>This attempt is shutting down. The task remains reserved until its processes are confirmed stopped.</p>
    {run.termination === undefined ? null : <>
      <p>{run.termination.diagnostic}</p>
      {run.termination.retryAvailable ? <button type="button" className="secondary" disabled={pending} onClick={() => {
        setPending(true); setError(undefined);
        void retryTaskTermination(run.taskId, run.attemptId).then(onChanged)
          .catch((caught) => setError(errorMessage(caught))).finally(() => setPending(false));
      }}>{pending ? "Requesting verification…" : "Retry termination verification"}</button>
        : <p>Automatic verification is unavailable. Keep automation paused and use the documented safe host recovery procedure; do not start another agent in this workspace.</p>}
    </>}
    {error === undefined ? null : <p role="alert">{error}</p>}
  </section>;
}
